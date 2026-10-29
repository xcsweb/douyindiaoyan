# MotionGit「现代图文·口播讲解」模板 —— 渲染依赖一键体检 / 安装（Windows PowerShell）
#
# 用法（在仓库根目录或任意位置执行均可）:
#   powershell -ExecutionPolicy Bypass -File .\横屏口播\_work\env\setup_env.ps1
#   powershell -ExecutionPolicy Bypass -File .\横屏口播\_work\env\setup_env.ps1 -Check
#   ... -Proxy "http://127.0.0.1:18080" -RuntimeDir "D:\work\runtime"
#
# 说明:
#   * 运行时目录默认 <仓库>\横屏口播\_work\runtime，缺失时从 <仓库>\_runtime_copy\runtime 复制；
#   * 代理默认读取 HTTPS_PROXY 环境变量，没有就直连；
#   * 全部步骤幂等，重复执行只补缺。

param(
  [switch]$Check,
  [string]$RuntimeDir = "",
  [string]$Proxy = "",
  [string]$FfmpegHome = ""
)

$ErrorActionPreference = "Continue"
$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$project = Resolve-Path (Join-Path $here "..\..")
$repo    = Resolve-Path (Join-Path $project "..")

if (-not $RuntimeDir) { $RuntimeDir = Join-Path $project "_work\runtime" }
$RuntimeSrc = Join-Path $repo "_runtime_copy\runtime"
$Browsers   = Join-Path $project "_work\cache\ms-playwright"
if (-not $Proxy) { $Proxy = $env:HTTPS_PROXY; if (-not $Proxy) { $Proxy = $env:https_proxy } }

$script:Failed = 0
function Ok($m)   { Write-Host "[OK]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "[FAIL] $m" -ForegroundColor Red; $script:Failed++ }
function Step($m) { Write-Host ""; Write-Host ">> $m" -ForegroundColor Cyan }

Write-Host "MotionGit 模板依赖 $(if ($Check) {'体检'} else {'安装'})" -ForegroundColor White
Write-Host "  项目:   $project"
Write-Host "  运行时: $RuntimeDir"
Write-Host "  代理:   $(if ($Proxy) {$Proxy} else {'无'})"

# ---------- 1. Node ----------
$nodeV = (& node -v 2>$null)
if ($nodeV -match 'v(\d+)\.') {
  if ([int]$Matches[1] -ge 22) { Ok "node $nodeV（要求 >=22）" }
  else { Bad "node $nodeV 版本过低，模板要求 >=22" }
} else { Bad "未安装 Node.js（需要 >=22）" }

# ---------- 2. 代理 ----------
function Set-Proxy {
  if (-not $Proxy) { Warn "未设置 HTTPS_PROXY，按直连处理"; return }
  & npm config set proxy $Proxy      2>$null | Out-Null
  & npm config set https-proxy $Proxy 2>$null | Out-Null
  # pip 不吃环境变量里的 proxy 时，必须写进 pip.ini，否则会卡在直连 IP
  if (Get-Command python -ErrorAction SilentlyContinue) {
    & python -m pip config set global.proxy $Proxy 2>$null | Out-Null
    $idx = if ($env:PIP_INDEX_URL) { $env:PIP_INDEX_URL } else { "https://pypi.tuna.tsinghua.edu.cn/simple" }
    & python -m pip config set global.index-url $idx 2>$null | Out-Null
  }
  Ok "代理已写入 npm 与 pip 配置：$Proxy"
}

# ---------- 3. ffmpeg 9 ----------
function Test-Ffmpeg($exe) {
  if (-not $exe -or -not (Test-Path $exe)) { return $false }
  $first = (& $exe -version 2>$null | Select-Object -First 1)
  if ($first -notmatch 'version\s+n?(\d+)') { return $false }
  if ([int]$Matches[1] -lt 9) { return $false }
  $f = (& $exe -hide_banner -h filter=scale 2>$null) -join "`n"
  return ($f -match 'in_transfer') -and ($f -match 'out_primaries') -and ($f -match 'tonemap')
}

function Find-Ffmpeg {
  $cands = @($env:FFMPEG)
  if ($FfmpegHome) { $cands += (Join-Path $FfmpegHome "bin\ffmpeg.exe") }
  $cmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if ($cmd) { $cands += $cmd.Source }
  # 常见的 WinGet 安装位置
  $cands += (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter "ffmpeg.exe" -Recurse -ErrorAction SilentlyContinue |
             Where-Object { $_.FullName -match 'Gyan\.FFmpeg' } | Select-Object -ExpandProperty FullName)
  foreach ($c in $cands) { if ($c -and (Test-Ffmpeg $c)) { return $c } }
  return $null
}

# ---------- 4. 运行时 ----------
function Ensure-Runtime {
  if (-not (Test-Path $RuntimeDir)) {
    if (-not (Test-Path $RuntimeSrc)) { Bad "运行时目录不存在，也没有模板副本：$RuntimeSrc"; return $false }
    Step "从 $RuntimeSrc 复制运行时到 $RuntimeDir"
    New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
    robocopy $RuntimeSrc $RuntimeDir /E /XD node_modules .venv /NFL /NDL /NJH /NJS | Out-Null
  }
  # 旧的环境里 node_modules / .venv 可能是指向临时目录的失效软链
  foreach ($p in @((Join-Path $RuntimeDir "node_modules"), (Join-Path $RuntimeDir ".venv"))) {
    $item = Get-Item $p -Force -ErrorAction SilentlyContinue
    if ($item -and $item.LinkType) { Remove-Item $p -Force -Recurse -ErrorAction SilentlyContinue }
  }
  return $true
}

function Install-NodeDeps {
  Step "安装 node 依赖（playwright-core / acorn）"
  Push-Location $RuntimeDir
  & npm ci --no-audit --no-fund 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { & npm install --no-audit --no-fund 2>$null | Out-Null }
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -eq 0 -and (Test-Path (Join-Path $RuntimeDir "node_modules\playwright-core"))) { Ok "node 依赖就绪" }
  else { Bad "npm 安装失败：检查 npm config get proxy 与 registry" }
}

