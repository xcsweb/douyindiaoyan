/* motion-kit · 结构类控件：list / compare / steps / bars / media / fusion
   竖屏（ctx.portrait）不是缩放横屏：compare 改为上下对比，media 改为全宽窗口 + 标注排在窗口下方，steps 改为纵向。 */
(function () {
  'use strict';
  const { clamp, lerp, pr, EZ, el, box, set, enter, fit, html, rich, esc, S, flash, shake } = MK;
  const T = () => MK.T;
  const leave = (t, slot) => pr(t, slot.t1 - .35, slot.t1);
  /* 把 n 个落点均匀放进 [a, b]，用户没给 cue 时用 */
  const spread = (n, a, b) => Array.from({ length: n }, (_, i) => (n === 1 ? a : lerp(a, b, i / (n - 1))));

  /* ---------- list：要点 ----------
     rail   竖轨 + 圆点编号，逐条左滑入（默认）
     cards  每条一张玻璃卡，从下方错位翻起
     check  每条前一个方框，出现时打勾
     全部出现后停留超过 4 秒：轮流高亮，避免死屏 */
  MK.control('list', {
    variants: ['rail', 'cards', 'check'],
    build(slot, p, ctx) {
      const { area } = ctx, n = p.items.length, v = ctx.variant;
      const balanced = MotionNarrationLayout.enabled() || (ctx.portrait && ctx.mode === 'card');
      const wrap = box(el('div', 'mk-abs mk-list', ctx.root), area.x, area.y, area.w, area.h);
      if (balanced) wrap.classList.add('narration-balanced');
      const title = box(el('div', 'mk-title mk-abs', wrap, rich(p.title)), 0, area.h * .04, area.w);
      title.style.fontSize = '84px';
      let top = area.h * .04 + 150, gap = Math.min(v === 'cards' ? 132 : 118, (area.h - top - 10) / n);
      const rows = p.items.map((s, i) => {
        const r = box(el('div', 'row' + (v === 'cards' ? ' card' : ''), wrap), 0, top + i * gap, area.w);
        const idx = el('div', 'idx' + (v === 'check' ? ' box' : ''), r, v === 'check' ? '' : String(i + 1));
        const tx = el('div', 'txt', r, rich(s));
        return { r, tx, idx };
      });
      let railX = 32, railY = 32;
      ctx.measure(() => { if (balanced) { const g = MotionNarrationLayout.list(area, title, rows, v, wrap, ctx.portrait && ctx.mode === 'card'); top = g.top; gap = g.gap; railX = g.railX; railY = g.railY; return; } fit(title, 88, 48, area.w, null); rows.forEach(({ tx }) => fit(tx, Math.min(58, gap * .5), 28, area.w - (v === 'cards' ? 140 : 96), null)); });
      const auto = spread(n, slot.t0 + .7, Math.min(slot.t1 - 1, slot.t0 + .7 + (n - 1) * .9));
      const at = p.items.map((_, i) => slot.cues[i] ?? auto[i]);
      const readable = v === 'rail' && slot.cuePolicy === 'readable-at-cue/1';
      if (readable && (!MotionNarrationCue.complete(slot, n) || at.some(c => c < slot.t0 + .55 - 1e-7)))
        throw Error('READABLE_CUE_LEAD: list/rail needs one real cue per item and 0.55 seconds of scene lead. Keep the real cue; move the visual scene earlier, split the list, or choose another expression.');
      if (readable && at.some(c => c > slot.t1 - .35))
        throw Error('READABLE_CUE_EXIT: list/rail cues must precede its final 0.35 seconds of exit. Keep the real cue; extend the visual scene, split the list, or choose another expression.');
      // Keep semantic focus at the real cue; schedule the original 0.55s motion before it.
      const entryAt = readable ? at.map(c => c - .55) : at;
      const allIn = at[n - 1] + .6;
      S(slot.t0, 'swoosh', .5); entryAt.forEach((c, i) => S(c, v === 'check' ? 'check' : v === 'cards' ? 'card' : 'tick', .5, -.3 + i * .12, { n: i }));
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 8, y: -EZ.in(out) * 16 });
          enter(title, t, slot.t0 + .05, v === 'cards' ? 'blur' : 'rise');
          const rot = !slot.cues.length && slot.t1 - allIn > 4 && t > allIn + 2.5 ? Math.floor((t - allIn - 2.5) / 2.4) % n : -1;
          const newest = at.filter(c => t >= c).length - 1;
          rows.forEach(({ r, idx }, i) => {
            if (v === 'cards') { const k = pr(t, at[i], at[i] + .5); set(r, { o: clamp(k * 3), y: (1 - EZ.expo(k)) * 50, s: .94 + .06 * EZ.spring(k) }); r.style.transform += ` perspective(1200px) rotateX(${((1 - EZ.out5(k)) * 40).toFixed(2)}deg)`; }
            else if (v === 'check') { enter(r, t, at[i], 'rise', { dist: 26 }); const k = pr(t, at[i] + .15, at[i] + .45); idx.style.setProperty('--ck', EZ.out(k).toFixed(3)); }
            else {
              // Reserve entry travel inside the content-safe edge, including motion allowance.
              // A tiny positive distance avoids enter()'s legacy zero-as-default behavior.
              const dist = slot.cuePolicy === 'readable-at-cue/1'
                ? Math.max(.001, Math.min(70, area.x - (ctx.portrait ? 60 : 76) - 16)) : 70;
              enter(r, t, entryAt[i], 'slide-l', { dist });
            }
            const on = t >= at[i] && (rot < 0 ? i === newest : i === rot);
            r.classList.toggle('on', on);
            r.classList.toggle('dim', rot >= 0 && !on);
          });
        },
        bg(c, t) {
          if (v !== 'rail') return;
          const a = pr(t, slot.t0, slot.t0 + .6) * (1 - leave(t, slot)), y0 = area.y + top + railY;
          const last = at.filter(c2 => t >= c2).length;
          if (last > 1) T().paint.beam(c, area.x + railX, y0, area.x + railX, y0 + (last - 1) * gap, T().a2, .55 * a, { w: 2 });
        },
        hint: { cx: area.x + area.w * .35, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- compare：对比 ----------
     横屏  左右两栏；竖屏  上下两块（中间 VS 横线）
     split  两侧滑入，结论后输的一侧变暗（默认）
     panels 两张玻璃面板，赢的一侧放大
     flip   先只出现左（上）侧，然后整块翻转露出右（下）侧，再并排 */
  MK.control('compare', {
    variants: ['split', 'panels', 'flip'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait && !(ctx.mode === 'card' && Math.max(p.left.lines?.length || 0, p.right.lines?.length || 0) >= 2);
      const balanced = MotionNarrationLayout.enabled() || (ctx.portrait && ctx.mode === 'card');
      const wrap = box(el('div', 'mk-abs mk-vs', ctx.root), area.x, area.y, area.w, area.h);
      if (balanced) wrap.classList.add('narration-balanced');
      /* 两栏的几何：横屏左右各 44%；竖屏上下各占约 40% 高度 */
      const geo = balanced ? MotionNarrationLayout.comparison(area, P, p, ctx.portrait && ctx.mode === 'card') : P
        ? { L: { x: 0, y: area.h * .02, w: area.w, h: area.h * .4 }, R: { x: 0, y: area.h * .5, w: area.w, h: area.h * .4 }, vs: { x: area.w / 2, y: area.h * .455 }, verdictY: area.h * .93 }
        : { L: { x: 0, y: area.h * .16, w: area.w * .44, h: area.h * .5 }, R: { x: area.w * .56, y: area.h * .16, w: area.w * .44, h: area.h * .5 }, vs: { x: area.w / 2, y: area.h * .16 + 90 }, verdictY: area.h * .76 };
      const col = (side, g, color, right) => {
        const c = box(el('div', 'col' + (v === 'panels' ? ' mk-glass' : ''), wrap), g.x, g.y, g.w, balanced || v === 'panels' ? g.h : null);
        if (v === 'panels') c.style.padding = P ? '34px 40px' : '34px 38px';
        if (right && !P) c.style.textAlign = 'right';
        const lab = el('div', 'lab', c, esc(side.label || '')); lab.style.color = color;
        const big = el('div', 'big', c, rich(side.big));
        const lines = (side.lines || []).map(s => el('div', 'line', c, rich(s)));
        return { c, lab, big, lines, g };
      };
      const L = col(p.left, geo.L, 'var(--dim)', false), Rr = col(p.right, geo.R, 'var(--a)', true);
      const vs = el('div', 'vs', wrap, 'VS');
      const verdict = p.verdict ? box(el('div', 'mk-abs', wrap), 0, geo.verdictY - 40, area.w) : null;
      if (verdict) { verdict.style.textAlign = 'center'; verdict.innerHTML = `<span class="mk-chip" style="font-size:36px;padding:16px 32px"><i></i>${rich(p.verdict)}</span>`; }
      const pad = v === 'panels' ? 80 : 0;
      ctx.measure(() => {
        if (balanced) MotionNarrationLayout.compareText([L, Rr], verdict, area, v);
        else [L, Rr].forEach(s => { fit(s.big, P ? 110 : 92, 44, s.g.w - pad, null); s.lines.forEach(e => fit(e, P ? 42 : 38, 24, s.g.w - pad, null)); });
        const r = vs.getBoundingClientRect(); vs._w = r.width; vs._h = r.height;
      });
      const [cl, cr, cv] = [slot.cues[0] ?? slot.t0 + .2, slot.cues[1] ?? slot.t0 + 1.2, slot.cues[2] ?? slot.t0 + 2.4];
      const win = p.winner || 'none';
      if (v === 'flip') { S(cl, 'card', .5); S(cr - .1, 'swoosh', .6); S(cr + .2, 'thud', .5); }
      else { S(cl, 'swipe', .5, -.5); S(cr, 'swipe', .5, .5); }
      if (verdict) { S(cv, 'hit', .7); flash(cv, .2); }
      const inL = P ? 'rise' : 'slide-l', inR = P ? 'rise' : 'slide-r';
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 8 });
          const vk = verdict ? pr(t, cv, cv + .4) : 0;
          const dimL = win === 'right' ? 1 - .55 * vk : 1, dimR = win === 'left' ? 1 - .55 * vk : 1;
          const grow = side => (win === side && v === 'panels' ? 1 + .04 * EZ.out(vk) : 1);
          if (v === 'flip') {
            /* 先只有左（上）侧居中出现，到 cr 时移到自己位置，右（下）侧翻入 */
            const k = EZ.inout(pr(t, cr - .3, cr + .3)), centerOff = P ? (area.h * .24) * (1 - k) : (area.w * .28) * (1 - k);
            enter(L.c, t, cl, 'rise', { dist: 30, o: dimL, x: P ? 0 : centerOff, y: P ? centerOff : 0 });
            const kr = pr(t, cr, cr + .5);
            set(Rr.c, { o: clamp(kr * 3) * dimR });
            Rr.c.style.transform += ` perspective(1400px) ${P ? 'rotateX' : 'rotateY'}(${((1 - EZ.out5(kr)) * (P ? 70 : -70)).toFixed(2)}deg)`;
          } else {
            enter(L.c, t, cl, inL, { dist: P ? 40 : 90, o: dimL, s: grow('left') });
            enter(Rr.c, t, cr, inR, { dist: P ? 40 : 90, o: dimR, s: grow('right') });
          }
          L.lines.forEach((e, i) => enter(e, t, cl + .35 + i * .25, 'rise', { dist: 14 }));
          Rr.lines.forEach((e, i) => enter(e, t, cr + .35 + i * .25, 'rise', { dist: 14 }));
          enter(vs, t, cr - .1, 'pop', { x: geo.vs.x - (vs._w || 0) / 2, y: geo.vs.y - (vs._h || 0) / 2 });
          if (verdict) enter(verdict, t, cv, 'pop');
          const glow = k => `0 0 ${(28 * k).toFixed(1)}px rgba(${T().a},.6)`;
          Rr.big.style.textShadow = win === 'right' ? glow(vk) : ''; L.big.style.textShadow = win === 'left' ? glow(vk) : '';
        },
        bg(c, t) {
          if (v === 'panels') return;
          const a = pr(t, slot.t0, slot.t0 + .5) * (1 - leave(t, slot)), k = EZ.out(pr(t, cr - .2, cr + .6));
          const vx = area.x + geo.vs.x, vy = area.y + geo.vs.y;
          if (P) { T().paint.beam(c, vx - 90, vy, vx - 90 - (area.w / 2 - 110) * k, vy, '255,255,255', .25 * a, { w: 1 }); T().paint.beam(c, vx + 90, vy, vx + 90 + (area.w / 2 - 110) * k, vy, '255,255,255', .25 * a, { w: 1 }); }
          else { T().paint.beam(c, vx, area.y + area.h * .16, vx, vy - 50, '255,255,255', .25 * a, { w: 1, p: k }); T().paint.beam(c, vx, vy + 50, vx, area.y + area.h * .66, '255,255,255', .25 * a, { w: 1, p: k }); }
        },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- steps：步骤 ----------
     横屏横向、竖屏纵向排列
     track  光点沿虚线轨道依次点亮（默认）
     ladder 阶梯逐级上升，标签站在台阶上
     cards  每步一张卡，前一张收缩成编号，后一张接上 */
  MK.control('steps', {
    variants: ['track', 'ladder', 'cards'],
    build(slot, p, ctx) {
      const { area } = ctx, n = p.steps.length, v = ctx.variant, P = ctx.portrait;
      const balanced = MotionNarrationLayout.enabled() || (ctx.portrait && ctx.mode === 'card');
      const wrap = box(el('div', 'mk-abs mk-steps', ctx.root), area.x, area.y, area.w, area.h);
      if (balanced) wrap.classList.add('narration-balanced', ...(P ? ['portrait'] : []));
      const title = p.title ? box(el('div', 'mk-title mk-abs', wrap, rich(p.title)), 0, area.h * .04, area.w) : null;
      if (title) title.style.fontSize = '84px';
      const auto = spread(n, slot.t0 + .9, Math.min(slot.t1 - 1, slot.t0 + .9 + (n - 1) * 1.1));
      const at = p.steps.map((_, i) => slot.cues[i] ?? auto[i]);
      const follow = MotionNarrationCue.follows(slot, n);
      /* 每步的锚点（相对 area）：横屏一行，竖屏一列；ladder 每步抬高 */
      const top = area.h * .04 + (title ? 170 : 40), bottom = area.h * .92;
      const pts = p.steps.map((_, i) => {
        if (P) return { x: area.w * .12, y: lerp(top + 40, bottom - 60, n === 1 ? 0 : i / (n - 1)) };
        const half = v === 'cards' ? (area.w / n - 20) / 2 : area.w * .1;
        const x = lerp(half, area.w - half, n === 1 ? .5 : i / (n - 1));
        return { x, y: v === 'ladder' ? lerp(area.h * .82, area.h * .4, n === 1 ? 0 : i / (n - 1)) : area.h * .5 };
      });
      let cw = P ? area.w * .78 : area.w / n - 20;
      const cards = p.steps.map((s, i) => {
        const c = box(el('div', 'card' + (v === 'cards' ? ' mk-glass' : ''), wrap), P ? pts[i].x + 70 : pts[i].x - cw / 2, P ? pts[i].y - 44 : pts[i].y + 56, cw);
        if (P) c.style.textAlign = 'left';
        if (v === 'cards') c.style.padding = '22px 24px';
        if (v === 'ladder' && !P) c.style.top = (pts[i].y - 150) + 'px';
        el('div', 'n', c, String(i + 1).padStart(2, '0')); const nm = el('div', 'name', c, rich(s));
        return { c, nm };
      });
      ctx.measure(() => { if (balanced) { cw = MotionNarrationLayout.steps(area, title, cards, pts, v, P, ctx.portrait && ctx.mode === 'card'); return; } if (title) fit(title, 88, 48, area.w, null); cards.forEach(({ nm }) => fit(nm, P ? 60 : 52, 26, cw - (v === 'cards' ? 48 : 0), null)); });
      S(slot.t0, 'swoosh', .5); at.forEach((c, i) => S(c, i === n - 1 ? 'check' : v === 'ladder' ? 'thud' : 'pop', .55, -.6 + i * 1.2 / Math.max(1, n - 1), { n: i }));
      const X = i => area.x + pts[i].x, Y = i => area.y + pts[i].y;
      const orb = t => { let x = X(0), y = Y(0); for (let i = 1; i < n; i++) if (t >= at[i] - .45) { const k = EZ.inout(pr(t, at[i] - .45, at[i])); x = lerp(X(i - 1), X(i), k); y = lerp(Y(i - 1), Y(i), k); } return { x, y }; };
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 8 });
          if (title) enter(title, t, slot.t0 + .05, 'rise');
          cards.forEach(({ c, nm }, i) => {
            const a = pr(t, at[i] - .1, at[i] + .35);
            if (v === 'cards') { const done = i < n - 1 ? pr(t, at[i + 1] - .1, at[i + 1] + .3) : 0; set(c, { o: (.25 + .75 * clamp(a * 3)) * (1 - .45 * done), s: (.9 + .1 * EZ.spring(a)) * (1 - .06 * done), y: (1 - EZ.expo(a)) * 40 }); }
            else set(c, { s: .85 + .15 * EZ.spring(a), o: .3 + .7 * clamp(a * 3), y: (1 - EZ.expo(a)) * 24 });
            nm.style.color = t >= at[i] ? 'var(--tx)' : 'var(--dim)';
            MotionNarrationCue.reveal(nm, t, at[i], follow);
          });
        },
        bg(c, t) {
          const Pt = T().paint, a = pr(t, slot.t0, slot.t0 + .6) * (1 - leave(t, slot));
          c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(${T().a},${.18 * a})`; c.lineWidth = 2; c.setLineDash([4, 10]);
          c.beginPath(); c.moveTo(X(0), Y(0));
          for (let i = 1; i < n; i++) { if (v === 'ladder' && !P) c.lineTo(X(i), Y(i - 1)); c.lineTo(X(i), Y(i)); }
          c.stroke(); c.restore();
          const o = orb(t), lit = pr(t, at[0] - .3, at[0]);
          /* 已走过的路：光束连到光点 */
          let px = X(0), py = Y(0);
          for (let i = 1; i < n; i++) { if (t < at[i] - .45) break; const k = EZ.inout(pr(t, at[i] - .45, at[i])); const qx = lerp(X(i - 1), X(i), k), qy = lerp(Y(i - 1), Y(i), k); Pt.beam(c, px, py, qx, qy, T().a, lit * a, { w: 2.5 }); px = qx; py = qy; }
          at.forEach((c0, i) => Pt.ball(c, X(i), Y(i), 22, t >= c0 ? (i === n - 1 ? T().w : T().a) : '90,100,120', (t >= c0 ? 1 : .35) * a, { halo: 2.4 }));
          Pt.ball(c, o.x, o.y, 30, '220,240,255', lit * a, { halo: 4 });
        },
        fg(c, t) { at.forEach((c0, i) => T().paint.burst(c, t, c0, X(i), Y(i), { n: 22, col: i === n - 1 ? T().w : T().a, sp: 420, life: .7, seed: i })); },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- bars：数据条 ----------
     rows    横条，从左向右增长（默认）
     columns 竖柱，从下往上增长，数值在柱顶
     rank    横条按数值排序后依次出现，最大的一条高亮 */
  MK.control('bars', {
    variants: ['rows', 'columns', 'rank'],
    build(slot, p, ctx) {
      const { area } = ctx, n = p.items.length, v = ctx.variant;
      const items = v === 'rank' ? [...p.items].sort((a, b) => b.value - a.value) : p.items;
      const max = p.max ?? Math.max(...items.map(i => i.value)) * 1.08;
      const gw = area.w * .84, gh = area.h * .8;
      const g = box(el('div', 'mk-glass mk-bars' + (v === 'columns' ? ' cols' : ''), ctx.root, `<div class="gh"><span>${esc(p.title)}</span><span>${esc(p.unit || '')}</span></div>`), area.x + area.w * .08, area.y + area.h * .08, gw, gh);
      const inner = box(el('div', 'mk-abs', g), 44, 110, gw - 88, gh - 150);
      const dec = items.some(i => !Number.isInteger(i.value)) ? 1 : 0;
      const fmt = x => x.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + esc(p.unit || '');
      let bars;
      if (v === 'columns') {
        const cw = (gw - 88) / n, ih = gh - 150;
        bars = items.map((it, i) => {
          const b = box(el('div', 'colbar', inner), i * cw + cw * .18, 0, cw * .64, ih);
          const val = el('div', 'cv', b, '0'), fill = el('div', 'cf', b), lab = el('div', 'cl', b, esc(it.label));
          return { b, v: val, f: fill, it, lab, fh: ih - 64 - 56 };
        });
      } else {
        const gap = Math.min(140, (gh - 130) / n);
        bars = items.map((it, i) => {
          const b = box(el('div', 'bar' + (v === 'rank' && i === 0 ? ' top' : ''), inner), 0, i * gap, gw - 88);
          const bl = el('div', 'bl', b, `<span>${v === 'rank' ? `<i class="rk">${i + 1}</i>` : ''}${esc(it.label)}</span><b>0</b>`);
          const tr = el('div', 'track', b), f = el('div', 'fill', tr);
          return { b, v: bl.querySelector('b'), f, it };
        });
      }
      const auto = spread(n, slot.t0 + .7, Math.min(slot.t1 - 1.5, slot.t0 + .7 + (n - 1) * .5));
      const at = items.map((_, i) => slot.cues[i] ?? auto[i]);
      S(slot.t0, 'swoosh', .5); at.forEach(c => S(c, 'fill', .3, 0, { d: 1 }));
      if (v === 'rank') S(at[0] + 1.1, 'shine', .4);
      return {
        update(t) {
          const out = leave(t, slot);
          enter(g, t, slot.t0, 'rise', { out: slot.t1 - .35 });
          bars.forEach(({ b, v: val, f, it }, i) => {
            const k = EZ.out(pr(t, at[i], at[i] + 1.1)), frac = k * it.value / max;
            if (v === 'columns') { const fh = bars[i].fh; set(b, { o: pr(t, at[i] - .2, at[i]) }); f.style.height = (frac * fh).toFixed(1) + 'px'; val.style.bottom = (64 + frac * fh + 10).toFixed(1) + 'px'; html(val, fmt(k * it.value)); }
            else { enter(b, t, at[i] - .15, v === 'rank' ? 'slide-l' : 'rise', { dist: v === 'rank' ? 60 : 14 }); f.style.width = (frac * 100).toFixed(2) + '%'; html(val, fmt(k * it.value)); }
            if (v === 'rank' && i === 0) b.classList.toggle('lit', t >= at[0] + 1.1);
          });
          set(g, { o: 1 - out });
        },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- media：录屏 / 图片窗 ----------
     横屏：窗口居中，标注圈 + 胶囊贴在画面上
     竖屏：窗口占满宽度，标注编号圈在画面上、说明排成列表放在窗口下方
     tilt   透视转入，轻微摆动（默认）
     zoom   正面放大入场，标注时镜头推近该处
     scan   扫描线从上到下刷出画面 */
  MK.control('media', {
    variants: ['tilt', 'zoom', 'scan'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait;
      const cl = p.callouts || [];
      const TB = 44;
      let w, h, x, y;
      if (P) { w = area.w; h = Math.min(w * 9 / 16, area.h * .5); x = area.x; y = area.y + area.h * .06; }
      else { w = Math.min(area.w * .9, (area.h - 80) * 16 / 9); h = w * 9 / 16; x = area.x + (area.w - w) / 2; y = area.y + (area.h - h - TB) / 2; }
      const win = box(el('div', 'mk-win', ctx.root, `<div class="tb"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span style="margin-left:12px">${esc(p.title || '')}</span></div><div class="body" style="height:${h}px"></div>`), x, y, w);
      const body = win.querySelector('.body');
      let im = null;
      if (p.src) im = el('img', '', body); else el('div', 'ph', body, '你的录屏 / 截图');
      const scanBar = v === 'scan' ? el('div', 'mk-abs', body) : null;
      if (scanBar) scanBar.style.cssText += `left:0;width:${w}px;height:6px;background:linear-gradient(90deg,transparent,var(--a),transparent);box-shadow:0 0 24px var(--a)`;
      const marks = cl.map((c, i) => {
        const ring = box(el('div', 'mk-abs', ctx.root), x + c.x * w - 40, y + TB + c.y * h - 40, 80, 80);
        ring.style.cssText += `border:2px solid var(--w);border-radius:50%;box-shadow:0 0 22px rgba(${T().w},.6);display:flex;align-items:center;justify-content:center;font:700 30px var(--fm);color:var(--w)`;
        if (P) ring.textContent = String(i + 1);
        const chip = el('div', 'mk-chip mk-abs', ctx.root, P ? `<i style="background:var(--w);box-shadow:0 0 10px var(--w)"></i><b style="color:var(--w);font-weight:700;margin-right:6px">${i + 1}</b>${esc(c.text)}` : `<i style="background:var(--w);box-shadow:0 0 10px var(--w)"></i>${esc(c.text)}`);
        if (P) { chip.style.fontSize = '40px'; chip.style.padding = '14px 26px'; }
        return { ring, chip, cl: c };
      });
      ctx.measure(() => marks.forEach(m => { m.w = m.chip.getBoundingClientRect().width; }));
      const c0 = slot.cues[0] ?? slot.t0 + .1;
      const auto = spread(marks.length, c0 + 1, Math.min(slot.t1 - 1, c0 + 1 + (marks.length - 1) * 1.2));
      const at = marks.map((_, i) => slot.cues[i + 1] ?? auto[i]);
      if (v === 'scan') { S(c0, 'glitch', .3); S(c0 + .1, 'fill', .25, 0, { d: .7 }); } else { S(c0, 'whoosh', .6); S(c0 + .35, 'card', .5); }
      at.forEach(c => S(c, 'marker', .55));
      ctx.media(im, p, slot);
      /* zoom：当前标注处推近（1.12 倍），没有标注时保持原样 */
      const focus = t => { let f = null; marks.forEach((m, i) => { if (t >= at[i]) f = m.cl; }); return f; };
      return {
        update(t) {
          const a = pr(t, c0, c0 + .85), out = leave(t, slot);
          const inner = win.firstElementChild.nextElementSibling;
          if (v === 'zoom') {
            set(win, { s: .7 + .3 * EZ.out5(a), o: clamp(a * 4) * (1 - out) });
            const f = focus(t), zk = f ? EZ.inout(pr(t, at[cl.indexOf(f)], at[cl.indexOf(f)] + .6)) : 0;
            const ox = f ? (.5 - f.x) * w * .12 : 0, oy = f ? (.5 - f.y) * h * .12 : 0;
            if (im) { im.style.transformOrigin = '50% 50%'; im.style.transform = `translate(${(ox * zk).toFixed(1)}px,${(oy * zk).toFixed(1)}px) scale(${(1 + .12 * zk).toFixed(4)})`; }
            inner.style.transform = '';
          } else if (v === 'scan') {
            set(win, { o: clamp(a * 4) * (1 - out) });
            const s = EZ.inout(pr(t, c0 + .1, c0 + .8));
            inner.style.clipPath = `inset(0 0 ${((1 - s) * 100).toFixed(2)}% 0)`;
            set(scanBar, { y: s * h - 3, o: s > 0 && s < 1 ? 1 : 0 });
          } else {
            set(win, { s: .88 + .12 * EZ.spring(a), o: clamp(a * 4) * (1 - out), y: (1 - EZ.expo(a)) * 50 });
            inner.style.transform = `perspective(1800px) rotateY(${((1 - EZ.out5(a)) * 18 + Math.sin(t * .4) * 1.2).toFixed(2)}deg)`;
          }
          ctx.mediaFrame(im, t);
          marks.forEach(({ ring, chip, cl: c, w: cw }, i) => {
            const k = pr(t, at[i], at[i] + .35), o = clamp(k * 4) * (1 - out);
            set(ring, { s: 1.4 - .4 * EZ.out5(k), o });
            if (P) set(chip, { x: area.x, y: y + TB + h + 50 + i * 96 + (1 - EZ.expo(k)) * 20, o });
            else { const left = c.x > .6; set(chip, { x: x + c.x * w + (left ? -60 - (cw || 0) : 60), y: y + TB + c.y * h - 20, o }); }
          });
        },
        hint: { cx: x + w / 2, cy: y + h / 2 },
      };
    },
  });

  /* ---------- fusion：A × B → C ----------
     orbs    两颗光球牵引合成（默认）
     orbit   两颗球绕中心旋转收拢
     collide 两颗球从两侧高速相撞 */
  MK.control('fusion', {
    variants: ['orbs', 'orbit', 'collide'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant;
      const cx = area.x + area.w / 2, cy = area.y + area.h * (ctx.portrait ? .5 : .62);
      const line = p.line ? box(el('div', 'mk-title mk-abs', ctx.root, rich(p.line)), area.x, area.y - 20, area.w) : null;
      if (line) { line.style.fontSize = '88px'; line.style.textAlign = 'center'; }
      const chip = (s, col) => el('div', 'mk-chip mk-abs', ctx.root, `<i style="background:${col};box-shadow:0 0 10px ${col}"></i>${esc(s)}`);
      const ca = chip(p.a, 'var(--a)'), cb = chip(p.b, 'var(--w)'), cr = chip(p.result, 'var(--ok)');
      cr.style.borderColor = 'rgba(var(--ok-rgb),.5)';
      ctx.measure(() => { if (line) fit(line, 92, 48, area.w, null); [ca, cb, cr].forEach(e => { e._w = e.getBoundingClientRect().width; }); });
      const c0 = slot.cues[0] ?? slot.t0 + .3, F = slot.cues[1] ?? Math.min(slot.t1 - 1.6, c0 + 2);
      const sep = Math.min(area.w * .2, 200);
      const O = t => {
        if (v === 'orbit') { const k = EZ.in(pr(t, c0, F)), r = sep * (1 - k), an = (t - c0) * (1.2 + 6 * k); return { x1: cx + Math.cos(an) * r, y1: cy + Math.sin(an) * r * .45, x2: cx - Math.cos(an) * r, y2: cy - Math.sin(an) * r * .45, m: k }; }
        if (v === 'collide') { const k = EZ.in(pr(t, F - .45, F)), far = area.w * .42; return { x1: lerp(cx - far, cx - 5, k), y1: cy, x2: lerp(cx + far, cx + 5, k), y2: cy + 10, m: k }; }
        const m = EZ.inout(pr(t, F - .9, F)); return { x1: lerp(cx - sep, cx - 5, m), y1: cy + Math.sin(t * 1.3) * 7, x2: lerp(cx + sep, cx + 5, m), y2: cy + 16 + Math.cos(t * 1.1) * 7, m };
      };
      S(c0, 'pop', .5, -.2); S(c0 + .2, 'pop', .5, .2);
      if (v === 'collide') { S(F - .45, 'whoosh', .7); S(F, 'crash', .8); S(F, 'drop', .6); flash(F, .5); shake(F, 20, .55); }
      else if (v === 'orbit') { S(c0 + .3, 'hum', .3, 0, { d: F - c0 }); S(F, 'crash', .7); S(F, 'drop', .55); flash(F, .35); shake(F, 12, .5); }
      else { S(F - 1.05, 'riser', .45, 0, { d: 1.05 }); S(F, 'crash', .7); S(F, 'drop', .55); flash(F, .35); shake(F, 14, .5); }
      S(F + .1, 'check', .65);
      return {
        update(t) {
          const o = O(t), chipOut = v === 'orbit' ? c0 + .9 : F - .1;
          if (line) enter(line, t, slot.t0 + .05, 'rise', { out: slot.t1 - .35 });
          enter(ca, t, c0, 'pop', { x: (v === 'orbit' ? cx - sep : o.x1) - (ca._w || 0) / 2, y: (v === 'orbit' ? cy : o.y1) - 150, out: chipOut });
          enter(cb, t, c0 + .2, 'pop', { x: (v === 'orbit' ? cx + sep : o.x2) - (cb._w || 0) / 2, y: (v === 'orbit' ? cy : o.y2) - 140, out: chipOut });
          enter(cr, t, F + .1, 'pop', { x: cx - (cr._w || 0) / 2, y: cy - 262 + Math.sin((t - F) * 1.6) * 4, out: slot.t1 - .35 });
        },
        bg(c, t) {
          const Pt = T().paint, o = O(t), after = pr(t, F, F + .25), fade = 1 - leave(t, slot), pulse = t > F + .25 ? Math.sin((t - F) * 2.2) * 4 : 0;
          Pt.ball(c, o.x1, o.y1, (90 + after * 28 + pulse) * EZ.spring(pr(t, c0 - .1, c0 + .5)), after > 0 ? T().aLite : T().a, fade, { lat: t * .6 });
          Pt.ball(c, o.x2, o.y2, 76 * (1 - after) * EZ.spring(pr(t, c0 + .1, c0 + .7)), T().w, (1 - after * .9) * fade, { lat: -t * .5 });
          if (v === 'orbs' && o.m > 0 && o.m < 1) Pt.beam(c, o.x1, o.y1, o.x2, o.y2, T().w, o.m);
          if (v === 'orbit' && t < F) { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(${T().a},${.25 * fade})`; c.lineWidth = 1.5; c.beginPath(); c.ellipse(cx, cy, sep * (1 - o.m) + 4, (sep * (1 - o.m) + 4) * .45, 0, 0, 7); c.stroke(); c.restore(); }
          if (v === 'collide' && o.m > 0 && o.m < 1) { Pt.beam(c, o.x1 - 160 * o.m, o.y1, o.x1, o.y1, T().a, .7 * o.m, { w: 8 }); Pt.beam(c, o.x2 + 160 * o.m, o.y2, o.x2, o.y2, T().w, .7 * o.m, { w: 8 }); }
          Pt.arcRing(c, cx, cy + 40, 250, Math.PI * 1.08, Math.PI * (1.08 + .84 * EZ.out(pr(t, slot.t0, slot.t0 + 1.3))), T().w, .7 * fade);
        },
        fg(c, t) { T().paint.burst(c, t, F, cx, cy, { n: v === 'collide' ? 90 : 60, col: T().aLite, sp: v === 'collide' ? 1400 : 900 }); },
        hint: { cx, cy, floorY: cy + 110, floorCx: cx },
      };
    },
  });
})();
