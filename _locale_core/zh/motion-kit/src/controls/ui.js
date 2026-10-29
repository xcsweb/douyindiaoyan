/* motion-kit · 界面与社交模拟控件（0.3.0）：chat / comment / notify / search / browser / social / cursor
   中性的通用界面样式（不模仿任何真实 App 的品牌、logo、配色）：聊天对话、评论弹幕、通知横幅、搜索框、浏览器窗口、社交数据卡、鼠标点击演示。
   chat    bubbles 手机聊天（输入框打字→发送飞起 / 对方正在输入→气泡弹出，自动上滚）/ thread 带头像的群聊 / ai 助手问答（逐字流式回答）
   comment cards 评论卡浮现 + 点赞数增长 / danmaku 弹幕从右飞过 / pinned 置顶评论放大高亮
   notify  stack 顶部横幅依次滑下堆叠 + 角标跳动 / toast 中心弹窗轮换 / lock 锁屏通知
   search  bar 搜索框打字 + 联想展开 / spotlight 居中命令面板 + 键盘选中 / results 结果页加载 + 命中词涂亮
   browser browser 桌面浏览器 / phone 手机浏览器 / laptop 笔记本开盖（地址栏输入、加载进度条、页面滚动、高亮框标注）
   social  post 帖子卡点赞爆开 / profile 个人主页关注 + 粉丝滚动 / stats 三个指标并排滚动计数
   cursor  click 鼠标依次点击按钮 / drag 拖动卡片到区域 / menu 打开菜单选择
   约定见 AUTHORING.md：只由 t 求值，音效在 build 里登记，颜色只取主题。头像/图片没有素材时显示首字母圆或渐变块。 */
