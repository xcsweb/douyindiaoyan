/* motion-kit · 品牌与转化类控件（0.3.0）：logo / intro / outro / cta / subscribe / countdown / price / reveal
   片头片尾与转化包装：Logo 揭示、电影感片头、片尾推荐位、行动号召按钮、三连点亮、倒计时、价格砸入盖章、抽奖揭晓。
     logo      burst 粒子汇聚后爆闪 / draw 外框描线后填充 / glitch 干扰定格
     intro     cinema 遮幅打开 + 光线扫过 + 字距收拢 / bold 色块分割 / minimal 线条极简
     outro     endcard 推荐位方框 + 关注按钮 / thanks 大字 + 彩纸 / next 下期预告卡
     cta       button 按钮弹入 + 光标点击 + 波纹 / arrow 大箭头指向 / swipe 上滑提示
     subscribe triple 三连依次点亮 / follow 关注变已关注 / bell 订阅 + 铃铛摇晃
     countdown ring 圆环倒走 / flip 翻页 / slam 大数字砸入
     price     tag 吊牌摆入 / card 套餐卡数字滚动 / sale 大促爆炸贴
     reveal    curtain 帘幕拉开 / card 卡片翻开 / box 礼物盒打开
   约定见 AUTHORING.md：只由 t 求值，音效在 build 里登记，颜色只取主题。 */
