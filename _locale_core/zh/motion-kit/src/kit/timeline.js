/* adunext.portrait-presenter/1 */
/* adunext.portrait-presenter/1
   竖屏口播人物：按阿杜Next 9:16 成片（EP16 / EP11 / EP21）的做法统一位置与窗口大小。
   - 人物水平居中，放在内容下方；内容在上，字幕在人物下方，底部留给平台文案。
   - 同一张卡在几档姿态之间平滑形变（smootherstep + 轻微弧线，无回弹、无抖动）。
   - 取景：头顶留 8%–12%，脸中心约在卡片高度 40%（圆窗 48%），原片最多 1:1，不放大。
   坐标均为 1080×1920 画布像素，x/y 为中心点。 */
(function (root) {
  'use strict';
  if (root.PortraitPresenter) return;
  const W = 1080, H = 1920;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  // 字幕：底边 1555（抖音底部文案区从 y≈1560 开始，EP11 用户标注），两行约 128px。
  const CAPTION_BOTTOM_RATIO = 1 - 1555 / H;
  const SLOT_BOTTOM = 1412;          // 卡片底边，留 15px 给字幕顶
  const CIRCLE_BOTTOM = 1392;
  const POSES = {
    HERO:   { w: 700, h: 880, r: 6 },
    CARD:   { w: 600, h: 760, r: 6 },
    CARD_S: { w: 520, h: 660, r: 6 },
    CIRC:   { w: 420, h: 420, r: 210 },
    CIRC_S: { w: 340, h: 340, r: 170 },
  };
  for (const [name, p] of Object.entries(POSES)) {
    p.name = name; p.x = W / 2;
    p.y = (p.r > p.w / 3 ? CIRCLE_BOTTOM : SLOT_BOTTOM) - p.h / 2;
  }
  const CHAINS = {
    hero: ['HERO', 'CARD', 'CARD_S', 'CIRC', 'CIRC_S'],
    card: ['CARD', 'CARD_S', 'CIRC', 'CIRC_S'],
    small: ['CARD_S', 'CIRC', 'CIRC_S'],
    circle: ['CIRC', 'CIRC_S'],
    pip: ['CIRC_S'],
  };
  // 卡片上方有「● 名字」标签，圆窗没有，所以卡片需要更大的间距。
  const GAP = { card: 76, circle: 44 };

  /* 横屏人物状态（1920×1080 坐标的中心点和尺寸）归类。 */
  function classify(s) {
    if (!s || s.o === 0) return 'off';
    const w = s.w, h = s.h, round = s.r >= Math.min(w, h) / 2 * .8;
    if (s.x > 2100 || s.x < -180 || s.y > 1300 || s.y < -220) return 'off';
    if (Math.max(w, h) <= 90) return 'dot';
    if (w >= 1700 && h >= 950) return 'full';
    if (round) return w >= 240 ? 'circle' : 'pip';
    const area = w * h / (560 * 760);
    return area >= 1.12 ? 'hero' : area >= .8 ? 'card' : 'small';
  }

  // 角落小圆窗：内容占满中下部时用（EP16 的 CIRC_R / CIRC_L 做法）。
  // 右下角的圆右边缘不超过 x=893（抖音右侧按钮列 x>905，y 935–1760）。
  // 三种尺寸：260（横屏 TR/BR 原尺寸）、200、160（横屏最小的 180 圆窗）。
  const PIPS = {};
  for (const d of [260, 200, 160]) {
    const at = { TR: [1008 - d / 2, 262 + d / 2], TL: [72 + d / 2, 262 + d / 2], BR: [893 - d / 2, CIRCLE_BOTTOM - d / 2], BL: [72 + d / 2, CIRCLE_BOTTOM - d / 2] };
    for (const [k, [x, y]] of Object.entries(at)) PIPS[`PIP_${k}${d === 260 ? '' : d}`] = { name: `PIP_${k}${d === 260 ? '' : d}`, x, y, w: d, h: d, r: d / 2, pip: true };
  }

  const isRound = p => p.r > p.w / 3;
  // 窗口占用范围：卡片上方带标签条；圆窗四周留一圈间距。
  function zone(p) {
    const g = p.pip ? 18 : isRound(p) ? GAP.circle : 24;
    return { left: p.x - p.w / 2 - g, right: p.x + p.w / 2 + g, top: p.y - p.h / 2 - (p.pip ? 18 : isRound(p) ? GAP.circle : GAP.card), bottom: p.y + p.h / 2 + g };
  }
  function overlap(p, rects) {
    const z = zone(p); let a = 0;
    for (const r of rects) a += Math.max(0, Math.min(z.right, r.right) - Math.max(z.left, r.left)) * Math.max(0, Math.min(z.bottom, r.bottom) - Math.max(z.top, r.top));
    return a;
  }

  /* 选姿态。content：内容矩形数组（屏幕坐标），或只给内容底边（数字）；null 表示没有内容。
     hint：横屏人物在画面哪一侧（{right, top}），角落小窗优先放同一侧。 */
  function pick(kind, content, opts = {}) {
    if (kind === 'full') kind = opts.allowFull ? 'full' : 'hero';
    if (kind === 'full') return { name: 'FULL', x: W / 2, y: H / 2, w: W, h: H, r: 0 };
    if (kind === 'off') return { name: 'OFF', x: W / 2, y: H + 700, w: 600, h: 760, r: 6 };
    if (kind === 'dot') { const c = POSES.CIRC; return { name: 'DOT', x: c.x, y: c.y, w: 50, h: 50, r: 25 }; }
    const rects = content == null ? [] : typeof content === 'number' ? [{ left: 0, right: W, top: 0, bottom: content }] : content;
    const chain = (CHAINS[kind] || CHAINS.card).map(n => POSES[n]);
    for (const p of chain) if (!overlap(p, rects)) return { ...p };
    const h = opts.hint || {}, sides = [h.top ? 'T' : 'B', h.top ? 'B' : 'T'].flatMap(v => [h.right === false ? 'L' : 'R', h.right === false ? 'R' : 'L'].map(s => v + s));
    const corners = ['', '200', '160'].flatMap(d => sides.map(s => PIPS['PIP_' + s + d]));
    for (const p of corners) if (!overlap(p, rects)) return { ...p };
    // 都放不下：内容铺满画面时它本身就是背景（例如 3D 作品墙），人物照常用大卡，
    // 只避开标题、按钮这类大字（rect.strong）。否则选遮挡最少的位置。
    const cover = Math.max(0, ...rects.map(r => Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, 1412) - Math.max(r.top, 250))));
    if (cover > W * 1162 * .55 && kind === 'hero') {
      const strong = rects.filter(r => r.strong);
      for (const p of chain) if (!overlap(p, strong)) return { ...p, crowded: 'backdrop' };
    }
    const all = [...chain, ...corners].map(p => [overlap(p, rects), p]).sort((a, b) => a[0] - b[0]);
    return { ...all[0][1], crowded: true };
  }

  /* 关键帧轨道：keys = [{t, pose, d}]，按时间排序。返回 t 时刻的 {x,y,w,h,r,o}。 */
  function track(keys, t) {
    if (!keys.length) return null;
    let i = -1;
    for (let k = 0; k < keys.length; k++) if (t >= keys[k].t) i = k;
    if (i < 0) return { ...keys[0].pose };
    const K = keys[i], P = i > 0 ? keys[i - 1].pose : K.pose, B = K.pose;
    const d = Math.max(K.d ?? .7, 1e-3), x = clamp((t - K.t) / d), e = x * x * x * (x * (x * 6 - 15) + 10);
    const o = {};
    for (const k of ['x', 'y', 'w', 'h', 'r']) o[k] = lerp(P[k], B[k], e);
    const dx = B.x - P.x, dy = B.y - P.y, dist = Math.hypot(dx, dy);
    if (dist > 40) { const bow = Math.sin(e * Math.PI) * Math.min(70, dist * .1); o.x += -dy / dist * bow; o.y += dx / dist * bow * .6; }
    o.name = e < .5 ? P.name : B.name; o.progress = e;
    return o;
  }

  /* 取景：sw×sh 原片放进 w×h 窗口。face = {cx,cy,h}（0–1）。 */
  function frame(sw, sh, w, h, face, round = false) {
    const cover = Math.max(w / sw, h / sh);
    const ok = face && ['cx', 'cy', 'h'].every(k => Number.isFinite(face[k]) && face[k] > 0 && face[k] <= 1);
    const f = ok ? face : { cx: .5, cy: .4, h: .25 };
    // 脸占卡高约 32%（圆窗 44%）；只在 1:1 以内放大。
    const want = h * (round ? .44 : .32) / (f.h * sh);
    const s = Math.max(cover, Math.min(want, Math.max(cover, 1)));
    const iw = sw * s, ih = sh * s;
    let x = w / 2 - f.cx * iw, y = (round ? .48 : .40) * h - f.cy * ih;
    const hairTop = (f.cy - .75 * f.h) * ih + y;           // 头发顶部约在人脸框上方 1/4 框高
    if (hairTop < .08 * h) y += .08 * h - hairTop;
    x = clamp(x, w - iw, 0); y = clamp(y, h - ih, 0);
    return { x, y, width: iw, height: ih, scale: s, faceCenter: { x: (x + f.cx * iw) / w, y: (y + f.cy * ih) / h } };
  }

  root.PortraitPresenter = { W, H, POSES, CHAINS, CAPTION_BOTTOM_RATIO, SLOT_BOTTOM, classify, pick, track, frame };
})(globalThis);

