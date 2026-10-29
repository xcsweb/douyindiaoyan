/* motion-kit · 观点讲解类控件（0.3.0）：iconcards / qa / myth / prosCons / definition / tip / checklist / vs
   讲观点最常用的卡片：图标要点、问答揭晓、误区与真相、优缺点、名词解释、小贴士、逐项打勾、两方对决。
   iconcards  row 并排竖卡翻起 / grid 2×2 横卡左右翻开 / stack 卡组发牌展开
   qa         reveal 遮挡板对开 / flip 卡片翻面 / chat 问号气泡 → 灯泡
   myth       cross 打叉划掉 / shatter 卡片碎裂 / swap 开关拨动 + 逐字翻牌
   prosCons   columns 中线两栏 + 拔河条 / scale 天平倾斜 / cards 两张卡、胜方前推
   definition dictionary 词典条目 / wiki 搜索后展开百科卡 / sticky 便签贴上手写
   tip        banner 横幅 / card 图标徽章落下 / bubble 角色气泡打字
   checklist  todo 待办 + 计数 / clipboard 写字板手绘勾 / progress 进度环同步
   vs         fight 格斗游戏式 / scale 拔河比例条 / cards 对战卡牌
   约定见 AUTHORING.md：只由 t 求值，音效在 build 里登记，颜色只取主题。 */
