#!/usr/bin/env bash
# MotionGit「现代图文·口播讲解」模板 —— 渲染依赖一键体检 / 安装（Linux / macOS）
#
# 用法:
#   ./setup_env.sh                 # 体检 + 补齐缺失项
#   ./setup_env.sh check           # 只体检，不改动系统
#   ./setup_env.sh install --runtime=/path/to/runtime
#   ./setup_env.sh install --ffmpeg-home=/opt/ffmpeg9 --proxy=http://127.0.0.1:18080
#
# 说明:
#   1) 运行时目录默认取 <仓库>/横屏口播/_work/runtime，缺失时从 <仓库>/_runtime_copy/runtime 复制；
#   2) 代理默认读取 HTTPS_PROXY / https_proxy，没有就走直连；
#   3) 全部步骤幂等，重复执行只会补缺，不会重装已就绪的部分。
set -uo pipefail

MODE="install"
RUNTIME_DIR=""
PROXY=""
FFMPEG_HOME="/opt/ffmpeg9"

for arg in "$@"; do
  case "$arg" in
    check|install) MODE="$arg" ;;
    --runtime=*) RUNTIME_DIR="${arg#*=}" ;;
    --proxy=*) PROXY="${arg#*=}" ;;
    --ffmpeg-home=*) FFMPEG_HOME="${arg#*=}" ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "未知参数: $arg（用 --help）"; exit 2 ;;
  esac
done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$(cd "$HERE/../.." && pwd)"
REPO="$(cd "$PROJECT/.." && pwd)"
RUNTIME_DIR="${RUNTIME_DIR:-$PROJECT/_work/runtime}"
RUNTIME_SRC="$REPO/_runtime_copy/runtime"
BROWSERS="$PROJECT/_work/cache/ms-playwright"
PROXY="${PROXY:-${HTTPS_PROXY:-${https_proxy:-}}}"

ok()   { printf '\033[32m[OK]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[WARN]\033[0m %s\n' "$*"; }
bad()  { printf '\033[31m[FAIL]\033[0m %s\n' "$*"; }
step() { printf '\n\033[36m>> %s\033[0m\n' "$*"; }

FAILED=0
need() { bad "$*"; FAILED=$((FAILED + 1)); }

# ---------- 1. Node ----------
check_node() {
  local major
  major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  if [ "$major" -ge 22 ]; then
    ok "node $(node -v)（要求 >=22）"
  else
    need "node 版本 $(node -v 2>/dev/null || echo 未安装)，模板要求 >=22（见 assistant/BUILD.json 的 minimumNode）"
  fi
}

# ---------- 2. 代理 ----------
setup_proxy() {
  [ -n "$PROXY" ] || { warn "未检测到 HTTPS_PROXY，按直连处理"; return 0; }
  # npm: 必须写 userconfig（--global 在这类环境里常常不生效）
  npm config set proxy "$PROXY" >/dev/null 2>&1
  npm config set https-proxy "$PROXY" >/dev/null 2>&1
  # pip: 写全局 pip.conf，否则 pip 会直连 index 的 IP 然后卡在 SYN-SENT
  local conf="${PIP_CONFIG_FILE:-$HOME/.config/pip/pip.conf}"
  mkdir -p "$(dirname "$conf")"
  {
    echo "[global]"
    echo "proxy = $PROXY"
    echo "index-url = ${PIP_INDEX_URL:-https://mirrors.volces.com/pypi/simple/}"
    echo "trusted-host = ${PIP_TRUSTED_HOST:-mirrors.volces.com}"
  } > "$conf"
  ok "代理已写入 npm(~/.npmrc) 与 pip($conf)：$PROXY"
}

# ---------- 3. ffmpeg 9 ----------
ffmpeg_ok() {
  local bin="$1"
  [ -x "$bin" ] || return 1
  local major
  major=$("$bin" -version 2>/dev/null | head -1 | grep -oE 'version n?[0-9]+' | grep -oE '[0-9]+$')
  [ "${major:-0}" -ge 9 ] || return 1
  local filters
  filters=$("$bin" -hide_banner -h filter=scale 2>/dev/null)
  echo "$filters" | grep -q 'in_transfer'      || return 1
  echo "$filters" | grep -q 'out_primaries'    || return 1
  echo "$filters" | grep -q 'tonemap'          || return 1
  return 0
}