function Install-PythonDeps {
  $venv = Join-Path $RuntimeDir ".venv"
  $py   = Join-Path $venv "Scripts\python.exe"
  if (-not (Test-Path $py)) {
    Step "创建 python venv"
    & python -m venv $venv 2>$null
    if (-not (Test-Path $py)) { Bad "创建 venv 失败（确认已安装 Python 3.11+ 且含 venv 模块）"; return }
  }
  Step "安装 python 依赖（numpy / pillow / scipy / opencv / fonttools）"
  & $py -m pip install -q -U pip 2>$null | Out-Null
  & $py -m pip install -q -r (Join-Path $RuntimeDir "requirements-runtime.txt") 2>$null
  if ($LASTEXITCODE -eq 0) { Ok "python 依赖就绪" } else { Bad "pip 安装失败：检查 pip.ini 的 proxy / index-url" }
}

function Install-Chromium {
  $cli = Join-Path $RuntimeDir "node_modules\playwright-core\cli.js"
  if (-not (Test-Path $cli)) { Bad "playwright-core 未安装"; return }
  Step "安装 Chromium（缓存到 $Browsers）"
  New-Item -ItemType Directory -Force -Path $Browsers | Out-Null
  $env:PLAYWRIGHT_BROWSERS_PATH = $Browsers
  # 官方安装器不读代理，卡住时用 180 秒上限兜底，再改手动下载
  $p = Start-Process node -ArgumentList @($cli, "install", "chromium") -PassThru -NoNewWindow
  $done = $p.WaitForExit(180000)
  if (-not $done) { try { $p.Kill() } catch {} }
  if ($done -and $p.ExitCode -eq 0) { Ok "Chromium 就绪"; return }
  if ($Proxy) { Warn "官方安装器超时（不走代理），改为手动下载"; Install-ChromiumManual }
  else { Bad "Chromium 下载失败（检查网络）" }
}

