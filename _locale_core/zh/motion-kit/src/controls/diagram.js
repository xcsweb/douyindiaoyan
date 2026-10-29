/* motion-kit · 结构图示控件（0.3.0）：flow / cycle / funnel / venn / mindmap / matrix / hub
   流程图、循环图、漏斗、交集图、思维导图、2×2 象限、中心辐射。
   连线一律用 SVG 描出（MK.draw），描线时线头带光点；停留时光点/信号沿连线流动（画布 MK.fx.comet）。
   约定见 AUTHORING.md：只由 t 求值，音效在 build 里登记，颜色只取主题。 */
(function () {
  'use strict';
  const { clamp, lerp, pr, EZ, el, box, set, tf, fit, rich, esc, S, flash, shake, punch, idle, stagger, svg, draw, rnd } = MK;
  const T = () => MK.T;
  const TAU = Math.PI * 2;
  const leave = (t, slot) => pr(t, slot.t1 - .35, slot.t1);
  /* cue 缺省：n 个节拍在本段可用时间里均匀错开，单步最长 gap 秒 */
  const beats = (slot, n, start = .3, gap = .8, reserve = 1.5) => stagger(n, slot.t0 + start, Math.min(gap, Math.max(.28, (slot.t1 - slot.t0 - start - reserve) / Math.max(1, n - 1))), slot.cues);

  /* ---------- 几何：所有连线先采样成点列（内容区坐标），SVG 路径与画布光点共用 ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  let UID = 0;
  const sv = (parent, tag, attrs = {}, cls = '') => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (cls) e.setAttribute('class', cls);
    parent.appendChild(e); return e;
  };
  const seg = (a, b, n = 24) => Array.from({ length: n + 1 }, (_, i) => [lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)]);
  const bez = (a, c1, c2, b, n = 48) => Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n, v = 1 - u, A = v * v * v, B = 3 * v * v * u, C = 3 * v * u * u, D = u * u * u;
    return [A * a[0] + B * c1[0] + C * c2[0] + D * b[0], A * a[1] + B * c1[1] + C * c2[1] + D * b[1]];
  });
  const arcPts = (cx, cy, rx, ry, a0, a1, n = 64) => Array.from({ length: n + 1 }, (_, i) => { const an = lerp(a0, a1, i / n); return [cx + Math.cos(an) * rx, cy + Math.sin(an) * ry]; });
  const join = (o, q) => o.concat(o.length ? q.slice(1) : q);
  const dOf = pts => 'M' + pts.map(q => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('L');
  /* 折线圆角：poly 为拐点序列 */
  const rounded = (poly, r = 18) => {
    const L = poly.slice(1).map((b, i) => Math.hypot(b[0] - poly[i][0], b[1] - poly[i][1]) || 1);
    const rr = poly.map((_, i) => (i === 0 || i === poly.length - 1 ? 0 : Math.min(r, L[i - 1] / 2, L[i] / 2)));
    const along = (i, d) => { const a = poly[i], b = poly[i + 1]; return [a[0] + (b[0] - a[0]) / L[i] * d, a[1] + (b[1] - a[1]) / L[i] * d]; };
    let out = [];
    for (let i = 0; i < poly.length - 1; i++) {
      const s = along(i, rr[i]), e = along(i, L[i] - rr[i + 1]);
      out = join(out, seg(s, e, Math.max(2, Math.round(L[i] / 16))));
      if (rr[i + 1]) out = join(out, bez(e, poly[i + 1], poly[i + 1], along(i + 1, rr[i + 1]), 8));
    }
    return out;
  };
  /* 去掉落在节点里的线头：shape = {cx, cy, w, h} 或 {cx, cy, r} */
  const inside = (s, q, pad) => (s.r != null ? Math.hypot(q[0] - s.cx, q[1] - s.cy) < s.r + pad : Math.abs(q[0] - s.cx) < s.w / 2 + pad && Math.abs(q[1] - s.cy) < s.h / 2 + pad);
  const trim = (pts, a, b, pa = 8, pb = 12) => {
    let i = 0, j = pts.length - 1;
    while (a && i < j - 2 && inside(a, pts[i], pa)) i++;
    while (b && j > i + 2 && inside(b, pts[j], pb)) j--;
    return pts.slice(i, j + 1);
  };

  /* 连线：SVG 路径 + 可选箭头；abs 为画布坐标（画光点用） */
  const mkLink = (g, pts, A, o = {}) => {
    const p = sv(g, 'path', { d: dOf(pts) }, 'ln ' + (o.cls || ''));
    let hd = null, tfh = '';
    if (o.arrow) {
      const e = pts[pts.length - 1], q = pts[Math.max(0, pts.length - 4)];
      tfh = `translate(${e[0].toFixed(1)} ${e[1].toFixed(1)}) rotate(${(Math.atan2(e[1] - q[1], e[0] - q[0]) * 180 / Math.PI).toFixed(1)})`;
      hd = sv(g, 'path', { d: 'M3 0L-15 -9.5L-10 0L-15 9.5Z' }, 'hd ' + (o.cls || ''));
    }
    return { p, hd, tfh, pts, abs: pts.map(q => [q[0] + A.x, q[1] + A.y]) };
  };
  const drawLink = (L, k) => {
    draw(L.p, k);
    L.p.style.opacity = k > 0 ? '1' : '0';
    if (L.hd) { const s = EZ.back(pr(k, .8, 1)); L.hd.setAttribute('transform', `${L.tfh} scale(${Math.max(.001, s).toFixed(3)})`); L.hd.style.opacity = k > .8 ? '1' : '0'; }
  };

  /* ---------- 节点卡：kind = h 图标在左 / v 图标在上 / c 圆形 ---------- */
  const node = (parent, d, kind, s, cls = '') => {
    const e = box(el('div', `mk-dg-n ${kind} ${cls}`, parent), s.cx - s.w / 2, s.cy - s.h / 2, s.w, s.h);
    const isz = !d.icon ? 0 : Math.round(kind === 'h' ? Math.min(s.h * .5, 52) : kind === 'v' ? Math.min(s.w * .34, s.h * .3, 72) : Math.min(s.w * .3, 60));
    const ic = d.icon ? el('div', 'ic', e, MK.icon(d.icon, isz, 2)) : null;
    if (ic) Object.assign(ic.style, { width: isz + 'px', height: isz + 'px' });
    const tx = el('div', 'tx', e, rich(d.text));
    return { e, ic, tx, isz, s, kind };
  };
  const fitNode = (N, max, min) => {
    const { w, h } = N.s, ic = N.isz;
    let tw, th;
    if (N.kind === 'h') { tw = w - 36 - (ic ? ic + 14 : 0); th = h - 10; }
    else if (N.kind === 'v') { tw = w - 26; th = h - 26 - (ic ? ic + 10 : 0); }
    else { tw = w * .74; th = h * .66 - (ic ? ic + 6 : 0); }
    const top = Math.max(min, Math.min(max, Math.floor(th / 1.16)));
    /* 先试单行（不在词中间折行），单行太小再允许换行 */
    N.tx.style.whiteSpace = 'nowrap';
    try { return fit(N.tx, top, Math.max(min, Math.round(top * .62)), tw, th); } catch { N.tx.style.whiteSpace = ''; }
    return fit(N.tx, top, min, tw, th);
  };
  /* 一组节点统一字号（取各自能放下的最小值） */
  const fitNodes = (list, max, min = 18) => {
    if (!list.length) return max;
    const sz = Math.min(...list.map(N => fitNode(N, max, min)));
    list.forEach(N => { N.tx.style.fontSize = sz + 'px'; });
    return sz;
  };
  /* 节点弹出：缩放过冲 + 上浮 + 去模糊，图标旋入 */
  const popNode = (N, t, c, o = {}) => {
    const k = pr(t, c - .05, c + .55), q = pr(t, c + .05, c + .62), s0 = o.s0 ?? .3;
    tf(N.e, { o: clamp(k * 4) * (o.o ?? 1), s: (s0 + (1 - s0) * EZ.spring(k)) * (o.s ?? 1), x: (o.x || 0) + (o.dx || 0) * (1 - EZ.out(k)), y: (o.y || 0) + (o.dy ?? 26) * (1 - EZ.out(k)), blur: (1 - EZ.out(k)) * 6 });
    if (N.ic) tf(N.ic, { r: (1 - EZ.back(q)) * -110, s: .3 + .7 * EZ.back(q), o: clamp(q * 3) });
    return k;
  };

  /* 顶部标题（可选） */
  const heading = (wrap, s, A, ctx) => {
    if (!s) return { e: null, h: 0 };
    const e = box(el('div', 'mk-dg-h mk-abs', wrap, rich(s)), 0, 0, A.w);
    ctx.measure(() => fit(e, ctx.portrait ? 60 : 54, 28, A.w * .9, null));
    return { e, h: ctx.portrait ? 96 : 84 };
  };
  const showHead = (hd, t, t0) => { if (hd.e) { const k = pr(t, t0, t0 + .55); tf(hd.e, { o: clamp(k * 2.5), y: (1 - EZ.expo(k)) * 26, blur: (1 - EZ.out(k)) * 8 }); } };

  /* 环外标签：按角度放在节点外侧（左右两侧左/右对齐，上下居中） */
  const outLab = (wrap, htmlStr, x, y, an, gap, w, h, cls = '') => {
    const c = Math.cos(an), s = Math.sin(an), side = Math.abs(c) > .35;
    const e = el('div', 'mk-dg-lab mk-abs ' + cls, wrap), inner = el('div', 't', e, htmlStr);
    let lx, ly;
    if (side) { lx = c > 0 ? x + gap : x - gap - w; ly = y - h / 2; }
    else { lx = x - w / 2; ly = s > 0 ? y + gap * .8 : y - gap * .8 - h; }
    box(e, lx, ly, w, h); e.style.height = h + 'px';
    inner.style.textAlign = side ? (c > 0 ? 'left' : 'right') : 'center';
    e.style.alignItems = side ? 'center' : s > 0 ? 'flex-start' : 'flex-end';
    return { e, inner, w, h, dx: side ? Math.sign(c) : 0, dy: side ? 0 : Math.sign(s) };
  };
  const showLab = (Lb, t, c) => { const k = pr(t, c, c + .5); tf(Lb.e, { o: clamp(k * 3), x: -Lb.dx * (1 - EZ.expo(k)) * 34, y: -Lb.dy * (1 - EZ.expo(k)) * 24, blur: (1 - EZ.out(k)) * 6 }); };
  const pan = (x, w) => clamp((x / w - .5) * 1.4, -.8, .8);
  /* 停留循环：从 t0 起每 per 秒一步，返回 [步序号, 步内进度] */
  const cyc = (t, t0, per) => { const u = Math.max(0, t - t0); return [Math.floor(u / per), (u % per) / per]; };

  /* ---------- flow：流程图 ----------
     chain  单行（竖屏单列）节点，箭头逐段描出
     snake  两行折返（竖屏两列三行），拐弯处弧线连接
     branch 一分多：源节点射出曲线到右侧一列（竖屏为左侧主干 + 圆角分支）
     停留：光点沿流程逐段流动、到达的节点亮起；branch 为同时向所有分支发出信号 */
  MK.control('flow', {
    variants: ['chain', 'snake', 'branch'],
    build(slot, p, ctx) {
      const A = ctx.area, v = ctx.variant, P = ctx.portrait, n = p.nodes.length;
      const wrap = box(el('div', 'mk-abs mk-dg', ctx.root), A.x, A.y, A.w, A.h);
      const head = heading(wrap, p.title, A, ctx), top = head.h, H = A.h - top;
      const g = svg(wrap, A.w, A.h, '', 'mk-dg-svg');
      const geo = [], pairs = [];
      let route;
      if (v === 'chain') {
        if (!P) {
          const gap = n > 4 ? 52 : 80, w = Math.min(290, (A.w - gap * (n - 1)) / n), h = Math.min(H * .78, w < 170 ? 210 : 250), x0 = (A.w - (w * n + gap * (n - 1))) / 2;
          for (let i = 0; i < n; i++) geo.push({ cx: x0 + w / 2 + i * (w + gap), cy: top + H / 2, w, h, kind: 'v' });
          route = (a, b) => seg([a.cx + a.w / 2 + 8, a.cy], [b.cx - b.w / 2 - 10, b.cy]);
        } else {
          const gap = 44, h = Math.min(130, (H - gap * (n - 1)) / n), w = Math.min(A.w * .84, 740), y0 = top + (H - (h * n + gap * (n - 1))) / 2;
          for (let i = 0; i < n; i++) geo.push({ cx: A.w / 2, cy: y0 + h / 2 + i * (h + gap), w, h, kind: 'h' });
          route = (a, b) => seg([a.cx, a.cy + a.h / 2 + 6], [b.cx, b.cy - b.h / 2 - 10]);
        }
        for (let i = 1; i < n; i++) pairs.push([i - 1, i]);
      } else if (v === 'snake') {
        const cols = P ? 2 : Math.ceil(n / 2), rows = Math.ceil(n / cols);
        const gx = P ? 72 : 86, gy = P ? 74 : 96, w = Math.min(P ? 420 : 330, (A.w - gx * (cols - 1)) / cols), h = Math.min(P ? 140 : 130, (H - gy * (rows - 1)) / rows);
        const x0 = (A.w - (w * cols + gx * (cols - 1))) / 2, y0 = top + (H - (h * rows + gy * (rows - 1))) / 2;
        for (let i = 0; i < n; i++) { const r = Math.floor(i / cols), c0 = i % cols, c = r % 2 ? cols - 1 - c0 : c0; geo.push({ cx: x0 + w / 2 + c * (w + gx), cy: y0 + h / 2 + r * (h + gy), w, h, kind: 'h' }); }
        for (let i = 1; i < n; i++) pairs.push([i - 1, i]);
        route = (a, b) => {
          if (Math.abs(a.cy - b.cy) < 1) { const d = Math.sign(b.cx - a.cx); return seg([a.cx + d * (a.w / 2 + 8), a.cy], [b.cx - d * (b.w / 2 + 10), b.cy]); }
          const side = a.cx > A.w / 2 ? 1 : -1, s = [a.cx + side * a.w * .3, a.cy + a.h / 2 + 6], e = [b.cx + side * b.w * .3, b.cy - b.h / 2 - 10], dy = e[1] - s[1];
          return bez(s, [s[0] + side * 64, s[1] + dy * .45], [e[0] + side * 64, e[1] - dy * .45], e);
        };
      } else {
        const k = n - 1;
        if (!P) {
          const w0 = Math.min(280, A.w * .27), h0 = Math.min(250, H * .62), wt = Math.min(390, A.w * .38), gy = 22, ht = Math.min(118, (H - gy * (k - 1)) / k);
          geo.push({ cx: w0 / 2 + 4, cy: top + H / 2, w: w0, h: h0, kind: 'v' });
          const y0 = top + (H - (ht * k + gy * (k - 1))) / 2;
          for (let i = 0; i < k; i++) geo.push({ cx: A.w - wt / 2 - 4, cy: y0 + ht / 2 + i * (ht + gy), w: wt, h: ht, kind: 'h' });
          route = (a, b) => { const s = [a.cx + a.w / 2 + 8, a.cy], e = [b.cx - b.w / 2 - 10, b.cy], dx = e[0] - s[0]; return bez(s, [s[0] + dx * .55, s[1]], [e[0] - dx * .55, e[1]], e); };
        } else {
          const w0 = Math.min(600, A.w * .66), h0 = 116, gy = 22, x1 = 128, wt = A.w - x1, ht = Math.min(118, (H - h0 - 40 - gy * (k - 1)) / k);
          geo.push({ cx: w0 / 2, cy: top + h0 / 2, w: w0, h: h0, kind: 'h' });
          const y0 = top + h0 + 40 + (H - h0 - 40 - (ht * k + gy * (k - 1))) / 2;
          for (let i = 0; i < k; i++) geo.push({ cx: x1 + wt / 2, cy: y0 + ht / 2 + i * (ht + gy), w: wt, h: ht, kind: 'h' });
          route = (a, b) => rounded([[52, a.cy + a.h / 2 + 6], [52, b.cy], [b.cx - b.w / 2 - 10, b.cy]], 26);
        }
        for (let i = 1; i < n; i++) pairs.push([0, i]);
      }
      const L = pairs.map(([a, b]) => mkLink(g, route(geo[a], geo[b]), A, { arrow: true }));
      const N = p.nodes.map((d, i) => node(wrap, d, geo[i].kind, geo[i]));
      ctx.measure(() => {
        if (v === 'branch') { fitNodes([N[0]], P ? 46 : 44); fitNodes(N.slice(1), 40); }
        else fitNodes(N, v === 'chain' && !P ? 44 : 42);
      });
      const at = beats(slot, n, .3, .8);
      const linkK = (t, j) => EZ.inout(pr(t, at[pairs[j][1]] - .42, at[pairs[j][1]] - .02));
      const tAll = at[n - 1] + .6;
      S(slot.t0, 'swoosh', .35);
      at.forEach((c, i) => { if (i) S(c - .42, 'swipe', .3, pan(geo[i].cx, A.w)); S(c, 'pop', .45, pan(geo[i].cx, A.w)); });
      S(tAll - .1, 'shine', .3);
      /* 停留：chain/snake 光点逐段跑完全程后停一下；branch 同时射向所有分支 */
      const PER = .62, LOOP = (n - 1) * PER + 1;
      const loop = t => {
        if (t < tAll) return { hot: [at.filter(c => t >= c).length - 1], runs: [] };
        const u = (t - tAll) % (v === 'branch' ? 1.9 : LOOP);
        if (v === 'branch') { const k = u / 1.05; return { hot: k < .2 ? [0] : k > .85 && k < 1.5 ? pairs.map(q => q[1]) : [], runs: k < 1 ? pairs.map((_, j) => [j, EZ.inout(k)]) : [] }; }
        const j = Math.floor(u / PER), k = (u - j * PER) / PER;
        return j < n - 1 ? { hot: [j + (k > .8 ? 1 : 0)], runs: [[j, EZ.inout(k)]] } : { hot: [n - 1], runs: [] };
      };
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          showHead(head, t, slot.t0);
          L.forEach((l, j) => drawLink(l, linkK(t, j)));
          const hot = loop(t).hot;
          N.forEach((x, i) => { popNode(x, t, at[i]); x.e.classList.toggle('on', hot.includes(i)); });
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          loop(t).hot.forEach(i => { if (i >= 0 && t >= at[i]) MK.fx.glow(c, A.x + geo[i].cx, A.y + geo[i].cy, Math.max(geo[i].w, geo[i].h) * .75, T().a, .55 * a); });
        },
        fg(c, t) {
          const a = 1 - leave(t, slot);
          L.forEach((l, j) => { const k = linkK(t, j); if (k > 0 && k < 1) MK.fx.comet(c, l.abs, k, T().aLite, a); });
          geo.forEach((s, i) => MK.fx.ripple(c, t, at[i] + .05, A.x + s.cx, A.y + s.cy, { r: Math.max(s.w, s.h) * .6, r0: Math.min(s.w, s.h) * .4, rings: 1, w: 2 }));
          loop(t).runs.forEach(([j, k]) => MK.fx.comet(c, L[j].abs, k, T().w, .9 * a, { r: 6 }));
        },
        hint: { cx: A.x + A.w / 2, cy: A.y + A.h / 2 },
      };
    },
  });

  /* ---------- cycle：循环图 ----------
     ring  节点围成环，弧形箭头逐段描出，最后一段闭合；停留时光点绕环循环
     orbit 节点从中心飞出落在椭圆轨道上，停留时整体绕转（近大远小）
     wheel 扇区转盘：扇区逐块展开，闭合时整盘转一圈；停留时选中扇区轮流弹出 */
  MK.control('cycle', {
    variants: ['ring', 'orbit', 'wheel'],
    build(slot, p, ctx) {
      const A = ctx.area, v = ctx.variant, P = ctx.portrait, n = p.nodes.length, step = TAU / n;
      const wrap = box(el('div', 'mk-abs mk-dg', ctx.root), A.x, A.y, A.w, A.h);
      const g = svg(wrap, A.w, A.h, '', 'mk-dg-svg');
      const cx = A.w / 2, cy = A.h / 2, c0 = slot.t0 + .12;
      const ang = i => -Math.PI / 2 + (v === 'orbit' ? 0 : Math.PI / n) + i * step;
      const at = beats(slot, n, .6, .7, 1.9), tClose = at[n - 1] + .55, tAll = tClose + .5;
      const labW = P ? 210 : 230, labH = 70;
      const needV = Array.from({ length: n }, (_, i) => Math.abs(Math.cos(ang(i))) <= .35).some(Boolean);
      let R = 0, Rc = 0, badges = [], labs = [], arcs = [], track = null, loopAbs = [], chips = [], secs = [], sics = [], Ro = 0, Ri = 0;
      if (v === 'ring') {
        const br = P ? 50 : 46;
        R = Math.min(needV ? cy - br - labH - 6 : cy - br - 8, cx - br - 18 - labW, P ? 250 : 240);
        track = mkLink(g, arcPts(cx, cy, R, R, 0, TAU, 120), A, { cls: 'trk' });
        const ga = (br + 12) / R;
        for (let i = 0; i < n; i++) arcs.push(mkLink(g, arcPts(cx, cy, R, R, ang(i) + ga, ang(i + 1) - ga, 40), A, { arrow: true }));
        loopAbs = arcPts(cx, cy, R, R, ang(0), ang(0) + TAU, 140).map(q => [q[0] + A.x, q[1] + A.y]);
        p.nodes.forEach((d, i) => {
          const x = cx + Math.cos(ang(i)) * R, y = cy + Math.sin(ang(i)) * R;
          const b = box(el('div', 'mk-dg-badge mk-abs', wrap, d.icon ? MK.icon(d.icon, Math.round(br * .95), 2) : `<b>${String(i + 1).padStart(2, '0')}</b>`), x - br, y - br, br * 2, br * 2);
          b.style.height = br * 2 + 'px';
          badges.push({ e: b, x, y, ic: b.firstChild });
          labs.push(outLab(wrap, rich(d.text), x, y, ang(i), br + 14, labW, labH));
        });
        Rc = R - br - 24;
      } else if (v === 'orbit') {
        const rx = P ? A.w * .31 : A.w * .37, ry = P ? A.h * .37 : A.h * .31, w = P ? 240 : 230, h = 74;
        track = mkLink(g, arcPts(cx, cy, rx, ry, -Math.PI / 2, -Math.PI / 2 + TAU, 140), A, { cls: 'trk dash' });
        loopAbs = arcPts(cx, cy, rx, ry, 0, TAU, 160).map(q => [q[0] + A.x, q[1] + A.y]);
        chips = p.nodes.map(d => node(wrap, d, 'h', { cx, cy, w, h }, 'orb'));
        wrap._o = { rx, ry };
        Rc = Math.min(rx, ry) * .5;
      } else {
        Ro = Math.min(needV ? cy - labH - 22 : cy - 12, cx - labW - 40, P ? 260 : 250); Ri = Ro * .4;
        const gp = 3 / Ro, sg = sv(g, 'g', {}, 'whl');
        p.nodes.forEach((d, i) => {
          const a0 = ang(i) - step / 2 + gp, a1 = ang(i) + step / 2 - gp, lg = step > Math.PI ? 1 : 0;
          const P1 = [cx + Math.cos(a0) * Ro, cy + Math.sin(a0) * Ro], P2 = [cx + Math.cos(a1) * Ro, cy + Math.sin(a1) * Ro], P3 = [cx + Math.cos(a1) * Ri, cy + Math.sin(a1) * Ri], P4 = [cx + Math.cos(a0) * Ri, cy + Math.sin(a0) * Ri];
          const f = q => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
          secs.push(sv(sg, 'path', { d: `M${f(P1)}A${Ro} ${Ro} 0 ${lg} 1 ${f(P2)}L${f(P3)}A${Ri} ${Ri} 0 ${lg} 0 ${f(P4)}Z` }, 'sec s' + (i % 2)));
          const isz = Math.round(Math.min(58, (Ro - Ri) * .42));
          const ic = box(el('div', 'mk-dg-sic mk-abs', wrap, d.icon ? MK.icon(d.icon, isz, 2) : `<b>${String(i + 1).padStart(2, '0')}</b>`), 0, 0, isz, isz);
          ic.style.height = isz + 'px'; ic.style.fontSize = Math.round(isz * .55) + 'px';
          sics.push({ e: ic, isz });
          labs.push(outLab(wrap, rich(d.text), cx + Math.cos(ang(i)) * (Ro + 22), cy + Math.sin(ang(i)) * (Ro + 22), ang(i), 18, labW, labH));
        });
        Rc = Ri - 10;
      }
      const core = box(el('div', 'mk-dg-core mk-abs', wrap), cx - Rc, cy - Rc, Rc * 2, Rc * 2);
      core.style.height = Rc * 2 + 'px';
      const coreTx = el('div', 'tx', core, p.title ? rich(p.title) : MK.icon('cycle', Math.round(Rc * .7), 2));
      ctx.measure(() => {
        if (p.title) { coreTx.style.whiteSpace = 'nowrap'; try { fit(coreTx, Math.round(Rc * .42), Math.round(Rc * .26), Rc * 1.6, Rc * 1.2); } catch { coreTx.style.whiteSpace = ''; fit(coreTx, Math.round(Rc * .42), 16, Rc * 1.46, Rc * 1.2); } }
        if (labs.length) { const sz = Math.min(...labs.map(l => fit(l.inner, 38, 18, l.w, l.h))); labs.forEach(l => { l.inner.style.fontSize = sz + 'px'; }); }
        if (chips.length) fitNodes(chips, 32, 17);
      });
      /* 音效 */
      S(c0, 'swoosh', .4);
      at.forEach((c, i) => { if (v !== 'orbit' && i) S(c - .4, 'swipe', .22); S(c, v === 'orbit' ? 'whoosh' : 'pop', v === 'orbit' ? .3 : .45, Math.cos(ang(i)) * .6); if (v === 'orbit') S(c + .25, 'pop', .4, Math.cos(ang(i)) * .6); });
      S(tClose - .4, v === 'wheel' ? 'whoosh' : 'swipe', .4); S(tClose + (v === 'wheel' ? .6 : 0), 'ding', .32, 0, { m: 91 });
      if (v === 'wheel') for (let tt = tAll + .9, i = 0; tt < slot.t1 - .6; tt += .9, i++) S(tt, 'tick', .35, Math.cos(ang(i % n)) * .5);
      const arcK = (t, i) => (i < n - 1 ? EZ.inout(pr(t, at[i + 1] - .45, at[i + 1] - .03)) : EZ.inout(pr(t, tClose - .45, tClose)));
      /* 停留：ring 光点绕环 2.6 秒一圈；wheel 每 0.9 秒换一个选中扇区 */
      const hotOf = t => {
        if (t < tAll) return at.filter(c => t >= c).length - 1;
        if (v === 'ring') { const k = ((t - tAll) / 2.6) % 1, f = k * n; return Math.abs(f - Math.round(f)) < .22 ? Math.round(f) % n : -1; }
        if (v === 'wheel') return t < tAll + .9 ? -1 : cyc(t, tAll + .9, .9)[0] % n;
        return -1;
      };
      /* orbit：每个节点的当前角度、半径系数 */
      const spin = t => { const u = Math.max(0, t - tAll); return .22 * (u - (1 - Math.exp(-u * 1.5)) / 1.5); };
      const orbAt = (t, i) => { const k = pr(t, at[i] - .1, at[i] + .65); return { an: ang(i) - (1 - EZ.out(k)) * 1.3 + spin(t), rk: EZ.back(k), k }; };
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          const kc = pr(t, c0, c0 + .6), hot = hotOf(t), br = idle(t, tAll, 2.6).wave;
          tf(core, { o: clamp(kc * 3), s: .5 + .5 * EZ.spring(kc), r: (1 - EZ.out(kc)) * -40 });
          core.style.boxShadow = `0 0 ${(40 + (t > tAll ? 18 * br : 0)).toFixed(1)}px rgba(var(--a-rgb),${(t > tAll ? .3 + .12 * br : .25).toFixed(3)}),inset 0 0 40px rgba(var(--a-rgb),.15)`;
          if (track) drawLink(track, EZ.inout(pr(t, c0, c0 + .8)));
          if (v === 'ring') {
            arcs.forEach((l, i) => drawLink(l, arcK(t, i)));
            badges.forEach((b, i) => {
              const k = pr(t, at[i] - .05, at[i] + .5);
              tf(b.e, { o: clamp(k * 4), s: .3 + .7 * EZ.spring(k) + (hot === i ? .08 : 0) });
              b.e.classList.toggle('on', hot === i);
              showLab(labs[i], t, at[i] + .1); labs[i].e.classList.toggle('on', hot === i);
            });
          } else if (v === 'orbit') {
            const { rx, ry } = wrap._o;
            chips.forEach((N, i) => {
              const { an, rk } = orbAt(t, i), depth = (Math.sin(an) + 1) / 2;
              popNode(N, t, at[i], { x: Math.cos(an) * rx * rk, y: Math.sin(an) * ry * rk, dy: 0, s: .84 + .2 * depth, o: .62 + .38 * depth });
              N.e.style.zIndex = String(2 + Math.round(depth * 8));
              N.e.classList.toggle('on', t > tAll && depth > .82);
            });
            core.style.zIndex = '6';
          } else {
            const spinW = EZ.inout(pr(t, tClose, tClose + 1)) * 360;
            secs.forEach((s, i) => {
              const k = pr(t, at[i] - .1, at[i] + .5), pop = hot === i ? EZ.back(pr(t, tAll + .9 + cyc(t, tAll + .9, .9)[0] * .9, tAll + 1.2 + cyc(t, tAll + .9, .9)[0] * .9)) : 0;
              const r = -(1 - EZ.back(k)) * 50 + spinW, s0 = .55 + .45 * EZ.out5(k), off = 16 * pop;
              const dx = Math.cos(ang(i)) * off, dy = Math.sin(ang(i)) * off;
              s.setAttribute('transform', `translate(${(cx + dx).toFixed(1)} ${(cy + dy).toFixed(1)}) rotate(${r.toFixed(2)}) scale(${s0.toFixed(4)}) translate(${-cx} ${-cy})`);
              s.style.opacity = clamp(k * 3).toFixed(3);
              s.classList.toggle('hot', hot === i);
              const a = ang(i) + r * Math.PI / 180, rm = (Ro + Ri) / 2 * s0 + off, ic = sics[i];
              tf(ic.e, { x: cx + Math.cos(a) * rm - ic.isz / 2 + dx * 0, y: cy + Math.sin(a) * rm - ic.isz / 2, o: clamp(k * 3), s: .4 + .6 * EZ.spring(pr(t, at[i], at[i] + .5)) });
              ic.e.classList.toggle('on', hot === i);
              showLab(labs[i], t, at[i] + .15);
              labs[i].e.style.opacity = (+labs[i].e.style.opacity * (1 - .75 * Math.sin(Math.PI * pr(t, tClose, tClose + 1)))).toFixed(3);
              labs[i].e.classList.toggle('on', hot === i);
            });
          }
        },
        bg(c, t) {
          const a = 1 - leave(t, slot), X = A.x + cx, Y = A.y + cy;
          MK.fx.glow(c, X, Y, Rc * 2.2, T().a, .6 * a * pr(t, c0, c0 + .6));
          if (v === 'wheel') { const r0 = spin(t) * .6 + EZ.inout(pr(t, tClose, tClose + 1)) * TAU; T().paint.arcRing(c, X, Y, Ro + 12, r0, r0 + TAU * pr(t, c0, c0 + .9), T().a, .55 * a, { step: 11 }); }
          if (v === 'orbit') {
            /* 轨道上的方向弧：随节点一起转 */
            const { rx, ry } = wrap._o;
            c.save(); c.lineCap = 'round';
            for (let i = 0; i < n; i++) {
              const A0 = orbAt(t, i), A1 = orbAt(t, (i + 1) % n), k = i < n - 1 ? arcK(t, i) : arcK(t, n - 1);
              if (k <= 0 || A0.k < 1 || A1.k < 1) continue;
              let a1 = A1.an; while (a1 <= A0.an) a1 += TAU;
              const s0 = A0.an + .3, s1 = lerp(s0, a1 - .3, k);
              c.strokeStyle = `rgba(${T().a},${.75 * a})`; c.lineWidth = 3; c.beginPath();
              for (let q = 0; q <= 30; q++) { const an = lerp(s0, s1, q / 30), px = X + Math.cos(an) * rx, py = Y + Math.sin(an) * ry; q ? c.lineTo(px, py) : c.moveTo(px, py); }
              c.stroke();
              if (k > .9) { const px = X + Math.cos(s1) * rx, py = Y + Math.sin(s1) * ry, tx = -Math.sin(s1) * rx, ty = Math.cos(s1) * ry, l = Math.hypot(tx, ty), ux = tx / l, uy = ty / l; c.fillStyle = `rgba(${T().a},${a})`; c.beginPath(); c.moveTo(px + ux * 6, py + uy * 6); c.lineTo(px - ux * 12 - uy * 8, py - uy * 12 + ux * 8); c.lineTo(px - ux * 12 + uy * 8, py - uy * 12 - ux * 8); c.fill(); }
            }
            c.restore();
            T().paint.ball(c, X, Y, Rc * .9, T().a, .5 * a * pr(t, c0, c0 + .6), { lat: t * .4 });
          }
        },
        fg(c, t) {
          const a = 1 - leave(t, slot), X = A.x + cx, Y = A.y + cy;
          if (v === 'ring') {
            arcs.forEach((l, i) => { const k = arcK(t, i); if (k > 0 && k < 1) MK.fx.comet(c, l.abs, k, T().aLite, a); });
            badges.forEach((b, i) => MK.fx.ripple(c, t, at[i], A.x + b.x, A.y + b.y, { r: 90, rings: 1 }));
            if (t > tAll) MK.fx.comet(c, loopAbs, ((t - tAll) / 2.6) % 1 + .001, T().w, a, { tail: .004, r: 7 });
          }
          if (v === 'orbit' && t > tAll) [0, .5].forEach(o => MK.fx.comet(c, loopAbs, ((t - tAll) / 3.4 + o) % 1 + .001, T().w, .7 * a, { tail: .003, r: 5 }));
          MK.fx.ripple(c, t, tClose, X, Y, { r: (v === 'wheel' ? Ro : v === 'ring' ? R : Rc * 2.4) * 1.3, r0: Rc, rings: 2, col: T().w });
        },
        hint: { cx: A.x + cx, cy: A.y + cy },
      };
    },
  });

  /* ---------- funnel：漏斗 ----------
     funnel  上宽下窄的漏斗，每层从上方落下弹跳压扁；数值从右侧引线拉出；粒子从上往下流过漏斗颈
     pyramid 金字塔，自下而上逐层升起，塔尖亮起；右侧引线标注
     layers  等轴测叠层板，自下而上落下叠起；停留时叠层呼吸展开、逐层抬起 */
  MK.control('funnel', {
    variants: ['funnel', 'pyramid', 'layers'],
    build(slot, p, ctx) {
      const A = ctx.area, v = ctx.variant, P = ctx.portrait, L = p.layers, n = L.length;
      const wrap = box(el('div', 'mk-abs mk-dg', ctx.root), A.x, A.y, A.w, A.h);
      const head = heading(wrap, p.title, A, ctx), top = head.h, H = A.h - top;
      const g = svg(wrap, A.w, A.h, '', 'mk-dg-svg');
      const hasV = L.some(d => d.value);
      const at = beats(slot, n, .35, .72);
      const rev = v !== 'funnel';
      const atL = L.map((_, i) => at[rev ? n - 1 - i : i]);
      const tAll = at[n - 1] + .75;
      const rows = [];
      let geo = {};
      /* 右侧标注：标签 + 数值两行 */
      const callout = (x, y, w, h, d) => {
        const e = box(el('div', 'mk-dg-co mk-abs', wrap), x, y - h / 2, w, h); e.style.height = h + 'px';
        if (h < 78 && d.value) e.classList.add('row');
        const cl = el('div', 'cl', e, rich(d.label)), cv = d.value ? el('div', 'cv', e, esc(d.value)) : null;
        return { e, cl, cv, w, h };
      };
      if (v === 'funnel') {
        const fw = Math.min(A.w * (hasV ? (P ? .62 : .56) : .8), P ? 640 : 660), fx = hasV ? fw / 2 + 4 : A.w / 2;
        const neck = 58, gap = 10, lh = Math.min(118, (H - neck - gap * (n - 1)) / n), tot = lh * n + gap * (n - 1), y0 = top + (H - neck - tot) / 2;
        const wAt = y => fw * (1 - .5 * clamp((y - y0) / tot));
        const nw = wAt(y0 + tot) * .26;
        geo = { fw, fx, y0, tot, neck, nw, wAt };
        const xv = fx + fw / 2 + 44;
        L.forEach((d, i) => {
          const ya = y0 + i * (lh + gap), wa = wAt(ya), wb = wAt(ya + lh), dd = (wa - wb) / 2;
          const e = box(el('div', 'mk-dg-fl mk-abs', wrap), fx - wa / 2, ya, wa, lh); e.style.height = lh + 'px';
          e.style.clipPath = `polygon(0 0,${wa.toFixed(1)}px 0,${(wa - dd).toFixed(1)}px ${lh.toFixed(1)}px,${dd.toFixed(1)}px ${lh.toFixed(1)}px)`;
          const lab = box(el('div', 'lb mk-abs', e, rich(d.label)), dd + 12, 0, wb - 24, lh); lab.style.height = lh + 'px';
          let ld = null, val = null;
          if (d.value) {
            ld = mkLink(g, seg([fx + (wa + wb) / 4 + 10, ya + lh / 2], [xv - 14, ya + lh / 2], 12), A, { cls: 'ld' });
            val = box(el('div', 'mk-dg-val mk-abs', wrap, esc(d.value)), xv, ya, A.w - xv, lh); val.style.height = lh + 'px';
          }
          rows.push({ e, lab, ld, val, cy: ya + lh / 2, lh, wb });
        });
        const yb = y0 + tot, bw = wAt(yb);
        geo.neckL = mkLink(g, [[fx - bw / 2 + 6, yb + 4], [fx - nw / 2, yb + neck * .55], [fx - nw / 2, yb + neck]], A, { cls: 'thin' });
        geo.neckR = mkLink(g, [[fx + bw / 2 - 6, yb + 4], [fx + nw / 2, yb + neck * .55], [fx + nw / 2, yb + neck]], A, { cls: 'thin' });
      } else if (v === 'pyramid') {
        const pw = Math.min(A.w * (P ? .58 : .48), P ? 560 : 560), ph = Math.min(H - 6, pw * .92), px = pw / 2 + 4, gap = 8;
        const y0 = top + (H - ph) / 2, lh = (ph - gap * (n - 1)) / n, wAt = y => pw * (y - y0) / ph, xc = px + pw / 2 + 50;
        geo = { px, y0, pw };
        L.forEach((d, i) => {
          const ya = y0 + i * (lh + gap), wa = wAt(ya), wb = wAt(ya + lh);
          const e = box(el('div', 'mk-dg-py mk-abs', wrap), px - wb / 2, ya, wb, lh); e.style.height = lh + 'px';
          e.style.clipPath = `polygon(${((wb - wa) / 2).toFixed(1)}px 0,${((wb + wa) / 2).toFixed(1)}px 0,${wb.toFixed(1)}px ${lh.toFixed(1)}px,0 ${lh.toFixed(1)}px)`;
          const no = box(el('div', 'no mk-abs', e, String(i + 1).padStart(2, '0')), 0, lh * .3, wb, lh * .7); no.style.height = lh * .7 + 'px'; no.style.fontSize = Math.round(Math.min(34, lh * .34)) + 'px';
          const ld = mkLink(g, seg([px + (wa + wb) / 4 + 8, ya + lh / 2], [xc - 16, ya + lh / 2], 12), A, { cls: 'ld' });
          rows.push({ e, ld, co: callout(xc, ya + lh / 2, A.w - xc, Math.min(lh + 4, 110), d), cy: ya + lh / 2, lh });
        });
      } else {
        const a = Math.min(A.w * (P ? .29 : .245), P ? 280 : 262), b = a * .5, th = P ? 26 : 22, sx = a + 8;
        const gap = clamp((H - 2 * b - n * th) / Math.max(1, n - 1), 12, 70), tot = 2 * b + th + (n - 1) * (th + gap), y0 = top + (H - tot) / 2 + b;
        const xc = sx + a + 46;
        geo = { a, b, th, sx, gap, y0 };
        const groups = [];
        for (let i = n - 1; i >= 0; i--) {
          const y = y0 + i * (th + gap), q = pts => pts.map(z => `${z[0].toFixed(1)},${z[1].toFixed(1)}`).join(' ');
          const G = sv(g, 'g', {}, 'slab');
          sv(G, 'polygon', { points: q([[sx - a, y], [sx, y + b], [sx, y + b + th], [sx - a, y + th]]) }, 'sl-l');
          sv(G, 'polygon', { points: q([[sx, y + b], [sx + a, y], [sx + a, y + th], [sx, y + b + th]]) }, 'sl-r');
          sv(G, 'polygon', { points: q([[sx, y - b], [sx + a, y], [sx, y + b], [sx - a, y]]) }, 'sl-t');
          sv(G, 'polygon', { points: q([[sx, y - b * .62], [sx + a * .62, y], [sx, y + b * .62], [sx - a * .62, y]]) }, 'sl-i');
          groups[i] = G;
        }
        L.forEach((d, i) => {
          const y = y0 + i * (th + gap);
          const ld = mkLink(g, seg([sx + a + 8, y], [xc - 14, y], 12), A, { cls: 'ld' });
          rows.push({ G: groups[i], ld, co: callout(xc, y, A.w - xc, Math.min(th + gap + 14, 104), d), cy: y });
        });
      }
      ctx.measure(() => {
        if (v === 'funnel') {
          const sz = Math.min(...rows.map(r => fit(r.lab, Math.min(46, Math.floor(r.lh * .44)), 16, r.wb - 24, r.lh)));
          rows.forEach(r => { r.lab.style.fontSize = sz + 'px'; });
          const vs = rows.filter(r => r.val);
          if (vs.length) { const s2 = Math.min(...vs.map(r => fit(r.val, Math.min(52, Math.floor(r.lh * .5)), 18, A.w - (geo.fx + geo.fw / 2 + 44), r.lh))); vs.forEach(r => { r.val.style.fontSize = s2 + 'px'; }); }
        } else {
          const row = r => r.co.e.classList.contains('row'), vs = rows.filter(r => r.co.cv);
          const s1 = Math.min(...rows.map(r => fit(r.co.cl, 40, 17, row(r) ? r.co.w * .58 : r.co.w, row(r) ? r.co.h : r.co.h * (r.co.cv ? .56 : .9))));
          rows.forEach(r => { r.co.cl.style.fontSize = s1 + 'px'; });
          if (vs.length) { const s2 = Math.min(...vs.map(r => fit(r.co.cv, 30, 15, row(r) ? r.co.w * .4 : r.co.w, row(r) ? r.co.h : r.co.h * .4))); vs.forEach(r => { r.co.cv.style.fontSize = s2 + 'px'; }); }
        }
      });
      /* 音效 */
      S(slot.t0, 'swoosh', .35);
      L.forEach((d, i) => {
        const c = atL[i];
        if (v === 'funnel') { S(c - .02, 'whoosh', .22); S(c + .2, 'thud', .5); if (d.value) S(c + .35, 'tick', .35); }
        else if (v === 'pyramid') { S(c, 'thud', .5); S(c + .25, 'tick', .3); }
        else { S(c - .02, 'swipe', .25); S(c + .2, 'thud', .55); S(c + .3, 'tick', .3); }
      });
      if (v === 'funnel') S(tAll - .3, 'fill', .25, 0, { d: .9 });
      else if (v === 'pyramid') { S(atL[0] + .15, 'ding', .35, 0, { m: 93 }); flash(atL[0] + .15, .18); }
      else S(tAll, 'shine', .3);
      const per = .5, LOOP = n * per + 1.1;
      const hotOf = t => {
        if (t < tAll) return -1;
        const u = (t - tAll) % LOOP, j = Math.floor(u / per);
        return j >= n ? -1 : (rev ? n - 1 - j : j);
      };
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          showHead(head, t, slot.t0);
          const hot = hotOf(t), br = idle(t, tAll, 3).wave;
          rows.forEach((r, i) => {
            const c = atL[i], k = pr(t, c - .05, c + .6);
            if (v === 'funnel') {
              const sq = Math.sin(Math.PI * clamp((k - .32) / .3)) * (k > .32 && k < .62 ? 1 : 0);
              r.e.style.transformOrigin = '50% 100%';
              tf(r.e, { o: clamp(k * 5), y: -(1 - EZ.bounce(k)) * 230, sx: 1 + .07 * sq, sy: 1 - .12 * sq });
              r.e.classList.toggle('on', hot === i);
              if (r.ld) { const kv = pr(t, c + .3, c + .7); drawLink(r.ld, EZ.out(kv)); r.val.style.clipPath = `inset(0 ${((1 - EZ.out(pr(t, c + .45, c + .85))) * 100).toFixed(1)}% 0 0)`; tf(r.val, { o: clamp(kv * 3), x: (1 - EZ.expo(pr(t, c + .45, c + .9))) * -24 }); r.val.classList.toggle('on', hot === i); }
            } else if (v === 'pyramid') {
              tf(r.e, { o: clamp(k * 4), y: (1 - EZ.back(k)) * 70, sx: .85 + .15 * EZ.out5(k), blur: (1 - EZ.out(k)) * 8 });
              r.e.classList.toggle('on', hot === i || (t >= c && t < c + .35));
              const kv = pr(t, c + .2, c + .6); drawLink(r.ld, EZ.out(kv)); showLab({ e: r.co.e, dx: 1, dy: 0 }, t, c + .35); r.co.e.classList.toggle('on', hot === i);
            } else {
              const lift = hot === i ? -14 * EZ.out(pr(t, tAll, tAll + .3)) : 0, spread = t > tAll ? (i - (n - 1) / 2) * 7 * br : 0;
              const dy = -(1 - EZ.bounce(k)) * 260 + lift + spread;
              r.G.setAttribute('transform', `translate(0 ${dy.toFixed(2)})`);
              r.G.style.opacity = clamp(k * 4).toFixed(3);
              r.G.classList.toggle('on', hot === i || (t >= c + .2 && t < c + .5));
              const kv = pr(t, c + .3, c + .7); drawLink(r.ld, EZ.out(kv)); showLab({ e: r.co.e, dx: 1, dy: 0 }, t, c + .42); r.co.e.classList.toggle('on', hot === i);
            }
          });
          if (v === 'funnel') { const kn = EZ.out(pr(t, tAll - .4, tAll)); drawLink(geo.neckL, kn); drawLink(geo.neckR, kn); }
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          if (v === 'pyramid') { const k = pr(t, atL[0] + .1, atL[0] + .6); MK.fx.glow(c, A.x + geo.px, A.y + geo.y0 + 10, 160 + 30 * idle(t, tAll, 2.4).wave, T().w, k * a); }
          if (v === 'funnel') MK.fx.glow(c, A.x + geo.fx, A.y + geo.y0 + geo.tot + geo.neck, 120, T().a, .7 * a * pr(t, tAll - .3, tAll + .3));
        },
        fg(c, t) {
          const a = 1 - leave(t, slot);
          rows.forEach((r, i) => {
            const x = v === 'funnel' ? geo.fx : v === 'pyramid' ? geo.px : geo.sx;
            if (v !== 'pyramid') T().paint.burst(c, t, atL[i] + .2, A.x + x, A.y + r.cy + (v === 'funnel' ? r.lh / 2 : geo.b + geo.th), { n: 16, sp: 520, life: .55, seed: i });
          });
          if (v === 'pyramid') T().paint.burst(c, t, atL[0] + .15, A.x + geo.px, A.y + geo.y0 + 6, { n: 40, sp: 800, col: T().w });
          if (v !== 'funnel') return;
          /* 粒子：从漏斗上方落下，宽度随漏斗收窄，最后从漏斗颈流出 */
          const { fx, y0, tot, neck, nw, wAt } = geo, landed = atL.filter(c2 => t >= c2 + .35).length;
          if (!landed) return;
          const yLim = landed >= n ? y0 + tot + neck + 50 : y0 + landed * (tot / n);
          const hw = y => (y < y0 ? wAt(y0) / 2 : y < y0 + tot ? wAt(y) / 2 : lerp(wAt(y0 + tot) / 2, nw / 2, clamp((y - y0 - tot) / (neck * .55))));
          c.save(); c.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 52; i++) {
            const sp = .3 + .2 * rnd(i, 3), u = ((t - slot.t0) * sp + rnd(i, 1)) % 1, y = y0 - 40 + u * (tot + neck + 90);
            if (y > yLim) continue;
            const x = fx + (rnd(i, 2) - .5) * 2 * hw(y) * .82, al = a * clamp(u * 6) * clamp((yLim - y) / 40) * .8, r = 2 + 2 * rnd(i, 4);
            c.fillStyle = `rgba(${i % 4 ? T().aLite : T().w},${al})`; c.beginPath(); c.arc(A.x + x, A.y + y, r, 0, 7); c.fill();
            c.strokeStyle = `rgba(${T().a},${al * .4})`; c.lineWidth = r; c.beginPath(); c.moveTo(A.x + x, A.y + y); c.lineTo(A.x + x, A.y + y - 18); c.stroke();
          }
          c.restore();
        },
        hint: { cx: A.x + A.w * .4, cy: A.y + A.h / 2 },
      };
    },
  });

  /* ---------- venn：交集图 ----------
     2 或 3 个圆；最后一个 cue 落在交集上。
     overlap 圆从外侧滑入后靠拢重叠，交集闪光，交集文字弹出
     outline 圆的轮廓逐个描出，交集被斜纹填满并发光
     merge   多个圆向中心汇合成一个大圆（1+1>2），原名字变成大圆周围的小标签 */
  MK.control('venn', {
    variants: ['overlap', 'outline', 'merge'],
    build(slot, p, ctx) {
      const A = ctx.area, v = ctx.variant, P = ctx.portrait, sets = p.sets, n = sets.length;
      const wrap = box(el('div', 'mk-abs mk-dg', ctx.root), A.x, A.y, A.w, A.h);
      const head = heading(wrap, p.title, A, ctx), top = head.h, H = A.h - top;
      const g = svg(wrap, A.w, A.h, '', 'mk-dg-svg'), id = 'mkdg' + (++UID);
      const cx = A.w / 2, cy = top + H / 2;
      let r, C, dirs, ctr = [cx, cy];
      if (n === 2) { r = Math.min(H / 2 - 12, A.w * .9 / 3.15); const d = r * 1.15; C = [[cx - d / 2, cy], [cx + d / 2, cy]]; dirs = [[-1, 0], [1, 0]]; }
      else { r = Math.min((H - 12) / 2.95, A.w * .9 / 3.1); const rc = r * 1.1 / Math.sqrt(3), yc = cy + rc / 4; ctr = [cx, yc]; dirs = [-90, 30, 150].map(a => [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)]); C = dirs.map(q => [cx + q[0] * rc, yc + q[1] * rc]); }
      const rm = Math.min(H / 2 - 18, A.w * .3);
      const defs = sv(g, 'defs');
      const clips = sets.map((_, i) => sv(sv(defs, 'clipPath', { id: `${id}c${i}` }), 'circle', { r }));
      const pat = sv(defs, 'pattern', { id: id + 'h', width: 14, height: 14, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
      sv(pat, 'rect', { width: 14, height: 14 }, 'hb'); sv(pat, 'line', { x1: 0, y1: 0, x2: 0, y2: 14 }, 'hl');
      const circ = sets.map((_, i) => sv(g, 'circle', { r }, `vc vc${i} ${v}`));
      let host = g; for (let i = 0; i < n; i++) host = sv(host, 'g', { 'clip-path': `url(#${id}c${i})` });
      const lens = sv(host, 'rect', { x: 0, y: 0, width: A.w, height: A.h }, 'vx');
      if (v === 'outline') lens.style.fill = `url(#${id}h)`;
      const merged = v === 'merge' ? sv(g, 'circle', { cx, cy, r: rm }, 'vm') : null;
      const ring = v !== 'overlap' ? sv(g, 'circle', { cx: v === 'merge' ? cx : ctr[0], cy: v === 'merge' ? cy : ctr[1], r: v === 'merge' ? rm + 22 : 0 }, 'vring') : null;
      /* 每个圆的名字（圆的外侧半边）；交集文字 */
      const lw = n === 2 ? r * .78 : r * .82, lh = n === 2 ? r * .62 : r * .44, lo = n === 2 ? .42 : .4;
      const labs = sets.map(s => { const e = box(el('div', 'mk-dg-vl mk-abs', wrap, rich(s)), 0, 0, lw, lh); e.style.height = lh + 'px'; return e; });
      const vt = p.center ? el('div', 'mk-dg-vt mk-abs' + (n === 3 && v !== 'merge' ? ' pill' : ''), wrap, rich(p.center)) : null;
      const vtw = v === 'merge' ? rm * 1.45 : n === 2 ? r * .62 : r * 1.3, vth = v === 'merge' ? rm * .8 : n === 2 ? r * .8 : r * .36;
      if (vt) box(vt, (v === 'merge' ? cx : ctr[0]) - vtw / 2, (v === 'merge' ? cy : ctr[1]) - vth / 2, vtw, vth), vt.style.height = vth + 'px';
      const chipAng = n === 2 ? [Math.PI, 0] : [-Math.PI / 2, Math.PI / 6, Math.PI * 5 / 6];
      const chips = v === 'merge' ? sets.map(s => el('div', 'mk-dg-chip mk-abs', wrap, rich(s))) : [];
      ctx.measure(() => {
        const sz = Math.min(...labs.map(e => fit(e, Math.round(lh * .42), 18, lw, lh))); labs.forEach(e => { e.style.fontSize = sz + 'px'; });
        if (vt) { if (n === 3 && v !== 'merge') vt.style.whiteSpace = 'nowrap'; fit(vt, v === 'merge' ? 72 : n === 2 ? 46 : 34, 16, vtw - (n === 3 && v !== 'merge' ? 36 : 0), vth); }
        chips.forEach(e => { fit(e, 30, 16, r * .7, null); e._w = e.offsetWidth; e._h = e.offsetHeight; });
      });
      const at = beats(slot, n + 1, .3, .6, 1.6), cm = at[n], tAll = cm + .7;
      /* 音效 */
      at.slice(0, n).forEach((c, i) => { S(c - .1, v === 'outline' ? 'marker' : 'whoosh', .35, dirs[i][0] * .6); S(c + .25, 'pop', .4, dirs[i][0] * .6); });
      if (v === 'merge') { S(cm - .3, 'riser', .3, 0, { d: .4 }); S(cm + .15, 'boom', .6); punch(cm + .15, .04); flash(cm + .15, .3); shake(cm + .15, 8); S(cm + .6, 'pop', .4); }
      else { S(cm - .1, v === 'overlap' ? 'swipe' : 'fill', .35, 0, { d: .4 }); S(cm + .2, 'zap', .45); S(cm + .3, 'shine', .35); flash(cm + .2, .15); }
      const sep = n === 2 ? .3 : .26;
      const posAt = (t, i) => {
        const [dx, dy] = dirs[i], k = pr(t, at[i] - .05, at[i] + .6), mk = pr(t, cm - .25, cm + .3);
        if (v === 'outline') return { x: C[i][0], y: C[i][1], rr: r, k };
        const far = 1.5 * r * (1 - EZ.spring(k)), pre = sep * r * (1 - EZ.back(mk));
        let x = C[i][0] + dx * (far + pre), y = C[i][1] + dy * (far + pre), rr = r;
        if (v === 'merge') { const q = EZ.inout(pr(t, cm - .2, cm + .25)); x = lerp(x, cx, q); y = lerp(y, cy, q); rr = lerp(r, rm, q); }
        return { x, y, rr, k };
      };
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          showHead(head, t, slot.t0);
          const br = idle(t, tAll, 2.8).wave, km = pr(t, cm + .1, cm + .5);
          sets.forEach((_, i) => {
            const q = posAt(t, i), ce = circ[i];
            ce.setAttribute('cx', q.x.toFixed(2)); ce.setAttribute('cy', q.y.toFixed(2)); ce.setAttribute('r', q.rr.toFixed(2));
            clips[i].setAttribute('cx', q.x.toFixed(2)); clips[i].setAttribute('cy', q.y.toFixed(2)); clips[i].setAttribute('r', q.rr.toFixed(2));
            if (v === 'outline') {
              ce.setAttribute('transform', `rotate(-90 ${q.x.toFixed(1)} ${q.y.toFixed(1)})`);
              draw(ce, EZ.inout(pr(t, at[i] - .1, at[i] + .55)));
              ce.style.fillOpacity = EZ.out(pr(t, at[i] + .4, at[i] + .9)).toFixed(3);
              ce.style.opacity = t >= at[i] - .1 ? '1' : '0';
            } else {
              ce.style.opacity = (clamp(q.k * 3) * (v === 'merge' ? 1 - pr(t, cm + .1, cm + .35) : 1)).toFixed(3);
            }
            const lk = pr(t, at[i] + .2, at[i] + .65);
            tf(labs[i], { x: q.x + dirs[i][0] * q.rr * lo - lw / 2, y: q.y + dirs[i][1] * q.rr * lo - lh / 2, o: clamp(lk * 3) * (v === 'merge' ? 1 - pr(t, cm - .2, cm + .05) : 1), s: .7 + .3 * EZ.back(lk) });
          });
          const lx = pr(t, cm + .1, cm + .35);
          lens.style.opacity = v === 'merge' ? (Math.sin(Math.PI * pr(t, cm - .15, cm + .3)) * .9).toFixed(3)
            : (Math.max(0, 1 - lx) * 0 + clamp(lx * 4) * (.55 + .2 * (t > tAll ? br : 0) + .45 * (1 - pr(t, cm + .2, cm + .7)))).toFixed(3);
          if (merged) { tf(merged, {}); merged.style.transformOrigin = `${cx}px ${cy}px`; merged.style.transform = `scale(${(.6 + .4 * EZ.spring(pr(t, cm + .1, cm + .7)) + (t > tAll ? .015 * br : 0)).toFixed(4)})`; merged.style.opacity = clamp(km * 4).toFixed(3); }
          if (ring) {
            const k = pr(t, cm + .2, cm + .8);
            if (v === 'outline') ring.setAttribute('r', '0');
            ring.style.opacity = (v === 'merge' ? clamp(k * 2) : 0).toFixed(3);
            ring.style.strokeDashoffset = (-(t - cm) * 40).toFixed(1);
          }
          if (vt) { const k = pr(t, cm + .15, cm + .65); tf(vt, { o: clamp(k * 3), s: (v === 'merge' ? .3 : .5) + (v === 'merge' ? .7 : .5) * EZ.spring(k), blur: (1 - EZ.out(k)) * 8 }); vt.style.textShadow = t > tAll ? `0 0 ${(18 + 10 * br).toFixed(1)}px rgba(var(--w-rgb),.55)` : ''; }
          chips.forEach((e, i) => {
            const k = pr(t, cm + .35 + i * .1, cm + .8 + i * .1), an = chipAng[i] + (t > tAll ? (t - tAll) * .12 : 0);
            tf(e, { x: cx + Math.cos(an) * (rm + 4) - e._w / 2, y: cy + Math.sin(an) * (rm + 4) - e._h / 2, o: clamp(k * 3), s: .4 + .6 * EZ.back(k) });
          });
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          const X = A.x + (v === 'merge' ? cx : ctr[0]), Y = A.y + (v === 'merge' ? cy : ctr[1]);
          MK.fx.glow(c, X, Y, (v === 'merge' ? rm : r) * 1.6, v === 'merge' ? T().a : T().w, a * pr(t, cm + .1, cm + .6) * (.7 + .3 * idle(t, tAll, 2.8).wave));
        },
        fg(c, t) {
          const a = 1 - leave(t, slot);
          const X = A.x + (v === 'merge' ? cx : ctr[0]), Y = A.y + (v === 'merge' ? cy : ctr[1]);
          if (v === 'outline') sets.forEach((_, i) => { const k = EZ.inout(pr(t, at[i] - .1, at[i] + .55)); if (k > 0 && k < 1) MK.fx.comet(c, arcPts(A.x + C[i][0], A.y + C[i][1], r, r, -Math.PI / 2, -Math.PI / 2 + TAU, 90), k, T().aLite, a); });
          T().paint.burst(c, t, cm + .2, X, Y, { n: v === 'merge' ? 60 : 30, sp: v === 'merge' ? 1100 : 600, col: v === 'merge' ? T().aLite : T().w });
          MK.fx.ripple(c, t, cm + .2, X, Y, { r: (v === 'merge' ? rm : r) * 1.4, r0: 20, rings: 2, col: v === 'merge' ? T().a : T().w });
          if (t > tAll) MK.fx.twinkle(c, t, X - r * .6, Y - r * .5, r * 1.2, r, 6, T().w, a);
        },
        hint: { cx: A.x + cx, cy: A.y + cy },
      };
    },
  });

  /* ---------- mindmap：思维导图 ----------
     radial  中心在中间，分支落在椭圆上、子项在更外圈（竖屏：分支分上下两排，子项向外竖向展开）
     tree    右展树：中心 → 分支列 → 子项列（竖屏：中心在顶，左侧主干圆角分出）
     bubbles 气泡簇：圆形节点弹性长出，连线跟随气泡漂浮
     停留：光点从中心沿某一分支跑到子项，轮流点亮各分支 */
  MK.control('mindmap', {
    variants: ['radial', 'tree', 'bubbles'],
    build(slot, p, ctx) {
      const A = ctx.area, v = ctx.variant, P = ctx.portrait, B = p.branches, n = B.length;
      const wrap = box(el('div', 'mk-abs mk-dg', ctx.root), A.x, A.y, A.w, A.h);
      const g = svg(wrap, A.w, A.h, '', 'mk-dg-svg');
      const cx = A.w / 2, cy = A.h / 2;
      const kids = B.map(b => b.children || []);
      let core, br = [], ch = [];
      const keep = s => { s.cx = clamp(s.cx, s.w / 2 + 2, A.w - s.w / 2 - 2); s.cy = clamp(s.cy, s.h / 2 + 2, A.h - s.h / 2 - 2); return s; };
      if (v === 'radial' && !P) {
        core = { cx, cy, w: 220, h: 100, kind: 'h' };
        const rxb = A.w * .22, ryb = A.h * .3, cw = 170, chh = 46, rxc = A.w / 2 - cw / 2 - 4, ryc = A.h / 2 - chh / 2 - 4;
        B.forEach((b, i) => {
          const an = -Math.PI / 2 + Math.PI / n + i * TAU / n;
          br.push({ cx: cx + Math.cos(an) * rxb, cy: cy + Math.sin(an) * ryb, w: 196, h: 66, kind: 'h' });
          const m = kids[i].length, dl = Math.min(.5, Math.PI / n * .8);
          ch.push(kids[i].map((_, j) => { const a2 = an + (j - (m - 1) / 2) * dl; return keep({ cx: cx + Math.cos(a2) * rxc, cy: cy + Math.sin(a2) * ryc, w: cw, h: chh, kind: 'h' }); }));
        });
      } else if (v === 'radial') {
        core = { cx, cy, w: 260, h: 104, kind: 'h' };
        const nt = Math.ceil(n / 2), rowY = [cy - 158, cy + 158], cw = Math.min(280, A.w / nt - 24), bh = 66, chh = 48;
        B.forEach((b, i) => {
          const up = i < nt, k = up ? i : i - nt, cnt = up ? nt : n - nt, colW = A.w / cnt, x = colW * (k + .5), y = rowY[up ? 0 : 1];
          br.push({ cx: x, cy: y, w: Math.min(colW - 24, 290), h: bh, kind: 'h' });
          ch.push(kids[i].map((_, j) => ({ cx: x, cy: y + (up ? -1 : 1) * (bh / 2 + 22 + chh / 2 + j * (chh + 12)), w: Math.min(colW - 40, cw), h: chh, kind: 'h' })));
        });
      } else if (v === 'tree') {
        const U = kids.reduce((s, k) => s + Math.max(1, k.length), 0);
        if (!P) {
          core = { cx: A.w * .1 + 2, cy, w: A.w * .2, h: 120, kind: 'v' };
          const bx = A.w * .29, bw = A.w * .27, chx = A.w * .64, cw = A.w - chx - 2, uh = Math.min(120, A.h / U);
          let y = (A.h - uh * U) / 2;
          B.forEach((b, i) => {
            const m = Math.max(1, kids[i].length), hgt = uh * m;
            br.push({ cx: bx + bw / 2, cy: y + hgt / 2, w: bw, h: Math.min(80, hgt - 14), kind: 'h' });
            ch.push(kids[i].map((_, j) => ({ cx: chx + cw / 2, cy: y + uh * (j + .5), w: cw, h: Math.min(58, uh - 12), kind: 'h' })));
            y += hgt;
          });
        } else {
          core = { cx: A.w / 2, cy: 56, w: Math.min(460, A.w * .5), h: 100, kind: 'h' };
          const x0 = 96, bw = A.w * .38, chx = x0 + bw + 56, cw = A.w - chx - 2, y0 = 140, uh = Math.min(120, (A.h - y0) / U);
          let y = y0 + (A.h - y0 - uh * U) / 2;
          B.forEach((b, i) => {
            const m = Math.max(1, kids[i].length), hgt = uh * m;
            br.push({ cx: x0 + bw / 2, cy: y + hgt / 2, w: bw, h: Math.min(80, hgt - 14), kind: 'h' });
            ch.push(kids[i].map((_, j) => ({ cx: chx + cw / 2, cy: y + uh * (j + .5), w: cw, h: Math.min(58, uh - 12), kind: 'h' })));
            y += hgt;
          });
        }
      } else {
        const rc = P ? 102 : 92, rb = P ? 72 : 68, rs = P ? 52 : 48, rx = P ? A.w * .27 : A.w * .285, ry = P ? A.h * .26 : A.h * .24, dist = rb + rs + 12;
        core = { cx, cy, w: rc * 2, h: rc * 2, kind: 'c', r: rc };
        B.forEach((b, i) => {
          const an = -Math.PI / 2 + Math.PI / n + i * TAU / n, bx = cx + Math.cos(an) * rx, by = cy + Math.sin(an) * ry, oa = Math.atan2(by - cy, bx - cx);
          br.push({ cx: bx, cy: by, w: rb * 2, h: rb * 2, kind: 'c', r: rb });
          const m = kids[i].length;
          ch.push(kids[i].map((_, j) => { const a2 = oa + (m === 1 ? 0 : (j ? .55 : -.55)); return keep({ cx: bx + Math.cos(a2) * dist, cy: by + Math.sin(a2) * dist, w: rs * 2, h: rs * 2, kind: 'c', r: rs }); }));
        });
      }
      /* 连线（bubbles 的连线画在画布上，跟随漂浮） */
      const curve = (a, b) => {
        if (v === 'tree' && P && a === core) return rounded([[core.cx - core.w / 2 + 40, core.cy + core.h / 2 + 4], [40, core.cy + core.h / 2 + 30], [40, b.cy], [b.cx - b.w / 2 - 10, b.cy]], 24);
        const horiz = v === 'tree' || Math.abs(b.cx - a.cx) > Math.abs(b.cy - a.cy) * (v === 'radial' && P ? 9 : 1.2);
        const s = [a.cx, a.cy], e = [b.cx, b.cy];
        const pts = horiz ? bez(s, [lerp(s[0], e[0], .55), s[1]], [lerp(s[0], e[0], .45), e[1]], e, 60) : bez(s, [s[0], lerp(s[1], e[1], .55)], [e[0], lerp(s[1], e[1], .45)], e, 60);
        return trim(pts, a, b, 4, 8);
      };
      const LB = v === 'bubbles' ? [] : br.map(s => mkLink(g, curve(core, s), A, { cls: 'thick' }));
      const LC = v === 'bubbles' ? [] : ch.map((list, i) => list.map(s => mkLink(g, curve(br[i], s), A, { cls: 'thin' })));
      const Nc = node(wrap, { text: p.center, icon: p.icon }, core.kind, core, 'core');
      const Nb = B.map((b, i) => node(wrap, { text: b.text, icon: b.icon }, br[i].kind, br[i], 'br'));
      const Nk = kids.map((list, i) => list.map((s, j) => node(wrap, { text: s }, ch[i][j].kind, ch[i][j], 'sm')));
      ctx.measure(() => { fitNodes([Nc], P ? 48 : 44); fitNodes(Nb, v === 'bubbles' ? 34 : 36); fitNodes(Nk.flat(), v === 'bubbles' ? 24 : 30, 15); });
      const at = beats(slot, n + 1, .25, .6, 1.8), tAll = at[n] + .4 + .35 * 2;
      const kAt = (i, j) => at[1 + i] + .3 + j * .16;
      /* 音效 */
      S(at[0] - .05, 'whoosh', .35); S(at[0], v === 'bubbles' ? 'bubble' : 'pop', .55, 0, { n: 0 });
      B.forEach((b, i) => {
        const px = pan(br[i].cx, A.w);
        S(at[1 + i] - .3, v === 'bubbles' ? 'swipe' : 'marker', .25, px); S(at[1 + i], v === 'bubbles' ? 'bubble' : 'pop', .42, px, { n: 3 + i });
        kids[i].forEach((_, j) => S(kAt(i, j), v === 'bubbles' ? 'bubble' : 'tick', .28, px, { n: 6 + i + j }));
      });
      S(tAll, 'shine', .28);
      /* 停留：每 1.3 秒轮到一个分支：光点 中心→分支（前 45%）→ 子项 */
      const loop = t => { if (t < tAll) return null; const [j, k] = cyc(t, tAll, 1.3); return { i: j % n, k }; };
      const float = (t, i, a) => (t > tAll ? [MK.noise(t * .45 + i * 3.3) * a, MK.noise(t * .45 + i * 5.1 + 40) * a] : [0, 0]);
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          const L = loop(t);
          const f0 = v === 'bubbles' ? float(t, 0, 4) : [0, 0];
          popNode(Nc, t, at[0], { s0: .2, x: f0[0], y: f0[1], dy: 0 });
          Nc.e.style.boxShadow = t > at[0] + .4 ? `0 0 ${(36 + 14 * idle(t, tAll, 2.6).wave).toFixed(1)}px rgba(var(--a-rgb),.4)` : '';
          B.forEach((b, i) => {
            const c = at[1 + i], k = EZ.inout(pr(t, c - .32, c - .02));
            if (LB[i]) drawLink(LB[i], k);
            const fb = v === 'bubbles' ? float(t, 1 + i, 7) : [0, 0], dir = [br[i].cx - core.cx, br[i].cy - core.cy], dl = Math.hypot(...dir) || 1;
            popNode(Nb[i], t, c, { x: fb[0], y: fb[1], dx: -dir[0] / dl * 60, dy: -dir[1] / dl * 60, s0: v === 'bubbles' ? 0 : .3 });
            Nb[i].e.classList.toggle('on', L ? L.i === i : t >= c && t < c + .6);
            kids[i].forEach((_, j) => {
              const ck = kAt(i, j); if (LC[i]) drawLink(LC[i][j], EZ.out(pr(t, ck - .25, ck)));
              const fk = v === 'bubbles' ? float(t, 20 + i * 3 + j, 9) : [0, 0];
              popNode(Nk[i][j], t, ck, { x: fk[0], y: fk[1], dx: v === 'tree' ? -40 : 0, dy: v === 'tree' ? 0 : 18, s0: v === 'bubbles' ? 0 : .4 });
              Nk[i][j].e.classList.toggle('on', !!L && L.i === i && L.k > .45);
            });
          });
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          if (v !== 'bubbles') return;
          /* 气泡连线：两圆边缘之间的光束，随漂浮更新 */
          const pos = (s, i, amp) => { const f = float(t, i, amp); return [A.x + s.cx + f[0], A.y + s.cy + f[1]]; };
          const beam = (s1, p1, s2, p2, k, w) => { const dx = p2[0] - p1[0], dy = p2[1] - p1[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d; T().paint.beam(c, p1[0] + ux * (s1.r + 4), p1[1] + uy * (s1.r + 4), p2[0] - ux * (s2.r + 4), p2[1] - uy * (s2.r + 4), T().a, .8 * a, { p: k, w }); };
          const pc = pos(core, 0, 4);
          B.forEach((b, i) => {
            const pb = pos(br[i], 1 + i, 7); beam(core, pc, br[i], pb, EZ.inout(pr(t, at[1 + i] - .32, at[1 + i] - .02)), 3);
            ch[i].forEach((s, j) => beam(br[i], pb, s, pos(s, 20 + i * 3 + j, 9), EZ.out(pr(t, kAt(i, j) - .25, kAt(i, j))), 2));
          });
        },
        fg(c, t) {
          const a = 1 - leave(t, slot);
          MK.fx.ripple(c, t, at[0], A.x + core.cx, A.y + core.cy, { r: 200, rings: 2 });
          if (v !== 'bubbles') {
            B.forEach((b, i) => { const k = EZ.inout(pr(t, at[1 + i] - .32, at[1 + i] - .02)); if (k > 0 && k < 1) MK.fx.comet(c, LB[i].abs, k, T().aLite, a); });
            const L = loop(t);
            if (L) {
              if (L.k < .45) MK.fx.comet(c, LB[L.i].abs, EZ.inout(L.k / .45), T().w, a);
              else LC[L.i].forEach(l => MK.fx.comet(c, l.abs, EZ.inout(clamp((L.k - .45) / .4)), T().w, a, { r: 5 }));
            }
          } else {
            B.forEach((b, i) => MK.fx.ripple(c, t, at[1 + i], A.x + br[i].cx, A.y + br[i].cy, { r: 110, r0: br[i].r, rings: 1 }));
            const L = loop(t);
            if (L) MK.fx.ripple(c, t, tAll + Math.floor((t - tAll) / 1.3) * 1.3, A.x + br[L.i].cx, A.y + br[L.i].cy, { r: 90, r0: br[L.i].r, rings: 1, col: T().w });
          }
        },
        hint: { cx: A.x + core.cx, cy: A.y + core.cy },
      };
    },
  });

  /* ---------- matrix：2×2 象限 ----------
     quadrant 十字轴从中心描出，四个象限依次翻起，点落入弹跳
     scatter  L 形坐标轴 + 刻度网格，象限名在角落，点带波纹落下；停留时扫描线扫过、点依次脉冲
     priority 四象限不同色调，重点象限（pick）放大发光、其余变暗
     quads 顺序：左上、右上、左下、右下；点的 x/y 取 0–1（y 向上） */
  MK.control('matrix', {
    variants: ['quadrant', 'scatter', 'priority'],
    build(slot, p, ctx) {
      const A = ctx.area, v = ctx.variant, P = ctx.portrait, pts = p.points || [];
      const wrap = box(el('div', 'mk-abs mk-dg', ctx.root), A.x, A.y, A.w, A.h);
      const head = heading(wrap, p.title, A, ctx), top = head.h;
      const pw = Math.min(A.w - (P ? 40 : 80), P ? 900 : 920), ph = A.h - top - 100, px0 = (A.w - pw) / 2, py0 = top + 50;
      const g = svg(wrap, A.w, A.h, '', 'mk-dg-svg');
      const gp = v === 'scatter' ? 0 : 10, tw = (pw - gp) / 2, th = (ph - gp) / 2;
      const tiles = p.quads.map((s, i) => {
        const c = i % 2, r = Math.floor(i / 2);
        const e = box(el('div', `mk-dg-q q${i} ${v}${pts.length && v !== 'scatter' ? ' corner' : ''}`, wrap), px0 + c * (tw + gp), py0 + r * (th + gp), tw, th); e.style.height = th + 'px';
        const tt = el('div', 'tt', e, rich(s));
        e.style.transformOrigin = `${c ? '0%' : '100%'} ${r ? '0%' : '100%'}`;
        return { e, tt, c, r };
      });
      /* 坐标轴 */
      let axes = [];
      const mx = px0 + pw / 2, my = py0 + ph / 2, ext = 22;
      if (v === 'scatter') {
        axes = [mkLink(g, seg([px0, py0 + ph], [px0 + pw + ext, py0 + ph]), A, { arrow: true, cls: 'ax' }), mkLink(g, seg([px0, py0 + ph], [px0, py0 - ext]), A, { arrow: true, cls: 'ax' })];
        for (let i = 1; i < 4; i++) { axes.push(mkLink(g, seg([px0 + pw * i / 4, py0 + ph], [px0 + pw * i / 4, py0]), A, { cls: 'grid' + (i === 2 ? ' mid' : '') })); axes.push(mkLink(g, seg([px0, py0 + ph * i / 4], [px0 + pw, py0 + ph * i / 4]), A, { cls: 'grid' + (i === 2 ? ' mid' : '') })); }
      } else {
        axes = [mkLink(g, seg([mx, my], [px0 + pw + ext, my]), A, { arrow: true, cls: 'ax' }), mkLink(g, seg([mx, my], [mx, py0 - ext]), A, { arrow: true, cls: 'ax' }), mkLink(g, seg([mx, my], [px0 - 6, my]), A, { cls: 'ax' }), mkLink(g, seg([mx, my], [mx, py0 + ph + 6]), A, { cls: 'ax' })];
      }
      const axl = [p.yLabel, p.xLabel].map((s, i) => {
        if (!s) return null;
        const e = el('div', 'mk-dg-axl mk-abs', wrap, rich(s));
        if (i === 0) box(e, px0, py0 - 48, pw / 2 - 30); else { box(e, px0 + pw / 2 + 30, py0 + ph + 12, pw / 2 - 30); e.style.textAlign = 'right'; }
        return e;
      });
      const dots = pts.map(d => {
        const e = el('div', 'mk-dg-pt mk-abs', wrap, `<i></i><span>${rich(d.label)}</span>`);
        const left = d.x > .7;
        if (left) e.classList.add('l');
        return { e, sp: e.querySelector('span'), d, x: 0, y: 0, left };
      });
      const pick = clamp((p.pick || 2) - 1, 0, 3);
      ctx.measure(() => {
        const corner = v === 'scatter' || pts.length > 0;
        if (corner) tiles.forEach(q => { q.tt.style.whiteSpace = 'nowrap'; });
        const sz = Math.min(...tiles.map(q => fit(q.tt, v === 'scatter' ? 32 : corner ? 34 : P ? 50 : 46, 16, tw * (corner ? .86 : .8), corner ? 50 : th * .6)));
        tiles.forEach(q => { q.tt.style.fontSize = sz + 'px'; });
        /* 有落点时：点的纵向范围避开上下两排象限名 */
        const band = corner ? tiles[0].tt.offsetHeight + 26 : 0;
        dots.forEach(d => { d.x = px0 + clamp(d.d.x) * pw; d.y = py0 + band + (1 - clamp(d.d.y)) * (ph - 2 * band); });
        axl.forEach(e => e && fit(e, 28, 16, pw / 2 - 30, 40));
        dots.forEach(d => { fit(d.sp, 28, 16, Math.min(200, pw * .3), null); const w = d.e.offsetWidth, h = d.e.offsetHeight; d.w = w; d.h = h; });
      });
      const c0 = slot.cues[0] ?? slot.t0 + .2, c1 = slot.cues[1] ?? c0 + .75, c2 = slot.cues[2] ?? c1 + 1.15;
      const tq = tiles.map((_, i) => c1 + i * .2), tp = dots.map((_, i) => c2 + (v === 'priority' ? .5 : 0) + i * .16);
      const tAll = Math.max(c2 + .6, ...tp.map(x => x + .6));
      /* 音效 */
      S(c0, 'swoosh', .4); S(c0 + .1, 'marker', .3, 0, { d: .5 });
      tq.forEach((c, i) => S(c, v === 'quadrant' ? 'card' : 'pop', .35, (i % 2 ? .4 : -.4), { n: i }));
      if (v === 'priority') { S(c2, 'hit', .6); flash(c2, .18); shake(c2, 6); punch(c2, .03); }
      tp.forEach((c, i) => S(c + .1, 'blip', .3, pan(dots[i].x, A.w), { n: i * 2 }));
      if (v === 'scatter') S(tAll + .1, 'shine', .25);
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          showHead(head, t, slot.t0);
          axes.forEach((l, i) => drawLink(l, EZ.inout(pr(t, c0 + (i > 1 ? .15 : 0) + (v === 'scatter' && i > 1 ? (i - 2) * .04 : 0), c0 + .7))));
          axl.forEach((e, i) => { if (e) { const k = pr(t, c0 + .4 + i * .1, c0 + .9 + i * .1); tf(e, { o: clamp(k * 3), x: (1 - EZ.expo(k)) * (i ? 20 : -20) }); } });
          const [step] = cyc(t, tAll, 1.1), hot = t > tAll && v === 'quadrant' ? step % 4 : -1;
          const pk = v === 'priority' ? EZ.back(pr(t, c2, c2 + .45)) : 0, br = idle(t, tAll, 2.4).wave;
          tiles.forEach((q, i) => {
            const k = pr(t, tq[i], tq[i] + .55);
            if (v === 'quadrant') tf(q.e, { p: 900, o: clamp(k * 3), rx: (1 - EZ.back(k)) * (q.r ? -80 : 80), s: 1 + (hot === i ? .015 : 0) });
            else if (v === 'scatter') tf(q.e, { o: clamp(k * 2) });
            else {
              const isP = i === pick, dim = 1 - .55 * pk * (isP ? 0 : 1);
              tf(q.e, { o: clamp(k * 3) * dim, s: (.6 + .4 * EZ.spring(k)) * (isP ? 1 + .05 * pk + (t > tAll ? .01 * br : 0) : 1) });
              q.e.style.zIndex = isP ? '2' : '1';
              q.e.classList.toggle('pick', isP && t >= c2);
            }
            q.e.classList.toggle('on', hot === i);
            tf(q.tt, { o: clamp(pr(t, tq[i] + .2, tq[i] + .5) * 3), y: (1 - EZ.expo(pr(t, tq[i] + .2, tq[i] + .6))) * 14 });
          });
          dots.forEach((d, i) => {
            const k = pr(t, tp[i], tp[i] + .7), pulse = v === 'scatter' && t > tAll ? Math.max(0, 1 - Math.abs(((t - tAll) / 2.4 % 1) * (pw + 200) - 100 - (d.x - px0)) / 70) : 0;
            tf(d.e, { x: d.x - (d.left ? d.w - 13 : 13), y: d.y - d.h / 2 - (1 - EZ.bounce(k)) * 240, o: clamp(k * 5), s: 1 + .25 * pulse });
            d.e.classList.toggle('on', pulse > .3);
          });
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          if (v === 'priority') { const q = tiles[pick]; MK.fx.glow(c, A.x + px0 + q.c * (tw + gp) + tw / 2, A.y + py0 + q.r * (th + gp) + th / 2, Math.max(tw, th) * .8, T().w, a * pr(t, c2, c2 + .5) * (.75 + .25 * idle(t, tAll, 2.4).wave)); }
          if (v === 'scatter' && t > tAll) {
            const x = A.x + px0 - 100 + ((t - tAll) / 2.4 % 1) * (pw + 200);
            if (x > A.x + px0 && x < A.x + px0 + pw) T().paint.beam(c, x, A.y + py0, x, A.y + py0 + ph, T().a, .5 * a, { w: 2 });
          }
        },
        fg(c, t) {
          const a = 1 - leave(t, slot);
          dots.forEach((d, i) => MK.fx.ripple(c, t, tp[i] + .25, A.x + d.x, A.y + d.y, { r: 70, r0: 8, rings: 1, w: 2, col: T().w }));
          if (v === 'priority') { const q = tiles[pick]; T().paint.burst(c, t, c2, A.x + px0 + q.c * (tw + gp) + tw / 2, A.y + py0 + q.r * (th + gp) + th / 2, { n: 36, sp: 800, col: T().w }); }
          if (v === 'quadrant') MK.fx.ripple(c, t, c0, A.x + mx, A.y + my, { r: 260, rings: 2 });
          void a;
        },
        hint: { cx: A.x + mx, cy: A.y + my },
      };
    },
  });

  /* ---------- hub：中心辐射 ----------
     star          中心圆 + 周围卫星卡，连线射出；停留时信号沿连线一去一回
     grid          卫星排成两列（竖屏两行），电路板式圆角折线；停留时信号逐条跑过
     constellation 卫星是星点 + 标签，星点之间连成星座；停留时星光闪烁、光点沿星座游走 */
  MK.control('hub', {
    variants: ['star', 'grid', 'constellation'],
    build(slot, p, ctx) {
      const A = ctx.area, v = ctx.variant, P = ctx.portrait, it = p.items, k = it.length;
      const wrap = box(el('div', 'mk-abs mk-dg', ctx.root), A.x, A.y, A.w, A.h);
      const g = svg(wrap, A.w, A.h, '', 'mk-dg-svg');
      const cx = A.w / 2, cy = A.h / 2;
      let C, sat = [], routes = [], labs = [], ringL = null, stars = [];
      if (v === 'star') {
        const rc = P ? 104 : 94, w = P ? 214 : 226, h = 72, rx = cx - w / 2 - 4, ry = cy - h / 2 - 4;
        C = { cx, cy, w: rc * 2, h: rc * 2, r: rc, kind: 'c' };
        it.forEach((_, i) => { const an = -Math.PI / 2 + i * TAU / k; sat.push({ cx: cx + Math.cos(an) * rx, cy: cy + Math.sin(an) * ry, w, h, kind: 'h' }); });
        routes = sat.map(s => trim(seg([cx, cy], [s.cx, s.cy], 60), C, s, 6, 10));
      } else if (v === 'grid') {
        if (!P) {
          const kl = Math.ceil(k / 2), w = Math.min(290, A.w * .29), h = Math.min(86, (A.h - 18 * (kl - 1)) / kl);
          C = { cx, cy, w: Math.min(260, A.w - 2 * w - 220), h: 210, kind: 'v' };
          const cols = [[...Array(kl).keys()], [...Array(k - kl).keys()].map(j => j + kl)];
          cols.forEach((list, side) => {
            const cnt = list.length, gy = cnt > 1 ? Math.min(48, (A.h - cnt * h) / (cnt - 1)) : 0, sx = side ? 1 : -1;
            list.forEach((i, j) => {
              const s = { cx: side ? A.w - w / 2 - 2 : w / 2 + 2, cy: cy + (j - (cnt - 1) / 2) * (h + gy), w, h, kind: 'h' };
              sat[i] = s;
              const ce = cx + sx * (C.w / 2 + 8), se = s.cx - sx * (w / 2 + 10), mid = cnt > 1 ? 1 - Math.abs(j - (cnt - 1) / 2) / ((cnt - 1) / 2) : 1;
              const mxx = lerp(ce, se, .3 + .4 * mid), y0 = cy + (j - (cnt - 1) / 2) * 24;
              routes[i] = rounded([[ce, y0], [mxx, y0], [mxx, s.cy], [se, s.cy]], 20);
            });
          });
        } else {
          const kt = Math.ceil(k / 2), cmax = Math.max(kt, k - kt), w = (A.w - 20 * (cmax - 1)) / cmax, h = Math.min(170, A.h * .25);
          C = { cx, cy, w: Math.min(460, A.w * .5), h: 120, kind: 'h' };
          const rowsI = [[...Array(kt).keys()], [...Array(k - kt).keys()].map(j => j + kt)];
          rowsI.forEach((list, side) => {
            const cnt = list.length, sy = side ? 1 : -1, x0 = (A.w - (cnt * w + 20 * (cnt - 1))) / 2;
            list.forEach((i, j) => {
              const s = { cx: x0 + w / 2 + j * (w + 20), cy: side ? A.h - h / 2 - 2 : h / 2 + 2, w, h, kind: 'v' };
              sat[i] = s;
              const ce = cy + sy * (C.h / 2 + 8), se = s.cy - sy * (h / 2 + 10), mid = cnt > 1 ? 1 - Math.abs(j - (cnt - 1) / 2) / ((cnt - 1) / 2) : 1;
              const myy = lerp(ce, se, .3 + .4 * mid), x1 = cx + (j - (cnt - 1) / 2) * 36;
              routes[i] = rounded([[x1, ce], [x1, myy], [s.cx, myy], [s.cx, se]], 20);
            });
          });
        }
      } else {
        const labW = P ? 220 : 220, labH = 66, rx = (cx - labW - 40) / 1.08, ry = (cy - labH - 30) / 1.08, step = TAU / k;
        C = { cx, cy, w: Math.min(340, rx * 1.3), h: 100, kind: 'h', r: 64 };
        it.forEach((d, i) => {
          const an = -Math.PI / 2 + i * step + (rnd(i, 5) - .5) * step * .3, rr = 1 + (rnd(i, 6) - .5) * .16;
          const x = cx + Math.cos(an) * rx * rr, y = cy + Math.sin(an) * ry * rr;
          stars.push({ x, y, an });
          labs.push(outLab(wrap, (d.icon ? MK.icon(d.icon, 30, 2) : '') + `<span>${rich(d.text)}</span>`, x, y, an, 22, labW, labH, 'star'));
          routes.push(trim(seg([cx, cy], [x, y], 60), { cx, cy, r: 70 }, { cx: x, cy: y, r: 0 }, 0, 14));
        });
        ringL = mkLink(g, stars.concat([stars[0]]).reduce((o, s, i, arr) => (i ? join(o, seg([arr[i - 1].x, arr[i - 1].y], [s.x, s.y], 20)) : o), []), A, { cls: 'cons' });
      }
      const L = routes.map(r => mkLink(g, r, A, { arrow: v !== 'constellation', cls: v === 'constellation' ? 'thin' : '' }));
      const Nc = node(wrap, p.center, C.kind, C, 'core' + (v === 'constellation' ? ' bare' : ''));
      const Ns = v === 'constellation' ? [] : it.map((d, i) => node(wrap, d, sat[i].kind, sat[i]));
      ctx.measure(() => {
        fitNodes([Nc], P ? 44 : 42);
        if (Ns.length) fitNodes(Ns, 34, 17);
        if (labs.length) { const sz = Math.min(...labs.map(l => fit(l.inner, 32, 17, l.w, l.h))); labs.forEach(l => { l.inner.style.fontSize = sz + 'px'; }); }
      });
      const at = beats(slot, k + 1, .25, .45, 1.6), tAll = at[k] + .6;
      const linkK = (t, i) => EZ.inout(pr(t, at[1 + i] - .3, at[1 + i] - .02));
      /* 音效 */
      S(at[0] - .05, v === 'constellation' ? 'swell' : 'whoosh', .35, 0, { d: .6 }); S(at[0], v === 'grid' ? 'thud' : 'pop', .55);
      it.forEach((_, i) => { const x = v === 'constellation' ? stars[i].x : sat[i].cx; S(at[1 + i] - .28, v === 'grid' ? 'zap' : 'swipe', .18, pan(x, A.w)); S(at[1 + i], v === 'constellation' ? 'blip' : 'pop', .4, pan(x, A.w), { n: i * 2 }); });
      S(tAll, v === 'constellation' ? 'chime' : 'shine', .3);
      /* 停留节奏 */
      const loop = t => {
        if (t < tAll) return null;
        if (v === 'star') { const [j, q] = cyc(t, tAll, 1.7); return { all: true, k: q < .6 ? EZ.inout(q / .6) : -1, back: j % 2 === 1 }; }
        if (v === 'grid') { const [j, q] = cyc(t, tAll, .55); return { i: j % k, k: EZ.inout(q) }; }
        return { k: ((t - tAll) / (1.1 * k)) % 1 };
      };
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          popNode(Nc, t, at[0], { s0: .2, dy: 0 });
          Nc.e.style.boxShadow = v !== 'constellation' && t > at[0] + .4 ? `0 0 ${(40 + 16 * idle(t, tAll, 1.7).wave).toFixed(1)}px rgba(var(--a-rgb),.45)` : '';
          L.forEach((l, i) => drawLink(l, linkK(t, i)));
          const lp = loop(t);
          Ns.forEach((N, i) => {
            const dir = [sat[i].cx - cx, sat[i].cy - cy], d = Math.hypot(...dir) || 1;
            popNode(N, t, at[1 + i], { dx: -dir[0] / d * 70, dy: -dir[1] / d * 70 });
            const on = lp ? (v === 'star' ? !lp.back && lp.k > .85 : lp.i === i && lp.k > .8) : t >= at[1 + i] && t < at[1 + i] + .5;
            N.e.classList.toggle('on', on);
          });
          labs.forEach((lb, i) => showLab(lb, t, at[1 + i] + .1));
          if (ringL) drawLink(ringL, EZ.inout(pr(t, tAll - .5, tAll + .5)));
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          if (v === 'constellation') {
            T().paint.ball(c, A.x + cx, A.y + cy, 64, T().a, a * EZ.spring(pr(t, at[0], at[0] + .6)), { lat: t * .5 });
            MK.fx.twinkle(c, t, A.x, A.y, A.w, A.h, 18, T().aLite, .6 * a * pr(t, slot.t0, slot.t0 + 1));
          } else MK.fx.glow(c, A.x + cx, A.y + cy, 260, T().a, .6 * a * pr(t, at[0], at[0] + .5));
          if (v === 'grid') routes.forEach((r, i) => { if (t > at[1 + i]) { const q = r[Math.floor(r.length / 2)]; MK.fx.glow(c, A.x + q[0], A.y + q[1], 26, T().a, .8 * a); } });
        },
        fg(c, t) {
          const a = 1 - leave(t, slot);
          L.forEach((l, i) => { const k2 = linkK(t, i); if (k2 > 0 && k2 < 1) MK.fx.comet(c, l.abs, k2, T().aLite, a); });
          MK.fx.ripple(c, t, at[0], A.x + cx, A.y + cy, { r: 240, rings: 2 });
          if (v === 'constellation') stars.forEach((s, i) => {
            const k2 = pr(t, at[1 + i] - .05, at[1 + i] + .4), tw = .75 + .25 * Math.sin(t * 3 + i * 1.7), X = A.x + s.x, Y = A.y + s.y;
            if (k2 <= 0) return;
            MK.fx.glow(c, X, Y, 40 * EZ.spring(k2), T().aLite, a * tw);
            c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(255,255,255,${a * clamp(k2 * 3)})`; c.beginPath(); c.arc(X, Y, 6 * EZ.spring(k2), 0, 7); c.fill();
            const f = (1 - k2) * 46 + 12 * tw; c.strokeStyle = `rgba(${T().aLite},${.8 * a})`; c.lineWidth = 1.5; c.beginPath(); c.moveTo(X - f, Y); c.lineTo(X + f, Y); c.moveTo(X, Y - f); c.lineTo(X, Y + f); c.stroke(); c.restore();
          });
          const lp = loop(t);
          if (!lp) return;
          if (v === 'star' && lp.k >= 0) L.forEach(l => MK.fx.comet(c, lp.back ? [...l.abs].reverse() : l.abs, lp.k, T().w, .9 * a, { r: 6 }));
          if (v === 'grid') MK.fx.comet(c, L[lp.i].abs, lp.k, T().w, a, { r: 6 });
          if (v === 'constellation') MK.fx.comet(c, ringL.abs, lp.k + .001, T().w, a, { tail: .003 });
        },
        hint: { cx: A.x + cx, cy: A.y + cy },
      };
    },
  });
})();