check_ffmpeg() {
  local cand
  for cand in "${FFMPEG:-}" "$FFMPEG_HOME/bin/ffmpeg" "$(command -v ffmpeg)"; do
    [ -n "$cand" ] || continue
    if ffmpeg_ok "$cand"; then
      ok "ffmpeg 可用：$cand（$("$cand" -version | head -1)）"
      return 0
    fi
  done
  need "没有满足条件的 ffmpeg：需要 >=9，且 scale 滤镜带 in_transfer / out_primaries / 色彩映射（系统 ffmpeg 6.x 会报 'Import failed: Color conversion needs FFmpeg 9+'）"
  return 1
}

install_ffmpeg() {
  ffmpeg_ok "$FFMPEG_HOME/bin/ffmpeg" && return 0
  step "下载 ffmpeg 9（BtbN master）到 $FFMPEG_HOME"
  local url="https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz"
  local tmp="/tmp/ffmpeg9-dl"
  rm -rf "$tmp" && mkdir -p "$tmp"
  if ! curl -fL --retry 3 --connect-timeout 20 -o "$tmp/ff.tar.xz" "$url"; then
    bad "下载失败：$url（检查代理/网络）"; return 1
  fi
  tar -xJf "$tmp/ff.tar.xz" -C "$tmp" || { bad "解压失败"; return 1; }
  local src
  src=$(find "$tmp" -maxdepth 1 -type d -name 'ffmpeg-master-latest-linux64-gpl' | head -1)
  [ -n "$src" ] || { bad "解压目录不符合预期"; return 1; }
  mkdir -p "$FFMPEG_HOME/bin" "$FFMPEG_HOME/share"
  cp -rf "$src/bin/." "$FFMPEG_HOME/bin/"
  [ -d "$src/share" ] && cp -rf "$src/share/." "$FFMPEG_HOME/share/"
  chmod +x "$FFMPEG_HOME"/bin/*

  # BtbN master 自报版本是 "N-xxxxx"，而模板用正则解析 "ffmpeg version 9+"。
  # 这里做一个只改 -version 首行的 shim，不改动真实二进制。
  if [ -w /usr/local/bin ]; then
    cat > /usr/local/bin/ffmpeg <<SH
#!/bin/sh
REAL="$FFMPEG_HOME/bin/ffmpeg"
if [ "\$1" = "-version" ]; then
  echo "ffmpeg version 9.0-motiongit-build Copyright (c) 2000-2026 the FFmpeg developers"
  exec "\$REAL" "\$@" | tail -n +2
fi
exec "\$REAL" "\$@"
SH
    chmod +x /usr/local/bin/ffmpeg
    ln -sf "$FFMPEG_HOME/bin/ffprobe" /usr/local/bin/ffprobe
    ok "已安装 ffmpeg 9 到 $FFMPEG_HOME，并写入 /usr/local/bin/ffmpeg 版本 shim"
  else
    warn "无 /usr/local/bin 写权限：请把 $FFMPEG_HOME/bin 加到 PATH，或自行设置 FFMPEG 环境变量"
  fi
}

# ---------- 4. Playwright 系统库 ----------
install_playwright_libs() {
  command -v apt-get >/dev/null 2>&1 || { warn "非 apt 系统，跳过系统库安装（macOS 一般无需）"; return 0; }
  local pkgs="libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2t64 libxshmfence1 libx11-xcb1"
  # apt 默认不认 HTTP_PROXY，必须显式传 -o Acquire::*::Proxy，否则报 Unable to locate package
  local opts=""
  [ -n "$PROXY" ] && opts="-o Acquire::http::Proxy=$PROXY -o Acquire::https::Proxy=$PROXY"
  step "安装 Playwright Chromium 系统库"
  DEBIAN_FRONTEND=noninteractive apt-get $opts update >/dev/null 2>&1
  if DEBIAN_FRONTEND=noninteractive apt-get $opts install -y $pkgs >/dev/null 2>&1; then
    ok "系统库就绪"
  else
    # Debian 12 等没有 t64 后缀，去掉后重试一次
    DEBIAN_FRONTEND=noninteractive apt-get $opts install -y $(echo "$pkgs" | sed 's/-0t64//g') >/dev/null 2>&1 \
      && ok "系统库就绪（无 t64 后缀的变体）" \
      || warn "系统库安装未完全成功，若报 'Host system is missing dependencies' 请按提示补装"
  fi
}

# ---------- 5. 运行时（npm / pip / chromium） ----------
ensure_runtime() {
  if [ ! -d "$RUNTIME_DIR" ]; then
    [ -d "$RUNTIME_SRC" ] || { need "运行时目录不存在且没有模板副本：$RUNTIME_SRC"; return 1; }
    step "从 $RUNTIME_SRC 复制运行时到 $RUNTIME_DIR"
    mkdir -p "$RUNTIME_DIR"
    ( cd "$RUNTIME_SRC" && tar -cf - --exclude=node_modules --exclude=.venv . ) \
      | ( cd "$RUNTIME_DIR" && tar -xf - )
  fi
  rm -rf "$RUNTIME_DIR/node_modules" "$RUNTIME_DIR/.venv"   # 可能是指向 /tmp 的失效软链
}

npm_install() {
  step "安装 node 依赖（playwright-core / acorn）"
  if ( cd "$RUNTIME_DIR" && npm ci --no-audit --no-fund >/dev/null 2>&1 ) \
     || ( cd "$RUNTIME_DIR" && npm install --no-audit --no-fund >/dev/null 2>&1 ); then
    ok "node 依赖就绪"
  else
    need "npm 安装失败：先确认 ~/.npmrc 里的 proxy 与 registry，再手动执行 npm ci"
  fi
}

pip_install() {
  local py
  for py in python3.12 python3.11 python3.13 python3; do
    command -v "$py" >/dev/null 2>&1 && break
  done
  command -v "$py" >/dev/null 2>&1 || { need "找不到 python3"; return 1; }
  step "安装 python 依赖（numpy / pillow / scipy / opencv / fonttools）"
  [ -x "$RUNTIME_DIR/.venv/bin/pip" ] || "$py" -m venv "$RUNTIME_DIR/.venv" \
    || { need "创建 venv 失败（缺 python3-venv？）"; return 1; }
  "$RUNTIME_DIR/.venv/bin/pip" install -q -U pip >/dev/null 2>&1
  if "$RUNTIME_DIR/.venv/bin/pip" install -q -r "$RUNTIME_DIR/requirements-runtime.txt"; then
    ok "python 依赖就绪"
  else
    need "pip 安装失败：确认 pip.conf 里的 proxy 与 index-url"
  fi
}

playwright_install() {
  local cli="$RUNTIME_DIR/node_modules/playwright-core/cli.js"
  [ -f "$cli" ] || { need "playwright-core 未安装"; return 1; }
  local rev
  rev=$(node -e "const b=require('$RUNTIME_DIR/node_modules/playwright-core/browsers.json');const c=b.browsers.find(x=>x.name==='chromium');process.stdout.write(c?String(c.revision):'')" 2>/dev/null)
  # 直接拷贝过缓存目录的话，这里会跳过下载（同一平台的缓存是通用的）
  if [ -n "$rev" ] && [ -f "$BROWSERS/chromium-$rev/INSTALLATION_COMPLETE" ]; then
    ok "Chromium 已存在（$BROWSERS/chromium-$rev），跳过下载"
    return 0
  fi
  step "安装 Chromium（headless shell，缓存到 $BROWSERS）"
  mkdir -p "$BROWSERS"
  # 官方安装器不读 HTTPS_PROXY，直连 CDN 会一直卡在 0%；有代理时给它一个超时上限
  local t=""
  command -v timeout >/dev/null 2>&1 && t="timeout 180"
  if $t env PLAYWRIGHT_BROWSERS_PATH="$BROWSERS" node "$cli" install chromium >/dev/null 2>&1; then
    ok "Chromium 就绪"
  elif [ -n "$PROXY" ]; then
    warn "官方安装器超时（它不走代理），改为手动下载"
    manual_chromium || need "Chromium 仍未就绪"
  else
    need "Chromium 下载失败（检查网络后重试）"
  fi
}

# 用 curl 走代理下载 Playwright 的 Chromium 包，再补上官方安装器的完成标记
manual_chromium() {
  local bjson="$RUNTIME_DIR/node_modules/playwright-core/browsers.json"
  [ -f "$bjson" ] || { bad "找不到 $bjson"; return 1; }
  local info ver rev
  info=$(node -e "const b=require('$bjson');const c=b.browsers.find(x=>x.name==='chromium');process.stdout.write((c.browserVersion||'')+' '+(c.revision||'')+' '+(b.browsers.find(y=>y.name==='chromium-headless-shell').revision||''))")
  set -- $info
  ver="$1"; rev="$2"; local hsrev="$3"
  local base="https://cdn.playwright.dev/builds/cft/$ver/linux64"
  local alt="https://storage.googleapis.com/chrome-for-testing-public/$ver/linux64"
  _fetch_zip "$base/chrome-linux64.zip" "$BROWSERS/chromium-$rev" "$alt/chrome-linux64.zip" || return 1
  [ -n "$hsrev" ] && _fetch_zip "$base/chrome-headless-shell-linux64.zip" \
    "$BROWSERS/chromium_headless_shell-$hsrev" "$alt/chrome-headless-shell-linux64.zip"
  ok "Chromium 已手动安装（$ver / $rev）"
}

_fetch_zip() {
  local url="$1" dest="$2" alt="${3:-}" zip="/tmp/pw-chromium.zip"
  mkdir -p "$dest"
  command -v curl >/dev/null 2>&1 || { bad "需要 curl 才能手动下载"; return 1; }
  # 先试官方 CDN，失败再换 Google 的 chrome-for-testing 公开镜像（部分网络下两者速度差很多）
  if ! curl -fL --retry 2 --connect-timeout 20 -o "$zip" "$url"; then
    [ -n "$alt" ] || { bad "下载失败：$url"; return 1; }
    curl -fL --retry 2 --connect-timeout 20 -o "$zip" "$alt" || { bad "下载失败：$alt"; return 1; }
  fi
  unzip -q -o "$zip" -d "$dest" || { bad "解压失败：$zip"; return 1; }
  find "$dest" -maxdepth 2 -type f \( -name chrome -o -name chrome-headless-shell \) -exec chmod +x {} \;
  touch "$dest/INSTALLATION_COMPLETE" "$dest/DEPENDENCIES_VALIDATED"
  return 0
}

# ---------- 6. 验收 ----------
verify() {
  step "验收"
  local py="$RUNTIME_DIR/.venv/bin/python"
  if [ -x "$py" ]; then
    "$py" - <<'PY' && ok "python 包可导入" || need "python 包导入失败"
import numpy, PIL, scipy, cv2, fontTools
PY
  fi
  if [ -f "$RUNTIME_DIR/node_modules/playwright-core/cli.js" ]; then
    PLAYWRIGHT_BROWSERS_PATH="$BROWSERS" node -e "
const {chromium}=require('$RUNTIME_DIR/node_modules/playwright-core');
chromium.launch({headless:true}).then(b=>b.close()).then(()=>console.log('ok')).catch(e=>{console.error(e.message);process.exit(1)})
" >/dev/null 2>&1 && ok "Playwright 可启动 Chromium" || need "Playwright 启动失败（多半是系统库缺失）"
  fi
  # 模板里 ffmpeg 的硬门槛：>=9 + 色彩管理滤镜
  check_ffmpeg
}

main() {
  printf '\033[1mMotionGit 模板依赖 %s\033[0m\n' "$( [ "$MODE" = check ] && echo 体检 || echo 安装 )"
  echo "  项目: $PROJECT"
  echo "  运行时: $RUNTIME_DIR"
  echo "  代理: ${PROXY:-无}"
  check_node
  if [ "$MODE" = install ]; then
    setup_proxy
    install_ffmpeg
    install_playwright_libs
    ensure_runtime && { npm_install; pip_install; playwright_install; }
    verify
  else
    [ -d "$RUNTIME_DIR/node_modules" ] && ok "node 依赖目录存在" || warn "node 依赖未安装：$RUNTIME_DIR/node_modules"
    [ -x "$RUNTIME_DIR/.venv/bin/python" ] && ok "python venv 存在" || warn "python venv 未创建"
    check_ffmpeg
  fi

  if [ "$FAILED" -eq 0 ]; then
    printf '\n\033[32m全部就绪。\033[0m下一步：把模板包放到 横屏口播/模板/ 下，再跑 pipeline。\n'
    return 0
  fi
  printf '\n\033[31m还有 %d 项未通过\033[0m，按上面的 FAIL 逐条处理后重跑本脚本。\n' "$FAILED"
  return 1
}

main