(function () {
  'use strict';
  const { clamp, lerp, pr, EZ, el, box, set, tf, fit, html, rich, esc, S, flash, shake, punch, idle, split, stagger, svg, draw, rnd } = MK;
  const T = () => MK.T;
  const leave = (t, slot) => pr(t, slot.t1 - .35, slot.t1);
  /* cue 缺省：n 个节拍在本段可用时间里均匀错开，单步最长 gap 秒 */
  const beats = (slot, n, start = .25, gap = .9, reserve = 1.4) => stagger(n, slot.t0 + start, Math.min(gap, Math.max(.25, (slot.t1 - slot.t0 - start - reserve) / Math.max(1, n - 1))), slot.cues);
  /* 主题色名 → 画布 rgb；DOM 上用 --k / --k-rgb 指向同一主题变量 */
  const RGB = k => ({ a: T().a, a2: T().a2, ok: T().g, bad: T().r, w: T().w })[k];
  const tone = (e, k) => { e.style.setProperty('--k', `var(--${k})`); e.style.setProperty('--k-rgb', `var(--${k}-rgb)`); return e; };

  /* 图标：插入 MK.icon，记下可描线的笔画；resize 改尺寸；drawIcon 按 k 依次描出 */
  const ico = (parent, name, size = 48, sw = 2, cls = 'ic') => { const d = el('div', cls, parent, MK.icon(name, size, sw)); d._parts = [...d.querySelectorAll('path,circle,line,rect,ellipse,polyline,polygon')]; return d; };
  const resize = (d, s) => { const v = d.querySelector('svg'); v.setAttribute('width', Math.round(s)); v.setAttribute('height', Math.round(s)); };
  const drawIcon = (d, k) => {
    const ps = d._parts, n = ps.length, span = 1 / (1 + .5 * (n - 1));
    ps.forEach((p, i) => { const q = clamp((k - i * .5 * span) / span); draw(p, q); p.style.opacity = q > .001 ? '1' : '0'; });
  };
  /* 停留第二拍：从 t0 起每 per 秒轮到下一个，返回第 i 个的钟形强度 0..1 */
  const turn = (t, t0, i, n, per = 1.3) => { if (t < t0 || n < 1) return 0; const u = (t - t0) / per; return Math.floor(u) % n === i ? Math.sin(Math.PI * (u % 1)) : 0; };
  const phase = (t, t0, per) => { const u = Math.max(0, t - t0) / per; return u - Math.floor(u); };
  /* 标题区：kicker + title；lay 返回占用高度 */
  const head = (wrap, p, w, align = 'left') => {
    const kick = p.kicker ? el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)) : null;
    const ttl = p.title ? el('div', 'mk-cpt-t mk-abs', wrap, rich(p.title)) : null;
    [kick, ttl].forEach(e => { if (e) { box(e, 0, 0, w); e.style.textAlign = align; } });
    return {
      lay(max = 58) { let y = 0; if (kick) { kick.style.top = '0px'; y += 46; } if (ttl) { fit(ttl, max, 30, w, null); ttl.style.top = y + 'px'; y += ttl.offsetHeight + 22; } return y; },
      update(t, t0) {
        if (kick) set(kick, { o: pr(t, t0, t0 + .4), y: (1 - EZ.expo(pr(t, t0, t0 + .5))) * 14 });
        if (ttl) { const k = pr(t, t0 + .06, t0 + .6); tf(ttl, { o: clamp(k * 3), y: (1 - EZ.expo(k)) * 26, blur: (1 - EZ.out(k)) * 8 }); ttl.style.clipPath = k < 1 ? `inset(-20% ${((1 - EZ.out(k)) * 100).toFixed(1)}% -20% 0)` : ''; }
      },
    };
  };
  /* 按标点分短语，逐段由模糊变清晰 */
  const phraseEls = (e, s) => { e.innerHTML = MK.phrases(s).map(x => `<span class="ph">${rich(x)}</span>`).join(''); return [...e.querySelectorAll('.ph')]; };
  const phraseIn = (els, t, t0, d = .7) => els.forEach((e, i) => { const a = t0 + d * i / Math.max(1, els.length), k = pr(t, a, a + .4); e.style.opacity = clamp(k * 2).toFixed(3); e.style.filter = k < 1 ? `blur(${((1 - EZ.out(k)) * 8).toFixed(1)}px)` : ''; });
  /* 文字每一行的矩形（相对 ref），用于划线 */
  const lineRects = (e, ref) => {
    const rr = ref.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(e);
    const lines = [];
    for (const q of rg.getClientRects()) {
      const r = { x: q.left - rr.left, y: q.top - rr.top, w: q.width, h: q.height };
      if (r.w < 1) continue;
      const L = lines.find(l => Math.abs(l.y + l.h / 2 - (r.y + r.h / 2)) < Math.max(l.h, r.h) * .4);
      if (L) { const x1 = Math.max(L.x + L.w, r.x + r.w), y1 = Math.max(L.y + L.h, r.y + r.h); L.x = Math.min(L.x, r.x); L.y = Math.min(L.y, r.y); L.w = x1 - L.x; L.h = y1 - L.y; } else lines.push(r);
    }
    return lines;
  };
  /* 手绘线：两点之间带轻微弯曲和抖动 */
  const hand = (x0, y0, x1, y1, seed, bend = .06) => {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, L = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / (L || 1), ny = (x1 - x0) / (L || 1), b = (rnd(seed, 91) - .5) * 2 * bend * L;
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} Q${(mx + nx * b).toFixed(1)} ${(my + ny * b).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const shine = (e, t, t0, per = 3.2) => e.style.setProperty('--sh', `${t < t0 ? 130 : lerp(130, -30, EZ.inout(clamp(phase(t, t0, per) * 2.2))).toFixed(1)}%`);
  const initial = s => [...String(s).replace(/\*/g, '')][0] || '?';

  /* ---------- iconcards：图标要点卡 ----------
     row   竖卡并排（竖屏为整行横卡），以底边为轴翻起
     grid  2×2 横卡（竖屏为竖卡），左右交替绕竖轴翻开
     stack 卡组从中间发牌，背面朝上飞出途中翻面，横屏呈扇形，竖屏左右错落
     图标描线绘出；全部出现后轮流浮起高亮 + 扫光 */
  MK.control('iconcards', {
    variants: ['row', 'grid', 'stack'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, its = p.items, n = its.length;
      const balanced = MotionNarrationCards.enabled();
      const wrap = box(el('div', 'mk-abs mk-icc' + (balanced ? ' balanced' : ''), ctx.root), area.x, area.y, area.w, area.h);
      const header = balanced ? box(el('div', 'mk-abs', wrap), 0, 0, area.w) : wrap;
      const hd = head(header, p, area.w, balanced ? 'center' : v === 'row' ? 'left' : 'center');
      const horiz = balanced ? MotionNarrationCards.horizontal(P, v, n, area) : v === 'grid' ? !P : P;
      const cards = its.map((it, i) => {
        const cd = el('div', `cd mk-abs ${horiz ? 'h' : 'v'}`, wrap);
        const ic = ico(cd, it.icon, 48, 1.8), tx = el('div', 'tx', cd);
        const tt = el('div', 'tt', tx, rich(it.title)), ds = it.text ? el('div', 'ds', tx, rich(it.text)) : null;
        const nb = el('i', 'nb', cd, String(i + 1).padStart(2, '0'));
        const bk = v === 'stack' ? el('div', 'bk', cd, MK.icon('sparkle', 64, 1.5)) : null;
        cd.style.transformOrigin = v === 'row' ? '50% 100%' : '50% 50%';
        return { cd, ic, tt, ds, nb, bk, r: { x: 0, y: 0, w: 1, h: 1, rot: 0 }, ix: 0, iy: 0 };
      });
      ctx.measure(() => {
        const top = hd.lay(P ? 62 : 56), av = area.h - top, gap = P ? 22 : 26;
        let rs;
        if (balanced) {
          const composition = MotionNarrationCards.layout(area, P, v, its, top);
          header.style.top = composition.headerY + 'px';
          rs = composition.rects;
        } else if (v === 'grid') {
          const nr = Math.ceil(n / 2), w = (area.w - gap) / 2, h = Math.min(P ? 330 : 250, (av - gap * (nr - 1)) / nr), y0 = top + (av - nr * h - (nr - 1) * gap) / 2;
          rs = its.map((_, i) => { const r = Math.floor(i / 2), k = Math.min(2, n - r * 2), x0 = (area.w - k * w - (k - 1) * gap) / 2; return { x: x0 + (i % 2) * (w + gap), y: y0 + r * (h + gap), w, h, rot: 0 }; });
        } else if (horiz) {
          const w = v === 'stack' ? area.w * .86 : area.w, h = Math.min(168, (av - gap * (n - 1)) / n), y0 = top + (av - n * h - (n - 1) * gap) / 2;
          rs = its.map((_, i) => ({ x: v === 'stack' && i % 2 ? area.w - w : 0, y: y0 + i * (h + gap), w, h, rot: v === 'stack' ? (i % 2 ? 2 : -2) : 0 }));
        } else {
          const w0 = Math.min(420, (area.w - gap * (n - 1)) / n), w = w0 * (v === 'stack' ? .92 : 1), h = Math.min(av - (v === 'stack' ? 46 : 8), Math.max(340, w * 1.2), 460);
          const x0 = (area.w - (n * w0 + (n - 1) * gap)) / 2 + (w0 - w) / 2;
          rs = its.map((_, i) => { const u = n > 1 ? i / (n - 1) * 2 - 1 : 0; return { x: x0 + i * (w0 + gap), y: top + (av - h) / 2 + (v === 'stack' ? u * u * 24 - 6 : 0), w, h, rot: v === 'stack' ? u * 6 : 0 }; });
        }
        cards.forEach((c, i) => {
          const r = c.r = rs[i]; box(c.cd, r.x, r.y, r.w, r.h);
          const D = Math.round(horiz ? Math.min(r.h * .6, 104) : Math.min(r.w * .4, r.h * .3, 116));
          Object.assign(c.ic.style, { width: D + 'px', height: D + 'px' }); resize(c.ic, D * .5);
          const tw = balanced ? (horiz ? r.w - D - 100 : r.w - 56) : horiz ? r.w - D - 26 * 3 - 24 : r.w - 44;
          fit(c.tt, horiz ? 44 : 42, 22, tw, balanced ? Math.min(106, r.h * .32) : null);
          if (c.ds) fit(c.ds, 30, 17, tw, horiz ? r.h - (balanced ? 48 : 30) - c.tt.offsetHeight - 10 : r.h - (balanced ? 60 : 52) - D - (balanced ? 22 : 18) - c.tt.offsetHeight - 10);
          c.ix = r.x + c.ic.offsetLeft + D / 2; c.iy = r.y + c.ic.offsetTop + D / 2;
        });
      });
      const at = beats(slot, n, v === 'stack' ? .6 : .35, v === 'stack' ? .5 : .55, 1.6), allIn = at[n - 1] + 1, PER = 1.25;
      const focus = (t, i) => MotionNarrationCue.focus(slot, at, t, i, () => turn(t, allIn, i, n, PER));
      S(slot.t0, v === 'stack' ? 'swoosh' : 'whoosh', .4);
      at.forEach((c, i) => { const pan = n > 1 ? i / (n - 1) - .5 : 0; S(c, v === 'grid' ? 'swipe' : 'card', .55, pan); S(c + .2, 'pop', .35, pan); });
      S(allIn - .25, 'shine', .3);
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, y: -EZ.in(out) * 16 });
          hd.update(t, slot.t0);
          cards.forEach((c, i) => {
            const a = at[i], r = c.r, lift = focus(t, i), k = pr(t, a - .05, a + .6);
            let o = clamp(k * 4), x = 0, y = 0, s = 1, rot = r.rot, rx = 0, ry = 0;
            if (v === 'stack') {
              /* 卡组：未发出时叠在中间，背面朝上；发牌时沿弧线飞到位并翻面 */
              const m = EZ.out5(k), fl = EZ.inout(pr(t, a + .02, a + .48)), e = EZ.back(pr(t, slot.t0, slot.t0 + .5));
              const dx = area.w / 2 - r.x - r.w / 2 + (rnd(i, 3) - .5) * 16, dy = area.h * (P ? .6 : .58) - r.y - r.h / 2 - i * 4;
              x = lerp(dx, 0, m); y = lerp(dy + (1 - e) * 260, 0, m) - Math.sin(Math.PI * k) * 80;
              rot = lerp((rnd(i, 4) - .5) * 12, r.rot, m); ry = 180 * (1 - fl); s = lerp(.82, 1, m) * (1 + Math.sin(Math.PI * k) * .08);
              o = clamp(pr(t, slot.t0, slot.t0 + .25) * 4);
              c.bk.style.opacity = ry > 90 ? '1' : '0';
              c.cd.style.zIndex = String(k > 0 && k < 1 ? 20 : n - i);
            } else if (v === 'grid') { ry = (1 - EZ.spring(k)) * (i % 2 ? -88 : 88); s = .86 + .14 * EZ.back(k); }
            else { rx = (1 - EZ.spring(k)) * 78; y = (1 - EZ.out5(k)) * 70; }
            tf(c.cd, { p: 1400, x, y: y - lift * 18, r: rot, rx, ry, s: s * (1 + lift * .035), o });
            c.cd.classList.toggle('on', lift > .3);
            c.cd.style.setProperty('--sh', `${lift > 0 ? lerp(130, -30, phase(t, allIn, PER)).toFixed(1) : 130}%`);
            const ki = pr(t, a + .12, a + .6);
            tf(c.ic, { s: (.4 + .6 * EZ.spring(ki)) * (1 + lift * .08), o: clamp(ki * 4), r: (1 - EZ.out(ki)) * -40 });
            drawIcon(c.ic, EZ.out(pr(t, a + .2, a + .9)));
            const kt = pr(t, a + .24, a + .64); tf(c.tt, { o: clamp(kt * 3), y: (1 - EZ.expo(kt)) * 20 });
            tf(c.nb, { o: clamp(kt * 2) });
            if (c.ds) { const kd = pr(t, a + .34, a + .8); tf(c.ds, { o: clamp(kd * 2), y: (1 - EZ.expo(kd)) * 14, blur: (1 - EZ.out(kd)) * 6 }); }
          });
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          cards.forEach((cd, i) => { const r = cd.r; MK.fx.glow(c, area.x + r.x + r.w / 2, area.y + r.y + r.h / 2, Math.max(r.w, r.h) * .75, T().a, a * (.22 * pr(t, at[i], at[i] + .5) + .55 * focus(t, i))); });
        },
        fg(c, t) { cards.forEach((cd, i) => T().paint.burst(c, t, at[i] + .22, area.x + cd.ix, area.y + cd.iy, { n: 14, sp: 380, life: .6, seed: i })); },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- qa：问答 ----------
     reveal 问题先出，答案被条纹遮挡板盖住，倒计时条走满后挡板对开
     flip   一张大卡，正面问题；蓄力后翻面，背面是答案
     chat   提问气泡 → 对方「思考中」→ 问号翻成灯泡点亮，答案气泡弹出
     第一个 cue 问题出现，第二个 cue 答案揭晓 */
  MK.control('qa', {
    variants: ['reveal', 'flip', 'chat'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait;
      const wrap = box(el('div', 'mk-abs mk-qa ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const c1 = slot.cues[0] ?? slot.t0 + .25, c2 = slot.cues[1] ?? Math.max(c1 + .9, Math.min(slot.t1 - 1.6, c1 + 1.9));
      const kick = p.kicker ? box(el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)), 0, 0, area.w) : null;
      if (kick && v !== 'reveal') kick.style.textAlign = 'center';
      const top = kick ? 52 : 0;
      let U = () => {}, BG = () => {}, FG = () => {}, focus = { x: area.w / 2, y: area.h / 2 };
      if (v === 'reveal') {
        const qr = el('div', 'qr mk-abs', wrap), qb = el('div', 'bd q', qr, 'Q'), qt = el('div', 'qt', qr, rich(p.question));
        const pn = el('div', 'pn mk-glass', wrap), ab = el('div', 'bd a', pn, 'A'), at_ = el('div', 'at', pn, rich(p.answer));
        const cv = [el('div', 'cv l', pn), el('div', 'cv r', pn)], qm = el('div', 'qm', pn, '?'), bar = el('i', 'bar', pn);
        let pw = area.w, ph = 200;
        ctx.measure(() => {
          fit(qt, P ? 62 : 58, 30, area.w - 100, area.h * .3);
          fit(at_, P ? 54 : 50, 26, area.w - 100 - 80, area.h * .36);
          const qh = Math.max(72, qt.offsetHeight); ph = Math.max(at_.offsetHeight + 84, P ? 230 : 200);
          const total = qh + 40 + ph, y0 = top + Math.max(0, area.h - top - total) * (P ? .4 : .5);
          box(qr, 0, y0, area.w, qh); box(pn, 0, y0 + qh + 40, pw, ph);
          const fs = Math.min(130, ph * .62); qm.style.fontSize = fs + 'px'; box(qm, 0, (ph - fs) / 2, pw);
          focus = { x: pw / 2, y: y0 + qh + 40 + ph / 2 };
        });
        S(c1 - .1, 'pop', .5); S(c1, 'swoosh', .4); S(c1 + .3, 'card', .45);
        if (c2 - c1 > 1.3) S(c1 + .75, 'drumroll', .25, 0, { d: c2 - c1 - .8 });
        S(c2 - .02, 'whoosh', .55); S(c2 + .05, 'ding', .55, 0, { m: 93 }); S(c2 + .25, 'shine', .35);
        flash(c2 + .05, .25); punch(c2 + .05, .03);
        U = t => {
          const kq = pr(t, c1 - .1, c1 + .5); tf(qb, { s: .3 + .7 * EZ.spring(kq), r: (1 - EZ.out(kq)) * -120, o: clamp(kq * 4) });
          const kt = pr(t, c1, c1 + .6); tf(qt, { o: clamp(kt * 3), x: (1 - EZ.expo(kt)) * 40, blur: (1 - EZ.out(kt)) * 8 }); qt.style.clipPath = kt < 1 ? `inset(-20% ${((1 - EZ.out(kt)) * 100).toFixed(1)}% -20% 0)` : '';
          const kp = pr(t, c1 + .3, c1 + .8); tf(pn, { o: clamp(kp * 3), sy: .2 + .8 * EZ.back(kp), y: (1 - EZ.expo(kp)) * 30 });
          const kr = pr(t, c2, c2 + .5), dx = EZ.out5(kr) * pw * .56, jit = t < c2 ? Math.sin(t * 95) * 3 * pr(t, c2 - .45, c2) : 0;
          tf(cv[0], { x: -dx + jit, r: -EZ.out(kr) * 6, o: 1 - pr(kr, .55, 1) }); tf(cv[1], { x: dx - jit, r: EZ.out(kr) * 6, o: 1 - pr(kr, .55, 1) });
          tf(qm, { o: clamp(kp * 3) * (1 - clamp(kr * 3)), s: 1 + pr(t, c2 - .45, c2) * .25 + EZ.out(kr) * 1.4, y: kr > 0 ? 0 : Math.sin((t - c1) * 5) * 7, r: Math.sin((t - c1) * 3) * 6 });
          bar.style.width = (EZ.inout(pr(t, c1 + .7, c2)) * 100).toFixed(2) + '%'; bar.style.opacity = (1 - clamp(kr * 4)).toFixed(3);
          const ka = pr(t, c2 + .05, c2 + .55); tf(at_, { o: clamp(ka * 3), s: .85 + .15 * EZ.back(ka), blur: (1 - EZ.out(ka)) * 10 });
          const kb = pr(t, c2 + .1, c2 + .6); tf(ab, { s: .3 + .7 * EZ.spring(kb), o: clamp(kb * 4) });
          pn.classList.toggle('lit', t > c2 + .15); pn.style.setProperty('--gl', (.22 + .14 * idle(t, c2 + .8, 2.6).wave).toFixed(3));
        };
        BG = (c, t, a) => { MK.fx.glow(c, area.x + focus.x, area.y + focus.y, pw * .45, T().w, a * .6 * pr(t, c2, c2 + .5)); MK.fx.ripple(c, t, c2 + .1, area.x + 76, area.y + focus.y, { r: 160, col: T().w }); };
        FG = (c, t) => T().paint.burst(c, t, c2 + .05, area.x + focus.x, area.y + focus.y, { n: 40, sp: 900, col: T().w });
      } else if (v === 'flip') {
        const card = el('div', 'fc mk-abs', wrap);
        const faces = [['fr', 'Q', 'QUESTION', p.question], ['bk', 'A', 'ANSWER', p.answer]].map(([c, w, l, s]) => {
          const f = el('div', 'fa mk-glass ' + c, card); el('b', 'wm', f, w); el('span', 'lb', f, l); const tx = el('div', 'tx', f, rich(s)); return { f, tx };
        });
        let cw = 900, ch = 400;
        ctx.measure(() => {
          cw = P ? area.w : Math.min(area.w, 940);
          const hs = faces.map(({ tx }) => { fit(tx, P ? 60 : 56, 28, cw - 150, (P ? area.h * .66 : area.h * .64) - top - 60); return tx.offsetHeight; });
          ch = Math.min(area.h - top - 10, Math.max(P ? 440 : 380, Math.max(...hs) + 200));
          box(card, (area.w - cw) / 2, top + (area.h - top - ch) / 2, cw, ch); card.style.height = ch + 'px';
          faces.forEach(({ f }) => { f.style.inset = '0'; });
          focus = { x: area.w / 2, y: top + (area.h - top) / 2 };
        });
        S(c1 - .1, 'card', .55); S(c1 + .2, 'thud', .45);
        S(c2 - .32, 'swoosh', .35); S(c2 + .08, 'whip', .6); S(c2 + .45, 'ding', .5, 0, { m: 91 }); S(c2 + .6, 'shine', .3);
        flash(c2 + .32, .2); punch(c2 + .4, .03);
        U = t => {
          const ke = pr(t, c1 - .12, c1 + .55);
          tf(card, { p: 1400, o: clamp(ke * 4), y: (1 - EZ.out5(ke)) * -90, rx: (1 - EZ.spring(ke)) * -40, s: .9 + .1 * EZ.back(ke) });
          const wind = EZ.inout(pr(t, c2 - .35, c2)), kf = pr(t, c2, c2 + .75), lift = Math.sin(Math.PI * kf);
          const A = kf > 0 ? lerp(-16, 180, EZ.back(kf)) : -16 * wind;
          const sway = Math.sin((t - c2 - .9) * 1.3) * 5 * pr(t, c2 + .9, c2 + 1.6);
          const sc = (1 - .04 * wind * (kf > 0 ? 1 - kf : 1)) * (1 + .06 * lift);
          tf(faces[0].f, { p: 1800, ry: A + sway, s: sc, y: -lift * 30 }); tf(faces[1].f, { p: 1800, ry: A - 180 + sway, s: sc, y: -lift * 30 });
          shine(faces[1].f, t, c2 + .7, 3.4);
          faces[1].f.style.setProperty('--gl', (.2 + .14 * idle(t, c2 + .9, 2.8).wave).toFixed(3));
        };
        BG = (c, t, a) => MK.fx.glow(c, area.x + focus.x, area.y + focus.y, cw * .55, T().w, a * .55 * pr(t, c2 + .3, c2 + .8));
        FG = (c, t) => T().paint.burst(c, t, c2 + .35, area.x + focus.x, area.y + focus.y, { n: 44, sp: 1000, col: T().w });
      } else {
        const la = el('div', 'av l mk-abs', wrap), ra = el('div', 'av r mk-abs', wrap);
        const uIc = ico(la, 'user', 48, 1.8), qIc = ico(ra, 'question', 52, 1.8), bIc = ico(ra, 'idea', 52, 1.8);
        const qb = el('div', 'bub q mk-abs', wrap), qtx = el('div', 'tx', qb, rich(p.question));
        const ab = el('div', 'bub a mk-abs', wrap), atx = el('div', 'tx', ab, rich(p.answer));
        const th = el('div', 'bub think mk-abs', wrap, '<i></i><i></i><i></i>'), dots = [...th.children];
        let D = 100, rc = { x: 0, y: 0 };
        ctx.measure(() => {
          D = P ? 108 : 100; const g = 24, mw = area.w - D - g - (P ? 40 : 150);
          [la, ra].forEach(e => Object.assign(e.style, { width: D + 'px', height: D + 'px' })); [uIc, qIc, bIc].forEach(d => resize(d, D * .5));
          const shrink = (b, tx) => { fit(tx, P ? 50 : 46, 26, mw - 68, area.h * .32); const w = tx.offsetWidth; tx.style.width = 'max-content'; if (tx.offsetWidth > w) tx.style.width = w + 'px'; b.style.width = (tx.offsetWidth + 68) + 'px'; return [tx.offsetWidth + 68, tx.offsetHeight + 48]; };
          const [qw, qh] = shrink(qb, qtx), [aw, ah] = shrink(ab, atx);
          const total = qh + 44 + Math.max(ah, D), y0 = top + Math.max(0, area.h - top - total) * (P ? .4 : .5);
          box(la, 0, y0, D); box(qb, D + g, y0, qw, qh);
          const y1 = y0 + qh + 44;
          box(ra, area.w - D, y1, D); box(ab, area.w - D - g - aw, y1, aw, ah); box(th, area.w - D - g - 150, y1, 150, 84);
          rc = { x: area.w - D / 2, y: y1 + D / 2 };
          qb.style.transformOrigin = '0 0'; ab.style.transformOrigin = '100% 0'; th.style.transformOrigin = '100% 0';
          focus = { x: area.w / 2, y: y0 + total / 2 };
        });
        const ct = c1 + Math.min(.75, (c2 - c1) * .45);
        S(c1 - .1, 'pop', .4); S(c1 + .05, 'bubble', .5, -.3, { n: 0 }); S(ct, 'bubble', .4, .3, { n: 3 });
        S(c2 - .02, 'whip', .4, .3); S(c2 + .12, 'ding', .55, .3, { m: 96 }); S(c2 + .2, 'bubble', .5, .3, { n: 6 }); S(c2 + .45, 'shine', .3, .3);
        U = t => {
          const k1 = pr(t, c1 - .12, c1 + .4); tf(la, { s: .3 + .7 * EZ.spring(k1), o: clamp(k1 * 4) }); drawIcon(uIc, EZ.out(pr(t, c1, c1 + .6)));
          const bob = (ph) => Math.sin((t - c2) * 1.8 + ph) * 5 * pr(t, c2 + .8, c2 + 1.5);
          const kb = pr(t, c1 + .05, c1 + .6); tf(qb, { s: lerp(.2, 1, EZ.back(kb)), o: clamp(kb * 4), y: bob(0) });
          const kq = pr(t, c1 + .2, c1 + .6); tf(qtx, { o: clamp(kq * 2), y: (1 - EZ.expo(kq)) * 10 });
          const k2 = pr(t, ct - .1, ct + .35); tf(ra, { s: .3 + .7 * EZ.spring(k2), o: clamp(k2 * 4) });
          const kth = pr(t, ct, ct + .35), kgo = pr(t, c2 - .15, c2 + .05);
          tf(th, { s: lerp(.2, 1, EZ.back(kth)) * (1 - EZ.backIn(kgo) * .9), o: clamp(kth * 4) * (kgo < 1 ? 1 : 0) });
          dots.forEach((d, j) => { const w = Math.max(0, Math.sin((t - ct) * 7 - j * .9)); tf(d, { y: -w * 10, o: .4 + .6 * w }); });
          /* 问号 → 灯泡：问号摇摆思考，cue 时绕竖轴翻成灯泡并点亮 */
          const kf = pr(t, c2 - .05, c2 + .4);
          tf(qIc, { p: 600, ry: 90 * EZ.in(clamp(kf * 2)), o: kf < .5 ? 1 : 0, r: t < c2 ? Math.sin((t - ct) * 4) * 14 : 0 });
          tf(bIc, { p: 600, ry: -90 * (1 - EZ.back(clamp(kf * 2 - 1))), o: kf >= .5 ? 1 : 0, s: 1 + .06 * idle(t, c2 + .6, 1.6).wave * pr(t, c2 + .6, c2 + 1) });
          ra.classList.toggle('lit', kf >= .5);
          const ka = pr(t, c2 + .12, c2 + .7); tf(ab, { s: lerp(.2, 1, EZ.back(ka)), o: clamp(ka * 4), y: bob(1.7) });
          const kx = pr(t, c2 + .3, c2 + .75); tf(atx, { o: clamp(kx * 2), y: (1 - EZ.expo(kx)) * 10 });
        };
        BG = (c, t, a) => {
          const k = pr(t, c2 + .1, c2 + .5) * a; if (k <= 0) return;
          const x = area.x + rc.x, y = area.y + rc.y, br = 1 + .12 * Math.sin((t - c2) * 3);
          MK.fx.glow(c, x, y, D * 2.2 * br, T().w, k);
          c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineWidth = 4;
          for (let i = 0; i < 10; i++) { const an = i / 10 * Math.PI * 2 + (t - c2) * .5, r0 = D * .62, r1 = D * (.85 + .12 * Math.sin(t * 4 + i)); c.strokeStyle = `rgba(${T().w},${.7 * k})`; c.beginPath(); c.moveTo(x + Math.cos(an) * r0, y + Math.sin(an) * r0); c.lineTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1); c.stroke(); }
          c.restore();
        };
        FG = (c, t) => T().paint.burst(c, t, c2 + .1, area.x + rc.x, area.y + rc.y, { n: 26, sp: 520, col: T().w, life: .8 });
      }
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, y: -EZ.in(out) * 16 });
          if (kick) set(kick, { o: pr(t, slot.t0, slot.t0 + .4) });
          U(t);
        },
        bg(c, t) { BG(c, t, 1 - leave(t, slot)); },
        fg(c, t) { FG(c, t); },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- myth：误区与真相 ----------
     cross   误区卡被红色大叉打掉、逐行划线、变灰后退；真相卡在下方砸入
     shatter 误区卡出现裂纹，随后碎成玻璃片四散，真相卡从后面弹出
     swap    一块面板：误区被划线、面板摇头；开关拨到绿色，文字逐字翻牌换成真相
     cue：误区出现 / 否定 / 真相 */
  MK.control('myth', {
    variants: ['cross', 'shatter', 'swap'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait;
      const wrap = box(el('div', 'mk-abs mk-myth ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const kick = p.kicker ? box(el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)), 0, 0, area.w) : null;
      const top = kick ? 52 : 0, room = slot.t1 - 1.5 - (slot.cues[0] ?? slot.t0 + .25);
      const c1 = slot.cues[0] ?? slot.t0 + .25, c2 = slot.cues[1] ?? c1 + Math.min(1.3, room * .6), c3 = slot.cues[2] ?? c2 + Math.min(.8, room * .38);
      const chip = (parent, yes) => el('div', 'chip ' + (yes ? 'yes' : 'no'), parent, MK.icon(yes ? 'check' : 'x', 24, 3.2) + `<span>${esc(yes ? p.factLabel || '真相' : p.mythLabel || '误区')}</span>`);
      let U = () => {}, BG = () => {}, FG = () => {}, fx = { x: area.w / 2, y: area.h / 2, w: area.w, h: 300 };
      S(c1 - .1, 'swoosh', .45); S(c1 + .1, 'pop', .35);
      if (v === 'cross') {
        const mc = el('div', 'cd no mk-glass', wrap), mch = chip(mc, false), mtx = el('div', 'tx', mc, `<span>${rich(p.myth)}</span>`);
        const fc = el('div', 'cd yes mk-glass', wrap), fch = chip(fc, true), ftx = el('div', 'tx', fc, rich(p.fact));
        const ink = svg(mc, 10, 10, '', 'xs'), sk = svg(mc, 10, 10, '', 'sk');
        let xs = [], ss = [], dy0 = 0;
        ctx.measure(() => {
          const pad = P ? 40 : 44;
          [mc, fc].forEach(e => { e.style.padding = pad + 'px'; });
          fit(mtx, P ? 50 : 46, 24, area.w - pad * 2, area.h * .2);
          fit(ftx, P ? 60 : 56, 26, area.w - pad * 2, area.h * .26);
          const mh = pad * 2 + 46 + 18 + mtx.offsetHeight, fh = pad * 2 + 46 + 18 + ftx.offsetHeight, total = mh + 30 + fh, y0 = top + (area.h - top - total) / 2;
          box(mc, 0, y0, area.w, mh); box(fc, 0, y0 + mh + 30, area.w, fh); mc.style.height = mh + 'px'; fc.style.height = fh + 'px';
          dy0 = (fh + 30) / 2;
          const m = 26;
          ink.innerHTML = [hand(m, m, area.w - m, mh - m, 1, .03), hand(area.w - m, m, m, mh - m, 2, .03)].map(d => `<path d="${d}"/>`).join('');
          sk.innerHTML = lineRects(mtx.firstChild, mc).map((r, i) => `<path d="${hand(r.x - 8, r.y + r.h * .55, r.x + r.w + 8, r.y + r.h * .5, 10 + i, .01)}"/>`).join('');
          xs = [...ink.children]; ss = [...sk.children];
          fx = { x: area.w / 2, y: y0 + mh + 30 + fh / 2, w: area.w, h: fh };
        });
        S(c2 - .02, 'zap', .45); S(c2, 'scratch', .6, -.2); S(c2 + .18, 'scratch', .55, .2); shake(c2 + .2, 6);
        S(c3 - .08, 'whoosh', .5); S(c3, 'hit', .85); S(c3 + .28, 'check', .5, 0, { n: 2 }); S(c3 + .45, 'shine', .3);
        flash(c3, .28); shake(c3, 10); punch(c3, .04);
        U = t => {
          const k1 = pr(t, c1 - .1, c1 + .5), dy = (1 - EZ.inout(pr(t, c3 - .3, c3 + .2))) * dy0, kd = pr(t, c3 - .1, c3 + .4);
          const sh = t > c2 && t < c2 + .9 ? Math.sin((t - c2) * 70) * 14 * Math.exp(-(t - c2) * 7) : 0;
          tf(mc, { o: clamp(k1 * 3) * (1 - .4 * kd), y: dy + (1 - EZ.expo(k1)) * 40, x: sh, s: (.94 + .06 * EZ.back(k1)) * (1 - .05 * kd), blur: (1 - EZ.out(k1)) * 8 });
          mc.classList.toggle('dead', t >= c2 + .12);
          const kc = pr(t, c1 + .1, c1 + .5); tf(mch, { s: .5 + .5 * EZ.spring(kc), o: clamp(kc * 4) });
          draw(xs[0], EZ.out(pr(t, c2, c2 + .22))); draw(xs[1], EZ.out(pr(t, c2 + .16, c2 + .38)));
          xs.forEach(x => { x.style.opacity = t > c2 - .01 ? (.85 + .15 * Math.sin(t * 5)).toFixed(3) : '0'; });
          ss.forEach((s, i) => { draw(s, EZ.inout(pr(t, c2 + .04 + i * .08, c2 + .3 + i * .08))); s.style.opacity = t > c2 ? '1' : '0'; });
          const kf = pr(t, c3 - .04, c3 + .38);
          tf(fc, { o: clamp(kf * 5), s: 1 + (1 - EZ.out5(kf)) * .5, blur: (1 - EZ.out(kf)) * 12 });
          const kfc = pr(t, c3 + .2, c3 + .6); tf(fch, { s: .5 + .5 * EZ.spring(kfc), o: clamp(kfc * 4) });
          fc.style.setProperty('--gl', (.18 + .14 * idle(t, c3 + .8, 2.6).wave).toFixed(3));
        };
      } else if (v === 'shatter') {
        const mc = el('div', 'cd no mk-glass', wrap), mch = chip(mc, false), mtx = el('div', 'tx', mc, rich(p.myth));
        const fc = el('div', 'cd yes mk-glass', wrap), fch = chip(fc, true), ftx = el('div', 'tx', fc, rich(p.fact));
        const ckw = el('div', 'mk-abs ckw', wrap), ck = svg(ckw, 10, 10, '', 'ck');
        let cks = [], shards = [], ip = [0, 0], cw = 900, chh = 300, cx0 = 0, cy0 = 0;
        ctx.measure(() => {
          const pad = P ? 44 : 50; cw = P ? area.w : area.w * .92;
          [mc, fc].forEach(e => { e.style.padding = pad + 'px'; e.style.textAlign = 'center'; });
          fit(mtx, P ? 58 : 54, 26, cw - pad * 2, area.h * .3);
          fit(ftx, P ? 62 : 58, 28, cw - pad * 2, area.h * .34);
          chh = Math.max(P ? 380 : 320, pad * 2 + 46 + 22 + Math.max(mtx.offsetHeight, ftx.offsetHeight));
          cx0 = (area.w - cw) / 2; cy0 = top + (area.h - top - chh) / 2;
          [mc, fc, ckw].forEach(e => { box(e, cx0, cy0, cw, chh); e.style.height = chh + 'px'; });
          /* 文字在卡片里竖直居中 */
          [[mc, mtx], [fc, ftx]].forEach(([c, x]) => { c.style.paddingTop = ((chh - 46 - 22 - x.offsetHeight) / 2) + 'px'; });
          /* 裂纹：从撞击点向外的折线 */
          ip = [cw * .63, chh * .46];
          let d = '';
          for (let i = 0; i < 9; i++) {
            let an = i / 9 * Math.PI * 2 + (rnd(i, 51) - .5) * .5, x = ip[0], y = ip[1], s = `M${x.toFixed(1)} ${y.toFixed(1)}`;
            for (let j = 0; j < 12; j++) { an += (rnd(i * 20 + j, 52) - .5) * .7; const st = 26 + rnd(i * 20 + j, 53) * 40; x += Math.cos(an) * st; y += Math.sin(an) * st; s += ` L${clamp(x, 0, cw).toFixed(1)} ${clamp(y, 0, chh).toFixed(1)}`; if (x < 0 || y < 0 || x > cw || y > chh) break; }
            d += `<path d="${s}"/>`;
          }
          d += `<path d="${Array.from({ length: 9 }, (_, k) => { const a = k / 8 * Math.PI * 2, r = 34 + rnd(k, 54) * 16; return `${k ? 'L' : 'M'}${(ip[0] + Math.cos(a) * r).toFixed(1)} ${(ip[1] + Math.sin(a) * r).toFixed(1)}`; }).join(' ')}"/>`;
          ck.innerHTML = d; cks = [...ck.children];
          /* 碎片：抖动网格切成三角形，每片是误区卡的克隆 + clip-path */
          const cols = P ? 4 : 6, rows = P ? 4 : 3, pt = (i, j) => [cw * i / cols + (i > 0 && i < cols ? (rnd(i * 7 + j, 55) - .5) * cw / cols * .6 : 0), chh * j / rows + (j > 0 && j < rows ? (rnd(i * 7 + j, 56) - .5) * chh / rows * .6 : 0)];
          let k = 0;
          for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), dd = pt(i, j + 1);
            for (const tri of ((i + j) % 2 ? [[a, b, c], [a, c, dd]] : [[a, b, dd], [b, c, dd]])) {
              const e = mc.cloneNode(true); e.classList.add('sh'); wrap.appendChild(e);
              e.style.clipPath = `polygon(${tri.map(q => `${q[0].toFixed(1)}px ${q[1].toFixed(1)}px`).join(',')})`;
              const gx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, gy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3, dx = gx - ip[0], dy = gy - ip[1], L = Math.hypot(dx, dy) || 1;
              e.style.transformOrigin = `${gx.toFixed(1)}px ${gy.toFixed(1)}px`;
              shards.push({ e, ux: dx / L, uy: dy / L, sp: 500 + 700 * rnd(k, 57) * (1 - Math.min(.6, L / cw)), sr: (rnd(k, 58) - .5) * 520, rx: (rnd(k, 59) - .5) * 600, ry: (rnd(k, 60) - .5) * 600 });
              k++;
            }
          }
          fx = { x: cx0 + cw / 2, y: cy0 + chh / 2, w: cw, h: chh };
        });
        const cs = c3 - .12;
        S(c2, 'snap', .65); S(c2 + .02, 'thud', .5); shake(c2, 5);
        S(cs, 'crash', .85); S(cs + .02, 'hit', .6); S(c3 + .25, 'pop', .45); S(c3 + .4, 'chime', .35);
        flash(cs, .32); shake(cs, 14); punch(cs, .05);
        U = t => {
          const k1 = pr(t, c1 - .1, c1 + .5), q = t >= c2 ? Math.sin((t - c2) * 80) * 7 * Math.exp(-(t - c2) * 9) : 0;
          const trem = t > c2 + .3 && t < cs ? Math.sin(t * 120) * 1.6 * pr(t, c2 + .3, cs) : 0, alive = t < cs;
          const m = { o: alive ? clamp(k1 * 3) : 0, s: .9 + .1 * EZ.back(k1), x: q + trem, y: (1 - EZ.expo(k1)) * 40, blur: (1 - EZ.out(k1)) * 8 };
          tf(mc, m); tf(ckw, { ...m, o: alive && t >= c2 ? 1 : 0, blur: 0 });
          mc.classList.toggle('dead', t >= c2 + .1);
          const kc = pr(t, c1 + .1, c1 + .5); tf(mch, { s: .5 + .5 * EZ.spring(kc), o: clamp(kc * 4) });
          cks.forEach((pa, i) => draw(pa, EZ.out(pr(t, c2 + (i % 5) * .03, c2 + .22 + (i % 5) * .03))));
          shards.forEach(sh => {
            const lt = t - cs;
            if (lt < 0 || lt > 1.1) { tf(sh.e, { o: 0 }); return; }
            const d = sh.sp * lt, g = 1100 * lt * lt;
            tf(sh.e, { p: 1200, x: sh.ux * d + q, y: sh.uy * d + g, r: sh.sr * lt, rx: sh.rx * lt, ry: sh.ry * lt, s: 1 - lt * .25, o: 1 - pr(lt, .35, .85) });
          });
          const kf = pr(t, c3 - .02, c3 + .5);
          tf(fc, { o: clamp(kf * 4), s: .55 + .45 * EZ.back(kf), blur: (1 - EZ.out(kf)) * 14 });
          const kfc = pr(t, c3 + .2, c3 + .6); tf(fch, { s: .5 + .5 * EZ.spring(kfc), o: clamp(kfc * 4) });
          fc.style.setProperty('--gl', (.18 + .14 * idle(t, c3 + .8, 2.6).wave).toFixed(3));
        };
        FG = (c, t) => {
          T().paint.burst(c, t, c2, area.x + cx0 + ip[0], area.y + cy0 + ip[1], { n: 16, sp: 400, life: .5, col: T().r });
          T().paint.burst(c, t, cs, area.x + cx0 + ip[0], area.y + cy0 + ip[1], { n: 60, sp: 1300, life: 1 });
        };
      } else {
        const bd = el('div', 'bd no mk-glass', wrap), tg = el('div', 'tg', bd, '<i></i>'), knob = tg.firstChild;
        const lb = el('div', 'mk-abs lbs', bd), cn = chip(lb, false), cy_ = chip(lb, true);
        const ta = el('div', 'mk-abs ta', bd), mt = el('div', 'tx m mk-abs', ta), ft = el('div', 'tx f mk-abs', ta);
        const mch = split(mt, p.myth, 'char'), fch = split(ft, p.fact, 'char');
        const sk = svg(bd, 10, 10, '', 'sk');
        let ss = [], bw = 900, kx = 50;
        ctx.measure(() => {
          const pad = P ? 44 : 52; bw = area.w;
          box(tg, pad, pad, 112); tg.style.height = '56px'; box(lb, pad + 136, pad + 5, 400);
          cy_.style.position = cn.style.position = 'absolute'; cn.style.left = cy_.style.left = '0';
          const tw = bw - pad * 2, th = P ? area.h * .44 : area.h * .4;
          const s = Math.min(fit(mt, P ? 60 : 58, 26, tw, th), fit(ft, P ? 60 : 58, 26, tw, th));
          [mt, ft].forEach(e => { e.style.fontSize = s + 'px'; });
          const tah = Math.max(mt.offsetHeight, ft.offsetHeight), bh = pad + 56 + 34 + tah + pad;
          box(ta, pad, pad + 56 + 34, tw); ta.style.height = tah + 'px';
          box(bd, 0, top + (area.h - top - bh) / 2, bw); bd.style.height = bh + 'px';
          sk.innerHTML = lineRects(mt, bd).map((r, i) => `<path d="${hand(r.x - 10, r.y + r.h * .55, r.x + r.w + 10, r.y + r.h * .48, 20 + i, .015)}"/>`).join('');
          ss = [...sk.children]; kx = 112 - 46 - 10;
          fx = { x: area.w / 2, y: top + (area.h - top) / 2, w: bw, h: bh };
        });
        const g = Math.min(.035, .7 / Math.max(mch.length, fch.length));
        mch.forEach((_, j) => { if (j % 4 === 0) S(c1 + .1 + j * .02, 'tick', .18, 0); });
        S(c2 - .02, 'zap', .55); S(c2 + .04, 'scratch', .5); shake(c2, 5);
        S(c3 - .05, 'snap', .6); S(c3 + .05, 'shutter', .45, 0); S(c3 + .3, 'swipe', .35); S(c3 + .5, 'check', .5, 0, { n: 3 }); S(c3 + .7, 'shine', .3);
        flash(c3 + .1, .18); punch(c3 + .1, .025);
        U = t => {
          const k1 = pr(t, c1 - .15, c1 + .5), sh = t > c2 && t < c2 + 1 ? Math.sin((t - c2) * 55) * 18 * Math.exp(-(t - c2) * 6) : 0;
          tf(bd, { o: clamp(k1 * 3), y: (1 - EZ.expo(k1)) * 50, x: sh, s: .96 + .04 * EZ.back(k1) });
          bd.classList.toggle('no', t >= c2 && t < c3 + .1); bd.classList.toggle('yes', t >= c3 + .1);
          mch.forEach((u, j) => { const ki = pr(t, c1 + .1 + j * .02, c1 + .5 + j * .02), ko = pr(t, c3 + j * g, c3 + j * g + .28); tf(u, { p: 500, o: clamp(ki * 3) * (1 - ko), y: (1 - EZ.back(ki)) * 30, rx: -95 * EZ.in(ko) }); u.style.color = t >= c2 + .1 ? '#7d828d' : ''; });
          fch.forEach((u, j) => { const ki = pr(t, c3 + .14 + j * g, c3 + .14 + j * g + .42); tf(u, { p: 500, o: clamp(ki * 3), rx: 95 * (1 - EZ.back(ki)), y: Math.sin(t * 2.4 - j * .4) * 3 * pr(t, c3 + 1.2, c3 + 1.8) }); });
          ss.forEach((s, i) => { draw(s, EZ.inout(pr(t, c2 + i * .08, c2 + .28 + i * .08))); s.style.opacity = t > c2 ? (1 - pr(t, c3, c3 + .25)).toFixed(3) : '0'; });
          const kk = EZ.back(pr(t, c3 - .05, c3 + .35)); tf(knob, { x: kk * kx, s: 1 + .25 * Math.sin(Math.PI * pr(t, c3 - .05, c3 + .3)) }); tg.classList.toggle('on', kk > .5);
          tf(tg, { o: clamp(k1 * 3), x: t > c2 && t < c3 ? Math.sin((t - c2) * 40) * 3 * Math.exp(-(t - c2) * 4) : 0 });
          const kn = pr(t, c1 + .1, c1 + .45), kc = pr(t, c3, c3 + .25);
          tf(cn, { p: 400, s: .5 + .5 * EZ.spring(kn), o: clamp(kn * 4) * (kc < 1 ? 1 : 0), rx: -90 * EZ.in(kc) });
          const ky = pr(t, c3 + .2, c3 + .55); tf(cy_, { p: 400, rx: 90 * (1 - EZ.back(ky)), o: t >= c3 + .2 ? 1 : 0 });
          ft.style.textShadow = t > c3 + .8 ? `0 0 ${(22 + 10 * idle(t, c3 + .8, 2.6).wave).toFixed(1)}px rgba(${T().g},.45)` : '';
          bd.style.setProperty('--gl', (.18 + .12 * idle(t, c3 + .8, 2.6).wave).toFixed(3));
        };
      }
      BG = (c, t, a) => MK.fx.glow(c, area.x + fx.x, area.y + fx.y, fx.w * .5, T().g, a * .5 * pr(t, c3, c3 + .6));
      const FG0 = FG;
      FG = (c, t) => { FG0(c, t); if (v !== 'shatter') T().paint.burst(c, t, c3 + .05, area.x + fx.x, area.y + fx.y, { n: 40, sp: 950, col: T().g }); MK.fx.twinkle(c, t, area.x + fx.x - fx.w / 2, area.y + fx.y - fx.h / 2 - 20, fx.w, fx.h + 40, 8, T().g, pr(t, c3 + .6, c3 + 1.1) * (1 - leave(t, slot))); };
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, y: -EZ.in(out) * 16 });
          if (kick) set(kick, { o: pr(t, slot.t0, slot.t0 + .4) });
          U(t);
        },
        bg(c, t) { BG(c, t, 1 - leave(t, slot)); },
        fg(c, t) { FG(c, t); },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- prosCons：优缺点 ----------
     columns 中线描出，优点向左、缺点向右从中线滑出；结论时拔河条向占优一方拉过去
     scale   天平：每条优缺点作为砝码落进左右托盘，横梁随之摆动，结论时重重倾斜
     cards   两张卡片绕外侧边翻入，逐条打勾/打叉；结论时胜方前推发光，另一方后退变灰
     cue：每条优点、每条缺点、结论 */
  MK.control('prosCons', {
    variants: ['columns', 'scale', 'cards'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, np = p.pros.length, nc = p.cons.length, N = np + nc;
      const lean = p.lean || (np > nc ? 'pros' : np < nc ? 'cons' : 'even'), WIN = lean === 'pros' ? -1 : lean === 'cons' ? 1 : 0;
      const balanced = MotionNarrationLayout.enabled();
      const wrap = box(el('div', 'mk-abs mk-pc ' + v, ctx.root), area.x, area.y, area.w, area.h);
      if (balanced) wrap.classList.add('narration-balanced');
      const header = balanced ? box(el('div', 'mk-abs', wrap), 0, 0, area.w) : wrap;
      const hd = head(header, p, area.w, 'center');
      const all = beats(slot, N, .75, .55, 2.5), cv = slot.cues[N] ?? Math.min(slot.t1 - 1.3, all[N - 1] + .9);
      const item = (parent, s, pro, cls = '') => { const r = el('div', `it ${pro ? 'p' : 'c'} ${cls}`, parent); const ic = ico(r, pro ? 'check' : 'x', 28, 3); const tx = el('div', 'tx', r, rich(s)); return { r, ic, tx, pro }; };
      const hdr = (parent, pro) => el('div', `hd mk-abs ${pro ? 'p' : 'c'}`, parent, MK.icon(pro ? 'like' : 'alert', 34, 2) + `<span>${esc(pro ? p.proLabel || '优点' : p.conLabel || '缺点')}</span>`);
      const its = [...p.pros.map(s => ({ s, pro: true })), ...p.cons.map(s => ({ s, pro: false }))];
      const vd = p.verdict ? el('div', 'vd mk-abs', wrap, (WIN ? MK.icon('arrow', 30, 2.4) : MK.icon('target', 30, 2)) + `<span>${rich(p.verdict)}</span>`) : null;
      if (vd && WIN < 0) vd.querySelector('svg').style.transform = 'scaleX(-1)';
      let U = () => {}, BG = () => {}, FG = () => {}, wpos = { x: area.w / 2, y: area.h / 2 };
      const fitVd = (w, y) => { if (!vd) return 0; const sp = vd.querySelector('span'); fit(sp, P ? 40 : 38, 22, w - 90, null); sp.style.width = 'max-content'; vd.style.width = 'auto'; box(vd, (area.w - vd.offsetWidth) / 2, y); return vd.offsetHeight; };
      const vdIn = t => { if (!vd) return; const k = pr(t, cv, cv + .45); tf(vd, { s: .5 + .5 * EZ.spring(k), o: clamp(k * 4), x: WIN * Math.max(0, Math.sin((t - cv - 1) * 3)) * 8 * pr(t, cv + 1, cv + 1.4) }); };
      S(slot.t0 + .1, 'swoosh', .4);
      if (v === 'columns') {
        const dv = el('div', 'dv mk-abs', wrap), hp = hdr(wrap, true), hc = hdr(wrap, false);
        const rows = its.map(o => item(wrap, o.s, o.pro, 'mk-abs'));
        const tug = el('div', 'tug mk-abs', wrap, '<i class="fp"></i><i class="fc"></i>'), [fp, fcn] = [...tug.children], knot = el('div', 'knot mk-abs', wrap);
        let tw = 800, ty = 0;
        ctx.measure(() => {
          const top = hd.lay(P ? 60 : 54), vh = 96 + (vd ? 64 : 0), H = area.h - top - vh;
          if (!P) {
            const cw = (area.w - 90) / 2, rh = Math.min(76, (H - 70) / Math.max(np, nc));
            box(hp, 0, top, cw); box(hc, cw + 90, top, cw); hp.style.justifyContent = 'flex-end'; hp.style.textAlign = 'right';
            rows.forEach((r, i) => { const j = r.pro ? i : i - np; box(r.r, r.pro ? 0 : cw + 90, top + 70 + j * rh, cw); r.r.style.height = rh + 'px'; if (r.pro) r.r.style.flexDirection = 'row-reverse'; fit(r.tx, Math.min(40, rh * .56), 20, cw - 72, null); if (r.pro) r.tx.style.textAlign = 'right'; });
            box(dv, area.w / 2 - 1, top, 2); dv.style.height = (70 + Math.max(np, nc) * rh) + 'px';
            ty = top + 70 + Math.max(np, nc) * rh + 26;
          } else {
            const rh = Math.min(66, (H - 2 * 62 - 30) / N);
            box(hp, 0, top, area.w); let y = top + 62;
            rows.forEach((r, i) => { if (i === np) { box(dv, 0, y + 12, area.w); dv.style.height = '2px'; y += 30; box(hc, 0, y, area.w); y += 62; } box(r.r, 0, y, area.w); r.r.style.height = rh + 'px'; fit(r.tx, Math.min(40, rh * .58), 20, area.w - 72, null); y += rh; });
            ty = y + 22;
          }
          tw = Math.min(area.w * .82, 760); box(tug, (area.w - tw) / 2, ty, tw); tug.style.height = '18px';
          box(knot, 0, ty - 7, 32); knot.style.height = '32px';
          fitVd(area.w, ty + 40);
          wpos = { x: area.w / 2, y: ty + 9 };
        });
        all.forEach((a, i) => { S(a, 'pop', .4, its[i].pro ? -.4 : .4); S(a + .15, its[i].pro ? 'check' : 'blip', .35, its[i].pro ? -.4 : .4, { n: i }); });
        S(cv, 'swell', .3, 0, { d: .6 }); S(cv + .15, 'whoosh', .4); S(cv + .55, 'thud', .55); if (vd) S(cv + .1, 'pop', .4);
        U = t => {
          const kd = pr(t, slot.t0 + .25, slot.t0 + .85); tf(dv, P ? { sx: EZ.inout(kd), o: kd > 0 ? 1 : 0 } : { sy: EZ.inout(kd), o: kd > 0 ? 1 : 0 });
          const kh = pr(t, slot.t0 + .4, slot.t0 + .9); tf(hp, { o: clamp(kh * 3), x: P ? 0 : (1 - EZ.out5(kh)) * 60, y: P ? (1 - EZ.out5(kh)) * 20 : 0 }); tf(hc, { o: clamp(kh * 3), x: P ? 0 : -(1 - EZ.out5(kh)) * 60, y: P ? (1 - EZ.out5(kh)) * 20 : 0 });
          const lose = WIN === 0 ? null : WIN < 0 ? false : true;
          rows.forEach((r, i) => {
            const a = all[i], k = pr(t, a - .05, a + .45), dir = r.pro ? 1 : -1, hl = turn(t, cv + 1.2, i - (WIN > 0 ? np : 0), WIN > 0 ? nc : WIN < 0 ? np : N, 1);
            tf(r.r, { o: clamp(k * 3) * (lose === r.pro && t > cv + .3 ? .45 : 1), x: P ? (1 - EZ.out5(k)) * -40 : (1 - EZ.out5(k)) * dir * 90, s: 1 + hl * .04 });
            const ki = pr(t, a + .05, a + .45); tf(r.ic, { s: .3 + .7 * EZ.spring(ki), o: clamp(ki * 4) }); drawIcon(r.ic, EZ.out(pr(t, a + .1, a + .5)));
          });
          const kb = pr(t, cv - .1, cv + .3), share = WIN < 0 ? .7 : WIN > 0 ? .3 : .5, pos = lerp(.5, share, EZ.elastic(pr(t, cv + .15, cv + 1.2)));
          tf(tug, { o: clamp(kb * 3), sx: .3 + .7 * EZ.back(kb) });
          fp.style.width = (pos * 100).toFixed(2) + '%'; fcn.style.width = ((1 - pos) * 100).toFixed(2) + '%';
          knot.style.left = ((area.w - tw) / 2 + pos * tw - 16).toFixed(1) + 'px';
          tf(knot, { o: clamp(kb * 3), s: 1 + .15 * Math.sin(t * 6) * pr(t, cv + 1.2, cv + 1.6) });
          wpos.x = (area.w - tw) / 2 + pos * tw;
          vdIn(t);
        };
        BG = (c, t, a) => MK.fx.glow(c, area.x + wpos.x, area.y + wpos.y, 120, T().aLite, a * pr(t, cv, cv + .4));
        FG = (c, t) => T().paint.burst(c, t, cv + .5, area.x + wpos.x, area.y + wpos.y, { n: 24, sp: 600, life: .7 });
      } else if (v === 'scale') {
        const sv = svg(wrap, area.w, area.h, '', 'bal');
        const chips = its.map(o => item(wrap, o.s, o.pro, 'chp mk-abs'));
        const hp = hdr(wrap, true), hc = hdr(wrap, false);
        let G = { cx: 0, by: 0, L: 300, hang: 300, cwid: 380, chh: 54, base: 500 }, beam, pans, post;
        ctx.measure(() => {
          const top = hd.lay(P ? 60 : 54), cx = area.w / 2, L = P ? Math.min(area.w * .26, 260) : Math.min(area.w * .29, 330);
          const cwid = Math.min(420, 2 * (cx - L) - 24, 2 * L - 40), mx = Math.max(np, nc), chh = Math.max(34, Math.min(P ? 56 : 52, (area.h - top - 74 - 44 - 40 - (vd ? 76 : 0) - 64 - (P ? Math.min(area.w * .26, 260) : Math.min(area.w * .29, 330)) * .22) / mx - 8)), hang = mx * (chh + 8) + 54;
          const by = top + 74, base = by + hang + 44;
          G = { cx, by, L, hang, cwid, chh, base };
          sv.innerHTML = `<path class="post" d="M${cx} ${by} L${cx} ${base}"/><path class="foot" d="M${cx - 90} ${base} L${cx + 90} ${base}"/><path class="piv" d="M${cx} ${by - 18} L${cx - 22} ${by + 20} L${cx + 22} ${by + 20} Z"/>` +
            `<g class="beam"><path d="M${cx - L} ${by} L${cx + L} ${by}"/><circle cx="${cx - L}" cy="${by}" r="7"/><circle cx="${cx + L}" cy="${by}" r="7"/></g>` +
            [0, 1].map(() => `<g class="pan"><path d="M0 0 L${-cwid / 2 - 8} ${hang} M0 0 L${cwid / 2 + 8} ${hang}"/><path class="tray" d="M${-cwid / 2 - 20} ${hang} Q0 ${hang + 34} ${cwid / 2 + 20} ${hang}"/></g>`).join('');
          beam = sv.querySelector('.beam'); pans = [...sv.querySelectorAll('.pan')]; post = [...sv.querySelectorAll('.post,.foot,.piv,.beam path,.pan path')];
          chips.forEach(r => { box(r.r, 0, 0, cwid); r.r.style.height = chh + 'px'; fit(r.tx, Math.min(P ? 32 : 30, chh * .6), 16, cwid - 82, null); });
          /* 托盘最多倾斜 13°：标签放在托盘最低点之下，不压线 */
          const drop = L * Math.sin(13 * Math.PI / 180) + 34;
          [hp, hc].forEach((h, i) => { h.style.width = 'auto'; h.style.fontSize = '30px'; box(h, i ? cx + L - h.offsetWidth / 2 : cx - L - h.offsetWidth / 2, Math.min(base + drop - 20, area.h - (vd ? 116 : 50))); });
          fitVd(area.w, Math.min(base + drop + 26, area.h - 60));
          wpos = { x: cx, y: by };
        });
        /* 横梁角度：每个砝码落下给一份力矩（左重左低），结论时摆到最终倾斜；全部是弹簧过渡之和 */
        const land = all.map(a => a + .45), steps = its.map(o => (o.pro ? -3.2 : 3.2));
        const final = WIN * 13 - steps.reduce((s, x) => s + x, 0);
        const angle = t => land.reduce((s, c, i) => s + steps[i] * EZ.spring(pr(t, c, c + 1)), 0) + final * EZ.spring(pr(t, cv + .1, cv + 1.3));
        all.forEach((a, i) => { S(a, 'whoosh', .25, its[i].pro ? -.5 : .5); S(a + .45, 'thud', .5, its[i].pro ? -.5 : .5); S(a + .5, 'tick', .3); });
        S(cv, 'riser', .3, 0, { d: .3 }); S(cv + .3, 'hit', .7); S(cv + .5, 'tada', .4); shake(cv + .3, 7); if (vd) S(cv + .2, 'pop', .4);
        const panAt = (side, t) => { const a = angle(t) * Math.PI / 180, s = side ? 1 : -1; return [G.cx + s * G.L * Math.cos(a), G.by + s * G.L * Math.sin(a)]; };
        U = t => {
          const kd = pr(t, slot.t0 + .1, slot.t0 + .8);
          post.forEach(pa => draw(pa, EZ.out(kd)));
          tf(sv, { o: clamp(kd * 3) });
          beam.setAttribute('transform', `rotate(${angle(t).toFixed(3)} ${G.cx} ${G.by})`);
          pans.forEach((g, i) => { const [x, y] = panAt(i, t); g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`); });
          const kh = pr(t, slot.t0 + .5, slot.t0 + .9); [hp, hc].forEach(h => tf(h, { o: clamp(kh * 3), y: (1 - EZ.expo(kh)) * 16 }));
          const cnt = [0, 0];
          chips.forEach((r, i) => {
            const side = r.pro ? 0 : 1, j = cnt[side]++, [px, py] = panAt(side, t), a = all[i], k = pr(t, a, a + .45);
            const fx0 = px - G.cwid / 2, fy0 = py + G.hang - 6 - (j + 1) * (G.chh + 8);
            r.r.style.left = fx0.toFixed(1) + 'px'; r.r.style.top = fy0.toFixed(1) + 'px';
            const lose = WIN !== 0 && (WIN < 0) !== r.pro && t > cv + .4;
            tf(r.r, { o: clamp(k * 5) * (lose ? .5 : 1), y: -(1 - EZ.bounce(k)) * 320, r: (1 - EZ.out(k)) * (r.pro ? -8 : 8) });
            const ki = pr(t, a + .4, a + .7); drawIcon(r.ic, EZ.out(ki));
          });
          vdIn(t);
          wpos = WIN ? { x: panAt(WIN < 0 ? 0 : 1, t)[0], y: panAt(WIN < 0 ? 0 : 1, t)[1] + G.hang * .6 } : { x: G.cx, y: G.by };
        };
        BG = (c, t, a) => MK.fx.glow(c, area.x + wpos.x, area.y + wpos.y, 260, WIN > 0 ? T().r : T().g, a * .7 * pr(t, cv + .3, cv + .8) * (WIN ? 1 : 0));
        FG = (c, t) => { all.forEach((a, i) => { const s = its[i].pro ? 0 : 1, [x, y] = panAt(s, a + .45); T().paint.burst(c, t, a + .45, area.x + x, area.y + y + G.hang, { n: 10, sp: 260, life: .45, seed: i }); }); };
      } else {
        const cds = [true, false].map(pro => { const c = el('div', `cd mk-glass ${pro ? 'p' : 'c'}`, wrap); const h = hdr(c, pro); h.style.position = 'relative'; const list = el('div', 'ls', c); return { c, h, rows: (pro ? p.pros : p.cons).map(s => item(list, s, pro)), pro }; });
        const badge = WIN ? el('div', 'bdg mk-abs', wrap, MK.icon('crown', 40, 2)) : null;
        let R = [];
        ctx.measure(() => {
          const top = hd.lay(P ? 60 : 54), vh = vd ? 84 : 10, H = area.h - top - vh, g = P ? 24 : 36;
          R = P ? [0, 1].map(i => ({ x: 0, y: top + i * ((H - g) / 2 + g), w: area.w, h: (H - g) / 2 })) : [0, 1].map(i => ({ x: i * ((area.w - g) / 2 + g), y: top, w: (area.w - g) / 2, h: H }));
          if (balanced) { const g = MotionNarrationLayout.prosCards(area, P, Math.max(np, nc), top, !!vd); R = g.rects; header.style.top = g.headerY + 'px'; }
          cds.forEach((d, i) => {
            const r = R[i]; box(d.c, r.x, r.y, r.w); d.c.style.height = r.h + 'px';
            d.c.style.transformOrigin = P ? (i ? '50% 100%' : '50% 0') : (i ? '100% 50%' : '0 50%');
            if (balanced) { MotionNarrationLayout.prosText(d, r); return; }
            const n = d.rows.length, rh = Math.min(P ? 64 : 76, (r.h - 64 - 40) / n);
            d.rows.forEach(x => { x.r.style.height = rh + 'px'; fit(x.tx, Math.min(38, rh * .56), 18, r.w - 60 - 66, null); });
          });
          fitVd(area.w, balanced ? Math.max(...R.map(r => r.y + r.h)) + 24 : top + H + 18);
          if (badge) { const r = R[WIN < 0 ? 0 : 1]; box(badge, r.x + r.w - 52, r.y - 26, 76); badge.style.height = '76px'; }
          const r = R[WIN > 0 ? 1 : 0]; wpos = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        });
        S(slot.t0 + .25, 'card', .5, -.4); S(slot.t0 + .4, 'card', .5, .4);
        all.forEach((a, i) => { S(a, its[i].pro ? 'check' : 'blip', .4, its[i].pro ? -.4 : .4, { n: i }); S(a + .05, 'marker', .2); });
        S(cv, 'whoosh', .45); S(cv + .25, 'stamp', .6); S(cv + .45, 'chime', .35); if (WIN) punch(cv + .25, .03);
        U = t => {
          cds.forEach((d, i) => {
            const k = pr(t, slot.t0 + .25 + i * .15, slot.t0 + .9 + i * .15), wv = pr(t, cv, cv + .5), win = WIN === 0 ? 0 : (WIN < 0) === d.pro ? 1 : -1;
            const sw = (1 - EZ.spring(k)) * (i ? -1 : 1) * 75;
            tf(d.c, { p: 1400, o: clamp(k * 4) * (win < 0 ? 1 - .45 * wv : 1), ry: P ? 0 : sw + (win < 0 ? (i ? 8 : -8) * EZ.out(wv) : 0), rx: P ? -sw * .8 + (win < 0 ? 8 * EZ.out(wv) : 0) : 0, s: 1 + win * .04 * EZ.back(wv), y: win > 0 ? -10 * EZ.out(wv) : 0 });
            d.c.classList.toggle('win', win > 0 && wv > .3); d.c.classList.toggle('lose', win < 0 && wv > .3);
            shine(d.c, t, win > 0 ? cv + .5 : 1e9, 3);
            tf(d.h, { o: clamp(pr(t, slot.t0 + .6 + i * .15, slot.t0 + 1 + i * .15) * 3) });
            d.rows.forEach((x, j) => {
              const a = all[d.pro ? j : np + j], kx = pr(t, a - .05, a + .4);
              tf(x.r, { o: clamp(kx * 3), x: (1 - EZ.out5(kx)) * 30 }); x.tx.style.clipPath = kx < 1 ? `inset(-20% ${((1 - EZ.out(kx)) * 100).toFixed(1)}% -20% 0)` : '';
              const ki = pr(t, a, a + .4); tf(x.ic, { s: .4 + .6 * EZ.spring(ki), o: clamp(ki * 4) }); drawIcon(x.ic, EZ.out(ki));
            });
          });
          if (badge) { const kb = pr(t, cv + .2, cv + .6); tf(badge, { o: clamp(kb * 4), s: 1 + (1 - EZ.out5(kb)) * 1.6, r: -16 + (1 - EZ.out5(kb)) * -20 + Math.sin(t * 2.4) * 3 * pr(t, cv + .8, cv + 1.2) }); }
          vdIn(t);
        };
        BG = (c, t, a) => { if (WIN) MK.fx.glow(c, area.x + wpos.x, area.y + wpos.y, 420, WIN < 0 ? T().g : T().r, a * .55 * pr(t, cv + .2, cv + .7)); };
        FG = (c, t) => { if (WIN) T().paint.burst(c, t, cv + .25, area.x + wpos.x, area.y + wpos.y, { n: 40, sp: 900, col: WIN < 0 ? T().g : T().r }); };
      }
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, y: -EZ.in(out) * 16 });
          hd.update(t, slot.t0);
          U(t);
        },
        bg(c, t) { BG(c, t, 1 - leave(t, slot)); },
        fg(c, t) { FG(c, t); },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- definition：名词解释 ----------
     dictionary 词典条目：词头逐字落下、注音打字、横线划出、释义分句浮现、例句滑入
     wiki       搜索框里打出词条 → 回车 → 搜索框上移成页眉、卡片展开；释义先骨架屏闪烁再出字
     sticky     便签贴上墙，胶带落下，记号笔写出词头；例句时手绘圈出词头，便签轻轻飘动
     cue：词条 / 释义 / 例句（没有例句时为强调） */
  MK.control('definition', {
    variants: ['dictionary', 'wiki', 'sticky'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait;
      const wrap = box(el('div', 'mk-abs mk-def ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const kick = p.kicker ? box(el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)), 0, 0, area.w) : null;
      const top = kick ? 52 : 0, room = slot.t1 - 1.4 - (slot.cues[0] ?? slot.t0 + .25);
      const c1 = slot.cues[0] ?? slot.t0 + .25, c2 = slot.cues[1] ?? c1 + Math.min(v === 'wiki' ? 1.6 : 1.1, room * .5), c3 = slot.cues[2] ?? c2 + Math.min(1.2, room * .45);
      const meta = [p.pos ? `<b>${esc(p.pos)}</b>` : '', p.phonetic ? `<span class="ph">${esc(p.phonetic)}</span>` : ''].filter(Boolean);
      let U = () => {}, BG = () => {}, FG = () => {}, tc = { x: area.w / 2, y: area.h / 3 };
      if (v === 'dictionary') {
        const pn = el('div', 'pn mk-glass', wrap), term = el('div', 'term mk-abs', pn), chars = split(term, p.term, 'char');
        const ph = p.phonetic ? el('div', 'phn mk-abs', pn) : null, pos = p.pos ? el('div', 'pos mk-abs', pn, esc(p.pos)) : null;
        const rule = el('i', 'rule mk-abs', pn), num = el('div', 'num mk-abs', pn, '1'), df = el('div', 'df mk-abs', pn), dph = phraseEls(df, p.definition);
        const ex = p.example ? el('div', 'ex mk-abs', pn, `<b>例</b><span>${rich(p.example)}</span>`) : null;
        const phTxt = p.phonetic ? `/ ${p.phonetic} /` : '';
        ctx.measure(() => {
          const pad = P ? 46 : 54, iw = area.w - pad * 2, H = area.h - top;
          fit(term, P ? 120 : 112, 44, iw, H * .24);
          let y = pad; term.style.left = pad + 'px'; term.style.top = y + 'px'; y += term.offsetHeight + 8;
          if (ph || pos) {
            let x = pad;
            if (ph) { ph.textContent = phTxt; fit(ph, 34, 20, iw * (pos ? .7 : 1), null); ph.style.width = 'auto'; box(ph, x, y); x += ph.offsetWidth + 20; ph._w = ph.offsetWidth; ph.textContent = ''; }
            if (pos) { pos.style.fontSize = '26px'; box(pos, x, y + 2); }
            y += 52;
          }
          y += 16; box(rule, pad, y, iw); y += 30;
          box(num, pad, y + 4, 46); num.style.height = '46px';
          fit(df, P ? 48 : 44, 22, iw - 70, H * .32); df.style.left = (pad + 70) + 'px'; df.style.top = y + 'px'; y += Math.max(df.offsetHeight, 54) + 24;
          if (ex) { const sp = ex.querySelector('span'); fit(sp, P ? 36 : 34, 18, iw - 76, H * .16); box(ex, pad, y, iw); y += ex.offsetHeight; }
          const phh = y + pad; box(pn, 0, top + Math.max(0, (H - phh) / 2), area.w); pn.style.height = phh + 'px';
          tc = { x: pad + term.offsetWidth / 2, y: top + Math.max(0, (H - phh) / 2) + pad + term.offsetHeight / 2 };
        });
        chars.forEach((_, i) => { if (i < 6) S(c1 + i * .06, 'blip', .3, 0, { n: i * 2 }); });
        if (ph) S(c1 + .5, 'type', .3, 0, { d: .5 }); S(c1 + .55, 'swipe', .3);
        S(c2, 'pop', .4); S(c2 + .05, 'swoosh', .3);
        S(c3, ex ? 'card' : 'shine', .45); if (ex) S(c3 + .3, 'marker', .4);
        U = t => {
          const kp = pr(t, c1 - .25, c1 + .3); tf(pn, { o: clamp(kp * 3), y: (1 - EZ.expo(kp)) * 50 });
          const glow = idle(t, c3 + .8, 2.8);
          chars.forEach((u, i) => { const k = pr(t, c1 + i * .06, c1 + i * .06 + .5); tf(u, { p: 500, o: clamp(k * 4), y: (1 - EZ.bounce(k)) * -70 + Math.sin(t * 2.2 - i * .5) * 3 * pr(t, c3 + .6, c3 + 1.2), rx: (1 - EZ.out(k)) * 60 }); });
          term.style.textShadow = t > c1 + .6 ? `0 0 ${(26 + 12 * glow.wave).toFixed(1)}px rgba(${T().a},.45)` : '';
          if (ph) { const n = MK.type(ph, phTxt, t, c1 + .5, 40, true); ph.style.opacity = n > 0 ? '1' : '0'; }
          if (pos) { const k = pr(t, c1 + .7, c1 + 1.05); tf(pos, { s: .4 + .6 * EZ.spring(k), o: clamp(k * 4) }); }
          const kr = pr(t, c1 + .55, c1 + 1); tf(rule, { sx: EZ.inout(kr), o: kr > 0 ? 1 : 0 });
          const kn = pr(t, c2, c2 + .4); tf(num, { s: .3 + .7 * EZ.spring(kn), o: clamp(kn * 4), r: (1 - EZ.out(kn)) * -90 });
          phraseIn(dph, t, c2 + .05, .7);
          if (ex) { const k = pr(t, c3, c3 + .5); tf(ex, { o: clamp(k * 3), x: (1 - EZ.out5(k)) * -60 }); ex.style.setProperty('--ul', (EZ.inout(pr(t, c3 + .3, c3 + .8)) * 100).toFixed(1) + '%'); }
          else { const k = pr(t, c3, c3 + .5); tf(term, { s: 1 + .08 * Math.sin(Math.PI * k) }); }
        };
        BG = (c, t, a) => MK.fx.glow(c, area.x + tc.x, area.y + tc.y, 340, T().a, a * .4 * pr(t, c1, c1 + .8));
        FG = (c, t) => { if (!ex) T().paint.burst(c, t, c3, area.x + tc.x, area.y + tc.y, { n: 30, sp: 700 }); };
      } else if (v === 'wiki') {
        const cd = el('div', 'cd mk-glass', wrap);
        const sb = el('div', 'sb mk-abs', wrap), sIc = ico(sb, 'search', 36, 2.2), q = el('span', 'q', sb), key = el('b', 'key', sb, '↵');
        const ttl = el('div', 'tt mk-abs', cd, rich(p.term)), mt = meta.length ? el('div', 'mt mk-abs', cd, meta.join('<i>·</i>')) : null, hr = el('i', 'hr mk-abs', cd);
        const df = el('div', 'df mk-abs', cd, rich(p.definition)), sk = el('div', 'sk mk-abs', cd);
        const ex = p.example ? el('div', 'ex mk-abs', cd, rich(p.example)) : null;
        const word = String(p.term).replace(/\*/g, ''), tEnd = c1 + Math.min(.9, [...word].length * .09), cs = tEnd + .3;
        let G = { x0: 0, y0: 0, w0: 700, x1: 0, y1: 0, w1: 900 }, nsk = 3;
        ctx.measure(() => {
          const H = area.h - top, pad = P ? 36 : 44;
          box(cd, 0, top, area.w); cd.style.height = H + 'px';
          q.textContent = word; fit(q, P ? 38 : 36, 20, Math.min(area.w * .8, 760) - 150, null); const qs = parseFloat(q.style.fontSize); q.style.width = 'auto'; q.textContent = '';
          G = { w0: Math.min(area.w * .86, 780), w1: area.w - pad * 2, x1: pad, y1: top + 24 }; G.x0 = (area.w - G.w0) / 2; G.y0 = top + H * (P ? .38 : .42) - 42; G.qs = qs;
          let y = 24 + 72 + 34;
          fit(ttl, P ? 88 : 80, 40, area.w - pad * 2, H * .2); box(ttl, pad, y); y += ttl.offsetHeight + 4;
          if (mt) { fit(mt, 28, 18, area.w - pad * 2, null); box(mt, pad, y); y += 44; }
          box(hr, pad, y + 8, area.w - pad * 2); y += 30;
          fit(df, P ? 44 : 40, 22, area.w - pad * 2, H * .32); box(df, pad, y); df.style.width = (area.w - pad * 2) + 'px';
          nsk = Math.max(2, Math.round(df.offsetHeight / (parseFloat(df.style.fontSize) * 1.5)));
          sk.innerHTML = Array.from({ length: nsk }, (_, i) => `<i style="width:${i === nsk - 1 ? 58 : 92 - i * 4}%;height:${(parseFloat(df.style.fontSize) * .7).toFixed(0)}px;margin-bottom:${(parseFloat(df.style.fontSize) * .8).toFixed(0)}px"></i>`).join('');
          box(sk, pad, y + 6, area.w - pad * 2);
          y += df.offsetHeight + 26;
          if (ex) { fit(ex, P ? 34 : 32, 18, area.w - pad * 2 - 40, H * .18); box(ex, pad, y); }
          tc = { x: area.w / 2, y: top + H / 2 };
        });
        S(c1 - .2, 'pop', .4); S(c1, 'type', .35, 0, { d: tEnd - c1 }); S(tEnd + .15, 'key', .7); S(cs, 'swoosh', .45); S(cs + .25, 'card', .4);
        S(c2, 'blip', .25, 0, { n: 0 }); S(c2 + .45, 'chime', .3); if (ex) S(c3, 'swipe', .4);
        U = t => {
          const ks = pr(t, c1 - .3, c1 + .1), km = EZ.inout(pr(t, cs, cs + .55));
          const x = lerp(G.x0, G.x1, km), y = lerp(G.y0, G.y1, km), w = lerp(G.w0, G.w1, km), h = lerp(84, 72, km);
          Object.assign(sb.style, { left: x.toFixed(1) + 'px', top: y.toFixed(1) + 'px', width: w.toFixed(1) + 'px', height: h.toFixed(1) + 'px' });
          tf(sb, { o: clamp(ks * 3), s: .8 + .2 * EZ.back(ks) * (1 - .04 * Math.sin(Math.PI * pr(t, tEnd + .1, tEnd + .3))) });
          const n = Math.floor(clamp((t - c1) / Math.max(.01, tEnd - c1)) * [...word].length + 1e-6);
          html(q, esc([...word].slice(0, n).join('')) + (t < cs && Math.floor(t * 3.2) % 2 === 0 ? '<span class="mk-caret">▍</span>' : ''));
          q.style.fontSize = G.qs + 'px';
          key.classList.toggle('on', t > tEnd + .1 && t < tEnd + .45);
          const kc = pr(t, cs + .1, cs + .7); tf(cd, { o: clamp(kc * 4) }); cd.style.clipPath = `inset(0 0 ${((1 - EZ.out5(kc)) * 100).toFixed(2)}% 0 round 20px)`;
          const kt = pr(t, cs + .35, cs + .8); tf(ttl, { o: clamp(kt * 3), y: (1 - EZ.expo(kt)) * 24 });
          if (mt) { const k = pr(t, cs + .5, cs + .9); tf(mt, { o: clamp(k * 3), x: (1 - EZ.expo(k)) * -20 }); }
          const kr = pr(t, cs + .55, cs + 1); tf(hr, { sx: EZ.inout(kr), o: kr > 0 ? 1 : 0 });
          /* 骨架屏：cue 前后闪烁，0.45 秒后被正文替换 */
          const sOn = pr(t, cs + .7, cs + 1) * (1 - pr(t, c2 + .35, c2 + .55));
          tf(sk, { o: sOn }); sk.style.setProperty('--sk', `${(phase(t, 0, 1.1) * 300 - 100).toFixed(1)}%`);
          const kd = pr(t, c2 + .4, c2 + .9); tf(df, { o: clamp(kd * 2) }); df.style.clipPath = kd < 1 ? `inset(0 0 ${((1 - EZ.inout(kd)) * 100).toFixed(1)}% 0)` : '';
          df.style.setProperty('--lk', (.5 + .5 * Math.sin(t * 3)).toFixed(3));
          if (ex) { const k = pr(t, c3, c3 + .5); tf(ex, { o: clamp(k * 3), x: (1 - EZ.out5(k)) * 50 }); ex.style.setProperty('--bar', EZ.inout(pr(t, c3, c3 + .45)).toFixed(3)); }
        };
        BG = (c, t, a) => MK.fx.glow(c, area.x + area.w / 2, area.y + top + 60, area.w * .4, T().a, a * .35 * pr(t, c1, c1 + .6));
      } else {
        const nt = el('div', 'nt mk-abs', wrap), tape = el('i', 'tape mk-abs', nt);
        const term = el('div', 'term mk-abs', nt, `<span>${rich(p.term)}</span>`), mt = meta.length ? el('div', 'mt mk-abs', nt, meta.join('<i>·</i>')) : null;
        const hr = el('i', 'hr mk-abs', nt), df = el('div', 'df mk-abs', nt, rich(p.definition)), ex = p.example ? el('div', 'ex mk-abs', nt, `<b>e.g.</b> ${rich(p.example)}`) : null;
        const ink = svg(nt, 10, 10, '', 'ink');
        let nw = 700, nh = 500, circ = null, lines = [];
        ctx.measure(() => {
          const H = area.h - top; nw = P ? area.w * .94 : Math.min(area.w * .76, 780); const pad = P ? 50 : 54, iw = nw - pad * 2;
          let y = pad + 10;
          fit(term, P ? 100 : 92, 40, iw, H * .22); box(term, pad, y); y += term.offsetHeight + 2;
          if (mt) { fit(mt, 28, 18, iw, null); box(mt, pad, y); y += 42; }
          box(hr, pad, y + 10, iw); y += 34;
          fit(df, P ? 44 : 40, 22, iw, H * .34); box(df, pad, y); y += df.offsetHeight + 22;
          if (ex) { fit(ex, P ? 34 : 32, 18, iw, H * .16); box(ex, pad, y); y += ex.offsetHeight; }
          nh = Math.min(H - 16, y + pad); box(nt, (area.w - nw) / 2, top + (H - nh) / 2 + 6, nw); nt.style.height = nh + 'px';
          box(tape, nw / 2 - 90, -22, 180); tape.style.height = '46px';
          lines = lineRects(df, nt);
          const sp = term.firstChild, tw = sp.offsetWidth, th = sp.offsetHeight, cx = pad + tw / 2, cy = pad + 10 + th / 2, rx = tw / 2 + 30, ry = th / 2 + 12;
          const pts = Array.from({ length: 60 }, (_, k) => { const a = -2.6 + k / 59 * Math.PI * 2.15, j = 1 + (rnd(k, 71) - .5) * .04 + k / 59 * .06; return `${(cx + Math.cos(a) * rx * j).toFixed(1)} ${(cy + Math.sin(a) * ry * j).toFixed(1)}`; });
          ink.innerHTML = `<path d="M${pts.join(' L')}"/>`; circ = ink.firstChild;
          tc = { x: (area.w - nw) / 2 + cx, y: top + (H - nh) / 2 + cy };
        });
        S(c1 - .25, 'whoosh', .4); S(c1 + .05, 'thud', .6); S(c1 + .3, 'swipe', .35); S(c1 + .45, 'marker', .5, 0, { d: .5 });
        S(c2, 'marker', .4); S(c2 + .3, 'marker', .35);
        if (ex) S(c3, 'pop', .35); S(c3 + (ex ? .35 : 0), 'scratch', .5);
        U = t => {
          const k = pr(t, c1 - .25, c1 + .1), fl = idle(t, c1 + .6, 3.4);
          tf(nt, { o: clamp(k * 4), s: 1 + (1 - EZ.out5(k)) * .3, r: lerp(-10, -1.5, EZ.out5(k)) + fl.wave * .6 * pr(t, c1 + .6, c1 + 1.4), y: (1 - EZ.out5(k)) * -40 });
          nt.style.setProperty('--curl', (14 + 8 * Math.max(0, fl.wave) * pr(t, c1 + .6, c1 + 1.4)).toFixed(1) + 'px');
          const kt = pr(t, c1 + .25, c1 + .45); tf(tape, { o: clamp(kt * 4), sx: .4 + .6 * EZ.back(kt), r: 3 });
          const kw = pr(t, c1 + .4, c1 + .95); term.style.clipPath = `inset(-30% ${((1 - EZ.inout(kw)) * 100).toFixed(1)}% -30% 0)`;
          if (mt) { const km = pr(t, c1 + .85, c1 + 1.2); tf(mt, { o: km }); }
          const kr = pr(t, c1 + .9, c1 + 1.2); tf(hr, { sx: EZ.out(kr), o: kr > 0 ? 1 : 0 });
          /* 释义按行写出：每行从左往右揭开 */
          const nl = Math.max(1, lines.length), kd = pr(t, c2, c2 + .5 + nl * .35);
          tf(df, { o: kd > 0 ? 1 : 0 });
          if (lines.length) { const li = Math.min(nl - 1, Math.floor(kd * nl)), f = kd * nl - li, L = lines[li]; const dfTop = parseFloat(df.style.top), dfLeft = parseFloat(df.style.left); df.style.clipPath = kd >= 1 ? '' : `polygon(0 0,100% 0,100% ${(L.y - dfTop).toFixed(1)}px,${(L.x - dfLeft + L.w * f).toFixed(1)}px ${(L.y - dfTop).toFixed(1)}px,${(L.x - dfLeft + L.w * f).toFixed(1)}px ${(L.y - dfTop + L.h).toFixed(1)}px,0 ${(L.y - dfTop + L.h).toFixed(1)}px)`; }
          if (ex) { const ke = pr(t, c3, c3 + .4); tf(ex, { o: clamp(ke * 3), y: (1 - EZ.expo(ke)) * 16 }); }
          if (circ) { const cs = c3 + (ex ? .35 : 0); draw(circ, EZ.out(pr(t, cs, cs + .55))); circ.style.opacity = t > cs ? '1' : '0'; }
        };
        BG = (c, t, a) => MK.fx.glow(c, area.x + area.w / 2, area.y + area.h * .55, nw * .6, T().w, a * .3 * pr(t, c1, c1 + .5));
      }
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, y: -EZ.in(out) * 16 });
          if (kick) set(kick, { o: pr(t, slot.t0, slot.t0 + .4) });
          U(t);
        },
        bg(c, t) { BG(c, t, 1 - leave(t, slot)); },
        fg(c, t) { FG(c, t); },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- tip：小贴士 / 警告 ----------
     kind = tip（灯泡·暖色）/ warn（警示·红）/ info（信息·主色）/ ok（对勾·绿）
     banner 横幅从左展开，色块砸入，图标描线；warn 带滚动警示条纹
     card   图标徽章从上方弹跳落到卡片顶边，卡片向下展开
     bubble 圆形角色弹出，气泡从尾巴处长出，正文逐字打出
     停留：图标按类型呼吸（灯泡放光 / 警示抖动 / 信息脉冲 / 对勾闪星），扫光
     cue：出现 / 正文 */
  const KIND = { tip: { ic: 'idea', k: 'w', t: '小贴士' }, warn: { ic: 'alert', k: 'bad', t: '注意' }, info: { ic: 'info', k: 'a', t: '提示' }, ok: { ic: 'check', k: 'ok', t: '没问题' } };
  MK.control('tip', {
    variants: ['banner', 'card', 'bubble'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, K = KIND[p.kind || 'tip'] || KIND.tip;
      const wrap = tone(box(el('div', 'mk-abs mk-tip ' + v + ' ' + (p.kind || 'tip'), ctx.root), area.x, area.y, area.w, area.h), K.k);
      const kick = p.kicker ? box(el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)), 0, 0, area.w) : null;
      const top = kick ? 52 : 0;
      const c1 = slot.cues[0] ?? slot.t0 + .25, c2 = slot.cues[1] ?? Math.min(slot.t1 - 1.4, c1 + .6);
      const ttlS = p.title || K.t;
      let ic, bx = { x: 0, y: 0, d: 100 };
      const col = () => RGB(K.k);
      const wob = t => { const w = idle(t, c2 + 1, 2.4); return p.kind === 'warn' ? { r: Math.sin(t * 40) * 8 * Math.max(0, Math.sin(w.sweep * Math.PI * 2)) ** 8, s: 1 } : { r: 0, s: 1 + .06 * w.wave * pr(t, c2 + 1, c2 + 1.5) }; };
      let U = () => {};
      if (v === 'banner') {
        const st = el('div', 'st mk-abs', wrap), blk = el('div', 'blk mk-abs', st); ic = ico(blk, K.ic, 64, 2.2);
        const tt = el('div', 'tt mk-abs', st, rich(ttlS)), tx = el('div', 'tx mk-abs', st), tph = phraseEls(tx, p.text);
        const hz = p.kind === 'warn' ? el('i', 'hz mk-abs', st) : null;
        ctx.measure(() => {
          const bw = P ? 150 : 180, pad = 44, tw = area.w - bw - pad * 2;
          fit(tt, P ? 50 : 48, 26, tw, null); fit(tx, P ? 44 : 42, 22, tw, P ? area.h * .4 : area.h * .32);
          const h = Math.max(bw, pad * 2 + tt.offsetHeight + 12 + tx.offsetHeight);
          box(st, 0, top + (area.h - top - h) * (P ? .4 : .45), area.w); st.style.height = h + 'px';
          box(blk, 0, 0, bw); blk.style.height = h + 'px'; resize(ic, Math.min(bw * .46, 84));
          box(tt, bw + pad, (h - tt.offsetHeight - 12 - tx.offsetHeight) / 2); box(tx, bw + pad, parseFloat(tt.style.top) + tt.offsetHeight + 12);
          if (hz) { box(hz, bw, h - 12, area.w - bw); hz.style.height = '12px'; }
          bx = { x: bw / 2, y: parseFloat(st.style.top) + h / 2, d: bw };
        });
        S(c1 - .1, 'whoosh', .5); S(c1 + .12, 'thud', .55); S(c1 + .3, p.kind === 'warn' ? 'zap' : 'ding', .4, -.4, { m: 88 }); S(c2, 'swoosh', .3);
        punch(c1 + .12, .025);
        U = t => {
          const k = pr(t, c1 - .1, c1 + .45);
          tf(st, { o: clamp(k * 5) }); st.style.clipPath = `inset(-10% ${((1 - EZ.out5(k)) * 100).toFixed(2)}% -10% 0)`;
          const kb = pr(t, c1, c1 + .35), w = wob(t); tf(blk, { x: (1 - EZ.out5(kb)) * -200, sx: 1 + (1 - EZ.out(kb)) * .4 });
          tf(ic, { s: w.s * (.5 + .5 * EZ.spring(pr(t, c1 + .15, c1 + .6))), r: w.r }); drawIcon(ic, EZ.out(pr(t, c1 + .2, c1 + .8)));
          const kt = pr(t, c1 + .25, c1 + .65); tf(tt, { o: clamp(kt * 3), x: (1 - EZ.expo(kt)) * 40 });
          tf(tx, { o: 1 }); phraseIn(tph, t, c2, .8);
          shine(st, t, c2 + 1.2, 3.2);
          if (hz) hz.style.backgroundPositionX = `${(-(t - slot.t0) * 60).toFixed(1)}px`;
        };
      } else if (v === 'card') {
        const cd = el('div', 'cd mk-glass', wrap), bd = el('div', 'bdg mk-abs', wrap); ic = ico(bd, K.ic, 64, 2.2);
        const tt = el('div', 'tt mk-abs', cd, rich(ttlS)), tx = el('div', 'tx mk-abs', cd), tph = phraseEls(tx, p.text);
        ctx.measure(() => {
          const cw = P ? area.w : Math.min(area.w, 860), D = P ? 150 : 136, iw = cw - 100;
          [tt, tx].forEach(e => { e.style.textAlign = 'center'; });
          fit(tt, P ? 54 : 50, 26, iw, null); fit(tx, P ? 46 : 42, 22, iw, area.h * .36);
          const ch = D / 2 + 30 + tt.offsetHeight + 16 + tx.offsetHeight + 48, total = D / 2 + ch, cy = top + (area.h - top - total) / 2 + D / 2, cx = (area.w - cw) / 2;
          box(cd, cx, cy, cw); cd.style.height = ch + 'px'; cd.style.transformOrigin = '50% 0';
          box(tt, 50, D / 2 + 30); box(tx, 50, D / 2 + 30 + tt.offsetHeight + 16);
          box(bd, area.w / 2 - D / 2, cy - D / 2, D); bd.style.height = D + 'px'; resize(ic, D * .48);
          bx = { x: area.w / 2, y: cy, d: D };
        });
        S(c1 - .15, 'whoosh', .4); S(c1 + .25, 'thud', .55); S(c1 + .35, 'card', .35); S(c1 + .5, p.kind === 'warn' ? 'zap' : 'ding', .4, 0, { m: 91 }); S(c2, 'pop', .3);
        U = t => {
          const kd = pr(t, c1 - .15, c1 + .45), w = wob(t);
          tf(bd, { o: clamp(kd * 5), y: -(1 - EZ.bounce(kd)) * 260, r: w.r, s: w.s });
          drawIcon(ic, EZ.out(pr(t, c1 + .3, c1 + .9)));
          const kc = pr(t, c1 + .25, c1 + .75); tf(cd, { o: clamp(kc * 4), sy: .1 + .9 * EZ.back(kc) });
          const kt = pr(t, c1 + .5, c1 + .9); tf(tt, { o: clamp(kt * 3), y: (1 - EZ.expo(kt)) * 18 });
          tf(tx, { o: 1 }); phraseIn(tph, t, c2, .8);
          shine(cd, t, c2 + 1.2, 3.2);
        };
      } else {
        const ms = el('div', 'ms mk-abs', wrap); ic = ico(ms, K.ic, 64, 2.2);
        const bb = el('div', 'bb mk-abs', wrap), tt = el('div', 'tt mk-abs', bb, rich(ttlS)), tx = el('div', 'tx mk-abs', bb);
        const tl = el('i', 'tl mk-abs', bb), nTxt = MK.plainLen(p.text);
        let full = '';
        ctx.measure(() => {
          const D = P ? 150 : 160, bw = area.w - D - 34, pad = 40;
          tx.innerHTML = rich(p.text); fit(tt, 44, 24, bw - pad * 2, null); fit(tx, P ? 46 : 44, 22, bw - pad * 2, area.h * .42);
          full = p.text; const bh = pad + tt.offsetHeight + 12 + tx.offsetHeight + pad;
          const total = bh + D * .45, y0 = top + (area.h - top - total) / 2;
          box(bb, D + 34, y0, bw); bb.style.height = bh + 'px'; bb.style.transformOrigin = `-30px ${bh + 10}px`;
          box(tt, pad, pad); box(tx, pad, pad + tt.offsetHeight + 12); tx.style.height = tx.offsetHeight + 'px'; tx.innerHTML = '';
          box(tl, -26, bh - 64, 40); tl.style.height = '40px';
          box(ms, 0, y0 + bh - D * .55, D); ms.style.height = D + 'px'; resize(ic, D * .5);
          bx = { x: D / 2, y: y0 + bh - D * .55 + D / 2, d: D };
        });
        const tEnd = c2 + Math.min(1.5, nTxt * .06);
        S(c1 - .1, 'bubble', .5, -.3, { n: 0 }); S(c1 + .3, 'bubble', .45, 0, { n: 4 }); S(c2, 'type', .3, 0, { d: tEnd - c2 }); S(tEnd + .1, p.kind === 'warn' ? 'zap' : 'ding', .35, 0, { m: 93 });
        U = t => {
          const km = pr(t, c1 - .12, c1 + .45), w = wob(t), br = idle(t, c1 + .8, 2.2).wave * pr(t, c1 + .8, c1 + 1.3);
          tf(ms, { o: clamp(km * 4), s: (.2 + .8 * EZ.spring(km)) * (1 + .03 * br), r: (1 - EZ.out(km)) * -200 + w.r + br * 3 });
          tf(ic, { s: w.s }); drawIcon(ic, EZ.out(pr(t, c1 + .1, c1 + .7)));
          const kb = pr(t, c1 + .25, c1 + .8); tf(bb, { o: clamp(kb * 5), s: .1 + .9 * EZ.elastic(kb), y: Math.sin((t - c1) * 1.7) * 5 * pr(t, c1 + 1, c1 + 1.6) });
          const kt = pr(t, c1 + .45, c1 + .8); tf(tt, { o: clamp(kt * 3) });
          const n = Math.floor(clamp((t - c2) / Math.max(.01, tEnd - c2)) * nTxt + 1e-6);
          html(tx, MK.richUpTo(full, n) + (t >= c2 && t < tEnd + .6 && Math.floor(t * 3.2) % 2 === 0 ? '<span class="mk-caret">▍</span>' : ''));
        };
      }
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, y: -EZ.in(out) * 16 });
          if (kick) set(kick, { o: pr(t, slot.t0, slot.t0 + .4) });
          U(t);
        },
        bg(c, t) {
          const a = 1 - leave(t, slot), x = area.x + bx.x, y = area.y + bx.y;
          MK.fx.glow(c, x, y, bx.d * 2, col(), a * .7 * pr(t, c1, c1 + .5));
          for (let k = 0; k < 6; k++) { const t0 = c2 + 1 + k * 2.4; if (t0 < slot.t1 - .5) MK.fx.ripple(c, t, t0, x, y, { r: bx.d * 1.4, r0: bx.d * .45, col: col(), rings: 2, w: 2 * a }); }
          if (p.kind === 'tip' || !p.kind) {
            const k = pr(t, c1 + .5, c1 + 1) * a; c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineWidth = 3;
            for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2 + t * .4, r0 = bx.d * .62, r1 = bx.d * (.78 + .1 * Math.sin(t * 3 + i)); c.strokeStyle = `rgba(${col()},${.45 * k})`; c.beginPath(); c.moveTo(x + Math.cos(an) * r0, y + Math.sin(an) * r0); c.lineTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1); c.stroke(); }
            c.restore();
          }
        },
        fg(c, t) {
          const x = area.x + bx.x, y = area.y + bx.y;
          T().paint.burst(c, t, v === 'card' ? c1 + .25 : c1 + .12, x, y, { n: 22, sp: 520, col: col(), life: .7 });
          if (p.kind === 'ok') MK.fx.twinkle(c, t, x - bx.d, y - bx.d, bx.d * 2, bx.d * 2, 6, col(), pr(t, c2 + .8, c2 + 1.3) * (1 - leave(t, slot)));
        },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- checklist：待办清单逐项打勾 ----------
     todo      玻璃面板 + 计数 3/5 + 进度条；勾选时方框填色、对勾描出、文字划线变灰；完成章砸下
     clipboard 写字板夹着纸，手绘对勾冲出方框、手绘划线；圆形完成章盖下
     progress  分段进度环与清单同步：每勾一项，光点从该项飞向环上对应一段并点亮；满环后中心换成完成
     停留：下一项方框呼吸提示「轮到它」；完成后扫光
     cue：每项打勾、完成章 */
  MK.control('checklist', {
    variants: ['todo', 'clipboard', 'progress'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, n = p.items.length, done = p.done || '完成';
      const balanced = MotionNarrationLayout.enabled();
      const wrap = box(el('div', 'mk-abs mk-chk ' + v, ctx.root), area.x, area.y, area.w, area.h);
      if (balanced) wrap.classList.add('narration-balanced');
      const at = beats(slot, n, .9, .6, 2.1), cd = slot.cues[n] ?? Math.min(slot.t1 - 1.3, at[n - 1] + .75);
      const rowIn = i => slot.t0 + .2 + i * .07;
      const cntAt = t => at.filter(a => t >= a + .1).length;
      let U = () => {}, BG = () => {}, FG = () => {}, sc = { x: area.w / 2, y: area.h / 2 };
      const kick = p.kicker ? box(el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)), 0, 0, area.w) : null;
      const top = kick ? 50 : 0;
      at.forEach((a, i) => { S(a, v === 'clipboard' ? 'marker' : 'check', v === 'clipboard' ? .5 : .5, 0, { n: i, d: .2 }); if (v === 'clipboard') S(a + .02, 'tick', .3); S(a + .2, v === 'progress' ? 'blip' : 'scratch', .2, 0, { n: i * 2 }); });
      S(slot.t0 + .1, 'swoosh', .4);
      if (v === 'progress') { S(cd, 'chime', .45); S(cd + .1, 'tada', .5); } else { S(cd - .05, 'whoosh', .4); S(cd + .05, 'stamp', .8); S(cd + .25, 'tada', .45); shake(cd + .05, 9); flash(cd + .05, .15); }
      punch(cd + .05, .03);
      if (v !== 'progress') {
        const cb = v === 'clipboard';
        const pn = el('div', cb ? 'bd mk-abs' : 'pn mk-glass', wrap);
        const clip = cb ? el('i', 'clip mk-abs', pn) : null, paper = cb ? el('div', 'pp mk-abs', pn) : pn;
        const tt = el('div', 'tt mk-abs', paper, rich(p.title || '')), cnt = el('div', 'cnt mk-abs', paper), bar = cb ? null : el('i', 'bar mk-abs', paper, '<b></b>');
        const rows = p.items.map((s, i) => { const r = el('div', 'row mk-abs', paper), bx_ = el('div', 'box', r), tx = el('div', 'tx', r, `<span>${rich(s)}</span>`); return { r, bx: bx_, tx, i }; });
        const ink = svg(paper, 10, 10, '', 'ink');
        const stamp = el('div', 'stp mk-abs', cb ? pn : wrap, cb ? `<span>${esc(done)}</span>` : MK.icon('check', 54, 3) + `<span>${esc(done)}</span>`);
        let ck = [], stk = [], pw = 900, ph = 600, px = 0, py = 0;
        ctx.measure(() => {
          pw = P ? area.w : Math.min(area.w, cb ? 860 : 920); const H = area.h - top;
          ph = balanced ? Math.min(H, (p.title ? 140 : 110) + n * 76 + 160 + (cb ? 80 : 0)) : H; px = (area.w - pw) / 2; py = top + (balanced ? (H - ph) / 2 : 0);
          box(pn, px, py, pw); pn.style.height = ph + 'px';
          const inset = cb ? { x: 26, y: 56 } : { x: 0, y: 0 }, iw = pw - inset.x * 2, ih = ph - inset.y - (cb ? 22 : 0);
          if (cb) { box(paper, inset.x, inset.y, iw); paper.style.height = ih + 'px'; box(clip, pw / 2 - 110, -14, 220); clip.style.height = '66px'; }
          const pad = P ? 40 : 46;
          cnt.textContent = `${n}/${n}`; cnt.style.fontSize = '40px'; cnt.style.width = 'auto'; const cw = cnt.offsetWidth; box(cnt, iw - pad - cw, pad - 2); cnt.style.width = cw + 'px';
          let y = pad;
          if (p.title) { fit(tt, P ? 50 : 46, 26, iw - pad * 2 - cw - 24, null); box(tt, pad, y); tt.style.width = (iw - pad * 2 - cw - 24) + 'px'; y += Math.max(tt.offsetHeight, 50); } else y += 50;
          if (bar) { box(bar, pad, y + 14, iw - pad * 2); y += 38; } else y += 22;
          const rh = Math.min(P ? 88 : 80, (ih - y - pad + 10 - (balanced ? 160 : 0)) / n), bs = Math.round(Math.min(48, rh * .6));
          rows.forEach((r, i) => {
            box(r.r, pad, y + i * rh, iw - pad * 2); r.r.style.height = rh + 'px';
            Object.assign(r.bx.style, { width: bs + 'px', height: bs + 'px' });
            fit(r.tx, Math.min(42, rh * .54), 20, iw - pad * 2 - bs - 26, null);
          });
          /* 对勾与划线：画在纸面坐标里（手绘版带抖动并冲出方框） */
          const pr_ = paper.getBoundingClientRect();
          let d1 = '', d2 = '';
          rows.forEach((r, i) => {
            const b = r.bx.getBoundingClientRect(), x = b.left - pr_.left, yy = b.top - pr_.top, s = b.width;
            d1 += cb ? `<path d="M${(x + s * .1).toFixed(1)} ${(yy + s * .5).toFixed(1)} Q${(x + s * .3).toFixed(1)} ${(yy + s * .7).toFixed(1)} ${(x + s * .42).toFixed(1)} ${(yy + s * .92).toFixed(1)} Q${(x + s * .7).toFixed(1)} ${(yy + s * .2).toFixed(1)} ${(x + s * 1.3).toFixed(1)} ${(yy - s * .3).toFixed(1)}"/>`
              : `<path d="M${(x + s * .24).toFixed(1)} ${(yy + s * .52).toFixed(1)} L${(x + s * .43).toFixed(1)} ${(yy + s * .71).toFixed(1)} L${(x + s * .78).toFixed(1)} ${(yy + s * .32).toFixed(1)}"/>`;
            const L = lineRects(r.tx.firstChild, paper)[0] || { x: 0, y: 0, w: 10, h: 10 };
            d2 += `<path d="${cb ? hand(L.x - 6, L.y + L.h * .56, L.x + L.w + 10, L.y + L.h * .5, 30 + i, .02) : `M${(L.x - 4).toFixed(1)} ${(L.y + L.h * .55).toFixed(1)} L${(L.x + L.w + 4).toFixed(1)} ${(L.y + L.h * .55).toFixed(1)}`}"/>`;
          });
          ink.innerHTML = `<g class="ck">${d1}</g><g class="st">${d2}</g>`; ck = [...ink.querySelectorAll('.ck path')]; stk = [...ink.querySelectorAll('.st path')];
          const sw = cb ? Math.min(balanced ? 160 : 220, ih * .45) : 0;
          if (cb) { box(stamp, pw - sw - 40, ph - sw - 50, sw); stamp.style.height = sw + 'px'; stamp.style.fontSize = (sw * .28).toFixed(0) + 'px'; }
          else { stamp.style.fontSize = (balanced ? (P ? 48 : 46) : (P ? 66 : 64)) + 'px'; stamp.style.width = 'auto'; const w = stamp.offsetWidth; box(stamp, px + pw - w - 30, py + ph - stamp.offsetHeight - 30); stamp.style.width = w + 'px'; }
          sc = { x: cb ? px + pw - sw / 2 - 40 : parseFloat(stamp.style.left) + stamp.offsetWidth / 2, y: cb ? py + ph - sw / 2 - 50 : parseFloat(stamp.style.top) + stamp.offsetHeight / 2 };
        });
        U = t => {
          const k = pr(t, slot.t0, slot.t0 + .6);
          tf(pn, cb ? { o: clamp(k * 4), y: (1 - EZ.back(k)) * 200, r: (1 - EZ.out(k)) * 5 + Math.sin(t * 1.1) * .4 * pr(t, cd + .6, cd + 1.2) } : { o: clamp(k * 4), y: (1 - EZ.expo(k)) * 40, s: .97 + .03 * EZ.out(k) });
          tf(tt, { o: pr(t, slot.t0 + .15, slot.t0 + .5) });
          const nd = cntAt(t), lastA = nd ? at[nd - 1] + .1 : 0, kp = pr(t, lastA, lastA + .3);
          html(cnt, `<b>${nd}</b>/${n}`); tf(cnt, { o: pr(t, slot.t0 + .2, slot.t0 + .5), s: 1 + (nd ? (1 - EZ.out(kp)) * .3 : 0), y: nd ? (1 - EZ.back(kp)) * 10 : 0 });
          if (bar) { const f = at.reduce((s, a) => s + EZ.out(pr(t, a + .05, a + .5)), 0) / n; bar.firstChild.style.width = (f * 100).toFixed(2) + '%'; }
          const next = nd < n ? nd : -1;
          rows.forEach((r, i) => {
            const a = at[i], ki = pr(t, rowIn(i), rowIn(i) + .45), kc = pr(t, a, a + .3), ks = pr(t, a + .12, a + .5);
            tf(r.r, { o: clamp(ki * 3), x: (1 - EZ.out5(ki)) * -40 + Math.sin(Math.PI * kc) * 12 });
            const pulse = i === next && t > rowIn(i) + .5 ? .5 + .5 * Math.sin((t - slot.t0) * 6) : 0;
            r.bx.style.setProperty('--pl', pulse.toFixed(3));
            tf(r.bx, { s: t >= a ? .7 + .3 * EZ.spring(kc) : 1 + pulse * .06 });
            r.r.classList.toggle('on', t >= a + .05);
            draw(ck[i], EZ.out(kc)); ck[i].style.opacity = t >= a ? '1' : '0';
            draw(stk[i], EZ.inout(ks)); stk[i].style.opacity = t >= a + .12 ? '1' : '0';
          });
          const ks = pr(t, cd - .05, cd + .3);
          tf(stamp, { o: clamp(ks * 5), s: 1 + (1 - EZ.out5(ks)) * 1.6 + .03 * idle(t, cd + .6, 2.4).wave * pr(t, cd + .6, cd + 1), r: -14 + (1 - EZ.out5(ks)) * 18 });
          if (!cb) shine(pn, t, cd + .7, 3.2);
        };
        FG = (c, t) => { T().paint.burst(c, t, cd + .05, area.x + sc.x, area.y + sc.y, { n: 36, sp: 800, col: T().g }); MK.fx.confetti(c, t, cd + .1, area.x + sc.x, area.y + sc.y, { n: 50, sp: 1100 }); };
      } else {
        const rg = el('div', 'rg mk-abs', wrap), rs = svg(rg, 10, 10, '', 'ring'), ctr = el('div', 'ctr mk-abs', rg, '<b class="pc"></b><span class="fr"></span>');
        const fin = el('div', 'fin mk-abs', rg, MK.icon('check', 60, 3) + `<span>${esc(done)}</span>`), pc = ctr.querySelector('.pc'), fr = ctr.querySelector('.fr');
        const tt = p.title ? el('div', 'mk-cpt-t mk-abs', wrap, rich(p.title)) : null;
        const rows = p.items.map((s, i) => { const r = el('div', 'row mk-abs', wrap), d = el('div', 'dot', r), ic = ico(d, 'check', 26, 3.2), tx = el('div', 'tx', r, rich(s)); return { r, d, ic, tx }; });
        let D = 360, segs = [], ring = { x: 0, y: 0 }, ends = [], mids = [];
        ctx.measure(() => {
          const H = area.h - top;
          D = P ? Math.min(310, H * .42) : Math.min(H - 20, area.w * .38, 420);
          const rx = P ? (area.w - D) / 2 : 0, ry = P ? top : top + (H - D) / 2;
          box(rg, rx, ry, D); rg.style.height = D + 'px';
          rs.setAttribute('width', D); rs.setAttribute('height', D); rs.setAttribute('viewBox', `0 0 ${D} ${D}`);
          const R = D / 2 - 16, c0 = D / 2, gap = n > 1 ? 5 : 0, pt = a => `${(c0 + Math.cos(a * Math.PI / 180) * R).toFixed(1)} ${(c0 + Math.sin(a * Math.PI / 180) * R).toFixed(1)}`;
          rs.innerHTML = `<circle class="trk" cx="${c0}" cy="${c0}" r="${R}"/>` + Array.from({ length: n }, (_, i) => { const a0 = -90 + i * 360 / n + gap / 2, a1 = -90 + (i + 1) * 360 / n - gap / 2; mids.push((a0 + a1) / 2); return `<path d="M${pt(a0)} A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${pt(a1)}"/>`; }).join('');
          segs = [...rs.querySelectorAll('path')];
          box(ctr, 0, D * .26, D); box(fin, 0, D * .3, D);
          pc.style.fontSize = (D * .26).toFixed(0) + 'px'; fr.style.fontSize = (D * .075).toFixed(0) + 'px'; fin.style.fontSize = (D * .12).toFixed(0) + 'px'; resize(fin, D * .2);
          ring = { x: rx + c0, y: ry + c0, R };
          const lx = P ? 0 : D + 70, lw = area.w - lx; let y = P ? ry + D + 30 : top;
          if (tt) { fit(tt, P ? 50 : 48, 26, lw, null); box(tt, lx, y); tt.style.textAlign = P ? 'center' : 'left'; y += tt.offsetHeight + 16; }
          const avail = area.h - y, rh = Math.min(P ? 70 : 80, avail / n), y0 = P ? y : y + (avail - rh * n) / 2;
          rows.forEach((r, i) => { box(r.r, lx, y0 + i * rh, lw); r.r.style.height = rh + 'px'; const ds = Math.round(Math.min(44, rh * .6)); Object.assign(r.d.style, { width: ds + 'px', height: ds + 'px' }); resize(r.ic, ds * .6); fit(r.tx, Math.min(40, rh * .52), 20, lw - ds - 24, null); ends[i] = [lx + ds / 2, y0 + i * rh + rh / 2]; });
          sc = { x: ring.x, y: ring.y };
        });
        const segAt = i => { const a = mids[i] * Math.PI / 180; return [ring.x + Math.cos(a) * ring.R, ring.y + Math.sin(a) * ring.R]; };
        U = t => {
          const k = pr(t, slot.t0, slot.t0 + .6); tf(rg, { o: clamp(k * 4), s: .7 + .3 * EZ.back(k), r: (1 - EZ.out(k)) * -60 });
          if (tt) { const kt = pr(t, slot.t0 + .1, slot.t0 + .6); tf(tt, { o: clamp(kt * 3), y: (1 - EZ.expo(kt)) * 20 }); }
          const f = at.reduce((s, a) => s + EZ.out(pr(t, a + .28, a + .6)), 0) / n, nd = cntAt(t), kf = pr(t, cd, cd + .45);
          segs.forEach((s, i) => { draw(s, EZ.back(pr(t, at[i] + .28, at[i] + .62))); s.style.opacity = t >= at[i] + .28 ? '1' : '0'; });
          rg.classList.toggle('full', t >= cd);
          html(pc, `${Math.round(f * 100)}<small>%</small>`); html(fr, `${nd} / ${n}`);
          tf(ctr, { o: clamp(k * 3) * (1 - clamp(kf * 3)), s: 1 + .08 * Math.sin(Math.PI * pr(t, (nd ? at[nd - 1] : 0) + .3, (nd ? at[nd - 1] : 0) + .6)) });
          tf(fin, { o: clamp(kf * 3), s: .4 + .6 * EZ.spring(kf) + .04 * idle(t, cd + .7, 2.4).wave * pr(t, cd + .7, cd + 1.1) });
          rg.style.setProperty('--rot', `${((t - slot.t0) * 20).toFixed(1)}deg`);
          const next = nd < n ? nd : -1;
          rows.forEach((r, i) => {
            const a = at[i], ki = pr(t, rowIn(i), rowIn(i) + .45), kc = pr(t, a, a + .35), pulse = i === next && t > rowIn(i) + .5 ? .5 + .5 * Math.sin((t - slot.t0) * 6) : 0;
            tf(r.r, { o: clamp(ki * 3), x: (1 - EZ.out5(ki)) * 50 });
            tf(r.d, { s: t >= a ? .6 + .4 * EZ.spring(kc) : 1 + pulse * .1 }); r.d.style.setProperty('--pl', pulse.toFixed(3));
            drawIcon(r.ic, EZ.out(kc)); r.r.classList.toggle('on', t >= a);
          });
        };
        BG = (c, t, a) => { MK.fx.glow(c, area.x + ring.x, area.y + ring.y, D * .8, t >= cd ? T().g : T().a, a * (.35 + .25 * idle(t, slot.t0, 2.6).wave)); MK.fx.ripple(c, t, cd, area.x + ring.x, area.y + ring.y, { r: D * .7, r0: D * .45, col: T().g, rings: 3 }); };
        FG = (c, t) => {
          at.forEach((a, i) => { const [x0, y0] = ends[i] || [0, 0], [x1, y1] = segAt(i), mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 60; MK.fx.comet(c, [[x0, y0], [mx, my], [x1, y1]].map(([x, y]) => [area.x + x, area.y + y]), EZ.inout(pr(t, a, a + .32)), T().g, 1); T().paint.burst(c, t, a + .32, area.x + x1, area.y + y1, { n: 12, sp: 300, life: .5, col: T().g, seed: i }); });
          MK.fx.confetti(c, t, cd + .05, area.x + ring.x, area.y + ring.y, { n: 60, sp: 1200 });
        };
      }
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, y: -EZ.in(out) * 16 });
          if (kick) set(kick, { o: pr(t, slot.t0, slot.t0 + .4) });
          U(t);
        },
        bg(c, t) { BG(c, t, 1 - leave(t, slot)); },
        fg(c, t) { FG(c, t); },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- vs：两方对决 ----------
     fight 格斗游戏：两侧斜切头像板冲入相撞，VS 爆闪带闪电；属性条从中间向两边对冲；胜方光环 + 王冠，败方褪色
     scale 拔河比例条：头像滚入，每项属性一条双色比例条，交界点弹性拉向占优一方
     cards 对战卡牌：两张卡背面朝上飞入翻开，逐项比数值，胜方卡浮起镭射扫光 + WIN 标，败方后仰变灰
     A 用主色、B 用暖色；数值默认越大越好（low: true 反之）；winner 缺省按胜项数
     cue：双方冲入 / VS / 每项属性 / 胜方 */
  MK.control('vs', {
    variants: ['fight', 'scale', 'cards'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, st = p.stats || [], ns = st.length, sides = [p.a, p.b];
      const wrap = box(el('div', 'mk-abs mk-duel ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const kick = p.kicker ? box(el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)), 0, 0, area.w) : null;
      if (kick) kick.style.textAlign = 'center';
      const top = kick ? 50 : 0;
      const sw = st.map(s => (s.a === s.b ? 0 : ((s.a > s.b) !== !!s.low ? -1 : 1)));
      const W = p.winner ? (p.winner === 'a' ? -1 : p.winner === 'b' ? 1 : 0) : Math.sign(sw.reduce((a, b) => a + b, 0));
      const c1 = slot.cues[0] ?? slot.t0 + .2, cv = slot.cues[1] ?? c1 + .65;
      const sa = st.map((_, i) => slot.cues[2 + i] ?? cv + .85 + i * .7), cw = slot.cues[2 + ns] ?? Math.min(slot.t1 - 1.3, (ns ? sa[ns - 1] : cv) + .95);
      const dec = st.map(s => MK.decOf(s.a, s.b)), num = (s, side, i, k) => MK.fmt(lerp(0, side ? s.b : s.a, k), dec[i]) + (s.unit ? `<small>${esc(s.unit)}</small>` : '');
      const face = (parent, o, cls) => { const f = el('div', cls, parent), im = el('img', '', f), ph = el('div', 'ini', f, esc(initial(o.name))); const has = !!(o.$media && o.$media.src); im.style.display = has ? '' : 'none'; ph.style.display = has ? 'none' : ''; if (has) ctx.mediaOf(im, o, 'src'); return { f, im, has, o }; };
      const frame = (fc, t) => { if (fc.has) ctx.frameAt(fc.im, fc.o, t, 'src'); };
      let U = () => {}, BG = () => {}, FG = () => {}, wp = { x: area.w / 2, y: area.h / 2, r: 200 }, vp = { x: area.w / 2, y: area.h / 2 };
      const winSide = W < 0 ? 0 : 1;
      if (v === 'fight') {
        const pns = sides.map((o, i) => { const pn = tone(el('div', `pn mk-abs ${i ? 'b' : 'a'}`, wrap), i ? 'w' : 'a'), sk = el('div', 'sk', pn), fc = face(sk, o, 'fc'); const nm = el('div', 'nm', pn, `<b>${rich(o.name)}</b>${o.tag ? `<span>${esc(o.tag)}</span>` : ''}`); const cr = el('div', 'cr mk-abs', pn, MK.icon('crown', 56, 2)); return { pn, sk, fc, nm, cr }; });
        const vs = el('div', 'vsx mk-abs', wrap, 'VS');
        const rows = st.map((s, i) => { const r = el('div', 'sr mk-abs', wrap); const lb = el('div', 'lb mk-abs', r, esc(s.label)); const bars = [0, 1].map(j => { const b = tone(el('div', `br mk-abs ${j ? 'b' : 'a'}`, r, '<i></i>'), j ? 'w' : 'a'); const nv = el('div', `nv mk-abs ${j ? 'b' : 'a'}`, r); return { b, f: b.firstChild, nv }; }); return { r, lb, bars, s, i }; });
        let G = { pw: 400, ph: 300, py: 0, rh: 70, bw: 300 };
        ctx.measure(() => {
          const H = area.h - top, gap = P ? 110 : 170, rh = P ? 76 : 66, sH = ns * rh + (ns ? 16 : 0);
          const pw = Math.min((area.w - gap) / 2, 460), ph = Math.min(P ? 360 : 330, H - sH - 80), py = top + 60 + Math.max(0, (H - 60 - ph - sH - 10) / 2);
          pns.forEach((o, i) => {
            box(o.pn, i ? area.w / 2 + gap / 2 : area.w / 2 - gap / 2 - pw, py, pw); o.pn.style.height = ph + 'px';
            const b = o.nm.querySelector('b'); fit(b, P ? 56 : 54, 26, pw - 60, null); if (o.nm.querySelector('span')) fit(o.nm.querySelector('span'), 22, 14, pw - 60, null);
            box(o.cr, pw / 2 - 36, -66, 72); o.cr.style.height = '72px';
          });
          vs.style.fontSize = (P ? 120 : 150) + 'px'; box(vs, area.w / 2 - 160, py + ph / 2 - (P ? 66 : 82), 320);
          const bw = Math.min(area.w / 2 - 90, 520);
          rows.forEach((r, i) => {
            box(r.r, 0, py + ph + 26 + i * rh, area.w); r.r.style.height = rh + 'px';
            box(r.lb, area.w / 2 - 80, 0, 160); fit(r.lb, 26, 16, 150, null);
            r.bars.forEach((b, j) => { box(b.b, j ? area.w / 2 + 80 : area.w / 2 - 80 - (bw - 80), rh * .5, bw - 80); b.b.style.height = '18px'; b.nv.style.fontSize = (P ? 30 : 28) + 'px'; box(b.nv, j ? area.w / 2 + 80 : area.w / 2 - 80 - (bw - 80), 0, bw - 80); b.nv.style.textAlign = j ? 'right' : 'left'; });
          });
          G = { pw, ph, py, rh, bw, gap };
          vp = { x: area.w / 2, y: py + ph / 2 };
          wp = { x: W < 0 ? area.w / 2 - gap / 2 - pw / 2 : area.w / 2 + gap / 2 + pw / 2, y: py + ph / 2, r: Math.max(pw, ph) * .75 };
        });
        S(c1 - .15, 'whoosh', .5, -.6); S(c1 - .1, 'whoosh', .5, .6); S(c1 + .22, 'hit', .75); shake(c1 + .22, 8);
        S(cv - .1, 'riser', .3, 0, { d: .2 }); S(cv, 'boom', .7); S(cv + .02, 'zap', .55); flash(cv, .4); shake(cv, 14); punch(cv, .05);
        sa.forEach((a, i) => { S(a, 'fill', .3, 0, { d: .5 }); S(a + .55, sw[i] ? 'coin' : 'tick', .35, sw[i] * .5); });
        if (W) { S(cw, 'cymbal', .4); S(cw + .1, 'tada', .5, W * .5); }
        U = t => {
          pns.forEach((o, i) => {
            const s = i ? 1 : -1, k = pr(t, c1 - .15, c1 + .25), win = W === 0 ? 0 : (i === winSide ? 1 : -1), kw = pr(t, cw, cw + .5);
            const rec = t > c1 + .2 && t < c1 + .7 ? Math.sin((t - c1 - .2) * 30) * 10 * Math.exp(-(t - c1 - .2) * 8) * -s : 0;
            tf(o.pn, { o: clamp(k * 6) * (win < 0 ? 1 - .5 * kw : 1), x: s * (1 - EZ.out5(k)) * area.w * .7 + rec, s: 1 + (win > 0 ? .05 * EZ.back(kw) : win < 0 ? -.05 * kw : 0), y: win < 0 ? 14 * kw : 0, blur: (1 - k) * 14 });
            o.fc.im.style.filter = win < 0 ? `grayscale(${kw.toFixed(2)})` : ''; o.pn.classList.toggle('lose', win < 0 && kw > .4); o.pn.classList.toggle('win', win > 0 && kw > .2);
            frame(o.fc, t);
            const kn = pr(t, c1 + .2, c1 + .55); tf(o.nm, { o: clamp(kn * 3), x: (1 - EZ.out5(kn)) * s * -40 });
            const kc = pr(t, cw + .1, cw + .55); tf(o.cr, { o: win > 0 ? clamp(kc * 4) : 0, y: -(1 - EZ.bounce(kc)) * 120, r: Math.sin(t * 3) * 4 });
          });
          const kv = pr(t, cv - .05, cv + .35), jit = t > cv + .5 ? Math.sin(t * 50) * 1.5 : 0;
          tf(vs, { o: clamp(kv * 5), s: 1 + (1 - EZ.out5(kv)) * 2.4 + .04 * idle(t, cv + .6, 1.4).wave, r: (1 - EZ.out(kv)) * -20 + jit });
          rows.forEach(r => {
            const a = sa[r.i], k = pr(t, a - .1, a + .25), kb = pr(t, a, a + .6), mx = Math.max(Math.abs(r.s.a), Math.abs(r.s.b)) || 1;
            tf(r.lb, { o: clamp(k * 3), s: .6 + .4 * EZ.back(k) });
            r.bars.forEach((b, j) => {
              const val = j ? r.s.b : r.s.a, wins = sw[r.i] === (j ? 1 : -1), dim = sw[r.i] && !wins && t > a + .6;
              tf(b.b, { o: clamp(k * 3) * (dim ? .45 : 1) }); b.f.style.width = (Math.abs(val) / mx * EZ.out5(kb) * 100).toFixed(2) + '%';
              b.b.classList.toggle('hi', wins && t > a + .55);
              html(b.nv, num(r.s, j, r.i, EZ.out(kb))); tf(b.nv, { o: clamp(k * 3) * (dim ? .5 : 1), s: wins ? 1 + .25 * Math.sin(Math.PI * pr(t, a + .55, a + .85)) : 1 });
            });
          });
        };
        BG = (c, t, a) => {
          /* 冲入时的速度线 */
          const ks = pr(t, c1 - .2, c1 + .35);
          if (ks > 0 && ks < 1) { c.save(); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 18; i++) { const y = area.y + G.py + rnd(i, 61) * G.ph, L = 200 + 300 * rnd(i, 62), x = area.x + area.w / 2 + (i % 2 ? 1 : -1) * (area.w * .5 * (1 - ks) + 40 + rnd(i, 63) * 200); c.strokeStyle = `rgba(${i % 2 ? T().w : T().a},${.5 * (1 - ks)})`; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (i % 2 ? L : -L), y); c.stroke(); } c.restore(); }
          MK.fx.glow(c, area.x + vp.x, area.y + vp.y, 260, T().w, a * .7 * pr(t, cv, cv + .3) * (.7 + .3 * Math.sin(t * 8)));
          if (W) { const k = pr(t, cw, cw + .5) * a; MK.fx.glow(c, area.x + wp.x, area.y + wp.y, wp.r * (1.1 + .08 * Math.sin(t * 4)), W < 0 ? T().a : T().w, k); c.save(); c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 16; i++) { const an = i / 16 * Math.PI * 2 + t * .6, r0 = wp.r * .55, r1 = wp.r * 1.05; c.strokeStyle = `rgba(${W < 0 ? T().a : T().w},${.25 * k})`; c.lineWidth = 10; c.beginPath(); c.moveTo(area.x + wp.x + Math.cos(an) * r0, area.y + wp.y + Math.sin(an) * r0); c.lineTo(area.x + wp.x + Math.cos(an) * r1, area.y + wp.y + Math.sin(an) * r1); c.stroke(); } c.restore(); }
        };
        FG = (c, t) => {
          T().paint.burst(c, t, c1 + .22, area.x + vp.x, area.y + vp.y, { n: 30, sp: 700, life: .6 });
          T().paint.burst(c, t, cv, area.x + vp.x, area.y + vp.y, { n: 60, sp: 1300, col: T().w });
          /* VS 闪电：几条锯齿折线，闪烁 0.5 秒 */
          const lt = t - cv; if (lt > 0 && lt < .55 && Math.floor(lt * 30) % 2 === 0) {
            c.save(); c.globalCompositeOperation = 'lighter'; c.lineJoin = 'round';
            for (let i = 0; i < 5; i++) { const an = i / 5 * Math.PI * 2 + rnd(i, 64), L = 160 + 120 * rnd(i, 65); let x = area.x + vp.x, y = area.y + vp.y; c.strokeStyle = `rgba(${T().aLite},${.9 * (1 - lt / .55)})`; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y); for (let j = 1; j <= 6; j++) { const q = j / 6 * L, off = (rnd(i * 10 + j + Math.floor(lt * 30), 66) - .5) * 50; x = area.x + vp.x + Math.cos(an) * q - Math.sin(an) * off; y = area.y + vp.y + Math.sin(an) * q + Math.cos(an) * off; c.lineTo(x, y); } c.stroke(); }
            c.restore();
          }
          if (W) MK.fx.confetti(c, t, cw + .1, area.x + wp.x, area.y + wp.y - G.ph * .3, { n: 50, sp: 1000 });
        };
      } else if (v === 'scale') {
        const hs = sides.map((o, i) => { const h = tone(el('div', `hd mk-abs ${i ? 'b' : 'a'}`, wrap), i ? 'w' : 'a'); const fc = face(h, o, 'av'); const nm = el('div', 'nm', h, `<b>${rich(o.name)}</b>${o.tag ? `<span>${esc(o.tag)}</span>` : ''}`); const cr = el('div', 'cr mk-abs', h, MK.icon('crown', 44, 2)); return { h, fc, nm, cr }; });
        const vs = el('div', 'vsb mk-abs', wrap, 'VS');
        const rows = st.map((s, i) => { const r = el('div', 'sr mk-abs', wrap); const lb = el('div', 'lb mk-abs', r, esc(s.label)); const nv = [0, 1].map(j => el('div', `nv mk-abs ${j ? 'b' : 'a'}`, r)); const tr = el('div', 'tr mk-abs', r, '<i class="fa"></i><i class="fb"></i>'); const kn = el('div', 'kn mk-abs', r); return { r, lb, nv, tr, fa: tr.children[0], fb: tr.children[1], kn, s, i }; });
        let G = { D: 120, tw: 800, tx: 0 };
        ctx.measure(() => {
          const H = area.h - top, D = P ? 132 : 120, rh = Math.min(P ? 150 : 120, (H - D - 60) / Math.max(1, ns));
          const y0 = top + Math.max(0, (H - D - 50 - rh * ns) / 2);
          hs.forEach((o, i) => {
            o.h.style.flexDirection = i ? 'row-reverse' : 'row'; box(o.h, i ? area.w / 2 + 60 : 0, y0, area.w / 2 - 60); o.h.style.height = D + 'px';
            Object.assign(o.fc.f.style, { width: D + 'px', height: D + 'px' }); o.fc.f.querySelector('.ini').style.fontSize = (D * .45) + 'px';
            const b = o.nm.querySelector('b'); fit(b, P ? 46 : 44, 22, area.w / 2 - 60 - D - 30, null); if (i) o.nm.style.textAlign = 'right';
            const sp = o.nm.querySelector('span'); if (sp) fit(sp, 22, 14, area.w / 2 - 60 - D - 30, null);
            box(o.cr, i ? area.w / 2 - 60 - D / 2 - 30 : D / 2 - 30, -46, 60); o.cr.style.height = '60px';
          });
          box(vs, area.w / 2 - 50, y0 + D / 2 - 30, 100); vs.style.height = '60px';
          const tw = area.w; G = { D, tw, y0, rh };
          rows.forEach((r, i) => {
            const y = y0 + D + 50 + i * rh; box(r.r, 0, y, area.w); r.r.style.height = rh + 'px';
            box(r.lb, area.w / 2 - 120, 0, 240); fit(r.lb, 28, 16, 230, null);
            r.nv.forEach((e, j) => { e.style.fontSize = (P ? 40 : 38) + 'px'; box(e, j ? area.w - 260 : 0, -6, 260); e.style.textAlign = j ? 'right' : 'left'; });
            box(r.tr, 0, 52, tw); r.tr.style.height = '26px'; box(r.kn, 0, 52 - 9, 44); r.kn.style.height = '44px';
          });
          wp = { x: W < 0 ? D / 2 : area.w - D / 2, y: y0 + D / 2, r: D };
          vp = { x: area.w / 2, y: y0 + D / 2 };
        });
        S(c1 - .1, 'whoosh', .45, -.5); S(c1, 'whoosh', .45, .5); S(c1 + .35, 'pop', .4, -.5); S(c1 + .4, 'pop', .4, .5);
        S(cv, 'zap', .5); S(cv + .05, 'thud', .5); flash(cv, .18);
        sa.forEach((a, i) => { S(a, 'swoosh', .35); S(a + .15, 'drumroll', .2, 0, { d: .55 }); S(a + .75, 'thud', .45, sw[i] * .6); });
        if (W) { S(cw, 'chime', .4, W * .5); S(cw + .15, 'tada', .45, W * .5); }
        U = t => {
          hs.forEach((o, i) => {
            const s = i ? 1 : -1, k = pr(t, c1 - .1 + i * .08, c1 + .45 + i * .08), win = W === 0 ? 0 : (i === winSide ? 1 : -1), kw = pr(t, cw, cw + .5);
            tf(o.fc.f, { o: clamp(k * 4) * (win < 0 ? 1 - .5 * kw : 1), x: s * (1 - EZ.out5(k)) * 360, r: s * (1 - EZ.out5(k)) * 360, s: 1 + (win > 0 ? .08 * EZ.back(kw) : 0) });
            o.fc.f.classList.toggle('win', win > 0 && kw > .2); o.fc.im.style.filter = win < 0 ? `grayscale(${kw.toFixed(2)})` : '';
            frame(o.fc, t);
            const kn = pr(t, c1 + .3, c1 + .7); tf(o.nm, { o: clamp(kn * 3) * (win < 0 ? 1 - .5 * kw : 1), x: (1 - EZ.out5(kn)) * s * 40 });
            const kc = pr(t, cw + .1, cw + .55); tf(o.cr, { o: win > 0 ? clamp(kc * 4) : 0, y: -(1 - EZ.bounce(kc)) * 90, r: s * -12 + Math.sin(t * 3) * 4 });
          });
          const kv = pr(t, cv - .05, cv + .4); tf(vs, { o: clamp(kv * 4), s: .3 + .7 * EZ.spring(kv), r: (1 - EZ.out(kv)) * 180 });
          rows.forEach(r => {
            const a = sa[r.i], k = pr(t, a - .1, a + .35), tot = Math.abs(r.s.a) + Math.abs(r.s.b) || 1, share = Math.abs(r.s.a) / tot;
            const pos = lerp(.5, share, EZ.elastic(pr(t, a + .15, a + 1.15))), ten = t > a + 1.2 ? Math.sin(t * 9 + r.i) * .004 : 0;
            tf(r.lb, { o: clamp(k * 3), y: (1 - EZ.expo(k)) * 16 });
            tf(r.tr, { o: clamp(k * 3), sx: .2 + .8 * EZ.back(k) });
            r.fa.style.width = ((pos + ten) * 100).toFixed(2) + '%'; r.fb.style.width = ((1 - pos - ten) * 100).toFixed(2) + '%';
            r.kn.style.left = ((pos + ten) * G.tw - 22).toFixed(1) + 'px'; tf(r.kn, { o: clamp(k * 3), s: 1 + .2 * Math.sin(Math.PI * pr(t, a + .15, a + .6)) });
            const kn = EZ.out(pr(t, a + .1, a + .9));
            r.nv.forEach((e, j) => { const wins = sw[r.i] === (j ? 1 : -1), kp = pr(t, a + .75, a + 1.05); html(e, num(r.s, j, r.i, kn)); tf(e, { o: clamp(k * 3) * (sw[r.i] && !wins && t > a + .9 ? .5 : 1), s: wins ? 1 + .22 * Math.sin(Math.PI * kp) : 1 }); e.classList.toggle('hi', wins && t > a + .8); });
          });
        };
        BG = (c, t, a) => { if (W) MK.fx.glow(c, area.x + wp.x, area.y + wp.y, wp.r * 1.6, W < 0 ? T().a : T().w, a * .9 * pr(t, cw, cw + .4)); MK.fx.ripple(c, t, cv, area.x + vp.x, area.y + vp.y, { r: 180, col: T().w }); };
        FG = (c, t) => { rows.forEach(r => { const tot = Math.abs(r.s.a) + Math.abs(r.s.b) || 1; T().paint.burst(c, t, sa[r.i] + .3, area.x + Math.abs(r.s.a) / tot * G.tw, area.y + parseFloat(r.r.style.top || 0) + 65, { n: 14, sp: 360, life: .5, seed: r.i }); }); if (W) MK.fx.confetti(c, t, cw + .1, area.x + wp.x, area.y + wp.y, { n: 40, sp: 900 }); };
      } else {
        const cds = sides.map((o, i) => {
          const c = tone(el('div', `cd mk-abs ${i ? 'b' : 'a'}`, wrap), i ? 'w' : 'a'), fc = face(c, o, 'art');
          const nm = el('div', 'nm', c, `<b>${rich(o.name)}</b>${o.tag ? `<span>${esc(o.tag)}</span>` : ''}`);
          const rows = st.map((s, j) => { const r = el('div', 'rw', c, `<span>${esc(s.label)}</span><b></b>`); return { r, v: r.querySelector('b') }; });
          const bk = el('div', 'bk', c, MK.icon('bolt', 90, 1.6)), rib = el('div', 'rib mk-abs', c, MK.icon('crown', 30, 2.2) + '<span>WIN</span>');
          return { c, fc, nm, rows, bk, rib };
        });
        const vs = el('div', 'vsb mk-abs', wrap, 'VS');
        let G = { cw: 380, ch: 560, y: 0 };
        ctx.measure(() => {
          const H = area.h - top, gap = P ? 60 : 120, cwid = Math.min((area.w - gap) / 2, P ? 440 : 400), ch = Math.min(H - 30, cwid * 1.55);
          cds.forEach((d, i) => {
            box(d.c, i ? area.w / 2 + gap / 2 : area.w / 2 - gap / 2 - cwid, top + (H - ch) / 2 + 10, cwid); d.c.style.height = ch + 'px';
            const ah = Math.round(ch * (ns > 2 ? .36 : .42)); d.fc.f.style.height = ah + 'px'; d.fc.f.querySelector('.ini').style.fontSize = (ah * .55) + 'px';
            fit(d.nm.querySelector('b'), P ? 48 : 44, 22, cwid - 48, null); if (d.nm.querySelector('span')) fit(d.nm.querySelector('span'), 22, 14, cwid - 48, null);
            d.rows.forEach(r => { r.r.style.fontSize = (P ? 30 : 28) + 'px'; });
          });
          box(vs, area.w / 2 - 50, top + H / 2 - 30, 100); vs.style.height = '60px';
          G = { cw: cwid, ch, gap };
          vp = { x: area.w / 2, y: top + H / 2 };
          wp = { x: W < 0 ? area.w / 2 - gap / 2 - cwid / 2 : area.w / 2 + gap / 2 + cwid / 2, y: top + H / 2, r: ch * .55 };
        });
        S(c1 - .1, 'card', .5, -.4); S(c1 + .05, 'card', .5, .4); S(c1 + .3, 'whip', .4, -.4); S(c1 + .45, 'whip', .4, .4);
        S(cv, 'hit', .6); S(cv + .05, 'zap', .4); shake(cv, 7); flash(cv, .15);
        sa.forEach((a, i) => { S(a, 'blip', .35, 0, { n: i * 3 }); S(a + .45, sw[i] ? 'coin' : 'tick', .4, sw[i] * .5); });
        if (W) { S(cw, 'swell', .3, 0, { d: .5 }); S(cw + .3, 'tada', .5, W * .5); }
        U = t => {
          cds.forEach((d, i) => {
            const s = i ? 1 : -1, d0 = c1 + i * .15, k = pr(t, d0 - .1, d0 + .5), fl = EZ.inout(pr(t, d0 + .2, d0 + .7)), win = W === 0 ? 0 : (i === winSide ? 1 : -1), kw = pr(t, cw, cw + .55);
            const knock = t > cv && t < cv + .6 ? Math.sin((t - cv) * Math.PI / .6) * -s * 26 * (1 - pr(t, cv, cv + .6)) : 0;
            const ry = 180 * (1 - fl) * -s + (win < 0 ? s * 14 * EZ.out(kw) : 0) + (win > 0 ? Math.sin(t * 1.3) * 5 * pr(t, cw + .6, cw + 1.2) : 0);
            tf(d.c, { p: 1600, o: clamp(k * 4) * (win < 0 ? 1 - .45 * kw : 1), x: s * (1 - EZ.out5(k)) * 260 + knock, y: (1 - EZ.out5(k)) * 360 - (win > 0 ? 24 * EZ.back(kw) : 0), r: s * (1 - EZ.out5(k)) * 20, ry, rx: win < 0 ? 10 * EZ.out(kw) : 0, s: 1 + (win > 0 ? .06 * EZ.back(kw) : win < 0 ? -.07 * kw : 0) });
            d.bk.style.opacity = Math.abs(ry) > 90 ? '1' : '0';
            d.c.classList.toggle('win', win > 0 && kw > .3); d.c.classList.toggle('lose', win < 0 && kw > .3);
            d.fc.im.style.filter = win < 0 ? `grayscale(${kw.toFixed(2)})` : '';
            frame(d.fc, t);
            shine(d.c, t, win > 0 ? cw + .4 : 1e9, 2.2);
            d.rows.forEach((r, j) => {
              const a = sa[j], kn = EZ.out(pr(t, a, a + .5)), wins = sw[j] === s, pop = pr(t, a + .45, a + .75);
              html(r.v, t < a ? '—' : num(st[j], i, j, kn) + (wins && t > a + .45 ? '<i>▲</i>' : ''));
              r.r.classList.toggle('hi', t >= a && t < a + .9); r.r.classList.toggle('up', wins && t > a + .45); r.r.classList.toggle('dn', sw[j] === -s && t > a + .45);
              tf(r.v, { s: wins ? 1 + .25 * Math.sin(Math.PI * pop) : 1 });
            });
            const kr = pr(t, cw + .3, cw + .7); tf(d.rib, { o: win > 0 ? clamp(kr * 4) : 0, s: .3 + .7 * EZ.spring(kr), r: -8 });
          });
          const kv = pr(t, cv - .05, cv + .4); tf(vs, { o: clamp(kv * 4), s: (1 + (1 - EZ.out5(kv)) * 1.6) * (1 + .05 * idle(t, cv + .5, 1.4).wave), r: (1 - EZ.out(kv)) * -30 });
        };
        BG = (c, t, a) => { MK.fx.glow(c, area.x + vp.x, area.y + vp.y, 200, T().w, a * .5 * pr(t, cv, cv + .3)); if (W) MK.fx.glow(c, area.x + wp.x, area.y + wp.y, wp.r * 1.4, W < 0 ? T().a : T().w, a * .8 * pr(t, cw, cw + .5)); };
        FG = (c, t) => { T().paint.burst(c, t, cv, area.x + vp.x, area.y + vp.y, { n: 30, sp: 700 }); if (W) { MK.fx.confetti(c, t, cw + .3, area.x + wp.x, area.y + wp.y - G.ch * .4, { n: 50, sp: 1000 }); MK.fx.twinkle(c, t, area.x + wp.x - G.cw / 2, area.y + wp.y - G.ch / 2, G.cw, G.ch, 10, T().aLite, pr(t, cw + .5, cw + 1) * (1 - leave(t, slot))); } };
      }
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, y: -EZ.in(out) * 16 });
          if (kick) set(kick, { o: pr(t, slot.t0, slot.t0 + .4) });
          U(t);
        },
        bg(c, t) { BG(c, t, 1 - leave(t, slot)); },
        fg(c, t) { FG(c, t); },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });
})();
