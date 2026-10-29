/* motion-kit · 文字类控件：title / keyword / number / quote / stamp / chapter
   每个控件的 build(slot, p, ctx) 返回 { update(t), bg?(c,t), fg?(c,t), hint }。
   slot = { t0, t1, cues[] }：全片绝对秒。ctx = { W, H, area, root, portrait, variant, occurrence }。
   变体（variants）：同一控件在一条片子里重复出现时，按次序轮换版式和动作，避免每次一样。 */
(function () {
  'use strict';
  const { clamp, lerp, pr, EZ, el, box, set, enter, fit, html, rich, esc, S, flash, shake, idle } = MK;
  const T = () => MK.T;

  /* 内容块整体出场（最后 0.35 秒）；返回 0..1 的退出进度 */
  const leave = (t, slot) => pr(t, slot.t1 - .35, slot.t1);

  /* ---------- title：两行标题 ----------
     slam   第一行上推，第二行砸入（默认）
     split  两行分别从左右滑入，中间一道光线划开
     type   第一行逐字打出，第二行遮罩上卷 */
  MK.control('title', {
    variants: ['slam', 'split', 'type'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant;
      const wrap = box(el('div', 'mk-abs', ctx.root), area.x, area.y + area.h * (ctx.portrait ? .08 : .2), area.w);
      const kick = p.kicker ? el('div', 'mk-kick', wrap, esc(p.kicker)) : null;
      if (kick) kick.style.marginBottom = '18px';
      const t1 = el('div', 'mk-title', wrap), l1 = el('div', 'l1', t1, rich(p.line1)), l2 = p.line2 ? el('div', 'l2', t1, rich(p.line2)) : null;
      if (v === 'split') { wrap.style.textAlign = 'center'; }
      const [c1, c2] = [slot.cues[0] ?? slot.t0 + .1, slot.cues[1] ?? slot.t0 + 1.1];
      ctx.measure(() => { fit(t1, ctx.portrait ? 120 : 128, 56, area.w, null); wrap._mid = t1.offsetTop + t1.offsetHeight + 28; });
      const n1 = MK.plainLen(p.line1), typeEnd = c1 + Math.min(1.2, n1 * .07);
      if (v === 'type') { S(c1, 'type', .35, 0, { d: typeEnd - c1 }); } else { S(c1, 'whoosh', .7); S(c1 + .04, 'hit', .8); }
      if (l2) {
        if (v === 'split') { S(c2, 'swipe', .6, .4); S(c2 + .05, 'hit', .7); flash(c2, .25); }
        else if (v === 'type') { S(c2, 'swoosh', .6); S(c2 + .1, 'thud', .6); }
        else { S(c2 - .05, 'riser', .35, 0, { d: .5 }); S(c2, 'hit', .9); flash(c2, .35); shake(c2, 9); }
      }
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, y: -EZ.in(out) * 20, blur: out * 10 });
          if (kick) enter(kick, t, c1 - .15, 'rise', { dist: 20 });
          if (v === 'split') enter(l1, t, c1, 'slide-l', { dist: 160 });
          else if (v === 'type') { const n = Math.floor(clamp((t - c1) / Math.max(.01, typeEnd - c1)) * n1 + 1e-6); html(l1, MK.richUpTo(p.line1, n) + (t < typeEnd + .5 && Math.floor(t * 3.2) % 2 === 0 ? '<span class="mk-caret">▍</span>' : '')); set(l1, { o: t >= c1 - .05 ? 1 : 0 }); }
          else enter(l1, t, c1, 'rise');
          if (l2) {
            const b = v === 'split' ? enter(l2, t, c2, 'slide-r', { dist: 160 }) : v === 'type' ? enter(l2, t, c2, 'mask') : enter(l2, t, c2, 'slam');
            l2.style.transformOrigin = v === 'split' ? '50% 60%' : '0 60%';
            const k = idle(t, c2 + .6, 6);   // 停留：每 6 秒扫光一次
            l2.style.backgroundPosition = b < 1 ? '130% 0, 0 0' : `${lerp(130, -30, EZ.inout(clamp(k.sweep * 3))).toFixed(1)}% 0, 0 0`;
          }
        },
        bg(c, t) {
          if (v !== 'split' || !l2) return;
          const a = 1 - leave(t, slot), y = area.y + area.h * (ctx.portrait ? .08 : .2) + (wrap._mid || 150);
          T().paint.beam(c, area.x + area.w / 2, y, area.x + area.w / 2 + (area.w / 2) * EZ.out(pr(t, c2 - .2, c2 + .4)), y, T().a, .7 * a, { w: 2 });
          T().paint.beam(c, area.x + area.w / 2, y, area.x + area.w / 2 - (area.w / 2) * EZ.out(pr(t, c2 - .2, c2 + .4)), y, T().a, .7 * a, { w: 2 });
        },
        hint: { cx: area.x + area.w * (v === 'split' ? .5 : .3), cy: area.y + area.h * .5 },
      };
    },
  });

  /* ---------- keyword：关键词 + 逐句补充 ----------
     slam   砸入 + 弧环 + 火花（默认）
     glitch 数字干扰闪烁后定格，下方扫描线
     focus  从模糊放大中聚焦，四角取景框收拢 */
  MK.control('keyword', {
    variants: ['slam', 'glitch', 'focus'],
    build(slot, p, ctx) {
      const { area } = ctx, sub = p.sub || [], v = ctx.variant;
      const cx = area.x + area.w / 2, top = area.h * (ctx.portrait ? .14 : .26);
      const wrap = box(el('div', 'mk-abs', ctx.root), area.x, area.y, area.w, area.h);
      wrap.style.textAlign = 'center';
      const kick = p.kicker ? box(el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)), 0, top - 66, area.w) : null;
      const word = box(el('div', 'mk-word mk-abs', wrap, esc(p.word)), 0, top, area.w);
      const rule = box(el('div', 'mk-abs', wrap), area.w * .3, top + 200, area.w * .4, 3);
      rule.style.background = 'linear-gradient(90deg,transparent,var(--a),transparent)';
      const corners = v === 'focus' ? [0, 1, 2, 3].map(i => { const b = el('div', 'mk-abs', wrap); b.style.cssText += `width:44px;height:44px;border:0 solid var(--a);${i < 2 ? 'border-top-width' : 'border-bottom-width'}:3px;${i % 2 ? 'border-right-width' : 'border-left-width'}:3px`; return b; }) : [];
      const subs = sub.map(s => el('div', 'mk-word-sub mk-abs', wrap, rich(s)));
      let wh = 200, ww = 600;
      ctx.measure(() => {
        fit(word, ctx.portrait ? 190 : 220, 80, area.w * .86, null);
        const r = word.getBoundingClientRect(); wh = r.height; ww = Math.min(area.w, word.scrollWidth);
        rule.style.top = (top + wh + 26) + 'px';
        subs.forEach((e, i) => { box(e, 0, top + wh + 62 + i * 62, area.w); fit(e, 42, 26, area.w * .9, null); });
      });
      const c0 = slot.cues[0] ?? slot.t0 + .15;
      const cs = sub.map((_, i) => slot.cues[i + 1] ?? c0 + 1.1 + i * 1.1);
      if (v === 'glitch') { S(c0 - .1, 'glitch', .45); S(c0 + .25, 'hit', .8); flash(c0 + .25, .25); }
      else if (v === 'focus') { S(c0 - .1, 'riser', .3, 0, { d: .4 }); S(c0 + .3, 'thud', .7); S(c0 + .35, 'marker', .4); }
      else { S(c0 - .02, 'whoosh', .6); S(c0 + .02, 'hit', 1); flash(c0, .4); shake(c0, 12); }
      cs.forEach((c, i) => S(c, 'pop', .45, (i - 1) * .25));
      const wordY = area.y + top + wh / 2;
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, s: 1 + EZ.in(out) * .04 });
          if (kick) enter(kick, t, c0 - .2, 'rise', { dist: 18 });
          if (v === 'glitch') {
            const g = pr(t, c0 - .1, c0 + .3), jit = g < 1 && t >= c0 - .1;
            const fi = Math.floor(t * 60);
            set(word, { o: jit ? (MK.rnd(fi, 3) > .3 ? 1 : .2) : g >= 1 ? 1 : 0, x: jit ? (MK.rnd(fi, 4) - .5) * 40 : 0, blur: jit ? MK.rnd(fi, 5) * 3 : 0 });
            word.style.textShadow = jit ? `${(MK.rnd(fi, 6) * 12 - 6).toFixed(1)}px 0 rgba(255,60,80,.8),${(MK.rnd(fi, 7) * -12 + 6).toFixed(1)}px 0 rgba(${T().a},.9)` : `0 0 40px rgba(${T().a},.5)`;
          } else if (v === 'focus') {
            const f = pr(t, c0 - .1, c0 + .45);
            set(word, { o: clamp(f * 2), s: 1.35 - .35 * EZ.out5(f), blur: (1 - EZ.out5(f)) * 24 });
            const k = idle(t, c0 + .5, 4);
            word.style.textShadow = `0 0 ${(40 + 14 * k.wave).toFixed(1)}px rgba(${T().a},.5)`;
            corners.forEach((b, i) => {
              const sx = i % 2 ? 1 : -1, sy = i < 2 ? -1 : 1, k2 = EZ.out5(pr(t, c0, c0 + .5)), pad = lerp(120, 26, k2);
              set(b, { x: area.w / 2 + sx * (ww / 2 + pad) - (sx > 0 ? 44 : 0), y: top + wh / 2 + sy * (wh / 2 + pad * .5) - (sy > 0 ? 44 : 0), o: clamp(k2 * 2) });
            });
          } else {
            enter(word, t, c0, 'slam', { k: 1.1 });
            const k = idle(t, c0 + .5, 4);
            word.style.textShadow = `0 0 ${(40 + 14 * k.wave).toFixed(1)}px rgba(${T().a},${(.5 + .1 * k.wave).toFixed(3)})`;
          }
          rule.style.transform = `scaleX(${EZ.out(pr(t, c0 + .1, c0 + .7)).toFixed(4)})`;
          subs.forEach((e, i) => enter(e, t, cs[i], 'rise', { dist: 24 }));
        },
        bg(c, t) {
          const a = pr(t, c0, c0 + .5) * (1 - leave(t, slot));
          if (v === 'slam') T().paint.arcRing(c, cx, wordY, 300, Math.PI * (1.12 + t * .01), Math.PI * (1.12 + t * .01 + .76 * EZ.out(pr(t, c0, c0 + 1.2))), T().w, .6 * a);
          if (v === 'glitch') {   // 横向扫描线，缓慢下行
            c.save(); c.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 3; i++) { const y = area.y + ((t * 90 + i * 160) % area.h); c.fillStyle = `rgba(${T().a},${.06 * a})`; c.fillRect(area.x, y, area.w, 2); }
            c.restore();
          }
        },
        fg(c, t) {
          if (v === 'slam') T().paint.burst(c, t, c0, cx, wordY, { n: 50, col: T().aLite, sp: 1100 });
          if (v === 'focus') T().paint.burst(c, t, c0 + .3, cx, wordY, { n: 24, col: T().aLite, sp: 500, life: .8 });
        },
        hint: { cx, cy: area.y + area.h * .45 },
      };
    },
  });

  /* ---------- number：数字 ----------
     ring   环形进度 + 滚动（默认）
     gauge  半圆仪表，指针扫到数值
     flip   大号数字逐位翻入，底部进度刻度 */
  MK.control('number', {
    variants: ['ring', 'gauge', 'flip'],
    build(slot, p, ctx) {
      const { area } = ctx, notes = p.note || [], v = ctx.variant;
      const cx = area.x + area.w * .5, cy = area.y + area.h * (v === 'gauge' ? .62 : ctx.portrait ? .3 : .42);
      const R = v === 'gauge' ? Math.min(area.w * .3, area.h * .48, 300) : Math.min(area.h * .36, ctx.portrait ? 300 : 260);
      const wrap = box(el('div', 'mk-abs', ctx.root), area.x, area.y, area.w, area.h);
      wrap.style.textAlign = 'center';
      const labY = v === 'gauge' ? cy - area.y + 40 - R - 76 : v === 'flip' ? cy - area.y - 190 : cy - area.y - R * .62;
      const lab = box(el('div', 'mk-kick mk-abs', wrap, esc(p.label)), 0, labY, area.w);
      lab.style.color = 'var(--tx)';
      const numY = v === 'gauge' ? cy - area.y + 40 - R * .62 : cy - area.y - 95;
      const num = box(el('div', 'mk-num mk-abs', wrap), 0, numY, area.w);
      const notesTop = v === 'gauge' ? cy - area.y + 80 : v === 'flip' ? cy - area.y + 200 : cy - area.y + R + 34;
      const notesEl = notes.map((s, i) => box(el('div', 'mk-word-sub mk-abs', wrap, rich(s)), 0, notesTop + i * 56, area.w));
      const dec = p.decimals ?? (Number.isInteger(p.value) ? 0 : 1);
      const from = p.from ?? 0, unit = p.unit ? `<small>${esc(p.unit)}</small>` : '';
      const fmt = val => esc(p.prefix || '') + val.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + unit;
      html(num, fmt(p.value)); ctx.measure(() => { fit(num, v === 'flip' ? 240 : v === 'gauge' ? 150 : 180, 80, v === 'ring' ? R * 1.7 : v === 'gauge' ? R * 1.5 : area.w * .8, null); notesEl.forEach(e => fit(e, 42, 26, area.w * .9, null)); });
      const c0 = slot.cues[0] ?? slot.t0 + .3, done = c0 + 1.4;
      const cs = notes.map((_, i) => slot.cues[i + 1] ?? done + .4 + i * 1);
      if (v === 'flip') { S(c0, 'tick', .5); S(c0 + .35, 'tick', .5); S(c0 + .7, 'tick', .5); S(done, 'thud', .8); S(done + .02, 'check', .5); }
      else { S(c0, 'counter', .45, 0, { d: 1.4 }); S(done, 'hit', .85); S(done + .02, 'check', .55); flash(done, .3); shake(done, 8); }
      cs.forEach(c => S(c, 'pop', .4));
      const span = Math.max(Math.abs(p.value), Math.abs(from), 1) * 1.15;
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          enter(lab, t, slot.t0 + .05, 'rise', { dist: 18 });
          const k = EZ.inout(pr(t, c0, done));
          if (v === 'flip') {
            /* 逐位翻入：每位数字从下方翻上来，最后一位最晚 */
            const str = fmt(p.value).replace(/<small>.*<\/small>/, ''), chars = [...str];
            const parts = chars.map((ch, i) => { const s = c0 + i * (1.2 / Math.max(1, chars.length)), q = pr(t, s, s + .35); return `<span style="display:inline-block;transform:translateY(${((1 - EZ.out5(q)) * 60).toFixed(1)}px) rotateX(${((1 - EZ.out5(q)) * 80).toFixed(1)}deg);opacity:${clamp(q * 3).toFixed(2)}">${ch}</span>`; });
            html(num, parts.join('') + unit);
            set(num, { o: t >= c0 - .1 ? 1 : 0, s: 1 + (t >= done ? .08 * (1 - EZ.out5(pr(t, done, done + .35))) : 0) });
          } else {
            html(num, fmt(lerp(from, p.value, k)));
            set(num, { o: pr(t, c0 - .2, c0 + .1), s: 1 + (t >= done ? .12 * (1 - EZ.out5(pr(t, done, done + .35))) : 0) });
          }
          notesEl.forEach((e, i) => enter(e, t, cs[i], 'rise', { dist: 22 }));
        },
        bg(c, t) {
          const P = T().paint, a = pr(t, slot.t0, slot.t0 + .5) * (1 - leave(t, slot)), k = EZ.inout(pr(t, c0, done));
          c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.globalAlpha = a;
          if (v === 'ring') {
            c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 12; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.stroke();
            const g = c.createLinearGradient(cx - R, cy, cx + R, cy); g.addColorStop(0, T().deep); g.addColorStop(1, T().accent);
            c.strokeStyle = g; c.shadowColor = T().accent; c.shadowBlur = 24;
            if (k > 0) { c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); c.stroke(); }
            c.restore();
            const an = -Math.PI / 2 + Math.PI * 2 * k;
            if (k > 0 && k < 1) P.ball(c, cx + Math.cos(an) * R, cy + Math.sin(an) * R, 12, T().aLite, a, { halo: 3 });
            P.arcRing(c, cx, cy, R + 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * EZ.out(pr(t, slot.t0, slot.t0 + .9)), T().w, .55 * a, { step: 11 });
          } else if (v === 'gauge') {
            const gy = cy + 40, a0 = Math.PI, frac = clamp(lerp(from, p.value, k) / span + (from < 0 ? .5 : 0));
            c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 16; c.beginPath(); c.arc(cx, gy, R, a0, 0); c.stroke();
            const g = c.createLinearGradient(cx - R, gy, cx + R, gy); g.addColorStop(0, T().deep); g.addColorStop(1, T().accent);
            c.strokeStyle = g; c.shadowColor = T().accent; c.shadowBlur = 22;
            if (frac > 0) { c.beginPath(); c.arc(cx, gy, R, a0, a0 + Math.PI * frac); c.stroke(); }
            c.shadowBlur = 0; c.strokeStyle = `rgba(${T().w},.9)`; c.lineWidth = 4;
            const an = a0 + Math.PI * frac; c.beginPath(); c.moveTo(cx, gy); c.lineTo(cx + Math.cos(an) * (R - 30), gy + Math.sin(an) * (R - 30)); c.stroke();
            c.restore();
            P.arcRing(c, cx, gy, R + 30, a0, a0 + Math.PI * EZ.out(pr(t, slot.t0, slot.t0 + .9)), T().w, .5 * a, { step: 12, major: 5 });
            P.ball(c, cx, gy, 14, T().w, a, { halo: 2.5 });
          } else {
            c.restore();
            const y = cy + 168, w = Math.min(area.w * .7, 900), x0 = cx - w / 2;
            for (let i = 0; i <= 40; i++) { const on = i / 40 <= k; c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = on ? `rgba(${T().a},${.85 * a})` : `rgba(255,255,255,${.1 * a})`; c.fillRect(x0 + i * w / 40 - 1.5, y - (i % 5 ? 10 : 22), 3, i % 5 ? 10 : 22); c.restore(); }
          }
        },
        fg(c, t) { T().paint.burst(c, t, done, cx, cy, { n: v === 'flip' ? 30 : 60, col: T().w, sp: v === 'flip' ? 600 : 1000 }); },
        hint: { cx, cy },
      };
    },
  });

  /* ---------- quote：金句 ----------
     type   逐字打出（默认）
     reveal 分短语依次浮现，高亮词带下划线扫过
     card   玻璃卡片翻入，整句一次出现，引号从两侧收拢 */
  MK.control('quote', {
    variants: ['type', 'reveal', 'card'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant;
      const wrap = box(el('div', 'mk-abs mk-quote', ctx.root), area.x, area.y, area.w, area.h);
      const panel = v === 'card' ? box(el('div', 'mk-glass', wrap), area.w * .04, area.h * .1, area.w * .92, area.h * .8) : null;
      const mark = box(el('div', 'mark', wrap, '“'), area.w * .01, area.h * .02);
      const mark2 = v === 'card' ? box(el('div', 'mark', wrap, '”'), area.w * .86, area.h * .54) : null;
      const q = box(el('div', 'q mk-abs', wrap), area.w * .1, area.h * (ctx.portrait ? .16 : .24), area.w * .82);
      q.style.textWrap = 'balance';
      const plain = String(p.text).replace(/\*/g, '');
      const phrases = MK.phrases(p.text);
      q.innerHTML = v === 'reveal' ? phrases.map(s => `<span class="ph">${rich(s)}</span>`).join('') : rich(p.text);
      const phEls = v === 'reveal' ? [...q.querySelectorAll('.ph')] : [];
      ctx.measure(() => { q.style.whiteSpace = 'normal'; fit(q, ctx.portrait ? 76 : 84, 44, area.w * .82, area.h * (ctx.portrait ? .6 : .56)); });
      const whoY = area.h * (ctx.portrait ? .8 : .86);
      const who = p.who ? box(el('div', 'who mk-abs', wrap, '— ' + esc(p.who)), area.w * .1, whoY, area.w * .8) : null;
      const c0 = slot.cues[0] ?? slot.t0 + .4;
      const cps = Math.max(8, Math.min(22, plain.length / Math.max(.8, (slot.t1 - c0 - 1.2) * .55)));
      const tEnd = v === 'type' ? c0 + plain.length / cps : v === 'reveal' ? c0 + Math.min(2.4, phrases.length * .55) : c0 + .6;
      const phAt = phrases.map((_, i) => c0 + (tEnd - c0) * i / Math.max(1, phrases.length));
      if (v === 'type') { S(c0 - .2, 'swoosh', .5); S(c0, 'type', .35, 0, { d: Math.min(4, tEnd - c0) }); }
      else if (v === 'reveal') { S(c0 - .2, 'swoosh', .5); phAt.forEach((c, i) => S(c, 'tick', .35, -.3 + i * .15)); }
      else { S(c0 - .1, 'card', .6); S(c0 + .3, 'thud', .5); }
      S(tEnd + .05, 'marker', .5);
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          if (v === 'card') {
            const k = pr(t, c0 - .2, c0 + .5);
            set(panel, { o: clamp(k * 3), s: .92 + .08 * EZ.spring(k) });
            panel.style.transform += ` perspective(1600px) rotateX(${((1 - EZ.out5(k)) * 24).toFixed(2)}deg)`;
            set(q, { o: pr(t, c0 + .1, c0 + .5), y: (1 - EZ.expo(pr(t, c0 + .1, c0 + .6))) * 26 });
            const m = EZ.out5(pr(t, c0 + .2, c0 + .8));
            set(mark, { o: .45 * m, x: (1 - m) * -80 }); set(mark2, { o: .45 * m, x: (1 - m) * 80 });
          } else {
            set(mark, { o: .35 * pr(t, slot.t0, slot.t0 + .5), y: (1 - EZ.expo(pr(t, slot.t0, slot.t0 + .6))) * -30 });
            if (v === 'type') {
              const n = Math.floor(clamp((t - c0) * cps / plain.length) * plain.length + 1e-6);
              const caret = t < tEnd + .6 && Math.floor(t * 3.2) % 2 === 0 ? '<span class="mk-caret">▍</span>' : '';
              html(q, MK.richUpTo(p.text, n) + caret); set(q, { o: t >= c0 - .1 ? 1 : 0 });
            } else {
              set(q, { o: 1 });
              phEls.forEach((e, i) => { const k = pr(t, phAt[i], phAt[i] + .5); e.style.opacity = clamp(k * 2).toFixed(3); e.style.filter = k < 1 ? `blur(${((1 - EZ.out(k)) * 10).toFixed(1)}px)` : ''; });
              q.querySelectorAll('em').forEach(e => { const k = EZ.out(pr(t, tEnd, tEnd + .6)); e.style.backgroundImage = 'linear-gradient(var(--a),var(--a))'; e.style.backgroundRepeat = 'no-repeat'; e.style.backgroundPosition = '0 100%'; e.style.backgroundSize = `${(k * 100).toFixed(1)}% 4px`; });
            }
          }
          if (who) enter(who, t, tEnd + .25, 'rise', { dist: 16 });
        },
        hint: { cx: area.x + area.w * .4, cy: area.y + area.h * .45 },
      };
    },
  });

  /* ---------- stamp：印章 ----------
     stamp  砸下盖章，轻微旋转（默认）
     badge  圆形徽章旋入，外圈刻度转动
     neon   霓虹灯管闪烁点亮 */
  MK.control('stamp', {
    variants: ['stamp', 'badge', 'neon'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant;
      const cx = area.x + area.w / 2, cy = area.y + area.h * (ctx.portrait ? .32 : .45);
      const tone = { warm: '--w', ok: '--ok', bad: '--bad' }[p.tone || 'warm'];
      const toneRGB = { warm: T().w, ok: T().g, bad: T().r }[p.tone || 'warm'];
      const st = el('div', 'mk-stamp mk-abs', ctx.root, esc(p.text));
      st.style.borderColor = st.style.color = `var(${tone})`;
      if (v === 'badge') { st.style.borderRadius = '50%'; st.style.padding = '0'; st.style.display = 'flex'; st.style.alignItems = 'center'; st.style.justifyContent = 'center'; st.style.letterSpacing = '2px'; }
      if (v === 'neon') { st.style.border = '0'; st.style.boxShadow = 'none'; st.style.color = '#fff'; }
      const sub = p.sub ? box(el('div', 'mk-word-sub mk-abs', ctx.root, rich(p.sub)), area.x, cy + (v === 'badge' ? 210 : 140), area.w) : null;
      if (sub) sub.style.textAlign = 'center';
      ctx.measure(() => {
        if (v === 'badge') { const d = Math.max(300, Math.min(380, st.scrollWidth + 80)); st.style.width = st.style.height = d + 'px'; st.style.fontSize = Math.min(132, (d - 80) / Math.max(1, MK.plainLen(p.text)) * 1.05) + 'px'; }
        const r = st.getBoundingClientRect(); st._w = r.width; st._h = r.height; if (sub) fit(sub, 42, 26, area.w * .9, null);
      });
      const c0 = slot.cues[0] ?? slot.t0 + .25;
      if (v === 'badge') { S(c0 - .2, 'whoosh', .5); S(c0 + .2, 'hit', .7); S(c0 + .25, 'shine', .4); }
      else if (v === 'neon') { S(c0, 'glitch', .3); S(c0 + .35, 'check', .5); }
      else { S(c0, 'stamp', 1); flash(c0, .3); shake(c0, 14, .45); }
      if (sub) S(c0 + .6, 'pop', .35);
      return {
        update(t) {
          const out = leave(t, slot), x = pr(t, c0, c0 + .26);
          const pos = { x: cx - (st._w || 0) / 2, y: cy - (st._h || 0) / 2 };
          if (v === 'badge') { const k = pr(t, c0 - .2, c0 + .4); set(st, { ...pos, s: .4 + .6 * EZ.spring(k), r: (1 - EZ.out5(k)) * -200, o: clamp(k * 3) * (1 - out) }); }
          else if (v === 'neon') {
            const k = pr(t, c0, c0 + .45), fi = Math.floor(t * 60), on = k >= 1 || (k > 0 && MK.rnd(fi, 9) > .45);
            set(st, { ...pos, o: (on ? 1 : .15) * clamp(k * 8) * (1 - out) });
            const glow = on ? 1 + .15 * Math.sin(t * 6) : .2;
            st.style.textShadow = `0 0 ${(8 * glow).toFixed(1)}px #fff,0 0 ${(24 * glow).toFixed(1)}px rgba(${toneRGB},.9),0 0 ${(60 * glow).toFixed(1)}px rgba(${toneRGB},.7)`;
          } else set(st, { ...pos, s: 1 + 1.4 * (1 - EZ.out5(x)), r: -7, o: clamp(x * 6) * (1 - out) });
          if (sub) enter(sub, t, c0 + .6, 'rise', { dist: 18, out: slot.t1 - .35 });
        },
        bg(c, t) {
          if (v !== 'badge') return;
          const a = pr(t, c0, c0 + .4) * (1 - leave(t, slot)), R = (st._w || 340) / 2 + 34, rot = t * .4;
          T().paint.arcRing(c, cx, cy, R, rot, rot + Math.PI * 2 * EZ.out(pr(t, c0, c0 + 1)), toneRGB, .55 * a, { step: 12, major: 4 });
        },
        fg(c, t) { if (v !== 'neon') T().paint.burst(c, t, c0 + (v === 'badge' ? .2 : .05), cx, cy, { n: 46, col: toneRGB, sp: 800 }); },
        hint: { cx, cy },
      };
    },
  });

  /* ---------- chapter：章节卡 ----------
     outline 描边大编号 + 名称遮罩上卷（默认）
     center  居中，编号淡入放大，名称两侧光线展开
     wipe    整块色带从左扫过，名称跟在色带后出现 */
  MK.control('chapter', {
    variants: ['outline', 'center', 'wipe'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant;
      const y0 = area.y + area.h * (v === 'center' ? .14 : .06);
      const wrap = box(el('div', 'mk-abs mk-chapter', ctx.root), area.x, y0, area.w);
      if (v === 'center') wrap.style.textAlign = 'center';
      const band = v === 'wipe' ? box(el('div', 'mk-abs', ctx.root), area.x - 40, y0 + 250, area.w + 80, 170) : null;
      if (band) band.style.background = 'linear-gradient(90deg,rgba(var(--a2-rgb),.0),rgba(var(--a2-rgb),.35) 30%,rgba(var(--a-rgb),.15))';
      const no = el('div', 'no', wrap, esc(p.no));
      const nm = el('div', 'nm', wrap, rich(p.name));
      const sub = p.sub ? el('div', 'mk-word-sub', wrap, rich(p.sub)) : null;
      if (sub) sub.style.marginTop = '18px';
      ctx.measure(() => { fit(nm, ctx.portrait ? 110 : 120, 56, area.w, null); wrap._nmBottom = nm.offsetTop + nm.offsetHeight + (sub ? sub.offsetHeight + 18 : 0); wrap._nmMid = nm.offsetTop + nm.offsetHeight / 2; if (band) { band.style.top = (y0 + nm.offsetTop - 20) + 'px'; band.style.height = (nm.offsetHeight + 40) + 'px'; } });
      const c0 = slot.cues[0] ?? slot.t0 + .35;
      if (v === 'wipe') { S(slot.t0 + .1, 'swipe', .6); S(c0, 'thud', .6); }
      else if (v === 'center') { S(slot.t0, 'riser', .3, 0, { d: .4 }); S(c0, 'hit', .6); }
      else { S(slot.t0, 'swoosh', .6); S(c0, 'thud', .7); }
      if (sub) S(c0 + .45, 'tick', .4);
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, x: v === 'center' ? 0 : -EZ.in(out) * 60, blur: out * 8 });
          if (v === 'center') { const k = pr(t, slot.t0, slot.t0 + .6); set(no, { o: clamp(k * 2), s: .7 + .3 * EZ.out5(k) }); enter(nm, t, c0, 'blur'); }
          else if (v === 'wipe') {
            const k = EZ.inout(pr(t, slot.t0 + .1, c0 + .2));
            band.style.clipPath = `inset(0 ${((1 - k) * 100).toFixed(2)}% 0 0)`; set(band, { o: 1 - out });
            enter(no, t, slot.t0, 'rise', { dist: 30 });
            nm.style.clipPath = `inset(0 ${((1 - EZ.out(pr(t, c0 - .1, c0 + .4))) * 100).toFixed(2)}% 0 0)`; set(nm, { o: 1 });
          } else { enter(no, t, slot.t0, 'slide-l', { dist: 80 }); enter(nm, t, c0, 'mask'); }
          if (sub) enter(sub, t, c0 + .45, 'rise', { dist: 16 });
        },
        bg(c, t) {
          const a = pr(t, slot.t0, slot.t0 + .6) * (1 - leave(t, slot));
          if (v === 'center') {
            const y = y0 + (wrap._nmMid || 330), k = EZ.out(pr(t, c0, c0 + .8)), half = area.w * .42 * k, mx = area.x + area.w / 2;
            T().paint.beam(c, mx - 30 - half, y, mx - 30 - half * .35, y, T().a, .6 * a, { w: 2 }); T().paint.beam(c, mx + 30 + half * .35, y, mx + 30 + half, y, T().a, .6 * a, { w: 2 });
          } else if (v === 'outline') {
            const y = y0 + (wrap._nmBottom || 420) + 30;
            T().paint.beam(c, area.x, y, area.x + area.w * .55, y, T().a, .7 * a, { p: EZ.out(pr(t, c0, c0 + .8)) });
          }
        },
        hint: { cx: area.x + area.w * (v === 'center' ? .5 : .3), cy: area.y + area.h * .45 },
      };
    },
  });
})();
