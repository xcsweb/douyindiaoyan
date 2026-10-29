/* motion-kit · 素材展示类控件（0.3.0）：gallery / beforeafter / kenburns / polaroid / device / collage / spotlight
   图片 / 视频素材的编舞：图集翻入与轮播、前后对比、纪录片推拉、拍立得、设备样机、拼贴墙、聚光放大。
   gallery     grid 网格错峰翻入后轮流放大 / carousel 3D 旋转木马 / stack 照片堆一张张甩出
   beforeafter slider 分割线来回扫 / flip 三维翻转 / split 并排后推近 after
   kenburns    pan 慢移 / zoom 慢推慢拉 / parallax 同图两层视差
   polaroid    drop 掉落弹跳 + 显影 / pin 拍在软木板上钉住、红线相连 / film 胶片条滚过
   device      phone 手机旋入 / tablet 平板立起 / monitor 显示器开机
   collage     masonry 瀑布流逐块落下后分列滚动 / mosaic 碎片拼合成整图 / wall 作品墙无限滚动 + 中心高亮
   spotlight   spotlight 暗场聚光圈移动 / magnifier 放大镜跟随 / blur 其余区域虚化
   素材：每个 media 字段用 ctx.mediaOf 建图、update 里 ctx.frameAt 取帧（视频按成片时钟播放）；没有素材时画中性占位（渐变块 + 图标）。
   约定见 AUTHORING.md：只由 t 求值，音效在 build 里登记，颜色只取主题。 */