/* motion-kit · timeline.js
   读取 window.MOTION_INPUTS.timeline，把控件排进一条时间轴，叠加口播卡、HUD、字幕、转场。
   时间轴格式见 README：{ layout, duration, presenter, captions[], segments[{ control, t0, t1, cues[], props }] }
   渲染器负责：校验、把媒体路径转成 URL、把 srt 解析成 captions。页面只读 MOTION_INPUTS，不碰文件系统。 */
(function () {
  'use strict';
  const { clamp, lerp, pr, EZ, el, box, set, html, esc } = MK;
  const IN = window.MOTION_INPUTS;
  const TL = IN.timeline;
  // Old model-selected "small" must not turn a portrait speaker into a corner icon.
  // Normalize the content area and carrier together; retain the original normal card.
  const presenterMode = mode => TL.layout === 'portrait' && mode === 'small' ? 'card' : mode;
  MK.applyTheme(IN.theme || {});
  const T = MK.T;

  /* ---------- 画幅与版式 ---------- */
  const LAYOUTS = {
    /* area(模式)：card = 口播卡占右侧 / small = 口播缩成角落圆窗 / hide 或无口播 = 全幅 */
    landscape: { W: 1920, H: 1080, card: { x: 1500, y: 468, w: 470, h: 790, r: 26 },
      area: m => (m === 'card' ? { x: 140, y: 150, w: 1060, h: 640 } : m === 'small' ? { x: 160, y: 150, w: 1400, h: 640 } : { x: 160, y: 150, w: 1600, h: 640 }), cap: { y: 1000, w: 1500 } },
    portrait: { W: 1080, H: 1920, card: { x: 540, y: 1040, w: 440, h: 550, r: 28 },
      area: m => (m === 'card' ? { x: 70, y: 210, w: 940, h: 540 } : { x: 70, y: 260, w: 940, h: 1200 }), cap: { y: 1800, w: 980 } },
  };
  const L = LAYOUTS[TL.layout] || LAYOUTS.landscape;
  const W = L.W, H = L.H, END = window.END = TL.duration;
  const publishArea = TL.layout === 'portrait' && TL.captionSafeArea !== 'frame' ? MotionCaptionSafeArea.resolve(W,H,TL.captionPosition) : null;
  const HAS_P = !!TL.presenter && TL.presenter.mode !== 'none';
  const stage = document.getElementById('stage');
  for (const e of [document.documentElement, document.body, stage]) Object.assign(e.style, { width: W + 'px', height: H + 'px' });

  /* ---------- 画布 ---------- */
  const mkCanvas = parent => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.style.cssText = 'position:absolute;left:0;top:0'; parent.appendChild(c); return c.getContext('2d'); };
  const bgx = mkCanvas(document.getElementById('world'));
  const fgx = mkCanvas(document.getElementById('front'));

  /* ---------- 媒体（图片 / 图片序列；视频由渲染器预先拆帧） ---------- */
  const pending = new Set();
  window.imgWait = () => Promise.all([...pending].map(im => (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })))).then(() => pending.clear());
  const setSrc = (im, src, media) => { MK.applyMediaPolicy(im, media); if (im && im._src !== src) { im._src = src; im.src = src; pending.add(im); } };
  const frameOf = (m, local) => {
    if (!m || !m.src) return null;
    if (!m.frames) return m.src;
    const i = clamp(Math.floor(local * m.fps + 1e-6), 0, m.frames - 1) + 1;   // 不循环：素材不够长时停在最后一帧
    return m.src.replace(/%0(\d)d/, (_, n) => String(i).padStart(+n, '0'));
  };
  window.PRELOAD = [];

  /* ---------- 控件实例化 ---------- */
  const measures = [];
  const VARIANT = MK.assignVariants(TL.segments, c => MK.CONTROLS[c]?.variants);
  const slots = TL.segments.map((sg, i) => {
    const def = MK.CONTROLS[sg.control];
    if (!def) throw Error(`未知控件：${sg.control}`);
    const root = el('div', 'mk-slot', document.getElementById('world'));
    const slot = { t0: sg.t0, t1: sg.t1, cues: sg.cues || [], cuePolicy: TL.narrationCuePolicy };
    const area = (sg.area && { ...sg.area }) || L.area(HAS_P ? presenterMode(sg.presenter || 'card') : 'hide');
    const ctx = {
      W, H, root, area, layout: TL.layout, portrait: TL.layout === 'portrait', variant: VARIANT[i], occurrence: TL.segments.slice(0, i).filter(x => x.control === sg.control).length,
      mode: HAS_P ? presenterMode(sg.presenter || 'card') : 'hide',
      measure: f => measures.push(() => { root.style.display = 'block'; f(); }),
      media: (im, p) => { if (im && p.media) { setSrc(im, frameOf(p.media, 0), p.media); window.PRELOAD.push(im); } },
      mediaFrame: (im, t) => { const m = sg.props.media; if (im && m) setSrc(im, frameOf(m, Math.max(0, t - slot.t0)), m); },
      /* 0.3.0：任意 media 字段（如 items[i].src、before、avatar）。渲染器把素材写进 obj.$media[字段名] */
      mediaOf: (im, o, k = 'src') => { const m = o?.$media?.[k]; if (im && m) { setSrc(im, frameOf(m, 0), m); window.PRELOAD.push(im); } },
      frameAt: (im, o, t, k = 'src') => { const m = o?.$media?.[k]; if (im && m) setSrc(im, frameOf(m, Math.max(0, t - slot.t0)), m); },
    };
    const inst = def.build(slot, sg.props, ctx);
    root.dataset.control = sg.control; root.dataset.variant = VARIANT[i];
    return { i, sg, slot, root, inst, variant: VARIANT[i], trans: sg.transition || (i === 0 ? 'none' : 'cut') };
  });

  /* ---------- 叠加层（0.3.0）：timeline.overlays[] 可与段落重叠，例如人名条、订阅按钮、贴纸、箭头 ----------
     叠加层不随镜头漂移/震动，画在内容和口播卡之上、HUD 与字幕之下。 */
  const overRoot = document.getElementById('over');
  if (overRoot) overRoot.style.cssText += 'position:absolute;inset:0;pointer-events:none';
  const ovx = overRoot ? mkCanvas(overRoot) : null;
  const OVS = TL.overlays || [];
  const OVAR = MK.assignVariants(OVS, c => MK.CONTROLS[c]?.variants);
  const overlays = OVS.map((sg, i) => {
    const def = MK.CONTROLS[sg.control];
    if (!def) throw Error(`未知控件：${sg.control}`);
    const root = el('div', 'mk-slot', overRoot);
    const slot = { t0: sg.t0, t1: sg.t1, cues: sg.cues || [], cuePolicy: TL.narrationCuePolicy };
    const ctx = {
      W, H, root, area: { x: 0, y: 0, w: W, h: H }, layout: TL.layout, portrait: TL.layout === 'portrait', variant: OVAR[i], overlay: true,
      occurrence: OVS.slice(0, i).filter(x => x.control === sg.control).length,
      safe: L.safe || (TL.layout === 'portrait' ? { x: 70, y: 150, w: 940, h: 1560 } : { x: 120, y: 110, w: 1680, h: 820 }),
      presenterCard: HAS_P ? { ...L.card } : null,
      measure: f => measures.push(() => { root.style.display = 'block'; f(); }),
      media: (im, p) => { if (im && p.media) { setSrc(im, frameOf(p.media, 0), p.media); window.PRELOAD.push(im); } },
      mediaFrame: (im, t) => { const m = sg.props.media; if (im && m) setSrc(im, frameOf(m, Math.max(0, t - slot.t0)), m); },
      mediaOf: (im, o, k = 'src') => { const m = o?.$media?.[k]; if (im && m) { setSrc(im, frameOf(m, 0), m); window.PRELOAD.push(im); } },
      frameAt: (im, o, t, k = 'src') => { const m = o?.$media?.[k]; if (im && m) setSrc(im, frameOf(m, Math.max(0, t - slot.t0)), m); },
    };
    const inst = def.build(slot, sg.props, ctx);
    root.dataset.control = sg.control; root.dataset.variant = OVAR[i];
    return { i, sg, slot, root, inst, variant: OVAR[i] };
  });

  /* ---------- 转场：段与段之间（cut / flash / wipe / blur；0.3.0 加 zoom / whip / glitch / iris / shutter / pixel / dip） ---------- */
  const wipe = el('div', 'mk-abs', document.getElementById('fx')); wipe.style.cssText += `inset:0;width:${W}px;height:${H}px;background:#0E1118;transform:translateX(100%)`;
  const flashEl = el('div', 'mk-abs', document.getElementById('fx')); flashEl.style.cssText += `inset:0;width:${W}px;height:${H}px;background:#fff;opacity:0;mix-blend-mode:screen`;
  const fade = el('div', 'mk-abs', document.getElementById('ov')); fade.style.cssText += `inset:0;width:${W}px;height:${H}px;background:#000;opacity:0`;
  const transitions = slots.filter(s => s.trans !== 'none' && s.trans !== 'cut').map(s => ({ at: s.slot.t0, kind: s.trans }));
  const TSFX = { zoom: ['whoosh', .55], whip: ['whip', .6], glitch: ['glitch', .35], iris: ['swoosh', .45], shutter: ['shutter', .55], pixel: ['blip', .4], dip: ['swoosh', .25] };
  for (const tr of transitions) { const x = TSFX[tr.kind]; if (x) MK.S(tr.at - .15, x[0], x[1]); else MK.S(tr.at - .15, tr.kind === 'wipe' ? 'swoosh' : 'whoosh', .45); }
  /* 转场画布：遮罩类转场（iris / shutter / pixel / glitch 切片）画在这里 */
  const tfx = mkCanvas(document.getElementById('fx'));

  /* ---------- 口播卡 ---------- */
  const TK = (() => {
    if (!HAS_P) return null;
    const p = TL.presenter;
    const e = el('div', 'mk-tk', document.getElementById('front'));
    e.innerHTML = `${p.src ? '<img>' : '<div class="ph"><b>你的口播画面</b>PRESENTER</div>'}` +
      `${p.badge ? `<div class="lab"><i></i><span>${esc(p.badge)}</span></div>` : ''}<div class="cor"><b></b><b></b><b></b></div>`;
    const im = e.querySelector('img');
    if (im) { setSrc(im, frameOf(p, 0), p); window.PRELOAD.push(im); }
    return { e, im, dot: e.querySelector('.lab i'), p };
  })();
  /* 段可以要求口播卡缩成圆窗（presenter: 'small'）或隐藏（'hide'），在段边界弹簧过渡 */
  const cardKey = TL.segments.map(sg => presenterMode(sg.presenter || 'card'));
  const CARD = L.card, SMALL = TL.layout === 'portrait' ? { ...L.card } : { x: 1716, y: 214, w: 230, h: 230, r: 115 };
  let PORTRAIT_POSES = null;
  const portraitCardAt = t => {
    let i = 0; for (let k = 0; k < slots.length; k++) if (t >= slots[k].slot.t0 - .45) i = k;
    const keys = [];
    PORTRAIT_POSES.forEach((p, k) => { const q = p || PORTRAIT_POSES.find(Boolean) || L.card; keys.push({ t: k ? slots[k].slot.t0 - .45 : 0, d: k ? .7 : 0, pose: q }); });
    const g = window.PortraitPresenter.track(keys, t), x = pr(t, slots[i].slot.t0 - .45, slots[i].slot.t0 + .25);
    const opa = k => (PORTRAIT_POSES[k] ? 1 : 0), prev = i > 0 ? i - 1 : i;
    return { x: g.x, y: g.y, w: g.w, h: g.h, r: g.r, o: lerp(opa(prev), opa(i), EZ.out(x)) };
  };
  const cardAt = t => {
    if (PORTRAIT_POSES) return portraitCardAt(t);
    let i = 0; for (let k = 0; k < slots.length; k++) if (t >= slots[k].slot.t0) i = k;
    const want = cardKey[i], prev = i > 0 ? cardKey[i - 1] : want, x = pr(t, slots[i].slot.t0, slots[i].slot.t0 + .7), s = EZ.spring(x);
    const geo = k => (k === 'small' ? SMALL : CARD), opa = k => (k === 'hide' ? 0 : 1);
    const A = geo(prev), B = geo(want);
    return { x: lerp(A.x, B.x, s), y: lerp(A.y, B.y, s), w: lerp(A.w, B.w, s), h: lerp(A.h, B.h, s), r: lerp(A.r, B.r, EZ.out(x)), o: lerp(opa(prev), opa(want), EZ.out(x)) };
  };
  function tkUpdate(t) {
    if (!TK) return;
    const g = cardAt(t), intro = EZ.spring(pr(t, .2, .95)), op = g.o * clamp(pr(t, .2, .95) * 4);
    const e = TK.e;
    e.style.width = g.w.toFixed(1) + 'px'; e.style.height = g.h.toFixed(1) + 'px'; e.style.borderRadius = Math.min(g.r, g.w / 2).toFixed(1) + 'px';
    e.style.transform = `translate(${(g.x - g.w / 2 + (1 - intro) * 240).toFixed(2)}px,${(g.y - g.h / 2).toFixed(2)}px)`;
    e.style.opacity = op.toFixed(3); e.style.visibility = op < .003 ? 'hidden' : 'visible';
    e.style.boxShadow = `0 0 0 1px rgba(255,255,255,.16),0 0 34px rgba(${T.a},.14),0 40px 90px rgba(0,0,0,.6)`;
    if (TK.im) setSrc(TK.im, frameOf(TK.p, t), TK.p);
    if(TK.im)MotionGitStaticPresenter(TK.im,TK.p,g.w,g.h,Math.min(1,2*g.r/Math.min(g.w,g.h)));
    if (TK.dot) TK.dot.style.opacity = Math.floor(t * 1.6) % 2 ? .35 : 1;
  }

  /* ---------- HUD：章节 / 品牌时间码 / 进度轨 / 暗角 / 颗粒 ---------- */
  const hudRoot = document.getElementById('hud');
  const vig = el('div', 'mk-abs', hudRoot); vig.style.cssText += `inset:0;width:${W}px;height:${H}px;background:radial-gradient(ellipse 75% 70% at 50% 48%,rgba(0,0,0,0) 55%,rgba(0,0,0,.55) 100%)`;
  const grain = el('div', 'mk-abs', hudRoot); grain.style.cssText += `inset:0;width:${W}px;height:${H}px;background:url(assets/grain.png);opacity:.045;mix-blend-mode:screen`;
  const hud = TL.hud === false ? null : (() => {
    const h = TL.hud || {};
    const tag = box(el('div', 'mk-hud-t mk-abs', hudRoot), 64, 46);
    const right = box(el('div', 'mk-hud-t mk-abs', hudRoot, `${h.brand ? `<b data-motiongit-periodic-label>${esc(h.brand)}</b>&nbsp;&nbsp;` : ''}<span data-motiongit-source-clock></span>`), 0, 46);
    const track = box(el('div', 'mk-track mk-abs', hudRoot, '<i></i>'), 64, H - 18, W - 128);
    return { tag, right, rt: right.querySelector('span'), fill: track.querySelector('i'), chapters: TL.segments.map(sg => sg.chapter || null), h };
  })();
  const tc = t => { const f = Math.floor(t * 60 + 1e-6), s = Math.floor(f / 60); return [Math.floor(s / 60), s % 60, f % 60].map(n => String(n).padStart(2, '0')).join(':'); };
  function hudUpdate(t) {
    const fi = Math.floor(t * 60 + 1e-6); grain.style.backgroundPosition = `${Math.floor(MK.rnd(fi, 1) * 256)}px ${Math.floor(MK.rnd(fi, 2) * 256)}px`;
    if (!hud) return;
    let c = ''; for (let k = 0; k < slots.length; k++) if (t >= slots[k].slot.t0 && hud.chapters[k]) c = hud.chapters[k];
    html(hud.tag, esc(c));
    hud.rt.textContent = tc(t);
    const rw = hud.right.getBoundingClientRect().width; hud.right.style.left = (W - 64 - rw) + 'px';
    hud.fill.style.width = (t / END * 100).toFixed(2) + '%';
    const o = clamp(t / .3); for (const e of [hud.tag, hud.right]) set(e, { o });
  }

  /* ---------- 字幕 ---------- */
  const CAPS = (TL.captions || []).filter(c => c.e > c.s);
  const cap = CAPS.length && TL.showCaptions !== false ? (() => {
    const e = el('div', 'mk-cap mk-abs', document.getElementById('cap'), '<div class="c1"></div><div class="c2"></div>');
    return { e, c1: e.querySelector('.c1'), c2: e.querySelector('.c2') };
  })() : null;
  function capUpdate(t) {
    if (!cap) return;
    const q = CAPS.find(c => t >= c.s && t < c.e);
    if (q) { if(TL.captionLayout==='balanced-lines/1'&&String(q.text).split('\n').length>2)throw Error('CAPTION_TYPOGRAPHY: more than two explicit caption language rows; preserve complete text and real times in a supported fresh layout'); const [a, b = ''] = String(q.text).split('\n');
      if(publishArea||TL.captionLayout==='balanced-lines/1'){
        const cx=publishArea?(publishArea.left+publishArea.right)/2:(TL.captionAlignment==='content-center'&&HAS_P&&TL.layout==='landscape'&&cardAt(t).o>.5?(CARD.x-CARD.w/2)/2+40:W/2);
        const captionWidth=publishArea?publishArea.width:Math.min(L.cap.w,2*Math.min(cx,W-cx)-96);
        cap.e.style.width=captionWidth+'px';cap.e.style.boxSizing='border-box';
        if(cap._publishText!==q.text||(TL.captionLayout==='balanced-lines/1'&&cap._captionTypographyWidth!==captionWidth)){
          const wrapCaption=TL.captionLayout==='balanced-lines/1'?MotionCaptionTypography.wrap:MotionCaptionSafeArea.wrap;
          wrapCaption(cap.c1,a,captionWidth-48,TL.language||'zh');
          wrapCaption(cap.c2,b,captionWidth-48,'en');cap._publishText=q.text;
          if(TL.captionLayout==='balanced-lines/1')cap._captionTypographyWidth=captionWidth;
        }
      }else{html(cap.c1, esc(a)); html(cap.c2, esc(b));}
    }
    const o = q ? Math.min(clamp((t - q.s) / .12), clamp((q.e - t) / .12)) : 0;
    const previousScale=cap._s||1,rect=cap.e.getBoundingClientRect(),w=rect.width/previousScale,h=rect.height/previousScale;
    const alignment=TL.captionAlignment||'frame-center';
    const capCx = publishArea ? (publishArea.left+publishArea.right)/2 : alignment==='content-center' && HAS_P && TL.layout === 'landscape' && cardAt(t).o > .5 ? (CARD.x - CARD.w / 2) / 2 + 40 : W / 2;
    const safeWidth=Math.min(L.cap.w,2*Math.min(capCx,W-capCx)-96);
    cap._s=(publishArea||TL.captionLayout==='balanced-lines/1')?1:Math.min(1,safeWidth/Math.max(w,1));
    cap.e.dataset.alignment=alignment;
    set(cap.e, { x: capCx - w * cap._s / 2, y: (publishArea?publishArea.bottom:L.cap.y) - h*cap._s, s: cap._s, o });
    cap.e.style.transformOrigin = '0 0';
  }

  /* ---------- 求值 ---------- */
  let lastHint = null;
  window.renderAt = t => {
    t = clamp(t, 0, END);
    bgx.setTransform(1, 0, 0, 1, 0, 0); bgx.clearRect(0, 0, W, H);
    fgx.setTransform(1, 0, 0, 1, 0, 0); fgx.clearRect(0, 0, W, H);
    const live = slots.filter(s => t >= s.slot.t0 - 1e-4 && t < s.slot.t1 + 1e-4);
    const hint = (live[live.length - 1] || slots[0]).inst.hint || {};
    T.background(bgx, t, W, H, { floorY: H * (TL.layout === 'portrait' ? .58 : .76), ...hint });
    lastHint = hint;
    for (const s of slots) {
      const on = live.includes(s);
      s.root.style.display = on ? 'block' : 'none';
      if (!on) continue;
      s.inst.update(t);
      if (s.inst.bg) s.inst.bg(bgx, t);
      if (s.inst.fg) s.inst.fg(fgx, t);
    }
    /* 镜头：缓慢漂移 + 冲击震动；累积量用饱和曲线 */
    let sx = 0, sy = 0;
    for (const [a, amp, d] of MK.SHAKE) { const x = pr(t, a, a + d); if (x > 0 && x < 1) { const k = (1 - x) * amp; sx += k * MK.noise(t * 45); sy += k * MK.noise(t * 45 + 9); } }
    let z = 1 + .04 * (1 - Math.exp(-t / 9));
    for (const [a, k, d] of MK.PUNCH) { const x = pr(t, a, a + d); if (x > 0 && x < 1) z *= 1 + k * (x < .12 ? x / .12 : 1 - EZ.out((x - .12) / .88)); }
    const tf = `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px) translate(${(Math.sin(t * .31) * 4).toFixed(2)}px,${(Math.cos(t * .27) * 3).toFixed(2)}px) scale(${z.toFixed(4)})`;
    for (const id of ['world', 'front']) { const e = document.getElementById(id); e.style.transformOrigin = `${W / 2}px ${H / 2}px`; e.style.transform = tf; }
    /* 转场 */
    let fl = 0; wipe.style.transform = 'translateX(100%)'; let wf = '';
    for (const [a, k, d] of MK.FLASH) { const x = (t - a) / d; if (x >= 0 && x < 1) fl = Math.max(fl, k * Math.pow(1 - x, 2)); }
    for (const tr of transitions) {
      const x = (t - (tr.at - .22)) / .44; if (x < 0 || x > 1) continue;
      if (tr.kind === 'flash') fl = Math.max(fl, Math.max(0, 1 - Math.abs(x - .5) * 2.2) * .7);
      if (tr.kind === 'wipe') wipe.style.transform = `translateX(${lerp(100, -100, EZ.inout(x)).toFixed(2)}%)`;
      if (tr.kind === 'blur') wf = `blur(${(Math.sin(x * Math.PI) * 20).toFixed(1)}px)`;
    }
    /* 0.3.0 转场：整体变换叠加在镜头上；遮罩画在转场画布 */
    tfx.setTransform(1, 0, 0, 1, 0, 0); tfx.clearRect(0, 0, W, H);
    let tz = 1, tx = 0, tr2 = 0, dip = 0;
    for (const tr of transitions) {
      const x = (t - (tr.at - .22)) / .44; if (x < 0 || x > 1) continue;
      const before = x < .5, h = before ? x * 2 : (x - .5) * 2, bell = Math.sin(x * Math.PI);
      if (tr.kind === 'zoom') { tz *= before ? 1 + .45 * EZ.in(h) : 1 + .45 * (1 - EZ.out(h)); wf = `blur(${(bell * 16).toFixed(1)}px)`; fl = Math.max(fl, bell * .25); }
      if (tr.kind === 'whip') { tx += before ? -W * .45 * EZ.in(h) : W * .45 * (1 - EZ.out(h)); wf = `blur(${(bell * 26).toFixed(1)}px)`; }
      if (tr.kind === 'dip') dip = Math.max(dip, bell);
      if (tr.kind === 'glitch') {
        const fi = Math.floor(t * 60);
        tx += (MK.rnd(fi, 51) - .5) * 60 * bell;
        wf = `drop-shadow(${(8 * bell).toFixed(1)}px 0 rgba(255,40,90,.75)) drop-shadow(${(-8 * bell).toFixed(1)}px 0 rgba(${T.a},.75))`;
        for (let i = 0; i < 9; i++) { if (MK.rnd(fi + i, 52) > .55 * bell + .1) continue; const y = MK.rnd(fi + i, 53) * H, hh = 6 + MK.rnd(fi + i, 54) * 60; tfx.fillStyle = i % 3 ? `rgba(${T.a},${.35 * bell})` : `rgba(10,12,18,${.9 * bell})`; tfx.fillRect(0, y, W, hh); }
      }
      if (tr.kind === 'iris') {
        const R = Math.hypot(W, H) / 2 * (before ? 1 - EZ.in(h) : EZ.out(h));
        tfx.fillStyle = '#05060A'; tfx.beginPath(); tfx.rect(0, 0, W, H); tfx.arc(W / 2, H / 2, Math.max(0, R), 0, 7, true); tfx.fill('evenodd');
        tfx.strokeStyle = `rgba(${T.a},${.8 * bell})`; tfx.lineWidth = 3; tfx.beginPath(); tfx.arc(W / 2, H / 2, Math.max(0, R), 0, 7); tfx.stroke();
      }
      if (tr.kind === 'shutter') {
        const n = 8, bw = W / n;
        for (let i = 0; i < n; i++) { const d = i * .04, k = before ? EZ.inout(clamp((h - d) / (1 - .32))) : 1 - EZ.inout(clamp((h - d) / (1 - .32))); const w2 = bw * k; tfx.fillStyle = '#0B0D13'; tfx.fillRect(i * bw, 0, w2 + .5, H); if (k > .02 && k < .98) { tfx.fillStyle = `rgba(${T.a},.9)`; tfx.fillRect(i * bw + w2 - 2, 0, 2, H); } }
      }
      if (tr.kind === 'pixel') {
        const s = 48, cols = Math.ceil(W / s), rows = Math.ceil(H / s), cover = before ? EZ.in(h) : 1 - EZ.out(h);
        for (let yy = 0; yy < rows; yy++) for (let xx = 0; xx < cols; xx++) { if (MK.rnd(xx * 131 + yy, 55) > cover) continue; tfx.fillStyle = MK.rnd(xx + yy * 7, 56) > .85 ? `rgba(${T.a},.85)` : '#0B0D13'; tfx.fillRect(xx * s, yy * s, s + .5, s + .5); }
      }
    }
    if (tz !== 1 || tx) for (const id of ['world', 'front']) { const e = document.getElementById(id); e.style.transform = `translate(${tx.toFixed(2)}px,0) scale(${tz.toFixed(4)}) ` + e.style.transform; }
    flashEl.style.opacity = fl.toFixed(3);
    document.getElementById('world').style.filter = wf;
    /* 叠加层 */
    if (ovx) { ovx.setTransform(1, 0, 0, 1, 0, 0); ovx.clearRect(0, 0, W, H); }
    for (const s of overlays) {
      const on = t >= s.slot.t0 - 1e-4 && t < s.slot.t1 + 1e-4;
      s.root.style.display = on ? 'block' : 'none';
      if (!on) continue;
      s.inst.update(t);
      if (s.inst.fg && ovx) s.inst.fg(ovx, t);
    }
    tkUpdate(t); hudUpdate(t); capUpdate(t);
    const tail = TL.ending === 'cut' ? 0 : clamp((t - (END - .55)) / .5);
    fade.style.opacity = Math.max(1 - clamp(t / .25), tail, dip).toFixed(3);
  };

  /* motiongit.initial-text-font-readiness/1 */
  function initialFontDescriptor(style) {
    if (style.font.trim()) return style.font;
    const widths = { '50%': 'ultra-condensed', '62.5%': 'extra-condensed', '75%': 'condensed', '87.5%': 'semi-condensed', '100%': 'normal', '112.5%': 'semi-expanded', '125%': 'expanded', '150%': 'extra-expanded', '200%': 'ultra-expanded' };
    const stretch = style.fontStretch.trim(), width = widths[stretch] || (Object.values(widths).includes(stretch) ? stretch : null);
    // Font shorthand cannot express arbitrary percentage widths. Preserve their
    // native loading behavior; do not substitute a different face or reject CSS.
    if (!width) return null;
    const parts = [style.fontStyle, style.fontWeight, ...(width === 'normal' ? [] : [width]), style.fontSize, style.fontFamily];
    if (parts.some(value => !value.trim())) throw Error('Incomplete computed font descriptor');
    return parts.join(' ');
  }
  async function withInitialFontTimeout(stage, task) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(task),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const pending = [...document.fonts].filter(face => face.status === 'loading').map(face => face.family + ' ' + face.weight + ' ' + face.style);
            reject(Error('Initial font readiness timed out after 30000 ms (' + stage + '): ' + (pending.join(', ') || 'font readiness pending')));
          }, 30000);
        }),
      ]);
    } finally { clearTimeout(timer); }
  }
  async function waitForInitialTextFonts(roots) {
    const requests = new Map(), nativeWidths = new Set();
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent;
        if (!text.trim()) continue;
        const style = getComputedStyle(node.parentElement), font = initialFontDescriptor(style);
        if (font === null) { nativeWidths.add(style.fontStretch + ' ' + style.fontFamily); continue; }
        requests.set(font, (requests.get(font) || '') + text);
      }
    }
    if (nativeWidths.size) console.warn('Initial font preload retains native loading for widths not representable by font shorthand: ' + [...nativeWidths].join('; '));
    await Promise.all([...requests].map(async ([font, text]) => {
      try { await document.fonts.load(font, text); }
      catch (error) { throw Error('Initial text font loading failed for ' + font + ': ' + error.message, { cause: error }); }
    }));
    await document.fonts.ready;
  }

  window.READY = (async () => {
    await withInitialFontTimeout('initial readiness and Latin preload', async () => {
      await document.fonts.ready;
      await Promise.all(["700 96px Geist", "500 20px 'Geist Mono'"].map(f => document.fonts.load(f, 'Aa0')));
    });
    await Promise.all(window.PRELOAD.map(im => (im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))));
    await withInitialFontTimeout('actual text', () => waitForInitialTextFonts([...slots, ...overlays].map(s => s.root)));
    for (const f of measures) f();
    /* adunext.portrait-presenter/1：竖屏每段量一次内容，人物卡放在内容下方能放下的最大一档。 */
    if (TL.layout === 'portrait' && TK && window.PortraitPresenter) {
      const vis = e => { for (let q = e; q && q !== document.body; q = q.parentElement) { const s = getComputedStyle(q); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < .05) return false; } return true; };
      const poses = [];
      for (let i = 0; i < slots.length; i++) {
        const mode = cardKey[i], rects = [];
        if (mode !== 'hide') for (const f of [.45, .7, .95]) {
          window.renderAt(slots[i].slot.t0 + (slots[i].slot.t1 - slots[i].slot.t0) * f - .02);
          for (const e of slots[i].root.querySelectorAll('*')) {
            if (e.children.length || !vis(e) || TK.e.contains(e)) continue;
            const r = e.getBoundingClientRect(), w = r.width, h = r.height;
            if (w < 2 && h < 2 || w >= 1000 && h >= 1000 || r.bottom < 235 || r.top > 1560) continue;
            rects.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, strong: parseFloat(getComputedStyle(e).fontSize) >= 26 && !!e.textContent.trim() });
          }
        }
        poses.push(mode === 'hide' ? null : window.PortraitPresenter.pick('card', rects, { hint: { right: true } }));
      }
      PORTRAIT_POSES = poses;
      window.PORTRAIT_PRESENTER_TRACK = poses.map((p, i) => ({ segment: i, control: TL.segments[i].control, pose: p ? p.name : 'HIDE', crowded: p?.crowded || false }));
    }
    for (const s of slots) s.root.style.display = 'none';
    for (const s of overlays) s.root.style.display = 'none';
    window.renderAt(0);
    await window.imgWait();
    document.title = 'done';
  })();
})();
