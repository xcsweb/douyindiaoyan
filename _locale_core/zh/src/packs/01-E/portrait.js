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

/* adunext.portrait-presenter/1 · director
   原生场景的竖屏人物统一调度（01 现代图文、02 纸面透视、03 深色立体、04 科技控制台、05 鲜色角色）。
   原生代码照常摆人物；本层最后运行：按每段时间里内容的实际矩形选档（PortraitPresenter.pick），
   再用 translate / scale（独立属性，不碰原生 transform）把人物窗搬到档位上。透明度与原生动作时钟不改。 */
(function (root) {
  'use strict';
  if (root.PortraitDirector || !root.PortraitPresenter) return;
  const PP = root.PortraitPresenter;
  const cfg = root.PACK_LAYOUT || {};
  if (cfg.name && cfg.name !== 'portrait') return;
  const C = (typeof CONFIG !== 'undefined' ? CONFIG : root.CONFIG) || {};
  if (!((C.height || 1080) > (C.width || 1920)) && cfg.name !== 'portrait') return;
  const SEL = '.cam,.tkc,[data-pr-node=camera]';
  let track = null, cache = null, building = false, now = 0;

  const visible = e => { for (let q = e; q && q !== document.body; q = q.parentElement) { const s = getComputedStyle(q); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < .04) return false; } return true; };
  function scenes() {
    // SCENES / MACRO_PLAN 可能是顶层 const（不挂在 window 上），按名字取。
    const plan = typeof MACRO_PLAN !== 'undefined' ? MACRO_PLAN : root.MACRO_PLAN, fps = plan?.fps || C.fps || 60;
    const list = typeof SCENES !== 'undefined' ? SCENES : root.SCENES || [];
    return list.map((sc, i) => {
      const p = plan?.scenes?.[i];
      const t0 = p ? p.output_start_frame / fps : sc.s, t1 = p ? (p.output_end_frame ?? plan.scenes[i + 1]?.output_start_frame ?? p.output_start_frame + 300) / fps : sc.e;
      return { el: sc.el, top: sc.top, t0, t1, id: p?.sceneId || sc.id };
    });
  }
  // 人物窗的「载体」：从人物往上，直到父节点不再只装着它（不搬动同层的其他内容）。
  function carriers(el) {
    const out = new Map();
    for (const p of el.querySelectorAll(SEL)) {
      if (p.parentElement?.closest(SEL)) continue;
      let c = p.closest('.e') && el.contains(p.closest('.e')) ? p.closest('.e') : p;
      while (c.parentElement && c.parentElement !== el && c.parentElement.children.length === 1 && !c.parentElement.matches('.sc,#world,#front,#tk,body')) c = c.parentElement;
      if (!out.has(c)) out.set(c, p);
    }
    return [...out].map(([carrier, presenter]) => ({ carrier, presenter }));
  }
  function nodeRect(e) {
    const shapes = [...e.querySelectorAll('svg path,svg circle,svg rect,svg line,svg polyline,svg polygon')].map(q => q.getBoundingClientRect()).filter(r => r.width > 0 || r.height > 0);
    if (e.querySelector('svg') && shapes.length && !e.querySelector('img,div')) return shapes.reduce((a, r) => ({ left: Math.min(a.left, r.left), top: Math.min(a.top, r.top), right: Math.max(a.right, r.right), bottom: Math.max(a.bottom, r.bottom) }), { left: 1e9, top: 1e9, right: -1e9, bottom: -1e9 });
    return e.getBoundingClientRect();
  }
  // 场景里的内容矩形：排除人物、整屏背景、顶部角标区（y<235）和底部进度条区（y>1560）。
  function contentRects(sc, own) {
    const rows = [], skip = [...own.map(o => o.carrier), ...document.querySelectorAll(SEL)];
    for (const r0 of [sc.el, sc.top].filter(Boolean)) for (const e of r0.querySelectorAll('.e,canvas,img,svg')) {
      if (e.matches('.e') && e.querySelector('.e')) continue;
      if (!e.matches('.e') && e.closest('.e')) continue;
      if (skip.some(c => c === e || c.contains(e) || e.contains(c)) || !visible(e)) continue;
      const r = nodeRect(e), w = r.right - r.left, h = r.bottom - r.top;
      // 接近整屏的层（背景画布、整屏光效）当背景，不算内容。
      if (w < 2 && h < 2 || w >= 1080 * .8 && h >= 1920 * .6 || r.bottom < 235 || r.top > 1560) continue;
      let strong = false;
      for (const q of [e, ...e.querySelectorAll('*')]) if ([...q.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(q).fontSize) * (e.getBoundingClientRect().height / (e.offsetHeight || 1)) >= 26) { strong = true; break; }
      rows.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, strong });
    }
    return rows;
  }
  const round = p => { const s = getComputedStyle(p); return parseFloat(s.borderTopLeftRadius) >= Math.min(p.offsetWidth, p.offsetHeight) / 2 * .8; };

  // 父节点坐标 → 屏幕坐标的线性部分（用三个零尺寸探针量出来，支持任意 2D 变换）。
  function parentLinear(parent) {
    let probes = parent._ppProbes;
    if (!probes) {
      probes = parent._ppProbes = [[0, 0], [100, 0], [0, 100]].map(([x, y]) => { const d = document.createElement('i'); d.dataset.portraitProbe = ''; d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:0;height:0;pointer-events:none;visibility:hidden`; parent.appendChild(d); return d; });
    }
    const [o, a, b] = probes.map(d => d.getBoundingClientRect());
    return { a: (a.left - o.left) / 100, b: (a.top - o.top) / 100, c: (b.left - o.left) / 100, d: (b.top - o.top) / 100 };
  }
  // 原生整屏人物（作为背景）保持原样。
  function isFull(p) { const r = p.getBoundingClientRect(); return r.width >= 1080 * .9 && r.height >= 1920 * .9; }
  // .tkc（05 / 06）：直接画成档位尺寸，按本工作区取景规则重新取景，不靠放大。
  function resize(presenter, P) {
    if (!presenter.matches('.tkc')) return;
    const img = presenter.querySelector('img');
    presenter.style.width = P.w + 'px'; presenter.style.height = P.h + 'px'; presenter.style.borderRadius = Math.min(P.r, P.w / 2) + 'px';
    if (!img || !img.naturalWidth) return;
    const face = typeof faceAt === 'function' ? faceAt(now) : null, f = PP.frame(img.naturalWidth, img.naturalHeight, P.w, P.h, face, P.r >= Math.min(P.w, P.h) / 2 * .8);
    Object.assign(img.style, { position: 'absolute', left: f.x + 'px', top: f.y + 'px', width: f.width + 'px', height: f.height + 'px', maxWidth: 'none', objectFit: 'fill', inset: 'auto' });
  }
  function place(carrier, presenter, P) {
    carrier.style.scale = ''; carrier.style.translate = '';
    if (isFull(presenter)) return null;
    resize(presenter, P);
    const r = presenter.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    const k = Math.min(P.w / r.width, P.h / r.height);
    carrier.style.scale = String(k);
    const r2 = presenter.getBoundingClientRect();
    const dx = P.x - (r2.left + r2.width / 2), dy = P.y - (r2.top + r2.height / 2);
    const L = parentLinear(carrier.parentElement), det = L.a * L.d - L.b * L.c || 1;
    const lx = (L.d * dx - L.c * dy) / det, ly = (-L.b * dx + L.a * dy) / det;
    carrier.style.translate = `${lx.toFixed(3)}px ${ly.toFixed(3)}px`;
    const img = presenter.querySelector('img');
    return { k, imageScale: img && img.naturalWidth ? img.getBoundingClientRect().width / img.naturalWidth : null };
  }

  function active(t) {
    if (!cache) return null;
    return cache.find(s => t >= s.t0 - 1e-4 && t < s.t1) || null;
  }
  function apply() {
    if (!track || building) return;
    const t = now, sc = active(t);
    if (!sc) return;
    const P = PP.track(track, t);
    for (const sc2 of cache) if (sc2 !== sc) for (const o of sc2.own) { o.carrier.style.scale = ''; o.carrier.style.translate = ''; }
    for (const o of sc.own) {
      if (!visible(o.presenter) || P.name === 'OFF') { o.carrier.style.scale = ''; o.carrier.style.translate = ''; continue; }
      const res = place(o.carrier, o.presenter, P);
      if (res && root.PORTRAIT_DEBUG_SCALE) (root.PORTRAIT_IMAGE_SCALE ??= []).push({ t, pose: P.name, ...res });
    }
  }
  // 原生尺寸钩子：能自己按尺寸重新取景的人物窗（03 深色立体）直接画成档位尺寸，避免放大。
  function size() { if (!track || building) return null; const P = PP.track(track, now); return P.name === 'OFF' ? null : P; }

  async function build() {
    building = true;
    try {
      const list = scenes(), keys = [], report = [];
      // 人物在场景里（01–05），或在全局人物层 #tk（06 活力海报：每个单元一张，只有当前单元可见）。
      const globalOwn = carriers(document.getElementById('tk') || document.body);
      cache = list.map(sc => { const own = carriers(sc.el); return { ...sc, own: own.length ? own : globalOwn, global: !own.length }; });
      for (const sc of cache) {
        if (!sc.own.length) continue;
        await inner(Math.min(sc.t1 - .05, sc.t0 + Math.min(1.2, (sc.t1 - sc.t0) * .5)));
        const shown = sc.own.find(o => visible(o.presenter) && !isFull(o.presenter));
        if (sc.global && !shown) continue;
        const kind = round((shown || sc.own[0]).presenter) ? 'circle' : 'card';
        const len = sc.t1 - sc.t0, n = Math.max(1, Math.round(len / 1.2)), step = len / n;
        let runs = [];
        for (let i = 0; i < n; i++) {
          const a = sc.t0 + i * step, b = a + step, rects = [];
          for (const t of [a + step * .15, a + step * .55, Math.min(sc.t1 - .04, b + .05)]) { await inner(Math.max(sc.t0, Math.min(sc.t1 - .04, t))); rects.push(...contentRects(sc, sc.own)); }
          runs.push({ a, b, rects });
        }
        const choose = r => (r.pose = PP.pick(kind, r.rects, { hint: { right: true } }), r);
        const merge = () => { for (let k = runs.length - 1; k > 0; k--) if (runs[k - 1].pose.name === runs[k].pose.name) { runs[k - 1] = { a: runs[k - 1].a, b: runs[k].b, rects: [...runs[k - 1].rects, ...runs[k].rects], pose: runs[k - 1].pose }; runs.splice(k, 1); } };
        runs = runs.map(choose); merge();
        for (let g = 0; g < 40 && runs.length > 1; g++) {
          const i = runs.findIndex(r => r.b - r.a < 1.8); if (i < 0) break;
          const j = i === 0 ? 1 : i === runs.length - 1 ? i - 1 : (runs[i - 1].b - runs[i - 1].a < runs[i + 1].b - runs[i + 1].a ? i - 1 : i + 1), lo = Math.min(i, j);
          runs.splice(lo, 2, choose({ a: runs[lo].a, b: runs[lo + 1].b, rects: [...runs[lo].rects, ...runs[lo + 1].rects] })); merge();
        }
        runs.forEach((r, j) => {
          const at = keys.length ? Math.max(0, r.a - .45) : 0;
          while (keys.length > 1 && at - keys[keys.length - 1].t < .2) keys.pop();
          keys.push({ t: at, d: keys.length ? .7 : 0, pose: r.pose });
          report.push({ scene: sc.id, t: +r.a.toFixed(2), kind, pose: r.pose.name, crowded: r.pose.crowded || false });
        });
      }
      track = keys.sort((a, b) => a.t - b.t);
      root.PORTRAIT_PRESENTER_TRACK = report;
    } finally { building = false; }
    await inner(0);
  }

  // 让本层在每次渲染的最后运行。renderAt 按「赋值栈」管理：每次读到的是「当时那一层」的代理，
  // 后面的层把它存成 original 再包一层也不会绕回自己；每层渲染完都校正一次（幂等），最外层最后校正。
  const stack = [], proxies = [];
  if (typeof root.renderAt === 'function') stack.push(root.renderAt);
  function proxy(k) {
    return proxies[k] || (proxies[k] = function (t) {
      const f = stack[k - 1], r = f.apply(this, arguments);
      if (r && r.then) return r.then(v => { now = +t || 0; apply(); return v; });
      now = +t || 0; apply(); return r;
    });
  }
  // 量内容时每帧都等图片加载完，避免切到下一帧时中断请求（官方渲染器会把中断当成错误）。
  const settle = () => root.imgWait ? root.imgWait() : Promise.all([...document.images].filter(i => i.src && !i.complete).map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); })));
  async function inner(t) { now = t; const r = stack.length ? proxy(stack.length)(t) : null; if (r && r.then) await r; await settle(); return r; }
  try {
    Object.defineProperty(root, 'renderAt', { configurable: true,
      get: () => stack.length ? proxy(stack.length) : undefined,
      set: f => { const k = proxies.indexOf(f); if (k > 0) stack.length = k; else if (typeof f === 'function') stack.push(f); } });
  } catch (e) {}
  // READY：脚本加载期间原样返回（各层照常串接）；页面加载完以后读取时，等最终的 READY 完成再量一次内容、建轨道。
  let readyValue = root.READY, built = null, builtFor;
  try {
    Object.defineProperty(root, 'READY', { configurable: true,
      get: () => {
        if (readyValue === undefined || document.readyState !== 'complete') return readyValue;
        const v = readyValue;
        return Promise.resolve(v).then(async x => { if (builtFor !== v) { builtFor = v; built = build(); } await built; return x; });
      },
      set: v => { readyValue = v; } });
  } catch (e) {}
  root.PortraitDirector = { apply, size, get track() { return track; } };
})(globalThis);

/* Per-object output geometry. Source elements, timing, media sampling and SFX
   remain untouched; wrappers carry only native positions and uniform sizes. */
(()=>{'use strict';
const cfg=window.PACK_LAYOUT;if(!cfg||cfg.name!=='portrait')return;
const id=cfg.pack;
const profiles={
 'classic-performance':{x0:146,sx:.70,y0:130,sy:1.5,y:430,k:.70},
 'continuous-performance':{x0:146,sx:.70,y0:130,sy:1.5,y:430,k:.70},
 'stage-performance':{x0:560,sx:.84,y0:130,sy:1.5,y:430,k:.78},
 'editorial-performance':{x0:834,sx:.96,y0:130,sy:1.5,y:430,k:.94},
 'kinetic-performance':{x0:128,sx:.76,y0:130,sy:1.5,y:430,k:.76},
 'paper-balance':{x0:100,sx:.72,y0:100,sy:.72,y:580,k:.72},
 'paper-ball-performance':{x0:100,sx:.65,y0:0,sy:.65,y:500,k:.65},
 'doubao-console-performance':{x0:100,sx:.70,y0:0,sy:.70,y:500,k:.70}
};
const p=profiles[id];if(!p)throw Error('No reviewed portrait profile for '+id);
const states=[],nativeConsole=[];let initialized=false;
const original=window.renderAt;
const lerp=(a,b,k)=>a+(b-a)*k;
function point(x,y){return[64+(x-p.x0)*p.sx,p.y+(y-p.y0)*p.sy];}
function translate(e){const s=e.style.transform,m=s.match(/translate(?:3d)?\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/);return m?[+m[1],+m[2]]:[0,0];}
function wrap(e,map,k=p.k,offset=[0,0]){const w=document.createElement('div');w.className='portrait-island';e.parentNode.insertBefore(w,e);w.appendChild(e);const state={e,w,map,k,offset};states.push(state);return state;}
function camera(e,parent=[0,0]){const body=e.querySelector('.cam')||e;const a=wrap(e,(x,y)=>[900+(x-(e._x||x))*.08,240+(y-(e._y||y))*.08],1,parent);a.camera=body;return a;}
function fixed(x,y,sx=.35,sy=.5,source=null){return (a,b,e)=>[x+(a-(source?.[0]??e._x??a))*sx,y+(b-(source?.[1]??e._y??b))*sy];}
function setup(sc,sceneId){
 const pb=sc.el.querySelector('.pb-host'),nd=sc.el.querySelector('.nd-host'),db=sc.el.querySelector('.doubao-host');
 if(pb){setupPaperBall(pb,sceneId);return;}
 if(nd){setupBalance(nd);return;}
 if(db){setupConsole(db,sceneId);return;}
 const sp={...p,...(id==='stage-performance'&&sceneId==='decompose-and-consolidate'?{x0:146,sx:.8,k:.8}:{}),...(id==='editorial-performance'&&sceneId==='evidence-and-focus'?{x0:96,sx:.62,k:.72}: {})};
 const native=(x,y)=>[64+(x-sp.x0)*sp.sx,sp.y+(y-sp.y0)*sp.sy];
 const all=[...sc.el.querySelectorAll('.e')].filter(e=>typeof e._x==='number'&&(!e.parentElement.closest('.e')||(e.parentElement.closest('.e').style.width==='1920px'&&e.parentElement.closest('.e').style.height==='1080px')));
 for(const e of all){
  if(e.style.width==='1920px'&&e.style.height==='1080px'&&e.querySelector('.e')){e._portraitRig=true;continue;}
  const b=e.firstElementChild;
  if(b?.classList.contains('cam')){camera(e);continue;}
  if(b?.classList.contains('tag')){wrap(e,fixed(e._ax?740:64,e._ax?88:48,0,0),.9);continue;}
  if(e._p){wrap(e,fixed(64,1872,0,0),936/1628);continue;}
  if(id==='stage-performance'&&e._x<0){wrap(e,(x,y)=>[x*.55,y*1.65],.85);continue;}
  if(id==='stage-performance'&&e._x>=1800){wrap(e,fixed(1020,410),.7);continue;}
  if(id==='editorial-performance'&&e._y>=40&&e._y<=55){wrap(e,fixed(e._ax?740:64,e._ax?88:48,0,0),.9);continue;}
  if(id==='editorial-performance'&&[798,767].includes(e._x)){e.style.display='none';e._portraitDecoration=true;continue;}
  if(id==='editorial-performance'&&e._y===107){wrap(e,fixed(64,140,0,0),936/1728);continue;}
  let k=sp.k,map=(x,y)=>native(x,y);
  if(b?.tagName==='SVG'){wrap(e,map,[sp.sx,sp.sy]);continue;}
  const body=b||e,width=Math.max(body.offsetWidth,body.scrollWidth,e.offsetWidth,e.scrollWidth),font=parseFloat(getComputedStyle(body).fontSize);
  if(!body.querySelector('img,svg')&&font>=55){k=Math.min(.9,936/Math.max(1,width));}
  if(width>1350)k=Math.min(k,936/width);
  if(font>=70&&!body.querySelector('img,svg')&&font*k<44)throw Error('Portrait headline below 44px: '+sceneId+'; shorten this slot or choose a different group');
  if(id==='editorial-performance'&&sceneId==='evidence-and-focus'){
   if(b?.classList.contains('macwin')){map=fixed(540,1000,.5,.8,[708,510]);k=936/1212;}
   if(e._x>=1400&&e._y>=400&&e._y<=810){const row=Math.min(2,Math.max(0,Math.floor((e._y-424)/127)));map=fixed(64+row*312,e._y%127>100?1475:1410,.6,.8);k=.75;}
  }
  if(id==='kinetic-performance'&&sceneId==='evidence-and-focus'&&e._x>=1150){const j=Math.round((e._y-327)/161);map=fixed(64+j*312,1420,.6,.8);k=.65;}
  if(id==='stage-performance'&&sceneId==='decompose-and-consolidate'&&e._x===146)k=Math.min(k,.78);
  wrap(e,map,k);
 }
}
function setupBalance(host){
 const world=host.querySelector('.nd-world');
 for(const e of [...world.children]){
  if(e.classList.contains('cam')){camera(e,[960,540]);continue;}
  // The illustration's aspect ratio is episode-owned, so fit its actual width.
  const width=Math.max(e.offsetWidth,e.scrollWidth);
  wrap(e,(x,y)=>[540+(x+470)*.72,1050+(y+60)*.72],Math.min(.82,936/Math.max(1,width)),[960,540]);
 }
 const ov=host.querySelector('.nd-camera')?.parentElement.querySelector('.ov');
 if(ov)for(const e of [...ov.children]){
  const left=parseFloat(e.style.left)||0,top=parseFloat(e.style.top)||0;
  const centered=e.style.right==='0px'&&left===0,cards=centered&&!!e.querySelector('.g2c');
  if(centered){e.style.width=cards?'1101px':'1920px';if(cards){e.style.flexDirection='column';e.style.alignItems='center';e.style.gap='44px';}}
  const w=parseFloat(e.style.width)||e.offsetWidth;
  let k=Math.min(.85,936/Math.max(1,w));
  const map=e.classList.contains('hand')?fixed(64,1450,.72,.72,[left,top]):centered?(x,y)=>[64+(x-left)*.72,point(x,y)[1]]:(x,y)=>point(x,y);
  wrap(e,map,k);
  e._portraitOffset=[left,top];
 }
 // Hand-drawn paths are an independent paper overlay, retaining circular strokes.
 const ink=host.querySelector('svg');if(ink)wrap(ink,(x,y)=>point(x,y),p.k);
}
function setupPaperBall(host,sceneId){
 for(const e of [...host.querySelectorAll('.it')]){
  const k=e.classList.contains('kin')?p.k:(e.querySelector('.ln')?.parentElement||e).classList.contains('dcard')?.9:p.k;
  wrap(e,(x,y)=>point(x,y),k);
 }
 for(const c of host.querySelectorAll('canvas'))wrap(c,(x,y)=>point(x,y),p.k);
 for(const svg of host.querySelectorAll('.scn>svg.ink'))wrap(svg,(x,y)=>point(x,y),p.k);
 const cam=host.querySelector('[data-pb-node=cam]');if(cam)camera(cam);
 for(const key of ['ball','halo']){const e=host.querySelector('[data-pb-node='+key+']');if(e)wrap(e,(x,y)=>point(x,y),p.k);}
 const meta=host.querySelector('[data-pb-node=meta]');if(meta)meta.style.display='none';
}
function setupConsole(host,sceneId){
 const root=host.querySelector('[data-doubao-node=world] .sc');
 const n=[...root.children].filter(e=>e.classList.contains('e'));
 const expected={'fusion-success':5,'three-step-chat':9,'manual-agents-delivery':6};
 if(n.length!==expected[sceneId])throw Error('Console portrait structure changed: '+sceneId+':'+n.length);
 const at=(i,x,y,k=.9,source=null)=>wrap(n[i],fixed(x,y,.7,.7,source),k);
 if(sceneId==='fusion-success'){
  at(0,64,430,.86);at(1,64,1470,1.06);
  for(let i=2;i<5;i++)wrap(n[i],(x,y)=>point(x,y),.9);
 }
 if(sceneId==='three-step-chat'){
  at(0,540,700,1.08);
  for(let i=0;i<3;i++)at(i+1,82+i*318,510,1);
  at(4,940,850,1);at(5,940,1050,1);at(6,780,1260,1);at(7,940,1360,1);at(8,140,1470,1.08);
 }
 if(sceneId==='manual-agents-delivery'){
  at(0,64,430,.9);at(1,670,1050,1.02);
  for(let i=0;i<3;i++)at(i+2,110,920+i*180,.98);
  at(5,540,1450,1,[1100,500]);
 }
 if(sceneId==='fusion-success'){for(const c of host.querySelectorAll('canvas'))wrap(c,(x,y)=>point(x,y),p.k);}
 else{
  for(const c of host.querySelectorAll('canvas'))c.style.display='none';
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;canvas.style.cssText='position:absolute;inset:0;pointer-events:none';
  host.querySelector('[data-doubao-node=world]').prepend(canvas);nativeConsole.push({sc:host.closest('.sc'),id:sceneId,ctx:canvas.getContext('2d')});
 }
 const tk=host.querySelector('.tkc');if(tk)camera(tk);
 const hud=host.querySelector('[data-doubao-node=hud]');
 const h=[...hud.children].filter(e=>e.classList.contains('e'));
 h.forEach((e,i)=>wrap(e,fixed(i===1?740:i===2?540:64,i===0?48:i===1?88:i===2?150:1872,0,0),i===3?936/1792:.9));
 // Inner depth/drift camera is recentered after source update, not removed.
 root._portraitInner=true;
}
// These two console scenes change column topology in portrait. Their native
// connectors use the original activation/impact times, retaining source SFX.
function sourceTime(sc){const index=SCENES.findIndex(s=>s.el===sc),item=MACRO_PLAN.scenes[index],f=window.MACRO_OUTPUT_T*MACRO_PLAN.fps,a=item.time_map;for(let j=1;j<a.length;j++)if(f<=a[j].output_frame||j===a.length-1){const q=Math.max(0,Math.min(1,(f-a[j-1].output_frame)/(a[j].output_frame-a[j-1].output_frame)));return lerp(a[j-1].source,a[j].source,q);}return a[0].source;}
function drawConsole(view){
 if(view.sc.style.display==='none')return;
 const t=sourceTime(view.sc),c=view.ctx,manual=view.id==='manual-agents-delivery';
 const q=(a,b)=>Math.max(0,Math.min(1,(t-a)/(b-a))),hash=i=>{const v=Math.sin(i*127.1+311.7)*43758.5453;return v-Math.floor(v);};
 c.clearRect(0,0,1080,1920);c.fillStyle='#06070A';c.fillRect(0,0,1080,1920);
 const glow=c.createRadialGradient(600,1050,0,600,1050,850);glow.addColorStop(0,'#142031');glow.addColorStop(1,'#06070A');c.fillStyle=glow;c.fillRect(0,0,1080,1920);
 c.strokeStyle='rgba(124,200,255,.06)';c.lineWidth=1;
 for(let i=0;i<13;i++){c.beginPath();c.moveTo(540,1550);c.lineTo(i*100-100,1920);c.stroke();}
 for(let i=0;i<8;i++){const y=1550+i*i*7;c.beginPath();c.moveTo(0,y);c.lineTo(1080,y);c.stroke();}
 for(let i=0;i<50;i++){c.globalAlpha=.12+.22*hash(i+4);c.fillStyle='#8fc9ed';c.beginPath();c.arc(hash(i)*1080,(hash(i+8)*1920+t*(4+hash(i+7)*8))%1920,1+hash(i+2),0,Math.PI*2);c.fill();}c.globalAlpha=1;
 function beam(x0,y0,x1,y1,k,col){if(k<=0)return;c.strokeStyle=col;c.shadowColor=col;c.shadowBlur=12;c.lineWidth=2;c.beginPath();c.moveTo(x0,y0);c.lineTo(lerp(x0,x1,k),lerp(y0,y1,k));c.stroke();c.shadowBlur=0;for(let j=0;j<4;j++){const p=((t*1.1+j/4)%1)*k;c.fillStyle=col;c.beginPath();c.arc(lerp(x0,x1,p),lerp(y0,y1,p),3,0,Math.PI*2);c.fill();}}
 function sphere(x,y,k,col){if(k<=0)return;const r=31*(.4+.6*k),g=c.createRadialGradient(x-r*.3,y-r*.35,0,x,y,r*3);g.addColorStop(0,'#fff');g.addColorStop(.12,col);g.addColorStop(.34,col+'88');g.addColorStop(1,col+'00');c.fillStyle=g;c.beginPath();c.arc(x,y,r*3,0,Math.PI*2);c.fill();c.strokeStyle=col;c.lineWidth=1;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.stroke();}
 if(manual){const times=[53.13,53.93,54.87],colors=['#7CC8FF','#FFB648','#BEA0FF'];for(let i=0;i<3;i++){const k=q(times[i]-.1,times[i]+.3),y=920+i*180;sphere(64,y,k,colors[i]);beam(98,y,384,928+i*122,q(times[i]+.1,times[i]+.6)*(1-q(60.5,61)),colors[i]);}}
 else{beam(154,510,360,510,q(20.07,20.47),'#7CC8FF');beam(472,510,678,510,q(25.03,25.43),'#7CC8FF');}
 for(const [time,x,y,col] of manual?[[58.73,670,1254,'#3DDC84'],[60.8,771,1534,'#3DDC84']]:[[19.95,780,900,'#7CC8FF'],[26.7,400,1510,'#3DDC84']]){const age=t-time;if(age<0||age>1)continue;c.globalAlpha=(1-age)*.8;c.fillStyle=col;for(let i=0;i<40;i++){const ang=hash(i+time)*Math.PI*2,d=age*(150+hash(i)*400);c.fillRect(x+Math.cos(ang)*d,y+Math.sin(ang)*d+age*age*100,2+hash(i+5)*3,2+hash(i+5)*3);}c.globalAlpha=1;}
}
function tick(){
 for(const a of states){
  const e=a.e,[tx,ty]=translate(e),off=e._portraitOffset||[0,0],x=tx+off[0],y=ty+off[1];
  let [nx,ny]=a.map(x,y,e),k=a.k;
  if(a.camera){const w=a.camera.offsetWidth;k=220/Math.max(1,w);if(typeof e._x!=='number'&&!e.style.transform.startsWith('translate(-50%')){nx-=110;ny-=a.camera.offsetHeight*k/2;}}
  const [kx,ky]=Array.isArray(k)?k:[k,k];
  a.w.style.transform=`translate(${(nx-a.offset[0]-kx*x).toFixed(4)}px,${(ny-a.offset[1]-ky*y).toFixed(4)}px) scale(${kx},${ky})`;
 }
 for(const sc of SCENES){
  for(const rig of sc.el.querySelectorAll('.e'))if(rig._portraitRig){const [x,y]=translate(rig),s=rig.style.transform.match(/scale\(([^,)]+)/);rig.style.transformOrigin='540px 960px';rig.style.transform=`translate(${(x-960)*.6}px,${(y-540)*1.5}px) scale(${s?+s[1]:1})`;}
  for(const e of sc.el.querySelectorAll('[data-doubao-node=world],[data-doubao-node=front]')){e.style.transformOrigin='540px 960px';const [x,y]=translate(e);e.style.transform=e.style.transform.replace(/translate\([^)]*\)/,`translate(${x*.7}px,${y*.7}px)`);}
  for(const e of sc.el.querySelectorAll('[data-pb-node=main]'))e.style.transformOrigin='540px 960px';
 }
 for(const view of nativeConsole)drawConsole(view);
 const world=document.getElementById('world');
 if(world?.style.transform){world.style.transform=world.style.transform.replace(/translate\(960px,\s*540px\)/g,'translate(540px,960px)').replace(/translate\(-960px,\s*-540px\)/g,'translate(-540px,-960px)');}
 const circle=document.getElementById('fx')?.children[1];if(circle){circle.style.left='540px';circle.style.top='960px';}
 for(const sc of SCENES){const circle=sc.el.querySelector('[data-doubao-node=fx]')?.children[1];if(circle){circle.style.left='900px';circle.style.top='240px';}}
}
// Source procedural canvases clear pixels but can leave blend/alpha state.
// Reset before seeking so a prior impact cannot tint the next requested frame.
function resetCanvas(){for(const sc of SCENES)for(const canvas of sc.el.querySelectorAll('canvas')){const ctx=canvas.getContext('2d');if(ctx.reset)ctx.reset();else canvas.width=canvas.width;}}
window.renderAt=async function(t){if(!initialized)return original(t);resetCanvas();const result=await original(t);tick();return result;};
const ready=window.READY||Promise.resolve();
window.READY=Promise.resolve(ready).then(async()=>{
 const plans=window.MACRO_PLAN?.scenes||[];
 if(plans.length!==SCENES.length)throw Error('Portrait scene/plan count differs');
 for(let i=0;i<SCENES.length;i++){await original(plans[i].output_start_frame/(MACRO_PLAN.fps||60));setup(SCENES[i],plans[i].layoutSceneId||plans[i].sceneId);}
 initialized=true;await window.renderAt(0);
 window.PORTRAIT_REPORT={schema:'adu-native-portrait/1',pack:id,width:1080,height:1920,
  scenes:plans.map(s=>s.sceneId),islands:states.length,sourceClock:'unchanged',audioClock:'unchanged',
  status:'geometry-ready-needs-episode-audiovisual-review'};
});
})();
