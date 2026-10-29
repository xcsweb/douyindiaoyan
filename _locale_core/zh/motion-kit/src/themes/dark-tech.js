/* motion-kit · 主题：暗黑科技（dark-tech）
   来源：豆包/anim 工程（Claude Opus 5.5 制作）的视觉语言：深色仪器台、发光玻璃球、地平线网格、点状弧环、尘埃、光束、爆散火花。
   主题只负责「长什么样」：配色、字体、画布背景元件。控件只引用 CSS 变量和 MK.T 里的值，换主题不改控件。 */
(function () {
  'use strict';
  const { clamp, lerp, pr, rnd, rgb } = MK;

  const T = MK.T = {
    id: 'dark-tech',
    name: '暗黑科技',
    bg: '#06070A', tx: '#EDEEF2', dim: '#8B8F9A',
    accent: '#7CC8FF', accent2: '#5B8CFF', warm: '#FFB648', ok: '#3DDC84', bad: '#FF5A5F', deep: '#2462EA',
    floorWarm: '255,190,120',
  };
  /* 输入里的颜色覆盖（只允许这几个键） */
  MK.applyTheme = (over = {}) => {
    for (const k of ['accent', 'accent2', 'warm', 'ok', 'bad', 'bg']) if (/^#[0-9a-fA-F]{6}$/.test(over[k] || '')) T[k] = over[k];
    T.a = rgb(T.accent); T.a2 = rgb(T.accent2); T.w = rgb(T.warm); T.g = rgb(T.ok); T.r = rgb(T.bad);
    T.aLite = rgb(T.accent, '#FFFFFF', .35); T.dust = rgb(T.accent, '#FFFFFF', .4); T.grid = rgb(T.accent2, '#FFFFFF', .3);
    T.bg0 = '#' + rgb(T.bg, '#1a2030', .6).split(',').map(v => (+v).toString(16).padStart(2, '0')).join('');
    const R = document.documentElement.style;
    const vars = { '--bg': T.bg, '--tx': T.tx, '--dim': T.dim, '--a': T.accent, '--a2': T.accent2, '--w': T.warm, '--ok': T.ok, '--bad': T.bad, '--deep': T.deep,
      '--a-rgb': T.a, '--a2-rgb': T.a2, '--w-rgb': T.w, '--ok-rgb': T.g, '--bad-rgb': T.r };
    for (const [k, v] of Object.entries(vars)) R.setProperty(k, v);
  };

  /* ---------- 画布元件（全部 lighter 叠加，确定性） ---------- */
  const P = T.paint = {};
  P.base = (c, W, H, cx, cy, tint) => {
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    const g = c.createRadialGradient(cx, cy, 40, cx, cy, Math.max(W, H) * .7);
    g.addColorStop(0, tint || T.bg0); g.addColorStop(.55, '#0a0c11'); g.addColorStop(1, '#030405');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  };
  P.floor = (c, t, W, H, y, k, col, o = {}) => {
    if (k <= .002) return;
    c.save(); c.globalCompositeOperation = 'lighter';
    const cx = o.cx || W / 2;
    let g = c.createRadialGradient(cx, y, 0, cx, y, 900); g.addColorStop(0, `rgba(${col},${.2 * k})`); g.addColorStop(1, `rgba(${col},0)`);
    c.setTransform(1, 0, 0, .16, 0, y * .84); c.fillStyle = g; c.fillRect(0, y - 900, W, 1800); c.setTransform(1, 0, 0, 1, 0, 0);
    g = c.createLinearGradient(cx - 900, 0, cx + 900, 0);
    g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(.5, `rgba(${col},${.9 * k})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.fillRect(cx - 900, y - 1, 1800, 2.2);
    c.strokeStyle = `rgba(${T.grid},${.09 * k})`; c.lineWidth = 1;
    for (let i = -14; i <= 14; i++) { c.beginPath(); c.moveTo(cx + i * 22, y + 2); c.lineTo(cx + i * 260, H + 20); c.stroke(); }
    const ph = (t * (o.speed == null ? .35 : o.speed)) % 1;
    for (let j = 0; j < 9; j++) { const z = (j + ph) / 9, yy = y + Math.pow(z, 2.2) * (H + 20 - y); c.globalAlpha = clamp(z * 2) * k; c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy); c.stroke(); }
    c.restore();
  };
  P.ball = (c, x, y, r, col, a = 1, o = {}) => {
    if (a <= .002 || r <= .5) return;
    c.save(); c.globalCompositeOperation = 'lighter';
    let g = c.createRadialGradient(x, y, r * .2, x, y, r * (o.halo || 2.1));
    g.addColorStop(0, `rgba(${col},${.3 * a})`); g.addColorStop(.5, `rgba(${col},${.1 * a})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * (o.halo || 2.1), 0, 7); c.fill();
    g = c.createRadialGradient(x - r * .32, y - r * .38, r * .02, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${.85 * a})`); g.addColorStop(.22, `rgba(${col},${.55 * a})`); g.addColorStop(.75, `rgba(${col},${.16 * a})`); g.addColorStop(.96, `rgba(${col},${.55 * a})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    if (o.lat != null) {
      c.strokeStyle = `rgba(255,255,255,${.12 * a})`; c.lineWidth = 1;
      for (let i = 1; i < 4; i++) { c.beginPath(); c.ellipse(x, y, r, r * Math.abs(Math.cos(i * .78 + o.lat)), 0, 0, 7); c.stroke(); }
    }
    c.restore();
  };
  P.arcRing = (c, cx, cy, R, a0, a1, col, a = 1, o = {}) => {
    if (a <= .002 || a1 <= a0) return;
    c.save(); c.globalCompositeOperation = 'lighter';
    const n = Math.max(2, Math.floor((a1 - a0) * R / (o.step || 9)));
    for (let i = 0; i <= n; i++) {
      const an = a0 + (a1 - a0) * i / n, big = i % (o.major || 6) === 0, rr = R + (big ? 10 : 0);
      c.strokeStyle = `rgba(${col},${(big ? .75 : .35) * a})`; c.lineWidth = big ? 2 : 1.2;
      c.beginPath(); c.moveTo(cx + Math.cos(an) * R, cy + Math.sin(an) * R); c.lineTo(cx + Math.cos(an) * (rr + 8), cy + Math.sin(an) * (rr + 8)); c.stroke();
    }
    c.strokeStyle = `rgba(${col},${.5 * a})`; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, R - 6, a0, a1); c.stroke();
    c.restore();
  };
  P.dust = (c, t, W, H, n, a = 1) => {
    if (a <= .002) return;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const sx = rnd(i, 1) * W, sp = 8 + rnd(i, 2) * 26, y = ((rnd(i, 3) * (H + 120) - t * sp) % (H + 120) + H + 120) % (H + 120) - 60;
      const x = sx + Math.sin(t * .4 + i) * 18, r = .6 + rnd(i, 4) * 1.8, tw = .45 + .55 * Math.sin(t * (1 + rnd(i, 5) * 2) + i);
      c.fillStyle = `rgba(${T.dust},${(.25 + .5 * rnd(i, 6)) * tw * a})`; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
    c.restore();
  };
  P.beam = (c, x1, y1, x2, y2, col, a = 1, o = {}) => {
    if (a <= .002) return;
    const p = o.p == null ? 1 : o.p, xe = lerp(x1, x2, p), ye = lerp(y1, y2, p);
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    c.strokeStyle = `rgba(${col},${.16 * a})`; c.lineWidth = (o.w || 2) * 5; c.beginPath(); c.moveTo(x1, y1); c.lineTo(xe, ye); c.stroke();
    c.strokeStyle = `rgba(${col},${.8 * a})`; c.lineWidth = o.w || 2; c.beginPath(); c.moveTo(x1, y1); c.lineTo(xe, ye); c.stroke();
    c.restore();
  };
  P.burst = (c, t, t0, x, y, o = {}) => {
    const lt = t - t0, life = o.life || 1.1; if (lt < 0 || lt > life) return;
    c.save(); c.globalCompositeOperation = 'lighter';
    const n = o.n || 40, col = o.col || T.aLite;
    for (let i = 0; i < n; i++) {
      const an = rnd(i, 7 + (o.seed || 0)) * 6.283, sp = (o.sp || 900) * (.35 + .65 * rnd(i, 8 + (o.seed || 0))), li = life * (.5 + .5 * rnd(i, 9));
      if (lt > li) continue;
      const d = sp * (1 - Math.exp(-lt * 3)) / 3, px = x + Math.cos(an) * d, py = y + Math.sin(an) * d + lt * lt * 120, al = 1 - lt / li;
      c.strokeStyle = `rgba(${col},${al})`; c.lineWidth = 2;
      c.beginPath(); c.moveTo(px, py); c.lineTo(px - Math.cos(an) * 14 * al, py - Math.sin(an) * 14 * al); c.stroke();
    }
    const g = c.createRadialGradient(x, y, 0, x, y, 220 * (1 - pr(lt, 0, .5) * .5)); g.addColorStop(0, `rgba(${col},${.5 * (1 - pr(lt, 0, .45))})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, 230, 0, 7); c.fill();
    c.restore();
  };
  /* 镜头背景：每个控件给出焦点 (cx, cy) 与地平线 y；主题统一画底、地平线、尘埃 */
  T.background = (c, t, W, H, hint = {}) => {
    P.base(c, W, H, hint.cx ?? W * .45, hint.cy ?? H * .55, hint.tint);
    P.floor(c, t, W, H, hint.floorY ?? H * .76, hint.floor ?? .75, hint.floorCol || T.floorWarm, { cx: hint.floorCx, speed: hint.speed });
    P.dust(c, t, W, H, hint.dust ?? 55, .7);
  };
})();
