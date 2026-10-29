/* motion-kit · 数据可视化控件（0.3.0）：donut / linechart / counter / progress / timeline / table / ranking
   donut     ring 环形 + 引线标注、中心合计滚动 / pie 实心扇区弹出后回位 / split 环形 + 侧边图例逐条点亮、轮流高亮
   linechart line 描线生长 + 拖尾光点 + 终点标注 / area 面积从基线弹起 + 扫描线 / spark 大数字跟随走势 + 涨跌
   counter   cards 三维翻牌 + 滚动计数 / odometer 里程表滚轮 / ticker 行情板乱码锁定
   progress  bars 斜纹横条 / rings 同心环 / battery 分段电量格
   timeline  horizontal 沿线点亮 / vertical 卡片列表 / zigzag 折线节点（竖屏 horizontal 自动纵向）
   table     grid 逐行扫入 + 赢家列扫光 / scorecard 方案卡片 / checklist 打勾清单 + 计票
   ranking   race 条形赛跑后换位 / podium 领奖台升起 / list 名次牌自下而上翻入
   约定见 AUTHORING.md：只由 t 求值，音效在 build 里登记，颜色只取主题。 */
(function () {
  'use strict';
  const { clamp, lerp, pr, EZ, el, box, set, tf, fit, html, rich, esc, S, flash, shake, punch, stagger, rnd } = MK;
  const T = () => MK.T;
  const PI = Math.PI, A0 = -PI / 2;
  const leave = (t, slot) => pr(t, slot.t1 - .35, slot.t1);
  /* cue 缺省：n 个节拍在本段可用时间里均匀错开；off = 前面已被别的动作占用的 cue 个数 */
  const beats = (slot, n, start = .3, gap = .8, reserve = 1.6, off = 0) =>
    stagger(n, slot.t0 + start, Math.min(gap, Math.max(.22, (slot.t1 - slot.t0 - start - reserve) / Math.max(1, n - 1))), slot.cues.slice(off));
  /* 系列配色：画布用 MK.T 的 rgb 字段，DOM 用对应 CSS 变量 */
  const CK = ['a', 'w', 'a2', 'g', 'r'], CV = ['a', 'w', 'a2', 'ok', 'bad'];
  const col = i => T()[CK[i % 5]];
  const cvar = (i, a = 1) => `rgba(var(--${CV[i % 5]}-rgb),${a})`;
  const unitH = u => (u ? `<small>${esc(u)}</small>` : '');
  const sign = d => (d >= 0 ? '+' : '−');
  /* 标题条：左侧发光竖条 + 文字 */
  const header = (wrap, p, w, center = false) => {
    if (!p.title) return null;
    const h = box(el('div', 'mk-dt-hd mk-abs' + (center ? ' c' : ''), wrap, `<i></i><span>${rich(p.title)}</span>`), 0, 0, w);
    return h;
  };
  const headerIn = (h, t, t0) => { if (!h) return; const k = pr(t, t0, t0 + .55); tf(h, { o: clamp(k * 3), x: (1 - EZ.expo(k)) * -40 }); h.style.setProperty('--k', clamp(EZ.back(k), 0, 1.2).toFixed(3)); };
  /* 折线：按点序号（可带小数）取位置 / 画出 f0..f1 一段 */
  const polyAt = (pts, f) => { const i = clamp(Math.floor(f), 0, pts.length - 2), u = clamp(f - i); return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u)]; };
  const polyPart = (c, pts, f0, f1) => {
    if (f1 <= f0 + 1e-4) return false;
    const a = polyAt(pts, f0), b = polyAt(pts, f1);
    c.beginPath(); c.moveTo(a[0], a[1]);
    for (let j = Math.floor(f0) + 1; j < f1; j++) c.lineTo(pts[j][0], pts[j][1]);
    c.lineTo(b[0], b[1]); return true;
  };
  /* 单调缓动的反函数（二分）：已知进度求时间比例 */
  const inv = (fn, y) => { let a = 0, b = 1; for (let i = 0; i < 24; i++) { const m = (a + b) / 2; if (fn(m) < y) a = m; else b = m; } return (a + b) / 2; };
  /* 坐标轴刻度：取 1 / 2 / 2.5 / 5 × 10^k 的整步长 */
  const nice = (lo, hi, n = 4) => {
    const span = hi - lo || Math.abs(hi) || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    const st = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag, a = Math.floor(lo / st + 1e-9) * st, b = Math.ceil(hi / st - 1e-9) * st, ticks = [];
    for (let x = a; x <= b + st * .001; x += st) ticks.push(+x.toFixed(10));
    return { lo: a, hi: b, st, ticks, dec: st >= 1 ? 0 : Math.min(2, Math.ceil(-Math.log10(st) - 1e-9)) };
  };
  /* 停留第二拍：done 之后每 period 秒轮到下一项，k 为本轮 0→1→0 的强度 */
  const cycle = (t, done, n, period = 1.8) => { if (t < done || n < 1) return { i: -1, k: 0, s: 0 }; const u = (t - done) / period; return { i: Math.floor(u) % n, k: Math.sin(PI * (u % 1)), s: done + Math.floor(u) * period }; };
  /* 卡片网格：横屏一行；竖屏 1–2 列，末行居中 */
  const gridRects = (n, w, h, P, gap, maxH) => {
    const cols = P ? (n <= 2 ? 1 : 2) : n === 4 && w < 1300 ? 2 : n, rows = Math.ceil(n / cols);
    const cw = (w - gap * (cols - 1)) / cols, ch = Math.min((h - gap * (rows - 1)) / rows, maxH);
    const y0 = (h - (ch * rows + gap * (rows - 1))) / 2;
    return Array.from({ length: n }, (_, i) => { const r = Math.floor(i / cols), inRow = Math.min(cols, n - r * cols), x0 = (w - (cw * inRow + gap * (inRow - 1))) / 2; return { x: x0 + (i % cols) * (cw + gap), y: y0 + r * (ch + gap), w: cw, h: ch }; });
  };
  /* 一组元素取同一个字号（各自 fit 后取最小） */
  const fitAll = (els, max, min, w, h) => { if (!els.length) return max; const s = Math.min(...els.map(e => fit(e, max, min, typeof w === 'function' ? w(e) : w, h))); els.forEach(e => { e.style.fontSize = s + 'px'; }); return s; };
  /* 对比表单元格：✓ / ✗ 画成图标，其余是文字 */
  /* 中心小字：放不下就隐藏（旁边的图例同时高亮，信息不丢） */
  const softFit = (e, max, min, w) => { try { fit(e, max, min, w, null); } catch { e.style.display = 'none'; } };
  const YES = /^(✓|✔|√|yes)$/i, NO = /^(✗|✘|×|x|no)$/i;
  const cellKind = s => (YES.test(String(s ?? '').trim()) ? 'y' : NO.test(String(s ?? '').trim()) ? 'n' : 't');
  const cellHTML = s => { const k = cellKind(s); return k === 'y' ? `<span class="ic ok">${MK.icon('check', 40, 3)}</span>` : k === 'n' ? `<span class="ic no">${MK.icon('x', 40, 3)}</span>` : `<span class="tx">${rich(s ?? '—')}</span>`; };

  /* ---------- donut：占比 ----------
     ring  环形逐段生长、引线标注百分比，中心合计跟着滚动
     pie   实心扇区逐块扫出并弹出、弹簧回位；图例逐行滑入
     split 环形在侧，图例行逐条点亮（带占比条）；中心显示当前项
     停留：扇区轮流加粗 / 弹出，对应标注放大 */
  MK.control('donut', {
    variants: ['ring', 'pie', 'split'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, items = p.items, n = items.length;
      const sum = items.reduce((s, it) => s + Math.max(0, it.value), 0) || 1;
      const pct = items.map(it => Math.max(0, it.value) / sum * 100);
      const pdec = pct.some(x => x < 10 && Math.abs(x - Math.round(x)) > .05) ? 1 : 0, vdec = MK.decOf(...items.map(it => it.value));
      const pf = x => MK.fmt(x, pdec) + '<small>%</small>';
      const wrap = box(el('div', 'mk-abs mk-dn', ctx.root), area.x, area.y, area.w, area.h);
      const hd = header(wrap, p, area.w, v === 'ring');
      const top = hd ? 84 : 0, H = area.h - top;
      let cx, cy, R;
      if (v === 'ring') { R = P ? Math.min(H * .25, 165) : Math.min(H * .33, area.w * .18); cx = area.w / 2; cy = top + H * .5; }
      else if (v === 'pie') { R = P ? Math.min(H * .27, area.w * .3) : Math.min(H * .42, area.w * .21); cx = P ? area.w / 2 : R + 30; cy = P ? top + R + 24 : top + H / 2; }
      else { R = P ? Math.min(H * .2, area.w * .22) : Math.min(H * .36, area.w * .17); cx = P ? area.w / 2 : R * 1.15 + 10; cy = P ? top + R * 1.15 + 10 : top + H / 2; }
      const lw = v === 'pie' ? 0 : R * .3, Ro = R + lw / 2, Ri = R - lw / 2;
      const GAP = n > 1 ? .03 : 0;
      let acc = A0;
      const seg = pct.map(x => { const a0 = acc, a1 = acc + x / 100 * PI * 2; acc = a1; return { a0: a0 + GAP / 2, a1: Math.max(a0 + GAP / 2 + .001, a1 - GAP / 2), m: (a0 + a1) / 2 }; });
      /* 中心：ring 显示合计，split 显示当前项 */
      const ctr = v !== 'pie' ? box(el('div', 'ctr mk-abs', wrap, '<div class="cl"></div><div class="cv"></div>'), cx - Ri, cy - Ri, Ri * 2, Ri * 2) : null;
      const cl = ctr && ctr.firstChild, cv = ctr && ctr.lastChild;
      if (ctr) ctr.style.height = Ri * 2 + 'px';
      const cos = v === 'ring' ? items.map((it, i) => { const e = el('div', 'co mk-abs', wrap, `<b>${pf(pct[i])}</b><span>${esc(it.label)}</span>`); e._side = Math.cos(seg[i].m) >= -1e-6 ? 1 : -1; e.style.textAlign = e._side > 0 ? 'left' : 'right'; e.querySelector('b').style.color = cvar(i); return e; }) : [];
      const rows = v === 'ring' ? [] : items.map((it, i) => el('div', 'lr mk-abs', wrap, `<i style="background:${cvar(i)};box-shadow:0 0 12px ${cvar(i, .8)}"></i><span class="l">${esc(it.label)}</span>` +
        (v === 'split' ? `<span class="tr"><b style="background:${cvar(i)}"></b></span><span class="v">${pf(pct[i])}</span>` : `<span class="v">${pf(pct[i])}</span>${p.unit ? `<span class="raw">${MK.fmt(it.value, vdec)}${esc(p.unit)}</span>` : ''}`)));
      const pins = v === 'pie' ? items.map((it, i) => (pct[i] >= 7 ? el('div', 'pin mk-abs', wrap, pf(pct[i])) : null)) : [];
      ctx.measure(() => {
        if (hd) fit(hd, 44, 26, area.w, null);
        if (v === 'ring') {
          html(cl, esc(p.center || '')); html(cv, MK.fmt(sum, vdec) + unitH(p.unit));
          fit(cv, Math.round(R * .42), 22, Ri * 1.6, null); if (p.center) fit(cl, 28, 14, Ri * 1.5, null);
          const cw = area.w / 2 - Ro - 64;
          fitAll(cos, 30, 15, cw, null);
          /* 每侧按角度排序后推开，避免标注互相压住 */
          for (const side of [1, -1]) {
            const g = cos.map((e, i) => ({ e, i, h: e.offsetHeight, y: cy + Math.sin(seg[i].m) * (Ro + 24) })).filter(q => q.e._side === side).sort((a, b) => a.y - b.y);
            g.forEach((q, k) => { if (k) q.y = Math.max(q.y, g[k - 1].y + (g[k - 1].h + q.h) / 2 + 8); });
            const over = g.length ? g[g.length - 1].y + g[g.length - 1].h / 2 - area.h : 0;
            if (over > 0) g.forEach(q => { q.y -= over; });
            for (let k = 0; k < g.length; k++) { const lo = (k ? g[k - 1].y + (g[k - 1].h + g[k].h) / 2 + 8 : top + g[k].h / 2); g[k].y = Math.max(g[k].y, lo); }
            g.forEach(q => { const x = side > 0 ? cx + Ro + 64 : cx - Ro - 64 - cw; box(q.e, x, q.y - q.h / 2, cw); q.e._ly = q.y; q.e._ex = side > 0 ? x - 8 : x + cw + 8; });
          }
        } else if (v === 'split') {
          const longest = items.reduce((a, b) => (b.label.length > a.label.length ? b : a)).label;
          html(cl, esc(longest)); html(cv, pf(Math.max(...pct)));
          fit(cv, Math.round(R * .5), 22, Ri * 1.6, null); softFit(cl, 28, 13, Ri * 1.7);
          const x0 = P ? 0 : cx + Ro + 60, w = area.w - x0, y0 = P ? cy + Ro + 34 : top, hh = P ? area.h - y0 : H, rh = Math.min(96, hh / n);
          rows.forEach((e, i) => box(e, x0, y0 + (hh - rh * n) / 2 + rh * i + (rh - 56) / 2, w));
          fitAll(rows, 34, 16, w, null);
          rows.forEach((e, i) => { e.style.top = (y0 + (hh - rh * n) / 2 + rh * i + (rh - e.offsetHeight) / 2) + 'px'; });
        } else {
          const cols = P ? 2 : 1, x0 = P ? 0 : cx + R + 70, w = P ? area.w / 2 - 14 : area.w - x0, y0 = P ? cy + R + 46 : top, hh = P ? area.h - y0 : H;
          const nr = Math.ceil(n / cols), rh = Math.min(86, hh / nr);
          rows.forEach((e, i) => box(e, x0 + (i % cols) * (w + 28), y0 + (hh - rh * nr) / 2 + rh * Math.floor(i / cols), w));
          fitAll(rows, 34, 15, w, null);
          rows.forEach((e, i) => { e.style.top = (y0 + (hh - rh * nr) / 2 + rh * Math.floor(i / cols) + (rh - e.offsetHeight) / 2) + 'px'; });
          pins.forEach((e, i) => { if (!e) return; fit(e, Math.round(R * .17), 16, R * .55, null); const r = R * .64; e._x = cx + Math.cos(seg[i].m) * r - e.offsetWidth / 2; e._y = cy + Math.sin(seg[i].m) * r - e.offsetHeight / 2; box(e, e._x, e._y, e.offsetWidth); });
        }
      });
      const c0 = slot.cues[0] ?? slot.t0 + .2;
      const at = beats(slot, n, c0 - slot.t0 + .55, .7, 1.8, 1), done = at[n - 1] + .9;
      const offAt = (i, t) => (t < at[i] ? 0 : R * .14 * (1 - EZ.spring(pr(t, at[i] + .25, at[i] + 1.05))));
      const pan = i => (n > 1 ? (i / (n - 1) - .5) * .6 : 0);
      if (v === 'ring') { S(c0, 'swoosh', .45); at.forEach((c, i) => { S(c, 'fill', .22, 0, { d: .5 }); S(c + .45, 'pop', .4, pan(i)); }); S(done - .25, 'ding', .3); }
      else if (v === 'pie') { S(c0, 'card', .5); at.forEach((c, i) => { S(c, 'swipe', .35, pan(i)); S(c + .3, 'thud', .45); }); S(done, 'shine', .35); }
      else { S(c0, 'swoosh', .45); at.forEach((c, i) => { S(c, 'tick', .45); S(c + .05, 'fill', .25, 0, { d: .6 }); }); S(done, 'chime', .3); }
      return {
        update(t) {
          const out = leave(t, slot), hi = cycle(t, done, n);
          set(wrap, { o: 1 - out, blur: out * 10 });
          headerIn(hd, t, slot.t0);
          if (ctr) {
            const k = pr(t, c0, c0 + .5);
            if (v === 'ring') {
              const tot = items.reduce((s, it, i) => s + it.value * EZ.out5(pr(t, at[i], at[i] + .6)), 0);
              html(cv, MK.fmt(tot, vdec) + unitH(p.unit));
              tf(ctr, { o: clamp(k * 3), s: (.7 + .3 * EZ.back(k)) * (1 + .1 * (1 - EZ.out(pr(t, done - .3, done + .2))) * (t > done - .3 ? 1 : 0)) });
            } else {
              const j = hi.i >= 0 ? hi.i : at.filter(c => t >= c).length - 1, ts = hi.i >= 0 ? hi.s : at[Math.max(0, j)];
              if (j >= 0) { html(cl, esc(items[j].label)); html(cv, pf(pct[j])); cv.style.color = cvar(j); }
              const q = pr(t, ts, ts + .4);
              tf(ctr, { o: j < 0 ? 0 : clamp(q * 3), p: 600, rx: (1 - EZ.back(q)) * 70 });
            }
          }
          cos.forEach((e, i) => { const k = pr(t, at[i] + .25, at[i] + .65), h = hi.i === i ? hi.k : 0; tf(e, { o: clamp(k * 3), x: (1 - EZ.back(k)) * 34 * e._side, s: 1 + .08 * h }); e.style.transformOrigin = e._side > 0 ? '0 50%' : '100% 50%'; });
          rows.forEach((e, i) => {
            const k = pr(t, at[i] - .05, at[i] + .45), h = hi.i === i ? hi.k : 0;
            tf(e, { o: clamp(k * 3) * (hi.i >= 0 && hi.i !== i ? 1 - .45 * hi.k : 1), x: (1 - EZ.expo(k)) * 70 + h * 10 });
            e.classList.toggle('on', (hi.i < 0 && t >= at[i] && t < at[i] + .9) || hi.i === i);
            if (v === 'split') e.querySelector('.tr b').style.width = (pct[i] * EZ.out5(pr(t, at[i], at[i] + .8))).toFixed(2) + '%';
          });
          pins.forEach((e, i) => {
            if (!e) return;
            const k = pr(t, at[i] + .2, at[i] + .55), off = offAt(i, t) + R * .07 * (hi.i === i ? hi.k : 0);
            tf(e, { o: clamp(k * 3), x: Math.cos(seg[i].m) * off, y: Math.sin(seg[i].m) * off, s: .5 + .5 * EZ.back(k) });
          });
        },
        bg(c, t) {
          const a = 1 - leave(t, slot), X = area.x + cx, Y = area.y + cy, k0 = EZ.out(pr(t, c0 - .1, c0 + .7)), hi = cycle(t, done, n);
          c.save(); c.globalAlpha = a;
          if (v === 'pie') {
            c.fillStyle = 'rgba(255,255,255,.04)'; c.beginPath(); c.arc(X, Y, R * (.5 + .5 * EZ.back(k0)) + 10, 0, 7); c.fill();
            seg.forEach((s, i) => {
              const k = EZ.out5(pr(t, at[i], at[i] + .45)); if (k <= 0) return;
              const h = hi.i === i ? hi.k : 0, off = offAt(i, t) + R * .07 * h, ox = Math.cos(s.m) * off, oy = Math.sin(s.m) * off;
              c.fillStyle = `rgba(${col(i)},.92)`; c.shadowColor = `rgba(${col(i)},.7)`; c.shadowBlur = 18 + 30 * h;
              c.beginPath(); c.moveTo(X + ox, Y + oy); c.arc(X + ox, Y + oy, R * (.86 + .14 * k), s.a0, s.a0 + (s.a1 - s.a0) * k); c.closePath(); c.fill();
            });
            c.shadowBlur = 0;
            const g = c.createRadialGradient(X - R * .35, Y - R * .4, 0, X, Y, R * 1.1); g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
            c.fillStyle = g; c.beginPath(); c.arc(X, Y, R, 0, 7); c.fill();
          } else {
            c.lineWidth = lw; c.strokeStyle = 'rgba(255,255,255,.06)';
            if (k0 > 0) { c.beginPath(); c.arc(X, Y, R, A0, A0 + PI * 2 * k0); c.stroke(); }
            seg.forEach((s, i) => {
              const k = EZ.out5(pr(t, at[i], at[i] + .6)); if (k <= 0) return;
              const bump = 1 - EZ.out(pr(t, at[i] + .2, at[i] + .85)), h = hi.i === i ? hi.k : 0;
              c.globalAlpha = a * (v === 'split' && hi.i >= 0 && hi.i !== i ? 1 - .55 * hi.k : 1);
              c.lineWidth = lw * (1 + .3 * bump + .28 * h); c.strokeStyle = `rgb(${col(i)})`; c.shadowColor = `rgba(${col(i)},.8)`; c.shadowBlur = 14 + 26 * h;
              c.beginPath(); c.arc(X, Y, R, s.a0, s.a0 + (s.a1 - s.a0) * k); c.stroke();
            });
            c.globalAlpha = a; c.shadowBlur = 0;
            if (k0 > 0) T().paint.arcRing(c, X, Y, Ro + 22, A0 + t * .12, A0 + t * .12 + PI * 2 * k0, T().a, .4 * a, { step: 10 });
            if (v === 'ring') cos.forEach((e, i) => {
              const q = EZ.out(pr(t, at[i] + .15, at[i] + .5)); if (q <= 0 || e._ly == null) return;
              const m = seg[i].m, p0 = [X + Math.cos(m) * (Ro + 6), Y + Math.sin(m) * (Ro + 6)], p1 = [X + Math.cos(m) * (Ro + 30), area.y + e._ly], p2 = [area.x + e._ex, area.y + e._ly];
              c.strokeStyle = `rgba(${col(i)},.85)`; c.lineWidth = 2;
              if (polyPart(c, [p0, p1, p2], 0, q * 2)) c.stroke();
              c.fillStyle = `rgb(${col(i)})`; c.beginPath(); c.arc(p0[0], p0[1], 4, 0, 7); c.fill();
            });
          }
          c.restore();
        },
        fg(c, t) {
          if (v === 'pie') return;
          seg.forEach((s, i) => T().paint.burst(c, t, at[i] + .5, area.x + cx + Math.cos(s.a1) * R, area.y + cy + Math.sin(s.a1) * R, { n: 12, sp: 420, life: .6, seed: i, col: col(i) }));
        },
        hint: { cx: area.x + cx, cy: area.y + cy },
      };
    },
  });

  /* ---------- linechart：趋势 ----------
     line  网格展开 → 折线描出（拖尾光点）、数据点依次弹出 → 终点标注；停留时光点沿线再跑、终点脉冲
     area  面积从基线逐点弹起 → 扫描线扫过逐点读数 → 终点标注；停留时面积上扫光
     spark 大数字跟着描线滚动到最后一个值，迷你走势 + 涨跌幅；停留时终点脉冲 */
  MK.control('linechart', {
    variants: ['line', 'area', 'spark'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, pts = p.points, n = pts.length;
      const two = v !== 'spark' && pts.every(q => q.value2 != null);
      const vals = pts.map(q => q.value), vals2 = two ? pts.map(q => q.value2) : [];
      const all = [...vals, ...vals2], dec = MK.decOf(...all), unit = p.unit || '';
      const fv = x => MK.fmt(x, dec) + unitH(unit);
      const wrap = box(el('div', 'mk-abs mk-lc ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const hd = header(wrap, p, area.w);
      const top = hd ? 84 : 0;
      const names = (p.series || []).slice(0, two ? 2 : 1);
      const lgd = names.length && v !== 'spark' ? box(el('div', 'lgd mk-abs', wrap, names.map((s, i) => `<span><i style="background:${cvar(i)}"></i>${esc(s)}</span>`).join('')), 0, top, area.w) : null;
      const mn = Math.min(...all), mx = Math.max(...all), sp = mx - mn || Math.abs(mx) || 1;
      const imax = vals.indexOf(Math.max(...vals)), imin = vals.indexOf(Math.min(...vals));
      const c0 = slot.cues[0] ?? slot.t0 + .2, c1 = slot.cues[1] ?? c0 + .6, LD = clamp(.5 + n * .11, .9, 1.9);
      const SD = .7 + n * .05;
      const c2 = slot.cues[2] ?? Math.min(slot.t1 - 1.1, c1 + LD + (v === 'area' ? .1 : .25));
      const reach = vals.map((_, i) => c1 + LD * inv(EZ.inout, i / (n - 1)));
      /* G：绘图区（wrap 内坐标）；X/Y 在 measure 后可用 */
      const G = { x: 0, y: 0, w: area.w, h: 100 };
      let X = i => G.x + G.w * i / (n - 1), Yv = () => 0, nt = null;
      let yls = [], xls = [], pvs = [], co = null, big = null, sk = null, dl = null, mm = [];
      const delta = vals[0] !== 0 ? (vals[n - 1] - vals[0]) / Math.abs(vals[0]) * 100 : null, up = vals[n - 1] >= vals[0];
      if (v !== 'spark') {
        let lo = v === 'line' ? mn - sp * .25 : Math.min(0, mn); const hi = mx + sp * .12;
        if (v === 'line' && mn >= 0 && lo < 0) lo = 0;
        nt = nice(lo, hi, 4);
        yls = nt.ticks.map(k => el('div', 'yl mk-abs', wrap, MK.fmt(k, nt.dec)));
        xls = pts.map(q => el('div', 'xl mk-abs', wrap, esc(q.label)));
        pvs = vals.map(x => el('div', 'pv mk-abs', wrap, fv(x)));
        co = el('div', 'co mk-abs', wrap, `<b>${fv(vals[n - 1])}</b>${p.note ? `<span>${rich(p.note)}</span>` : ''}`);
      } else {
        sk = el('div', 'sk mk-abs', wrap, esc(names[0] || ''));
        big = el('div', 'big mk-abs', wrap, fv(vals[n - 1]));
        dl = el('div', 'dl mk-abs ' + (up ? 'up' : 'dn'), wrap, `${MK.icon(up ? 'trend' : 'down', 40, 2.5)}<span>${delta != null ? sign(delta) + MK.fmt(Math.abs(delta), Math.abs(delta) < 10 ? 1 : 0) + '%' : sign(vals[n - 1] - vals[0]) + fv(Math.abs(vals[n - 1] - vals[0]))}</span>${p.note ? `<em>${rich(p.note)}</em>` : ''}`);
        mm = [imax, imin].filter((x, k, a) => a.indexOf(x) === k && x !== n - 1).map(i => el('div', 'mm mk-abs' + (i === imin && imin !== imax ? ' lo' : ''), wrap, `${i === imax ? '▲' : '▼'} ${fv(vals[i])}`));
        xls = [0, n - 1].map(i => el('div', 'xl mk-abs', wrap, esc(pts[i].label)));
      }
      ctx.measure(() => {
        if (hd) fit(hd, 44, 26, area.w, null);
        if (lgd) fit(lgd, 26, 16, area.w, null);
        if (v !== 'spark') {
          G.y = top + (lgd ? 64 : 20); G.h = area.h - G.y - 50;
          const ylw = Math.max(...yls.map(e => e.offsetWidth));
          G.x = ylw + 18; G.w = area.w - G.x - 34;
          Yv = val => G.y + G.h * (1 - (val - nt.lo) / (nt.hi - nt.lo));
          yls.forEach((e, k) => box(e, 0, Yv(nt.ticks[k]) - e.offsetHeight / 2, ylw));
          const ws = xls.map(e => e.offsetWidth), cell = G.w / (n - 1);
          let step = 1; while (Math.max(...ws) > cell * step * .72 && step < n - 1) step++;
          xls.forEach((e, i) => { e._show = (n - 1 - i) % step === 0; box(e, clamp(X(i) - ws[i] / 2, 0, area.w - ws[i]), G.y + G.h + 14, ws[i]); });
          /* 点上读数：line 变体放得下才每点都标，否则只标最高点；area 变体随扫描线出现 */
          const pw = Math.max(...pvs.map(e => e.offsetWidth)), every = v === 'area' || (step === 1 && pw < cell * .92);
          pvs.forEach((e, i) => { e._show = every || i === imax; const w = e.offsetWidth; box(e, clamp(X(i) - w / 2, 0, area.w - w), Yv(vals[i]) - e.offsetHeight - 18, w); });
          fit(co, 32, 18, Math.min(area.w * .6, 520), null); co.style.width = 'max-content';
          const cw = co.offsetWidth, ch = co.offsetHeight, lx = X(n - 1), ly = Yv(vals[n - 1]);
          const rising = vals[n - 1] >= vals[n - 2], above = rising ? ly - G.y > ch + 30 || ly + 30 + ch > area.h : !(G.y + G.h - ly > ch + 30);
          co._x = clamp(lx - cw + 30, 0, area.w - cw); co._y = above ? ly - ch - 30 : ly + 30; box(co, co._x, co._y, cw);
          co.style.transformOrigin = `${(lx - co._x).toFixed(0)}px ${above ? '100%' : '0'}`;
          pvs[n - 1]._show = false;
        } else {
          const H = area.h - top;
          if (P) {
            box(sk, 0, top + 6, area.w); sk.style.textAlign = 'center'; if (names[0]) fit(sk, 30, 16, area.w, null);
            box(big, 0, top + (names[0] ? 50 : 6), area.w); big.style.textAlign = 'center'; fit(big, 150, 44, area.w * .94, null);
            box(dl, 0, 0, area.w); dl.style.justifyContent = 'center'; fit(dl, 36, 18, area.w, null);
            dl.style.top = (big.offsetTop + big.offsetHeight + 6) + 'px';
            const y0 = dl.offsetTop + dl.offsetHeight + 70; Object.assign(G, { x: 30, y: y0, w: area.w - 60, h: Math.max(120, area.h - y0 - 70) });
          } else {
            const lw2 = area.w * .42;
            box(sk, 0, 0, lw2); if (names[0]) fit(sk, 30, 16, lw2, null);
            box(big, 0, 0, lw2); fit(big, 150, 44, lw2, null);
            box(dl, 0, 0, lw2); fit(dl, 36, 18, lw2, null);
            const hh = sk.offsetHeight * (names[0] ? 1 : 0) + big.offsetHeight + dl.offsetHeight + 16, y = top + (H - hh) / 2;
            sk.style.top = y + 'px'; big.style.top = (y + (names[0] ? sk.offsetHeight : 0)) + 'px'; dl.style.top = (big.offsetTop + big.offsetHeight + 16) + 'px';
            Object.assign(G, { x: area.w * .47, y: top + H * .2, w: area.w * .53 - 30, h: H * .56 });
          }
          const slo = mn - sp * .1, shi = mx + sp * .1;
          Yv = val => G.y + G.h * (1 - (val - slo) / (shi - slo));
          mm.forEach(e => { const i = e.classList.contains('lo') ? imin : imax, w = e.offsetWidth; box(e, clamp(X(i) - w / 2, 0, area.w - w), e.classList.contains('lo') ? Yv(vals[i]) + 22 : Yv(vals[i]) - e.offsetHeight - 22, w); });
          xls.forEach((e, k) => { const w = e.offsetWidth; box(e, k ? G.x + G.w - w : G.x, G.y + G.h + 50, w); e._show = true; });
        }
      });
      const ptsOf = arr => arr.map((x, i) => [area.x + X(i), area.y + Yv(x)]);
      if (v === 'line') { S(c0, 'swoosh', .4); S(c1, 'fill', .28, 0, { d: LD }); reach.forEach((r, i) => S(r, 'blip', .16, (i / (n - 1) - .5) * .8, { n: i })); S(c2, 'ding', .35); S(c2 + .05, 'pop', .35); }
      else if (v === 'area') { S(c0, 'swoosh', .4); S(c1, 'swell', .35, 0, { d: 1 }); S(c1 + .5, 'bubble', .3); S(c2, 'swipe', .35); S(c2 + SD, 'ding', .35); }
      else { S(c0, 'card', .4); S(c1, 'counter', .35, 0, { d: LD }); S(c1 + LD, 'thud', .45); S(c2, up ? 'coin' : 'drop', .45); flash(c2, .15); }
      const done = (v === 'area' ? c2 + SD : c2) + .6;
      /* 面积变体：每个点从基线弹起到位 */
      const riseY = (arr, i, t) => { const b = Yv(clamp(0, nt.lo, nt.hi)), k = EZ.spring(pr(t, c1 + i * .05, c1 + i * .05 + .85)); return area.y + lerp(b, Yv(arr[i]), k); };
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          headerIn(hd, t, slot.t0);
          if (lgd) tf(lgd, { o: pr(t, c0, c0 + .4), x: (1 - EZ.expo(pr(t, c0, c0 + .6))) * 30 });
          if (v !== 'spark') {
            yls.forEach((e, k) => { const q = pr(t, c0 + k * .05, c0 + k * .05 + .4); tf(e, { o: q, x: (1 - EZ.expo(q)) * -16 }); });
            xls.forEach((e, i) => { const q = pr(t, c0 + .1 + i * .03, c0 + .5 + i * .03); tf(e, { o: e._show ? q : 0, y: (1 - EZ.expo(q)) * 14 }); });
            const sx = v === 'area' ? X(0) + (X(n - 1) - X(0)) * EZ.inout(pr(t, c2, c2 + SD)) : 0;
            pvs.forEach((e, i) => {
              if (!e._show) { e.style.visibility = 'hidden'; return; }
              if (v === 'line') { const q = pr(t, reach[i] + .05, reach[i] + .4); tf(e, { o: clamp(q * 3), y: (1 - EZ.back(q)) * 16, s: .7 + .3 * EZ.back(q) }); }
              else { const d = Math.abs(sx - X(i)) / (G.w / (n - 1)), on = t >= c2 && t <= c2 + SD + .3 ? clamp(1.4 - d * 1.6) : 0; tf(e, { o: on, y: (1 - on) * 10 }); }
            });
            const cq = pr(t, v === 'area' ? c2 + SD - .05 : c2, (v === 'area' ? c2 + SD : c2) + .45);
            tf(co, { o: clamp(cq * 3), s: .4 + .6 * EZ.back(cq) });
          } else {
            const kl = EZ.inout(pr(t, c1, c1 + LD)), f = kl * (n - 1), i = Math.min(n - 2, Math.floor(f));
            if (sk) tf(sk, { o: pr(t, c0, c0 + .4), y: (1 - EZ.expo(pr(t, c0, c0 + .5))) * 16 });
            html(big, fv(t < c1 ? vals[0] : lerp(vals[i], vals[i + 1], f - i)));
            const land = t > c1 + LD ? 1 - EZ.out(pr(t, c1 + LD, c1 + LD + .4)) : 0;
            tf(big, { o: pr(t, c0, c0 + .3), y: (1 - EZ.expo(pr(t, c0, c0 + .6))) * 30, s: 1 + .08 * land });
            big.style.textShadow = t > done ? `0 0 ${(30 + 14 * Math.sin((t - done) * 2.4)).toFixed(1)}px rgba(${up ? T().g : T().r},.45)` : '';
            const q = pr(t, c2, c2 + .45);
            tf(dl, { o: clamp(q * 3), x: (1 - EZ.back(q)) * -30 });
            const ic = dl.querySelector('svg'); if (ic) ic.style.transform = `translateY(${(t > done ? Math.sin((t - done) * 4) * 3 * (up ? -1 : 1) : 0).toFixed(2)}px)`;
            mm.forEach((e, k) => { const r = pr(t, c2 + .15 + k * .12, c2 + .5 + k * .12); tf(e, { o: clamp(r * 3), s: .6 + .4 * EZ.back(r) }); });
            xls.forEach(e => tf(e, { o: pr(t, c1, c1 + .5) }));
          }
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          c.save(); c.globalAlpha = a; c.lineJoin = 'round'; c.lineCap = 'round';
          if (v !== 'spark') {
            nt.ticks.forEach((k, j) => {
              const q = EZ.out(pr(t, c0 + j * .05, c0 + j * .05 + .6)); if (q <= 0) return;
              const y = area.y + Yv(k); c.strokeStyle = `rgba(255,255,255,${j === 0 ? .16 : .07})`; c.lineWidth = 1;
              c.beginPath(); c.moveTo(area.x + G.x, y); c.lineTo(area.x + G.x + G.w * q, y); c.stroke();
            });
          } else {
            const q = EZ.out(pr(t, c0, c0 + .7)), yb = area.y + G.y + G.h + 24;
            c.setLineDash([4, 8]); c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1.5;
            c.beginPath(); c.moveTo(area.x + G.x, yb); c.lineTo(area.x + G.x + G.w * q, yb); c.stroke(); c.setLineDash([]);
          }
          const series = two ? [vals, vals2] : [vals];
          series.forEach((arr, s) => {
            const C = col(s), lag = s * .12;
            const kl = v === 'area' ? 1 : EZ.inout(pr(t, c1 + lag, c1 + lag + LD));
            const P2 = v === 'area' ? arr.map((_, i) => [area.x + X(i), riseY(arr, i, t)]) : ptsOf(arr);
            if (v === 'area' && t < c1) return;
            const f = kl * (n - 1);
            if (v !== 'line') {
              /* 面积：线下渐变 */
              const base = area.y + (v === 'area' ? Yv(clamp(0, nt.lo, nt.hi)) : G.y + G.h + 24);
              if (polyPart(c, P2, 0, f)) {
                const e = polyAt(P2, f); c.lineTo(e[0], base); c.lineTo(P2[0][0], base); c.closePath();
                const g = c.createLinearGradient(0, area.y + G.y, 0, base); g.addColorStop(0, `rgba(${C},${s ? .22 : .36})`); g.addColorStop(1, `rgba(${C},0)`);
                c.fillStyle = g; c.fill();
                if (v === 'area' && t > done) {
                  /* 第二拍：一道光带在面积里横扫 */
                  c.save(); c.clip(); const bx = area.x + G.x - 160 + (((t - done) / 3.2) % 1) * (G.w + 320), gb = c.createLinearGradient(bx - 120, 0, bx + 120, 0);
                  gb.addColorStop(0, 'rgba(255,255,255,0)'); gb.addColorStop(.5, `rgba(${T().aLite},.22)`); gb.addColorStop(1, 'rgba(255,255,255,0)');
                  c.fillStyle = gb; c.fillRect(bx - 120, area.y + G.y - 20, 240, G.h + 60); c.restore();
                }
              }
            }
            c.strokeStyle = `rgba(${C},.18)`; c.lineWidth = 16; if (polyPart(c, P2, 0, f)) c.stroke();
            c.strokeStyle = `rgb(${C})`; c.lineWidth = v === 'spark' ? 6 : 4.5; c.shadowColor = `rgba(${C},.9)`; c.shadowBlur = 14; if (polyPart(c, P2, 0, f)) c.stroke(); c.shadowBlur = 0;
            if (v !== 'area' && kl > 0 && kl < 1) MK.fx.comet(c, P2, kl, s ? T().w : T().aLite, a);
            /* 数据点 */
            P2.forEach((q, i) => {
              const r0 = v === 'area' ? c1 + i * .05 + .6 : reach[i] + lag;
              const k = EZ.back(pr(t, r0, r0 + .35)); if (k <= 0 || (v === 'spark' && i !== n - 1 && i !== imax && i !== imin)) return;
              const big2 = i === n - 1 ? 1.5 : 1;
              c.fillStyle = '#0B0D12'; c.strokeStyle = `rgb(${C})`; c.lineWidth = 3;
              c.beginPath(); c.arc(q[0], q[1], (s ? 5 : 7) * big2 * k, 0, 7); c.fill(); c.stroke();
            });
            if (s === 0) {
              const L = P2[n - 1], pulse = t > done ? done + Math.floor((t - done) / 1.6) * 1.6 : (v === 'area' ? c2 + SD : v === 'spark' ? c1 + LD : c2);
              MK.fx.ripple(c, t, pulse, L[0], L[1], { r: 70, rings: 2, col: v === 'spark' ? (up ? T().g : T().r) : T().a });
              MK.fx.glow(c, L[0], L[1], 70, C, pr(t, reach[n - 1], reach[n - 1] + .3));
              if (v === 'line' && t > done) { const q = ((t - done) / 3.2) % 1; if (q < .8) MK.fx.comet(c, P2, q / .8, T().aLite, .6 * a); }
              if (co && t > c2) { const k = pr(t, v === 'area' ? c2 + SD : c2, (v === 'area' ? c2 + SD : c2) + .3); c.strokeStyle = `rgba(${T().a},.6)`; c.lineWidth = 1.5; c.setLineDash([3, 5]); c.beginPath(); c.moveTo(L[0], L[1]); c.lineTo(L[0], lerp(L[1], area.y + co._y + (co._y < Yv(vals[n - 1]) ? co.offsetHeight : 0), k)); c.stroke(); c.setLineDash([]); }
            }
          });
          if (v === 'area' && t >= c2 && t <= c2 + SD + .3) {
            /* 扫描线 */
            const q = EZ.inout(pr(t, c2, c2 + SD)), x = area.x + X(0) + (X(n - 1) - X(0)) * q, al = 1 - pr(t, c2 + SD, c2 + SD + .3);
            const g = c.createLinearGradient(0, area.y + G.y, 0, area.y + G.y + G.h); g.addColorStop(0, `rgba(${T().aLite},0)`); g.addColorStop(.5, `rgba(${T().aLite},${.9 * al})`); g.addColorStop(1, `rgba(${T().aLite},0)`);
            c.fillStyle = g; c.fillRect(x - 1.5, area.y + G.y, 3, G.h);
            const f = q * (n - 1), y = polyAt(vals.map((_, i) => [0, riseY(vals, i, t)]), f)[1];
            T().paint.ball(c, x, y, 9, T().aLite, al, { halo: 3 });
          }
          c.restore();
        },
        hint: { cx: area.x + area.w * .5, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- counter：KPI 数字卡 ----------
     cards    玻璃卡三维翻入，数字滚动计数，落定后涨跌标弹出；停留时卡片轮流扫光
     odometer 遮罩升起，每位数字是一条滚轮，从左到右依次带回弹停住；停留时轮流发光
     ticker   行情板：一行一行扫描写入，数字先乱码再逐位锁定；停留时高亮条逐行移动 */
  MK.control('counter', {
    variants: ['cards', 'odometer', 'ticker'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, items = p.items, n = items.length;
      const wrap = box(el('div', 'mk-abs mk-ct ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const hd = header(wrap, p, area.w, v !== 'ticker');
      const top = hd ? 84 : 0, H = area.h - top;
      const at = beats(slot, n, .35, .6, 1.9);
      const decs = items.map(it => MK.decOf(it.value));
      const dlH = it => (it.delta == null ? '' : `<span class="dl ${it.delta >= 0 ? 'up' : 'dn'}">${MK.icon(it.delta >= 0 ? 'trend' : 'down', 40, 2.5)}<span>${sign(it.delta)}${MK.fmt(Math.abs(it.delta), MK.decOf(it.delta))}%</span></span>`);
      const numH = (it, x, dec) => `${esc(it.prefix || '')}${MK.fmt(x, dec)}${unitH(it.unit)}`;
      /* 里程表：每位数字一条 0–9 ×3 的滚轮 */
      const odoH = (it, dec) => `${it.prefix ? `<span class="sp">${esc(it.prefix)}</span>` : ''}${[...MK.fmt(it.value, dec)].map(ch => (/\d/.test(ch) ? `<span class="rl"><span class="rr">${'0123456789'.repeat(3).split('').map(d => `<i>${d}</i>`).join('')}</span></span>` : `<span class="sp">${esc(ch)}</span>`)).join('')}${unitH(it.unit)}`;
      let cells;
      if (v === 'ticker') {
        const rh = Math.min(132, H / n), y0 = top + (H - rh * n) / 2;
        cells = items.map((it, i) => {
          const e = box(el('div', 'rw mk-abs', wrap, `<i class="bar"></i><span class="lb">${esc(it.label)}</span><span class="nv"></span>${dlH(it)}<b class="scan"></b>`), 0, y0 + rh * i + 7, area.w, rh - 14);
          e.style.height = (rh - 14) + 'px';
          return { e, nv: e.querySelector('.nv'), dl: e.querySelector('.dl'), scan: e.querySelector('.scan'), it, rh };
        });
        el('div', 'hl mk-abs', wrap);
      } else {
        const rs = gridRects(n, area.w, H, P, 28, P ? 330 : n === 4 && area.w < 1300 ? 280 : 420);
        cells = items.map((it, i) => {
          const r = rs[i], e = box(el('div', 'cd mk-glass', wrap, `<div class="lb">${esc(it.label)}</div><div class="nv"></div>${dlH(it)}`), r.x, top + r.y, r.w, r.h);
          return { e, nv: e.querySelector('.nv'), lb: e.querySelector('.lb'), dl: e.querySelector('.dl'), it, r };
        });
      }
      const hl = wrap.querySelector('.hl');
      ctx.measure(() => {
        if (hd) fit(hd, 44, 26, area.w, null);
        if (v === 'ticker') {
          cells.forEach(({ nv, it }, i) => html(nv, numH(it, it.value, decs[i])));
          fitAll(cells.map(c => c.e), Math.min(44, Math.floor(cells[0].rh * .34)), 14, area.w, null);
          cells.forEach(c => { c.e.style.width = area.w + 'px'; c.e.style.left = '0'; });
          if (hl) Object.assign(hl.style, { left: '-14px', width: (area.w + 28) + 'px', height: (cells[0].rh - 4) + 'px' });
        } else {
          cells.forEach(({ nv, lb, dl, it, r }, i) => {
            if (v === 'odometer') html(nv, odoH(it, decs[i])); else html(nv, numH(it, it.value, decs[i]));
            fit(nv, Math.min(P ? 130 : 120, Math.floor(r.h * .36)), 24, r.w - 48, null);
            fit(lb, 32, 15, r.w - 48, null);
            if (dl) fit(dl, 28, 14, r.w - 48, null);
          });
          const ls = Math.min(...cells.map(c => parseFloat(c.lb.style.fontSize))); cells.forEach(c => { c.lb.style.fontSize = ls + 'px'; });
          const ns = Math.min(...cells.map(c => parseFloat(c.nv.style.fontSize))); cells.forEach(c => { c.nv.style.fontSize = ns + 'px'; });
        }
      });
      /* 计数 / 锁定时间 */
      const CNT = 1.2;
      const digitsOf = i => [...MK.fmt(items[i].value, decs[i])].filter(ch => /\d/.test(ch)).length;
      const landAt = (i, j) => at[i] + .45 + j * .11;
      const settle = items.map((_, i) => (v === 'odometer' ? landAt(i, digitsOf(i) - 1) + .15 : v === 'ticker' ? at[i] + .3 + [...MK.fmt(items[i].value, decs[i])].length * .05 : at[i] + .1 + CNT));
      const done = Math.max(...settle) + .7;
      at.forEach((c, i) => {
        const pn = n > 1 ? (i / (n - 1) - .5) * .6 : 0;
        if (v === 'cards') { S(c - .05, 'card', .45, pn); S(c + .1, 'counter', .28, pn, { d: CNT }); S(settle[i], 'pop', .4, pn); }
        else if (v === 'odometer') { S(c, 'counter', .3, pn, { d: settle[i] - c - .1 }); for (let j = 0; j < Math.min(6, digitsOf(i)); j++) S(landAt(i, j), 'tick', .3, pn); S(settle[i], 'thud', .4, pn); }
        else { S(c, 'swipe', .35, pn); S(c + .15, 'type', .22, pn, { d: settle[i] - c - .15 }); S(settle[i], 'key', .5, pn); }
        if (items[i].delta != null) S(settle[i] + .15, items[i].delta >= 0 ? 'coin' : 'blip', .25, pn, { n: 2 });
      });
      return {
        update(t) {
          const out = leave(t, slot), hi = cycle(t, done, n, v === 'ticker' ? 1.4 : 1.5);
          set(wrap, { o: 1 - out, blur: out * 10 });
          headerIn(hd, t, slot.t0);
          cells.forEach(({ e, nv, dl, scan, it }, i) => {
            const c = at[i], dec = decs[i];
            if (v === 'cards') {
              const k = pr(t, c - .1, c + .6);
              tf(e, { p: 1400, o: clamp(k * 4), ry: (1 - EZ.back(k)) * -75, y: (1 - EZ.out(k)) * 50 });
              const q = EZ.out(pr(t, c + .1, c + .1 + CNT));
              html(nv, numH(it, it.value * q, dec));
              tf(nv, { s: 1 + (t > settle[i] ? .1 * (1 - EZ.out(pr(t, settle[i], settle[i] + .4))) : 0) });
              const sh = hi.i === i ? lerp(130, -30, EZ.inout(clamp((t - hi.s) / 1.5))) : 130;
              e.style.setProperty('--sh', sh.toFixed(1) + '%');
            } else if (v === 'odometer') {
              const k = pr(t, c - .15, c + .45);
              tf(e, { o: clamp(k * 3), y: (1 - EZ.expo(k)) * 40 });
              e.style.clipPath = `inset(${((1 - EZ.out5(k)) * 100).toFixed(2)}% 0 0 0 round 20px)`;
              const ds = [...MK.fmt(it.value, dec)].filter(ch => /\d/.test(ch));
              nv.querySelectorAll('.rr').forEach((r, j) => {
                const u = pr(t, c, landAt(i, j)), w = pr(t, landAt(i, j), landAt(i, j) + .3), tgt = 20 + +ds[j];
                const pos = tgt * EZ.out5(u) + .3 * Math.sin(PI * w) * (1 - w);
                r.style.transform = `translateY(${(-pos * 1.1).toFixed(4)}em)`;
                r.style.filter = u > 0 && u < 1 ? `blur(${((1 - u) * 3).toFixed(2)}px)` : '';
              });
              e.classList.toggle('on', hi.i === i);
            } else {
              const k = pr(t, c, c + .5), E = EZ.inout(k);
              e.style.clipPath = `inset(0 ${((1 - E) * 100).toFixed(2)}% 0 0)`;
              tf(e, { o: k > 0 ? 1 : 0 });
              tf(scan, { o: k > 0 && k < 1 ? 1 : 0 }); scan.style.left = (E * 100).toFixed(2) + '%';
              const s = [...MK.fmt(it.value, dec)], fi = Math.floor(t * 30);
              html(nv, esc(it.prefix || '') + s.map((ch, j) => (/\d/.test(ch) && t < at[i] + .3 + j * .05 ? String(Math.floor(rnd(fi, j + i * 17) * 10)) : esc(ch))).join('') + unitH(it.unit));
              nv.classList.toggle('lock', t >= settle[i] && t < settle[i] + .5);
            }
            if (dl) { const q = pr(t, settle[i] + .1, settle[i] + .5); tf(dl, { o: clamp(q * 3), s: .5 + .5 * EZ.back(q), x: v === 'ticker' ? (1 - EZ.expo(q)) * 30 : 0 }); const ic = dl.querySelector('svg'); if (ic) ic.style.transform = `translateY(${(t > done ? Math.sin((t - done) * 4 + i) * 3 * (it.delta >= 0 ? -1 : 1) : 0).toFixed(2)}px)`; }
          });
          if (hl) {
            const f = hi.i < 0 ? -1 : hi.i + EZ.inout(clamp((t - hi.s - 1.0) / .4)) * (hi.i === n - 1 ? 0 : 1);
            const y = f < 0 ? 0 : parseFloat(cells[Math.min(n - 1, Math.floor(f))].e.style.top) + (f % 1) * cells[0].rh - 5;
            tf(hl, { o: f < 0 ? 0 : clamp((t - done) * 3) * (hi.i === n - 1 ? 1 - clamp((t - hi.s - 1.1) / .3) : 1), y });
          }
        },
        fg(c, t) {
          if (v === 'ticker') return;
          cells.forEach(({ r }, i) => T().paint.burst(c, t, settle[i], area.x + r.x + r.w / 2, area.y + top + r.y + r.h / 2, { n: 18, sp: 520, life: .6, seed: i }));
        },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- progress：进度 / 完成度 ----------
     bars    横条带斜纹灌入（微过冲），百分比骑在条头；100% 打勾爆点；停留时斜纹流动 + 光点沿条跑
     rings   同心环逐圈画满，环头光球；中心显示当前项，停留时轮流切换 + 外圈刻度旋转
     battery 分段电量格逐格点亮（颜色随电量），停留时充电光在格子里流动 */
  MK.control('progress', {
    variants: ['bars', 'rings', 'battery'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, items = p.items, n = items.length;
      const pc = items.map(it => clamp(it.percent, 0, 100)), dec = MK.decOf(...pc);
      const pf = x => MK.fmt(x, dec) + '<small>%</small>';
      const wrap = box(el('div', 'mk-abs mk-pg ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const hd = header(wrap, p, area.w);
      const top = hd ? 84 : 0, H = area.h - top;
      const at = beats(slot, n, .35, .75, 1.9);
      const DUR = v === 'battery' ? 0 : 1.1;
      const cellsOf = i => Math.ceil(pc[i] / 10 - 1e-9);
      const cellT = (i, j) => at[i] + .15 + j * .075;
      const settle = items.map((_, i) => (v === 'battery' ? cellT(i, Math.max(0, cellsOf(i) - 1)) + .15 : at[i] + DUR));
      const done = Math.max(...settle) + .6;
      const lvl = x => (x < 30 ? 'bad' : x < 60 ? 'w' : 'ok');
      let rows = [], cx = 0, cy = 0, R0 = 0, RW = 0, ctr = null;
      const GAPK = n > 2 ? 1.35 : 1.5;
      if (v === 'rings') {
        R0 = P ? Math.min(H * .36, area.w * .3, (H - 64 - n * 60) / 2) : Math.min(H * .44, area.w * .22); RW = Math.min(R0 * (n > 2 ? .11 : .13), 40);
        cx = P ? area.w / 2 : R0 + 30; cy = P ? top + R0 + 20 : top + H / 2;
        ctr = box(el('div', 'ctr mk-abs', wrap, '<div class="cv"></div><div class="cl"></div>'), 0, 0, 10);
        rows = items.map((it, i) => el('div', 'lr mk-abs', wrap, `<i style="background:${cvar(i)};box-shadow:0 0 12px ${cvar(i, .8)}"></i><span class="l">${esc(it.label)}</span><span class="v"></span>`));
      } else {
        const big = n === 1, rh = Math.min(big ? 230 : v === 'battery' ? 170 : 150, H / n);
        rows = items.map((it, i) => {
          const e = box(el('div', 'pr mk-abs' + (big ? ' big' : ''), wrap, v === 'bars'
            ? `<div class="hd"><span class="l">${esc(it.label)}</span><span class="v"></span></div><div class="tk"><div class="fl"><b></b></div></div>`
            : `<div class="hd"><span class="l">${esc(it.label)}</span></div><div class="bt ${lvl(pc[i])}"><div class="cells">${'<i><b></b></i>'.repeat(10)}</div><span class="nub"></span><span class="v"></span><span class="bo">${MK.icon('bolt', 40, 2)}</span></div>`), 0, top + (H - rh * n) / 2 + rh * i, area.w);
          e._rh = rh; return e;
        });
      }
      ctx.measure(() => {
        if (hd) fit(hd, 44, 26, area.w, null);
        if (v === 'rings') {
          const ri = R0 - (n - 1) * RW * GAPK - RW / 2 - 8;
          html(ctr.firstChild, pf(100)); html(ctr.lastChild, esc(items.reduce((a, b) => (b.label.length > a.label.length ? b : a)).label));
          box(ctr, cx - ri, cy - ri, ri * 2); ctr.style.height = ri * 2 + 'px';
          fit(ctr.firstChild, Math.round(ri * .55), 18, ri * 1.7, null); softFit(ctr.lastChild, 26, 12, ri * 1.75);
          const x0 = P ? 0 : cx + R0 + 70, w = area.w - x0, y0 = P ? cy + R0 + 44 : top, hh = P ? area.h - y0 : H, rh = Math.min(90, hh / n);
          rows.forEach((e, i) => { html(e.lastChild, pf(100)); box(e, x0, y0 + (hh - rh * n) / 2 + rh * i, w); });
          fitAll(rows, 36, 16, w, null);
          rows.forEach((e, i) => { e.style.top = (y0 + (hh - rh * n) / 2 + rh * i + (rh - e.offsetHeight) / 2) + 'px'; });
        } else {
          const hs = rows.map(e => e.querySelector('.hd'));
          if (v === 'bars') hs.forEach(h => html(h.lastChild, pf(100)));
          const big = n === 1;
          fitAll(hs, big ? 52 : 38, 16, v === 'battery' ? area.w * .9 : area.w, null);
          if (v === 'battery') {
            rows.forEach(e => { const bt = e.querySelector('.bt'); bt.style.height = Math.min(e._rh - parseFloat(e.querySelector('.hd').style.fontSize) * 1.4 - 24, big ? 130 : 84) + 'px'; html(bt.querySelector('.v'), pf(100)); });
            fitAll(rows.map(e => e.querySelector('.v')), 44, 16, area.w * .16, null);
          }
          rows.forEach(e => { e.style.top = (parseFloat(e.style.top) + (e._rh - e.offsetHeight) / 2) + 'px'; });
        }
      });
      at.forEach((c, i) => {
        if (v === 'battery') { S(c - .05, 'swoosh', .3); for (let j = 0; j < cellsOf(i); j++) S(cellT(i, j), 'blip', .16, 0, { n: j }); S(settle[i], pc[i] >= 100 ? 'chime' : 'pop', .4); }
        else { S(c - .05, v === 'rings' ? 'swoosh' : 'swipe', .35); S(c, 'fill', .3, 0, { d: DUR }); S(settle[i], pc[i] >= 100 ? 'check' : 'pop', .4, 0, { n: i }); }
      });
      if (v === 'rings') S(done - .3, 'ding', .3);
      return {
        update(t) {
          const out = leave(t, slot), hi = cycle(t, done, n, 1.8);
          set(wrap, { o: 1 - out, blur: out * 10 });
          headerIn(hd, t, slot.t0);
          if (v === 'rings') {
            const j = hi.i >= 0 ? hi.i : at.filter(c => t >= c).length - 1, ts = hi.i >= 0 ? hi.s : at[Math.max(0, j)];
            if (j >= 0) { const k = EZ.out5(pr(t, at[j], at[j] + DUR)); html(ctr.firstChild, pf(pc[j] * (hi.i >= 0 ? 1 : k))); html(ctr.lastChild, esc(items[j].label)); ctr.firstChild.style.color = cvar(j); }
            const q = pr(t, ts, ts + .35);
            tf(ctr, { o: j < 0 ? 0 : clamp(q * 3), s: .8 + .2 * EZ.back(q) });
            rows.forEach((e, i) => {
              const k = pr(t, at[i] - .1, at[i] + .4);
              tf(e, { o: clamp(k * 3) * (hi.i >= 0 && hi.i !== i ? 1 - .4 * hi.k : 1), x: (1 - EZ.expo(k)) * 60 });
              html(e.lastChild, pf(pc[i] * EZ.out5(pr(t, at[i], at[i] + DUR))));
              e.classList.toggle('on', hi.i === i);
            });
            return;
          }
          rows.forEach((e, i) => {
            const k = pr(t, at[i] - .2, at[i] + .3);
            tf(e, { o: clamp(k * 3), x: (1 - EZ.expo(k)) * -60 });
            if (v === 'bars') {
              const q = pr(t, at[i], at[i] + DUR), w = pc[i] * (EZ.out5(q) + .035 * Math.sin(PI * pr(t, at[i] + .55, at[i] + DUR)));
              const fl = e.querySelector('.fl'); fl.style.width = clamp(w, 0, 100).toFixed(2) + '%';
              fl.style.backgroundPosition = `${(-t * 60).toFixed(1)}px 0, 0 0`;
              const sh = t > done ? ((t - done + i * .5) / 2.2) % 1 : -1; fl.style.setProperty('--sh', (sh < 0 ? -20 : lerp(-20, 120, sh)).toFixed(1) + '%');
              html(e.querySelector('.hd .v'), (pc[i] >= 100 && t >= settle[i] ? `<span class="ok">${MK.icon('check', 40, 3)}</span>` : '') + pf(pc[i] * EZ.out5(q)));
              const ok = e.querySelector('.ok'); if (ok) tf(ok, { s: EZ.back(pr(t, settle[i], settle[i] + .35)) });
            } else {
              const bt = e.querySelector('.bt'), cs = bt.querySelectorAll('.cells i b');
              cs.forEach((b, j) => {
                const f = clamp(pc[i] / 10 - j) * EZ.out(pr(t, cellT(i, j), cellT(i, j) + .12));
                const wave = t > done ? Math.max(0, Math.sin((t - done) * 3 - j * .55)) : 0;
                b.style.width = (f * 100).toFixed(1) + '%'; b.style.filter = wave > 0 ? `brightness(${(1 + .6 * wave).toFixed(2)})` : '';
              });
              const lit = cs.length ? Math.min(cellsOf(i), Math.floor((t - at[i] - .15) / .075) + 1) : 0;
              html(bt.querySelector('.v'), pf(Math.min(pc[i], Math.max(0, lit) * 10)));
              const bo = bt.querySelector('.bo'); tf(bo, { o: t >= at[i] ? (t < settle[i] ? .4 + .6 * (Math.floor(t * 6) % 2) : .5 + .5 * Math.sin((t - settle[i]) * 3)) : 0 });
            }
          });
        },
        bg(c, t) {
          if (v !== 'rings') return;
          const a = 1 - leave(t, slot), X = area.x + cx, Y = area.y + cy, hi = cycle(t, done, n, 1.8), k0 = EZ.out(pr(t, slot.t0, slot.t0 + .8));
          c.save(); c.globalAlpha = a; c.lineCap = 'round';
          items.forEach((_, i) => {
            const r = R0 - i * RW * GAPK - RW / 2, k = EZ.out5(pr(t, at[i], at[i] + DUR)), h = hi.i === i ? hi.k : 0;
            c.lineWidth = RW; c.strokeStyle = 'rgba(255,255,255,.06)'; if (k0 > 0) { c.beginPath(); c.arc(X, Y, r, A0, A0 + PI * 2 * k0); c.stroke(); }
            if (k <= 0) return;
            const an = A0 + PI * 2 * pc[i] / 100 * k;
            c.globalAlpha = a * (hi.i >= 0 && hi.i !== i ? 1 - .5 * hi.k : 1);
            c.strokeStyle = `rgb(${col(i)})`; c.shadowColor = `rgba(${col(i)},.85)`; c.shadowBlur = 16 + 22 * h; c.lineWidth = RW * (1 + .2 * h);
            c.beginPath(); c.arc(X, Y, r, A0, an); c.stroke(); c.shadowBlur = 0; c.globalAlpha = a;
            if (k < 1) T().paint.ball(c, X + Math.cos(an) * r, Y + Math.sin(an) * r, RW * .45, T().aLite, a, { halo: 3 });
          });
          if (k0 > 0) T().paint.arcRing(c, X, Y, R0 + 24, A0 + t * .2, A0 + t * .2 + PI * 2 * k0, T().a, .4 * a, { step: 10 });
          c.restore();
        },
        fg(c, t) {
          if (v === 'rings') { items.forEach((_, i) => { const r = R0 - i * RW * GAPK - RW / 2, an = A0 + PI * 2 * pc[i] / 100; T().paint.burst(c, t, settle[i], area.x + cx + Math.cos(an) * r, area.y + cy + Math.sin(an) * r, { n: 14, sp: 420, life: .6, seed: i, col: col(i) }); }); return; }
          rows.forEach((e, i) => {
            if (pc[i] < 100) return;
            T().paint.burst(c, t, settle[i], area.x + area.w - 20, area.y + e.offsetTop + e.offsetHeight - 20, { n: 26, sp: 600, life: .7, seed: i, col: T().g });
          });
        },
        hint: { cx: area.x + (v === 'rings' ? cx : area.w / 2), cy: area.y + (v === 'rings' ? cy : area.h / 2) },
      };
    },
  });

  /* ---------- timeline：时间线 / 里程碑 ----------
     horizontal 一条线横向生长，到节点即点亮弹出；竖屏自动改成纵向
     vertical   左侧竖线 + 每个节点一张玻璃卡从右侧滑入
     zigzag     折线在上下（竖屏左右）节点间折返，标签在外侧
     当前节点（current，默认最后一个）放大、暖色、持续脉冲；之后的节点虚线、空心表示计划中 */
  MK.control('timeline', {
    variants: ['horizontal', 'vertical', 'zigzag'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, items = p.items, n = items.length;
      const cur = clamp(Math.round(p.current ?? n) - 1, 0, n - 1);
      const wrap = box(el('div', 'mk-abs mk-tl', ctx.root), area.x, area.y, area.w, area.h);
      const hd = header(wrap, p, area.w);
      const top = hd ? 96 : 14, H = area.h - top;
      const mode = v === 'vertical' || (P && v === 'horizontal') ? 'col' : v === 'zigzag' ? (P ? 'zigP' : 'zigL') : 'row';
      const labs = items.map((it, i) => el('div', 'tl-l mk-abs ' + mode + (v === 'vertical' ? ' card mk-glass' : '') + (i === cur ? ' cur' : i > cur ? ' fut' : ''), wrap, `<div class="d">${esc(it.date)}</div><div class="x">${rich(it.text)}</div>`));
      const nodes = []; let start, tail;
      const L = [];   /* 每个标签的框 { x, y, w, h, align, up } */
      if (mode === 'row') {
        const cell = area.w / n, ly = top + H * .36;
        items.forEach((_, i) => { nodes.push([cell * (i + .5), ly]); L.push({ x: cell * i + 6, y: ly + 46, w: cell - 12, h: area.h - ly - 46, align: 'center' }); });
        start = [0, ly]; tail = [area.w, ly];
      } else if (mode === 'col') {
        const rh = H / n, lx = 34;
        items.forEach((_, i) => { const y = top + rh * (i + .5); nodes.push([lx, y]); L.push({ x: lx + 52, y: y - (rh - 14) / 2, w: Math.min(area.w - lx - 52, 980), h: rh - 14, align: 'left' }); });
        start = [lx, top - 10]; tail = [lx, area.h];
      } else if (mode === 'zigL') {
        const cell = area.w / n, mid = top + H * .5, amp = H * .16, w = Math.min(cell * 1.6, 460);
        items.forEach((_, i) => { const x = cell * (i + .5), upN = i % 2 === 0, y = mid + (upN ? -amp : amp); nodes.push([x, y]); L.push({ x: clamp(x - w / 2, 0, area.w - w), y: upN ? top : y + 34, w, h: upN ? y - 34 - top : area.h - y - 34, align: 'center', up: upN }); });
        start = [0, mid]; tail = [area.w, mid];
      } else {
        const rh = H / n, amp = Math.min(120, area.w * .12), w = area.w / 2 - amp - 34;
        items.forEach((_, i) => { const left = i % 2 === 0, x = area.w / 2 + (left ? -amp : amp), y = top + rh * (i + .5), h = Math.min(rh * 2 - 16, 240); nodes.push([x, y]); L.push({ x: left ? 0 : x + 34, y: clamp(y - h / 2, top, area.h - h), w, h, align: left ? 'right' : 'left' }); });
        start = [area.w / 2, top - 10]; tail = [area.w / 2, area.h];
      }
      ctx.measure(() => {
        if (hd) fit(hd, 44, 26, area.w, null);
        labs.forEach((e, i) => { const b = L[i]; box(e, b.x, b.y, b.w, b.h); e.style.textAlign = b.align; if (b.up) e.style.justifyContent = 'flex-end'; });
        const sz = fitAll(labs, v === 'vertical' ? 34 : 36, 15, e => L[labs.indexOf(e)].w, null);
        /* 高度也要放下（换行后） */
        let s = sz; while (s > 15 && labs.some((e, i) => e.scrollHeight > L[i].h + 1)) { s--; labs.forEach(e => { e.style.fontSize = s + 'px'; }); }
        if (labs.some((e, i) => e.scrollHeight > L[i].h + 1)) throw Error('时间线文字放不下：' + labs.find((e, i) => e.scrollHeight > L[i].h + 1).textContent.slice(0, 30));
        labs.forEach((e, i) => { e.style.transformOrigin = mode === 'col' ? '0 50%' : L[i].align === 'right' ? '100% 50%' : L[i].align === 'left' ? '0 50%' : `50% ${L[i].up ? '100%' : '0'}`; });
      });
      const at = beats(slot, n, .6, .8, 1.9);
      const pts = [start, ...nodes, tail];
      /* 线头位置（以 pts 下标计）：第 i 段在 cue 之前到达节点 i */
      const segT = pts.slice(1).map((_, s) => (s === 0 ? [slot.t0 + .1, at[0]] : s < n ? [Math.max(at[s - 1], at[s] - .55), at[s]] : [at[n - 1], at[n - 1] + .7]));
      const headF = t => segT.reduce((f, [a, b]) => f + EZ.inout(pr(t, a, b)), 0);
      const done = at[n - 1] + .9;
      S(slot.t0 + .1, 'swoosh', .4);
      at.forEach((c, i) => { S(c, 'pop', .42, (nodes[i][0] / area.w - .5) * .8); if (i === cur) { S(c + .05, 'ding', .35); punch(c, .022); } });
      S(at[n - 1] + .25, 'shine', .3);
      const A = q => [area.x + q[0], area.y + q[1]];
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          headerIn(hd, t, slot.t0);
          labs.forEach((e, i) => {
            const k = pr(t, at[i] + .05, at[i] + .5), bump = i === cur ? EZ.back(pr(t, at[i] + .25, at[i] + .75)) : 0;
            const pulse = i === cur && t > done ? .02 * Math.sin((t - done) * 3) : 0;
            if (v === 'vertical') tf(e, { o: clamp(k * 3), x: (1 - EZ.back(k)) * 120, p: 1200, ry: (1 - EZ.out(k)) * -30, s: 1 + .05 * bump + pulse });
            else tf(e, { o: clamp(k * 3), y: (1 - EZ.expo(k)) * (L[i].up ? -30 : 30), s: 1 + .08 * bump + pulse, blur: (1 - EZ.out(k)) * 8 });
          });
        },
        bg(c, t) {
          const a = 1 - leave(t, slot), f = headF(t), P2 = pts.map(A), cf = cur + 1;
          c.save(); c.globalAlpha = a; c.lineCap = 'round'; c.lineJoin = 'round';
          /* 走过的部分：实线发光；当前节点之后：虚线（计划中） */
          c.strokeStyle = `rgba(${T().a},.2)`; c.lineWidth = 14; if (polyPart(c, P2, 0, Math.min(f, cf))) c.stroke();
          c.strokeStyle = `rgb(${T().a})`; c.lineWidth = 4; c.shadowColor = `rgba(${T().a},.9)`; c.shadowBlur = 12; if (polyPart(c, P2, 0, Math.min(f, cf))) c.stroke(); c.shadowBlur = 0;
          c.setLineDash([6, 10]); c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 3; if (polyPart(c, P2, cf, f)) c.stroke(); c.setLineDash([]);
          if (f > 0 && f < pts.length - 1) { const h = polyAt(P2, f); T().paint.ball(c, h[0], h[1], 8, f <= cf ? T().aLite : T().w, a * (f <= cf ? 1 : .5), { halo: 3 }); }
          nodes.forEach((q0, i) => {
            const k = EZ.back(pr(t, at[i] - .05, at[i] + .35)); if (k <= 0) return;
            const [x, y] = A(q0), r = (i === cur ? 17 : 11) * k;
            if (i < cur) { c.fillStyle = `rgb(${T().a})`; c.shadowColor = `rgba(${T().a},.9)`; c.shadowBlur = 14; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.shadowBlur = 0; }
            else if (i === cur) { T().paint.ball(c, x, y, r * 1.1, T().w, a, { halo: 2.6 }); c.strokeStyle = `rgba(${T().w},.9)`; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r + 9, 0, 7); c.stroke(); }
            else { c.fillStyle = '#0B0D12'; c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke(); }
            MK.fx.ripple(c, t, at[i], x, y, { r: i === cur ? 110 : 60, rings: i === cur ? 3 : 1, col: i === cur ? T().w : T().a });
          });
          if (t > done) {
            /* 第二拍：当前节点持续脉冲，一颗光点从起点沿走过的路径跑到当前节点 */
            const [x, y] = A(nodes[cur]), t0 = done + Math.floor((t - done) / 1.5) * 1.5;
            MK.fx.ripple(c, t, t0, x, y, { r: 90, rings: 2, col: T().w });
            const q = ((t - done) / 2.4) % 1; if (q < .85) { const h = polyAt(P2, EZ.inout(q / .85) * cf); T().paint.ball(c, h[0], h[1], 6, T().aLite, .8 * a, { halo: 3 }); }
          }
          c.restore();
        },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .45 },
      };
    },
  });

  /* ---------- table：对比表 / 功能矩阵 ----------
     grid      表头翻下，逐行扫描写入，单元格依次弹出（✓ 描出、✗ 抖动）；赢家列高亮框落下 + 扫光
     scorecard 每个方案一张卡片，逐行同时揭晓各卡的值；赢家卡抬起、戴冠、彩纸
     checklist 每行一条清单，徽章依次盖章（音高递增）；底部计票滚动，赢家计票发光
     ✓ / ✗ 写成符号即画成图标；win = 赢家列序号（1 起），不写时取 ✓ 最多的唯一一列 */
  MK.control('table', {
    variants: ['grid', 'scorecard', 'checklist'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, cols = p.cols, rows = p.rows, m = cols.length, nr = rows.length;
      const wrap = box(el('div', 'mk-abs mk-tb ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const hd = header(wrap, p, area.w);
      const top = hd ? 84 : 0, H = area.h - top;
      const cellOf = (r, j) => (r.cells || [])[j] ?? '';
      const yesN = cols.map((_, j) => rows.filter(r => cellKind(cellOf(r, j)) === 'y').length);
      let win = p.win != null ? clamp(Math.round(p.win) - 1, 0, m - 1) : -1;
      if (win < 0) { const mxY = Math.max(...yesN); if (mxY > 0 && yesN.filter(x => x === mxY).length === 1) win = yesN.indexOf(mxY); }
      const c0 = slot.cues[0] ?? slot.t0 + .2;
      const at = beats(slot, nr, c0 - slot.t0 + .6, .75, 2.1, 1);
      const tw = at[nr - 1] + .75, done = tw + .8;
      const cellT = (i, j) => at[i] + .12 + j * .1;
      let hcells = [], grid = [], rowEls = [], labEls = [], hlBox = null, crown = null, cards = [], tallies = [];
      if (v === 'scorecard') {
        const gap = 24, cw = (area.w - gap * (m - 1)) / m, cy0 = top + 58, ch = area.h - cy0 - 6;
        cards = cols.map((name, j) => {
          const e = box(el('div', 'sc mk-glass' + (j === win ? ' win' : ''), wrap, `<div class="nm">${esc(name)}</div>`), j * (cw + gap), cy0, cw, ch);
          const rh = (ch - 84 - 14) / nr;
          const its = rows.map((r, i) => { const q = box(el('div', 'it mk-abs', e, `<div class="rl">${esc(r.label)}</div><div class="cv">${cellHTML(cellOf(r, j))}</div>`), 18, 84 + rh * i, cw - 36); q.style.height = rh + 'px'; return q; });
          return { e, its, nm: e.querySelector('.nm'), cw, rh };
        });
        if (win >= 0) crown = box(el('div', 'crown mk-abs', wrap, MK.icon('crown', 50, 2.4)), win * (cw + gap) + cw / 2 - 34, cy0 - 74, 68);
      } else {
        const lw = area.w * (v === 'checklist' ? .4 : .34), cwid = (area.w - lw) / m;
        const hh = v === 'checklist' ? 58 : 74, fh = v === 'checklist' ? 78 : 0;
        const H2 = H - (win >= 0 ? 46 : 0), rh = Math.min(v === 'checklist' ? 104 : 100, (H2 - hh - fh - 16) / nr);
        const y0 = area.h - H2 + (H2 - hh - fh - rh * nr - 16) / 2;
        hcells = cols.map((name, j) => box(el('div', 'hc mk-abs' + (j === win ? ' win' : ''), wrap, esc(name)), lw + cwid * j + 6, y0, cwid - 12, hh - 10));
        hcells.forEach(e => { e.style.height = (hh - 10) + 'px'; });
        rowEls = rows.map((r, i) => { const e = box(el('div', 'rw mk-abs', wrap), 0, y0 + hh + 8 + rh * i + 4, area.w, rh - 8); e.style.height = (rh - 8) + 'px'; return e; });
        labEls = rows.map((r, i) => box(el('div', 'rl mk-abs', wrap, esc(r.label)), 22, y0 + hh + 8 + rh * i + 4, lw - 34, rh - 8));
        labEls.forEach(e => { e.style.height = (rowEls[0].style.height); });
        grid = rows.map((r, i) => cols.map((_, j) => { const e = box(el('div', 'cv mk-abs', wrap, cellHTML(cellOf(r, j))), lw + cwid * j + 6, y0 + hh + 8 + rh * i + 4, cwid - 12); e.style.height = (rh - 8) + 'px'; e._k = cellKind(cellOf(r, j)); return e; }));
        if (win >= 0 && v === 'grid') hlBox = box(el('div', 'hlc mk-abs', wrap), lw + cwid * win + 2, y0 - 6, cwid - 4, hh + 8 + rh * nr + 10);
        if (hlBox) hlBox.style.height = (hh + 8 + rh * nr + 10) + 'px';
        if (v === 'checklist') tallies = cols.map((_, j) => { const e = box(el('div', 'ty mk-abs' + (j === win ? ' win' : ''), wrap, `<span class="ck">${MK.icon('check', 30, 3)}</span><b>0</b><span class="of">/${nr}</span>`), lw + cwid * j + 6, y0 + hh + 8 + rh * nr + 14, cwid - 12); e.style.height = (fh - 16) + 'px'; return e; });
        if (win >= 0 && v !== 'scorecard') crown = box(el('div', 'crown mk-abs', wrap, MK.icon('crown', 44, 2.4)), lw + cwid * win + cwid / 2 - 26, y0 - 56, 52);
      }
      ctx.measure(() => {
        if (hd) fit(hd, 44, 26, area.w, null);
        if (v === 'scorecard') {
          fitAll(cards.map(c => c.nm), 40, 16, cards[0].cw - 40, null); cards.forEach(c => { c.nm.style.width = ''; });
          const its = cards.flatMap(c => c.its);
          fitAll(its.map(q => q.querySelector('.rl')), 24, 12, cards[0].cw - 36, null);
          const tx = its.map(q => q.querySelector('.cv'));
          fitAll(tx, Math.min(46, Math.floor(cards[0].rh * .48)), 14, cards[0].cw - 36, null);
        } else {
          fitAll(hcells, 34, 14, parseFloat(hcells[0].style.width) - 10, null);
          fitAll(labEls, v === 'checklist' ? 38 : 34, 14, parseFloat(labEls[0].style.width), null);
          fitAll(grid.flat(), Math.min(40, Math.floor(parseFloat(rowEls[0].style.height) * .5)), 14, parseFloat(grid[0][0].style.width) - 8, null);
          if (tallies.length) fitAll(tallies, 34, 14, parseFloat(tallies[0].style.width) - 8, null);
        }
      });
      /* 音效 */
      S(c0, v === 'scorecard' ? 'whoosh' : 'card', .45);
      at.forEach((c, i) => {
        S(c, v === 'checklist' ? 'swoosh' : 'swipe', .3);
        cols.forEach((_, j) => { const k = cellKind(cellOf(rows[i], j)), tt = v === 'scorecard' ? c + .1 + j * .07 : cellT(i, j); if (k === 'y') S(tt, 'check', .26, (j / Math.max(1, m - 1) - .5) * .6, { n: v === 'checklist' ? i + j : j }); else if (k === 'n') S(tt, 'thud', .22); else S(tt, 'tick', .28); });
      });
      if (win >= 0) { S(tw, 'tada', .45); S(tw + .3, 'shine', .35); flash(tw, .12); if (v === 'scorecard') { punch(tw, .025); } }
      const shownYes = (j, t) => rows.filter((r, i) => cellKind(cellOf(r, j)) === 'y' && t >= cellT(i, j)).length;
      return {
        update(t) {
          const out = leave(t, slot), idleOn = t > done;
          set(wrap, { o: 1 - out, blur: out * 10 });
          headerIn(hd, t, slot.t0);
          if (v === 'scorecard') {
            cards.forEach(({ e, its }, j) => {
              const k = pr(t, c0 + j * .1, c0 + j * .1 + .6), lift = j === win ? EZ.spring(pr(t, tw, tw + .7)) : 0, dim = win >= 0 && j !== win ? pr(t, tw, tw + .5) : 0;
              tf(e, { o: clamp(k * 3) * (1 - .42 * dim), p: 1400, rx: (1 - EZ.back(k)) * 40, y: (1 - EZ.out(k)) * 80 - 22 * lift, s: 1 + .035 * lift });
              e.style.setProperty('--sh', (j === win && t > tw ? lerp(130, -30, ((t - tw) / 2.4) % 1) : 130).toFixed(1) + '%');
              its.forEach((q, i) => {
                const tt = at[i] + .1 + j * .07, r = pr(t, tt - .05, tt + .35), cv = q.querySelector('.cv');
                tf(q.querySelector('.rl'), { o: pr(t, at[i] - .1, at[i] + .2) });
                tf(cv, { o: clamp(r * 4), s: 1 + (1 - EZ.out5(r)) * .7, blur: (1 - r) * 8 });
              });
            });
          } else {
            hcells.forEach((e, j) => { const k = pr(t, c0 + j * .08, c0 + j * .08 + .5); tf(e, { o: clamp(k * 3), p: 800, rx: (1 - EZ.back(k)) * -85 }); e.style.transformOrigin = '50% 0'; });
            rowEls.forEach((e, i) => {
              const k = pr(t, at[i] - .05, at[i] + .45);
              if (v === 'grid') { e.style.clipPath = `inset(0 ${((1 - EZ.inout(k)) * 100).toFixed(2)}% 0 0)`; tf(e, { o: k > 0 ? 1 : 0 }); e.style.setProperty('--sc', k > 0 && k < 1 ? '1' : '0'); }
              else tf(e, { o: clamp(k * 3), y: (1 - EZ.spring(k)) * 40, p: 900, rx: (1 - EZ.out(k)) * 30 });
              const scan = v === 'checklist' && idleOn ? Math.max(0, 1 - Math.abs(((t - done) / .5) % (nr + 2) - i - 1)) : 0;
              e.style.setProperty('--hl', scan.toFixed(3));
            });
            labEls.forEach((e, i) => { const k = pr(t, at[i], at[i] + .4); tf(e, { o: clamp(k * 3), x: (1 - EZ.expo(k)) * -40 }); });
            grid.forEach((rw, i) => rw.forEach((e, j) => {
              const tt = cellT(i, j), k = pr(t, tt, tt + .35);
              const sh = e._k === 'n' && k < 1 ? Math.sin(k * 30) * 8 * (1 - k) : 0;
              const pulse = idleOn && j === win && e._k === 'y' ? Math.max(0, Math.sin((t - done) * 3 - i * .9)) * .12 : 0;
              tf(e, { o: clamp(k * 4), s: (v === 'checklist' ? 1 + (1 - EZ.out5(k)) * .8 : .4 + .6 * EZ.back(k)) * (1 + pulse), x: sh });
              const pth = e.querySelector('.ok path'); if (pth) MK.draw(pth, EZ.out(pr(t, tt + .05, tt + .4)));
            }));
            tallies.forEach((e, j) => {
              const k = pr(t, at[0] - .1, at[0] + .3), wn = j === win ? EZ.back(pr(t, tw, tw + .5)) : 0;
              html(e.querySelector('b'), String(shownYes(j, t)));
              tf(e, { o: clamp(k * 3) * (win >= 0 && j !== win ? 1 - .4 * pr(t, tw, tw + .4) : 1), s: 1 + .12 * wn + (idleOn && j === win ? .03 * Math.sin((t - done) * 3) : 0) });
              e.classList.toggle('lit', j === win && t >= tw);
            });
            if (hlBox) {
              const k = pr(t, tw, tw + .55);
              tf(hlBox, { o: clamp(k * 3), sy: Math.max(.001, EZ.out5(k)) });
              hlBox.style.transformOrigin = '50% 0';
              hlBox.style.setProperty('--sh', (t > tw + .4 ? lerp(-30, 130, ((t - tw - .4) / 2.2) % 1) : -30).toFixed(1) + '%');
            }
            hcells.forEach((e, j) => e.classList.toggle('lit', j === win && t >= tw));
          }
          if (crown) { const k = pr(t, tw + .15, tw + .6); tf(crown, { o: clamp(k * 3), y: (1 - EZ.bounce(k)) * -80 + (idleOn ? Math.sin((t - done) * 2.6) * 4 : 0), r: (1 - EZ.out(k)) * -20 }); }
        },
        fg(c, t) {
          if (win < 0 || !crown) return;
          const x = area.x + crown.offsetLeft + crown.offsetWidth / 2, y = area.y + crown.offsetTop + crown.offsetHeight / 2;
          if (v === 'scorecard') MK.fx.confetti(c, t, tw + .3, x, y, { n: 60, sp: 1000, spread: .8 });
          else T().paint.burst(c, t, tw + .5, x, y, { n: 30, sp: 600, life: .8, col: T().w });
        },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- ranking：排行榜 ----------
     race   按输入顺序逐条长出，最后一拍按数值重新排序、交换位置，冠军条变金色
     podium 从末名开始揭晓：4–6 名滑入，三名领奖台依次升起，第一名前有鼓点、揭晓时彩纸 + 聚光
     list   名次牌自下而上逐个翻入，第一名金色 + 王冠 + 扫光 */
  MK.control('ranking', {
    variants: ['race', 'podium', 'list'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, items = p.items, n = items.length;
      const order = items.map((_, i) => i).sort((a, b) => items[b].value - items[a].value);
      const rank = []; order.forEach((i, r) => { rank[i] = r; });
      const dec = MK.decOf(...items.map(it => it.value)), vmax = Math.max(...items.map(it => it.value), 1e-9);
      const fv = x => MK.fmt(x, dec) + unitH(p.unit);
      const wrap = box(el('div', 'mk-abs mk-rk ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const hd = header(wrap, p, area.w, v === 'podium');
      const top = hd ? 84 : 0, H = area.h - top;
      const at = beats(slot, n, .4, v === 'podium' ? .85 : .55, v === 'race' ? 2.6 : 2);
      /* 揭晓顺序：race 按输入顺序；podium / list 从末名到第一（第 k 拍揭晓名次 n-1-k） */
      const revealOf = i => (v === 'race' ? at[i] : at[n - 1 - rank[i]]);
      const ts = at[n - 1] + .9, tl = v === 'race' ? ts + .9 : at[n - 1], done = tl + .9;
      let rows = [], blocks = [], chips = [];
      const rh = Math.min(108, H / n), y0 = top + (H - rh * n) / 2;
      if (v === 'race') {
        rows = items.map((it, i) => { const e = box(el('div', 'rw mk-abs', wrap, `<span class="rk">–</span><span class="lb">${esc(it.label)}</span><span class="br"></span><span class="vl"></span><span class="cr">${MK.icon('crown', 40, 2.4)}</span>`), 0, y0 + rh * i, area.w); e.style.height = (rh - 14) + 'px'; return e; });
      } else if (v === 'list') {
        rows = items.map((it, i) => { const e = box(el('div', 'pl mk-abs' + (rank[i] === 0 ? ' gold' : ''), wrap, `<span class="rk">${rank[i] + 1}</span><span class="lb">${esc(it.label)}</span><span class="mb"><b style="width:${(it.value / vmax * 100).toFixed(1)}%"></b></span><span class="vl"></span>${rank[i] === 0 ? `<span class="cr">${MK.icon('crown', 40, 2.4)}</span>` : ''}`), 0, y0 + rh * rank[i] + 6, area.w); e.style.height = (rh - 14) + 'px'; return e; });
      } else {
        const side = !P && n > 3, podW = side ? area.w * .66 : area.w, floor = P && n > 3 ? area.h - 126 : area.h - 6;
        const gap = 22, bw = Math.min(250, (podW - gap * 2) / 3), hs = [.4, .29, .2].map(k => (floor - top - 150) * k / .4);
        const xs = [1, 0, 2].map((r, k) => ({ r, x: (podW - (bw * 3 + gap * 2)) / 2 + k * (bw + gap) }));
        order.forEach((i, r) => {
          if (r < 3) {
            const x = xs.find(q => q.r === r).x, h = Math.min(hs[r], (floor - top - 150));
            const b = box(el('div', `pb p${r + 1} mk-abs`, wrap, `<span>${r + 1}</span>`), x, floor - h, bw); b.style.height = h + 'px';
            const lb = box(el('div', 'pn mk-abs', wrap, `${r === 0 ? `<span class="cr">${MK.icon('crown', 48, 2.4)}</span>` : ''}<div class="lb">${esc(items[i].label)}</div><div class="vl"></div>`), x - 14, 0, bw + 28);
            blocks.push({ i, r, b, lb, x, h, floor });
          } else {
            const k = r - 3, cw = side ? area.w - podW - 24 : (area.w - 2 * 16) / 3, ch = side ? 76 : 100;
            const cx = side ? podW + 24 : k * (cw + 16), cy = side ? top + (H - (ch + 14) * (n - 3)) / 2 + k * (ch + 14) : area.h - ch;
            const e = box(el('div', 'ch mk-abs' + (side ? '' : ' v2'), wrap, `<span class="rk">${r + 1}</span><span class="lb">${esc(items[i].label)}</span><span class="vl">${fv(items[i].value)}</span>`), cx, cy, cw); e.style.height = ch + 'px';
            chips.push({ i, r, e });
          }
        });
      }
      let barX = 0, barW = 0;
      ctx.measure(() => {
        if (hd) fit(hd, 44, 26, area.w, null);
        if (v === 'race' || v === 'list') {
          const fs = Math.min(38, Math.floor(rh * .36));
          rows.forEach((e, i) => { e.style.fontSize = fs + 'px'; html(e.querySelector('.vl'), fv(items[i].value)); });
          const lbs = rows.map(e => e.querySelector('.lb')), vls = rows.map(e => e.querySelector('.vl'));
          const lw = Math.min(area.w * (P ? .3 : .26), Math.max(...lbs.map(e => e.scrollWidth)));
          lbs.forEach(e => { e.style.width = lw + 'px'; });
          let s = fs; while (s > 14 && lbs.some(e => e.scrollWidth > lw + 1)) { s--; rows.forEach(e => { e.style.fontSize = s + 'px'; }); }
          if (lbs.some(e => e.scrollWidth > lw + 1)) throw Error('排行榜名称放不下');
          const vw = Math.max(...vls.map(e => e.offsetWidth));
          if (v === 'race') { barX = rows[0].querySelector('.lb').offsetLeft + lw + 18; barW = area.w - barX - vw - 70; if (barW < 80) throw Error('排行榜数值太长，放不下'); }
          else vls.forEach(e => { e.style.width = vw + 'px'; });
        } else {
          blocks.forEach(({ lb, b, r }) => {
            html(lb.querySelector('.vl'), fv(items[blocks.find(q => q.lb === lb).i].value));
            fit(lb.querySelector('.lb'), 38, 14, parseFloat(lb.style.width), null); fit(lb.querySelector('.vl'), 40, 14, parseFloat(lb.style.width), null);
            lb.style.top = (parseFloat(b.style.top) - lb.offsetHeight - 10) + 'px';
            fit(b.firstChild, Math.min(110, parseFloat(b.style.height) * .55), 20, parseFloat(b.style.width), null);
          });
          if (chips.length) fitAll(chips.map(c => c.e), 30, 13, parseFloat(chips[0].e.style.width), null);
        }
      });
      if (v === 'race') { at.forEach((c, i) => { S(c, 'swipe', .3); S(c + .05, 'fill', .22, 0, { d: .8 }); }); S(ts - .05, 'whip', .45); S(ts + .3, 'tick', .35); S(tl, 'tada', .45); flash(tl, .15); }
      else if (v === 'list') { at.forEach((c, k) => { S(c, 'card', .4); S(c + .2, k === n - 1 ? 'tada' : 'tick', k === n - 1 ? .45 : .35); }); flash(tl + .2, .15); }
      else {
        at.forEach((c, k) => { const r = n - 1 - k; if (r >= 3) S(c, 'swipe', .35); else if (r > 0) { S(c, 'thud', .5); S(c + .3, 'pop', .4); } });
        if (n > 1) S(at[n - 2] + .35, 'drumroll', .35, 0, { d: Math.max(.3, at[n - 1] - at[n - 2] - .35) });
        S(tl, 'crash', .45); S(tl + .02, 'tada', .5); flash(tl, .3); punch(tl, .04); shake(tl, 8);
      }
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          headerIn(hd, t, slot.t0);
          if (v === 'race') {
            rows.forEach((e, i) => {
              const c = at[i], k = pr(t, c - .15, c + .3), g = EZ.out5(pr(t, c, c + .9));
              const ms = ts + rank[i] * .06, mv = EZ.spring(pr(t, ms, ms + .8)), lift = Math.sin(PI * pr(t, ms, ms + .5));
              tf(e, { o: clamp(k * 3), x: (1 - EZ.expo(k)) * -60, y: (rank[i] - i) * rh * mv, s: 1 + .03 * lift });
              e.style.zIndex = String(10 + Math.round(lift * 10));
              const bw = barW * items[i].value / vmax * g, br = e.querySelector('.br'), vl = e.querySelector('.vl');
              br.style.left = barX + 'px'; br.style.width = Math.max(0, bw).toFixed(1) + 'px';
              vl.style.left = (barX + bw + 16).toFixed(1) + 'px'; html(vl, fv(items[i].value * g));
              html(e.querySelector('.rk'), t >= ms + .25 ? String(rank[i] + 1) : '–');
              e.classList.toggle('lead', rank[i] === 0 && t >= tl);
              br.style.setProperty('--sh', (rank[i] === 0 && t > tl ? lerp(-30, 130, ((t - tl) / 2) % 1) : -30).toFixed(1) + '%');
              const cr = e.querySelector('.cr'); cr.style.left = (barX + bw + 16 + vl.offsetWidth + 10).toFixed(1) + 'px';
              tf(cr, { o: rank[i] === 0 ? pr(t, tl, tl + .2) : 0, s: rank[i] === 0 ? EZ.back(pr(t, tl, tl + .45)) : 0, r: t > done ? Math.sin((t - done) * 3) * 6 : 0 });
            });
          } else if (v === 'list') {
            rows.forEach((e, i) => {
              const c = revealOf(i), k = pr(t, c - .05, c + .5);
              tf(e, { o: clamp(k * 4), p: 900, rx: (1 - EZ.back(k)) * 90 });
              e.style.transformOrigin = '50% 0';
              html(e.querySelector('.vl'), fv(items[i].value * EZ.out5(pr(t, c, c + .7))));
              e.querySelector('.mb b').style.transform = `scaleX(${EZ.out5(pr(t, c + .1, c + .8)).toFixed(3)})`;
              e.style.setProperty('--sh', (rank[i] === 0 && t > tl + .4 ? lerp(-30, 130, ((t - tl - .4) / 2.2) % 1) : -30).toFixed(1) + '%');
              const glow = t > done ? Math.max(0, 1 - Math.abs(((t - done) / .45) % (n + 3) - rank[i] - 1)) : 0;
              e.style.setProperty('--hl', glow.toFixed(3));
              const cr = e.querySelector('.cr'); if (cr) tf(cr, { o: pr(t, c + .3, c + .5), s: EZ.back(pr(t, c + .3, c + .75)), r: t > done ? Math.sin((t - done) * 3) * 7 : 0 });
            });
          } else {
            blocks.forEach(({ i, r, b, lb }) => {
              const c = revealOf(i), k = pr(t, c, c + .75), q = pr(t, c + .35, c + .8);
              tf(b, { o: clamp(k * 5), sy: Math.max(.001, EZ.spring(k)) }); b.style.transformOrigin = '50% 100%';
              tf(lb, { o: clamp(q * 3), y: (1 - EZ.bounce(q)) * -60, s: r === 0 && t > done ? 1 + .03 * Math.sin((t - done) * 2.4) : 1 });
              html(lb.querySelector('.vl'), fv(items[i].value * EZ.out5(pr(t, c + .3, c + 1.1))));
              b.style.setProperty('--sh', (r === 0 && t > done ? lerp(-30, 130, ((t - done) / 2.4) % 1) : -30).toFixed(1) + '%');
            });
            chips.forEach(({ i, e }) => { const k = pr(t, revealOf(i) - .1, revealOf(i) + .4); tf(e, { o: clamp(k * 3), x: (1 - EZ.back(k)) * (P ? 0 : 80), y: P ? (1 - EZ.back(k)) * 50 : 0 }); });
          }
        },
        bg(c, t) {
          if (v !== 'podium') return;
          const one = blocks.find(q => q.r === 0); if (!one) return;
          const a = (1 - leave(t, slot)) * pr(t, tl - .1, tl + .4), x = area.x + one.x + parseFloat(one.b.style.width) / 2, sw = t > done ? Math.sin((t - done) * 1.2) * 40 : 0;
          if (a <= 0) return;
          c.save(); c.globalCompositeOperation = 'lighter';
          const yb = area.y + one.floor - one.h, y0 = area.y + top + 10, g = c.createLinearGradient(0, y0, 0, yb);
          g.addColorStop(0, `rgba(${T().w},0)`); g.addColorStop(1, `rgba(${T().w},${.28 * a})`);
          c.fillStyle = g; c.beginPath(); c.moveTo(x - 30 + sw, y0); c.lineTo(x + 30 + sw, y0); c.lineTo(x + 170, yb); c.lineTo(x - 170, yb); c.closePath(); c.fill();
          c.restore();
          MK.fx.twinkle(c, t, x - 180, yb - 260, 360, 240, 10, T().w, a);
        },
        fg(c, t) {
          if (v === 'podium') { const one = blocks.find(q => q.r === 0); if (one) MK.fx.confetti(c, t, tl, area.x + one.x + parseFloat(one.b.style.width) / 2, area.y + one.floor - one.h, { n: 90, sp: 1300 }); }
          else if (v === 'race') { const i = order[0]; T().paint.burst(c, t, tl, area.x + barX + barW * .98, area.y + y0 + rh * .45, { n: 30, sp: 700, col: T().w, seed: i }); }
          else { const i = order[0]; T().paint.burst(c, t, revealOf(i) + .3, area.x + area.w * .5, area.y + y0 + rh * .5, { n: 34, sp: 800, col: T().w }); }
        },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });
})();