(function () {
  'use strict';
  const { clamp, lerp, pr, EZ, el, box, set, tf, fit, html, rich, esc, S, flash, shake, punch, idle, split, svg, draw, rnd } = MK;
  const T = () => MK.T;
  const leave = (t, slot) => pr(t, slot.t1 - .35, slot.t1);
  /* 行内元素（胶囊、按钮里的 span）：fit 量完字号后清掉宽度，让外框按内容收缩 */
  const fitw = (e, ...a) => { const s = fit(e, ...a); e.style.width = ''; return s; };
  /* 子元素实际占到的最底端（相对容器），用于整组垂直居中 */
  const extent = wrap => { const r = wrap.getBoundingClientRect(); let b = 0; for (const e of wrap.children) { const q = e.getBoundingClientRect(); if (q.height) b = Math.max(b, q.bottom - r.top); } return b; };
  const C = e => { if (e) e.style.textAlign = 'center'; return e; };
  const plain = s => String(s ?? '').replace(/\*/g, '');
  const bell = (t, a, b) => Math.sin(Math.PI * pr(t, a, b));          // a..b 之间 0 → 1 → 0
  const POOL = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&@$';

  /* 字面扫光：units 为 split 出的字；每个字用同一条背景渐变，按字在整行里的偏移对齐。k = 光带位置 0..1（<0 不显示） */
  const glintPrep = (row, units) => {
    row._gw = Math.max(1, row.clientWidth);
    units.forEach(u => { u._gx = u.offsetLeft; u.classList.add('mk-br-g'); u.style.backgroundSize = `${row._gw * 3}px 100%`; });
  };
  const glint = (row, units, k) => {
    const X = (k < 0 ? -2 : lerp(-.25, 1.25, k)) * row._gw;
    units.forEach(u => { u.style.backgroundPosition = `${(X - u._gx - 1.5 * row._gw).toFixed(1)}px 0`; });
  };
  /* 鼠标光标（热点在尖端 6,4）；press 0..1 按下时缩小 */
  const CUR = '<svg width="56" height="68" viewBox="0 0 28 34"><path d="M3 2v25l6.5-6 4.6 10 4.4-2-4.6-9.8H23z" fill="#fff" stroke="#05060A" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  const cursorEl = parent => el('div', 'mk-br-cur mk-abs', parent, CUR);
  const putCursor = (e, x, y, o, press = 0) => tf(e, { x: x - 6, y: y - 4, o, s: 1 - .18 * press });
  /* 关键帧路径：keys = [[t, x, y], ...]，段间 inout 缓动 */
  const keyPath = (t, keys) => {
    if (t <= keys[0][0]) return [keys[0][1], keys[0][2]];
    for (let i = 1; i < keys.length; i++) {
      if (t < keys[i][0]) { const a = keys[i - 1], b = keys[i], k = EZ.inout(pr(t, a[0], b[0])); return [lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
    }
    const z = keys[keys.length - 1]; return [z[1], z[2]];
  };
  /* 数字 +1 滚动：两行叠放，k 0..1 从旧值滚到新值 */
  const rollEl = (parent, a, b) => el('span', 'mk-br-roll', parent, `<span><b>${esc(a)}</b><b>${esc(b)}</b></span>`);
  const roll = (e, k) => { if (e) e.firstChild.style.transform = `translateY(${(-50 * EZ.out5(k)).toFixed(2)}%)`; };
  /* 圆角矩形折线（画布上的拖尾光点沿它走） */
  const rrPts = (x, y, w, h, r) => {
    const pts = [], cs = [[x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI]];
    cs.forEach(([cx, cy, a0]) => { for (let k = 0; k <= 6; k++) { const a = a0 + k / 6 * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } });
    pts.unshift([x + r, y]); pts.push([x + r, y]);
    return pts;
  };
  /* 变形光带（片头横向镜头光晕） */
  const flare = (c, x, y, len, a, col) => {
    if (a <= .002) return;
    c.save(); c.globalCompositeOperation = 'lighter';
    let g = c.createLinearGradient(x - len, 0, x + len, 0);
    g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(.5, `rgba(${col},${.95 * a})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.fillRect(x - len, y - 1.5, len * 2, 3);
    g = c.createLinearGradient(x - len * .6, 0, x + len * .6, 0);
    g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(.5, `rgba(${col},${.18 * a})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.fillRect(x - len * .6, y - 14, len * 1.2, 28);
    c.restore();
    MK.fx.glow(c, x, y, len * .16, col, a);
  };
  /* 素材圆窗 / 方框：有素材放图，没有素材放中性占位 */
  const mediaBox = (parent, cls, o, k, ctx, ph = '') => {
    const e = el('div', cls, parent);
    let im = null;
    if (o && o[k]) { im = el('img', '', e); ctx.mediaOf(im, o, k); } else el('div', 'ph', e, ph);
    return { e, im };
  };

  /* ---------- logo：Logo 揭示 ----------
     burst  粒子从四周旋入汇聚，爆闪 + 冲击环，Logo 弹性弹出，字标字距收拢；停留时光环绕行、字面扫光
     draw   圆角外框描线 → 填色 → 字标从左擦出 + 下划线；停留时光点沿外框绕行
     glitch 错位切片 + 色散 + 乱码，咔嗒定格；停留时每隔一段轻微再闪
     有 src 时用图片作标志，没有时用 icon 或名字首字生成字标 */
  MK.control('logo', {
    variants: ['burst', 'draw', 'glitch'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait;
      const wrap = box(el('div', 'mk-abs mk-logo ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const ms = Math.round(Math.min(P ? 280 : 230, area.h * (P ? .34 : .38), area.w * .4)), rr = Math.round(ms * .26);
      const mark = box(el('div', 'mark mk-abs', wrap), (area.w - ms) / 2, 0, ms, ms);
      mark.style.borderRadius = rr + 'px';
      const bgf = el('div', 'bgf', mark);
      const name = plain(p.name);
      let im = null;
      if (p.src) { im = el('img', '', mark); ctx.mediaOf(im, p, 'src'); }
      const gl = p.src ? null : el('div', 'gl', mark, p.icon ? MK.icon(p.icon, Math.round(ms * .5), 2.2) : esc(([...name.trim()][0] || '·').toUpperCase()));
      if (gl) gl.style.fontSize = Math.round(ms * .56) + 'px';
      const word = C(box(el('div', 'word mk-abs', wrap), 0, 0, area.w));
      const chars = split(word, p.name, 'char');
      chars.forEach(u => { u._c = u.textContent; });
      const tag = p.tagline ? C(box(el('div', 'tag mk-abs', wrap, esc(p.tagline)), 0, 0, area.w)) : null;
      const ink = v === 'draw' ? svg(wrap, area.w, area.h) : null;
      const bar = v === 'draw' ? el('div', 'bar mk-abs', wrap) : null;
      let rect = null, ul = null;
      const G = { my: 0, wy: 0, wh: 0, ww: 0, wx: 0 }, hint = { cx: area.x + area.w / 2, cy: area.y + area.h * .42 };
      ctx.measure(() => {
        fit(word, P ? 150 : 140, 44, area.w * .92, null);
        if (tag) fit(tag, P ? 40 : 36, 20, area.w * .9, null);
        const wh = word.offsetHeight, th = tag ? tag.offsetHeight : 0, gap = Math.round(ms * .18), tg = v === 'draw' ? 30 : 14;
        const total = ms + gap + wh + (tag ? tg + th : 0);
        let y = Math.max(0, (area.h - total) / 2 - (P ? area.h * .03 : 0));
        mark.style.top = y + 'px'; G.my = y + ms / 2; y += ms + gap;
        word.style.top = y + 'px'; G.wy = y; G.wh = wh; y += wh + tg;
        if (tag) tag.style.top = y + 'px';
        if (v !== 'glitch') glintPrep(word, chars);
        const L = Math.min(...chars.map(u => u.offsetLeft)), R = Math.max(...chars.map(u => u.offsetLeft + u.offsetWidth));
        G.wl = L; G.ww = R - L; G.wx = L + parseFloat(word.style.left);
        hint.cy = area.y + G.my;
        if (ink) {
          const mx = (area.w - ms) / 2, my = G.my - ms / 2, r = rr;
          ink.innerHTML = `<path class="rc" d="M${mx + r} ${my} H${mx + ms - r} A${r} ${r} 0 0 1 ${mx + ms} ${my + r} V${my + ms - r} A${r} ${r} 0 0 1 ${mx + ms - r} ${my + ms} H${mx + r} A${r} ${r} 0 0 1 ${mx} ${my + ms - r} V${my + r} A${r} ${r} 0 0 1 ${mx + r} ${my} Z"/>` +
            `<path class="ul" d="M${G.wx} ${G.wy + wh + 8} H${G.wx + G.ww}"/>`;
          [rect, ul] = ink.querySelectorAll('path');
          Object.assign(bar.style, { top: (G.wy - 10) + 'px', height: (wh + 20) + 'px' });
        }
      });
      const c0 = slot.cues[0] ?? slot.t0 + (v === 'burst' ? .95 : v === 'glitch' ? .6 : .25);
      const c1 = slot.cues[1] ?? c0 + (v === 'draw' ? 1.55 : 1.05);
      const gather = Math.max(slot.t0, c0 - .9), lock = c0 + .1;
      const micro = []; for (let x = c1 + 1.4; x < slot.t1 - .7; x += 2.6) micro.push(x);
      if (v === 'burst') {
        S(gather, 'riser', .45, 0, { d: Math.max(.3, c0 - gather) }); S(c0, 'boom', .75); S(c0 + .02, 'shine', .45);
        flash(c0, .5); shake(c0, 9); punch(c0, .045);
        if (tag) S(c1, 'swoosh', .35);
      } else if (v === 'draw') {
        S(c0 - .1, 'marker', .5); S(c0 + .25, 'marker', .45, .3); S(c0 + .5, 'fill', .35, 0, { d: .4 });
        S(c0 + .62, 'whoosh', .35); S(c0 + 1.05, 'ding', .4, 0, { m: 91 });
        if (tag) S(c1, 'type', .35, 0, { d: Math.min(1.4, [...p.tagline].length / 20) });
      } else {
        S(c0 - .5, 'glitch', .5, 0, { d: .6 }); S(lock, 'snap', .7); S(lock, 'zap', .35); flash(lock, .3); shake(lock, 7);
        if (tag) S(c1, 'glitch', .25, 0, { d: .3 });
        micro.forEach(m => S(m, 'glitch', .14, 0, { d: .14 }));
      }
      const tagChars = [...String(p.tagline || '')];
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, s: 1 + EZ.in(out) * .04 });
          const hold = idle(t, c1 + .7, 3.4), live = t > c1 + .7;
          mark.style.setProperty('--gl', live ? (.5 + .5 * hold.wave).toFixed(3) : '0');
          const mid = (chars.length - 1) / 2;
          if (v === 'burst') {
            const k = pr(t, c0, c0 + 1);
            tf(mark, { o: clamp(k * 8), s: EZ.elastic(k), r: (1 - EZ.out(k)) * -25 });
            chars.forEach((u, i) => {
              const d = Math.abs(i - mid) * .03, q = pr(t, c0 + .1 + d, c0 + .85 + d);
              tf(u, { o: clamp(q * 3), x: (i - mid) * (1 - EZ.out5(q)) * ms * .5, s: 1 + (1 - EZ.out5(q)) * .3, blur: (1 - EZ.out(q)) * 14 });
            });
          } else if (v === 'draw') {
            draw(rect, EZ.inout(pr(t, c0 - .1, c0 + .6)));
            const kf = pr(t, c0 + .5, c0 + .85);
            bgf.style.opacity = EZ.out(kf).toFixed(3); if (im) im.style.opacity = EZ.out(kf).toFixed(3);
            tf(mark, { s: 1 + bell(t, c0 + .5, c0 + .9) * .07 });
            if (gl) gl.style.clipPath = `inset(${((1 - EZ.out5(pr(t, c0 + .65, c0 + 1.05))) * 100).toFixed(1)}% 0 0 0)`;
            const kw = EZ.inout(pr(t, c0 + .6, c0 + 1.25));
            word.style.clipPath = `inset(-30% ${Math.max(0, word.offsetWidth - G.wl - G.ww * kw).toFixed(1)}px -30% 0)`;
            set(bar, { x: G.wx + G.ww * kw - 3, o: kw > 0 && kw < 1 ? 1 : 0 });
            draw(ul, EZ.out(pr(t, c0 + 1.05, c0 + 1.5)));
          } else {
            const fi = Math.floor(t * 30), on = t >= c0 - .5;
            let g = t < lock ? 1 : 0;
            for (const m of micro) if (t >= m && t < m + .16) g = .6;
            const flick = g > 0 && rnd(fi, 91) < .3 ? .2 : 1, ks = t >= lock ? pr(t, lock, lock + .45) : 1, jx = g * (rnd(fi, 92) - .5) * 60;
            [mark, word].forEach((e, j) => {
              tf(e, { o: on ? flick : 0, x: jx * (j ? -.6 : 1), s: 1 + (1 - EZ.out5(ks)) * .1, sx: 1 + g * (rnd(fi, 93 + j) - .5) * .25 });
              e.style.clipPath = g > 0 && rnd(fi, 95 + j) < .6 ? `inset(${(rnd(fi, 96 + j) * 45).toFixed(1)}% 0 ${(rnd(fi, 98 + j) * 45).toFixed(1)}% 0)` : '';
              e.style.filter = g > 0 ? `drop-shadow(${(g * (rnd(fi, 100 + j) - .5) * 40).toFixed(1)}px 0 rgba(var(--bad-rgb),.85)) drop-shadow(${(g * (rnd(fi, 102 + j) - .5) * 40).toFixed(1)}px 0 rgba(var(--a-rgb),.85))` : '';
            });
            chars.forEach((u, i) => { const ch = g > 0 && rnd(fi * 7 + i, 104) < .35 ? POOL[Math.floor(rnd(fi * 3 + i, 105) * POOL.length)] : u._c; if (u.textContent !== ch) u.textContent = ch; });
          }
          if (tag) {
            if (v === 'draw') { set(tag, { o: t >= c1 - .05 ? 1 : 0 }); MK.type(tag, p.tagline, t, c1, 20); }
            else if (v === 'glitch') {
              const fi = Math.floor(t * 24);
              html(tag, esc(tagChars.map((ch, i) => (t >= c1 + .08 + i * .035 || /\s/.test(ch) ? ch : POOL[Math.floor(rnd(fi * 13 + i, 106) * POOL.length)])).join('')));
              set(tag, { o: t >= c1 ? 1 : 0 });
            } else { const q = pr(t, c1, c1 + .6); set(tag, { o: clamp(q * 2), y: (1 - EZ.expo(q)) * 24, blur: (1 - EZ.out(q)) * 8 }); }
          }
          if (v !== 'glitch') glint(word, chars, live ? EZ.inout(clamp(hold.sweep * 1.7)) : -1);
        },
        bg(c, t) {
          const cx = area.x + area.w / 2, cy = area.y + G.my, a = 1 - leave(t, slot), k = pr(t, c0, c0 + .8);
          MK.fx.glow(c, cx, cy, ms * 1.6, T().a, .6 * k * a);
          if (v === 'burst' && k > 0) { const a0 = (t - c0) * .9; T().paint.arcRing(c, cx, cy, ms * .82, a0, a0 + Math.PI * 1.3 * EZ.out(k), T().a, .7 * a); }
        },
        fg(c, t) {
          const cx = area.x + area.w / 2, cy = area.y + G.my, a = 1 - leave(t, slot);
          if (v === 'burst') {
            const k = pr(t, gather, c0);
            if (k > 0 && k < 1) {
              c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
              for (let i = 0; i < 110; i++) {
                const d = clamp((k - rnd(i, 83) * .25) / .75); if (d <= 0) continue;
                const e = EZ.in(d), r = (P ? 520 : 640) * (.5 + .8 * rnd(i, 82)) * (1 - e), an = rnd(i, 81) * 6.283 + e * 1.6, tail = 8 + 40 * e;
                const x = cx + Math.cos(an) * r, y = cy + Math.sin(an) * r * .85;
                c.strokeStyle = `rgba(${i % 4 ? T().aLite : T().w},${clamp(d * 3) * .9})`; c.lineWidth = 2 + rnd(i, 84) * 2;
                c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(an) * tail, y + Math.sin(an) * tail * .85); c.stroke();
              }
              c.restore(); MK.fx.glow(c, cx, cy, 240 * k, T().aLite, k);
            }
            T().paint.burst(c, t, c0, cx, cy, { n: 70, sp: 1300 });
            MK.fx.ripple(c, t, c0, cx, cy, { r: area.w * .55, rings: 3, col: T().aLite, w: 4 });
          } else if (v === 'draw' && t > c0 + .95) {
            const mx = area.x + (area.w - ms) / 2, my = cy - ms / 2;
            MK.fx.comet(c, rrPts(mx, my, ms, ms, rr), ((t - c0 - .95) * .3) % 1, T().aLite, a * pr(t, c0 + .95, c0 + 1.3));
          } else if (v === 'glitch') {
            const q = pr(t, lock - .05, lock + .25);
            if (q > 0 && q < 1) T().paint.beam(c, area.x, cy, area.x + area.w, cy, T().aLite, (1 - q) * a, { w: 3 });
          }
          if (t > c1 + .4) MK.fx.twinkle(c, t, area.x + G.wx - 30, area.y + G.wy - 20, G.ww + 60, G.wh + 40, 7, T().w, a * pr(t, c1 + .4, c1 + 1));
        },
        hint,
      };
    },
  });

  /* ---------- intro：片头 ----------
     cinema  遮幅黑边从中间打开，变形光带扫过，标题字距从宽收拢，集数两侧细线展开；停留时光带呼吸、字面扫光
     bold    细色条先扫过，主色块弹出（横屏在左、竖屏在上）带巨大集数，标题从遮罩里升起；停留时色块斜纹流动
     minimal 中线从中间向两侧画出，标题从线下升起、副标题从线上落下，四角括号描出；停留时光点沿线往返 */
  MK.control('intro', {
    variants: ['cinema', 'bold', 'minimal'],
    build(slot, p, ctx) {
      const { area, W, H } = ctx, v = ctx.variant, P = ctx.portrait;
      const wrap = box(el('div', 'mk-abs mk-intro ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const c0 = slot.cues[0] ?? slot.t0 + (v === 'cinema' ? .75 : .35);
      const c1 = slot.cues[1] ?? c0 + (v === 'cinema' ? 1.5 : 1.05);
      const hint = { cx: area.x + area.w / 2, cy: area.y + area.h * .45, floor: v === 'cinema' ? .25 : .6 };
      const G = {};
      /* 标题与副标题（各变体共用；bold 的标题放在遮罩里） */
      const ttlBox = v === 'cinema' ? null : el('div', 'mask mk-abs', wrap);
      const title = C(box(el('div', 'ttl mk-abs', ttlBox || wrap), 0, 0, area.w));
      const tc = v === 'cinema' ? split(title, p.title, 'char') : (title.innerHTML = rich(p.title), []);
      const subBox = v === 'minimal' ? el('div', 'mask mk-abs', wrap) : null;
      const sub = p.subtitle ? C(box(el('div', 'sub mk-abs', subBox || wrap, rich(p.subtitle)), 0, 0, area.w)) : null;
      let ep = null, bars = null, slab = null, slabEp = null, wipeBar = null, line = null, dot = null, ink = null, accent = null;
      if (v === 'cinema') {
        bars = [0, 1].map(i => el('div', 'mk-intro-bar mk-abs ' + (i ? 'b' : 't'), ctx.root));
        bars.forEach(b => { b.style.width = W + 'px'; });
        if (p.episode) ep = C(box(el('div', 'ep mk-abs', wrap, `<i></i><span>${esc(p.episode)}</span><i></i>`), 0, 0, area.w));
      } else if (v === 'bold') {
        wipeBar = el('div', 'wipe mk-abs', wrap);
        slab = el('div', 'slab mk-abs', wrap);
        if (p.episode) slabEp = C(el('div', 'sep mk-abs', slab, esc(p.episode)));
        accent = el('div', 'acc mk-abs', wrap);
      } else {
        line = el('div', 'ln mk-abs', wrap); dot = el('div', 'dot mk-abs', wrap);
        ink = svg(wrap, area.w, area.h);
        if (p.episode) ep = el('div', 'ep mk-abs', wrap, esc(p.episode));
      }
      ctx.measure(() => {
        if (v === 'cinema') {
          fit(title, P ? 124 : 132, 44, area.w * .92, null);
          if (sub) fit(sub, P ? 44 : 40, 22, area.w * .9, null);
          if (ep) fit(ep, 30, 18, area.w * .8, null);
          const eh = ep ? ep.offsetHeight + 26 : 0, th = title.offsetHeight, sh = sub ? sub.offsetHeight + 22 : 0, tot = eh + th + sh;
          let y = (area.h - tot) / 2 - (P ? area.h * .03 : 0);
          if (ep) ep.style.top = y + 'px'; y += eh; title.style.top = y + 'px'; G.ty = y + th / 2; y += th + 22;
          if (sub) sub.style.top = y + 'px';
          glintPrep(title, tc);
          G.fs = parseFloat(title.style.fontSize);
          G.cy = area.y + area.h / 2; G.oh = Math.min(H / 2, Math.max(tot / 2 + 90, area.h * .4));
        } else if (v === 'bold') {
          /* 横屏：色块在左（宽 36%）；竖屏：色块在上（高 38%） */
          const sw = P ? area.w : Math.round(area.w * .36), sh = P ? Math.round(area.h * .38) : area.h;
          box(slab, 0, 0, sw, sh); slab.style.clipPath = P ? 'polygon(0 0,100% 0,100% 78%,0 100%)' : 'polygon(0 0,100% 0,82% 100%,0 100%)';
          box(wipeBar, 0, P ? sh * .5 - 40 : area.h * .5 - 40, area.w, 80);
          if (slabEp) { slabEp.style.width = (sw * .8) + 'px'; fit(slabEp, P ? 200 : 210, 60, sw * (P ? .8 : .72), sh * .8); slabEp.style.left = ((P ? sw : sw * .9) - slabEp.offsetWidth) / 2 + 'px'; slabEp.style.top = (sh * (P ? .44 : .5) - slabEp.offsetHeight / 2) + 'px'; }
          const tx = P ? 0 : sw + 40, tw = P ? area.w : area.w - sw - 40, ty0 = P ? sh + 30 : 0, th0 = P ? area.h - sh - 30 : area.h;
          title.style.textAlign = 'left'; title.style.whiteSpace = 'normal';
          fit(title, P ? 130 : 128, 44, tw, th0 * (sub ? .62 : .8));
          if (sub) { sub.style.textAlign = 'left'; fit(sub, P ? 44 : 40, 22, tw - 30, null); }
          const thh = title.offsetHeight, shh = sub ? sub.offsetHeight + 30 : 0;
          const y = ty0 + (th0 - thh - shh) / 2;
          box(ttlBox, tx, y, tw, thh); title.style.left = '0'; title.style.top = '0';
          if (sub) { sub.style.left = (tx + 30) + 'px'; sub.style.top = (y + thh + 30) + 'px'; box(accent, tx, y + thh + 30, 8, sub.offsetHeight); }
          else box(accent, tx, y + thh + 20, 120, 8);
          G.sw = sw; G.sh = sh; hint.cx = area.x + (P ? area.w / 2 : tx + tw / 2); hint.cy = area.y + y + thh / 2;
        } else {
          fit(title, P ? 120 : 116, 44, area.w * .9, null);
          if (sub) fit(sub, P ? 42 : 38, 22, area.w * .86, null);
          const lw = area.w * (P ? .86 : .78), ly = area.h * (P ? .44 : .5), th = title.offsetHeight;
          box(line, (area.w - lw) / 2, ly - 1, lw, 2); G.lw = lw; G.ly = ly;
          box(ttlBox, 0, ly - 22 - th, area.w, th); title.style.top = '0';
          if (sub) { box(subBox, 0, ly + 22, area.w, sub.offsetHeight + 4); sub.style.top = '0'; }
          if (ep) { fit(ep, 26, 16, lw * .45, null); ep.style.left = ((area.w - lw) / 2) + 'px'; ep.style.top = (ly - 22 - th - ep.offsetHeight - 18) + 'px'; }
          const m = 26, L = 46, bx0 = m, by0 = Math.max(0, ly - th - 22 - (ep ? 80 : 50)), bx1 = area.w - m, by1 = Math.min(area.h, ly + (sub ? sub.offsetHeight + 22 : 0) + 60);
          ink.innerHTML = [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx1, by1, -1, -1], [bx0, by1, 1, -1]].map(([x, y, sx, sy]) => `<path d="M${x} ${y + sy * L} V${y} H${x + sx * L}"/>`).join('');
          G.ty = ly;
        }
      });
      if (v === 'cinema') {
        S(c0 - .55, 'swell', .4, 0, { d: 1.1 }); S(c0 + .05, 'whoosh', .45); S(c0 + .3, 'shine', .4); S(c0 + 1.3, 'boom', .45); punch(c0 + 1.3, .02);
        if (sub) S(c1, 'swoosh', .3);
      } else if (v === 'bold') {
        S(c0 - .3, 'whip', .6, -.4); S(c0 + .05, 'hit', .75); punch(c0 + .05, .04); shake(c0 + .05, 8); S(c0 + .35, 'thud', .55);
        if (sub) S(c1, 'swipe', .4);
      } else {
        S(c0 - .2, 'swoosh', .35); S(c0 + .3, 'tick', .4); S(c0 + .45, 'shine', .3); S(c0 + .25, 'blip', .25, 0, { n: 4 });
        if (sub) S(c1, 'tick', .35);
      }
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, s: 1 + EZ.in(out) * .03 });
          const hold = idle(t, c1 + .8, 3.6), live = t > c1 + .8;
          if (v === 'cinema') {
            const gap = G.oh * EZ.inout(pr(t, c0 - .55, c0 + .45));
            bars[0].style.height = Math.max(0, G.cy - gap).toFixed(1) + 'px';
            bars[1].style.top = (G.cy + gap).toFixed(1) + 'px'; bars[1].style.height = Math.max(0, H - G.cy - gap).toFixed(1) + 'px';
            bars.forEach(b => set(b, { o: 1 - out }));
            const mid = (tc.length - 1) / 2, q = pr(t, c0 + .05, c0 + 1.5), E = EZ.out5(q);
            tc.forEach((u, i) => { const d = Math.abs(i - mid) / Math.max(1, tc.length); tf(u, { o: clamp((q - d * .3) * 3), x: (i - mid) * G.fs * .6 * (1 - E), blur: (1 - EZ.out(q)) * 12 }); });
            title.style.textShadow = `0 0 ${(28 + (live ? 10 * hold.wave : 0)).toFixed(1)}px rgba(var(--a-rgb),.4)`;
            glint(title, tc, live ? EZ.inout(clamp(hold.sweep * 1.6)) : -1);
            if (ep) { const k = pr(t, c0 + .55, c0 + 1.15); set(ep, { o: clamp(k * 2) }); ep.querySelectorAll('i').forEach(i => { i.style.width = (90 * EZ.out5(k)).toFixed(1) + 'px'; }); }
            if (sub) { const k = pr(t, c1, c1 + .6); set(sub, { o: clamp(k * 2), y: (1 - EZ.expo(k)) * 22, blur: (1 - EZ.out(k)) * 8 }); }
          } else if (v === 'bold') {
            const kw = pr(t, c0 - .35, c0 + .1);
            tf(wipeBar, { o: kw > 0 && kw < 1 ? 1 : 0, x: lerp(-area.w, area.w, EZ.inout(kw)), sy: 1 - .7 * kw });
            const ks = pr(t, c0 - .05, c0 + .45);
            slab.style.transformOrigin = P ? '50% 0' : '0 50%';
            tf(slab, P ? { sy: Math.max(.001, EZ.back(ks)), o: clamp(ks * 6) } : { sx: Math.max(.001, EZ.back(ks)), o: clamp(ks * 6) });
            slab.style.backgroundPosition = `${((t - slot.t0) * 40).toFixed(1)}px 0, 0 0`;
            if (slabEp) { const k = pr(t, c0 + .2, c0 + .7); tf(slabEp, { o: clamp(k * 3), y: (1 - EZ.out5(k)) * 120 + (live ? hold.wave * 6 : 0), s: .8 + .2 * EZ.back(k) }); }
            const kt = pr(t, c0 + .3, c0 + .9);
            tf(title, { y: (1 - EZ.out5(kt)) * (title.offsetHeight + 20), r: (1 - EZ.out5(kt)) * 4, o: kt > 0 ? 1 : 0 });
            title.style.textShadow = live ? `0 0 ${(24 + 12 * hold.wave).toFixed(1)}px rgba(var(--a-rgb),.35)` : '';
            const ka = pr(t, c1 - .1, c1 + .4);
            accent.style.transformOrigin = sub ? '50% 0' : '0 50%';
            tf(accent, sub ? { sy: Math.max(.001, EZ.out5(ka)), o: ka > 0 ? 1 : 0 } : { sx: Math.max(.001, EZ.out5(ka)), o: ka > 0 ? 1 : 0 });
            if (sub) { const k = pr(t, c1, c1 + .5); set(sub, { o: clamp(k * 2), x: (1 - EZ.expo(k)) * -40 }); }
          } else {
            const kl = EZ.inout(pr(t, c0 - .2, c0 + .5));
            tf(line, { sx: Math.max(.001, kl) });
            const kt = pr(t, c0 + .3, c0 + 1);
            tf(title, { y: (1 - EZ.out5(kt)) * (title.offsetHeight + 24) });
            if (sub) { const k = pr(t, c1, c1 + .65); tf(sub, { y: -(1 - EZ.out5(k)) * (sub.offsetHeight + 24) }); }
            if (ep) { const k = pr(t, c0 + .6, c0 + 1); set(ep, { o: clamp(k * 2), x: (1 - EZ.expo(k)) * -20 }); }
            ink.querySelectorAll('path').forEach((pa, i) => draw(pa, EZ.out(pr(t, c0 + .2 + i * .08, c0 + .7 + i * .08))));
            /* 光点：画线时骑在线头上，停留时沿线缓慢往返 */
            const dx = t < c0 + .5 ? kl * G.lw / 2 : (G.lw / 2) * Math.cos((t - c0 - .5) * .9);
            set(dot, { x: area.w / 2 + dx - 7, y: G.ly - 7, o: clamp(kl * 3) });
            line.style.boxShadow = live ? `0 0 ${(10 + 8 * hold.wave).toFixed(1)}px rgba(var(--a-rgb),.6)` : '';
          }
        },
        bg(c, t) {
          if (v !== 'cinema') return;
          const a = 1 - leave(t, slot), y = area.y + G.ty, k = pr(t, c0, c0 + 1.3), hold = idle(t, c0 + 1.3, 4);
          flare(c, lerp(area.x - 200, area.x + area.w + 200, EZ.inout(k)), y, 520, Math.sin(Math.PI * k) * a, T().aLite);
          flare(c, area.x + area.w / 2 + Math.sin((t - c0) * .5) * area.w * .12, y, area.w * .55, (.35 + .12 * hold.wave) * pr(t, c0 + .6, c0 + 1.3) * a, T().a);
        },
        hint,
      };
    },
  });

  /* ---------- outro：片尾 ----------
     endcard 感谢语，推荐位方框描边后填入画面，头像 + 关注按钮弹出并呼吸；停留时推荐位轮流点亮、按钮周期波纹
     thanks  巨大感谢语逐字从上方弹落，两侧彩纸炮，下一步做成胶囊依次弹出；停留时彩纸持续飘落
     next    「下期预告」卡三维摆入，中间播放键外圈自动播放进度走满；其余下一步排在一旁
     items[i].src 给推荐位/预告卡画面；没有素材时显示中性占位 */
  MK.control('outro', {
    variants: ['endcard', 'thanks', 'next'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait;
      const items = p.items || [], n = items.length;
      const wrap = box(el('div', 'mk-abs mk-outro ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const hint = { cx: area.x + area.w / 2, cy: area.y + area.h * .45 };
      const head = C(box(el('div', 'thx mk-abs', wrap), 0, 0, area.w));
      const hc = split(head, p.thanks, 'char');
      const sub = p.sub ? C(box(el('div', 'sub mk-abs', wrap, rich(p.sub)), 0, 0, area.w)) : null;
      const c0 = slot.cues[0] ?? slot.t0 + .25;
      const at = items.map((_, i) => slot.cues[1 + i] ?? c0 + (v === 'thanks' ? 1.1 : .75) + i * .45);
      const last = n ? at[n - 1] : c0 + .8;
      const G = {};
      /* 头像 + 名字 + 关注按钮（endcard / next 用） */
      const who = (v !== 'thanks' && (p.avatar || p.name)) || v === 'endcard' ? el('div', 'who mk-abs', wrap) : null;
      let av = null, nm = null, btn = null, boxes = [], chips = [], card = null, ring = null;
      if (who) {
        av = mediaBox(who, 'av', p, 'avatar', ctx, MK.icon('user', 64, 1.6));
        if (p.name) nm = el('div', 'nm', who, esc(p.name));
        if (v === 'endcard') btn = el('div', 'btn', who, `${MK.icon('plus', 34, 3)}<span>${esc(p.follow || '关注')}</span>`);
      }
      if (v === 'endcard') {
        boxes = items.slice(0, 2).map((it, i) => {
          const b = el('div', 'vb mk-abs', wrap);
          const m = mediaBox(b, 'pic', it, 'src', ctx, MK.icon('play', 64, 1.8));
          const lab = el('div', 'lab', b, esc(it.text));
          const sv = svg(b, 10, 10); sv.innerHTML = '<rect/>';
          return { b, m, lab, sv, rc: sv.firstChild, i };
        });
        if (n > 2) chips = [el('div', 'chip mk-abs', wrap, `${MK.icon('link', 30, 2.2)}<span>${esc(items[2].text)}</span>`)];
      } else if (v === 'thanks') {
        if (p.avatar) av = mediaBox(wrap, 'av mk-abs', p, 'avatar', ctx);
        chips = items.map(it => el('div', 'chip mk-abs', wrap, `${MK.icon('arrow', 30, 2.4)}<span>${esc(it.text)}</span>`));
      } else {
        card = el('div', 'nx mk-abs', wrap);
        const m = mediaBox(card, 'pic', items[0], 'src', ctx);
        el('div', 'shade', card);
        el('div', 'nl', card, '<i></i>NEXT');
        const cap = el('div', 'cap', card, esc(items[0]?.text || ''));
        const pl = el('div', 'play', card, MK.icon('play', 56, 2));
        ring = svg(pl, 10, 10); ring.innerHTML = '<circle class="tr"/><circle class="pg"/>';
        card._m = m; card._cap = cap; card._pl = pl;
        chips = items.slice(1).map(it => el('div', 'chip mk-abs', wrap, `${MK.icon('play', 28, 2.2)}<span>${esc(it.text)}</span>`));
      }
      ctx.measure(() => {
        if (v === 'endcard') {
          fit(head, P ? 92 : 84, 40, area.w * .9, null);
          const hh = head.offsetHeight; head.style.top = '0';
          let y0 = hh + (sub ? 0 : 26);
          if (sub) { fit(sub, 34, 20, area.w * .86, null); sub.style.top = hh + 'px'; y0 = hh + sub.offsetHeight + 26; }
          const nb = boxes.length, chipH = chips.length ? 76 : 0;
          let rx, ry, colW;
          if (!P) {
            colW = Math.min(250, area.w * .24); rx = area.w - colW; ry = y0;
            const bwAll = area.w - colW - 40, avail = area.h - y0 - chipH - 64;
            let bw = (bwAll - (nb - 1) * 28) / nb; bw = Math.min(bw, avail * 16 / 9); const bh = bw * 9 / 16;
            const x0 = (bwAll - (bw * nb + 28 * (nb - 1))) / 2;
            boxes.forEach((o, i) => { o.w = bw; o.h = bh; box(o.b, x0 + i * (bw + 28), y0 + 10, bw); });
            G.by = y0 + 10 + bh + 64;
          } else {
            colW = area.w; rx = 0; ry = y0;
            const whoH = 150, avail = area.h - y0 - whoH - chipH - 70;
            let bw = (area.w - (nb - 1) * 24) / nb; bw = Math.min(bw, avail * 16 / 9); const bh = bw * 9 / 16;
            const x0 = (area.w - (bw * nb + 24 * (nb - 1))) / 2;
            boxes.forEach((o, i) => { o.w = bw; o.h = bh; box(o.b, x0 + i * (bw + 24), y0 + whoH + 10, bw); });
            G.by = y0 + whoH + 10 + bh + 64;
          }
          boxes.forEach(o => {
            o.m.e.style.height = o.h + 'px'; fit(o.lab, 30, 18, o.w, null);
            o.sv.setAttribute('width', o.w + 8); o.sv.setAttribute('height', o.h + 8); o.sv.setAttribute('viewBox', `0 0 ${o.w + 8} ${o.h + 8}`);
            o.sv.style.left = '-4px'; o.sv.style.top = '-4px';
            Object.assign(o.rc.style, {}); ['x', 'y'].forEach(k => o.rc.setAttribute(k, 4)); o.rc.setAttribute('width', o.w); o.rc.setAttribute('height', o.h); o.rc.setAttribute('rx', 16);
          });
          /* 头像列：横屏竖排在右侧，竖屏横排在标题下 */
          if (!P) {
            who.classList.add('col'); box(who, rx, ry, colW);
            if (nm) fit(nm, 36, 20, colW, null);
            fitw(btn.querySelector('span'), 40, 22, colW - 110, null);
          } else {
            who.classList.add('row'); box(who, 0, ry + 10, area.w, 130);
            if (nm) fit(nm, 40, 22, area.w - 130 - 300 - 60, null);
            fitw(btn.querySelector('span'), 40, 22, 200, null);
          }
          if (chips[0]) { fitw(chips[0].querySelector('span'), 30, 18, area.w * .8, null); chips[0].style.left = ((P ? area.w : area.w - colW - 40) - chips[0].offsetWidth) / 2 + 'px'; chips[0].style.top = G.by + 'px'; }
          G.btn = btn.getBoundingClientRect(); G.wr = wrap.getBoundingClientRect();
          G.dy = Math.max(0, (area.h - extent(wrap)) / 2);
        } else if (v === 'thanks') {
          const avH = av ? (P ? 150 : 120) : 0;
          if (av) { const s = avH - 24; box(av.e, (area.w - s) / 2, 0, s, s); }
          fit(head, P ? 210 : 200, 64, area.w * .94, null);
          if (sub) fit(sub, P ? 46 : 42, 22, area.w * .9, null);
          chips.forEach(ch => fitw(ch.querySelector('span'), P ? 38 : 34, 20, area.w * .78, null));
          /* 胶囊：横屏一行排开（放不下就逐行），竖屏一行一个 */
          const cw = chips.map(ch => ch.offsetWidth), chH = chips.length ? chips[0].offsetHeight : 0;
          const rows = []; let cur = [], wsum = 0;
          cw.forEach((w, i) => { if (P || (cur.length && wsum + w + 24 > area.w)) { if (cur.length) rows.push(cur); cur = []; wsum = 0; } cur.push(i); wsum += w + 24; });
          if (cur.length) rows.push(cur);
          const hh = head.offsetHeight, sh = sub ? sub.offsetHeight + 12 : 0, chipsH = rows.length * (chH + 18);
          let y = Math.max(0, (area.h - avH - hh - sh - (chips.length ? 30 + chipsH : 0)) / 2 - (P ? 20 : 0));
          if (av) { av.e.style.top = y + 'px'; y += avH; }
          head.style.top = y + 'px'; G.hy = y + hh / 2; y += hh;
          if (sub) { sub.style.top = y + 'px'; y += sh; }
          y += 30;
          rows.forEach(r => { const tw = r.reduce((s, i) => s + cw[i] + 24, -24); let x = (area.w - tw) / 2; r.forEach(i => { chips[i].style.left = x + 'px'; chips[i].style.top = y + 'px'; x += cw[i] + 24; }); y += chH + 18; });
          glintPrep(head, hc);
        } else {
          fit(head, P ? 72 : 64, 34, area.w * (P ? .9 : .9), null); head.style.textAlign = 'left'; head.style.left = '0';
          const hh = head.offsetHeight; head.style.top = '0';
          let y0 = hh + 8;
          if (sub) { sub.style.textAlign = 'left'; fit(sub, 32, 20, area.w * .9, null); sub.style.left = '0'; sub.style.top = y0 + 'px'; y0 += sub.offsetHeight; }
          y0 += 24;
          const side = !P && chips.length + (who ? 1 : 0) > 0, colW = side ? Math.min(360, area.w * .34) : 0;
          const availH = area.h - y0 - (P ? (chips.length ? 100 : 0) + (who ? 120 : 0) : 0) - 10;
          let cw = (side ? area.w - colW - 40 : area.w); cw = Math.min(cw, availH * 16 / 9); const ch = cw * 9 / 16;
          box(card, P ? (area.w - cw) / 2 : 0, y0, cw, ch); G.cw = cw; G.ch = ch; G.cx = P ? (area.w - cw) / 2 : 0; G.cy = y0;
          card._m.e.style.height = ch + 'px';
          fit(card._cap, P ? 52 : 48, 24, cw - 60, null);
          const pr2 = Math.min(150, ch * .36); Object.assign(card._pl.style, { width: pr2 + 'px', height: pr2 + 'px', left: (cw - pr2) / 2 + 'px', top: (ch - pr2) / 2 - 20 + 'px' });
          ring.setAttribute('width', pr2 + 20); ring.setAttribute('height', pr2 + 20); ring.setAttribute('viewBox', `0 0 ${pr2 + 20} ${pr2 + 20}`); ring.style.left = '-10px'; ring.style.top = '-10px';
          ring.querySelectorAll('circle').forEach(ci => { ci.setAttribute('cx', pr2 / 2 + 10); ci.setAttribute('cy', pr2 / 2 + 10); ci.setAttribute('r', pr2 / 2 + 4); });
          if (side) {
            let y = y0;
            if (who) { who.classList.add('mini'); box(who, cw + 40, y, colW); if (nm) fit(nm, 32, 18, colW - 110, null); y += 120; }
            chips.forEach(chp => { fitw(chp.querySelector('span'), 30, 18, colW - 70, null); chp.style.left = (cw + 40) + 'px'; chp.style.top = y + 'px'; y += chp.offsetHeight + 18; });
          } else {
            let y = y0 + ch + 24;
            const gap = 20, cwAll = area.w, each = chips.length ? (cwAll - gap * (chips.length - 1)) / chips.length : 0;
            chips.forEach((chp, i) => { fitw(chp.querySelector('span'), 32, 18, each - 70, null); chp.style.left = (i * (each + gap) + (each - chp.offsetWidth) / 2) + 'px'; chp.style.top = y + 'px'; });
            if (chips.length) y += chips[0].offsetHeight + 24;
            if (who) { who.classList.add('mini'); box(who, (area.w - Math.min(area.w, 520)) / 2, y, Math.min(area.w, 520)); if (nm) fit(nm, 32, 18, Math.min(area.w, 520) - 110, null); }
          }
          G.dy = Math.max(0, (area.h - extent(wrap)) / 2);
        }
      });
      /* 音效 */
      S(c0 - .1, 'swoosh', .4);
      if (v === 'endcard') {
        boxes.forEach((_, i) => S(at[i] ?? c0 + .7, 'card', .5, i ? .3 : -.3));
        if (chips[0]) S(at[2], 'pop', .35);
        S(c0 + .55, 'pop', .5); S(last + .5, 'notif', .5);
      } else if (v === 'thanks') {
        S(c0 + .3, 'tada', .6); S(c0 + .5, 'pop', .4, -.6); S(c0 + .58, 'pop', .4, .6); punch(c0 + .5, .03);
        at.forEach((c, i) => S(c, 'bubble', .35, 0, { n: i * 2 }));
      } else {
        S(at[0] ?? c0 + .5, 'whoosh', .5); S((at[0] ?? c0 + .5) + .35, 'card', .45);
        at.slice(1).forEach(c => S(c, 'pop', .35));
        S(last + .5, 'swell', .3, 0, { d: Math.max(.6, Math.min(3, slot.t1 - last - 1)) });
      }
      const pulseAt = last + .8;
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, y: (G.dy || 0) - EZ.in(out) * 16 });
          const hold = idle(t, pulseAt, 2.4), live = t > pulseAt;
          /* 感谢语 */
          hc.forEach((u, i) => {
            if (v === 'thanks') { const q = pr(t, c0 + i * .07, c0 + i * .07 + .8); tf(u, { o: clamp(q * 5), y: -(1 - EZ.bounce(q)) * 260, r: (1 - EZ.out(q)) * (i % 2 ? 14 : -14) }); }
            else { const q = pr(t, c0 + i * .04, c0 + i * .04 + .5); tf(u, { o: clamp(q * 3), y: (1 - EZ.back(q)) * 50, blur: (1 - EZ.out(q)) * 6 }); }
          });
          if (v === 'thanks') glint(head, hc, live ? EZ.inout(clamp(hold.sweep * 1.4)) : -1);
          if (sub) { const q = pr(t, c0 + .45, c0 + .95); set(sub, { o: clamp(q * 2), y: (1 - EZ.expo(q)) * 18 }); }
          if (v === 'endcard') {
            boxes.forEach((o, i) => {
              const c = at[i], kd = pr(t, c - .05, c + .45), kf = pr(t, c + .25, c + .7);
              draw(o.rc, EZ.inout(kd));
              tf(o.m.e, { o: EZ.out(kf), s: .92 + .08 * EZ.back(kf) });
              set(o.lab, { o: clamp(kf * 2), y: (1 - EZ.expo(kf)) * 14 });
              /* 停留：推荐位轮流点亮 */
              const lit = live && Math.floor((t - pulseAt) / 1.6) % boxes.length === i;
              o.b.classList.toggle('lit', lit);
              if (o.m.im) o.m.im.style.transform = `scale(${(1.04 + .04 * Math.sin((t - c) * .35 + i)).toFixed(4)})`;
            });
            const ka = pr(t, c0 + .5, c0 + 1.1);
            tf(av.e, { o: clamp(ka * 4), s: EZ.elastic(ka) });
            if (nm) set(nm, { o: pr(t, c0 + .75, c0 + 1.1) });
            const kb = pr(t, c0 + .9, c0 + 1.4), br = live ? 1 + .045 * Math.max(0, hold.wave) : 1;
            tf(btn, { o: clamp(kb * 4), s: (.5 + .5 * EZ.spring(kb)) * br });
            if (chips[0]) { const q = pr(t, at[2], at[2] + .5); tf(chips[0], { o: clamp(q * 3), y: (1 - EZ.back(q)) * 30 }); }
          } else if (v === 'thanks') {
            if (av) { const q = pr(t, c0 - .1, c0 + .5); tf(av.e, { o: clamp(q * 3), s: EZ.elastic(q) }); }
            chips.forEach((ch, i) => { const q = pr(t, at[i], at[i] + .55), wv = live ? Math.sin((t - pulseAt) * 2.4 - i * .9) * 5 : 0; tf(ch, { o: clamp(q * 4), s: .4 + .6 * EZ.spring(q), y: wv }); });
          } else {
            const c = at[0] ?? c0 + .5, kc = pr(t, c - .1, c + .7);
            card.style.transformOrigin = '0 50%';
            tf(card, { p: 1600, ry: (1 - EZ.out5(kc)) * -55, o: clamp(kc * 3), x: (1 - EZ.out5(kc)) * 160, s: .9 + .1 * EZ.out5(kc) });
            const nl = card.querySelector('.nl');
            nl.querySelector('i').style.opacity = Math.floor(t * 2) % 2 ? .35 : 1;
            const kp = pr(t, c + .45, c + .9);
            tf(card._pl, { s: EZ.elastic(kp), o: clamp(kp * 4) });
            set(card._cap, { o: pr(t, c + .4, c + .8), y: (1 - EZ.expo(pr(t, c + .4, c + .9))) * 20 });
            /* 自动播放进度：从卡片落定走到段尾 */
            draw(ring.querySelector('.pg'), pr(t, c + .9, slot.t1 - .45));
            if (card._m.im) card._m.im.style.transform = `scale(${(1.12 - .1 * pr(t, c, slot.t1)).toFixed(4)})`;
            chips.forEach((ch, i) => { const q = pr(t, at[i + 1], at[i + 1] + .5); tf(ch, { o: clamp(q * 3), x: P ? 0 : (1 - EZ.back(q)) * 50, y: P ? (1 - EZ.back(q)) * 30 : 0 }); });
            if (who) set(who, { o: pr(t, c0 + .3, c0 + .8) });
          }
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          if (v === 'endcard' && G.btn && t > pulseAt) {
            const x = area.x + (G.btn.left + G.btn.right) / 2 - G.wr.left, y = area.y + G.dy + (G.btn.top + G.btn.bottom) / 2 - G.wr.top;
            const k0 = pulseAt + Math.floor((t - pulseAt) / 1.2) * 1.2;
            MK.fx.ripple(c, t, k0, x, y, { r: 140, r0: 60, rings: 2, col: T().a, w: 3 * a });
          }
          if (v === 'next') MK.fx.glow(c, area.x + G.cx + G.cw / 2, area.y + G.dy + G.cy + G.ch / 2, G.cw * .7, T().a, .45 * a * pr(t, c0, c0 + 1));
        },
        fg(c, t) {
          const a = 1 - leave(t, slot);
          if (v === 'thanks') {
            const y = area.y + (G.hy || area.h * .4);
            MK.fx.confetti(c, t, c0 + .5, area.x + 40, area.y + area.h + 40, { n: 70, sp: 1500, spread: .6, seed: 1 });
            MK.fx.confetti(c, t, c0 + .58, area.x + area.w - 40, area.y + area.h + 40, { n: 70, sp: 1500, spread: .6, seed: 2 });
            T().paint.burst(c, t, c0 + .5, area.x + area.w / 2, y, { n: 40, sp: 900 });
            /* 停留：彩纸一波一波从上方飘落 */
            for (let k = 0; k < 6; k++) {
              const t0 = c0 + 1.6 + k * 1.3; if (t0 > slot.t1) break;
              MK.fx.confetti(c, t, t0, area.x + area.w * (.2 + .6 * rnd(k, 121)), area.y - 120, { n: 26, sp: 260, spread: 1.6, life: 2.6, seed: 10 + k });
            }
          }
          if (v === 'endcard' && t > c0 + 1.2) MK.fx.twinkle(c, t, area.x, area.y, area.w, area.h * .2, 6, T().w, .7 * a * pr(t, c0 + 1.2, c0 + 1.8));
        },
        hint,
      };
    },
  });

  /* ---------- cta：行动号召 ----------
     button 胶囊按钮弹入，光标移过来点击：按下回弹、波纹、火花；之后按钮呼吸、周期冲击环
     arrow  文字逐字弹起，大箭头描出并沿方向反复顶出，第二拍箭头猛推一下；dir 选方向
     swipe  竖向滑轨 + 触点反复上滑、箭头逐级点亮，第二拍整组被「甩」上去再回弹 */
  MK.control('cta', {
    variants: ['button', 'arrow', 'swipe'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait;
      const wrap = box(el('div', 'mk-abs mk-cta ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const hint = { cx: area.x + area.w / 2, cy: area.y + area.h * .45 };
      const c0 = slot.cues[0] ?? slot.t0 + .25, c1 = slot.cues[1] ?? c0 + (v === 'button' ? 1.3 : 1.1);
      const kick = p.kicker ? C(box(el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)), 0, 0, area.w)) : null;
      const sub = p.sub ? C(box(el('div', 'sub mk-abs', wrap, rich(p.sub)), 0, 0, area.w)) : null;
      const G = {};
      let btn = null, bt = null, cur = null, txt = null, tcs = [], arr = null, arrP = null, chev = [], track = null, touch = null, ups = [];
      const dir = p.dir || 'down';
      if (v === 'button') {
        btn = el('div', 'btn mk-abs', wrap, `${p.icon ? MK.icon(p.icon, 64, 2.6) : ''}<span></span>`);
        bt = btn.querySelector('span'); bt.innerHTML = rich(p.text);
        el('div', 'shine', btn);
        cur = cursorEl(wrap);
      } else {
        txt = C(box(el('div', 'txt mk-abs', wrap), 0, 0, area.w));
        tcs = split(txt, p.text, 'char');
        if (v === 'arrow') {
          arr = el('div', 'arr mk-abs', wrap);
          const sv = svg(arr, 220, 220); sv.setAttribute('viewBox', '0 0 100 100');
          sv.innerHTML = '<path class="sh" d="M12 50 H74"/><path class="hd" d="M52 24 L80 50 L52 76"/>';
          arrP = [...sv.querySelectorAll('path')];
          chev = [0, 1, 2].map(() => el('div', 'chev mk-abs', wrap, MK.icon('arrow', 60, 3)));
        } else {
          track = el('div', 'track mk-abs', wrap);
          ups = [0, 1, 2].map(() => el('div', 'up mk-abs', track, '<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15l7-7 7 7"/></svg>'));
          touch = el('div', 'touch mk-abs', track);
          if (p.icon) el('div', 'ic', wrap, MK.icon(p.icon, 44, 2.4));
        }
      }
      const ic = wrap.querySelector(':scope > .ic');
      ctx.measure(() => {
        const kh = kick ? 60 : 0;
        if (v === 'button') {
          const iw = p.icon ? 84 : 0;
          fitw(bt, P ? 92 : 84, 34, Math.min(area.w * .82, 900) - 120 - iw, null);
          if (sub) fit(sub, P ? 42 : 38, 22, area.w * .9, null);
          const bw = btn.offsetWidth, bh = btn.offsetHeight, sh = sub ? sub.offsetHeight + 40 : 0;
          const y = Math.max(kh, (area.h - bh - sh - kh) / 2 + kh - (P ? 40 : 0));
          G.bx = (area.w - bw) / 2; G.by = y; G.bw = bw; G.bh = bh;
          box(btn, G.bx, y, null); btn.style.width = '';
          if (kick) kick.style.top = (y - 70) + 'px';
          if (sub) sub.style.top = (y + bh + 40) + 'px';
          hint.cy = area.y + y + bh / 2;
        } else if (v === 'arrow') {
          const vert = dir === 'down' || dir === 'up', A = Math.min(P ? 250 : 220, area.h * .36);
          const tw = vert ? area.w * .92 : area.w - A - 80;
          txt.style.whiteSpace = 'nowrap';
          fit(txt, P ? 132 : 120, 44, tw, null);
          if (sub) fit(sub, P ? 42 : 38, 22, tw, null);
          const th = txt.offsetHeight, sh = sub ? sub.offsetHeight + 18 : 0, gh = kh + th + sh;
          let gx, gy, ax, ay;
          if (vert) {
            const tot = gh + 40 + A; const y0 = Math.max(0, (area.h - tot) / 2);
            gy = dir === 'down' ? y0 : y0 + A + 40; ay = dir === 'down' ? y0 + gh + 40 : y0; gx = (area.w - tw) / 2; ax = (area.w - A) / 2;
          } else {
            gy = (area.h - gh) / 2; ay = (area.h - A) / 2;
            gx = dir === 'right' ? 0 : A + 80; ax = dir === 'right' ? area.w - A : 0;
          }
          [kick, txt, sub].forEach(e => { if (!e) return; e.style.left = gx + 'px'; e.style.width = tw + 'px'; if (!vert) e.style.textAlign = dir === 'right' ? 'left' : 'right'; });
          if (kick) kick.style.top = gy + 'px'; txt.style.top = (gy + kh) + 'px'; if (sub) sub.style.top = (gy + kh + th + 18) + 'px';
          box(arr, ax, ay, A, A); arr.firstChild.setAttribute('width', A); arr.firstChild.setAttribute('height', A);
          arr.style.rotate = { right: '0deg', down: '90deg', left: '180deg', up: '-90deg' }[dir];
          G.A = A; G.ax = ax; G.ay = ay; G.ux = { right: 1, left: -1, down: 0, up: 0 }[dir]; G.uy = { down: 1, up: -1, right: 0, left: 0 }[dir];
          hint.cx = area.x + ax + A / 2; hint.cy = area.y + ay + A / 2;
        } else {
          const tH = Math.min(P ? 380 : 360, area.h * (P ? .5 : .66)), tW = Math.round(tH * .42);
          if (P) {
            fit(txt, 132, 44, area.w * .92, null); if (sub) fit(sub, 42, 22, area.w * .9, null);
            const th = txt.offsetHeight, sh = sub ? sub.offsetHeight + 16 : 0, tot = tH + 40 + kh + th + sh, y0 = Math.max(0, (area.h - tot) / 2);
            box(track, (area.w - tW) / 2, y0, tW, tH);
            if (kick) kick.style.top = (y0 + tH + 40) + 'px'; txt.style.top = (y0 + tH + 40 + kh) + 'px'; if (sub) sub.style.top = (y0 + tH + 40 + kh + th + 16) + 'px';
          } else {
            const tw = area.w - tW - 70;
            [kick, txt, sub].forEach(e => { if (e) e.style.textAlign = 'left'; });
            fit(txt, 128, 44, tw, null); if (sub) fit(sub, 40, 22, tw, null);
            const th = txt.offsetHeight, sh = sub ? sub.offsetHeight + 16 : 0, gh = kh + th + sh;
            const used = tW + 70 + Math.max(...[txt, sub, kick].filter(Boolean).map(e => Math.min(tw, e.scrollWidth))), x0 = Math.max(0, (area.w - used) / 2);
            box(track, x0, (area.h - tH) / 2, tW, tH);
            const gx = x0 + tW + 70, gy = (area.h - gh) / 2;
            [kick, txt, sub].forEach(e => { if (e) { e.style.left = gx + 'px'; e.style.width = tw + 'px'; } });
            if (kick) kick.style.top = gy + 'px'; txt.style.top = (gy + kh) + 'px'; if (sub) sub.style.top = (gy + kh + th + 16) + 'px';
          }
          G.tW = tW; G.tH = tH;
          ups.forEach((u, i) => { u.style.left = (tW - 64) / 2 + 'px'; u.style.top = (tH * .16 + i * 52) + 'px'; });
          const tr = track.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
          G.tx = tr.left - wr.left; G.ty = tr.top - wr.top;
          if (ic) { ic.style.left = (G.tx + tW / 2 - 22) + 'px'; ic.style.top = (G.ty + tH + 14) + 'px'; }
          hint.cx = area.x + G.tx + tW / 2; hint.cy = area.y + G.ty + tH / 2;
        }
      });
      /* 光标路径：从右下角滑进来，c1 点下，之后让开一点 */
      const keys = () => [[c0 + .3, G.bx + G.bw + 260, G.by + G.bh + 300], [c1 - .08, G.bx + G.bw * .62, G.by + G.bh * .62], [c1 + .55, G.bx + G.bw * .62, G.by + G.bh * .62], [c1 + 1.2, G.bx + G.bw * .9, G.by + G.bh + 70]];
      if (v === 'button') {
        S(c0, 'pop', .6); S(c0 + .05, 'whoosh', .3); S(c1 - .55, 'swipe', .22, .4); S(c1, 'snap', .6); S(c1 + .04, 'ding', .45, 0, { m: 93 });
        flash(c1, .15); punch(c1, .025);
      } else if (v === 'arrow') {
        S(c0, 'swoosh', .4); tcs.forEach((_, i) => { if (i % 2 === 0 && i < 10) S(c0 + i * .05, 'blip', .2, 0, { n: i }); });
        S(c0 + .35, 'marker', .5); S(c1 - .05, 'whip', .55); S(c1 + .1, 'thud', .6); punch(c1 + .1, .03);
      } else {
        S(c0, 'pop', .45); S(c0 + .2, 'swoosh', .35);
        for (let x = c0 + .6; x < slot.t1 - .6; x += 1.5) if (Math.abs(x - c1) > .5) S(x + .4, 'swipe', .16);
        S(c1, 'whip', .55); S(c1 + .15, 'bubble', .4, 0, { n: 6 });
      }
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, y: -EZ.in(out) * 14 });
          const hold = idle(t, c1 + .8, 1.6), live = t > c1 + .8;
          if (kick) set(kick, { o: pr(t, c0 - .1, c0 + .3), y: (1 - EZ.expo(pr(t, c0 - .1, c0 + .5))) * 14 });
          if (sub) { const q = pr(t, c0 + .35, c0 + .85); set(sub, { o: clamp(q * 2), y: (1 - EZ.expo(q)) * 18 }); }
          if (v === 'button') {
            const k = pr(t, c0, c0 + .7), press = bell(t, c1 - .06, c1 + .14), rebound = pr(t, c1 + .1, c1 + .7);
            const br = live ? 1 + .035 * hold.wave : 1;
            btn.style.transformOrigin = '50% 50%';
            tf(btn, { o: clamp(k * 5), s: EZ.spring(k) * (1 - .1 * press) * (1 + (rebound > 0 && rebound < 1 ? .06 * Math.sin(Math.PI * rebound) : 0)) * br, y: (1 - EZ.out5(k)) * 60 });
            btn.style.setProperty('--sh', `${lerp(130, -30, live ? EZ.inout(clamp(idle(t, c1 + .8, 2.8).sweep * 2)) : pr(t, c1, c1 + .6)).toFixed(1)}%`);
            btn.classList.toggle('hit', t >= c1 && t < c1 + .35);
            const [x, y] = keyPath(t, keys());
            putCursor(cur, x, y, pr(t, c0 + .3, c0 + .6) * (1 - pr(t, c1 + 1.1, c1 + 1.5)), bell(t, c1 - .08, c1 + .16));
          } else if (v === 'arrow') {
            tcs.forEach((u, i) => { const q = pr(t, c0 + i * .05, c0 + i * .05 + .5); tf(u, { o: clamp(q * 3), y: (1 - EZ.back(q)) * 70, s: .6 + .4 * EZ.back(q) }); u.style.color = t >= c1 + .1 && t < c1 + .6 ? 'var(--a)' : ''; });
            draw(arrP[0], EZ.out(pr(t, c0 + .3, c0 + .7))); draw(arrP[1], EZ.out(pr(t, c0 + .6, c0 + .95)));
            const bob = t > c0 + 1 ? Math.abs(Math.sin((t - c0 - 1) * 4.2)) * 22 : 0, thrust = bell(t, c1 - .05, c1 + .45) * 70;
            const d = bob + thrust;
            set(arr, { x: G.ux * d, y: G.uy * d, s: 1 + bell(t, c1 - .05, c1 + .3) * .12 });
            arr.style.filter = `drop-shadow(0 0 ${(18 + (live ? 10 * hold.wave : 0)).toFixed(1)}px rgba(var(--a-rgb),.6))`;
            chev.forEach((e, i) => {
              const base = G.A * .5 + 70 + i * 64, ph = ((t - c0) * 2.2 - i * .33) % 1, a = t > c0 + .9 ? Math.max(0, Math.sin(Math.PI * clamp(ph))) : 0;
              const cx = G.ax + G.A / 2 + G.ux * base - 30, cy = G.ay + G.A / 2 + G.uy * base - 30;
              set(e, { x: cx, y: cy, o: a * .9 * (G.ux || G.uy ? 1 : 0), r: { right: 0, down: 90, left: 180, up: -90 }[dir] });
            });
          } else {
            const k = pr(t, c0, c0 + .6);
            track.style.transformOrigin = '50% 100%';
            tf(track, { o: clamp(k * 4), sy: Math.max(.001, EZ.spring(k)), y: -bell(t, c1, c1 + .5) * 40 });
            const throwK = bell(t, c1 - .02, c1 + .5);
            tcs.forEach((u, i) => { const q = pr(t, c0 + .2 + i * .04, c0 + .7 + i * .04); tf(u, { o: clamp(q * 3), y: (1 - EZ.back(q)) * 60 - throwK * (60 + i * 6) }); });
            /* 触点：每 1.5 秒从下往上滑一次；第二拍是一次快速大滑 */
            const big = pr(t, c1 - .02, c1 + .35), ph = ((t - c0 - .6) % 1.5) / 1.5, cyc = t > c0 + .6 && (t < c1 - .3 || t > c1 + .6);
            const u = big > 0 && big < 1 ? EZ.out5(big) : EZ.inout(clamp(ph / .65));
            const ty = lerp(G.tH - 86, 16, u), to = big > 0 && big < 1 ? 1 : cyc ? clamp(ph * 8) * (1 - pr(ph, .65, .85)) : 0;
            set(touch, { x: G.tW / 2 - 35, y: ty, o: to });
            ups.forEach((e, i) => { const lit = (to > .1 && ty < G.tH * .16 + i * 52 + 50) || (big > 0 && big < 1); e.style.color = lit ? 'var(--a)' : ''; e.style.opacity = lit ? 1 : .3; });
            if (ic) set(ic, { o: pr(t, c0 + .4, c0 + .8) });
          }
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          if (v === 'button' && G.bw) {
            const x = area.x + G.bx + G.bw / 2, y = area.y + G.by + G.bh / 2;
            MK.fx.glow(c, x, y, G.bw * .8, T().a, (.4 + (t > c1 ? .25 : 0)) * a * pr(t, c0, c0 + .6));
            if (t > c1 + .8) { const k0 = c1 + .8 + Math.floor((t - c1 - .8) / 1.6) * 1.6; MK.fx.ripple(c, t, k0, x, y, { r: G.bw * .5, r0: G.bh * .6, rings: 2, col: T().a, w: 3 * a }); }
          }
          if (v === 'swipe' && G.tW) MK.fx.glow(c, area.x + G.tx + G.tW / 2, area.y + G.ty + G.tH / 2, G.tH * .7, T().a, .35 * a);
        },
        fg(c, t) {
          if (v === 'button' && G.bw) {
            const x = area.x + G.bx + G.bw * .62, y = area.y + G.by + G.bh * .62;
            MK.fx.ripple(c, t, c1, x, y, { r: G.bw * .7, rings: 3, col: T().aLite, w: 4 });
            T().paint.burst(c, t, c1, x, y, { n: 30, sp: 700, life: .7 });
          }
          if (v === 'swipe' && G.tW) T().paint.burst(c, t, c1 + .3, area.x + G.tx + G.tW / 2, area.y + G.ty + 30, { n: 26, sp: 600, life: .6 });
        },
        hint,
      };
    },
  });

  /* ---------- subscribe：关注 / 三连 ----------
     triple 2–3 个圆形按钮依次落下，光标逐个点击：填色、图标弹跳摇摆、+1 飘起、计数滚动；全部点亮后一起跳一下 + 彩纸
     follow 头像名片 + 关注按钮，点击后按钮变形为「已关注」（宽度过渡）、粉丝数 +1；头像外圈渐变环一直旋转
     bell   订阅按钮点击后变「已订阅」，再点铃铛：铃铛阻尼摇摆、声波弧扩散、角标弹出；停留时隔一段再响一次
     items 缺省时：triple = 点赞 / 投币 / 收藏，follow = 关注，bell = 订阅 + 铃铛 */
  const SUB_DEF = {
    triple: [{ icon: 'like', label: '点赞' }, { icon: 'money', label: '投币' }, { icon: 'star', label: '收藏' }],
    follow: [{ icon: 'plus', label: '关注' }],
    bell: [{ icon: 'play', label: '订阅' }, { icon: 'bell', label: '通知' }],
  };
  MK.control('subscribe', {
    variants: ['triple', 'follow', 'bell'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait;
      const items = (p.items && p.items.length ? p.items : SUB_DEF[v]).slice(0, v === 'follow' ? 1 : v === 'bell' ? 2 : 3);
      const n = items.length;
      const wrap = box(el('div', 'mk-abs mk-subs ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const hint = { cx: area.x + area.w / 2, cy: area.y + area.h * .45 };
      const c0 = slot.cues[0] ?? slot.t0 + .25, c1 = slot.cues[1] ?? c0 + (v === 'triple' ? 1.1 : 1);
      const clickAt = v === 'triple' ? items.map((_, i) => c1 + i * .62) : v === 'bell' ? [c1, c1 + .8] : [c1];
      const done = clickAt[clickAt.length - 1];
      const kick = p.kicker ? C(box(el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)), 0, 0, area.w)) : null;
      const cur = cursorEl(wrap);
      const G = {};
      let head = null, av = null, nm = null, btns = [], card = null, fbtn = null, cnt = null, ringEl = null, badge = null, waves = null;
      const count = it => (it.count != null ? [MK.fmt(it.count), MK.fmt(it.count + 1)] : null);
      if (v === 'follow') {
        card = el('div', 'mk-glass card mk-abs', wrap);
        ringEl = el('div', 'ring', card);
        av = mediaBox(card, 'av', p, 'avatar', ctx, MK.icon('user', 72, 1.6));
        const info = el('div', 'info', card);
        nm = el('div', 'nm', info, esc(p.name || ''));
        const cc = count(items[0]);
        if (cc) { const line = el('div', 'cnt', info, MK.icon('users', 34, 2)); cnt = rollEl(line, cc[0], cc[1]); }
        fbtn = el('div', 'fb', card, `<div class="a">${MK.icon(items[0].icon || 'plus', 40, 3)}<span>${esc(items[0].label)}</span></div><div class="b">${MK.icon('check', 40, 3)}<span>${esc(p.done || '已关注')}</span></div>`);
      } else {
        if (p.name || p.avatar) {
          head = el('div', 'head mk-abs', wrap);
          av = mediaBox(head, 'av', p, 'avatar', ctx, MK.icon('user', 40, 1.8));
          if (p.name) nm = el('div', 'nm', head, esc(p.name));
        }
        btns = items.map((it, i) => {
          const b = el('div', 'b mk-abs' + (v === 'bell' && i === 0 ? ' pill' : ''), wrap);
          const ic = el('div', 'ic', b, MK.icon(it.icon, v === 'bell' && i === 0 ? 46 : 80, 2.2));
          let lab = null, cn = null, alt = null;
          if (v === 'triple') { lab = el('div', 'lab', b, esc(it.label)); const cc = count(it); if (cc) cn = rollEl(el('div', 'cn', b), cc[0], cc[1]); }
          else if (i === 0) { lab = el('span', 'lab', ic.parentNode === b ? b : b, esc(it.label)); alt = el('span', 'lab alt', b, esc(p.done || '已订阅')); }
          const plus = v === 'triple' ? el('div', 'plus mk-abs', wrap, '+1') : null;
          return { b, ic, lab, cn, alt, plus };
        });
        if (v === 'bell') {
          badge = el('div', 'badge mk-abs', btns[1].b, '1');
          waves = svg(btns[1].b, 10, 10); waves.innerHTML = '<path d=""/><path d=""/><path d=""/><path d=""/>';
        }
      }
      ctx.measure(() => {
        const kh = kick ? 64 : 0;
        if (v === 'follow') {
          const cw = Math.min(area.w, P ? 920 : 860), ch = P ? 260 : 220, avS = ch - 70;
          box(card, (area.w - cw) / 2, 0, cw, ch);
          box(av.e, 35, 35, avS, avS); box(ringEl, 27, 27, avS + 16, avS + 16);
          const info = card.querySelector('.info'); const bw0 = P ? 300 : 280;
          box(info, 35 + avS + 30, 0, cw - (35 + avS + 30) - bw0 - 40, ch);
          fit(nm, P ? 60 : 54, 24, cw - (35 + avS + 30) - bw0 - 40, null);
          const [a, b] = fbtn.children; fitw(a.querySelector('span'), 40, 22, bw0 - 110, null); fitw(b.querySelector('span'), 40, 22, bw0 - 110, null);
          b.querySelector('span').style.fontSize = a.querySelector('span').style.fontSize = Math.min(parseFloat(a.querySelector('span').style.fontSize), parseFloat(b.querySelector('span').style.fontSize)) + 'px';
          fbtn.style.position = 'absolute'; a.style.position = 'absolute'; b.style.position = 'absolute';
          G.wa = a.offsetWidth; G.wb = b.offsetWidth; G.fh = a.offsetHeight;
          Object.assign(fbtn.style, { right: '36px', top: (ch - G.fh) / 2 + 'px', height: G.fh + 'px' });
          const y = (area.h - ch - kh) / 2 + kh - (P ? 40 : 0);
          card.style.top = y + 'px'; if (kick) kick.style.top = (y - 66) + 'px';
          G.cy = y; G.ch = ch; G.cw = cw; G.cx = (area.w - cw) / 2;
          G.bx = G.cx + cw - 36; G.by = y + ch / 2;
        } else {
          const D = v === 'triple' ? Math.min(P ? 200 : 180, (area.w - (n - 1) * 70) / n) : Math.min(P ? 170 : 150, area.h * .26);
          btns.forEach(o => { o.ic.style.width = o.ic.style.height = D + 'px'; });
          if (v === 'triple') btns.forEach(o => { fit(o.lab, P ? 40 : 36, 20, D + 50, null); o.lab.style.width = ''; if (o.cn) o.cn.parentNode.style.fontSize = (P ? 32 : 28) + 'px'; });
          if (v === 'bell') {
            const pb = btns[0];
            pb.ic.style.width = pb.ic.style.height = ''; pb.b.style.height = D + 'px';
            const fs = Math.min(fit(pb.lab, P ? 54 : 50, 24, area.w * .5, null), fit(pb.alt, P ? 54 : 50, 24, area.w * .5, null));
            pb.lab.style.fontSize = pb.alt.style.fontSize = fs + 'px'; pb.lab.style.width = pb.alt.style.width = '';
            G.pw = pb.b.offsetWidth;
          }
          const ws = btns.map(o => o.b.offsetWidth), gap = v === 'triple' ? Math.min(90, (area.w - ws.reduce((a, b) => a + b, 0)) / Math.max(1, n - 1)) : 50;
          const rowW = ws.reduce((a, b) => a + b, 0) + gap * (n - 1), rowH = Math.max(...btns.map(o => o.b.offsetHeight));
          const hh = head ? 100 : 0;
          if (head && nm) fit(nm, 38, 20, area.w * .7 - 90, null);
          const y = Math.max(kh, (area.h - rowH - hh - kh) / 2 + kh + hh - (P ? 30 : 0));
          let x = (area.w - rowW) / 2;
          btns.forEach((o, i) => { o.x = x; o.y = y; box(o.b, x, y, null); o.b.style.width = ''; o.w = ws[i]; o.h = o.b.offsetHeight; x += ws[i] + gap; });
          if (head) { head.style.top = (y - hh) + 'px'; head.style.left = (area.w - head.offsetWidth) / 2 + 'px'; }
          if (kick) kick.style.top = (y - hh - kh) + 'px';
          btns.forEach(o => { if (o.plus) { o.plus.style.left = (o.x + o.w / 2 - 40) + 'px'; o.plus.style.top = (o.y + D * .15) + 'px'; } });
          G.D = D; G.rowY = y;
          if (v === 'bell') {
            const bb = btns[1], s = D + 120;
            waves.setAttribute('width', s); waves.setAttribute('height', s); waves.setAttribute('viewBox', `0 0 ${s} ${s}`);
            waves.style.left = '-60px'; waves.style.top = '-60px';
            const cx = s / 2, cy = s / 2, arc = (r, a0, a1) => `M${cx + Math.cos(a0) * r} ${cy + Math.sin(a0) * r} A${r} ${r} 0 0 1 ${cx + Math.cos(a1) * r} ${cy + Math.sin(a1) * r}`;
            const ps = waves.querySelectorAll('path');
            [[D * .62, -2.6, -2.0], [D * .78, -2.7, -1.9], [D * .62, -1.14, -.54], [D * .78, -1.24, -.44]].forEach(([r, a, b], i) => ps[i].setAttribute('d', arc(r, a, b)));
            bb.D = D;
            badge.style.left = (D * .66) + 'px'; badge.style.top = (D * .02) + 'px';
          }
        }
        hint.cy = area.y + (v === 'follow' ? G.by : G.rowY + G.D / 2);
      });
      /* 光标：依次停到每个要点的按钮上 */
      const target = i => (v === 'follow' ? [G.bx - G.wa * .4, G.by + 8] : i === 0 && v === 'bell' ? [btns[0].x + G.pw * .6, G.rowY + G.D * .6] : [btns[i].x + G.D * .6, G.rowY + G.D * .62]);
      const keys = () => {
        const k = [[c1 - .7, area.w * .92, area.h + 80]];
        clickAt.forEach((c, i) => { const [x, y] = target(i); k.push([c - .1, x, y], [c + .2, x, y]); });
        const [lx, ly] = target(clickAt.length - 1); k.push([done + .9, lx + 70, ly + 110]);
        return k;
      };
      S(c0, 'swoosh', .4);
      if (v === 'triple') {
        btns.forEach((_, i) => S(c0 + .1 + i * .12, 'pop', .4, (i - 1) * .4));
        clickAt.forEach((c, i) => { S(c, 'snap', .4); S(c + .02, 'coin', .45, (i - 1) * .4); });
        S(done + .55, 'tada', .55); flash(done + .55, .18); punch(done + .55, .03);
      } else if (v === 'follow') {
        S(c0 + .1, 'card', .45); S(c1, 'snap', .5); S(c1 + .1, 'ding', .45, 0, { m: 95 }); S(c1 + .25, 'pop', .35);
      } else {
        S(c0 + .1, 'pop', .4, -.3); S(c0 + .22, 'pop', .4, .3);
        S(clickAt[0], 'snap', .5); S(clickAt[0] + .05, 'ding', .35, 0, { m: 91 });
        S(clickAt[1], 'snap', .45); S(clickAt[1] + .05, 'notif', .6);
      }
      const rings = v === 'bell' ? (() => { const r = [clickAt[1]]; for (let x = clickAt[1] + 2.8; x < slot.t1 - 1; x += 2.8) r.push(x); return r; })() : [];
      rings.slice(1).forEach(r => S(r, 'ding', .14, .3, { m: 96 }));
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, y: -EZ.in(out) * 14 });
          if (kick) set(kick, { o: pr(t, c0 - .1, c0 + .3) });
          const [x, y] = keyPath(t, keys()), press = Math.max(...clickAt.map(c => bell(t, c - .06, c + .14)));
          putCursor(cur, x, y, pr(t, c1 - .7, c1 - .35) * (1 - pr(t, done + .7, done + 1.1)), press);
          const live = t > done + 1;
          if (v === 'follow') {
            const k = pr(t, c0, c0 + .6);
            tf(card, { o: clamp(k * 3), y: (1 - EZ.out5(k)) * 60, rx: (1 - EZ.out5(k)) * 30, p: 1400 });
            tf(av.e, { s: EZ.elastic(pr(t, c0 + .15, c0 + .9)) });
            ringEl.style.setProperty('--ang', ((t - c0) * 120).toFixed(1) + 'deg');
            ringEl.style.opacity = (pr(t, c0 + .3, c0 + .8) * (t > c1 ? 1 : .55)).toFixed(3);
            const km = pr(t, c1 + .05, c1 + .4), sw = lerp(G.wa, G.wb, EZ.out5(km));
            fbtn.style.width = sw.toFixed(1) + 'px';
            fbtn.classList.toggle('on', t >= c1 + .05);
            const [a, b] = fbtn.children;
            set(a, { o: 1 - clamp(km * 2.5), y: -km * 20 }); set(b, { o: clamp(km * 2 - .4), y: (1 - EZ.back(km)) * 20 });
            tf(fbtn, { s: (1 - .12 * bell(t, c1 - .06, c1 + .12)) * (1 + .08 * bell(t, c1 + .1, c1 + .5)), o: clamp(pr(t, c0 + .3, c0 + .7) * 3) });
            roll(cnt, pr(t, c1 + .2, c1 + .7));
            if (nm) set(nm, { o: pr(t, c0 + .2, c0 + .6), x: (1 - EZ.expo(pr(t, c0 + .2, c0 + .8))) * 30 });
          } else {
            if (head) { const q = pr(t, c0 - .05, c0 + .5); tf(head, { o: clamp(q * 3), y: (1 - EZ.back(q)) * -30 }); }
            btns.forEach((o, i) => {
              const ka = pr(t, c0 + .1 + i * .12, c0 + .7 + i * .12), c = clickAt[i] ?? Infinity, lit = pr(t, c, c + .25);
              const hop = v === 'triple' && t > done + .45 ? bell(t, done + .5, done + 1) * -36 : 0;
              const breathe = live ? 1 + .04 * Math.sin((t - done) * 3 - i * .9) : 1;
              tf(o.b, { o: clamp(ka * 4), y: -(1 - EZ.bounce(ka)) * 120 + hop, s: breathe * (1 - .1 * bell(t, c - .06, c + .12)) });
              o.b.style.setProperty('--lit', EZ.out(lit).toFixed(3));
              o.b.classList.toggle('on', lit > .5);
              const svgI = o.ic.querySelector('svg');
              if (v === 'bell' && i === 1) {
                /* 铃铛：阻尼摇摆（点击那次大，之后隔一段小幅再响） */
                let rot = 0, wave = 0;
                rings.forEach((r, j) => { const u = t - r; if (u >= 0 && u < 1.6) { const amp = j ? 14 : 28; rot += amp * Math.exp(-3.2 * u) * Math.sin(u * 19); wave = Math.max(wave, 1 - u / 1.2); } });
                svgI.style.transformOrigin = '50% 12%'; svgI.style.transform = `rotate(${rot.toFixed(2)}deg)`;
                waves.querySelectorAll('path').forEach((pa, j) => { pa.style.opacity = (clamp(wave) * (j % 2 ? .6 : 1)).toFixed(3); });
                const kb = pr(t, c + .25, c + .7); badge.style.transform = `scale(${EZ.elastic(kb).toFixed(3)})`; badge.style.opacity = kb > 0 ? 1 : 0;
              } else {
                const kp = pr(t, c, c + .6);
                if (svgI) { svgI.style.transform = kp > 0 && kp < 1 ? `scale(${(1 + .5 * Math.sin(Math.PI * kp)).toFixed(3)}) rotate(${(Math.sin(kp * 14) * 18 * (1 - kp)).toFixed(2)}deg)` : ''; }
              }
              if (o.alt) { const km = pr(t, c + .05, c + .35); set(o.lab, { o: 1 - clamp(km * 2.5), y: -km * 16 }); set(o.alt, { o: clamp(km * 2 - .4), y: (1 - EZ.back(km)) * 16 }); o.b.style.width = lerp(G.pw, o.alt.offsetWidth + 110 > G.pw ? G.pw : G.pw, km) + 'px'; }
              roll(o.cn, pr(t, c + .1, c + .55));
              if (o.plus) { const q = pr(t, c + .05, c + .85); set(o.plus, { o: q > 0 && q < 1 ? clamp((1 - q) * 3) : 0, y: -EZ.out(q) * 90, s: .6 + .6 * EZ.back(clamp(q * 2)) }); }
            });
          }
        },
        fg(c, t) {
          const a = 1 - leave(t, slot);
          clickAt.forEach((ck, i) => {
            const [x, y] = v === 'follow' ? [G.bx - G.wa / 2, G.by] : v === 'bell' && i === 0 ? [btns[0].x + G.pw / 2, G.rowY + G.D / 2] : [btns[i].x + G.D / 2, G.rowY + G.D / 2];
            MK.fx.ripple(c, t, ck, area.x + x, area.y + y, { r: 160, r0: 40, rings: 2, col: T().aLite, w: 3 });
            T().paint.burst(c, t, ck + .05, area.x + x, area.y + y, { n: 24, sp: 600, life: .7, seed: i });
          });
          if (v === 'triple') {
            MK.fx.confetti(c, t, done + .55, area.x + area.w / 2, area.y + G.rowY + G.D * .3, { n: 60, sp: 1100, spread: 1.1 });
            if (t > done + 1) btns.forEach((o, i) => MK.fx.twinkle(c, t + i * 3, area.x + o.x - 20, area.y + o.y - 20, G.D + 40, G.D + 40, 3, T().w, .8 * a));
          }
          if (v === 'follow' && t > c1 + .5) MK.fx.twinkle(c, t, area.x + G.cx, area.y + G.cy - 20, G.cw, G.ch + 40, 6, T().w, .7 * a * pr(t, c1 + .5, c1 + 1));
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          if (v === 'follow') MK.fx.glow(c, area.x + G.cx + G.cw / 2, area.y + G.by, G.cw * .6, T().a, .4 * a * pr(t, c0, c0 + .6));
          else if (G.D) btns.forEach((o, i) => { const lit = pr(t, clickAt[i] ?? Infinity, (clickAt[i] ?? Infinity) + .4); MK.fx.glow(c, area.x + o.x + o.w / 2, area.y + G.rowY + G.D / 2, G.D * 1.2, T().a, .55 * lit * a); });
        },
        hint,
      };
    },
  });

  /* ---------- countdown：倒计时 ----------
     ring  圆环每秒倒走一圈，数字逐个砸入，最后三下变暖色 + 心跳；归零时圆环爆开、结束语弹出
     flip  翻页牌：上半页翻落露出下一个数字；归零时牌子放大散开，结束语盖下
     slam  巨大数字逐个砸进来，上一个数字向镜头冲散，冲击环 + 震动；归零爆闪 + 彩纸
     每秒默认 1 秒；段落放不下 from 秒时自动压缩节拍（最短 0.35 秒） */
  MK.control('countdown', {
    variants: ['ring', 'flip', 'slam'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, N = p.from;
      const wrap = box(el('div', 'mk-abs mk-cd ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const c0 = slot.cues[0] ?? slot.t0 + .35;
      const step = clamp((slot.t1 - c0 - 1.5) / N, .35, 1);
      const tk = Array.from({ length: N + 1 }, (_, i) => c0 + i * step), tEnd = tk[N];
      const lab = p.label ? C(box(el('div', 'lab mk-abs', wrap, rich(p.label)), 0, 0, area.w)) : null;
      const end = C(box(el('div', 'end mk-abs', wrap, rich(p.end || 'GO')), 0, 0, area.w));
      const hint = { cx: area.x + area.w / 2, cy: area.y + area.h * .5 };
      const G = {};
      const val = i => N - i;                                  // 第 i 拍显示的数字
      const idxAt = t => Math.max(0, Math.min(N - 1, Math.floor((t - c0) / step + 1e-6)));
      let nums = [], ringSv = null, card = null, halves = null, dots = [];
      if (v === 'ring') {
        ringSv = svg(wrap, 10, 10); ringSv.innerHTML = '<circle class="tr"/><circle class="pg"/>';
        nums = Array.from({ length: N }, (_, i) => C(el('div', 'n mk-abs', wrap, String(val(i)))));
      } else if (v === 'flip') {
        card = el('div', 'card mk-abs', wrap);
        const half = cls => { const h = el('div', 'h ' + cls, card); el('div', 'd', h); return h; };
        halves = { top: half('top'), bot: half('bot'), ft: half('top flap'), fb: half('bot flap') };
        el('div', 'axis', card);
        const dw = el('div', 'dots mk-abs', wrap);
        dots = Array.from({ length: N }, () => el('i', '', dw));
      } else {
        nums = Array.from({ length: N }, (_, i) => C(el('div', 'n mk-abs' + (i % 2 ? ' alt' : ''), wrap, String(val(i)))));
      }
      ctx.measure(() => {
        const lh = lab ? 80 : 0;
        if (lab) fit(lab, P ? 54 : 48, 24, area.w * .9, null);
        const cyy = lh + (area.h - lh) / 2 - (P ? 20 : 0);
        G.cy = cyy; hint.cy = area.y + cyy;
        if (v === 'ring') {
          const R = Math.min(area.w * .4, (area.h - lh) * .42);
          ringSv.setAttribute('width', R * 2 + 40); ringSv.setAttribute('height', R * 2 + 40); ringSv.setAttribute('viewBox', `0 0 ${R * 2 + 40} ${R * 2 + 40}`);
          box(ringSv, area.w / 2 - R - 20, cyy - R - 20); ringSv.style.left = (area.w / 2 - R - 20) + 'px'; ringSv.style.top = (cyy - R - 20) + 'px';
          ringSv.querySelectorAll('circle').forEach(ci => { ci.setAttribute('cx', R + 20); ci.setAttribute('cy', R + 20); ci.setAttribute('r', R); });
          const ref = nums[0]; ref.textContent = N >= 10 ? '10' : '8';
          fit(ref, Math.round(R * 1.1), 60, R * 1.5, null); const fs = parseFloat(ref.style.fontSize); ref.textContent = String(N);
          nums.forEach(e => { e.style.fontSize = fs + 'px'; e.style.left = (area.w / 2 - R * .75) + 'px'; e.style.width = (R * 1.5) + 'px'; e.style.top = (cyy - e.offsetHeight / 2) + 'px'; });
          if (lab) lab.style.top = Math.max(0, cyy - R - 20 - lab.offsetHeight - 20) + 'px';
          G.R = R;
        } else if (v === 'flip') {
          const ch = Math.min((area.h - lh) * .72, P ? 520 : 470), cw = ch * (N >= 10 ? 1.05 : .8);
          box(card, (area.w - cw) / 2, cyy - ch / 2 - 20, cw, ch); card.style.fontSize = (ch * .74) + 'px';
          const dd = wrap.querySelector('.dots'); dd.style.left = '0'; dd.style.width = area.w + 'px'; dd.style.top = (cyy + ch / 2 + 10) + 'px';
          if (lab) lab.style.top = Math.max(0, cyy - ch / 2 - 20 - lab.offsetHeight - 26) + 'px';
          G.cw = cw; G.ch = ch;
        } else {
          const ref = nums[0]; ref.textContent = N >= 10 ? '10' : '8';
          fit(ref, Math.round((area.h - lh) * .82), 80, area.w * .9, null); const fs = parseFloat(ref.style.fontSize); ref.textContent = String(N);
          nums.forEach(e => { e.style.fontSize = fs + 'px'; e.style.left = '0'; e.style.width = area.w + 'px'; e.style.top = (cyy - e.offsetHeight / 2) + 'px'; });
          if (lab) lab.style.top = '0';
        }
        fit(end, P ? 170 : 160, 60, area.w * .9, null); end.style.top = (G.cy - end.offsetHeight / 2) + 'px';
      });
      /* 音效：每拍一个，最后三拍更重；归零爆开 */
      tk.slice(0, N).forEach((c, i) => {
        const fin = N - i <= 3;
        if (v === 'flip') { S(c, 'shutter', fin ? .5 : .35); if (fin) S(c + .05, 'heartbeat', .4); }
        else if (v === 'slam') { S(c, fin ? 'hit' : 'thud', fin ? .7 : .55); if (i) shake(c, fin ? 10 : 5); punch(c, fin ? .04 : .025); }
        else { S(c, 'tick', .5); S(c, fin ? 'heartbeat' : 'blip', fin ? .45 : .2, 0, { n: i }); }
      });
      S(tEnd, 'boom', .8); S(tEnd + .05, v === 'flip' ? 'stamp' : 'tada', .55); flash(tEnd, .45); shake(tEnd, 12); punch(tEnd, .05);
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, s: 1 + EZ.in(out) * .04 });
          if (lab) set(lab, { o: pr(t, slot.t0, slot.t0 + .4) * (1 - pr(t, tEnd, tEnd + .3) * .6), y: (1 - EZ.expo(pr(t, slot.t0, slot.t0 + .6))) * 20 });
          const i = idxAt(t), fin = t >= tEnd, ke = pr(t, tEnd, tEnd + .6);
          tf(end, { o: clamp(ke * 5), s: fin ? EZ.elastic(ke) * (1 + (t > tEnd + 1 ? .03 * Math.sin((t - tEnd) * 3) : 0)) : 0, r: (1 - EZ.out(ke)) * -8 });
          end.style.textShadow = fin ? `0 0 ${(40 + 16 * Math.sin((t - tEnd) * 2.6)).toFixed(1)}px rgba(var(--w-rgb),.55)` : '';
          if (v === 'ring') {
            const pg = ringSv.querySelector('.pg'), tr = ringSv.querySelector('.tr');
            const left = fin ? 0 : 1 - clamp((t - tk[i]) / step);
            draw(pg, t < c0 ? EZ.out(pr(t, slot.t0, c0)) : left);
            pg.style.stroke = N - i <= 3 && t >= c0 ? 'var(--w)' : '';
            const kx = pr(t, tEnd, tEnd + .4);
            tf(ringSv, { o: (1 - kx) * pr(t, slot.t0, c0), s: 1 + EZ.out(kx) * .5 });
            tr.style.opacity = (1 - kx).toFixed(3);
            nums.forEach((e, j) => {
              const kin = pr(t, tk[j], tk[j] + .35), kout = pr(t, tk[j + 1], tk[j + 1] + .25);
              tf(e, { o: t >= tk[j] ? clamp(kin * 4) * (1 - kout) : 0, s: (1.5 - .5 * EZ.back(kin)) * (1 - .4 * EZ.in(kout)), blur: (1 - EZ.out(kin)) * 10 + kout * 8 });
              e.classList.toggle('fin', N - j <= 3);
            });
          } else if (v === 'flip') {
            const kc = pr(t, slot.t0, c0);
            const kx = pr(t, tEnd, tEnd + .45);
            tf(card, { o: clamp(kc * 4) * (1 - kx), s: (.85 + .15 * EZ.back(kc)) * (1 + EZ.out(kx) * .35), blur: kx * 14 });
            /* 第 i 拍：数字从 val(i-1) 翻到 val(i)；f 为翻页进度 */
            const j = fin ? N : i, f = j > 0 ? pr(t, tk[j], tk[j] + .42) : 1;
            const cur = j > 0 ? String(val(j - 1)) : String(N), nxt = j < N ? String(val(j)) : '';
            const show = (h, s) => { const d = h.firstChild; if (d.textContent !== s) d.textContent = s; };
            if (f >= 1 || j === 0) { show(halves.top, j === 0 ? cur : nxt); show(halves.bot, j === 0 ? cur : nxt); halves.ft.style.visibility = halves.fb.style.visibility = 'hidden'; }
            else {
              show(halves.top, nxt); show(halves.bot, cur); show(halves.ft, cur); show(halves.fb, nxt);
              const a1 = EZ.in(clamp(f * 2)), a2 = EZ.out(clamp(f * 2 - 1));
              halves.ft.style.visibility = f < .5 ? 'visible' : 'hidden'; halves.fb.style.visibility = f >= .5 ? 'visible' : 'hidden';
              halves.ft.style.transform = `perspective(1400px) rotateX(${(-90 * a1).toFixed(2)}deg)`;
              halves.fb.style.transform = `perspective(1400px) rotateX(${(90 * (1 - a2)).toFixed(2)}deg)`;
              halves.ft.style.filter = `brightness(${(1 - .5 * a1).toFixed(3)})`;
            }
            card.classList.toggle('fin', !fin && N - i <= 3 && t >= c0);
            dots.forEach((d, k) => { d.classList.toggle('on', t >= tk[k + 1] - 1e-4); });
          } else {
            nums.forEach((e, j) => {
              const kin = pr(t, tk[j] - .02, tk[j] + .3), kout = pr(t, tk[j + 1] - .02, tk[j + 1] + .3);
              tf(e, { o: t >= tk[j] - .02 ? clamp(kin * 5) * (1 - EZ.out(kout)) : 0, s: (1 + (1 - EZ.out5(kin)) * 1.8) * (1 + EZ.in(kout) * 1.5), blur: (1 - kin) * 16 + kout * 20, r: (1 - EZ.out5(kin)) * (j % 2 ? 8 : -8) });
            });
          }
        },
        bg(c, t) {
          const a = 1 - leave(t, slot), x = area.x + area.w / 2, y = area.y + G.cy;
          if (t < c0 - .2) return;
          const i = idxAt(t), fin = N - i <= 3;
          MK.fx.glow(c, x, y, (G.R || area.h * .4) * 1.4, fin ? T().w : T().a, (.45 + .25 * (1 - pr(t, tk[i], tk[i] + .4))) * a * (t < tEnd ? 1 : 1 - pr(t, tEnd, tEnd + 1)));
          if (v === 'ring' && G.R && t < tEnd) { const k = clamp((t - c0) / (tEnd - c0)); T().paint.arcRing(c, x, y, G.R + 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k), fin ? T().w : T().a, .6 * a); }
          if (v === 'slam') {
            tk.slice(0, N).forEach((c0_, j) => MK.fx.ripple(c, t, c0_, x, y, { r: area.w * .5, rings: 2, col: N - j <= 3 ? T().w : T().a, w: 4 }));
            /* 速度线：每拍从中心向外放射 */
            const q = pr(t, tk[i], tk[i] + .4);
            if (t < tEnd && q < 1) { c.save(); c.globalCompositeOperation = 'lighter'; for (let k = 0; k < 28; k++) { const an = rnd(k + i * 40, 131) * 6.283, r0 = 200 + 300 * EZ.out(q), r1 = r0 + 120 + 200 * rnd(k, 132); c.strokeStyle = `rgba(${T().aLite},${(1 - q) * .5 * a})`; c.lineWidth = 2; c.beginPath(); c.moveTo(x + Math.cos(an) * r0, y + Math.sin(an) * r0); c.lineTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1); c.stroke(); } c.restore(); }
          }
        },
        fg(c, t) {
          const x = area.x + area.w / 2, y = area.y + G.cy;
          T().paint.burst(c, t, tEnd, x, y, { n: 80, sp: 1500, life: 1.2 });
          MK.fx.ripple(c, t, tEnd, x, y, { r: area.w * .6, rings: 3, col: T().w, w: 5 });
          if (v !== 'flip') MK.fx.confetti(c, t, tEnd + .05, x, y + 60, { n: 80, sp: 1500, spread: 1.4 });
          else MK.fx.twinkle(c, t, area.x + area.w * .15, y - 140, area.w * .7, 280, 8, T().w, pr(t, tEnd + .3, tEnd + .8) * (1 - leave(t, slot)));
        },
        hint,
      };
    },
  });

  /* ---------- price：价格 / 优惠 ----------
     tag  吊牌从上方摆入（阻尼钟摆），原价被红线划掉，新价砸入，标签旋转盖章；停留时吊牌轻摆、扫光
     card 套餐卡翻起，原价划掉，新价数字老虎机式滚到位，卖点逐条打勾，角标斜带盖上；停留时边框流光绕行
     sale 爆炸贴弹性旋入，新价砸在中间，原价划掉，标签贴纸抖动；停留时爆炸贴慢转 + 心跳缩放 + 速度线
     feats 卖点：card 逐条列出；tag / sale 做成胶囊排在旁边 */
  MK.control('price', {
    variants: ['tag', 'card', 'sale'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait;
      const feats = p.feats || [];
      const wrap = box(el('div', 'mk-abs mk-price ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const hint = { cx: area.x + area.w / 2, cy: area.y + area.h * .45 };
      const c0 = slot.cues[0] ?? slot.t0 + .25, c1 = slot.cues[1] ?? c0 + .9, c2 = slot.cues[2] ?? c1 + .75;
      const kick = p.kicker ? C(box(el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)), 0, 0, area.w)) : null;
      const body = el('div', 'body mk-abs', wrap);                            // tag：吊牌 / card：卡片 / sale：爆炸贴
      const nm = p.name ? C(el('div', 'nm', body, esc(p.name))) : null;
      const was = p.was ? el('div', 'was', body, esc(p.was)) : null;
      const pz = el('div', 'pz', body);
      const digits = [];
      if (v === 'card') {
        /* 数字逐位滚动：每一位按进度跳过若干个数字再停在目标数（逐帧换字 + 纵向滑动 + 动态模糊） */
        for (const ch of [...String(p.price)]) {
          if (/\d/.test(ch)) { const d = el('span', 'dg', pz, ch); digits.push({ d, n: +ch }); }
          else el('span', '', pz, esc(ch));
        }
      } else pz.innerHTML = esc(p.price);
      if (p.unit) el('small', '', pz, esc(p.unit));
      const tag = p.tag ? el('div', 'tg mk-abs', v === 'card' ? body : wrap, `<span>${esc(p.tag)}</span>`) : null;
      let fl = null, chips = [], burst = null, burst2 = null, str = null, ribbon = null;
      if (v === 'card') {
        fl = el('div', 'fl', body);
        chips = feats.map(f => el('div', 'f', fl, `<span class="ck">${MK.icon('check', 30, 3.2)}</span><span>${esc(f)}</span>`));
      } else {
        chips = feats.map(f => el('div', 'chip mk-abs', wrap, `${MK.icon('check', 28, 3)}<span>${esc(f)}</span>`));
        if (v === 'tag') { str = svg(wrap, area.w, area.h); str.innerHTML = '<path/>'; el('i', 'hole', body); }
        else {
          burst = svg(wrap, 10, 10); burst2 = svg(wrap, 10, 10);
          if (p.name) { ribbon = el('div', 'rb mk-abs', wrap); ribbon.appendChild(nm); }
        }
      }
      const G = {};
      ctx.measure(() => {
        const kh = kick ? 60 : 0;
        if (v === 'card') {
          const cw = Math.min(area.w * .9, P ? 760 : 620), padX = 50;
          body.style.width = cw + 'px';
          if (nm) fit(nm, P ? 46 : 42, 24, cw - padX * 2 - (tag ? 120 : 0), null);
          if (was) fitw(was, 40, 22, cw - padX * 2, null);
          pz.style.width = ''; const fs = fit(pz, P ? 150 : 140, 56, cw - padX * 2, null);
          chips.forEach(f => fitw(f.querySelector('span:last-child'), P ? 36 : 32, 20, cw - padX * 2 - 60, null));
          const free = area.h - kh - body.offsetHeight;
          if (free < 0) { /* 卡片太高：等比收字号 */ const k = Math.max(.6, (area.h - kh) / body.offsetHeight); pz.style.fontSize = Math.floor(fs * k) + 'px'; chips.forEach(f => { const s = f.querySelector('span:last-child'); s.style.fontSize = Math.floor(parseFloat(s.style.fontSize) * k) + 'px'; }); }
          const bh = body.offsetHeight, y = kh + Math.max(0, (area.h - kh - bh) / 2);
          body.style.left = (area.w - cw) / 2 + 'px'; body.style.top = y + 'px';
          if (kick) kick.style.top = (y - 60) + 'px';
          G.bx = (area.w - cw) / 2; G.by = y; G.bw = cw; G.bh = bh;
          if (tag) fit(tag.firstChild, 30, 16, 160, null);
        } else if (v === 'tag') {
          /* 横屏：吊牌在左、卖点在右；竖屏：吊牌在上、卖点在下 */
          const side = !P && chips.length;
          const tw = Math.min(P ? area.w * .78 : (side ? area.w * .56 : area.w * .62), 640), inner = tw - 120;
          body.style.width = tw + 'px';
          if (nm) fit(nm, 44, 22, inner, null);
          if (was) fitw(was, 46, 24, inner, null);
          fit(pz, P ? 150 : 140, 50, inner, null);
          const chipH = chips.length ? 64 : 0, chipsW = side ? area.w - tw - 60 : area.w;
          chips.forEach(ch => fitw(ch.querySelector('span'), 32, 18, chipsW - 80, null));
          const bh = body.offsetHeight, strH = 70;
          const colH = side ? 0 : (chips.length ? 30 + chips.length * chipH : 0);
          const avail = area.h - kh - strH - colH;
          const s = Math.min(1, avail / bh); G.ts = s;
          const bx = side ? 20 : (area.w - tw) / 2, by = kh + strH + Math.max(0, (avail - bh * s) / 2);
          body.style.left = bx + 'px'; body.style.top = by + 'px'; body.style.transformOrigin = `50% ${-strH}px`;
          G.px = bx + tw / 2; G.py = by - strH; G.bx = bx; G.by = by; G.bw = tw; G.bh = bh * s;
          str.firstChild.setAttribute('d', `M${G.px} ${G.py - 10} L${G.px} ${by + 34 * s}`);
          if (kick) { kick.style.top = '0'; }
          if (side) { let y = by + (bh * s - chips.length * chipH) / 2; chips.forEach(ch => { ch.style.left = (bx + tw + 60) + 'px'; ch.style.top = y + 'px'; y += chipH; }); }
          else { let y = by + bh * s + 30; chips.forEach(ch => { ch.style.left = (area.w - ch.offsetWidth) / 2 + 'px'; ch.style.top = y + 'px'; y += chipH; }); }
          if (tag) { fit(tag.firstChild, 40, 18, 150, null); tag.style.left = (bx + tw - tag.offsetWidth * .7) + 'px'; tag.style.top = (by - tag.offsetHeight * .35) + 'px'; }
        } else {
          const side = !P && chips.length;
          const D = Math.min(side ? area.w * .56 : area.w * .82, (P ? area.h - (chips.length ? chips.length * 64 + 40 : 0) : area.h) - kh - 20, P ? 640 : 600);
          const cx = side ? D / 2 + 10 : area.w / 2, cy = kh + 10 + D / 2 + (P ? 0 : Math.max(0, (area.h - kh - 20 - D) / 2));
          const spikes = 22, pts = (r0, r1) => Array.from({ length: spikes * 2 }, (_, k) => { const an = k / (spikes * 2) * Math.PI * 2, r = k % 2 ? r0 : r1; return `${(D / 2 + 20 + Math.cos(an) * r).toFixed(1)},${(D / 2 + 20 + Math.sin(an) * r).toFixed(1)}`; }).join(' ');
          [burst, burst2].forEach(b => { b.setAttribute('width', D + 40); b.setAttribute('height', D + 40); b.setAttribute('viewBox', `0 0 ${D + 40} ${D + 40}`); b.style.left = (cx - D / 2 - 20) + 'px'; b.style.top = (cy - D / 2 - 20) + 'px'; });
          burst.innerHTML = `<polygon class="s" points="${pts(D * .4, D / 2)}"/>`;
          burst2.innerHTML = `<polygon class="o" points="${pts(D * .45, D / 2 + 16)}"/>`;
          burst.style.zIndex = 1; body.style.zIndex = 2;
          const inner = D * .62;
          body.style.width = inner + 'px';
          if (was) fitw(was, 44, 22, inner * .8, null);
          fit(pz, P ? 170 : 160, 50, inner, D * .34);
          const bh = body.offsetHeight; body.style.left = (cx - inner / 2) + 'px'; body.style.top = (cy - bh / 2 + (was ? 0 : 0)) + 'px';
          if (ribbon) { fit(nm, 40, 20, D * .8, null); ribbon.style.left = (cx - ribbon.offsetWidth / 2) + 'px'; ribbon.style.top = (cy + D * .32) + 'px'; ribbon.style.zIndex = 3; }
          if (tag) { fit(tag.firstChild, 44, 18, D * .4, null); tag.style.left = (cx + D * .12) + 'px'; tag.style.top = (cy - D * .5) + 'px'; tag.style.zIndex = 3; }
          const chipH = 64;
          chips.forEach(ch => fitw(ch.querySelector('span'), 32, 18, (side ? area.w - D - 80 : area.w) - 80, null));
          if (side) { let y = cy - chips.length * chipH / 2; chips.forEach(ch => { ch.style.left = (D + 70) + 'px'; ch.style.top = y + 'px'; y += chipH; }); }
          else { let y = cy + D / 2 + 30; chips.forEach(ch => { ch.style.left = (area.w - ch.offsetWidth) / 2 + 'px'; ch.style.top = y + 'px'; y += chipH; }); }
          if (kick) kick.style.top = '0';
          G.cx = cx; G.cy = cy; G.D = D;
        }
        hint.cx = area.x + (v === 'sale' ? G.cx : G.bx + G.bw / 2); hint.cy = area.y + (v === 'sale' ? G.cy : G.by + G.bh / 2);
      });
      const fAt = chips.map((_, i) => c2 + .35 + i * .22);
      /* 音效 */
      S(c0, v === 'tag' ? 'whoosh' : v === 'card' ? 'card' : 'boom', v === 'sale' ? .6 : .5);
      if (v === 'sale') { shake(c0 + .1, 8); punch(c0 + .1, .03); }
      if (was) S(c1 - .35, 'scratch', .45);
      if (v === 'card') { S(c1 - .1, 'counter', .35, 0, { d: .8 }); S(c1 + .75, 'cash', .6); }
      else { S(c1, 'hit', .65); S(c1 + .05, 'cash', .55); punch(c1, .035); shake(c1, 7); }
      if (tag) { S(c2, 'stamp', .7); shake(c2, 6); }
      fAt.forEach((c, i) => S(c, v === 'card' ? 'check' : 'pop', .35, 0, { n: i }));
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, y: -EZ.in(out) * 14 });
          const hold = idle(t, c2 + 1, 3), live = t > c2 + 1;
          if (kick) set(kick, { o: pr(t, c0 - .1, c0 + .3) });
          const ks = pr(t, c1 - .4, c1 - .1);
          if (was) { was.style.setProperty('--st', EZ.out(ks).toFixed(3)); was.style.opacity = (pr(t, c0 + .2, c0 + .5) * (1 - .45 * ks)).toFixed(3); }
          if (v === 'tag') {
            /* 钟摆：吊点在绳子顶端，摆入后阻尼衰减，停留时轻摆 */
            const u = t - c0, k = pr(t, c0, c0 + .5), sw = u > 0 ? 34 * Math.exp(-2.6 * u) * Math.cos(u * 6.5) : 34;
            tf(body, { o: clamp(k * 4), y: -(1 - EZ.out5(k)) * 260, r: sw + (live ? Math.sin((t - c2) * 1.6) * 2.2 : 0), s: G.ts });
            str.style.opacity = clamp(k * 4).toFixed(3);
            str.firstChild.style.transformOrigin = `${G.px}px ${G.py - 10}px`;
            str.firstChild.style.transform = `translateY(${(-(1 - EZ.out5(k)) * 260).toFixed(1)}px) rotate(${(sw + (live ? Math.sin((t - c2) * 1.6) * 2.2 : 0)).toFixed(2)}deg)`;
            body.style.setProperty('--sh', `${lerp(130, -30, live ? EZ.inout(clamp(hold.sweep * 2)) : 0).toFixed(1)}%`);
          } else if (v === 'card') {
            const k = pr(t, c0, c0 + .7);
            tf(body, { o: clamp(k * 3), y: (1 - EZ.out5(k)) * 90, rx: (1 - EZ.out5(k)) * 40, p: 1600 });
            body.style.setProperty('--ang', ((t - c0) * 140).toFixed(1) + 'deg');
            body.classList.toggle('lit', t > c1 + .8);
            if (nm) set(nm, { o: pr(t, c0 + .2, c0 + .5) });
            digits.forEach((o, i) => {
              /* 剩余步数从 9 + 2i 递减到 0，各位错峰落定；小数部分做成上滑位移 */
              const q = pr(t, c1 - .1 + i * .02, c1 + .55 + i * .12), left = (1 - EZ.out5(q)) * (9 + 2 * i), st = Math.floor(left), fr = left - st;
              const ch = String((o.n + st) % 10); if (o.d.textContent !== ch) o.d.textContent = ch;
              tf(o.d, { y: q < 1 ? -fr * 18 : 0, blur: q > 0 && q < .9 ? (1 - q) * 4 : 0 });
            });
            set(pz, { o: pr(t, c1 - .2, c1), s: 1 + bell(t, c1 + .6, c1 + 1) * .06 });
            pz.style.textShadow = live ? `0 0 ${(30 + 14 * hold.wave).toFixed(1)}px rgba(var(--a-rgb),.55)` : '';
            chips.forEach((f, i) => { const q = pr(t, fAt[i], fAt[i] + .4); set(f, { o: clamp(q * 3), x: (1 - EZ.expo(q)) * -30 }); f.querySelector('.ck').style.transform = `scale(${EZ.elastic(q).toFixed(3)})`; });
          } else {
            const k = pr(t, c0, c0 + .9), spin = (1 - EZ.out5(k)) * -200 + (t - c0) * 6, beat = live ? 1 + .03 * Math.max(0, Math.sin((t - c2) * 5.2)) : 1;
            [burst, burst2].forEach((b, j) => { b.style.transformOrigin = '50% 50%'; tf(b, { o: clamp(k * 4), s: EZ.elastic(k) * beat * (j ? 1 : 1), r: j ? -spin * .6 : spin }); });
            if (ribbon) { const q = pr(t, c0 + .5, c0 + 1); tf(ribbon, { o: clamp(q * 3), sx: Math.max(.001, EZ.back(q)), r: -4 }); }
            const kp = pr(t, c1, c1 + .35);
            tf(pz, { o: clamp(kp * 5), s: (1 + (1 - EZ.out5(kp)) * 1.6) * beat, blur: (1 - kp) * 10 });
            set(body, { o: 1 });
          }
          if (v !== 'card') {
            const kp = pr(t, c1, c1 + .35);
            if (v === 'tag') tf(pz, { o: clamp(kp * 5), s: 1 + (1 - EZ.out5(kp)) * 1.4, blur: (1 - kp) * 10 });
            if (nm && v === 'tag') set(nm, { o: pr(t, c0 + .2, c0 + .5) });
            chips.forEach((ch, i) => { const q = pr(t, fAt[i], fAt[i] + .5); tf(ch, { o: clamp(q * 3), s: .5 + .5 * EZ.spring(q), y: live ? Math.sin((t - c2) * 2.4 - i) * 4 : 0 }); });
          }
          if (tag) {
            const q = pr(t, c2, c2 + .35), wob = v === 'sale' && live ? Math.sin((t - c2) * 7) * 4 * Math.max(0, Math.sin((t - c2) * .9)) : 0;
            tf(tag, { o: clamp(q * 5), s: 1 + (1 - EZ.out5(q)) * 1.6, r: lerp(-60, v === 'card' ? 0 : -14, EZ.out5(q)) + wob });
          }
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          if (v === 'sale' && G.D) {
            const x = area.x + G.cx, y = area.y + G.cy, k = pr(t, c0, c0 + .6);
            MK.fx.glow(c, x, y, G.D * .9, T().w, .55 * k * a);
            c.save(); c.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 36; i++) {
              const an = i / 36 * 6.283 + (t - c0) * .15, ph = ((t - c0) * .8 + rnd(i, 141)) % 1, r0 = G.D * (.55 + .5 * ph), r1 = r0 + 60 + 80 * rnd(i, 142);
              c.strokeStyle = `rgba(${T().w},${.35 * Math.sin(Math.PI * ph) * k * a})`; c.lineWidth = 3;
              c.beginPath(); c.moveTo(x + Math.cos(an) * r0, y + Math.sin(an) * r0); c.lineTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1); c.stroke();
            }
            c.restore();
          } else if (G.bw) MK.fx.glow(c, area.x + G.bx + G.bw / 2, area.y + G.by + G.bh / 2, G.bw * .8, T().a, .4 * a * pr(t, c0, c0 + .6));
        },
        fg(c, t) {
          const a = 1 - leave(t, slot);
          const x = area.x + (v === 'sale' ? G.cx : G.bx + G.bw / 2), y = area.y + (v === 'sale' ? G.cy : G.by + G.bh * .55);
          T().paint.burst(c, t, v === 'card' ? c1 + .75 : c1, x, y, { n: 46, sp: 1000, col: T().w });
          if (v === 'sale') MK.fx.confetti(c, t, c1 + .05, x, y + 40, { n: 60, sp: 1300, spread: 1.3 });
          if (live2(t)) MK.fx.twinkle(c, t, x - 260, y - 160, 520, 320, 6, T().w, .7 * a);
        },
        hint,
      };
      function live2(t) { return t > c2 + 1; }
    },
  });

  /* ---------- reveal：揭晓 / 抽奖 ----------
     curtain 帘幕在鼓点里颤动，揭晓时向两侧收拢拉开，聚光灯照在结果上 + 彩纸
     card    背面朝上的卡片随鼓点越抖越快，三维翻开露出结果，光芒爆开
     box     礼物盒越抖越厉害，盒盖飞起，光柱从盒里射出，结果从盒中升起放大
     停留时：聚光灯/光芒持续转动、结果呼吸发光、星点闪烁 */
  MK.control('reveal', {
    variants: ['curtain', 'card', 'box'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait;
      const wrap = box(el('div', 'mk-abs mk-rev ' + v, ctx.root), area.x, area.y, area.w, area.h);
      const hint = { cx: area.x + area.w / 2, cy: area.y + area.h * .45 };
      const c0 = slot.cues[0] ?? slot.t0 + .25, c1 = slot.cues[1] ?? c0 + Math.min(2.2, Math.max(1.2, (slot.t1 - slot.t0) * .42));
      const kick = p.kicker ? C(box(el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)), 0, 0, area.w)) : null;
      const res = el('div', 'res mk-abs', wrap);
      if (p.icon) el('div', 'ic', res, MK.icon(p.icon, 96, 2));
      const txt = C(el('div', 'tx', res, rich(p.text)));
      const sub = p.sub ? C(el('div', 'sub', res, rich(p.sub))) : null;
      const G = {};
      let curt = [], val = null, card = null, front = null, gift = null, lid = null;
      if (v === 'curtain') {
        curt = [0, 1].map(i => el('div', 'cu mk-abs ' + (i ? 'r' : 'l'), wrap));
        val = el('div', 'val mk-abs', wrap);
      } else if (v === 'card') {
        card = el('div', 'cd mk-abs', wrap);
        el('div', 'face back', card, `<div class="q">?</div>`);
        front = el('div', 'face front', card);
        front.appendChild(res); res.classList.remove('mk-abs');
      } else {
        gift = el('div', 'gift mk-abs', wrap, '<div class="bx"><i></i></div>');
        lid = el('div', 'lid mk-abs', wrap, '<i></i><b class="l"></b><b class="r"></b>');
      }
      ctx.measure(() => {
        const kh = kick ? 64 : 0;
        if (kick) kick.style.top = '0';
        if (v === 'curtain') {
          const cw = area.w, ch = area.h - kh;
          box(curt[0], 0, kh, cw / 2 + 2, ch); box(curt[1], cw / 2 - 2, kh, cw / 2 + 2, ch); box(val, -20, kh - 10, cw + 40, 70);
          res.style.width = (cw * .9) + 'px';
          fit(txt, P ? 150 : 140, 48, cw * .86, (ch - 40) * .5);
          if (sub) fit(sub, P ? 44 : 40, 22, cw * .86, null);
          box(res, cw * .05, kh + (ch - res.offsetHeight) / 2 + 20, cw * .9);
          G.cy = kh + ch / 2 + 20;
        } else if (v === 'card') {
          const ch = Math.min(area.h - kh - 30, P ? 600 : 560), cw = Math.min(area.w * .9, ch * (P ? 1.25 : 1.3));
          box(card, (area.w - cw) / 2, kh + (area.h - kh - ch) / 2, cw, ch);
          card.querySelector('.q').style.fontSize = (ch * .5) + 'px';
          /* 正面平时 display:none，量字时临时翻开 */
          card.classList.add('open'); res.style.width = (cw - 60) + 'px';
          fit(txt, P ? 130 : 120, 44, cw - 80, ch * .42);
          if (sub) fit(sub, 40, 20, cw - 80, null);
          card.classList.remove('open');
          G.cy = kh + (area.h - kh) / 2; G.cw = cw; G.ch = ch;
        } else {
          const bw = Math.min(P ? 340 : 300, area.w * .4), bh = bw * .72, lh = bw * .26;
          const by = area.h - bh - 10;
          box(gift, (area.w - bw) / 2, by, bw, bh); box(lid, (area.w - bw * 1.1) / 2, by - lh + 4, bw * 1.1, lh);
          res.style.width = (area.w * .9) + 'px';
          const room = by - lh - kh - 30;
          fit(txt, P ? 140 : 120, 44, area.w * .86, room * (sub ? .62 : .85));
          if (sub) fit(sub, 40, 22, area.w * .86, null);
          box(res, area.w * .05, kh + Math.max(0, (room - res.offsetHeight) / 2) + 10, area.w * .9);
          G.gy = by; G.bw = bw; G.bh = bh; G.ry = parseFloat(res.style.top); G.cy = G.ry + res.offsetHeight / 2;
        }
        hint.cy = area.y + G.cy;
      });
      /* 鼓点越来越密：鼓点时间表 */
      const hits = []; for (let x = c0, g = .32; x < c1 - .12; x += g, g = Math.max(.09, g * .86)) hits.push(x);
      S(c0, 'drumroll', .5, 0, { d: c1 - c0 });
      if (v === 'box') hits.forEach((h, i) => { if (i % 3 === 0) S(h, 'thud', .2); });
      S(c1, 'cymbal', .55); S(c1 + .02, 'tada', .6); flash(c1, .45); shake(c1, 10); punch(c1, .045);
      if (v === 'curtain') S(c1 - .05, 'whoosh', .5); else if (v === 'card') S(c1 - .05, 'card', .6); else S(c1 - .02, 'boom', .55);
      if (sub) S(c1 + .7, 'pop', .35);
      /* 鼓点抖动强度：越接近揭晓越大 */
      const tension = t => (t >= c0 && t < c1 ? pr(t, c0, c1) : 0);
      const jitter = (t, k) => { const fi = Math.floor(t * 30); return [(rnd(fi, 151) - .5) * k, (rnd(fi, 152) - .5) * k]; };
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, s: 1 + EZ.in(out) * .03 });
          const hold = idle(t, c1 + 1, 3), live = t > c1 + 1, ten = tension(t);
          if (kick) set(kick, { o: pr(t, slot.t0, slot.t0 + .4), s: 1 + .04 * ten * Math.abs(Math.sin(t * 20)) });
          const kr = pr(t, c1, c1 + .7);
          if (v === 'curtain') {
            const ko = pr(t, c1, c1 + 1.1);
            curt.forEach((e, i) => {
              const [jx] = jitter(t + i, 10 * ten);
              e.style.transformOrigin = i ? '100% 0' : '0 0';
              tf(e, { sx: Math.max(.08, 1 - .9 * EZ.out5(ko) + .04 * Math.sin(ko * Math.PI)), x: jx, o: pr(t, slot.t0, slot.t0 + .3) });
              e.style.backgroundSize = `${(46 * (1 - .75 * EZ.out5(ko)) + 8).toFixed(1)}px 100%, 100% 100%`;
            });
            set(val, { o: pr(t, slot.t0, slot.t0 + .3), y: jitter(t, 4 * ten)[1] });
            tf(res, { o: clamp(pr(t, c1 + .1, c1 + .5) * 3), s: .6 + .4 * EZ.spring(pr(t, c1 + .1, c1 + .9)) });
          } else if (v === 'card') {
            const [jx, jy] = jitter(t, 16 * ten), kin = pr(t, slot.t0, c0 + .4), kf = pr(t, c1 - .05, c1 + .75);
            const flip = EZ.spring(kf) * 180, flt = live ? Math.sin((t - c1) * 1.6) * 8 : 0;
            tf(card, { o: clamp(kin * 4), x: jx, y: jy + (1 - EZ.out5(kin)) * 80 + flt, r: ten * Math.sin(t * 34) * 3, s: (1 + .05 * ten) * (1 + .08 * bell(t, c1 - .05, c1 + .4)), ry: flip, p: 1800 });
            card.classList.toggle('open', flip > 90);
            front.style.setProperty('--sh', `${lerp(130, -30, live ? EZ.inout(clamp(hold.sweep * 2)) : pr(t, c1 + .4, c1 + 1)).toFixed(1)}%`);
            if (sub) set(sub, { o: pr(t, c1 + .6, c1 + 1) });
          } else {
            const [jx] = jitter(t, 24 * ten), hop = ten > 0 ? Math.abs(Math.sin(t * 22)) * 14 * ten : 0, kin = pr(t, slot.t0, c0 + .4);
            const kl = pr(t, c1 - .05, c1 + .9);
            tf(gift, { o: clamp(kin * 4) * (1 - .35 * pr(t, c1 + .4, c1 + 1)), x: jx, y: -hop + (1 - EZ.bounce(kin)) * -200, r: ten * Math.sin(t * 30) * 4, sy: 1 - .06 * bell(t, c1 - .15, c1 + .05) });
            tf(lid, { o: clamp(kin * 4) * (1 - pr(t, c1 + .4, c1 + .9)), x: jx + kl * area.w * .18, y: -hop + (1 - EZ.bounce(kin)) * -200 - EZ.out(kl) * area.h * .5 + kl * kl * 160, r: ten * Math.sin(t * 30) * 5 + kl * 70 });
            const kt = pr(t, c1 + .1, c1 + .9);
            tf(res, { o: clamp(kt * 3), y: (1 - EZ.out5(kt)) * (G.gy - G.ry - 60), s: .3 + .7 * EZ.spring(kt) });
          }
          txt.style.textShadow = t > c1 ? `0 0 ${(30 + (live ? 16 * hold.wave : 0)).toFixed(1)}px rgba(var(--w-rgb),.55)` : '';
          if (sub && v !== 'card') set(sub, { o: pr(t, c1 + .6, c1 + 1), y: (1 - EZ.expo(pr(t, c1 + .6, c1 + 1.1))) * 16 });
          void kr;
        },
        bg(c, t) {
          const a = 1 - leave(t, slot), x = area.x + area.w / 2, y = area.y + G.cy, ten = tension(t);
          if (t < c1) { MK.fx.glow(c, x, y, area.h * .5, T().a, (.25 + .35 * ten * (.6 + .4 * Math.sin(t * 30))) * a); return; }
          const k = pr(t, c1, c1 + .6);
          if (v === 'curtain') {
            /* 聚光灯：从上方打下的光锥，停留时轻摆 */
            const sx = x + Math.sin((t - c1) * .8) * 40, top = area.y - 40;
            c.save(); c.globalCompositeOperation = 'lighter';
            const g = c.createLinearGradient(0, top, 0, y + 200); g.addColorStop(0, `rgba(${T().w},${.32 * k * a})`); g.addColorStop(1, `rgba(${T().w},0)`);
            c.fillStyle = g; c.beginPath(); c.moveTo(sx - 60, top); c.lineTo(sx + 60, top); c.lineTo(sx + area.w * .36, y + 200); c.lineTo(sx - area.w * .36, y + 200); c.closePath(); c.fill(); c.restore();
            MK.fx.glow(c, x, y, area.w * .4, T().w, .5 * k * a);
          } else {
            /* 光芒：从中心放射的光柱，持续缓慢旋转 */
            const cy = v === 'box' ? area.y + G.gy : y, R = Math.max(area.w, area.h) * .7;
            c.save(); c.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 14; i++) {
              const an = i / 14 * 6.283 + (t - c1) * .25, w = .09;
              if (v === 'box' && Math.sin(an) > .1) continue;                // 盒子只向上方射
              const g = c.createRadialGradient(x, cy, 0, x, cy, R); g.addColorStop(0, `rgba(${T().w},${.3 * k * a})`); g.addColorStop(1, `rgba(${T().w},0)`);
              c.fillStyle = g; c.beginPath(); c.moveTo(x, cy); c.arc(x, cy, R, an - w, an + w); c.closePath(); c.fill();
            }
            c.restore();
            MK.fx.glow(c, x, y, area.w * .35, T().w, .45 * k * a);
          }
        },
        fg(c, t) {
          const a = 1 - leave(t, slot), x = area.x + area.w / 2, y = area.y + G.cy;
          T().paint.burst(c, t, c1, x, v === 'box' ? area.y + G.gy : y, { n: 60, sp: 1300, col: T().w });
          MK.fx.confetti(c, t, c1 + .05, x - area.w * .25, area.y + area.h + 20, { n: 60, sp: 1500, spread: .7, seed: 3 });
          MK.fx.confetti(c, t, c1 + .12, x + area.w * .25, area.y + area.h + 20, { n: 60, sp: 1500, spread: .7, seed: 4 });
          if (t > c1 + .8) MK.fx.twinkle(c, t, area.x + area.w * .1, y - 160, area.w * .8, 320, 9, T().w, .8 * a * pr(t, c1 + .8, c1 + 1.4));
        },
        hint,
      };
    },
  });
})();