(function () {
  'use strict';
  const { clamp, lerp, pr, EZ, el, box, set, tf, fit, html, rich, esc, S, flash, shake, punch, idle, stagger, svg, draw, rnd } = MK;
  const T = () => MK.T;
  const leave = (t, slot) => pr(t, slot.t1 - .35, slot.t1);
  /* cue 缺省：n 个节拍在本段可用时间里均匀错开，单步最长 gap 秒 */
  const beats = (slot, n, start = .25, gap = .9, reserve = 1.4) => stagger(n, slot.t0 + start, Math.min(gap, Math.max(.25, (slot.t1 - slot.t0 - start - reserve) / Math.max(1, n - 1))), slot.cues);
  const plain = s => String(s ?? '').replace(/\*/g, '');

  /* ---------- 局部工具 ---------- */
  /* 会换行的文字：限定最大宽度（必要时最大高度），由大到小取字号；绝对定位元素按内容收缩宽度。装不下抛错 */
  const fitWrap = (e, max, min, maxW, maxH) => {
    e.style.maxWidth = maxW + 'px'; e.style.width = '';
    for (let s = Math.floor(max); s >= min; s--) {
      e.style.fontSize = s + 'px';
      if (e.scrollWidth <= maxW + 1 && (maxH == null || e.offsetHeight <= maxH + 1)) return s;
    }
    throw Error(`文字放不下（最小 ${min}px 仍超出 ${Math.round(maxW)}×${maxH ? Math.round(maxH) : '∞'}）：${e.textContent.slice(0, 40)}`);
  };
  /* 整体字号：由大到小试 u，f(u) 返回 true 表示排得下（f 负责按 u 排版并检查文字不溢出）；都排不下抛错 */
  const shrink = (max, min, f, what = '') => {
    for (let u = Math.floor(max); u >= min; u--) if (f(u)) return u;
    throw Error(`内容放不下（最小字号 ${min}px 仍超出）：${what}`);
  };
  /* 文字是否溢出：横向不超宽，且行数不超过 lines（按行高估算） */
  const ok = (e, lines = 1) => { const cs = getComputedStyle(e), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4; return e.scrollWidth <= e.clientWidth + 1 && e.clientHeight / lh < lines + .5; };
  /* 名字 → 稳定的渐变序号（头像占位、缩略图占位用） */
  const hue = s => [...String(s ?? '')].reduce((a, c) => a + c.codePointAt(0), 0) % 5;
  const initial = s => { const c = [...plain(s).trim()][0] || '·'; return /[a-z]/.test(c) ? c.toUpperCase() : c; };
  /* 头像：有素材用素材，没有就是首字母圆 */
  const avatar = (parent, ctx, obj, key, name, size, cls = '') => {
    const a = el('div', `mk-ui-av mk-ui-g${hue(name)} ${cls}`, parent);
    /* size 为数字时按像素；为字符串（如 '2.2em'）时随父元素字号缩放，首字母取父元素字号 */
    if (typeof size === 'string') Object.assign(a.style, { width: size, height: size, fontSize: '1em' });
    else Object.assign(a.style, { width: size + 'px', height: size + 'px', fontSize: (size * .44) + 'px' });
    if (obj && obj[key]) { a._im = el('img', '', a); ctx.mediaOf(a._im, obj, key); } else a.textContent = initial(name);
    a._o = obj; a._k = key;
    return a;
  };
  const avFrame = (ctx, a, t) => { if (a && a._im) ctx.frameAt(a._im, a._o, t, a._k); };
  /* 手机外框：返回 { f 外框, s 屏幕 }；屏幕内含状态栏与灵动岛（中性造型） */
  const device = (parent, x, y, w, h) => {
    const f = box(el('div', 'mk-ui-dev mk-abs', parent), x, y, w, h), bw = Math.max(7, w * .028);
    f.style.borderRadius = (w * .13) + 'px';
    const s = el('div', 'scr', f);
    Object.assign(s.style, { left: bw + 'px', top: bw + 'px', right: bw + 'px', bottom: bw + 'px', borderRadius: (w * .13 - bw) + 'px', fontSize: (w * .04) + 'px' });
    el('div', 'sb', s, '<span>12:30</span><span class="sg"><i></i><i></i><i></i><i></i><b></b></span>');
    const isl = el('i', 'isl', s); Object.assign(isl.style, { width: (w * .27) + 'px', height: (w * .075) + 'px', top: (w * .022) + 'px' });
    return { f, s, sw: w - bw * 2, sh: h - bw * 2, top: w * .12 };
  };
  /* 社交数字：一万以上写成「1.2万」 */
  const compact = v => { v = Math.max(0, Math.round(v)); if (v >= 1e8) return (v / 1e8).toFixed(v >= 1e9 ? 0 : 1).replace(/\.0$/, '') + '亿'; if (v >= 1e4) return (v / 1e4).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, '') + '万'; return MK.fmt(v); };
  /* 机械计数器：每一位是一条 0–9 的竖条，按连续值滚动（低位进位时高位才转），停在整数上。
     maxV 为最终值：一万以上自动按「万 / 亿」显示一位小数（单位由最终值决定），否则带千分位 */
  const odometer = (parent, maxV, cls = '') => {
    const e = el('div', 'mk-ui-odo ' + cls, parent), V = Math.max(0, Math.round(maxV));
    const unit = V >= 1e8 ? 1e8 : V >= 1e4 ? 1e4 : 1, dec = unit > 1 && V / unit < 100 ? 1 : 0, sfx = unit === 1e8 ? '亿' : unit === 1e4 ? '万' : '';
    const W = Math.round(V / unit * Math.pow(10, dec)), digits = Math.max(dec + 1, String(W).length), cols = [];
    for (let p = digits - 1; p >= 0; p--) {
      const c = el('span', 'd', e, '<span class="rl">' + '01234567890'.split('').map(d => `<b>${d}</b>`).join('') + '</span>');
      const sep = p > 0 && (dec ? p === dec : p % 3 === 0) ? el('span', dec ? 'dp' : 'cm', e, dec ? '.' : ',') : null;
      cols.push({ p, c, st: c.firstChild, sep });
    }
    if (sfx) el('span', 'u', e, sfx);
    e._set = v => {
      const w = V ? Math.max(0, v / V * W) : 0;   /* 按比例映射，最终值正好落在整数格上 */
      const lead = Math.max(dec + 1, String(Math.floor(w + 1e-6)).length);
      for (const { p, c, st, sep } of cols) {
        const P = Math.pow(10, p), base = Math.floor(w / P + 1e-9) % 10, lower = p === 0 ? 0 : clamp((w % P) - (P - 1));
        const pos = p === 0 ? w % 10 : base + lower;
        st.style.transform = `translateY(${(-pos * 100 / 11).toFixed(3)}%)`;
        c.style.display = p < lead ? '' : 'none';
        if (sep) sep.style.display = p < lead ? '' : 'none';
      }
    };
    e._set(0);
    return e;
  };
  /* 元素在整幅画面里的位置（扣掉镜头漂移/推近/转场位移），给 bg / fg 画布定位用 */
  const stageRect = (ctx, e) => {
    const rr = ctx.root.getBoundingClientRect(), k = rr.width / ctx.W || 1, r = e.getBoundingClientRect();
    return { x: (r.left - rr.left) / k, y: (r.top - rr.top) / k, w: r.width / k, h: r.height / k, cx: (r.left - rr.left + r.width / 2) / k, cy: (r.top - rr.top + r.height / 2) / k };
  };
  /* 元素相对 wrap 的位置（只在 measure 里用：此时还没有任何变换） */
  const rel = (e, wrap) => { const a = wrap.getBoundingClientRect(), r = e.getBoundingClientRect(); return { x: r.left - a.left, y: r.top - a.top, w: r.width, h: r.height }; };
  /* 命中词高亮：把 query 里的词（按空格切；无空格时整串）在文字里包成 <mark> */
  const markHits = (s, q) => {
    const words = plain(q).trim().split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length);
    let out = esc(plain(s));
    if (!words.length) return out;
    const re = new RegExp('(' + words.map(w => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    return out.replace(re, '<mark>$1</mark>');
  };
  /* 鼠标指针（中性箭头），返回元素；tip 在 (0,0) */
  const pointer = (parent, size) => {
    const e = el('div', 'mk-ui-ptr mk-abs', parent, `<svg width="${size}" height="${size * 1.25}" viewBox="0 0 24 30"><path d="M2 1.5v23l6.2-6 4 9.2 4-1.8-4-9h8.6z" fill="#fff" stroke="#0a0b10" stroke-width="1.6" stroke-linejoin="round"/></svg>`);
    return e;
  };
  /* 二次贝塞尔：鼠标沿弧线移动 */
  const bez = (a, b, k, bend = .18) => {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
    const cx = mx - dy * bend, cy = my + dx * bend, u = 1 - k;
    return [u * u * a[0] + 2 * u * k * cx + k * k * b[0], u * u * a[1] + 2 * u * k * cy + k * k * b[1]];
  };

  /* ---------- chat：聊天对话 ----------
     bubbles 手机框：自己的消息先在输入框打出再发送、气泡从输入框飞上来；对方先显示「正在输入」三个点再弹出气泡；超出自动上滚
     thread  宽面板群聊：每条带头像与名字，头像弹簧弹出，气泡侧滑；顶栏成员头像叠放
     ai      助手问答：问题从输入框发出，回答先「思考」闪烁再逐字流式输出，结束后出现操作按钮
     停留：最后一条出现后，气泡上弹出点赞回应、顶栏状态与输入框光标持续跳动 */
  MK.control('chat', {
    variants: ['bubbles', 'thread', 'ai'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, ms = p.messages, n = ms.length;
      const wrap = box(el('div', 'mk-abs mk-chat ' + v, ctx.root), area.x, area.y, area.w, area.h);
      /* 容器：bubbles 手机框；thread / ai 玻璃面板 */
      let shell, scr, iw, ih, top0 = 0, u, fx, fy, fw, fh;
      if (v === 'bubbles') {
        fh = area.h; fw = Math.min(area.w * (P ? .74 : .52), fh * (P ? (area.h > 900 ? .5 : .64) : .56)); fx = (area.w - fw) / 2; fy = 0;
        const d = device(wrap, fx, fy, fw, fh); shell = d.f; scr = d.s; iw = d.sw; ih = d.sh; top0 = d.top; u = Math.round(fw * (P ? .072 : .082));
      } else {
        fw = P ? area.w : Math.min(area.w, v === 'ai' ? 1040 : 980); fh = area.h; fx = (area.w - fw) / 2; fy = 0;
        shell = scr = box(el('div', 'mk-glass mk-abs', wrap), fx, fy, fw, fh); iw = fw; ih = fh; u = Math.round(clamp(Math.min(fw / (v === 'ai' ? 24 : 26), fh / (v === 'ai' ? 15 : 17)), 26, P ? 46 : 42));
      }
      const ui = el('div', 'ui', scr); Object.assign(ui.style, { position: 'absolute', left: 0, top: top0 + 'px', width: iw + 'px', height: (ih - top0) + 'px', fontSize: u + 'px' });
      /* 顶栏 */
      const firstL = ms.find(m => m.who !== 'right');
      const title = p.title || (v === 'ai' ? 'AI 助手' : v === 'thread' ? '群聊' : (firstL && firstL.name) || '聊天');
      const hd = el('div', 'hd', ui);
      const hav = v === 'ai' ? el('div', 'mk-ui-av ai', hd, MK.icon('sparkle', Math.round(u * .9), 2)) : avatar(hd, ctx, v === 'bubbles' ? firstL : null, 'avatar', title, Math.round(u * 1.7));
      if (v === 'ai') Object.assign(hav.style, { width: (u * 1.7) + 'px', height: (u * 1.7) + 'px', position: 'relative' }); else hav.style.position = 'relative';
      const names = [...new Set(ms.filter(m => m.who !== 'right').map(m => m.name || '对方'))];
      const hdt = el('div', 'ht', hd, `<div class="nm">${esc(title)}</div><div class="st"><i></i><span></span></div>`);
      const nmEl = hdt.querySelector('.nm'), stEl = hdt.querySelector('.st span');
      const stIdle = v === 'thread' ? `${names.length + 1} 位成员` : v === 'ai' ? '随时为你解答' : '在线';
      const crowd = v === 'thread' ? el('div', 'crowd', hd) : null;
      const crowdAv = crowd ? names.slice(0, 4).map(nm => { const m = ms.find(x => (x.name || '对方') === nm); const a = avatar(crowd, ctx, m, 'avatar', nm, Math.round(u * 1.25)); a.style.position = 'relative'; return a; }) : [];
      /* 消息区 + 输入框 */
      const vp = el('div', 'vp', ui), fd = el('div', 'fd', vp);
      const cp = el('div', 'cp', ui, `<div class="in"><span class="tx"></span></div><b class="snd">${MK.icon(v === 'ai' ? 'up' : 'send', Math.round(u * .85), 2.4)}</b>`);
      const cin = cp.querySelector('.in'), ctx_ = cp.querySelector('.tx'), snd = cp.querySelector('.snd');
      const holder = v === 'ai' ? '有问题，尽管问…' : '输入消息…';
      const rows = ms.map((m, i) => {
        const L = m.who !== 'right', r = el('div', 'row ' + (L ? 'left' : 'right'), fd);
        const showAv = L && (v === 'thread' || v === 'ai');
        const av = showAv ? (v === 'ai' ? el('div', 'mk-ui-av ai', r, MK.icon('sparkle', Math.round(u * .8), 2)) : avatar(r, ctx, m, 'avatar', m.name || '对方', Math.round(u * 1.8))) : null;
        if (av && v === 'ai') Object.assign(av.style, { width: (u * 1.6) + 'px', height: (u * 1.6) + 'px' });
        const nm = L && v === 'thread' ? el('div', 'who', r, esc(m.name || '对方')) : null;
        const ai = v === 'ai' && L;
        const bb = el('div', ai ? 'ans' : 'bb', r, rich(m.text));
        const dots = L ? el('div', ai ? 'think' : 'bb dots', r, ai ? '<i></i><i></i><i></i>' : '<i></i><i></i><i></i>') : null;
        const acts = ai && i === ms.map(x => x.who !== 'right').lastIndexOf(true) ? el('div', 'acts', r, ['like', 'share', 'cycle'].map(k => `<b>${MK.icon(k, Math.round(u * .72), 2)}</b>`).join('')) : null;
        return { m, L, r, av, nm, bb, dots, acts, y: 0, h: 0, len: MK.plainLen(m.text) };
      });
      const heart = el('div', 'react', fd, MK.icon('heart', Math.round(u * .62), 2.4));
      let vh = 300, offs = [];
      ctx.measure(() => {
        fit(nmEl, Math.round(u * 1.0), 12, iw * (v === 'thread' ? .42 : .6), null);
        const hh = hd.offsetHeight, ch = cp.offsetHeight;
        Object.assign(vp.style, { top: hh + 'px', height: (ih - top0 - hh - ch) + 'px' });
        vh = ih - top0 - hh - ch;
        const pad = u * (v === 'bubbles' ? .7 : .95), gy = u * (v === 'ai' ? 1 : .62);
        let y = u * .7;
        rows.forEach(R => { Object.assign(R.r.style, { width: iw + 'px', height: ih + 'px' }); [R.bb, R.nm, R.dots].forEach(e => { if (e) { e.style.left = '0px'; e.style.top = '0px'; } }); });
        rows.forEach(R => {
          const avS = R.av ? parseFloat(R.av.style.width) : 0, bx = pad + (avS ? avS + u * .5 : 0);
          const maxW = R.bb.className === 'ans' ? iw - bx - pad : (iw - bx - pad) * (v === 'bubbles' ? .84 : .74);
          let nh = 0;
          if (R.nm) { fit(R.nm, Math.round(u * .62), 10, maxW, null); Object.assign(R.nm.style, { left: bx + 'px', top: '0px' }); nh = R.nm.offsetHeight + u * .18; }
          fitWrap(R.bb, u, Math.max(12, Math.floor(u * .6)), maxW, null);
          const bw = R.bb.offsetWidth, bh = R.bb.offsetHeight;
          R.bx = R.L ? bx : iw - pad - bw; R.bw = bw; R.bh = bh;
          Object.assign(R.bb.style, { left: R.bx + 'px', top: nh + 'px' });
          if (R.dots) Object.assign(R.dots.style, { left: bx + 'px', top: nh + 'px' });
          let ah = 0;
          if (R.acts) { Object.assign(R.acts.style, { left: bx + 'px', top: (nh + bh + u * .3) + 'px' }); ah = R.acts.offsetHeight + u * .3; }
          R.h = Math.max(nh + bh + ah, avS);
          if (R.av) Object.assign(R.av.style, { left: pad + 'px', top: (v === 'ai' ? 0 : R.h - avS) + 'px' });
          R.y = y; Object.assign(R.r.style, { top: y + 'px', width: iw + 'px', height: R.h + 'px' });
          y += R.h + gy;
        });
        offs = rows.map(R => Math.max(0, R.y + R.h + u * .5 - vh));
        /* 回应小红心贴在最后一条气泡的角上 */
        const Rl = rows[n - 1];
        Object.assign(heart.style, { left: (Rl.L ? Rl.bx + Rl.bw - u * .5 : Rl.bx - u * .5) + 'px', top: (Rl.y + (Rl.nm ? Rl.nm.offsetHeight + u * .18 : 0) + Rl.bh - u * .55) + 'px' });
        wrap._cap = Math.max(4, Math.floor((cin.clientWidth - u * 1.2) / (parseFloat(getComputedStyle(cin).fontSize) * 1.02)));
      });
      /* 节拍：ai 按回答长度排（流式需要时间），其余均匀错开；cue 优先 */
      const CPS = 22;
      let at, sd = rows.map(() => 0);
      if (v === 'ai') {
        const off = []; let x = 0;
        rows.forEach((R, i) => { x += R.L ? .65 : .75; off[i] = x; sd[i] = R.L ? R.len / CPS : 0; x += R.L ? sd[i] + .45 : .35; });
        const k = Math.min(1, (slot.t1 - slot.t0 - 1.6) / Math.max(1, x));
        at = off.map((o, i) => slot.cues[i] ?? slot.t0 + .25 + o * k); sd = sd.map(d => d * Math.max(.5, k));
        /* 给了 cue 时，流式时长不能撞上下一条 */
        sd = sd.map((d, i) => Math.min(d, (at[i + 1] ?? slot.t1 - .9) - at[i] - .45)).map(d => Math.max(.3, d));
      } else at = beats(slot, n, .85, 1.15, 1.5);
      const lead = i => Math.min(rows[i].L ? .6 : .7, i ? (at[i] - at[i - 1]) * .62 : .7);
      const sAt = rows.map((R, i) => at[i] - lead(i));
      const done = rows.map((R, i) => at[i] + (R.L && v === 'ai' ? sd[i] : 0));
      const tEnd = Math.max(...done), tRe = Math.min(slot.t1 - 1.1, tEnd + .7);
      S(slot.t0 + .05, v === 'bubbles' ? 'whoosh' : 'card', .5);
      rows.forEach((R, i) => {
        if (!R.L) { S(sAt[i] + .05, 'type', .28, .2, { d: Math.max(.2, lead(i) - .2) }); S(at[i], 'swipe', .45, .3); S(at[i] + .06, 'pop', .35, .3); }
        else if (v === 'ai') { S(sAt[i], 'shine', .2); S(at[i], 'type', .22, 0, { d: sd[i] }); S(done[i], 'ding', .2, 0, { m: 96 }); }
        else S(at[i], 'bubble', .5, -.25, { n: i });
      });
      S(tRe, v === 'ai' ? 'blip' : 'pop', .35, 0, { n: 4 });
      /* 自动上滚：对方开始输入 / 自己开始打字时就让出位置 */
      const scrollAt = t => rows.reduce((s, R, i) => s + (offs[i] - (i ? offs[i - 1] : 0)) * EZ.inout(pr(t, sAt[i], sAt[i] + .45)), 0);
      return {
        update(t) {
          const out = leave(t, slot), k = pr(t, slot.t0, slot.t0 + .7), E = EZ.out5(k), lv = idle(t, slot.t0 + .7, 4);
          set(wrap, { o: 1 - out, blur: out * 10, y: -EZ.in(out) * 20 });
          if (v === 'bubbles') tf(shell, { p: 1600, o: clamp(k * 3), y: (1 - E) * 160 + Math.sin(lv.u * 1.3) * 4, rx: (1 - E) * 28, ry: Math.sin(lv.u * .7) * 3 * E, s: .9 + .1 * EZ.back(k) });
          else if (v === 'thread') { tf(shell, { o: clamp(k * 3), x: (1 - E) * -90, s: .96 + .04 * EZ.back(k) }); shell.style.clipPath = `inset(0 ${((1 - EZ.inout(k)) * 100).toFixed(2)}% 0 0 round 20px)`; }
          else { tf(shell, { o: clamp(k * 3), s: .92 + .08 * EZ.back(k), y: (1 - E) * 40 }); shell.style.boxShadow = `0 30px 80px rgba(0,0,0,.55),0 0 0 1.5px rgba(${T().a},${(.18 + .14 * (.5 + .5 * lv.wave)).toFixed(3)}),0 0 ${(40 + 20 * lv.wave).toFixed(1)}px rgba(${T().a},.16)`; }
          set(hd, { o: pr(t, slot.t0 + .2, slot.t0 + .6), y: (1 - EZ.expo(pr(t, slot.t0 + .2, slot.t0 + .7))) * -14 });
          set(cp, { o: pr(t, slot.t0 + .3, slot.t0 + .7), y: (1 - EZ.expo(pr(t, slot.t0 + .3, slot.t0 + .8))) * 20 });
          crowdAv.forEach((a, i) => { const q = pr(t, slot.t0 + .35 + i * .08, slot.t0 + .75 + i * .08); set(a, { o: clamp(q * 3), s: .4 + .6 * EZ.spring(q) }); avFrame(ctx, a, t); });
          avFrame(ctx, hav, t);
          /* 顶栏状态：对方输入中 / AI 思考中 */
          const typing = rows.findIndex((R, i) => R.L && t >= sAt[i] && t < at[i]);
          const streaming = v === 'ai' && rows.some((R, i) => R.L && t >= at[i] && t < done[i]);
          const st = typing >= 0 ? (v === 'ai' ? '思考中…' : v === 'thread' ? `${rows[typing].m.name || '对方'} 正在输入…` : '对方正在输入…') : streaming ? '正在回答…' : stIdle;
          html(stEl, esc(st));
          hdt.querySelector('.st i').style.opacity = (typing >= 0 || streaming) ? (.4 + .6 * Math.abs(Math.sin(t * 5))).toFixed(3) : '1';
          /* 输入框：正在打的那条 */
          const ci = rows.findIndex((R, i) => !R.L && t >= sAt[i] && t < at[i] + .02);
          if (ci >= 0) {
            const R = rows[ci], q = pr(t, sAt[ci] + .05, at[ci] - .12), all = [...plain(R.m.text)], m = Math.ceil(q * all.length);
            const shown = all.slice(Math.max(0, m - (wrap._cap || 12)), m).join('');
            html(ctx_, esc(shown) + (Math.floor(t * 4) % 2 ? '<span class="mk-caret">▍</span>' : '<span class="mk-caret" style="opacity:0">▍</span>'));
            snd.classList.toggle('on', m > 0);
          } else {
            html(ctx_, `<span class="ph">${holder}</span>` + (t > tEnd && Math.floor(t * 2) % 2 ? '<span class="mk-caret">▍</span>' : ''));
            snd.classList.remove('on');
          }
          const sendK = rows.reduce((s, R, i) => (!R.L ? Math.max(s, Math.sin(Math.PI * pr(t, at[i] - .05, at[i] + .25))) : s), 0);
          set(snd, { s: 1 + .25 * sendK });
          /* 滚动 */
          const sc = scrollAt(t);
          fd.style.transform = `translateY(${(-sc).toFixed(2)}px)`;
          rows.forEach((R, i) => {
            const c = at[i], q = pr(t, c - .02, c + .5);
            if (R.av) { const a = pr(t, sAt[i], sAt[i] + .4); set(R.av, { o: clamp(a * 3), s: .3 + .7 * EZ.spring(a), r: v === 'ai' && t < done[i] ? t * 140 : 0 }); avFrame(ctx, R.av, t); }
            if (R.nm) set(R.nm, { o: pr(t, sAt[i] + .1, sAt[i] + .4) });
            if (R.dots) {
              const dk = pr(t, sAt[i], sAt[i] + .3), gone = pr(t, c - .04, c + .06);
              set(R.dots, { o: clamp(dk * 3) * (1 - gone), s: .5 + .5 * EZ.back(dk) });
              [...R.dots.children].forEach((d, j) => set(d, { y: -Math.max(0, Math.sin(t * 9 - j * .9)) * u * .22, o: .45 + .55 * Math.max(0, Math.sin(t * 9 - j * .9)) }));
            }
            if (R.bb.className === 'ans') {
              const m = Math.floor(clamp((t - c) / Math.max(.05, sd[i])) * R.len + 1e-6), caret = t >= c && t < done[i] + .3 && Math.floor(t * 4) % 2 === 0;
              html(R.bb, (t < c ? '' : MK.richUpTo(R.m.text, m)) + (caret ? '<span class="mk-caret">▍</span>' : ''));
              set(R.bb, { o: t >= c ? 1 : 0 });
              if (R.acts) [...R.acts.children].forEach((b, j) => { const a = pr(t, done[i] + .25 + j * .08, done[i] + .6 + j * .08); set(b, { o: clamp(a * 3), s: .5 + .5 * EZ.spring(a) }); });
            } else if (!R.L) {
              /* 自己的消息：从输入框位置飞上来 */
              const vis = R.y - sc, dy = (vh + u * .4 - vis) * (1 - EZ.out5(q));
              tf(R.bb, { o: clamp(q * 5), y: dy, sx: .55 + .45 * EZ.back(q), sy: .55 + .45 * EZ.back(q) });
            } else if (v === 'thread') {
              tf(R.bb, { o: clamp(q * 4), x: (1 - EZ.out5(q)) * -50, s: .7 + .3 * EZ.back(q) });
            } else tf(R.bb, { o: clamp(q * 5), s: .4 + .6 * EZ.spring(q) });
            /* 新到的一条短暂发亮 */
            R.bb.style.filter = q > 0 && q < 1 ? `brightness(${(1 + .35 * (1 - q)).toFixed(3)})` : '';
          });
          const rq = pr(t, tRe, tRe + .45);
          set(heart, { o: clamp(rq * 4), s: (.2 + .8 * EZ.spring(rq)) * (1 + .1 * Math.max(0, Math.sin((t - tRe) * 5)) * (t > tRe + .5 ? 1 : 0)) });
        },
        bg(c, t) {
          const a = 1 - leave(t, slot), cx = area.x + fx + fw / 2, cy = area.y + fy + fh / 2;
          MK.fx.glow(c, cx, cy, Math.max(fw, fh) * .8, T().a, .55 * a * pr(t, slot.t0, slot.t0 + 1));
          rows.forEach((R, i) => { if (R.L && v !== 'ai') MK.fx.ripple(c, t, at[i], area.x + fx + (v === 'bubbles' ? fw * .2 : fw * .15), area.y + fy + fh * .62, { r: fw * .5, rings: 1, w: 2 * a }); });
        },
        fg(c, t) { T().paint.burst(c, t, tRe + .05, area.x + fx + fw * (rows[n - 1].L ? .8 : .2), area.y + fy + fh * .7, { n: 14, sp: 380, life: .6, col: T().r }); },
        hint: { cx: area.x + fx + fw / 2, cy: area.y + fh * .5 },
      };
    },
  });
  /* ---------- comment：评论 / 弹幕 ----------
     cards   评论卡逐张翻起浮现，点赞爱心弹跳、数字上涨；最后一拍给最高赞的评论盖「热评」章
     danmaku 弹幕从右向左飞过播放画面（可选 src 素材），持续循环；最后一拍热评放大停在中央、点赞爆开
     pinned  评论卡依次落下，最后一拍最高赞那条被拎起、移到最上方置顶，其余下移让位并变暗
     停留：高亮轮流扫过各条 / 弹幕持续飞行 / 置顶卡呼吸发光与扫光 */
  MK.control('comment', {
    variants: ['cards', 'danmaku', 'pinned'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, its = p.items, n = its.length;
      const wrap = box(el('div', 'mk-abs mk-cmt ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const top = its.reduce((b, x, i) => ((x.likes || 0) > (its[b].likes || 0) ? i : b), 0);
      const at = beats(slot, n, .3, v === 'danmaku' ? .6 : .55, 2.6);
      const cx = slot.cues[n] ?? Math.min(slot.t1 - 1.8, at[n - 1] + .9);
      if (v === 'danmaku') {
        /* 播放画面 */
        const pw = area.w, ph = Math.min(area.h, P ? pw * (area.h > 900 ? 1.15 : .74) : pw * 9 / 16), px = 0, py = (area.h - ph) / 2;
        const pl = box(el('div', 'pl mk-abs', wrap), px, py, pw, ph);
        const scr = el('div', 'sc', pl);
        let im = null;
        if (p.src) { im = el('img', '', scr); ctx.mediaOf(im, p, 'src'); } else el('div', 'ph', scr, MK.icon('play', 64, 1.6));
        const lay = el('div', 'dm', pl);
        const bar = el('div', 'cb', pl, `<b>${MK.icon('pause', 26, 2.4)}</b><div class="tr"><i></i><s></s></div><span class="tm"></span><b>${MK.icon('chat', 26, 2.2)}</b>`);
        const trI = bar.querySelector('.tr i'), trS = bar.querySelector('.tr s'), tmEl = bar.querySelector('.tm');
        const pills = its.map((it, i) => {
          const e = el('div', 'pill mk-abs' + (i === top ? ' hot' : ''), lay);
          const av = avatar(e, ctx, it, 'avatar', it.user, '1.5em'); av.style.position = 'relative';
          el('span', 'tx', e, rich(it.text));
          const lk = i === top ? el('span', 'lk', e, `${MK.icon('heart', 24, 2.4)}<b></b>`) : null;
          return { e, av, lk, w: 0, h: 0 };
        });
        let lanes = 4, lh = 60, fs = 30;
        ctx.measure(() => {
          lh = ph * .11; const cap = Math.min(ph / 13, P ? 44 : 40);
          fs = shrink(cap, 14, u => { lay.style.fontSize = u + 'px'; return pills.every((q, i) => q.e.offsetWidth <= pw * (i === top ? .62 : .82)); }, '弹幕');
          lanes = Math.max(3, Math.floor((ph - bar.offsetHeight - fs) * .82 / (fs * 2)));
          lh = fs * 2;
          pills.forEach(q => { q.w = q.e.offsetWidth; q.h = q.e.offsetHeight; });
        });
        /* 普通弹幕：在各自 cue 发出，之后按周期循环；热评在最后一拍飞入并停在中央 */
        const travel = 4.6, period = i => travel + 1.1 + rnd(i, 81) * 1.4;
        const laneOf = i => (i * 2 + (i > top ? 1 : 0)) % lanes, hotY = ph * .38;
        its.forEach((_, i) => { if (i !== top) S(at[i], 'swipe', .3, .6); });
        S(cx - .55, 'whoosh', .5, .5); S(cx, 'pop', .6); S(cx + .1, 'heartbeat', .5); S(cx + .15, 'counter', .25, 0, { d: .8 }); punch(cx, .025);
        const hold = 1.6;
        return {
          update(t) {
            const out = leave(t, slot), k = pr(t, slot.t0, slot.t0 + .7);
            set(wrap, { o: 1 - out, blur: out * 10 });
            tf(pl, { p: 1400, o: clamp(k * 3), s: .86 + .14 * EZ.back(k), rx: (1 - EZ.out5(k)) * 18 });
            if (im) ctx.frameAt(im, p, t, 'src');
            scr.style.transform = `scale(${(1.06 + .04 * Math.sin((t - slot.t0) * .25)).toFixed(4)})`;
            const prog = clamp((t - slot.t0) / Math.max(1, slot.t1 - slot.t0));
            trI.style.width = (prog * 100).toFixed(2) + '%'; trS.style.left = (prog * 100).toFixed(2) + '%';
            const sec = Math.floor(84 + t - slot.t0); tmEl.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
            pills.forEach((q, i) => {
              if (i === top) {
                const a = pr(t, cx - .55, cx), b = pr(t, cx + hold, cx + hold + 1.4), xc = (pw - q.w) / 2;
                const x = t < cx + hold ? lerp(pw + 20, xc, EZ.back(a)) : lerp(xc, -q.w - 40, EZ.in(b));
                const pop = pr(t, cx, cx + .5), sc = 1 + .35 * EZ.spring(pop) * (1 - EZ.inout(b));
                tf(q.e, { x, y: hotY - q.h / 2, s: sc, o: a > 0 && b < 1 ? 1 : 0 });
                q.e.classList.toggle('lit', t >= cx);
                const like = Math.round(lerp((its[i].likes || 0) * .7, its[i].likes || 0, EZ.out(pr(t, cx + .15, cx + 1))));
                html(q.lk.lastChild, compact(like));
                set(q.lk.firstChild, { s: 1 + .5 * Math.max(0, Math.sin(Math.PI * pr(t, cx + .05, cx + .4))) });
                return;
              }
              const per = period(i), e0 = at[i];
              if (t < e0) { set(q.e, { o: 0 }); return; }
              const ph_ = ((t - e0) % per), x = pw - (ph_ / travel) * (pw + q.w + 40);
              const lane = (laneOf(i) + Math.floor((t - e0) / per)) % lanes, y = fs * .6 + lane * lh;
              /* 热评停在中央时，其他弹幕让开那一行 */
              const dodge = Math.abs(y + q.h / 2 - hotY) < lh * .9 ? (1 - Math.abs(clamp((t - cx) / hold * 2 - 1))) * (t > cx - .3 && t < cx + hold ? 1 : 0) : 0;
              tf(q.e, { x, y: y + dodge * (y < hotY ? -lh * .6 : lh * .6), o: (ph_ < travel ? 1 : 0) * (1 - dodge * .5) });
            });
          },
          fg(c, t) {
            const gx = area.x + px + pw / 2, gy = area.y + py + hotY;
            T().paint.burst(c, t, cx + .05, gx, gy, { n: 30, sp: 700, col: T().r, life: .8 });
            MK.fx.confetti(c, t, cx + .1, gx, gy, { n: 26, sp: 900, life: 1.6, seed: 3 });
          },
          bg(c, t) { MK.fx.glow(c, area.x + px + pw / 2, area.y + py + ph / 2, pw * .7, T().a, .45 * (1 - leave(t, slot)) * pr(t, slot.t0, slot.t0 + 1)); },
          hint: { cx: area.x + pw / 2, cy: area.y + py + ph / 2 },
        };
      }
      /* cards / pinned：评论卡列表 */
      const head = p.title ? el('div', 'hd mk-abs', wrap, `${MK.icon('chat', 24, 2.2)}<span>${esc(p.title)}</span>`) : null;
      const lw = P ? area.w : Math.min(area.w, v === 'pinned' ? 980 : 1000), lx = (area.w - lw) / 2;
      const list = box(el('div', 'ls mk-abs', wrap), lx, 0, lw);
      const cards = its.map((it, i) => {
        const c = el('div', 'cc mk-abs', list);
        const av = avatar(c, ctx, it, 'avatar', it.user, '2.3em'); av.style.position = 'relative';
        const bd = el('div', 'bd', c, `<div class="u"><b>${esc(it.user)}</b>${it.time ? `<span>${esc(it.time)}</span>` : ''}</div><div class="tx">${rich(it.text)}</div>`);
        const lk = el('div', 'lk', c, `${MK.icon('heart', 24, 2.2)}<b></b>`);
        const tag = i === top ? el('div', 'tag mk-abs', c, v === 'pinned' ? `${MK.icon('pin', 20, 2.4)}置顶` : `${MK.icon('fire', 20, 2.4)}热评`) : null;
        const shine = el('i', 'sh', c);
        return { c, av, bd, lk, tag, shine, tx: bd.querySelector('.tx'), un: bd.querySelector('.u'), h: 0, y0: 0, y1: 0 };
      });
      let u0 = 30, gap = 12, hh = 0;
      ctx.measure(() => {
        u0 = shrink(P ? 44 : 36, 14, u => {
          wrap.style.fontSize = u + 'px';
          gap = u * .5; hh = head ? head.offsetHeight + u * .7 : 0;
          const hs = cards.map(q => { q.c.style.width = lw + 'px'; return q.c.offsetHeight; });
          const sum = hs.reduce((a, b) => a + b, 0) + gap * (n - 1) + (v === 'pinned' ? u * .8 : 0);
          if (sum > area.h - hh) return false;
          return cards.every(q => ok(q.tx, 2) && q.un.scrollWidth <= q.un.clientWidth + 1);
        }, '评论');
        cards.forEach(q => { q.h = q.c.offsetHeight; });
        const total = cards.reduce((a, q) => a + q.h, 0) + gap * (n - 1);
        const y0 = hh + Math.max(0, (area.h - hh - total) * (P ? .2 : .4));
        let y = y0; cards.forEach(q => { q.y0 = y; y += q.h + gap; });
        /* 置顶后的次序：最高赞那条移到最前 */
        y = y0; [top, ...cards.map((_, i) => i).filter(i => i !== top)].forEach(i => { cards[i].y1 = y; y += cards[i].h + gap; });
        if (head) Object.assign(head.style, { left: lx + 'px', top: (y0 - hh) + 'px' });
      });
      at.forEach((c, i) => { S(c, v === 'pinned' ? 'card' : 'swoosh', .4, (i / n - .5) * .6); S(c + .45, 'bubble', .35, .4, { n: i }); });
      if (v === 'pinned') { S(cx, 'whoosh', .45); S(cx + .55, 'stamp', .6); S(cx + .6, 'ding', .3, 0, { m: 91 }); flash(cx + .55, .15); shake(cx + .55, 6); }
      else { S(cx, 'stamp', .65); S(cx + .1, 'shine', .35); flash(cx, .12); punch(cx, .02); }
      const tIdle = cx + 1;
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, y: -EZ.in(out) * 16 });
          if (head) set(head, { o: pr(t, slot.t0, slot.t0 + .4), x: (1 - EZ.expo(pr(t, slot.t0, slot.t0 + .6))) * -30 });
          const mv = EZ.inout(pr(t, cx, cx + .7)), lift = Math.sin(Math.PI * pr(t, cx, cx + .7)), lv = idle(t, tIdle, 1.4);
          const turn = t > tIdle ? Math.floor(lv.u / 1.4) % n : -1;
          cards.forEach((q, i) => {
            const k = pr(t, at[i] - .05, at[i] + .55), isTop = i === top;
            let y = q.y0, s = .9 + .1 * EZ.back(k), o = clamp(k * 3), blur = 0, z = 1;
            if (v === 'pinned') {
              y = lerp(q.y0, q.y1, mv);
              if (isTop) { s *= 1 + .07 * lift + .03 * mv; z = 5; } else { o *= 1 - .45 * mv; blur = 1.5 * mv; s *= 1 - .02 * mv; }
            }
            q.c.style.zIndex = z;
            q.c.style.transformOrigin = '50% 0';
            tf(q.c, { p: 1100, o, y: y + (1 - EZ.out5(k)) * 60, rx: (1 - EZ.out(k)) * -50, s, blur, x: v === 'pinned' && isTop ? -lift * 24 : 0 });
            set(q.av, { o: clamp(pr(t, at[i] + .1, at[i] + .4) * 3), s: .4 + .6 * EZ.spring(pr(t, at[i] + .1, at[i] + .55)) });
            avFrame(ctx, q.av, t);
            /* 点赞：爱心弹跳变红，数字上涨 */
            const lk = pr(t, at[i] + .45, at[i] + .85), roll = EZ.out(pr(t, at[i] + .45, at[i] + 1.6));
            const L = its[i].likes || 0;
            html(q.lk.lastChild, compact(lerp(L * .55, L, roll)));
            q.lk.classList.toggle('on', lk > 0);
            const beat = isTop && t > tIdle ? Math.max(0, Math.sin(lv.u * 4.5)) * .12 : 0;
            set(q.lk.firstChild, { s: 1 + .45 * Math.sin(Math.PI * lk) + beat });
            if (q.tag) { const g = pr(t, cx + (v === 'pinned' ? .5 : 0), cx + (v === 'pinned' ? .85 : .35)); set(q.tag, { o: clamp(g * 4), s: 1 + (1 - EZ.out5(g)) * 1.6, r: (1 - EZ.out(g)) * -18 - 4 }); }
            const lit = (isTop && t >= cx + (v === 'pinned' ? .5 : 0)) || turn === i;
            q.c.classList.toggle('lit', lit);
            q.c.classList.toggle('hot', isTop && t >= cx);
            const sw = isTop ? (t < tIdle ? pr(t, cx + .1, cx + .9) : (lv.u % 2.8) / 1.4) : (turn === i ? lv.sweep : 0);
            q.shine.style.transform = `translateX(${lerp(-120, 520, clamp(sw)).toFixed(1)}%) skewX(-18deg)`;
          });
        },
        fg(c, t) {
          const r = stageRect(ctx, cards[top].lk);
          T().paint.burst(c, t, cx + (v === 'pinned' ? .55 : .05), r.cx, r.cy, { n: 26, sp: 520, col: T().r, life: .7 });
        },
        bg(c, t) { MK.fx.glow(c, area.x + area.w / 2, area.y + area.h * .45, area.w * .6, T().a, .35 * (1 - leave(t, slot)) * pr(t, slot.t0, slot.t0 + 1)); },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .45 },
      };
    },
  });

  /* ---------- notify：通知横幅 ----------
     stack 横幅从画面顶上依次滑下，旧的退到后面叠成一摞；铃铛摇晃、角标数字跳动；最后一拍整摞展开成列表
     toast 中心弹窗：每条弹簧弹出，上一条缩到后面；最后一拍出现操作按钮并按下「查看」
     lock  锁屏：屏幕亮起，通知从下方滑入列表顶部、手机震动；最后一拍「上滑打开」提示
     停留：铃铛轻摆 + 横幅轮流扫光 / 按钮呼吸 / 锁屏提示上下跳动 */
  MK.control('notify', {
    variants: ['stack', 'toast', 'lock'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, its = p.items, n = its.length;
      const wrap = box(el('div', 'mk-abs mk-ntf ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const at = beats(slot, n, .45, 1.05, 2);
      const cx = slot.cues[n] ?? Math.min(slot.t1 - 1.5, at[n - 1] + 1);
      const banner = (it, parent) => {
        const b = el('div', 'nb mk-abs', parent);
        b.innerHTML = `<div class="ic mk-ui-g${hue(it.app)}">${MK.icon(it.icon || 'bell', 48, 2)}</div><div class="bd"><div class="h"><span class="ap">${esc(it.app)}</span><span class="tm">${esc(it.time || '刚刚')}</span></div><div class="ti">${rich(it.title)}</div>${it.text ? `<div class="tx">${rich(it.text)}</div>` : ''}</div><i class="sh"></i>`;
        return { b, ti: b.querySelector('.ti'), tx: b.querySelector('.tx'), h0: b.querySelector('.h'), ic: b.querySelector('.ic'), sh: b.querySelector('.sh'), h: 0 };
      };
      const fitsB = q => ok(q.ti, 1) && (!q.tx || ok(q.tx, 2)) && q.h0.scrollWidth <= q.h0.clientWidth + 1;
      const arrived = t => at.reduce((s, c) => s + (t >= c ? 1 : 0), 0);
      if (v === 'lock') {
        /* 手机：横屏整机居中；竖屏手机放大、从内容区底边升起（下沿渐隐） */
        const fw = P ? area.w * (area.h > 900 ? .66 : .7) : Math.min(area.w * .5, area.h * .66), fh = fw * 2.05;
        const fx = (area.w - fw) / 2, fy = P ? Math.max(0, area.h - fh) * .3 : Math.max(-area.h * .04, (area.h - fh) / 2);
        const hold = el('div', 'mk-abs', wrap); Object.assign(hold.style, { width: area.w + 'px', height: area.h + 'px' });
        if (fh > area.h) hold.style.webkitMaskImage = hold.style.maskImage = 'linear-gradient(180deg,#000 82%,transparent 99%)';
        const d = device(hold, fx, fy, fw, fh), sc = d.s;
        const wall = el('div', 'wall', sc), dark = el('div', 'dark', sc);
        const ui = el('div', 'lk', sc); Object.assign(ui.style, { width: d.sw + 'px', height: d.sh + 'px' });
        const lockI = el('div', 'li', ui, MK.icon('lock', 24, 2.2));
        const clock = el('div', 'ck', ui, `<div class="dt">${esc(p.date || '星期一')}</div><div class="tm">${esc(p.time || '08:30')}</div>`);
        const list = el('div', 'lst', ui);
        const bs = its.map(it => banner(it, list));
        const hint = el('div', 'hint', ui, `${MK.icon('up', 20, 2.4)}<span>上滑打开</span>`);
        const bar = el('i', 'hb', ui);
        const visH = Math.min(area.h - fy, fh) - d.top * .2;
        let yList = 0, gap = 10, lw = d.sw * .92;
        ctx.measure(() => {
          shrink(Math.round(d.sw * .064), 11, u => {
            ui.style.fontSize = u + 'px'; gap = u * .45;
            bs.forEach(q => { q.b.style.width = lw + 'px'; });
            yList = clock.offsetTop + clock.offsetHeight + u * 1.2;
            const hs = bs.map(q => q.b.offsetHeight), sum = hs.reduce((a, b) => a + b, 0) + gap * (n - 1);
            return yList + sum + u * (fh > area.h ? 1 : 4) < visH && bs.every(fitsB);
          }, '锁屏通知');
          bs.forEach(q => { q.h = q.b.offsetHeight; q.b.style.left = (d.sw - lw) / 2 + 'px'; });
          fit(clock.querySelector('.tm'), Math.round(d.sw * .24), 20, d.sw * .9, null);
          yList = clock.offsetTop + clock.offsetHeight + parseFloat(ui.style.fontSize) * 1.2;
        });
        const wake = at[0] - .3;
        S(slot.t0 + .05, 'whoosh', .45); S(wake, 'shine', .3);
        at.forEach((c, i) => { S(c, 'notif', .6, .2); S(c + .02, 'hum', .2, 0, { d: .3 }); });
        S(cx, 'swipe', .4); S(cx + .1, 'blip', .3, 0, { n: 6 });
        return {
          update(t) {
            const out = leave(t, slot), k = pr(t, slot.t0, slot.t0 + .7);
            set(wrap, { o: 1 - out, blur: out * 10 });
            const buzz = at.reduce((s, c) => { const x = t - c; return x > 0 && x < .35 ? s + Math.sin(x * 90) * (1 - x / .35) : s; }, 0);
            tf(d.f, { p: 1500, o: clamp(k * 3), y: (1 - EZ.out5(k)) * 220, rx: (1 - EZ.out5(k)) * 24, r: buzz * 1.2, x: buzz * 4 });
            const on = EZ.out(pr(t, wake, wake + .5));
            dark.style.opacity = (1 - on * .92).toFixed(3);
            wall.style.transform = `scale(${(1.15 - .1 * on).toFixed(4)}) translateY(${(Math.sin(t * .3) * 1.5).toFixed(2)}%)`;
            set(clock, { o: on, y: (1 - on) * 30, s: .94 + .06 * on });
            set(lockI, { o: on, y: (1 - on) * -10 });
            /* 新通知在列表顶部出现，旧的往下让 */
            bs.forEach((q, i) => {
              const kk = pr(t, at[i] - .05, at[i] + .5);
              let y = yList; for (let j = i + 1; j < n; j++) y += (bs[j].h + gap) * EZ.out5(pr(t, at[j] - .05, at[j] + .4));
              tf(q.b, { y: y + (1 - EZ.out5(kk)) * 60, o: clamp(kk * 3), s: .82 + .18 * EZ.spring(kk), blur: (1 - EZ.out(kk)) * 8 });
              const sw = t > cx + .4 ? ((idle(t, cx + .4, 3).u - i * .35) % 3) / 1.2 : -1;
              q.sh.style.transform = `translateX(${lerp(-120, 520, clamp(sw)).toFixed(1)}%) skewX(-18deg)`;
            });
            const hk = pr(t, cx, cx + .45), bob = t > cx + .45 ? Math.abs(Math.sin((t - cx) * 3)) : 0;
            set(hint, { o: clamp(hk * 3) * (.6 + .4 * bob), y: (1 - EZ.back(hk)) * 20 - bob * 10 });
            set(bar, { o: on, sx: 1 + .25 * bob });
          },
          bg(c, t) { MK.fx.glow(c, area.x + fx + fw / 2, area.y + fy + Math.min(fh, area.h) * .4, fw * 1.3, T().a, .5 * (1 - leave(t, slot)) * pr(t, wake, wake + .6)); at.forEach(c0 => MK.fx.ripple(c, t, c0, area.x + fx + fw / 2, area.y + fy + yList + 40, { r: fw * .8, rings: 2 })); },
          hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .45 },
        };
      }
      /* stack / toast */
      const bw = v === 'toast' ? (P ? area.w * .94 : Math.min(area.w * .82, 880)) : (P ? area.w : Math.min(area.w * .7, 800));
      const bx = v === 'toast' ? (area.w - bw) / 2 : (P ? 0 : area.w - bw - Math.max(0, area.w * .03));
      const bell = el('div', 'bell mk-abs', wrap, `<div class="ring">${MK.icon('bell', 96, 1.8)}</div><b class="bdg"></b>`);
      const ring = bell.querySelector('.ring'), bdg = bell.querySelector('.bdg');
      const bs = its.map(it => banner(it, wrap));
      const acts = v === 'toast' ? el('div', 'acts mk-abs', wrap, '<span class="pri">查看</span><span>稍后</span>') : null;
      let y0 = 0, gap = 14, uu = 30;
      ctx.measure(() => {
        uu = shrink(v === 'toast' ? (P ? 46 : 42) : (P ? 40 : 34), 13, u => {
          wrap.style.fontSize = u + 'px'; gap = u * .5;
          bs.forEach(q => { q.b.style.width = bw + 'px'; });
          const hs = bs.map(q => q.b.offsetHeight);
          const need = v === 'toast' ? Math.max(...hs) + u * 4.6 : hs.reduce((a, b) => a + b, 0) + gap * (n - 1) + (P ? u * 5.4 : 0);
          return need <= area.h && bs.every(fitsB);
        }, '通知');
        bs.forEach(q => { q.h = q.b.offsetHeight; q.b.style.left = bx + 'px'; });
        if (v === 'stack') {
          const total = bs.reduce((a, q) => a + q.h, 0) + gap * (n - 1);
          y0 = P ? uu * 5.4 + Math.max(0, (area.h - uu * 5.4 - total) * .3) : Math.max(0, (area.h - total) * .35);
          bell.style.fontSize = (P ? uu * 1.4 : uu * 2.6) + 'px';
          Object.assign(bell.style, P ? { left: (area.w / 2 - bell.offsetWidth / 2) + 'px', top: uu * .4 + 'px' } : { left: Math.max(0, (bx - bell.offsetWidth) / 2) + 'px', top: (area.h / 2 - bell.offsetHeight / 2 - uu) + 'px' });
        } else {
          const H0 = Math.max(...bs.map(q => q.h));
          y0 = (area.h - H0 - uu * 3.6) / 2 + uu * 1.2;
          bell.style.fontSize = uu * .9 + 'px';
          Object.assign(bell.style, { left: (bx + bw - bell.offsetWidth * .55) + 'px', top: (y0 - bell.offsetHeight * .45) + 'px', zIndex: 9 });
          Object.assign(acts.style, { left: bx + 'px', width: bw + 'px' });
        }
      });
      S(slot.t0 + .05, 'swoosh', .35);
      at.forEach((c, i) => { S(c - .08, v === 'toast' ? 'whoosh' : 'swipe', .4, .3); S(c, v === 'toast' ? 'pop' : 'notify', .6, .2); S(c + .12, 'blip', .25, .5, { n: i + 2 }); });
      if (v === 'stack') { S(cx, 'card', .5); S(cx + .3, 'tick', .4); } else { S(cx, 'pop', .4); S(cx + .75, 'tick', .5); S(cx + .8, 'ding', .35, 0, { m: 93 }); }
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          const cnt = arrived(t), lastA = at[Math.max(0, cnt - 1)], jump = cnt ? pr(t, lastA, lastA + .45) : 0;
          const bk = pr(t, slot.t0, slot.t0 + .6), lv = idle(t, cx + .7, 2.4);
          set(bell, { o: clamp(bk * 3), s: .5 + .5 * EZ.spring(bk) });
          const wob = at.reduce((s, c) => { const x = t - c; return x > 0 && x < 1 ? s + Math.sin(x * 26) * Math.exp(-x * 5) * 22 : s; }, 0) + (t > cx + .7 ? lv.wave * 4 : 0);
          ring.style.transform = `rotate(${wob.toFixed(2)}deg)`;
          html(bdg, cnt > 0 ? String(cnt) : '');
          set(bdg, { o: cnt > 0 ? 1 : 0, s: cnt ? 1 + .6 * Math.sin(Math.PI * jump) * (1 - jump) + .5 * (1 - EZ.spring(jump)) : 0 });
          const ex = v === 'stack' ? EZ.inout(pr(t, cx, cx + .65)) : 0;
          bs.forEach((q, i) => {
            const kk = pr(t, at[i] - .05, at[i] + .55);
            /* 后来者的数量（连续值）：决定这一条被压到第几层 */
            let dep = 0; for (let j = i + 1; j < n; j++) dep += EZ.out5(pr(t, at[j] - .05, at[j] + .35));
            if (v === 'stack') {
              let yE = y0; for (let j = n - 1; j > i; j--) yE += bs[j].h + gap;
              const yS = y0 + Math.min(dep, 2.4) * uu * .55, sS = 1 - Math.min(dep, 3) * .05, oS = clamp(1.4 - dep * .45);
              const drop = (1 - EZ.spring(kk)) * -(area.y + q.h + 60);
              tf(q.b, { y: lerp(yS, yE, ex) + drop, s: lerp(sS, 1, ex), o: (kk > 0 ? 1 : 0) * lerp(oS, 1, ex), blur: lerp(Math.min(dep, 3) * 1.2, 0, ex) });
              q.b.style.zIndex = 10 + i;
              q.b.style.transformOrigin = '50% 0';
            } else {
              const yy = y0 + (Math.max(...bs.map(b => b.h)) - q.h) / 2;
              tf(q.b, { y: yy - Math.min(dep, 3) * uu * .9, s: (.6 + .4 * EZ.spring(kk)) * (1 - Math.min(dep, 3) * .08), o: clamp(kk * 4) * clamp(1.3 - dep * .5), blur: (1 - EZ.out(kk)) * 10 + Math.min(dep, 3) * 2 });
              q.b.style.zIndex = 10 + i;
            }
            set(q.ic, { s: .5 + .5 * EZ.spring(pr(t, at[i] + .05, at[i] + .5)) });
            const sw = t > cx + .7 ? ((lv.u - i * .4) % (n * .8 + 1.2)) / 1 : (i === cnt - 1 ? pr(t, at[i] + .2, at[i] + .9) : -1);
            q.sh.style.transform = `translateX(${lerp(-120, 520, clamp(sw)).toFixed(1)}%) skewX(-18deg)`;
          });
          if (acts) {
            const ak = pr(t, cx, cx + .45), press = Math.sin(Math.PI * pr(t, cx + .7, cx + .9));
            const H0 = Math.max(...bs.map(b => b.h));
            set(acts, { y: y0 + H0 + uu * .8 + (1 - EZ.back(ak)) * 30, o: clamp(ak * 3) });
            const pri = acts.firstChild;
            set(pri, { s: 1 - .08 * press + (t > cx + 1 ? .03 * lv.wave : 0) });
            pri.classList.toggle('on', t >= cx + .8);
          }
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          if (v === 'toast') at.forEach(c0 => MK.fx.ripple(c, t, c0, area.x + area.w / 2, area.y + y0 + 60, { r: bw * .7, rings: 2, w: 3 * a }));
          else { const r = stageRect(ctx, bell); at.forEach(c0 => MK.fx.ripple(c, t, c0, r.cx, r.cy, { r: 160, rings: 2, col: T().r, w: 2 * a })); }
          MK.fx.glow(c, area.x + bx + bw / 2, area.y + area.h * .4, bw * .7, T().a, .35 * a);
        },
        fg(c, t) { if (v === 'toast') { const r = stageRect(ctx, acts.firstChild); T().paint.burst(c, t, cx + .8, r.cx, r.cy, { n: 20, sp: 420, life: .6 }); } },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .42 },
      };
    },
  });

  /* ---------- search：搜索框 ----------
     bar       大搜索框：光标闪烁 → 逐字输入 → 回车（按钮按下 + 波纹）→ 联想列表展开、命中词涂亮；停留时选中条上下移动
     spotlight 背景压暗、居中命令面板弹出 → 输入 → 结果出现 → 方向键逐条下移 → 回车打开（选中行闪光）
     results   结果页：顶部搜索框输入 → 回车 → 加载进度条 + 骨架屏闪烁 → 结果卡片依次替换骨架、命中词涂亮；最后一拍第一条标为最佳匹配 */
  MK.control('search', {
    variants: ['bar', 'spotlight', 'results'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, its = p.items || [], n = its.length, q = plain(p.query), ql = [...q].length;
      const wrap = box(el('div', 'mk-abs mk-srch ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const c0 = slot.cues[0] ?? slot.t0 + .6;
      const tType = Math.min(1.6, Math.max(.6, ql * .085)), ce = slot.cues[1] ?? c0 + tType + .35;
      const cs = slot.cues[2] ?? Math.min(slot.t1 - 1.2, ce + .9 + n * .3 + (v === 'spotlight' ? .2 : .3));
      const ICONS = ['file', 'globe', 'folder', 'chart', 'book'];
      const back = v === 'spotlight' ? box(el('div', 'dim mk-abs', wrap), -area.x, -area.y, ctx.W, ctx.H) : null;
      const panel = el('div', 'pn mk-abs', wrap);
      const field = el('div', 'fd', panel, `<span class="si">${MK.icon('search', 40, 2.2)}</span><span class="q"></span>${v === 'bar' ? '<b class="go">搜索</b>' : v === 'spotlight' ? '<kbd>⏎</kbd>' : ''}`);
      const qEl = field.querySelector('.q'), go = field.querySelector('.go, kbd');
      const prog = v === 'results' ? el('i', 'pg', panel) : null;
      const meta = v === 'results' ? el('div', 'mt', panel, `找到约 ${MK.fmt(12800 + ql * 731)} 条结果（示意）`) : null;
      const tabs = v === 'results' ? el('div', 'tabs', panel, ['全部', '图片', '视频', '资讯'].map((s, i) => `<span${i ? '' : ' class="on"'}>${s}</span>`).join('')) : null;
      const box_ = el('div', 'ls', panel);
      const rows = its.map((it, i) => {
        const r = el('div', 'it', box_);
        if (v === 'results') r.innerHTML = `<div class="sk"><i></i><i></i><i></i></div><div class="ct"><div class="ur"><span class="fv mk-ui-g${i % 5}"></span>example.com › ${i + 1}</div><div class="ti">${markHits(it.text, q)}</div>${it.desc ? `<div class="ds">${markHits(it.desc, q)}</div>` : ''}</div><span class="best">最佳匹配</span>`;
        else r.innerHTML = `<span class="ii">${MK.icon(v === 'bar' ? 'search' : (it.icon || ICONS[i % 5]), 30, 2)}</span><div class="ct"><div class="ti">${markHits(it.text, q)}</div>${v === 'spotlight' && it.desc ? `<div class="ds">${markHits(it.desc, q)}</div>` : ''}</div>${v === 'bar' ? `<span class="ar">${MK.icon('arrow', 26, 2)}</span>` : `<kbd>⏎</kbd>`}`;
        return { r, ti: r.querySelector('.ti'), ds: r.querySelector('.ds'), ct: r.querySelector('.ct'), sk: r.querySelector('.sk'), best: r.querySelector('.best'), h: 0, y: 0 };
      });
      const skel = v === 'results' && !n ? [0, 1, 2].map(() => el('div', 'it', box_, '<div class="sk"><i></i><i></i><i></i></div>')) : [];
      const foot = v === 'spotlight' ? el('div', 'ft', panel, '<span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>⏎</kbd> 打开</span><span><kbd>esc</kbd> 关闭</span>') : null;
      const pwid = v === 'results' ? (P ? area.w : Math.min(area.w, 1060)) : v === 'spotlight' ? (P ? area.w : Math.min(area.w * .86, 900)) : (P ? area.w : Math.min(area.w * .9, 940));
      let uu = 30, fh = 80, listH = 0, py = 0;
      ctx.measure(() => {
        panel.style.width = pwid + 'px';
        uu = shrink(P ? 44 : 38, 13, u => {
          panel.style.fontSize = u + 'px';
          qEl.textContent = q; const okq = qEl.scrollWidth <= qEl.clientWidth + 1;
          rows.forEach(R => { R.r.style.display = ''; });
          return okq && rows.every(R => ok(R.ti, 1) && (!R.ds || ok(R.ds, v === 'results' ? 2 : 1))) && panel.offsetHeight <= area.h;
        }, '搜索');
        qEl.textContent = '';
        fh = field.offsetHeight + (tabs ? tabs.offsetHeight : 0);
        rows.forEach(R => { R.h = R.r.offsetHeight; R.y = R.r.offsetTop; });
        listH = box_.offsetHeight;
        const H = panel.offsetHeight;
        py = v === 'spotlight' ? Math.max(0, (area.h - H) * .3) : v === 'results' ? 0 : Math.max(0, Math.min(area.h * .22, area.h - H) * (P ? .5 : .8));
        Object.assign(panel.style, { left: ((area.w - pwid) / 2) + 'px', top: py + 'px' });
        box_.style.height = listH + 'px';
      });
      /* 光标在第几条（spotlight 方向键逐条下移；bar 停留时上下扫） */
      const steps = v === 'spotlight' ? Math.max(0, Math.min(n - 1, 2)) : 0;
      const stepAt = Array.from({ length: steps }, (_, i) => lerp(ce + .55 + n * .1, cs - .25, (i + 1) / (steps + 1)));
      S(slot.t0 + .05, v === 'spotlight' ? 'whoosh' : 'swoosh', .45); if (v === 'spotlight') S(slot.t0 + .25, 'pop', .4);
      S(c0, 'type', .45, 0, { d: tType });
      S(ce, 'key', .8); S(ce + .03, v === 'results' ? 'riser' : 'swipe', .3, 0, { d: .6 });
      rows.forEach((_, i) => S(ce + (v === 'results' ? .75 : .25) + i * .09, 'tick', .25, (i / Math.max(1, n) - .5) * .4));
      stepAt.forEach(s => S(s, 'key', .5));
      if (n) { S(cs, v === 'results' ? 'ding' : 'snap', .45, 0, { m: 93 }); if (v !== 'bar') flash(cs, .1); }
      return {
        update(t) {
          const out = leave(t, slot), k = pr(t, slot.t0, slot.t0 + .6);
          set(wrap, { o: 1 - out, blur: out * 10 });
          if (back) back.style.opacity = (EZ.out(k) * .55).toFixed(3);
          if (v === 'spotlight') tf(panel, { o: clamp(k * 3), s: .88 + .12 * EZ.spring(k), blur: (1 - EZ.out(k)) * 12, y: (1 - EZ.out5(k)) * -30 });
          else if (v === 'bar') { tf(panel, { o: clamp(k * 3), y: (1 - EZ.out5(k)) * 50 }); field.style.width = `${(40 + 60 * EZ.inout(pr(t, slot.t0 + .1, slot.t0 + .7))).toFixed(2)}%`; }
          else tf(panel, { o: clamp(k * 3), y: (1 - EZ.out5(k)) * -40 });
          /* 输入：回车前光标闪烁 */
          const m = Math.floor(clamp((t - c0) / tType) * ql + 1e-6), caret = t < ce + .8 ? Math.floor(t * 3.2) % 2 === 0 : false;
          html(qEl, (m ? esc([...q].slice(0, m).join('')) : `<span class="ph">${esc(p.placeholder || '搜索')}</span>`) + `<span class="mk-caret"${caret ? '' : ' style="opacity:0"'}>▍</span>`);
          if (m && t < ce) qEl.scrollLeft = 99999;
          const press = Math.sin(Math.PI * pr(t, ce - .05, ce + .15));
          if (go) set(go, { s: 1 - .12 * press });
          field.classList.toggle('on', t >= c0 - .2 && t < ce + .1);
          field.classList.toggle('hit', t >= ce && t < ce + .3);
          /* 列表展开 */
          const exp = EZ.out5(pr(t, ce + .05, ce + .6 + n * .06));
          box_.style.clipPath = v === 'results' ? '' : `inset(0 0 ${((1 - exp) * 100).toFixed(2)}% 0)`;
          if (v !== 'results') box_.style.height = (listH * exp).toFixed(1) + 'px';
          if (foot) set(foot, { o: pr(t, ce + .3, ce + .7) });
          if (prog) { const g = pr(t, ce, ce + .7); prog.style.width = (EZ.out(g) * 100).toFixed(1) + '%'; prog.style.opacity = (g < 1 ? 1 : 1 - pr(t, ce + .7, ce + .95)).toFixed(3); }
          if (meta) set(meta, { o: pr(t, ce + .7, ce + 1.0) });
          if (tabs) set(tabs, { o: pr(t, slot.t0 + .3, slot.t0 + .7) });
          let sel = -1;
          if (v === 'spotlight' && n) sel = t >= ce + .55 ? stepAt.filter(s => t >= s).length : -1;
          if (v === 'bar' && n && t > ce + .8) sel = t < cs ? 0 : Math.floor(idle(t, cs, 1).u / .9) % n;
          rows.forEach((R, i) => {
            const rk = pr(t, ce + (v === 'results' ? .75 : .25) + i * .09, ce + (v === 'results' ? 1.15 : .6) + i * .09);
            if (v === 'results') {
              set(R.r, { o: clamp(pr(t, ce + .05 + i * .06, ce + .3 + i * .06) * 3), y: (1 - EZ.out5(pr(t, ce + .05 + i * .06, ce + .45 + i * .06))) * 30 });
              R.sk.style.opacity = (1 - rk).toFixed(3); R.ct.style.opacity = rk.toFixed(3);
              R.sk.style.backgroundPosition = `${(-((t * 1.4) % 1) * 200).toFixed(1)}% 0`;
              set(R.best, { o: pr(t, cs, cs + .3), s: 1 + (1 - EZ.out5(pr(t, cs, cs + .35))) * .8 });
              R.r.classList.toggle('sel', i === 0 && t >= cs);
            } else {
              tf(R.r, { o: clamp(rk * 3), x: (1 - EZ.out5(rk)) * 40 });
              R.r.classList.toggle('sel', i === sel);
              if (v === 'spotlight' && i === sel && t >= cs) R.r.style.filter = `brightness(${(1 + .5 * (1 - pr(t, cs, cs + .4))).toFixed(3)})`;
            }
            R.r.style.setProperty('--mk', `${(EZ.inout(pr(t, ce + .5 + i * .1, ce + .9 + i * .1)) * 100).toFixed(1)}%`);
          });
          skel.forEach((s, i) => { set(s, { o: pr(t, ce + .05 + i * .06, ce + .3 + i * .06) }); s.firstChild.style.backgroundPosition = `${(-((t * 1.4) % 1) * 200).toFixed(1)}% 0`; });
          if (v === 'bar') field.style.boxShadow = t >= ce + .3 ? `0 20px 60px rgba(0,0,0,.5),0 0 ${(26 + 14 * idle(t, ce, 2.4).wave).toFixed(1)}px rgba(${T().a},.22)` : '';
        },
        bg(c, t) {
          const a = 1 - leave(t, slot), r = stageRect(ctx, go || field);
          MK.fx.ripple(c, t, ce, r.cx, r.cy, { r: 300, rings: 2, w: 3 * a });
          MK.fx.glow(c, area.x + area.w / 2, area.y + py + fh, pwid * .6, T().a, .4 * a * pr(t, slot.t0, slot.t0 + 1));
        },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .4 },
      };
    },
  });
  /* ---------- browser：浏览器 / 应用窗口 ----------
     与 0.2.0 media 的区别：完整浏览器外框 + 地址栏逐字输入 + 回车加载进度条 + 骨架屏 → 页面出现 + 页面向下滚动 + 1–3 个高亮框描线标注
     browser 桌面浏览器窗口透视转正 / phone 手机框升起，地址栏在顶部 / laptop 笔记本开盖后屏幕亮起
     停留：标注框轮流呼吸发光，页面缓慢继续滚动 */
  MK.control('browser', {
    variants: ['browser', 'phone', 'laptop'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, cl = p.callouts || [], url = plain(p.url || 'example.com'), ul = [...url].length;
      const wrap = box(el('div', 'mk-abs mk-brw ' + v, ctx.root), area.x, area.y, area.w, area.h);
      /* 外壳 → 屏幕区域（scr）里放浏览器界面 */
      let shell, scr, sw, sh, sx = 0, sy = 0, lid = null, base = null, d = null, hold = wrap, visH;
      if (v === 'phone') {
        const fw = P ? Math.min(area.w * .62, area.h > 900 ? area.h * .45 : area.h * .8) : Math.min(area.w * .5, area.h * .49), fh = fw * 2.05;
        hold = el('div', 'mk-abs', wrap); Object.assign(hold.style, { width: area.w + 'px', height: area.h + 'px' });
        if (fh > area.h) hold.style.webkitMaskImage = hold.style.maskImage = 'linear-gradient(180deg,#000 85%,transparent 99%)';
        const fx = (area.w - fw) / 2, fy = fh > area.h ? 0 : (area.h - fh) / 2;
        d = device(hold, fx, fy, fw, fh); shell = d.f; scr = el('div', 'ui', d.s); sw = d.sw; sh = d.sh - d.top; sx = fx; sy = fy;
        Object.assign(scr.style, { top: d.top + 'px', width: sw + 'px', height: sh + 'px' });
        visH = Math.min(sh, area.h - fy - d.top - fw * .03);
      } else if (v === 'laptop') {
        const w = Math.min(area.w / 1.14, (area.h - 10) / .7), h = w * .64, bez = w * .022;
        sx = (area.w - w) / 2; sy = (area.h - h - w * .055) / 2;
        shell = box(el('div', 'lap mk-abs', wrap), sx, sy, w, h + w * .055);
        lid = box(el('div', 'lid mk-abs', shell), 0, 0, w, h); lid.style.borderRadius = (w * .025) + 'px ' + (w * .025) + 'px 0 0';
        scr = box(el('div', 'ui mk-abs', lid), bez, bez, w - bez * 2, h - bez * 2.2); sw = w - bez * 2; sh = h - bez * 2.2;
        el('i', 'cam', lid).style.top = (bez * .3) + 'px';
        base = box(el('div', 'base mk-abs', shell), -w * .07, h, w * 1.14, w * .055);
        el('i', 'notch', base);
        visH = sh;
      } else {
        sw = P ? area.w : Math.min(area.w, area.h * 1.62); sh = Math.min(area.h, P ? sw * (area.h > 900 ? 1.15 : .76) : area.h); sx = (area.w - sw) / 2; sy = (area.h - sh) / 2;
        shell = scr = box(el('div', 'win ui mk-abs', wrap), sx, sy, sw, sh);
        visH = sh;
      }
      const u = Math.round(clamp(sw / (v === 'phone' ? 17 : 40), 13, v === 'phone' ? 34 : 30));
      scr.style.fontSize = u + 'px';
      const chrome = el('div', 'ch', scr);
      if (v !== 'phone') el('div', 'tabs', chrome, `<span class="dots"><i></i><i></i><i></i></span><span class="tab"><i class="fv"></i><span class="tt">${esc(p.title || url)}</span><b>${MK.icon('x', 14, 2.4)}</b></span><span class="nt">${MK.icon('plus', 16, 2.4)}</span>`);
      const nav = el('div', 'nav', chrome, `${v !== 'phone' ? `<span class="nb">${MK.icon('arrow', 20, 2.2)}</span><span class="nb f">${MK.icon('arrow', 20, 2.2)}</span><span class="nb rl">${MK.icon('cycle', 18, 2.2)}</span>` : ''}<div class="ad"><span class="lk">${MK.icon('lock', 16, 2.4)}</span><span class="u"></span></div>${v === 'phone' ? `<span class="nb">${MK.icon('cycle', 18, 2.2)}</span>` : ''}`);
      const adr = nav.querySelector('.ad'), uEl = nav.querySelector('.u'), rl = nav.querySelector('.rl, .nb:last-child'), tt = chrome.querySelector('.tt');
      const bar = el('i', 'pg', chrome);
      const body = el('div', 'bd', scr), page = el('div', 'pgc', body);
      let im = null;
      if (p.src) { im = el('img', '', page); ctx.mediaOf(im, p, 'src'); } else el('div', 'ph', page, `${MK.icon('image', 56, 1.6)}<span>网页截图</span>`);
      const skel = el('div', 'sk', body, '<i></i><i></i><i></i><i></i><i></i>');
      const ink = svg(body, 10, 10);
      const marks = cl.map((c, i) => {
        const chip = el('div', 'mk-chip mk-abs cl', body, `<b>${i + 1}</b>${esc(c.text)}`);
        return { c, chip, path: null, rect: null };
      });
      let bodyH = 300, scrollY = 0, chipW = [];
      ctx.measure(() => {
        fit(uEl.parentNode ? (uEl.textContent = url, uEl) : uEl, u * .82, 8, adr.clientWidth - u * 1.6, null); uEl.textContent = '';
        if (tt) { const tab = tt.parentNode; tab.style.width = Math.min(sw - u * 5.5, u * 14) + 'px'; tt.textContent = plain(p.title || url); fit(tt, Math.round(u * .62), 8, tab.clientWidth - u * 2.2, null); }
        const chH = chrome.offsetHeight;
        bodyH = sh - chH;
        Object.assign(body.style, { top: chH + 'px', height: bodyH + 'px' });
        const vb = Math.min(bodyH, visH - chH);
        /* 页面比视口高 35%，滚动后停在底部 */
        const pageH = Math.max(bodyH * 1.35, im && im.naturalWidth ? sw * im.naturalHeight / im.naturalWidth : 0);
        page.style.height = pageH + 'px'; scrollY = Math.min(pageH - bodyH, bodyH * .35);
        ink.setAttribute('width', sw); ink.setAttribute('height', bodyH); ink.setAttribute('viewBox', `0 0 ${sw} ${bodyH}`);
        marks.forEach((m, i) => {
          const x = clamp(m.c.x ?? .1 + i * .3, 0, 1) * sw, y = clamp(m.c.y ?? .3, 0, 1) * vb, w = clamp(m.c.w ?? .25, .05, 1) * sw, h = clamp(m.c.h ?? .2, .05, 1) * vb;
          const X = Math.min(x, sw - w - 4), Y = Math.min(y, vb - h - 4);
          m.rect = { x: Math.max(4, X), y: Math.max(4, Y), w, h };
          m.chip.style.fontSize = Math.round(u * (v === 'phone' ? .62 : .8)) + 'px';
          fit(m.chip, parseFloat(m.chip.style.fontSize), 10, sw * .9, null);
          m.chip.style.width = '';
          const cw = m.chip.offsetWidth, chh = m.chip.offsetHeight;
          const below = m.rect.y + m.rect.h + chh + 12 < vb, cx_ = clamp(m.rect.x + m.rect.w / 2 - cw / 2, 6, sw - cw - 6);
          Object.assign(m.chip.style, { left: cx_ + 'px', top: (below ? m.rect.y + m.rect.h + 10 : Math.max(4, m.rect.y - chh - 10)) + 'px' });
        });
        ink.innerHTML = marks.map(m => `<rect x="${m.rect.x}" y="${m.rect.y}" width="${m.rect.w}" height="${m.rect.h}" rx="${u * .4}"/>`).join('');
        marks.forEach((m, i) => { m.path = ink.children[i]; });
      });
      const c0 = slot.cues[0] ?? slot.t0 + .75;
      const tType = Math.min(1.2, Math.max(.45, ul * .045)), ce = c0 + tType + .2;
      const cs = slot.cues[1] ?? ce + 1.05;
      const auto = stagger(marks.length, cs + 1.1, Math.min(.7, Math.max(.35, (slot.t1 - cs - 2.4) / Math.max(1, marks.length))));
      const at = marks.map((_, i) => slot.cues[i + 2] ?? auto[i]);
      if (v === 'laptop') { S(slot.t0 + .05, 'whoosh', .4); S(slot.t0 + .55, 'thud', .35); S(slot.t0 + .7, 'chime', .25); }
      else if (v === 'phone') { S(slot.t0 + .05, 'whoosh', .5); S(slot.t0 + .5, 'card', .35); }
      else { S(slot.t0 + .05, 'whoosh', .5); S(slot.t0 + .45, 'card', .4); }
      S(c0, 'type', .4, 0, { d: tType }); S(ce, 'key', .7); S(ce + .05, 'fill', .25, 0, { d: .7 }); S(ce + .8, 'pop', .3);
      S(cs, 'swoosh', .4, 0); S(cs + .1, 'counter', .15, 0, { d: .6 });
      at.forEach((c, i) => { S(c, 'marker', .5, (i - 1) * .3); S(c + .35, 'pop', .35); });
      const tIdle = Math.max(cs + 1.2, ...at.map(c => c + .8));
      return {
        update(t) {
          const out = leave(t, slot), k = pr(t, slot.t0, slot.t0 + .75), E = EZ.out5(k);
          set(wrap, { o: 1 - out, blur: out * 10, y: -EZ.in(out) * 16 });
          let on = 1;
          if (v === 'laptop') {
            tf(shell, { o: clamp(k * 4), y: (1 - E) * 80, s: .9 + .1 * EZ.out(k) });
            const lk = pr(t, slot.t0 + .25, slot.t0 + 1);
            lid.style.transformOrigin = '50% 100%';
            tf(lid, { p: 1600, rx: lerp(-92, 0, EZ.back(lk)) });
            on = EZ.out(pr(t, slot.t0 + .75, slot.t0 + 1.1));
            scr.style.filter = `brightness(${(.15 + .85 * on).toFixed(3)})`;
          } else if (v === 'phone') {
            tf(d.f, { p: 1500, o: clamp(k * 3), y: (1 - E) * 200 + Math.sin(t * .8) * 3, rx: (1 - E) * 26, r: (1 - E) * -6 });
          } else {
            tf(shell, { p: 1600, o: clamp(k * 3), ry: (1 - E) * -26 + Math.sin(t * .4) * .8, rx: (1 - E) * 10, s: .86 + .14 * EZ.back(k), y: (1 - E) * 40 });
          }
          /* 地址栏输入 */
          const m = Math.floor(clamp((t - c0) / tType) * ul + 1e-6), caret = t >= c0 - .3 && t < ce + .2 && Math.floor(t * 3.2) % 2 === 0;
          html(uEl, esc([...url].slice(0, m).join('')) + `<span class="mk-caret"${caret ? '' : ' style="opacity:0"'}>▍</span>`);
          adr.classList.toggle('on', t >= c0 - .3 && t < ce + .15);
          if (rl) rl.style.transform = `rotate(${(EZ.inout(pr(t, ce, ce + .8)) * 360).toFixed(1)}deg)`;
          const g = pr(t, ce, ce + .8);
          bar.style.width = (EZ.out(g) * 100).toFixed(1) + '%'; bar.style.opacity = (g > 0 ? 1 - pr(t, ce + .8, ce + 1) : 0).toFixed(3);
          /* 骨架屏 → 页面 */
          const show = pr(t, ce + .45, ce + .9);
          skel.style.opacity = (clamp(pr(t, ce, ce + .15) * 3) * (1 - show)).toFixed(3);
          skel.style.backgroundPosition = `${(-((t * 1.4) % 1) * 200).toFixed(1)}% 0`;
          page.style.opacity = show.toFixed(3);
          if (im) ctx.frameAt(im, p, t, 'src');
          const sc = EZ.inout(pr(t, cs, cs + .9)) * scrollY + (t > tIdle ? Math.min(scrollY * .08, (t - tIdle) * 4) : 0);
          page.style.transform = `translateY(${(-sc).toFixed(2)}px) scale(${(1.03 - .03 * EZ.out(show)).toFixed(4)})`;
          const turn = t > tIdle && marks.length ? Math.floor(idle(t, tIdle, 1.6).u / 1.6) % marks.length : -1;
          marks.forEach((mk, i) => {
            const a = pr(t, at[i], at[i] + .5);
            draw(mk.path, EZ.inout(a));
            mk.path.style.strokeWidth = (3 + (turn === i ? 2 * Math.abs(Math.sin(t * 3)) : 0)).toFixed(2);
            mk.path.style.fill = `rgba(${T().w},${(.1 * EZ.out(pr(t, at[i] + .3, at[i] + .6)) + (turn === i ? .06 : 0)).toFixed(3)})`;
            const q = pr(t, at[i] + .3, at[i] + .65);
            set(mk.chip, { o: clamp(q * 3), s: .6 + .4 * EZ.spring(q), y: (1 - EZ.out(q)) * 10 });
          });
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          MK.fx.glow(c, area.x + area.w / 2, area.y + area.h * .45, Math.max(sw, sh) * .75, T().a, .5 * a * pr(t, slot.t0 + .3, slot.t0 + 1.3));
        },
        fg(c, t) {
          marks.forEach((mk, i) => {
            if (t < at[i] || t > at[i] + 1) return;
            const r = stageRect(ctx, mk.chip);
            T().paint.burst(c, t, at[i] + .45, r.cx, r.cy, { n: 14, sp: 360, life: .5, col: T().w, seed: i });
          });
        },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .45 },
      };
    },
  });

  /* ---------- social：社交数据卡 ----------
     post    帖子卡翻起，配图遮罩展开；点赞：图上爱心爆开 + 按钮变红 + 三个数字机械滚动上涨；停留时爱心持续飘起
     profile 个人主页：封面横幅 + 头像弹出 + 简介；按下「关注」变「已关注」，粉丝数大字滚动上涨、+N 气泡飘起
     stats   三个指标并排：图标弹出，大数字依次滚动、迷你折线描出；停留时三块轮流扫光 */
  MK.control('social', {
    variants: ['post', 'profile', 'stats'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait;
      const wrap = box(el('div', 'mk-abs mk-soc ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const L = p.likes || 0, C = p.comments || 0, Sh = p.shares || 0, F = p.followers ?? L;
      const c0 = slot.cues[0] ?? slot.t0 + .2, c1 = slot.cues[1] ?? c0 + (v === 'post' ? 1.5 : 1.2);
      const roll = (x, from, to) => lerp(from, to, EZ.out(clamp(x)));
      const head = (parent, size) => {
        const h = el('div', 'uh', parent);
        const av = avatar(h, ctx, p, 'avatar', p.user, size); av.style.position = 'relative';
        el('div', 'un', h, `<b>${esc(p.user)}</b><span>${esc(p.time || '刚刚')} · 示意</span>`);
        return { h, av };
      };
      if (v === 'post') {
        const cw = P ? area.w * (area.h > 900 ? 1 : .92) : Math.min(area.w * .62, 640), card = el('div', 'card mk-abs', wrap);
        const { av } = head(card, '2.1em');
        const tx = p.text ? el('div', 'tx', card, rich(p.text)) : null;
        const media = p.src ? el('div', 'md', card) : null;
        let im = null; if (media) { im = el('img', '', media); ctx.mediaOf(im, p, 'src'); }
        const bigH = media ? el('div', 'bh', media, MK.icon('heart', 160, 1.5)) : null;
        const acts = el('div', 'ac', card);
        const mk = (ic, val, cls) => { const b = el('div', 'a ' + cls, acts, `<span class="ic">${MK.icon(ic, 30, 2.2)}</span>`); const o = odometer(b, val); return { b, o, ic: b.firstChild }; };
        const A = [mk('heart', L, 'lk'), mk('chat', C, 'cm'), mk('share', Sh, 'sh')];
        let uu = 30, mh = 0;
        ctx.measure(() => {
          card.style.width = cw + 'px';
          uu = shrink(P ? 42 : 30, 13, u => {
            card.style.fontSize = u + 'px';
            if (media) { mh = Math.min(cw * .56, area.h * .52); media.style.height = mh + 'px'; }
            return card.offsetHeight <= area.h && (!tx || ok(tx, media ? 2 : 4));
          }, '帖子卡');
          Object.assign(card.style, { left: ((area.w - cw) / 2) + 'px', top: ((area.h - card.offsetHeight) / 2) + 'px' });
        });
        S(c0, 'whoosh', .45); S(c0 + .35, 'card', .4);
        S(c1, 'pop', .6); S(c1 + .03, 'heartbeat', .55); punch(c1, .03);
        S(c1 + .15, 'counter', .3, 0, { d: 1.1 }); S(c1 + 1.3, 'coin', .3);
        const lr = rnd(3, 9);
        return {
          update(t) {
            const out = leave(t, slot), k = pr(t, c0, c0 + .7);
            set(wrap, { o: 1 - out, blur: out * 10 });
            card.style.transformOrigin = '50% 100%';
            tf(card, { p: 1300, o: clamp(k * 3), rx: (1 - EZ.back(k)) * 40, y: (1 - EZ.out5(k)) * 90, s: .92 + .08 * EZ.out(k) });
            set(av, { s: .3 + .7 * EZ.spring(pr(t, c0 + .2, c0 + .7)), o: pr(t, c0 + .2, c0 + .35) });
            avFrame(ctx, av, t);
            if (tx) set(tx, { o: pr(t, c0 + .3, c0 + .7), y: (1 - EZ.expo(pr(t, c0 + .3, c0 + .8))) * 14 });
            if (media) {
              const r = EZ.inout(pr(t, c0 + .35, c0 + 1));
              media.style.clipPath = `inset(0 0 ${((1 - r) * 100).toFixed(2)}% 0 round ${(uu * .5).toFixed(1)}px)`;
              ctx.frameAt(im, p, t, 'src');
              im.style.transform = `scale(${(1.15 - .1 * r + .03 * Math.sin((t - c0) * .3)).toFixed(4)})`;
              const hk = pr(t, c1, c1 + .3), hz = pr(t, c1 + .55, c1 + .85);
              set(bigH, { o: clamp(hk * 4) * (1 - hz), s: (.3 + .9 * EZ.spring(hk)) * (1 + .5 * EZ.in(hz)), y: -EZ.in(hz) * 40 });
            }
            const rk = pr(t, c1 + .15, c1 + 1.3);
            A.forEach((a, i) => { a.o._set(roll(pr(t, c1 + .15 + i * .1, c1 + 1.3 + i * .1), [L, C, Sh][i] * (.62 + .1 * lr), [L, C, Sh][i])); set(a.b, { o: pr(t, c0 + .5 + i * .06, c0 + .8 + i * .06) }); });
            A[0].b.classList.toggle('on', t >= c1);
            const beat = t > c1 + 1.5 ? Math.max(0, Math.sin((t - c1) * 6)) * .1 : 0;
            set(A[0].ic, { s: 1 + .6 * Math.sin(Math.PI * pr(t, c1, c1 + .35)) + beat });
          },
          fg(c, t) {
            const r = stageRect(ctx, media || A[0].b), a0 = stageRect(ctx, A[0].ic), a = 1 - leave(t, slot);
            T().paint.burst(c, t, c1, r.cx, r.cy, { n: 40, sp: 900, col: T().r, life: .8 });
            T().paint.burst(c, t, c1 + .02, a0.cx, a0.cy, { n: 14, sp: 300, col: T().r, life: .5, seed: 2 });
            /* 停留：爱心从点赞按钮持续飘起 */
            if (t > c1 + .6) for (let i = 0; i < 9; i++) {
              const life = 2.2, lt = ((t - c1 - .6 - i * .37) % (life * 1.2) + life * 1.2) % (life * 1.2); if (t - c1 - .6 < i * .37 || lt > life) continue;
              const q = lt / life, x = a0.cx + Math.sin(lt * 3 + i) * 26 * q + (rnd(i, 5) - .5) * 30, y = a0.cy - 20 - q * (area.h * .45), sz = (14 + 12 * rnd(i, 6)) * (q < .15 ? q / .15 : 1);
              c.save(); c.globalAlpha = (1 - q) * .85 * a; c.fillStyle = `rgb(${i % 3 ? T().r : T().w})`; c.translate(x, y); c.scale(sz / 24, sz / 24);
              c.beginPath(); c.moveTo(0, 8); c.bezierCurveTo(-14, -2, -8, -14, 0, -6); c.bezierCurveTo(8, -14, 14, -2, 0, 8); c.fill(); c.restore();
            }
          },
          bg(c, t) { MK.fx.glow(c, area.x + area.w / 2, area.y + area.h * .45, cw * .9, T().r, .3 * (1 - leave(t, slot)) * pr(t, c1, c1 + .4)); },
          hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .45 },
        };
      }
      if (v === 'profile') {
        const cw = P ? area.w : Math.min(area.w, 900), card = el('div', 'card mk-abs', wrap);
        const cover = el('div', 'cv', card); let im = null;
        if (p.src) { im = el('img', '', cover); ctx.mediaOf(im, p, 'src'); }
        const av = avatar(card, ctx, p, 'avatar', p.user, '3.6em', 'big');
        const btn = el('div', 'fb', card, `<span class="a">${MK.icon('plus', 22, 2.6)}关注</span><span class="b">${MK.icon('check', 22, 2.6)}已关注</span>`);
        const nm = el('div', 'nm', card, `<b>${esc(p.user)}</b>`);
        const bio = p.text ? el('div', 'bio', card, rich(p.text)) : null;
        const row = el('div', 'st', card);
        const stat = (val, lab, big) => { const b = el('div', 'sv' + (big ? ' big' : ''), row); const o = odometer(b, val); el('span', 'lb', b, lab); return { b, o }; };
        const sF = stat(F, '粉丝', true), sL = stat(L, '获赞');
        const plus = [0, 1, 2, 3, 4].map(i => el('div', 'pl mk-abs', card, `+${compact(Math.max(1, Math.round(F * (.02 + .015 * i))))}`));
        let uu = 28;
        ctx.measure(() => {
          card.style.width = cw + 'px';
          uu = shrink(P ? 40 : 30, 12, u => {
            card.style.fontSize = u + 'px';
            sF.o._set(F); sL.o._set(L);
            const okk = card.offsetHeight <= area.h && nm.scrollWidth <= nm.clientWidth + 1 && (!bio || ok(bio, 2)) && row.scrollWidth <= row.clientWidth + 1;
            return okk;
          }, '主页卡');
          Object.assign(card.style, { left: ((area.w - cw) / 2) + 'px', top: ((area.h - card.offsetHeight) / 2) + 'px' });
          const fr = rel(sF.o, card);
          plus.forEach((e, i) => Object.assign(e.style, { left: (fr.x + fr.w * (.2 + .25 * (i % 3))) + 'px', top: (fr.y - uu * .6) + 'px' }));
        });
        S(c0, 'whoosh', .45); S(c0 + .45, 'pop', .45);
        S(c1, 'tick', .6); S(c1 + .05, 'snap', .45); S(c1 + .12, 'ding', .35, 0, { m: 91 }); S(c1 + .2, 'counter', .35, 0, { d: 1.3 }); S(c1 + 1.5, 'tada', .35);
        plus.forEach((_, i) => S(c1 + .3 + i * .22, 'blip', .2, (i - 2) * .2, { n: i + 3 }));
        flash(c1 + 1.5, .12);
        return {
          update(t) {
            const out = leave(t, slot), k = pr(t, c0, c0 + .7);
            set(wrap, { o: 1 - out, blur: out * 10 });
            tf(card, { o: clamp(k * 3), y: (1 - EZ.out5(k)) * 60, s: .94 + .06 * EZ.back(k) });
            cover.style.clipPath = `inset(0 ${((1 - EZ.inout(pr(t, c0 + .1, c0 + .7))) * 100).toFixed(2)}% 0 0)`;
            if (im) { ctx.frameAt(im, p, t, 'src'); im.style.transform = `scale(${(1.12 - .06 * EZ.out(pr(t, c0, slot.t1))).toFixed(4)})`; }
            const ak = pr(t, c0 + .35, c0 + .85);
            set(av, { o: clamp(ak * 4), s: .2 + .8 * EZ.spring(ak) }); avFrame(ctx, av, t);
            [nm, bio, row].forEach((e, i) => { if (e) set(e, { o: pr(t, c0 + .5 + i * .1, c0 + .85 + i * .1), x: (1 - EZ.expo(pr(t, c0 + .5 + i * .1, c0 + 1 + i * .1))) * -24 }); });
            const press = Math.sin(Math.PI * pr(t, c1 - .05, c1 + .2)), bk = pr(t, c0 + .7, c0 + 1);
            set(btn, { o: bk, s: (1 - .1 * press) * (1 + .04 * (t > c1 + 1.8 ? idle(t, c1 + 1.8, 2).wave : 0)) });
            btn.classList.toggle('on', t >= c1 + .05);
            sF.o._set(roll(pr(t, c1 + .2, c1 + 1.5), F * .58, F)); sL.o._set(roll(pr(t, c1 + .4, c1 + 1.5), L * .8, L));
            sF.b.classList.toggle('lit', t >= c1 + .2);
            plus.forEach((e, i) => { const q = pr(t, c1 + .3 + i * .22, c1 + 1.3 + i * .22); set(e, { o: Math.sin(Math.PI * q), y: -q * uu * 2.4, x: Math.sin(q * 6 + i) * 6, s: .7 + .3 * EZ.back(clamp(q * 3)) }); });
          },
          fg(c, t) { const r = stageRect(ctx, btn); T().paint.burst(c, t, c1 + .05, r.cx, r.cy, { n: 24, sp: 500, life: .6 }); const f = stageRect(ctx, sF.b); MK.fx.confetti(c, t, c1 + 1.5, f.cx, f.cy, { n: 40, sp: 900, life: 1.8 }); },
          bg(c, t) { MK.fx.glow(c, area.x + area.w / 2, area.y + area.h * .45, cw * .7, T().a, .4 * (1 - leave(t, slot)) * pr(t, c0, c0 + 1)); },
          hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .45 },
        };
      }
      /* stats */
      const top = el('div', 'tp mk-abs', wrap); const { av } = head(top, '1.9em');
      const cap = p.text ? el('div', 'cap', top, rich(p.text)) : null;
      const defs = [['heart', '点赞', L, T().r], ['chat', '评论', C, T().a], ['share', '转发', Sh, T().g]];
      const tiles = defs.map(([ic, lab, val], i) => {
        const e = el('div', 'tl mk-abs', wrap, `<span class="ic c${i}">${MK.icon(ic, 40, 2.2)}</span><span class="lb">${lab}</span>`);
        const o = odometer(e, val, 'big');
        const sp = svg(e, 10, 10, '', 'spk');
        const pts = Array.from({ length: 9 }, (_, j) => .15 + .7 * (j / 8) * (.55 + .45 * rnd(j, 20 + i)) + (rnd(j, 30 + i) - .5) * .12);
        el('i', 'sh', e);
        return { e, o, sp, pts, val, ic: e.querySelector('.ic'), path: null };
      });
      let tw = 300, th = 300;
      ctx.measure(() => {
        const cols = P ? 1 : 3, g = P ? 16 : 22;
        shrink(P ? 40 : 30, 12, u => {
          wrap.style.fontSize = u + 'px';
          top.style.width = area.w + 'px';
          const hh = top.offsetHeight + u;
          tw = cols === 3 ? (area.w - g * 2) / 3 : area.w; th = cols === 3 ? Math.min(area.h - hh, tw * 1.05) : (area.h - hh - g * 2) / 3;
          tiles.forEach((T_, i) => { T_.o._set(T_.val); Object.assign(T_.e.style, { width: tw + 'px', height: th + 'px', left: (cols === 3 ? i * (tw + g) : 0) + 'px', top: (hh + (cols === 3 ? 0 : i * (th + g))) + 'px' }); });
          const lim = cols === 3 ? tw * .86 : tw * .5;
          return tiles.every(T_ => T_.o.offsetWidth <= lim && T_.e.scrollHeight <= th + 1) && (!cap || ok(cap, 1)) && th > u * 3.2;
        }, '指标卡');
        tiles.forEach((T_, i) => {
          const W_ = cols === 3 ? tw * .86 : tw * .38, H_ = cols === 3 ? th * .22 : th * .5;
          T_.sp.setAttribute('width', W_); T_.sp.setAttribute('height', H_); T_.sp.setAttribute('viewBox', `0 0 ${W_} ${H_}`);
          Object.assign(T_.sp.style, cols === 3 ? { left: (tw * .07) + 'px', top: (th - H_ - th * .08) + 'px' } : { left: (tw * .56) + 'px', top: ((th - H_) / 2) + 'px' });
          const d = T_.pts.map((y, j) => `${j ? 'L' : 'M'}${(j / 8 * W_).toFixed(1)} ${((1 - y) * H_).toFixed(1)}`).join(' ');
          T_.sp.innerHTML = `<path class="ar" d="${d} L${W_} ${H_} L0 ${H_} Z"/><path class="ln" d="${d}"/><circle r="5" cx="${W_}" cy="${((1 - T_.pts[8]) * H_).toFixed(1)}"/>`;
          T_.path = T_.sp.querySelector('.ln'); T_.area = T_.sp.querySelector('.ar'); T_.dot = T_.sp.querySelector('circle');
        });
      });
      const at = tiles.map((_, i) => slot.cues[i + 1] ?? c1 + i * .35);
      S(c0, 'swoosh', .4); tiles.forEach((_, i) => S(c0 + .25 + i * .1, 'pop', .35, (i - 1) * .4));
      at.forEach((c, i) => { S(c, 'counter', .3, (i - 1) * .4, { d: .9 }); S(c + .95, 'coin', .3, (i - 1) * .4); });
      const tIdle = at[2] + 1.2;
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          set(top, { o: pr(t, c0, c0 + .4), y: (1 - EZ.expo(pr(t, c0, c0 + .6))) * -20 });
          set(av, { s: .3 + .7 * EZ.spring(pr(t, c0, c0 + .5)) }); avFrame(ctx, av, t);
          const turn = t > tIdle ? Math.floor(idle(t, tIdle, 1.4).u / 1.4) % 3 : -1;
          tiles.forEach((T_, i) => {
            const k = pr(t, c0 + .2 + i * .1, c0 + .8 + i * .1);
            T_.e.style.transformOrigin = '50% 100%';
            tf(T_.e, { p: 1200, o: clamp(k * 3), rx: (1 - EZ.back(k)) * 60, y: (1 - EZ.out5(k)) * 50 });
            set(T_.ic, { s: .3 + .7 * EZ.spring(pr(t, c0 + .4 + i * .1, c0 + .9 + i * .1)), r: (1 - EZ.out(pr(t, c0 + .4 + i * .1, c0 + .9 + i * .1))) * -40 });
            const q = pr(t, at[i], at[i] + .95);
            T_.o._set(roll(q, 0, T_.val));
            draw(T_.path, EZ.inout(q)); T_.area.style.opacity = (EZ.out(pr(t, at[i] + .5, at[i] + 1.1)) * .9).toFixed(3);
            set(T_.dot, { o: pr(t, at[i] + .85, at[i] + 1), s: 1 + .5 * Math.max(0, Math.sin((t - at[i]) * 4)) });
            T_.e.style.transformBox = 'fill-box';
            T_.e.classList.toggle('lit', (t >= at[i] + .95 && t < at[i] + 1.4) || turn === i);
            T_.e.lastChild.style.transform = `translateX(${lerp(-120, 520, turn === i ? idle(t, tIdle, 1.4).sweep : pr(t, at[i] + .9, at[i] + 1.5)).toFixed(1)}%) skewX(-18deg)`;
          });
        },
        fg(c, t) { tiles.forEach((T_, i) => { const r = stageRect(ctx, T_.o); T().paint.burst(c, t, at[i] + .95, r.cx, r.cy, { n: 16, sp: 380, life: .55, col: defs[i][3], seed: i }); }); },
        bg(c, t) { MK.fx.glow(c, area.x + area.w / 2, area.y + area.h * .55, area.w * .55, T().a, .35 * (1 - leave(t, slot)) * pr(t, c0, c0 + 1)); },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- cursor：鼠标点击演示 ----------
     click 一排按钮（竖屏一列），鼠标沿弧线依次移到每个按钮：悬停高亮 → 按下 → 波纹 → 按钮打勾
     drag  左侧几张卡片，鼠标依次抓起卡片拖进右侧（竖屏下方）的放置区，放置区计数跳动
     menu  鼠标点开下拉菜单，沿菜单项逐个悬停，点中 pick 项：打勾、菜单收起、按钮文字换成选中项
     可选 src：截图作为背景窗口（压暗），控件浮在其上。停留：鼠标轻微晃动、选中项呼吸发光 */
  MK.control('cursor', {
    variants: ['click', 'drag', 'menu'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, its = p.items, n = its.length;
      const wrap = box(el('div', 'mk-abs mk-cur ' + v, ctx.root), area.x, area.y, area.w, area.h);
      let bgWin = null, bgIm = null;
      if (p.src) {
        bgWin = box(el('div', 'bgw mk-abs', wrap, '<div class="tb"><i></i><i></i><i></i></div><div class="bd"></div>'), 0, 0, area.w, area.h);
        bgIm = el('img', '', bgWin.lastChild); ctx.mediaOf(bgIm, p, 'src');
      }
      const lay = el('div', 'ly mk-abs', wrap); Object.assign(lay.style, { width: area.w + 'px', height: area.h + 'px' });
      const ptr = pointer(wrap, 44);
      const ICONS = ['play', 'image', 'music', 'share'];
      const pick = clamp((p.pick || n) - 1, 0, n - 1);
      let els = [], zone = null, zc = null, trig = null, menu = null, tlab = null, uu = 30;
      if (v === 'click') {
        els = its.map((it, i) => el('div', 'bt mk-abs' + (i === n - 1 ? ' pri' : ''), lay, `<span class="ic">${MK.icon(it.icon || ICONS[i % 4], 30, 2.2)}</span><span class="lb">${esc(it.label)}</span><span class="ok">${MK.icon('check', 26, 3)}</span>`));
        if (p.title) el('div', 'ttl mk-abs', lay, esc(p.title));
      } else if (v === 'drag') {
        els = its.map((it, i) => el('div', 'cd mk-abs', lay, `<span class="gr">${'<i></i>'.repeat(6)}</span><span class="ic mk-ui-g${i % 5}">${MK.icon(it.icon || 'file', 28, 2.2)}</span><span class="lb">${esc(it.label)}</span>`));
        zone = el('div', 'zn mk-abs', lay, `<span class="zi">${MK.icon('folder', 56, 1.8)}</span><span class="zl">${esc(p.title || '拖到这里')}</span><b class="zc"></b>`);
        zc = zone.querySelector('.zc');
      } else {
        trig = el('div', 'tg mk-abs', lay, `<span class="tl"></span><span class="cv">${MK.icon('arrow', 22, 2.4)}</span>`);
        tlab = trig.firstChild;
        menu = el('div', 'mn mk-abs', lay);
        els = its.map((it, i) => el('div', 'mi', menu, `<span class="ic">${MK.icon(it.icon || ICONS[i % 4], 26, 2.2)}</span><span class="lb">${esc(it.label)}</span><span class="ok">${MK.icon('check', 24, 3)}</span>`));
      }
      const R = [];   /* 每个元素（相对 wrap）的矩形 */
      let zr = null, tr = null, mr = null, dropAt = [];
      ctx.measure(() => {
        if (bgWin) bgWin.lastChild.style.height = (area.h - bgWin.firstChild.offsetHeight) + 'px';
        if (v === 'click') {
          const cols = P ? 1 : Math.min(n, n === 4 ? 2 : n), rows = Math.ceil(n / cols), g = P ? 26 : 30;
          const bw = P ? Math.min(area.w * .82, 640) : Math.min(380, (area.w * .86 - g * (cols - 1)) / cols);
          uu = shrink(P ? 44 : 36, 12, u => { lay.style.fontSize = u + 'px'; els.forEach(e => { e.style.width = bw + 'px'; }); return els.every(e => { const l = e.querySelector('.lb'); return l.scrollWidth <= l.clientWidth + 1; }) && (els[0].offsetHeight + g) * rows < area.h * .8; }, '按钮');
          const bh = els[0].offsetHeight, tw_ = cols * bw + (cols - 1) * g, th_ = rows * bh + (rows - 1) * g;
          const ttl = lay.querySelector('.ttl'), tH = ttl ? (fit(ttl, Math.round(uu * 1.1), 12, area.w * .9, null), ttl.offsetHeight + uu) : 0;
          const x0 = (area.w - tw_) / 2, y0 = (area.h - th_ - tH) * (P ? .35 : .5) + tH;
          if (ttl) Object.assign(ttl.style, { left: '0', width: area.w + 'px', top: (y0 - tH) + 'px', textAlign: 'center' });
          els.forEach((e, i) => { const c = i % cols, r = Math.floor(i / cols), x = x0 + c * (bw + g), y = y0 + r * (bh + g); Object.assign(e.style, { left: x + 'px', top: y + 'px' }); R.push({ x, y, w: bw, h: bh }); });
        } else if (v === 'drag') {
          const g = P ? 18 : 18;
          const cw = P ? area.w * .44 : Math.min(area.w * .38, 400);
          uu = shrink(P ? 40 : 32, 12, u => {
            lay.style.fontSize = u + 'px'; els.forEach(e => { e.style.width = cw + 'px'; });
            const ch = els[0].offsetHeight;
            return els.every(e => { const l = e.querySelector('.lb'); return l.scrollWidth <= l.clientWidth + 1; }) && (P ? (ch + g) * n + u * 7 < area.h : (ch + g) * n < area.h * .9);
          }, '卡片');
          const ch = els[0].offsetHeight, colH = n * ch + (n - 1) * g;
          if (!P) {
            const zw = Math.min(area.w * .42, 460), zh = Math.max(colH, Math.min(area.h * .8, zw * .9)), gap = Math.min(area.w * .16, 200), tot = cw + gap + zw, x0 = (area.w - tot) / 2;
            els.forEach((e, i) => { const y = (area.h - colH) / 2 + i * (ch + g); Object.assign(e.style, { left: x0 + 'px', top: y + 'px' }); R.push({ x: x0, y, w: cw, h: ch }); });
            zr = { x: x0 + cw + gap, y: (area.h - zh) / 2, w: zw, h: zh };
          } else {
            const zh = Math.max(uu * 5.5, area.h - colH - uu * 3), y0 = (area.h - colH - zh - uu * 1.5) / 2;
            els.forEach((e, i) => { const x = (area.w - cw) / 2, y = y0 + i * (ch + g); Object.assign(e.style, { left: x + 'px', top: y + 'px' }); R.push({ x, y, w: cw, h: ch }); });
            zr = { x: 0, y: y0 + colH + uu * 1.5, w: area.w, h: zh };
          }
          box(zone, zr.x, zr.y, zr.w, zr.h);
          fit(zone.querySelector('.zl'), Math.round(uu * .8), 10, zr.w * .8, null);
          /* 放进去后的落点：在放置区里错开叠放 */
          dropAt = R.map((r, i) => ({ x: zr.x + (zr.w - r.w * .8) / 2 + (i - (n - 1) / 2) * uu * .5, y: zr.y + zr.h * .2 + i * uu * .35, r: (i - (n - 1) / 2) * 4 }));
        } else {
          const mw = P ? Math.min(area.w * .8, 640) : Math.min(area.w * .48, 460);
          uu = shrink(P ? 42 : 34, 12, u => {
            lay.style.fontSize = u + 'px'; menu.style.width = mw + 'px'; trig.style.width = mw + 'px';
            tlab.textContent = plain(p.title || '请选择');
            const okT = [p.title || '请选择', ...its.map(x => x.label)].every(s => { tlab.textContent = plain(s); return tlab.scrollWidth <= tlab.clientWidth + 1; });
            return okT && els.every(e => { const l = e.querySelector('.lb'); return l.scrollWidth <= l.clientWidth + 1; }) && trig.offsetHeight + menu.offsetHeight + u < area.h * .92;
          }, '菜单');
          html(tlab, esc(plain(p.title || '请选择')));
          const H_ = trig.offsetHeight + uu * .4 + menu.offsetHeight, x0 = (area.w - mw) / 2, y0 = (area.h - H_) * (P ? .3 : .45);
          tr = { x: x0, y: y0, w: mw, h: trig.offsetHeight }; box(trig, x0, y0, mw);
          mr = { x: x0, y: y0 + tr.h + uu * .4, w: mw, h: menu.offsetHeight }; box(menu, mr.x, mr.y, mw);
          els.forEach(e => R.push({ x: mr.x + e.offsetLeft, y: mr.y + e.offsetTop, w: e.offsetWidth, h: e.offsetHeight }));
        }
      });
      /* 鼠标路径：起点在右下外侧，依次到各目标 */
      const at = beats(slot, v === 'menu' ? 2 : n, .9, v === 'drag' ? 1.25 : 1, 1.3);
      const S0 = [area.w * .92, area.h * 1.02];
      const cOf = r => [r.x + r.w * .62, r.y + r.h * .6];
      /* 时间在 build 里定（音效要用），位置在量完尺寸后第一次求值时再算 */
      let hovers = [];
      if (v === 'menu') { const tOpen = at[0]; at[1] = Math.max(at[1], tOpen + .5 + (pick + 1) * .28); hovers = Array.from({ length: pick + 1 }, (_, i) => lerp(tOpen + .45, at[1] - .1, (i + 1) / (pick + 1))); }
      let path = null;   /* [{ t0, t1, a, b, drag?, bend? }] 鼠标移动段 */
      const mkPath = () => {
        path = [];
        if (v === 'click') { let pt = S0; at.forEach((c, i) => { const b = cOf(R[i]); path.push({ t0: c - Math.min(.65, i ? (c - at[i - 1]) * .6 : .65), t1: c - .1, a: pt, b }); pt = b; }); }
        else if (v === 'drag') {
          let pt = S0;
          at.forEach((c, i) => {
            const grab = [R[i].x + R[i].w * .5, R[i].y + R[i].h * .55], drop = [dropAt[i].x + R[i].w * .4, dropAt[i].y + R[i].h * .55], tg = c - .55;
            path.push({ t0: tg - Math.min(.5, i ? (tg - at[i - 1]) * .55 : .5), t1: tg - .08, a: pt, b: grab });
            path.push({ t0: tg + .1, t1: c, a: grab, b: drop, drag: i });
            pt = drop;
          });
        } else {
          const tb = [tr.x + tr.w * .78, tr.y + tr.h * .55];
          path.push({ t0: at[0] - .6, t1: at[0] - .08, a: S0, b: tb });
          let pt = tb;
          hovers.forEach((h, i) => { const b = [R[i].x + R[i].w * .7, R[i].y + R[i].h * .55]; path.push({ t0: h - .25, t1: h - .02, a: pt, b, bend: .05 }); pt = b; });
        }
      };
      const posAt = t => {
        if (!path) mkPath();
        let pt = path.length ? path[0].a : S0;
        for (const sg of path) { if (t < sg.t0) break; const k = EZ.inout(pr(t, sg.t0, sg.t1)); pt = bez(sg.a, sg.b, k, sg.bend ?? (sg.drag != null ? -.12 : .2)); }
        return pt;
      };
      const clicks = v === 'click' ? at.slice() : v === 'menu' ? [at[0], at[1]] : [];
      clicks.forEach((c, i) => { S(c, 'tick', .55, .3); S(c + .02, 'snap', .35, .3); });
      if (v === 'click') at.forEach((c, i) => S(c + .25, i === n - 1 ? 'ding' : 'check', .35, 0, { n: i, m: 93 }));
      if (v === 'drag') at.forEach((c, i) => { S(c - .55, 'pop', .4, -.3); S(c - .4, 'swipe', .3, 0); S(c, 'thud', .5, .3); S(c + .08, 'blip', .3, .3, { n: i + 2 }); });
      if (v === 'menu') { S(at[0] + .05, 'card', .45); hovers.forEach((h, i) => S(h, 'blip', .2, 0, { n: i })); S(at[1] + .1, 'ding', .3, 0, { m: 93 }); S(at[1] + .3, 'swoosh', .3); }
      S(slot.t0 + .1, 'swoosh', .35);
      const tEnd = Math.max(...at) + .6;
      return {
        update(t) {
          const out = leave(t, slot), k = pr(t, slot.t0, slot.t0 + .6);
          set(wrap, { o: 1 - out, blur: out * 10 });
          if (bgWin) { set(bgWin, { o: clamp(k * 3) * .5, s: 1.04 - .04 * EZ.out(k) }); ctx.frameAt(bgIm, p, t, 'src'); }
          let [px, py] = posAt(t);
          if (t > tEnd) { px += Math.sin((t - tEnd) * 1.3) * 6; py += Math.sin((t - tEnd) * 1.7) * 4; }
          const down = clicks.reduce((s, c) => Math.max(s, Math.sin(Math.PI * pr(t, c - .06, c + .12))), 0) + (v === 'drag' ? at.reduce((s, c) => s + (t >= c - .55 && t < c + .02 ? 1 : 0), 0) * .6 : 0);
          tf(ptr, { x: px, y: py, s: 1 - .14 * Math.min(1, down), o: pr(t, slot.t0 + .2, slot.t0 + .5) });
          if (v === 'click') {
            els.forEach((e, i) => {
              const ek = pr(t, slot.t0 + .1 + i * .08, slot.t0 + .6 + i * .08);
              const hov = t >= at[i] - .25 && t < at[i] + .5, press = Math.sin(Math.PI * pr(t, at[i] - .06, at[i] + .14));
              tf(e, { o: clamp(ek * 3), y: (1 - EZ.out5(ek)) * 40, s: (.85 + .15 * EZ.back(ek)) * (1 - .07 * press) * (hov ? 1.03 : 1) });
              e.classList.toggle('hv', hov); e.classList.toggle('done', t >= at[i] + .15);
              set(e.querySelector('.ok'), { s: EZ.spring(pr(t, at[i] + .15, at[i] + .55)), o: t >= at[i] + .15 ? 1 : 0 });
              if (i === n - 1 && t > tEnd) e.style.boxShadow = `0 0 ${(26 + 16 * idle(t, tEnd, 2).wave).toFixed(1)}px rgba(${T().a},.45)`;
            });
            const ttl = lay.querySelector('.ttl'); if (ttl) set(ttl, { o: pr(t, slot.t0, slot.t0 + .4) });
          } else if (v === 'drag') {
            set(zone, { o: pr(t, slot.t0 + .2, slot.t0 + .6), s: .95 + .05 * EZ.back(pr(t, slot.t0 + .2, slot.t0 + .7)) });
            const inZ = at.filter(c => t >= c).length, carrying = at.some(c => t >= c - .55 && t < c);
            zone.classList.toggle('hot', carrying); zone.classList.toggle('full', inZ === n);
            html(zc, inZ ? String(inZ) : ''); const lz = at[Math.max(0, inZ - 1)];
            set(zc, { o: inZ ? 1 : 0, s: inZ ? 1 + .5 * (1 - EZ.spring(pr(t, lz, lz + .4))) : 0 });
            set(zone.querySelector('.zi'), { s: 1 + .15 * Math.sin(Math.PI * pr(t, lz, lz + .3)) * (inZ ? 1 : 0), y: carrying ? -6 : 0 });
            els.forEach((e, i) => {
              const ek = pr(t, slot.t0 + .1 + i * .08, slot.t0 + .6 + i * .08), c = at[i], tg = c - .55;
              let x = 0, y = 0, s = (.9 + .1 * EZ.back(ek)), r = 0, z = 1, lift = 0;
              if (t >= tg && t < c) {
                const [qx, qy] = posAt(t), sg = path.find(q => q.drag === i), g0 = sg.a;
                x = qx - g0[0]; y = qy - g0[1]; lift = EZ.out(pr(t, tg, tg + .15)); r = Math.sin((t - tg) * 9) * 3 * lift + 4 * lift; z = 9;
              } else if (t >= c) {
                const dk = EZ.spring(pr(t, c, c + .4)); x = dropAt[i].x - R[i].x; y = dropAt[i].y - R[i].y; s *= lerp(1.06, .8, dk); r = dropAt[i].r; z = 3 + i;
                e.style.transformOrigin = '0 0';
              }
              if (t < c) e.style.transformOrigin = '50% 50%';
              e.style.zIndex = z;
              tf(e, { o: clamp(ek * 3), x: x + (1 - EZ.out5(ek)) * -40, y, s: s * (1 + .06 * lift), r });
              e.classList.toggle('up', lift > 0 && t < c);
            });
          } else {
            const tOpen = at[0], tPick = at[1], op = pr(t, tOpen, tOpen + .35), cl_ = pr(t, tPick + .35, tPick + .65);
            const tk = pr(t, slot.t0 + .1, slot.t0 + .6);
            tf(trig, { o: clamp(tk * 3), y: (1 - EZ.out5(tk)) * 30, s: 1 - .05 * Math.sin(Math.PI * pr(t, tOpen - .06, tOpen + .12)) });
            trig.classList.toggle('on', t >= tOpen && t < tPick + .65);
            trig.lastChild.style.transform = `rotate(${(90 + 180 * EZ.out(op) * (1 - EZ.out(cl_))).toFixed(1)}deg)`;
            html(tlab, esc(plain(t >= tPick + .45 ? its[pick].label : (p.title || '请选择'))));
            if (t >= tPick + .45) set(tlab, { s: 1 + .1 * Math.sin(Math.PI * pr(t, tPick + .45, tPick + .7)) });
            trig.classList.toggle('picked', t >= tPick + .45);
            menu.style.transformOrigin = '50% 0';
            tf(menu, { o: clamp(op * 3) * (1 - cl_), sy: (.6 + .4 * EZ.back(op)) * (1 - .3 * EZ.in(cl_)), sx: .96 + .04 * EZ.out(op), y: -cl_ * 10 });
            const hov = hovers.filter(h => t >= h - .05).length - 1;
            els.forEach((e, i) => {
              const q = pr(t, tOpen + .05 + i * .05, tOpen + .3 + i * .05);
              set(e, { o: clamp(q * 3), x: (1 - EZ.out5(q)) * 18 });
              e.classList.toggle('hv', i === hov && t < tPick + .45);
              e.classList.toggle('sel', i === pick && t >= tPick);
              set(e.querySelector('.ok'), { o: i === pick && t >= tPick ? 1 : 0, s: EZ.spring(pr(t, tPick, tPick + .4)) });
            });
            if (t > tPick + .7) trig.style.boxShadow = `0 0 ${(22 + 14 * idle(t, tPick + .7, 2).wave).toFixed(1)}px rgba(${T().a},.4)`;
          }
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          if (!path) mkPath();
          clicks.forEach((c0, i) => { const sg = path.filter(q => q.t1 <= c0 + .01).pop(); if (sg) MK.fx.ripple(c, t, c0, area.x + sg.b[0], area.y + sg.b[1], { r: 90, rings: 2, w: 3 * a, life: .6 }); });
          if (v === 'drag') at.forEach((c0, i) => MK.fx.ripple(c, t, c0, area.x + zr.x + zr.w / 2, area.y + zr.y + zr.h / 2, { r: zr.w * .6, rings: 1, col: T().g, w: 2 * a }));
          MK.fx.glow(c, area.x + area.w / 2, area.y + area.h / 2, area.w * .5, T().a, .3 * a);
        },
        fg(c, t) {
          if (v === 'click') at.forEach((c0, i) => { if (i === n - 1) { const r = R[i]; T().paint.burst(c, t, c0 + .1, area.x + r.x + r.w / 2, area.y + r.y + r.h / 2, { n: 30, sp: 600, life: .7 }); } });
          if (v === 'drag') { const c0 = at[n - 1]; T().paint.burst(c, t, c0 + .05, area.x + zr.x + zr.w / 2, area.y + zr.y + zr.h / 2, { n: 30, sp: 600, col: T().g }); }
          if (v === 'menu') { const r = R[pick]; T().paint.burst(c, t, at[1] + .02, area.x + r.x + r.w * .7, area.y + r.y + r.h / 2, { n: 18, sp: 380, life: .5 }); }
        },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .45 },
      };
    },
  });
})();