(function () {
  'use strict';
  const { clamp, lerp, pr, EZ, el, box, set, tf, fit, html, rich, esc, flash, punch, idle, stagger, svg, draw, rnd } = MK;
  const T = () => MK.T;
  /* 音效：入场前的预备音可能早于 0 秒（片头第一段），夹到 0 */
  const S = (t, ...a) => MK.S(Math.max(0, t), ...a);
  const leave = (t, slot) => pr(t, slot.t1 - .35, slot.t1);
  /* cue 缺省：n 个节拍在本段可用时间里均匀错开，单步最长 gap 秒 */
  const beats = (slot, n, start = .25, gap = .9, reserve = 1.4) => stagger(n, slot.t0 + start, Math.min(gap, Math.max(.25, (slot.t1 - slot.t0 - start - reserve) / Math.max(1, n - 1))), slot.cues);
  const plain = s => String(s ?? '').replace(/\*/g, '');
  const longest = arr => arr.reduce((a, b) => (MK.plainLen(b) > MK.plainLen(a) ? b : a), '');
  const HEAD = 78;   // 标题行占高

  /* 一块素材：有素材放 <img>（object-fit: cover），没有时放中性占位（渐变块 + 图标，不画假内容）。
     inner 是做推拉的那一层；frame(t) 在 update 里按成片时钟取当前帧 */
  const pic = (parent, ctx, obj, key = 'src', i = 0, cls = '') => {
    const m = el('div', 'mk-sc-pic' + (cls ? ' ' + cls : ''), parent);
    let im = null, inner;
    if (obj && obj.$media && obj.$media[key]) { im = inner = el('img', '', m); ctx.mediaOf(im, obj, key); }
    else inner = el('div', 'mk-sc-ph k' + (i % 3), m, MK.icon('image', 56, 1.3));
    return { m, im, inner, frame: t => { if (im) ctx.frameAt(im, obj, t, key); } };
  };
  /* 扫光：k 0 → 1 从右上扫到左下；idle 版每 period 秒扫一次 */
  const shine = (e, k) => e.style.setProperty('--sh', lerp(130, -30, clamp(k)).toFixed(1) + '%');
  const sweep = (t, t0, period) => (t < t0 ? 0 : EZ.inout(clamp(idle(t, t0, period).sweep * 2.2)));
  /* 标题：遮罩从左（居中时从中间）揭开 */
  const header = (parent, s, w, center = false) => {
    if (!s) return null;
    const e = box(el('div', 'mk-sc-head mk-abs', parent, rich(s)), 0, 0, w);
    if (center) e.style.textAlign = 'center';
    return e;
  };
  const headIn = (e, t, t0) => {
    if (!e) return;
    const k = pr(t, t0, t0 + .6), c = e.style.textAlign === 'center', a = ((1 - EZ.out5(k)) * (c ? 50 : 100)).toFixed(2);
    e.style.clipPath = c ? `inset(-20% ${a}% -20% ${a}%)` : `inset(-20% ${a}% -20% 0)`;
    tf(e, { o: clamp(k * 3), y: (1 - EZ.expo(k)) * 24 });
  };
  const bell = (t, a, d) => Math.sin(Math.PI * pr(t, a, a + d));

  /* 网格：在 W×H 内找最大的等比格子（ar = 宽/高，每格下方留 capH 放说明） */
  const gridFit = (n, W, H, ar, gap, capH) => {
    let best = null;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols), w = Math.min((W - gap * (cols - 1)) / cols, ((H - gap * (rows - 1)) / rows - capH) * ar);
      if (w > 0 && (!best || w > best.w + .5)) best = { cols, rows, w, h: w / ar };
    }
    return best;
  };

  /* ---------- gallery：图集 ----------
     grid     网格按阅读顺序三维翻入，全部到齐后轮流放大一张（其余压暗）
     carousel 3D 旋转木马：甩开入场，每个 cue 把下一张转到正前方，前景卡扫光，说明随之切换
     stack    照片堆：一摞相片落下，每个 cue 把最上面一张甩到两侧，露出下一张；顶上那张缓慢推近 */
  MK.control('gallery', {
    variants: ['grid', 'carousel', 'stack'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, items = p.items, n = items.length;
      const wrap = box(el('div', 'mk-abs mk-gal', ctx.root), area.x, area.y, area.w, area.h);
      const hd = header(wrap, p.title, area.w, v !== 'grid');
      const top = hd ? HEAD : 0, hasCap = items.some(it => it.caption);
      const at = beats(slot, n, .3, v === 'grid' ? .13 : .95, v === 'grid' ? 1.6 : 1.2), last = at[n - 1];
      const cards = items.map((it, i) => {
        const c = el('div', 'card mk-abs', wrap);
        const ph = pic(c, ctx, it, 'src', i, v === 'stack' ? 'print' : '');
        const gl = el('div', 'mk-sc-gl', ph.m);
        const cap = it.caption && v === 'grid' ? el('div', 'cap mk-abs', c, rich(it.caption)) : null;
        return { c, ph, gl, cap, x: 0, y: 0 };
      });
      let G = null, capEl = null, cw = 0, ch = 0, R = 0, cy = 0;
      if (v === 'grid') {
        const capH = hasCap ? 44 : 0, gap = P ? 18 : 22;
        G = gridFit(n, area.w, area.h - top, P ? 1.25 : 1.5, gap, capH);
        const gh = G.rows * (G.h + capH) + (G.rows - 1) * gap, y0 = top + (area.h - top - gh) / 2;
        cards.forEach((cd, i) => {
          const r = Math.floor(i / G.cols), inRow = Math.min(G.cols, n - r * G.cols), j = i - r * G.cols;
          cd.x = (area.w - (inRow * G.w + (inRow - 1) * gap)) / 2 + j * (G.w + gap); cd.y = y0 + r * (G.h + capH + gap);
          box(cd.c, 0, 0, G.w, G.h + capH); box(cd.ph.m, 0, 0, G.w, G.h);
          if (cd.cap) box(cd.cap, 0, G.h + 8, G.w);
        });
      } else {
        const capB = hasCap ? 86 : 20, avail = area.h - top - capB;
        if (v === 'carousel') {
          cw = Math.min(area.w * (P ? .62 : .44), avail * .94 * 1.4); ch = cw / 1.4;
          R = area.w / 2 - cw * .375 - 10;
        } else {
          cw = Math.min(avail * .88 * 1.36, area.w * (P ? .6 : .5)); ch = cw / 1.36;
        }
        cy = top + avail / 2;
        cards.forEach(cd => { box(cd.c, 0, 0, cw, ch); box(cd.ph.m, 0, 0, cw, ch); });
        if (hasCap) { capEl = box(el('div', 'gcap mk-abs', wrap), 0, top + avail + 16, area.w); capEl.style.textAlign = 'center'; }
      }
      ctx.measure(() => {
        if (hd) fit(hd, P ? 58 : 56, 30, area.w, null);
        if (G) cards.forEach(cd => { if (cd.cap) fit(cd.cap, P ? 28 : 26, 14, G.w - 8, null); });
        if (capEl) { capEl.innerHTML = rich(longest(items.map(it => it.caption || ''))); fit(capEl, P ? 46 : 42, 22, area.w * .92, null); capEl.innerHTML = ''; }
      });
      /* 第二拍：全部到齐后，grid 每 per 秒轮流放大一张；carousel 继续每 per 秒转一格 */
      const per = v === 'grid' ? 1.15 : 1.5, hs = last + (v === 'grid' ? .8 : 1.5), extra = [];
      if (v !== 'stack') for (let q = hs; q < slot.t1 - .9; q += per) extra.push(q);
      const steps = v === 'carousel' ? at.slice(1).concat(extra) : [];
      if (hd) S(slot.t0 + .05, 'swoosh', .35);
      if (v === 'grid') {
        at.forEach((c, i) => S(c, i === 0 ? 'shutter' : 'card', i === 0 ? .5 : .3, (cards[i].x + G.w / 2) / area.w - .5));
        S(last + .3, 'shine', .3); extra.forEach(q => S(q, 'tick', .28));
      } else if (v === 'carousel') {
        S(at[0] - .2, 'whoosh', .55); S(at[0] + .5, 'pop', .4);
        steps.forEach((c, i) => { S(c - .05, 'swoosh', .35, i % 2 ? .3 : -.3); S(c + .32, 'tick', .3); });
      } else {
        cards.forEach((_, i) => S(at[0] - .35 + (n - 1 - i) * .07 + .1, 'card', .22));
        S(at[0] + .05, 'thud', .5);
        at.slice(1).forEach((c, i) => { const side = i % 2 ? 1 : -1; S(c - .05, 'whip', .5, side * .5); S(c + .4, 'card', .3, side * .6); });
      }
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          headIn(hd, t, slot.t0);
          cards.forEach(cd => cd.ph.frame(t));
          if (v === 'grid') {
            const fq = t >= hs ? Math.floor((t - hs) / per) : -1, lt = t - hs - fq * per;
            const live = fq >= 0 && fq < extra.length, zk = live ? EZ.out(pr(lt, 0, .35)) * (1 - EZ.inout(pr(lt, per - .3, per))) : 0, f = live ? fq % n : -1;
            cards.forEach((cd, i) => {
              const k = pr(t, at[i] - .05, at[i] + .55), on = i === f ? zk : 0;
              tf(cd.c, { p: 1200, x: cd.x, y: cd.y + (1 - EZ.out5(k)) * 70, ry: (1 - EZ.back(k)) * -95, s: (.82 + .18 * EZ.back(k)) * (1 + .1 * on), o: clamp(k * 4) });
              cd.c.style.zIndex = on > 0 ? '5' : '1';
              cd.ph.m.style.filter = f >= 0 && i !== f ? `brightness(${(1 - .45 * zk).toFixed(3)})` : '';
              cd.c.classList.toggle('on', on > .5);
              shine(cd.gl, i === f ? EZ.inout(pr(lt, .1, .8)) : EZ.inout(pr(t, at[i] + .2, at[i] + .9)));
              if (cd.cap) cd.cap.style.opacity = clamp(k * 2 - .6).toFixed(3);
            });
          } else if (v === 'carousel') {
            const idx = steps.reduce((s, c) => s + EZ.back(pr(t, c - .05, c + .6)), 0);
            const k0 = pr(t, at[0] - .25, at[0] + 1.1), spin = (1 - EZ.out5(k0)) * Math.PI * 1.5, rr = R * EZ.spring(pr(t, at[0] - .25, at[0] + .8));
            const th = -idx * 2 * Math.PI / n + spin;
            cards.forEach((cd, i) => {
              const a = 2 * Math.PI * i / n + th, d = Math.cos(a), q = (d + 1) / 2;
              tf(cd.c, { p: 1400, x: area.w / 2 - cw / 2 + Math.sin(a) * rr, y: cy - ch / 2 - (1 - q) * ch * .14 + Math.sin(t * 1.2 + i) * 3, ry: -Math.sin(a) * 38, s: lerp(.5, 1, q) * (.7 + .3 * EZ.out(k0)), o: clamp(k0 * 3) * lerp(.3, 1, q) });
              cd.c.style.zIndex = String(Math.round(q * 100));
              cd.ph.m.style.filter = `brightness(${lerp(.4, 1, q * q).toFixed(3)})`;
            });
            const front = ((Math.round(idx) % n) + n) % n, ls = steps.filter(c => t >= c - .05).pop() ?? at[0];
            cards.forEach((cd, i) => shine(cd.gl, i === front ? EZ.inout(pr(t, ls + .45, ls + 1.15)) : 0));
            if (capEl) {
              html(capEl, rich(items[front].caption || ''));
              const k = pr(t, ls + .15, ls + .55), ko = steps.some(c => t >= c - .3 && t < c + .15) ? 1 - pr(t, ls - .3, ls - .05) : 1;
              tf(capEl, { o: clamp(k * 3) * ko * clamp(k0 * 2), y: (1 - EZ.expo(k)) * 18 });
            }
          } else {
            const cur = at.slice(1).filter(c => t >= c + .1).length;
            cards.forEach((cd, i) => {
              const r0 = (rnd(i, 3) - .5) * 12, ox = (rnd(i, 4) - .5) * 22, oy = (rnd(i, 5) - .5) * 16;
              const dt = at[0] - .35 + (n - 1 - i) * .07, kd = pr(t, dt, dt + .4);
              let x = ox, y = oy - (1 - EZ.out5(kd)) * area.h * .5, r = r0 + (1 - EZ.out(kd)) * (i % 2 ? 20 : -20), s = 1 + (1 - EZ.out5(kd)) * .25, z = 100 + n - i, dim = 0;
              if (i < n - 1) {
                const c = at[i + 1], k = pr(t, c - .05, c + .6), side = i % 2 ? 1 : -1, j = Math.floor(i / 2);
                if (k > 0) {
                  const tx = side * Math.min(area.w / 2 - cw * .36 - 6, cw * .5 + j * 34), ty = j * 26 - 18, rt = side * (9 + j * 5), e = EZ.back(k);
                  x = lerp(ox, tx, e); y = lerp(oy, ty, e) - Math.sin(Math.PI * k) * 50; r = lerp(r0, rt, EZ.out(k)) + Math.sin(Math.PI * k) * side * 22; s = lerp(1, .72, EZ.out(k));
                  z = k < .5 ? 300 : 10 + i; dim = EZ.out(k);
                }
              }
              const hero = i === cur;
              if (hero) r += Math.sin(t * .9) * .6 * pr(t, at[cur] + .5, at[cur] + 1.2);
              tf(cd.c, { x: area.w / 2 - cw / 2 + x, y: cy - ch / 2 + y, r, s, o: clamp(kd * 4) });
              cd.c.style.zIndex = String(z);
              cd.ph.m.style.filter = dim > 0 ? `brightness(${(1 - .4 * dim).toFixed(3)})` : '';
              cd.ph.inner.style.transform = hero ? `scale(${(1 + .06 * EZ.sine(pr(t, at[cur], slot.t1))).toFixed(4)})` : '';
              shine(cd.gl, hero ? EZ.inout(pr(t, at[cur] + .35, at[cur] + 1.05)) : 0);
            });
            if (capEl) {
              html(capEl, rich(items[cur].caption || ''));
              const k = pr(t, at[cur] + .2, at[cur] + .6), ko = cur < n - 1 ? 1 - pr(t, at[cur + 1] - .25, at[cur + 1]) : 1;
              tf(capEl, { o: clamp(k * 3) * ko, y: (1 - EZ.expo(k)) * 18 });
            }
          }
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          if (v === 'carousel') MK.fx.glow(c, area.x + area.w / 2, area.y + cy + ch * .55, cw * .9, T().a, .45 * a * pr(t, at[0], at[0] + .8));
          if (v === 'carousel') steps.forEach(c0 => MK.fx.ripple(c, t, c0 + .3, area.x + area.w / 2, area.y + cy, { r: cw * .7, rings: 1, w: 2 * a }));
          if (v === 'stack') MK.fx.glow(c, area.x + area.w / 2, area.y + cy, cw * .9, T().a, .35 * a * pr(t, at[0], at[0] + .6));
        },
        fg(c, t) { if (v === 'stack') at.slice(1).forEach((c0, i) => T().paint.burst(c, t, c0 + .05, area.x + area.w / 2, area.y + cy, { n: 18, sp: 600, life: .6, seed: i })); },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- beforeafter：前后对比 ----------
     slider 两张叠放，分割线从右扫到左揭示 after，再回到中间，停留时来回轻扫
     flip   一张卡片三维翻面，正面 before、背面 after，停留时轻摆 + 扫光
     split  并排（竖屏也是左右两张竖图）入场，之后 before 压暗退后、after 推近，中间箭头弹出 */
  MK.control('beforeafter', {
    variants: ['slider', 'flip', 'split'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait;
      const wrap = box(el('div', 'mk-abs mk-ba', ctx.root), area.x, area.y, area.w, area.h);
      const hd = header(wrap, p.title, area.w, true), top = hd ? HEAD : 0, avail = area.h - top;
      const labB = p.beforeLabel || '之前', labA = p.afterLabel || '之后';
      const c0 = slot.cues[0] ?? slot.t0 + .2, c1 = slot.cues[1] ?? Math.max(c0 + 1, Math.min(slot.t1 - (v === 'slider' ? 2.6 : 1.6), c0 + 1.3));
      const fw = Math.min(area.w, avail * 1.6), fh = Math.min(avail, fw / (P ? 1.3 : 1.6)), fx = (area.w - fw) / 2, fy = top + (avail - fh) / 2;
      const tag = (parent, s, hl, right) => el('div', 'tag mk-abs' + (hl ? ' hl' : '') + (right ? ' r' : ''), parent, esc(s));
      let fr, B, A, tagB, tagA, line, knob, fa, fb, gl, arr, pw = 0, ph = 0, xB = 0, xA = 0, py = 0;
      if (v === 'slider') {
        fr = box(el('div', 'fr mk-abs', wrap), fx, fy, fw, fh);
        B = pic(fr, ctx, p, 'before', 0, 'full'); A = pic(fr, ctx, p, 'after', 1, 'full');
        line = box(el('div', 'div mk-abs', fr), 0, 0, 4, fh);
        knob = el('div', 'knob mk-abs', fr, '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6"/></svg>');
        tagB = tag(fr, labB, false, false); tagA = tag(fr, labA, true, true);
      } else if (v === 'flip') {
        fr = box(el('div', 'flipc mk-abs', wrap), fx, fy, fw, fh);
        fa = box(el('div', 'face mk-abs', fr), 0, 0, fw, fh); fb = box(el('div', 'face mk-abs', fr), 0, 0, fw, fh);
        B = pic(fa, ctx, p, 'before', 0, 'full'); A = pic(fb, ctx, p, 'after', 1, 'full');
        tagB = tag(fa, labB, false, false); tagA = tag(fb, labA, true, false); gl = el('div', 'mk-sc-gl', fb);
      } else {
        const gap = P ? 64 : 96, ar = P ? .78 : 1.28, pw0 = (area.w - gap) / 2;
        ph = Math.min(avail * .86, pw0 / ar); pw = ph * ar;
        xB = area.w / 2 - gap / 2 - pw; xA = area.w / 2 + gap / 2; py = top + (avail - ph) / 2;
        fa = box(el('div', 'pan mk-abs', wrap), 0, 0, pw, ph); fb = box(el('div', 'pan mk-abs', wrap), 0, 0, pw, ph);
        B = pic(fa, ctx, p, 'before', 0, 'full'); A = pic(fb, ctx, p, 'after', 1, 'full');
        tagB = tag(fa, labB, false, false); tagA = tag(fb, labA, true, false); gl = el('div', 'mk-sc-gl', fb);
        arr = box(el('div', 'arr mk-abs', wrap, MK.icon('arrow', 44, 2.6)), area.w / 2 - 42, py + ph / 2 - 42, 84, 84);
      }
      ctx.measure(() => {
        if (hd) fit(hd, P ? 58 : 56, 30, area.w, null);
        for (const e of [tagB, tagA]) { fit(e, P ? 30 : 26, 16, (v === 'split' ? pw : fw / 2) - 60, null); e.style.width = 'auto'; }
      });
      /* slider 分割线位置（after 从右侧占据的比例 = 1 - pos） */
      const posAt = t => {
        let x = 1 - .85 * EZ.inout(pr(t, c1, c1 + 1.1)) + .35 * EZ.inout(pr(t, c1 + 1.2, c1 + 1.9));
        x += .16 * Math.sin((t - c1 - 2) * 1.5) * pr(t, c1 + 2, c1 + 2.6);
        return x;
      };
      if (hd) S(slot.t0 + .05, 'swoosh', .3);
      if (v === 'slider') { S(c0, 'card', .5); S(c0 + .45, 'pop', .35); S(c1, 'swipe', .55, .4); S(c1 + 1.1, 'tick', .4, -.4); S(c1 + 1.2, 'swipe', .4); S(c1 + 1.9, 'tick', .35); }
      else if (v === 'flip') { S(c0, 'card', .5); S(c1 - .05, 'whoosh', .55); S(c1 + .45, 'snap', .45); S(c1 + .95, 'shine', .35); flash(c1 + .4, .12); }
      else { S(c0, 'whoosh', .45, -.4); S(c0 + .15, 'whoosh', .45, .4); S(c0 + .5, 'thud', .4); S(c1, 'swoosh', .45); S(c1 + .12, 'pop', .5); punch(c1 + .1, .025); S(c1 + .8, 'shine', .3); }
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          headIn(hd, t, slot.t0);
          B.frame(t); A.frame(t);
          const k = pr(t, c0 - .1, c0 + .65);
          if (v === 'slider') {
            tf(fr, { o: clamp(k * 3), s: .9 + .1 * EZ.back(k), y: (1 - EZ.expo(k)) * 40 });
            fr.style.clipPath = `inset(${((1 - EZ.out5(k)) * 50).toFixed(2)}% 0 round 18px)`;
            const x = posAt(t), kk = pr(t, c0 + .35, c0 + .75), bump = 1 + .16 * (bell(t, c1 + 1.05, .3) + bell(t, c1 + 1.85, .3));
            A.m.style.clipPath = `inset(0 0 0 ${(x * 100).toFixed(2)}%)`;
            tf(line, { x: x * fw - 2, o: clamp(kk * 3), sy: EZ.out5(kk) });
            tf(knob, { x: clamp(x * fw, 40, fw - 40) - 32, y: fh / 2 - 32, s: EZ.back(kk) * bump, o: clamp(kk * 3) });
            tagB.style.opacity = (clamp((x * fw - 40) / 140) * clamp(k * 2)).toFixed(3);
            tagA.style.opacity = clamp(((1 - x) * fw - 40) / 140).toFixed(3);
          } else if (v === 'flip') {
            tf(fr, { o: clamp(k * 3), y: (1 - EZ.expo(k)) * 50 });
            const fk = pr(t, c1, c1 + .85), ang = 180 * EZ.back(fk), lift = 1 - .1 * Math.sin(Math.PI * fk);
            const sw = Math.sin((t - c1 - 1) * 1.1) * 5 * pr(t, c1 + 1, c1 + 1.6), s0 = (.9 + .1 * EZ.back(k)) * lift;
            tf(fa, { p: 1800, ry: ang + (ang < 90 ? 0 : sw), s: s0, o: ang < 90 ? 1 : 0 });
            tf(fb, { p: 1800, ry: ang - 180 + sw, s: s0, o: ang >= 90 ? 1 : 0 });
            A.inner.style.transform = `scale(${(1 + .05 * EZ.sine(pr(t, c1, slot.t1))).toFixed(4)})`;
            shine(gl, fk >= 1 ? sweep(t, c1 + .85, 3.2) : 0);
          } else {
            const kb = pr(t, c0, c0 + .7), ka = pr(t, c0 + .15, c0 + .85), kp = EZ.out5(pr(t, c1, c1 + .7)), ks = EZ.back(pr(t, c1, c1 + .7));
            tf(fa, { x: xB - (1 - EZ.back(kb)) * 220 - kp * (P ? 16 : 36), y: py, r: (1 - EZ.out(kb)) * -8, s: 1 - .14 * kp, o: clamp(kb * 3) });
            tf(fb, { x: xA + (1 - EZ.back(ka)) * 220 - ks * pw * .04, y: py, r: (1 - EZ.out(ka)) * 8, s: 1 + .12 * ks, o: clamp(ka * 3) });
            fb.style.zIndex = '2';
            B.m.style.filter = kp > 0 ? `brightness(${(1 - .45 * kp).toFixed(3)}) grayscale(${(.6 * kp).toFixed(3)})` : '';
            fb.classList.toggle('on', kp > .5);
            A.inner.style.transform = `scale(${(1 + .06 * EZ.sine(pr(t, c1, slot.t1))).toFixed(4)})`;
            const kr = pr(t, c1 + .1, c1 + .5);
            tf(arr, { s: EZ.back(kr) * (1 + .06 * Math.sin((t - c1) * 4) * pr(t, c1 + .6, c1 + 1)), o: clamp(kr * 4), r: (1 - EZ.out(kr)) * -90 });
            arr.style.zIndex = '3';
            shine(gl, sweep(t, c1 + .5, 3));
          }
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          if (v === 'split') MK.fx.ripple(c, t, c1 + .15, area.x + area.w / 2, area.y + py + ph / 2, { r: 200, rings: 2, w: 2 * a });
          else MK.fx.glow(c, area.x + area.w / 2, area.y + fy + fh / 2, fw * .6, T().a, .3 * a * pr(t, c0, c0 + .8));
        },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- kenburns：纪录片式推拉 ----------
     画框像睁眼一样上下打开，黑边入场；每张图慢推慢移，交叉溶解 + 暖色漏光切到下一张；说明在底部逐字打出；
     顶部分段进度条 + 序号。pan 横向慢移 / zoom 交替推近拉远 / parallax 同一张图两层（虚化背景 + 前景小窗）反向视差 */
  MK.control('kenburns', {
    variants: ['pan', 'zoom', 'parallax'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, items = p.items, n = items.length;
      const fw = area.w, fh = P ? Math.min(area.h, area.w * 1.5) : area.h, fy = (area.h - fh) / 2;
      const wrap = box(el('div', 'mk-abs mk-kb', ctx.root), area.x, area.y, area.w, area.h);
      const fr = box(el('div', 'fr mk-abs', wrap), 0, fy, fw, fh);
      const barH = Math.round(fh * .065), at = beats(slot, n, .2, 6, 2.2);
      const layers = items.map((it, i) => {
        const L = box(el('div', 'ly mk-abs', fr), 0, 0, fw, fh);
        let back = null, win = null;
        if (v === 'parallax') { back = pic(L, ctx, it, 'src', i, 'full back'); win = box(el('div', 'win mk-abs', L), fw * .09, fh * .1, fw * .82, fh * .62); }
        const fg = pic(win || L, ctx, it, 'src', i, 'full');
        return { L, back, win, fg, it };
      });
      const leak = box(el('div', 'leak mk-abs', fr), 0, -fh * .2, fw * .9, fh * 1.4), fl = box(el('div', 'fl mk-abs', fr), 0, 0, fw, fh);
      box(el('div', 'scrim mk-abs', fr), 0, fh * .55, fw, fh * .45);
      const bt = box(el('div', 'bar mk-abs', fr), 0, 0, fw, barH), bb = box(el('div', 'bar mk-abs', fr), 0, fh - barH, fw, barH);
      const segW = (fw - 80 - 10 * (n - 1)) / n;
      const segs = items.map((_, i) => box(el('div', 'seg mk-abs', fr, '<i></i>'), 40 + i * (segW + 10), barH + 18, segW).firstChild);
      const kick = p.kicker ? box(el('div', 'kick mk-abs', fr, `<i></i><span>${esc(p.kicker)}</span>`), 40, barH + 40) : null;
      const cnt = el('div', 'cnt mk-abs', fr); cnt.style.left = 'auto'; cnt.style.right = '40px'; cnt.style.top = (barH + 40) + 'px';
      const capEl = box(el('div', 'cap mk-abs', fr), P ? 40 : 60, 0, fw - (P ? 80 : 120));
      ctx.measure(() => {
        if (kick) fit(kick.lastChild, 22, 14, fw * .55, null);
        capEl.textContent = plain(longest(items.map(it => it.caption || ''))) || '字';
        fit(capEl, P ? 44 : 46, 22, fw - (P ? 80 : 120), null);
        capEl.style.top = (fh - barH - 26 - capEl.offsetHeight) + 'px'; capEl.textContent = '';
      });
      const pad = x => String(x).padStart(2, '0');
      S(at[0] - .3, 'swoosh', .45); S(at[0], 'shutter', .5);
      at.forEach((c, i) => {
        if (i) { S(c - .3, 'swoosh', .25); S(c - .1, 'shutter', .45); }
        const L = plain(items[i].caption).length; if (L) S(c + .5, 'type', .22, 0, { d: Math.min(1.8, L / 14) });
      });
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          const k = pr(t, at[0] - .3, at[0] + .65);
          fr.style.clipPath = `inset(${((1 - EZ.out5(k)) * 50).toFixed(2)}% 0 round 18px)`;
          tf(fr, { o: clamp(k * 4), s: 1.05 - .05 * EZ.out(k) });
          const kb = EZ.out5(pr(t, at[0] + .2, at[0] + .8));
          tf(bt, { y: -(1 - kb) * barH }); tf(bb, { y: (1 - kb) * barH });
          let cur = 0; at.forEach((c, i) => { if (t >= c - .1) cur = i; });
          layers.forEach((ly, i) => {
            const ti = at[i], tn = i < n - 1 ? at[i + 1] : slot.t1, vis = t >= ti - .35 && (i === n - 1 || t < tn + .6);
            set(ly.L, { o: vis ? (i === 0 ? 1 : EZ.inout(pr(t, ti - .3, ti + .5))) : 0 });
            if (!vis) return;
            ly.fg.frame(t); if (ly.back) ly.back.frame(t);
            const u = clamp((t - ti + .6) / (tn - ti + 1.2)), dir = i % 2 ? -1 : 1;
            if (v === 'pan') ly.fg.inner.style.transform = `translate(${(dir * (u - .5) * fw * .08).toFixed(2)}px,${((rnd(i, 7) - .5) * fh * .05 * (u - .5)).toFixed(2)}px) scale(1.16)`;
            else if (v === 'zoom') {
              ly.fg.inner.style.transformOrigin = `${(30 + 40 * rnd(i, 8)).toFixed(1)}% ${(30 + 40 * rnd(i, 9)).toFixed(1)}%`;
              ly.fg.inner.style.transform = `scale(${(i % 2 ? lerp(1.24, 1.03, EZ.sine(u)) : lerp(1.03, 1.24, EZ.sine(u))).toFixed(4)}) rotate(${(dir * (u - .5) * 1.2).toFixed(3)}deg)`;
            } else {
              ly.back.inner.style.transform = `translateX(${(-dir * (u - .5) * fw * .07).toFixed(2)}px) scale(1.35)`;
              const kw = pr(t, ti - .3, ti + .8);
              tf(ly.win, { p: 1600, ry: lerp(-7, 7, u) * dir, x: dir * (u - .5) * fw * .05, y: (1 - EZ.out5(kw)) * 40, s: 1 + (1 - EZ.out5(kw)) * .12 });
              ly.fg.inner.style.transform = `translateX(${(dir * (u - .5) * fw * .05).toFixed(2)}px) scale(1.12)`;
            }
          });
          /* 切换：暖色漏光横扫 + 短暂泛白 */
          let lk = 0, lx = 0, fla = 0;
          at.forEach((c, i) => { if (!i) return; const q = pr(t, c - .35, c + .65); if (q > 0 && q < 1) { lk = Math.sin(Math.PI * q); lx = q; } fla = Math.max(fla, bell(t, c - .1, .35) * .3); });
          tf(leak, { x: lerp(-fw * .9, fw, lx), o: lk * .9 }); fl.style.opacity = fla.toFixed(3);
          segs.forEach((s, i) => { const tn = i < n - 1 ? at[i + 1] : slot.t1 - .35; s.style.width = (clamp((t - at[i]) / (tn - at[i])) * 100).toFixed(2) + '%'; });
          const ki = pr(t, at[0] + .3, at[0] + .8);
          if (kick) tf(kick, { o: clamp(ki * 3), x: (1 - EZ.expo(ki)) * -20 });
          html(cnt, `${pad(cur + 1)} / ${pad(n)}`); set(cnt, { o: clamp(ki * 3) });
          for (const s of segs) s.parentNode.style.opacity = clamp(ki * 3).toFixed(3);
          const txt = plain(items[cur].caption), tn = cur < n - 1 ? at[cur + 1] : Infinity;
          MK.type(capEl, txt, t, at[cur] + .5, 14, true);
          capEl.style.opacity = (1 - pr(t, tn - .4, tn - .15)).toFixed(3);
        },
        bg(c, t) { MK.fx.glow(c, area.x + area.w / 2, area.y + fy + fh, fw * .7, T().w, .25 * (1 - leave(t, slot)) * pr(t, at[0], at[0] + 1)); },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5, floor: .35 },
      };
    },
  });

  /* ---------- polaroid：拍立得 ----------
     drop 相片从上方掉落弹跳，落定后像真的拍立得一样显影（暗 → 彩色），手写说明随后写出，停留时轻轻摆动
     pin  软木板上一张张拍上去，图钉按下，红线依次连起各张照片
     film 胶片条从右侧滚入，每个 cue 前进一格，当前格放大提亮，下方手写说明；停留时放映闪烁 + 划痕 */
  const polLayout = (n, W, H, P) => {
    const cols = P && n > 2 ? 2 : n, rows = Math.ceil(n / cols), RH = 1.2, Hh = H * .92;
    let pw = Math.min(W / (cols * .84 + .16), Hh / (RH * (rows * .86 + .14)));
    if (n === 1) pw = Math.min(pw, W * .5, Hh / RH);
    const ph = pw * RH, sx = cols > 1 ? Math.min((W - pw) / (cols - 1), pw * 1.06) : 0, sy = rows > 1 ? Math.min((Hh - ph) / (rows - 1), ph * 1.02) : 0;
    return { pw, ph, pos: Array.from({ length: n }, (_, i) => { const r = Math.floor(i / cols), inRow = Math.min(cols, n - r * cols), j = i - r * cols; return { x: W / 2 + (j - (inRow - 1) / 2) * sx, y: H / 2 + (r - (rows - 1) / 2) * sy }; }) };
  };
  MK.control('polaroid', {
    variants: ['drop', 'pin', 'film'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, items = p.items, n = items.length;
      const wrap = box(el('div', 'mk-abs mk-pol', ctx.root), area.x, area.y, area.w, area.h);
      const at = beats(slot, n, .3, v === 'film' ? 1.3 : .75, v === 'drop' ? 2.2 : 1.6), last = at[n - 1];
      const readable = v === 'drop' && slot.cuePolicy === 'readable-at-cue/1';
      if (readable && (!MotionNarrationCue.complete(slot, n) || at.some(c => c < slot.t0 + .8 - 1e-7)))
        throw Error('READABLE_CUE_LEAD: polaroid/drop needs one real cue per item and 0.8 seconds of scene lead. Keep the real cue; move the visual scene earlier or choose another expression.');
      // Cues remain semantic read points. Preserve the 0.8s drop by scheduling its visual lead.
      const entryAt = readable ? at.map(c => c - .8) : at, motionLast = entryAt[n - 1];
      const pan = x => clamp(x / area.w - .5, -.6, .6);
      if (v === 'film') {
        const LD = 2, N = n + LD * 2;
        const fw = P ? area.w * .6 : Math.min(area.h * .62 * 1.4, area.w * .52), fh = fw / 1.4, band = Math.round(fh * .14), sh = fh + band * 2, gapF = Math.round(band * .5), pitch = fw + gapF;
        const cy = area.h * (P ? .42 : .43);
        const strip = box(el('div', 'strip mk-abs', wrap), 0, cy - sh / 2, N * pitch + gapF, sh);
        strip.style.setProperty('--band', band + 'px');
        const cells = Array.from({ length: N }, (_, k) => {
          const fc = box(el('div', 'fc mk-abs', strip), gapF + k * pitch, band, fw, fh), i = k - LD;
          return i >= 0 && i < n ? { fc, pc: pic(fc, ctx, items[i], 'src', i, 'full'), i } : { fc, i };
        });
        const capEl = box(el('div', 'mk-sc-hand fcap mk-abs', wrap), 0, cy + sh / 2 + 18, area.w);
        ctx.measure(() => { capEl.textContent = plain(longest(items.map(it => it.caption || ''))) || '字'; fit(capEl, P ? 56 : 52, 22, area.w * .86, null); capEl.textContent = ''; });
        const idxAt = t => -(1 - EZ.out5(pr(t, at[0] - .55, at[0] + .7))) * (LD + 1.5) + at.slice(1).reduce((s, c) => s + EZ.back(pr(t, c - .05, c + .6)), 0);
        S(at[0] - .55, 'counter', .25, 0, { d: .9 }); S(at[0] + .15, 'shutter', .45);
        at.slice(1).forEach(c => { S(c - .05, 'whoosh', .3); S(c + .3, 'shutter', .4); });
        at.forEach((c, i) => { if (items[i].caption) S(c + .35, 'marker', .2); });
        return {
          update(t) {
            const out = leave(t, slot);
            set(wrap, { o: 1 - out, blur: out * 10 });
            const idx = idxAt(t), vel = (idxAt(t + .02) - idx) / .02, drift = Math.sin((t - last) * .7) * .025 * pr(t, last + .8, last + 1.6);
            tf(strip, { x: area.w / 2 - (gapF + (LD + idx + drift) * pitch + fw / 2), o: clamp(pr(t, at[0] - .55, at[0] - .2) * 3), blur: Math.min(10, Math.abs(vel) * 1.6) });
            cells.forEach(cl => {
              const q = cl.pc ? 1 - clamp(Math.abs(cl.i - idx)) : 0;
              if (cl.pc) { cl.pc.frame(t); cl.pc.m.style.filter = `brightness(${lerp(.4, 1, q).toFixed(3)})`; }
              tf(cl.fc, { s: 1 + .05 * q });
            });
            const cur = clamp(Math.round(idx), 0, n - 1), cs = at[cur];
            html(capEl, esc(plain(items[cur].caption)));
            const w = pr(t, cs + .35, cs + .95), ko = cur < n - 1 ? 1 - pr(t, at[cur + 1] - .2, at[cur + 1]) : 1;
            capEl.style.clipPath = `inset(-20% ${((1 - w) * 100).toFixed(1)}% -20% 0)`; capEl.style.opacity = ko.toFixed(3);
          },
          bg(c, t) {
            const a = (1 - leave(t, slot)) * pr(t, at[0], at[0] + .6) * (.85 + .15 * MK.noise(t * 11));
            MK.fx.glow(c, area.x + area.w / 2, area.y + cy, fw * .95, T().w, .45 * a);
          },
          fg(c, t) {
            /* 放映划痕：每 1/24 秒随机一两道竖线 + 轻微闪烁 */
            const a = (1 - leave(t, slot)) * pr(t, at[0] + .5, at[0] + 1), x0 = area.x + area.w / 2 - fw / 2, y0 = area.y + cy - fh / 2, fi = Math.floor(t * 24);
            if (a <= 0) return;
            c.save(); c.globalCompositeOperation = 'lighter';
            c.fillStyle = `rgba(255,255,255,${(.035 * (1 + MK.noise(t * 17)) * a).toFixed(3)})`; c.fillRect(x0, y0, fw, fh);
            for (let j = 0; j < 2; j++) { if (rnd(fi, 81 + j) < .55) continue; const x = x0 + rnd(fi, 83 + j) * fw; c.strokeStyle = `rgba(255,255,255,${.22 * a})`; c.lineWidth = 1 + rnd(fi, 85) * 1.5; c.beginPath(); c.moveTo(x, y0 + rnd(fi, 86) * fh * .3); c.lineTo(x + (rnd(fi, 87) - .5) * 6, y0 + fh * (.7 + .3 * rnd(fi, 88))); c.stroke(); }
            c.restore();
          },
          hint: { cx: area.x + area.w / 2, cy: area.y + cy, floor: .4 },
        };
      }
      const board = v === 'pin' ? box(el('div', 'board mk-abs', wrap), 0, 0, area.w, area.h) : null;
      const ins = v === 'pin' ? { x: 36, y: 66, w: area.w - 72, h: area.h - 96 } : { x: 0, y: 10, w: area.w, h: area.h - 10 };
      const Lp = polLayout(n, ins.w, ins.h, P), pw = Lp.pw, ph = Lp.ph;
      const cards = items.map((it, i) => {
        const c = box(el('div', 'pol mk-abs', wrap), 0, 0, pw, ph);
        const fr = box(el('div', 'ph mk-abs', c), pw * .06, pw * .06, pw * .88, pw * .88);
        const pc = pic(fr, ctx, it, 'src', i, 'full');
        const cap = it.caption ? box(el('div', 'mk-sc-hand mk-abs', c, esc(plain(it.caption))), pw * .06, pw * .955, pw * .88) : null;
        if (v === 'drop') { const tp = box(el('div', 'tape mk-abs', c), pw * .32, -pw * .05, pw * .36, pw * .11); tp.style.transform = `rotate(${((rnd(i, 4) - .5) * 10).toFixed(2)}deg)`; }
        const q = Lp.pos[i], cx = ins.x + q.x + (rnd(i, 1) - .5) * pw * .08, cy = ins.y + q.y + (rnd(i, 2) - .5) * ph * .05, r0 = (rnd(i, 3) - .5) * (v === 'pin' ? 10 : 14);
        c.style.transformOrigin = v === 'pin' ? `50% ${(pw * .035).toFixed(1)}px` : '50% 0';
        const d = ph / 2 - pw * .035, rad = r0 * Math.PI / 180;
        return { c, pc, cap, cx, cy, r0, px: cx + d * Math.sin(rad), py: cy - d * Math.cos(rad) };
      });
      let paths = [], pins = [];
      if (v === 'pin') {
        const ink = svg(wrap, area.w, area.h, cards.slice(1).map((b, j) => { const a = cards[j], mx = (a.px + b.px) / 2, my = Math.max(a.py, b.py) + 60; return `<path d="M${a.px.toFixed(1)} ${a.py.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${b.px.toFixed(1)} ${b.py.toFixed(1)}"/>`; }).join(''));
        paths = [...ink.querySelectorAll('path')];
        pins = cards.map(() => box(el('div', 'pin mk-abs', wrap), 0, 0, 28, 28));
      }
      ctx.measure(() => cards.forEach(cd => { if (!cd.cap) return; cd.cap.style.height = cd.cap.style.lineHeight = (pw * .245).toFixed(1) + 'px'; fit(cd.cap, Math.round(pw * .11), 12, pw * .86, pw * .25); }));
      if (v === 'drop') { entryAt.forEach((c, i) => { const pn = pan(cards[i].cx); S(c - .2, 'shutter', .4, pn); S(c + .27, 'thud', .5, pn); if (cards[i].cap) S(readable ? at[i] - .7 : c + .9, 'marker', .25, pn); }); S(motionLast + 2, 'shine', .25); }
      else { S(slot.t0, 'swoosh', .35); at.forEach((c, i) => { const pn = pan(cards[i].cx); S(c, 'snap', .5, pn); S(c + .32, 'tick', .5, pn); if (i) S(c + .45, 'scratch', .2, pn); }); }
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          if (board) { const kb = pr(t, slot.t0, slot.t0 + .55); tf(board, { o: clamp(kb * 3), s: .94 + .06 * EZ.out5(kb) }); }
          cards.forEach((cd, i) => {
            const c = entryAt[i];
            cd.pc.frame(t);
            if (v === 'drop') {
              const k = pr(t, c, c + .8), b = EZ.bounce(k), sw = Math.sin((t - c) * 1.5 + i * 1.7) * 1.4 * pr(t, c + .9, c + 1.6);
              tf(cd.c, { x: cd.cx - pw / 2, y: cd.cy - ph / 2 - (1 - b) * (area.h + 260), r: cd.r0 + (1 - EZ.out(k)) * (i % 2 ? 26 : -26) + sw, o: clamp(k * 8) });
              const dv = EZ.inout(pr(t, c + .35, c + 2));
              cd.pc.m.style.filter = dv < 1 ? `brightness(${lerp(.1, 1, dv).toFixed(3)}) saturate(${dv.toFixed(3)}) sepia(${lerp(.7, 0, dv).toFixed(3)}) contrast(${lerp(.7, 1, dv).toFixed(3)})` : '';
              if (cd.cap) cd.cap.style.clipPath = `inset(-20% ${((1 - (readable ? pr(t, at[i] - .7, at[i]) : pr(t, c + .9, c + 1.6))) * 100).toFixed(1)}% -20% 0)`;
            } else {
              const k = pr(t, c, c + .42), e = EZ.out5(k), sw = Math.sin((t - c) * 1.2 + i * 2.1) * .9 * pr(t, c + .6, c + 1.4);
              tf(cd.c, { x: cd.cx - pw / 2, y: cd.cy - ph / 2, r: cd.r0 + (1 - e) * (i % 2 ? -12 : 12) + sw, s: 1.5 - .5 * e, o: clamp(k * 5), blur: (1 - k) * 8 });
              const kp = pr(t, c + .3, c + .5);
              tf(pins[i], { x: cd.px - 14, y: cd.py - 14 - (1 - EZ.out5(kp)) * 30, s: 1 + (1 - EZ.out5(kp)) * 1.2, o: clamp(kp * 4) });
              if (cd.cap) cd.cap.style.clipPath = `inset(-20% ${((1 - pr(t, c + .5, c + 1.1)) * 100).toFixed(1)}% -20% 0)`;
            }
          });
          paths.forEach((pa, j) => { draw(pa, EZ.inout(pr(t, at[j + 1] + .45, at[j + 1] + 1))); pa.style.opacity = (.8 + .2 * Math.sin(t * 2.4 + j)).toFixed(3); });
        },
        bg(c, t) { if (v === 'drop') entryAt.forEach((c0, i) => MK.fx.ripple(c, t, c0 + .27, area.x + cards[i].cx, area.y + cards[i].cy + ph * .5, { r: pw * .7, rings: 1 })); },
        fg(c, t) { if (v === 'drop') MK.fx.twinkle(c, t, area.x, area.y, area.w, area.h, 10, T().w, pr(t, motionLast + 1.8, motionLast + 2.4) * (1 - leave(t, slot))); },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- device：设备样机 ----------
     phone   手机从侧面三维旋入，屏幕点亮，停留时悬浮轻摆
     tablet  平板从平放立起（绕底边翻起），停留时轻微俯仰
     monitor 显示器落位后「开机」：一道亮线展开成画面
     屏幕内容是图片或视频（视频按成片时钟播放），带反光扫过；有标题时横屏放右侧、竖屏放上方 */
  MK.control('device', {
    variants: ['phone', 'tablet', 'monitor'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, hasT = !!(p.title || p.sub);
      const wrap = box(el('div', 'mk-abs mk-dev', ctx.root), area.x, area.y, area.w, area.h);
      let rx = 0, ry = 0, rw = area.w, rh = area.h, tx = 0, tw = area.w, th = 0;
      if (!P && hasT) { rw = area.w * (v === 'phone' ? .42 : .56); tx = rw + area.w * .04; tw = area.w - tx; }
      if (P && hasT) { th = Math.min(220, area.h * .3); ry = th; rh = area.h - th; }
      let dw, dh, stand = 0;
      if (v === 'phone') { dh = rh * .96; dw = dh * .49; if (dw > rw * .9) { dw = rw * .9; dh = dw / .49; } }
      else if (v === 'tablet') { const ar = P ? .76 : 1.36; dw = Math.min(rw * .94, rh * .92 * ar); dh = dw / ar; }
      else { stand = rh * .14; dw = Math.min(rw * .96, (rh * .96 - stand - 44) * 16 / 9 + 28); dh = (dw - 28) * 9 / 16 + 44; }
      const dx = rx + (rw - dw) / 2, dy = ry + (rh - dh - stand) / 2;
      const dev = box(el('div', 'dev mk-abs ' + v, wrap), 0, 0, dw, dh);
      const bz = v === 'phone' ? dw * .045 : v === 'tablet' ? dw * .035 : 14, chin = v === 'monitor' ? 30 : 0, rad = v === 'phone' ? dw * .16 : v === 'tablet' ? dw * .06 : 14;
      dev.style.borderRadius = rad + 'px';
      const sw = dw - bz * 2, sh = dh - bz * 2 - chin;
      const scr = box(el('div', 'scr mk-abs', dev), bz, bz, sw, sh); scr.style.borderRadius = Math.max(4, rad - bz) + 'px';
      const pc = pic(scr, ctx, p, 'src', 0, 'full');
      const off = el('div', 'off', scr), pl = box(el('div', 'pl mk-abs', scr), 0, sh / 2 - 2, sw, 4), refl = el('div', 'mk-sc-gl refl', scr);
      if (v === 'phone') { const isl = box(el('div', 'isl mk-abs', dev), dw / 2 - dw * .15, bz + dh * .014, dw * .3, dh * .036); isl.style.borderRadius = (dh * .018) + 'px'; }
      if (v === 'tablet') box(el('div', 'cam mk-abs', dev), dw / 2 - 4, bz / 2 - 4, 8, 8);
      if (v === 'monitor') { box(el('div', 'neck mk-abs', dev), dw / 2 - dw * .06, dh - 2, dw * .12, stand * .82); const bs = box(el('div', 'base mk-abs', dev), dw / 2 - dw * .18, dh + stand * .8 - 4, dw * .36, stand * .2); bs.style.borderRadius = (stand * .1) + 'px'; }
      let tt = null, acc = null, ttl = null, sub = null;
      if (hasT) {
        tt = box(el('div', 'tt mk-abs', wrap), tx, 0, tw);
        acc = el('div', 'acc', tt); ttl = p.title ? el('div', 'ttl', tt, rich(p.title)) : null; sub = p.sub ? el('div', 'sub', tt, rich(p.sub)) : null;
        if (P) { tt.style.textAlign = 'center'; acc.style.margin = '0 auto 20px'; }
      }
      ctx.measure(() => {
        if (!tt) return;
        if (ttl) fit(ttl, P ? 62 : 66, 30, tw, P ? th * .66 : 170);
        if (sub) fit(sub, 36, 20, tw, P ? 54 : 104);
        const h = tt.offsetHeight;
        tt.style.top = (P ? Math.max(0, (th - h) / 2 - 6) : (area.h - h) / 2) + 'px';
      });
      const c0 = slot.cues[0] ?? slot.t0 + .2, c1 = slot.cues[1] ?? c0 + (v === 'tablet' ? 1.1 : 1);
      if (v === 'phone') { S(c0 - .1, 'whoosh', .5); S(c0 + .35, 'thud', .45); S(c1, 'blip', .35, 0, { n: 4 }); }
      else if (v === 'tablet') { S(c0 - .05, 'swoosh', .5); S(c0 + .55, 'thud', .45); S(c1, 'blip', .35, 0, { n: 6 }); }
      else { S(c0, 'card', .45); S(c0 + .4, 'thud', .35); S(c1, 'zap', .35); S(c1 + .1, 'hum', .2, 0, { d: .5 }); }
      S(c1 + .55, 'shine', .3); if (hasT) S(c1 + .15, 'pop', .35);
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          const k = pr(t, c0 - .1, c0 + .9), hv = pr(t, c0 + .9, c0 + 1.6), fl = Math.sin((t - c0) * 1.3) * 8 * hv, sy = Math.sin((t - c0) * .6) * hv;
          if (v === 'phone') tf(dev, { p: 1600, x: dx, y: dy + (1 - EZ.expo(k)) * 90 + fl, ry: (1 - EZ.back(k)) * -80 + sy * 6, rx: (1 - EZ.out(k)) * 10, s: .85 + .15 * EZ.out5(k), o: clamp(k * 4) });
          else if (v === 'tablet') { dev.style.transformOrigin = '50% 100%'; tf(dev, { p: 1400, x: dx, y: dy + (1 - EZ.expo(k)) * 120 + fl * .6, rx: (1 - EZ.out5(k)) * 64 + sy * 3, ry: sy * 5, s: .9 + .1 * EZ.back(k), o: clamp(k * 4) }); }
          else { const kb = pr(t, c0, c0 + .7); tf(dev, { x: dx, y: dy - (1 - EZ.bounce(kb)) * 70 + fl * .4, s: .94 + .06 * EZ.out5(kb), ry: sy * 3, p: 1800, o: clamp(kb * 5) }); }
          pc.frame(t);
          const on = pr(t, c1, c1 + .5);
          if (v === 'monitor') {
            const ln = EZ.out5(pr(t, c1, c1 + .16)), op = EZ.out5(pr(t, c1 + .14, c1 + .5));
            off.style.opacity = (1 - op).toFixed(3);
            pc.m.style.clipPath = `inset(${((1 - op) * 50).toFixed(2)}% 0)`;
            tf(pl, { sx: Math.max(.001, ln), sy: 1 + op * 6, o: ln * (1 - op) });
          } else { off.style.opacity = (1 - EZ.out(on)).toFixed(3); tf(pl, { o: 0 }); }
          pc.inner.style.transform = `scale(${(1.08 - .08 * EZ.out(pr(t, c1, c1 + 1.2)) + .04 * EZ.sine(pr(t, c1 + 1.2, slot.t1))).toFixed(4)})`;
          shine(refl, t < c1 + 2.6 ? EZ.inout(pr(t, c1 + .5, c1 + 1.3)) : sweep(t, c1 + 2.6, 3.4));
          if (tt) {
            const ka = pr(t, c1, c1 + .5), kt = pr(t, c1 + .1, c1 + .7), ks = pr(t, c1 + .3, c1 + .85);
            acc.style.transformOrigin = P ? '50% 50%' : '0 50%'; tf(acc, { sx: Math.max(.001, EZ.out5(ka)), o: clamp(ka * 4) });
            if (ttl) { ttl.style.clipPath = `inset(-20% ${((1 - EZ.out5(kt)) * 100).toFixed(1)}% -20% 0)`; tf(ttl, { x: (1 - EZ.expo(kt)) * -30, o: clamp(kt * 3) }); }
            if (sub) tf(sub, { o: clamp(ks * 3), y: (1 - EZ.expo(ks)) * 16 });
          }
        },
        bg(c, t) {
          const a = 1 - leave(t, slot), cx = area.x + dx + dw / 2;
          MK.fx.glow(c, cx, area.y + dy + dh / 2, Math.max(dw, dh) * .75, T().a, .45 * a * pr(t, c1, c1 + .8));
          MK.fx.glow(c, cx, area.y + dy + dh + stand, dw * .9, T().a2, .3 * a * pr(t, c0, c0 + .8));
        },
        hint: { cx: area.x + dx + dw / 2, cy: area.y + dy + dh / 2 },
      };
    },
  });

  /* ---------- collage：拼贴墙 ----------
     masonry 瀑布流：各列方块从上方逐块弹落，之后相邻列反向缓慢滚动；有标题时居中压一块标题牌
     mosaic  第一张素材切成碎片，从四周旋转飞入拼合成整图，缝隙合拢时一闪；停留时缓慢推近 + 扫光
     wall    作品墙：多行横向无限滚动（相邻行反向），经过中心的那张放大提亮 */
  MK.control('collage', {
    variants: ['masonry', 'mosaic', 'wall'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, items = p.items, n = items.length;
      const wrap = box(el('div', 'mk-abs mk-col', ctx.root), area.x, area.y, area.w, area.h);
      const c0 = slot.cues[0] ?? slot.t0 + .15;
      const ttl = p.title ? el('div', 'ttl mk-abs' + (v === 'masonry' ? ' plate' : ''), wrap, rich(p.title)) : null;
      const tH = ttl && v !== 'masonry' ? 88 : 0, frames = [];
      let stage = null, cols = [], fr = null, shards = [], im = null, gl = null, phIcon = null, rows = [], fw = 0, fh = 0, fx = 0, fy = 0, done = c0 + 1.2, tw = 0, rh = 0, pitch = 0;
      if (v === 'masonry') {
        stage = box(el('div', 'stage mk-abs', wrap), 0, 0, area.w, area.h);
        const nc = P ? 3 : Math.max(3, Math.min(6, Math.round(area.w / 260))), gap = 16, cw = (area.w - gap * (nc - 1)) / nc;
        let k = 0;
        for (let j = 0; j < nc; j++) {
          const ce = box(el('div', 'cl mk-abs', stage), j * (cw + gap), 0, cw), arr = [];
          let y = 0;
          while (y < area.h + 40) { const hh = cw * [1.25, .8, 1.05, .72, 1.4][Math.floor(rnd(k, 11) * 5)]; arr.push({ it: items[k % n], i: k, y, hh }); y += hh + gap; k++; }
          const tiles = [];
          [0, 1].forEach(copy => arr.forEach(a => {
            const tl = box(el('div', 'tl mk-abs', ce), 0, 0, cw, a.hh), ph = pic(tl, ctx, a.it, 'src', a.i % n, 'full');
            frames.push(ph); tiles.push({ tl, y: a.y + copy * y, d: c0 + j * .07 + a.y / area.h * .45, r: (rnd(a.i, 12) - .5) * 16 });
          }));
          cols.push({ ce, tiles, Hc: y, dir: j % 2 ? 1 : -1, sp: 20 + rnd(j, 13) * 14 });
        }
        done = c0 + (nc - 1) * .07 + .45 + .6;
      } else if (v === 'mosaic') {
        const avail = area.h - tH;
        fw = Math.min(area.w, avail * 1.6); fh = Math.min(avail, fw / (P ? 1.2 : 1.6)); fx = (area.w - fw) / 2; fy = (avail - fh) / 2;
        fr = box(el('div', 'fr mk-abs', wrap), fx, fy, fw, fh);
        const ar = fw / fh, nx = ar > 1.25 ? 8 : 6, ny = Math.max(3, Math.round(nx / ar)), sw = fw / nx, sh = fh / ny, it = items[0];
        if (it.$media && it.$media.src) { im = el('img', 'src mk-abs', fr); ctx.mediaOf(im, it, 'src'); }
        for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
          const i = r * nx + c, e = box(el('div', 'sh mk-abs' + (im ? '' : ' ph'), fr), c * sw, r * sh, sw + .5, sh + .5);
          const dd = Math.hypot((c + .5) / nx - .5, (r + .5) / ny - .5), a = rnd(i, 22) * Math.PI * 2, dist = (.6 + rnd(i, 23) * .8) * fw * .7;
          shards.push({ e, c, r, d: c0 + dd * .9 + rnd(i, 21) * .25, dx: Math.cos(a) * dist, dy: Math.sin(a) * dist, rot: (rnd(i, 24) - .5) * 240 });
        }
        done = Math.max(...shards.map(s => s.d)) + .7;
        fr._g = { nx, ny, sw, sh };
        if (!im) phIcon = el('div', 'phi mk-abs', fr, MK.icon('image', 72, 1.3));
        gl = el('div', 'mk-sc-gl', fr);
      } else {
        stage = box(el('div', 'wst mk-abs', wrap), 0, 0, area.w, area.h - tH);
        const stH = area.h - tH, nr = P ? (stH > 900 ? 4 : 3) : 3, gap = 20;
        rh = (stH - gap * (nr + 1)) / nr; tw = rh * 1.4; pitch = tw + gap;
        const cnt = Math.max(n, Math.ceil(area.w * 1.3 / pitch) + 1);
        for (let r = 0; r < nr; r++) {
          const re = box(el('div', 'row mk-abs', stage), 0, gap + r * (rh + gap), cnt * pitch * 2, rh), tiles = [];
          for (let q = 0; q < cnt * 2; q++) {
            const ii = (q % cnt + r * 2) % n, tl = box(el('div', 'tl mk-abs', re), q * pitch, 0, tw, rh), ph = pic(tl, ctx, items[ii], 'src', ii, 'full');
            frames.push(ph); tiles.push({ tl, ph, q });
          }
          rows.push({ re, tiles, Lc: cnt * pitch, dir: r % 2 ? 1 : -1, sp: 60 + r * 14 });
        }
      }
      const c1 = slot.cues[1] ?? Math.min(slot.t1 - 1, done + .3);
      ctx.measure(() => {
        if (ttl) {
          const w = area.w * (v === 'masonry' ? .8 : 1);
          fit(ttl, P ? 56 : 54, 28, w, null);
          if (v === 'masonry') { ttl.style.width = 'auto'; const bw = ttl.offsetWidth, bh = ttl.offsetHeight; Object.assign(ttl.style, { left: ((area.w - bw) / 2) + 'px', top: ((area.h - bh) / 2) + 'px' }); }
          else { ttl.style.left = '0'; ttl.style.width = area.w + 'px'; ttl.style.top = (area.h - tH + (tH - ttl.offsetHeight) / 2 + 4) + 'px'; }
        }
        if (v === 'mosaic') {
          /* 按 cover 规则计算整图在画框里的尺寸，再给每块碎片对应的背景偏移 */
          const iw = im && im.naturalWidth || fw, ih = im && im.naturalHeight || fh, k = Math.max(fw / iw, fh / ih), bw = iw * k, bh = ih * k, ox = (fw - bw) / 2, oy = (fh - bh) / 2;
          shards.forEach(s => { s.e.style.backgroundSize = `${bw.toFixed(1)}px ${bh.toFixed(1)}px`; s.e.style.backgroundPosition = `${(ox - s.c * fr._g.sw).toFixed(1)}px ${(oy - s.r * fr._g.sh).toFixed(1)}px`; });
        }
      });
      if (v === 'masonry') { S(c0 - .1, 'whoosh', .4); cols.forEach((cl, j) => S(c0 + j * .07 + .25, 'thud', .3, (j / Math.max(1, cols.length - 1) - .5) * .8)); }
      else if (v === 'mosaic') { S(c0, 'riser', .35, 0, { d: done - c0 }); for (let q = 0; q < 6; q++) S(c0 + .35 + q * .18, 'tick', .2, rnd(q, 31) - .5); S(done, 'hit', .6); flash(done, .22); punch(done, .03); S(done + .2, 'shine', .35); }
      else rows.forEach((r, i) => S(c0 + i * .1, 'whoosh', .4, r.dir * .5));
      if (ttl) S(c1, 'pop', .4);
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          frames.forEach(f => f.frame(t));
          if (v === 'masonry') {
            const u = Math.max(0, t - (c0 + 1));
            cols.forEach(cl => {
              const off = (cl.sp * (u > 1 ? u - .5 : u * u / 2)) % cl.Hc;
              tf(cl.ce, { y: cl.dir < 0 ? -off : off - cl.Hc });
              cl.tiles.forEach(tl => { const kd = pr(t, tl.d, tl.d + .65); tf(tl.tl, { y: tl.y - (1 - EZ.bounce(kd)) * area.h * .8, r: (1 - EZ.out(kd)) * tl.r, o: clamp(kd * 5) }); });
            });
          } else if (v === 'mosaic') {
            if (im) {
              ctx.frameAt(im, items[0], t, 'src');
              const url = `url("${im.src}")`;
              if (fr._u !== url) { fr._u = url; shards.forEach(s => { s.e.style.backgroundImage = url; }); }
            }
            const gk = 1 - pr(t, done - .1, done + .25);
            shards.forEach(s => {
              const k = pr(t, s.d, s.d + .7), e = EZ.out5(k);
              tf(s.e, { x: s.dx * (1 - e), y: s.dy * (1 - e), r: s.rot * (1 - e), s: lerp(.3, 1, EZ.back(k)), o: clamp(k * 3) });
              s.e.style.clipPath = gk > 0 ? `inset(${(3 * gk).toFixed(2)}px round ${(5 * gk).toFixed(2)}px)` : '';
              s.e.style.filter = k < 1 ? `brightness(${lerp(1.9, 1, EZ.out(k)).toFixed(3)})` : '';
            });
            tf(fr, { s: 1 + .035 * EZ.sine(pr(t, done, slot.t1)) });
            if (phIcon) set(phIcon, { o: pr(t, done, done + .4), s: .8 + .2 * EZ.back(pr(t, done, done + .5)) });
            shine(gl, t < done + 2 ? EZ.inout(pr(t, done + .1, done + .9)) : sweep(t, done + 2, 3.6));
          } else {
            const u = Math.max(0, t - c0);
            rows.forEach((r, i) => {
              const kr = pr(t, c0 + i * .1, c0 + i * .1 + .6), off = (r.sp * u + area.w * .6 * (1 - Math.exp(-u * 2.5))) % r.Lc, x0 = r.dir < 0 ? -off : off - r.Lc;
              tf(r.re, { x: x0 + r.dir * -(1 - EZ.out5(kr)) * area.w * .5, o: clamp(kr * 3) });
              r.tiles.forEach(tl => {
                const cx = x0 + tl.q * pitch + tw / 2, f = EZ.inout(clamp(1 - Math.abs(cx - area.w / 2) / (pitch * .85))) * pr(t, c0 + .6, c0 + 1.2);
                tf(tl.tl, { s: 1 + .1 * f });
                tl.tl.style.zIndex = f > .3 ? '3' : '1';
                tl.ph.m.style.filter = `brightness(${(1 - .5 * pr(t, c0 + .6, c0 + 1.2) + .5 * f).toFixed(3)})`;
                tl.tl.classList.toggle('on', f > .55);
              });
            });
          }
          if (ttl) {
            const k = pr(t, c1, c1 + .5);
            if (v === 'masonry') tf(ttl, { s: .7 + .3 * EZ.back(k), o: clamp(k * 4) });
            else { ttl.style.clipPath = `inset(-20% ${((1 - EZ.out5(k)) * 50).toFixed(1)}% -20% ${((1 - EZ.out5(k)) * 50).toFixed(1)}%)`; tf(ttl, { y: (1 - EZ.expo(k)) * 20, o: clamp(k * 3) }); }
            ttl.style.zIndex = '20';
          }
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          if (v === 'mosaic') MK.fx.glow(c, area.x + fx + fw / 2, area.y + fy + fh / 2, fw * .7, T().a, .5 * a * pr(t, done - .2, done + .6));
        },
        fg(c, t) { if (v === 'mosaic') T().paint.burst(c, t, done, area.x + fx + fw / 2, area.y + fy + fh / 2, { n: 50, sp: 1000 }); },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- spotlight：聚光 / 放大镜 ----------
     spotlight 画面压暗，一束聚光圈依次移到每个关注点（移动途中收小再张开），停留时呼吸、手持感微动
     magnifier 圆形放大镜沿弧线移到各点，镜内 2.2 倍放大
     blur      关注点之外虚化压暗，清晰区域跟着点走
     每个点到达后旁边弹出编号标签；访问过的点留下编号小圆 */
  MK.control('spotlight', {
    variants: ['spotlight', 'magnifier', 'blur'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, pts = p.points, n = pts.length;
      const wrap = box(el('div', 'mk-abs mk-spot', ctx.root), area.x, area.y, area.w, area.h);
      const hd = header(wrap, p.title, area.w, true), top = hd ? HEAD : 0, avail = area.h - top;
      const fw = Math.min(area.w, avail * 1.6), fh = Math.min(avail, fw / (P ? 1.25 : 1.6)), fx = (area.w - fw) / 2, fy = top + (avail - fh) / 2;
      const fr = box(el('div', 'fr mk-abs', wrap), fx, fy, fw, fh);
      const base = pic(fr, ctx, p, 'src', 0, 'full');
      const R = fh * (v === 'blur' ? .24 : .2), D = fh * .44, Z = 2.2;
      let dark = null, ring = null, lens = null, lp = null, bl = null;
      if (v === 'spotlight') { dark = el('div', 'dark mk-abs', fr); ring = el('div', 'ring mk-abs', fr); }
      else if (v === 'blur') { bl = pic(fr, ctx, p, 'src', 0, 'full blurl'); ring = el('div', 'ring dash mk-abs', fr); }
      const marks = pts.map((q, i) => el('div', 'mk mk-abs', fr, String(i + 1)));
      if (v === 'magnifier') {
        lens = box(el('div', 'lens mk-abs', fr), 0, 0, D, D);
        el('i', 'hdl', lens);
        const glass = el('div', 'glass', lens);
        lp = pic(glass, ctx, p, 'src', 0); box(lp.m, 0, 0, fw * Z, fh * Z);
      }
      const chips = pts.map((q, i) => el('div', 'chip mk-abs', fr, `<b>${i + 1}</b><span>${esc(q.label || '')}</span>`));
      ctx.measure(() => {
        if (hd) fit(hd, P ? 58 : 56, 30, area.w, null);
        chips.forEach((c, i) => { const s = c.lastChild; if (!pts[i].label) { s.remove(); c.classList.add('only'); } else { fit(s, P ? 34 : 30, 16, fw * .42, null); s.style.width = 'auto'; } c._w = c.offsetWidth; c._h = c.offsetHeight; });
      });
      const c0 = slot.cues[0] ?? slot.t0 + .15;
      const g = Math.min(1.7, Math.max(.8, (slot.t1 - c0 - 1.1 - 1.6) / Math.max(1, n - 1)));
      const at = pts.map((_, i) => slot.cues[i + 1] ?? c0 + .9 + i * g);
      const P0 = pts.map(q => ({ x: clamp(q.x) * fw, y: clamp(q.y) * fh }));
      /* 当前光圈中心与移动进度（j = 正在前往的点） */
      const where = t => {
        let x = P0[0].x, y = P0[0].y, mv = 0;
        for (let j = 1; j < n; j++) { const k = EZ.inout(pr(t, at[j], at[j] + .7)); if (k <= 0) break; x = lerp(P0[j - 1].x, P0[j].x, k); y = lerp(P0[j - 1].y, P0[j].y, k); mv = Math.sin(Math.PI * k); }
        const h = pr(t, at[0] + .6, at[0] + 1.2);
        return { x: x + MK.noise(t * .7) * fw * .006 * h, y: y + MK.noise(t * .7 + 40) * fh * .008 * h, mv };
      };
      S(c0, 'card', .45);
      if (v === 'spotlight') { S(at[0], 'thud', .5); S(at[0] + .1, 'shine', .3); }
      else if (v === 'magnifier') S(at[0], 'pop', .5);
      else { S(at[0] - .1, 'swell', .35, 0, { d: .6 }); S(at[0] + .3, 'tick', .4); }
      at.forEach((c, j) => { if (j) { S(c, v === 'magnifier' ? 'swipe' : 'swoosh', .35, (P0[j].x / fw - .5) * .8); } S(c + .45, 'blip', .3, (P0[j].x / fw - .5) * .8, { n: j * 2 }); });
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          headIn(hd, t, slot.t0);
          const k = pr(t, c0 - .1, c0 + .65);
          tf(fr, { o: clamp(k * 3), s: .92 + .08 * EZ.back(k), y: (1 - EZ.expo(k)) * 40 });
          base.frame(t); if (bl) bl.frame(t); if (lp) lp.frame(t);
          const { x, y, mv } = where(t), dk = EZ.out(pr(t, at[0] - .2, at[0] + .35));
          const r = R * EZ.back(pr(t, at[0], at[0] + .55)) * (1 - .3 * mv) * (1 + .04 * Math.sin(t * 2.2));
          if (v === 'spotlight') {
            dark.style.background = `radial-gradient(circle at ${x.toFixed(1)}px ${y.toFixed(1)}px, rgba(4,5,8,0) ${(r * .82).toFixed(1)}px, rgba(4,5,8,${(.84 * dk).toFixed(3)}) ${(r * 1.02 + .5).toFixed(1)}px)`;
          } else if (v === 'blur') {
            const m = `radial-gradient(circle at ${x.toFixed(1)}px ${y.toFixed(1)}px, transparent ${(r * .85).toFixed(1)}px, #000 ${(r * 1.2 + .5).toFixed(1)}px)`;
            bl.m.style.webkitMaskImage = m; bl.m.style.maskImage = m; bl.m.style.opacity = dk.toFixed(3);
          }
          if (ring) { ring.style.width = ring.style.height = (2 * r).toFixed(1) + 'px'; tf(ring, { x: x - r, y: y - r, o: dk * (v === 'blur' ? .7 : 1) }); }
          if (lens) {
            const ks = pr(t, at[0], at[0] + .5), lx = x, ly = y - mv * fh * .06;
            tf(lens, { x: lx - D / 2, y: ly - D / 2, s: EZ.back(ks) * (1 + .02 * Math.sin(t * 2)), o: clamp(ks * 4) });
            lp.m.style.transform = `translate(${(-(lx * Z - D / 2)).toFixed(1)}px,${(-(ly * Z - D / 2)).toFixed(1)}px)`;
          }
          marks.forEach((m, j) => { const kv = j < n - 1 ? pr(t, at[j + 1] + .2, at[j + 1] + .55) : 0; tf(m, { x: P0[j].x - 18, y: P0[j].y - 18, s: EZ.back(kv), o: clamp(kv * 4) }); });
          chips.forEach((c, j) => {
            const kc = pr(t, at[j] + .4, at[j] + .8), ko = j < n - 1 ? 1 - pr(t, at[j + 1] - .1, at[j + 1] + .15) : 1, rad = v === 'magnifier' ? D / 2 : R;
            const side = P0[j].x > fw * .58 ? -1 : 1;
            let cx = side > 0 ? P0[j].x + rad + 22 : P0[j].x - rad - 22 - c._w, cy = P0[j].y - c._h / 2;
            cx = clamp(cx, 12, fw - c._w - 12); cy = clamp(cy, 12, fh - c._h - 12);
            tf(c, { x: cx + side * (1 - EZ.expo(kc)) * -24, y: cy, s: .9 + .1 * EZ.back(kc), o: clamp(kc * 3) * ko });
          });
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          MK.fx.glow(c, area.x + fx + fw / 2, area.y + fy + fh / 2, fw * .6, T().w, .25 * a * pr(t, at[0], at[0] + .6));
        },
        fg(c, t) {
          if (v !== 'spotlight') return;
          at.forEach((c0_, j) => MK.fx.ripple(c, t, c0_ + .55, area.x + fx + P0[j].x, area.y + fy + P0[j].y, { r: R * 1.4, rings: 1, col: T().w }));
        },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .5 },
      };
    },
  });
})();