function Install-ChromiumManual {
  $bjson = Join-Path $RuntimeDir "node_modules\playwright-core\browsers.json"
  if (-not (Test-Path $bjson)) { Bad "找不到 browsers.json"; return }
  $b  = Get-Content $bjson -Raw | ConvertFrom-Json
  $c  = $b.browsers | Where-Object { $_.name -eq "chromium" } | Select-Object -First 1
  $hs = $b.browsers | Where-Object { $_.name -eq "chromium-headless-shell" } | Select-Object -First 1
  $base = "https://cdn.playwright.dev/builds/cft/$($c.browserVersion)/win64"
  $zip  = Join-Path $env:TEMP "chrome-win.zip"
  try {
    Invoke-WebRequest -Uri "$base/chrome-win.zip" -OutFile $zip -Proxy $Proxy -UseBasicParsing
    $dest = Join-Path $Browsers "chromium-$($c.revision)"
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Expand-Archive -Path $zip -DestinationPath $dest -Force
    New-Item -ItemType File -Force -Path (Join-Path $dest "INSTALLATION_COMPLETE") | Out-Null
    New-Item -ItemType File -Force -Path (Join-Path $dest "DEPENDENCIES_VALIDATED") | Out-Null
    Ok "Chromium 已手动安装（$($c.browserVersion) / $($c.revision)）"
  } catch { Bad "手动下载 Chromium 失败：$($_.Exception.Message)" }
}

function Invoke-Verify {
  Step "验收"
  $py = Join-Path $RuntimeDir ".venv\Scripts\python.exe"
  if (Test-Path $py) {
    & $py -c "import numpy, PIL, scipy, cv2, fontTools" 2>$null
    if ($LASTEXITCODE -eq 0) { Ok "python 包可导入" } else { Bad "python 包导入失败" }
  }
  $cli = Join-Path $RuntimeDir "node_modules\playwright-core\cli.js"
  if (Test-Path $cli) {
    $env:PLAYWRIGHT_BROWSERS_PATH = $Browsers
    $js = "const {chromium}=require('" + ($RuntimeDir -replace '\\','/') + "/node_modules/playwright-core');chromium.launch({headless:true}).then(b=>b.close()).then(()=>console.log('ok')).catch(e=>{console.error(e.message);process.exit(1)})"
    & node -e $js 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Ok "Playwright 可启动 Chromium" } else { Bad "Playwright 启动失败" }
  }
  $ff = Find-Ffmpeg
  if ($ff) { Ok "ffmpeg 可用：$ff（$((& $ff -version | Select-Object -First 1))）" }
  else { Bad "没有满足条件的 ffmpeg：需要 >=9 且 scale 支持 in_transfer/out_primaries（WinGet 装 Gyan.FFmpeg 9.x：winget install Gyan.FFmpeg）" }
}

# ---------- 执行 ----------
if (-not $Check) { Set-Proxy }

if ($Check) {
  if (Test-Path (Join-Path $RuntimeDir "node_modules")) { Ok "node 依赖目录存在" } else { Warn "node 依赖未安装" }
  if (Test-Path (Join-Path $RuntimeDir ".venv\Scripts\python.exe")) { Ok "python venv 存在" } else { Warn "python venv 未创建" }
  $ff = Find-Ffmpeg
  if ($ff) { Ok "ffmpeg 可用：$ff" } else { Bad "ffmpeg 不满足 >=9 + 色彩管理" }
} elseif (Ensure-Runtime) {
  # ffmpeg 不自动下载：Windows 上直接用 WinGet 装官方 9.x 更稳，版本号也是真 9.x
  if (-not (Find-Ffmpeg)) {
    Warn "ffmpeg 未满足要求，尝试用 winget 安装 Gyan.FFmpeg"
    & winget install --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements --silent 2>$null | Out-Null
  }
  Install-NodeDeps
  Install-PythonDeps
  Install-Chromium
  Invoke-Verify
}

if ($script:Failed -eq 0) {
  Write-Host ""
  Write-Host "全部就绪。下一步：把模板包放到 横屏口播\模板\ 下，再跑 pipeline。" -ForegroundColor Green
  exit 0
}
Write-Host ""
Write-Host "还有 $script:Failed 项未通过，按上面的 [FAIL] 逐条处理后重跑本脚本。" -ForegroundColor Red
exit 1
