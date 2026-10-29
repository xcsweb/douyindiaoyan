/* motion-kit · 字效类控件（0.3.0）：kinetic / highlight / scramble / rotator / marquee / bigtype
   主流动态排版：逐行冲击排版、重点词手绘标记、乱码解码、轮换词、滚动横幅、巨字遮罩。
   约定见 AUTHORING.md：只由 t 求值，音效在 build 里登记，颜色只取主题。 */
(function () {
  'use strict';
  const { clamp, lerp, pr, EZ, el, box, set, tf, fit, html, rich, esc, S, flash, shake, punch, idle, split, stagger, svg, draw, rnd } = MK;
  const T = () => MK.T;
  const leave = (t, slot) => pr(t, slot.t1 - .35, slot.t1);
  /* cue 缺省：n 个节拍在本段可用时间里均匀错开，单步最长 gap 秒 */
  const beats = (slot, n, start = .25, gap = .9, reserve = 1.4) => stagger(n, slot.t0 + start, Math.min(gap, Math.max(.25, (slot.t1 - slot.t0 - start - reserve) / Math.max(1, n - 1))), slot.cues);

  /* ---------- kinetic：逐行动态排版 ----------
     stack 每行按字数撑满宽度（字少字大），左右交替带倾斜滑入
     beat  一次一行居中砸入，上一行冲出镜头（推镜头）
     wave  逐字波浪弹起，颜色扫过，停留时持续轻微起伏 */
  MK.control('kinetic', {
    variants: ['stack', 'beat', 'wave'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, n = p.lines.length;
      const wrap = box(el('div', 'mk-abs mk-kin', ctx.root), area.x, area.y, area.w, area.h);
      const kick = p.kicker ? box(el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)), 0, 0, area.w) : null;
      if (kick && v !== 'stack') kick.style.textAlign = 'center';
      const top = kick ? 64 : 0;
      const at = beats(slot, n, .25, v === 'beat' ? 1.1 : .75);
      const rows = p.lines.map((s, i) => {
        const r = el('div', 'ln mk-abs' + (i % 2 ? ' alt' : ''), wrap);
        const chars = v === 'wave' ? split(r, s, 'char') : (r.innerHTML = rich(s), []);
        return { r, chars };
      });
      ctx.measure(() => {
        if (v === 'stack') {
          let sizes = rows.map(({ r }) => fit(r, P ? 170 : 160, 40, area.w, null)), hs = rows.map(({ r }) => r.offsetHeight);
          const sum = hs.reduce((a, b) => a + b, 0), avail = area.h - top - 10;
          if (sum > avail) { const k = avail / sum; rows.forEach(({ r }, i) => { r.style.fontSize = Math.floor(sizes[i] * k) + 'px'; }); hs = rows.map(({ r }) => r.offsetHeight); }
          let y = top; rows.forEach(({ r }, i) => { r.style.top = y + 'px'; y += hs[i]; });
          wrap._h = y;
        } else if (v === 'beat') {
          rows.forEach(({ r }) => { r.style.textAlign = 'center'; fit(r, P ? 190 : 200, 56, area.w * .92, null); r.style.left = '0'; r.style.width = area.w + 'px'; r.style.top = (area.h * (P ? .36 : .42) - r.offsetHeight / 2) + 'px'; });
        } else {
          const size = Math.min(...rows.map(({ r }) => { r.style.textAlign = 'center'; return fit(r, P ? 120 : 112, 44, area.w * .94, null); }));
          rows.forEach(({ r }) => { r.style.fontSize = size + 'px'; });
          const lh = rows[0].r.offsetHeight * 1.04, total = lh * n;
          rows.forEach(({ r }, i) => { r.style.left = '0'; r.style.width = area.w + 'px'; r.style.top = (Math.max(top, (area.h - total) / 2 - (P ? area.h * .08 : 0)) + i * lh) + 'px'; });
        }
      });
      if (v === 'stack') at.forEach((c, i) => { S(c - .05, 'whip', .5, i % 2 ? .4 : -.4); S(c + .08, 'thud', .45); });
      else if (v === 'beat') at.forEach((c, i) => { if (i) S(c - .12, 'whoosh', .5); S(c, i === n - 1 ? 'hit' : 'thud', i === n - 1 ? .85 : .6); punch(c, i === n - 1 ? .05 : .03); if (i === n - 1) { flash(c, .3); shake(c, 10); } });
      else { S(at[0] - .1, 'swoosh', .5); at.forEach((c, i) => S(c, 'blip', .35, 0, { n: i * 2 })); S(at[n - 1] + .5, 'shine', .35); }
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10, y: -EZ.in(out) * 18 });
          if (kick) set(kick, { o: pr(t, slot.t0, slot.t0 + .4), y: (1 - EZ.expo(pr(t, slot.t0, slot.t0 + .5))) * 16 });
          rows.forEach(({ r, chars }, i) => {
            const c = at[i];
            if (v === 'stack') {
              const k = pr(t, c - .06, c + .42), side = i % 2 ? 1 : -1;
              tf(r, { o: clamp(k * 4), x: side * (1 - EZ.back(k)) * 260, sx: 1 + (1 - EZ.out5(k)) * .25, r: side * (1 - EZ.out5(k)) * -4, blur: (1 - EZ.out(k)) * 10 });
              r.style.transformOrigin = side > 0 ? '100% 50%' : '0 50%';
              r.classList.toggle('on', t >= c && (i === at.filter(x => t >= x).length - 1));
            } else if (v === 'beat') {
              const k = pr(t, c - .05, c + .4), nx = i < n - 1 ? at[i + 1] : Infinity, g = pr(t, nx - .12, nx + .22);
              tf(r, { o: clamp(k * 4) * (1 - g), s: (.45 + .55 * EZ.back(k)) * (1 + g * 1.6), blur: (1 - EZ.out(k)) * 14 + g * 18 });
            } else {
              chars.forEach((u, j) => {
                const k = pr(t, c + j * .035, c + j * .035 + .5), w = t > at[n - 1] + 1 ? Math.sin(t * 2.6 - j * .45 - i) * 5 : 0;
                tf(u, { o: clamp(k * 3), y: (1 - EZ.back(k)) * 70 + w, r: (1 - EZ.out(k)) * 14 });
                const sw = (t - c - .4) * 22 - j;   /* 颜色扫过：已到达的字由主色回到正文色 */
                u.style.color = sw > 0 && sw < 4 ? 'var(--a)' : '';
              });
            }
          });
        },
        bg(c, t) {
          if (v !== 'beat') return;
          at.forEach((c0, i) => MK.fx.ripple(c, t, c0, area.x + area.w / 2, area.y + area.h * (P ? .36 : .42), { r: area.w * .5, col: i === n - 1 ? T().w : T().a, rings: 2 }));
        },
        fg(c, t) { if (v === 'stack') at.forEach((c0, i) => T().paint.burst(c, t, c0 + .1, area.x + (i % 2 ? area.w * .9 : area.w * .1), area.y + area.h * .4, { n: 16, sp: 500, life: .6, seed: i })); },
        hint: { cx: area.x + area.w * (v === 'stack' ? .35 : .5), cy: area.y + area.h * .45 },
      };
    },
  });

  /* ---------- highlight：重点词标记 ----------
     marker    荧光笔从左到右涂过 *重点*
     circle    手绘圈住 *重点*，线条带过冲
     underline 波浪下划线描出，重点词放大变色
     句子按短语浮现，标记在第二个 cue 落下；停留时标记呼吸发光、周围闪星 */
  MK.control('highlight', {
    variants: ['marker', 'circle', 'underline'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait;
      const wrap = box(el('div', 'mk-abs mk-hl', ctx.root), area.x, area.y, area.w, area.h);
      const kick = p.kicker ? box(el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)), area.w * .06, area.h * (P ? .06 : .12), area.w * .88) : null;
      const q = box(el('div', 'q mk-abs', wrap), area.w * .06, area.h * (P ? .06 : .12) + (kick ? 60 : 0), area.w * .88);
      const phrases = MK.phrases(p.text);
      q.innerHTML = phrases.map(s => `<span class="ph">${rich(s)}</span>`).join('');
      const phEls = [...q.querySelectorAll('.ph')], ems = [...q.querySelectorAll('em')];
      /* 圈/下划线变体要整体缩放重点词：先设成 inline-block 再量位置，否则换行与测量不一致 */
      if (v !== 'marker') ems.forEach(e => { e.style.display = 'inline-block'; });
      MotionHighlightReadability.prepare(q, ems);
      const ink = svg(wrap, area.w, area.h);
      let paths = [], spots = [];
      ctx.measure(() => {
        if (!MotionHighlightReadability.preferred(q, ctx)) fit(q, P ? 88 : 86, 44, area.w * .88, area.h * (P ? .8 : .74) - (kick ? 60 : 0));
        MotionHighlightReadability.measure(q, ems, slot, ctx);
        const wr = wrap.getBoundingClientRect();
        const rects = ems.flatMap(e => [...e.getClientRects()].map(r => ({ x: r.left - wr.left, y: r.top - wr.top, w: r.width, h: r.height })));
        spots = rects;
        let d = '';
        rects.forEach((r, i) => {
          if (v === 'circle') {
            const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rx = r.w / 2 + 22, ry = r.h / 2 + 4, a0 = -2.5 + rnd(i, 61) * .4;
            const pts = Array.from({ length: 72 }, (_, k) => { const a = a0 + k / 71 * Math.PI * 2.16, j = 1 + (rnd(i * 100 + k, 62) - .5) * .03 + k / 71 * .06; return `${(cx + Math.cos(a) * rx * j).toFixed(1)} ${(cy + Math.sin(a) * ry * j).toFixed(1)}`; });
            d += `<path d="M${pts.join(' L')}"/>`;
          } else if (v === 'underline') {
            const y = r.y + r.h * .96, pts = [];
            for (let x = 0; x <= r.w + 12; x += 6) pts.push(`${(r.x - 6 + x).toFixed(1)} ${(y + Math.sin(x / 13) * 6 - x / r.w * 4).toFixed(1)}`);
            d += `<path d="M${pts.join(' L')}"/>`;
          }
        });
        ink.innerHTML = d; paths = [...ink.querySelectorAll('path')];
      });
      const c0 = slot.cues[0] ?? slot.t0 + .25;
      const tEnd = c0 + Math.min(1.8, phrases.length * .4);
      const phAt = phrases.map((_, i) => c0 + (tEnd - c0) * i / Math.max(1, phrases.length));
      const cm = slot.cues[1] ?? Math.min(slot.t1 - 1, tEnd + .5);
      S(c0 - .15, 'swoosh', .45); phAt.forEach((c, i) => S(c, 'tick', .3, -.3 + i * .15));
      if (v === 'circle') { S(cm, 'scratch', .55); S(cm + .45, 'pop', .4); }
      else if (v === 'underline') { S(cm, 'marker', .55); S(cm + .3, 'pop', .45); }
      else { S(cm, 'marker', .7, 0, { d: .5 }); S(cm + .35, 'ding', .25, 0, { m: 91 }); }
      return {
        update(t) {
          const out = MotionHighlightReadability.exit(leave(t, slot), slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          if (kick) set(kick, { o: pr(t, slot.t0, slot.t0 + .4) });
          set(q, { o: 1, y: (1 - EZ.expo(pr(t, c0 - .1, c0 + .6))) * 30 });
          phEls.forEach((e, i) => { const k = pr(t, phAt[i], phAt[i] + .45); e.style.opacity = clamp(k * 2).toFixed(3); e.style.filter = k < 1 ? `blur(${((1 - EZ.out(k)) * 10).toFixed(1)}px)` : ''; });
          const mk = pr(t, cm, cm + (v === 'circle' ? .55 : .45)), breathe = idle(t, cm + .8, 2.6).wave;
          if (v === 'marker') ems.forEach((e, i) => { const k = EZ.inout(clamp(mk * ems.length - i)); e.style.backgroundSize = MotionHighlightReadability.markerBackground((k * 100).toFixed(1)); e.classList.toggle('inked', k > .55); });
          else {
            paths.forEach((pa, i) => { draw(pa, EZ.out(clamp(mk * paths.length - i))); pa.style.filter = t > cm + .8 ? `drop-shadow(0 0 ${(8 + 6 * breathe).toFixed(1)}px rgba(${T().w},.7))` : ''; });
            ems.forEach(e => { const k = EZ.back(pr(t, cm + .2, cm + .6)); e.style.transform = v === 'underline' ? `scale(${(1 + .08 * k).toFixed(3)})` : ''; e.style.color = t >= cm + .2 ? 'var(--w)' : ''; });
          }
        },
        fg(c, t) {
          if (t < cm + .5) return;
          const a = pr(t, cm + .5, cm + 1) * (1 - leave(t, slot));
          spots.forEach((r, i) => MK.fx.twinkle(c, t + i, area.x + r.x - 30, area.y + r.y - 30, r.w + 60, r.h + 60, 5, T().w, a));
        },
        hint: { cx: area.x + area.w * .45, cy: area.y + area.h * .45 },
      };
    },
  });

  /* ---------- scramble：乱码解码 ----------
     decode   乱码逐位锁定成关键词
     matrix   背景字符雨，关键词逐字落下弹定
     terminal 终端窗口输入命令，回车后输出结果 */
  const POOL_L = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&@$<>/\\+=*?';
  const POOL_C = '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所';
  const glyph = (ch, seed) => { if (/\s/.test(ch)) return ch; const pool = /[　-鿿]/.test(ch) ? POOL_C : POOL_L; return pool[Math.floor(rnd(seed, 71) * pool.length)]; };
  MK.control('scramble', {
    variants: ['decode', 'matrix', 'terminal'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait;
      const word = [...String(p.word)], n = word.length;
      const wrap = box(el('div', 'mk-abs mk-scr', ctx.root), area.x, area.y, area.w, area.h);
      const c0 = slot.cues[0] ?? slot.t0 + .25, gap = Math.min(.12, 1.1 / n);
      const lock = word.map((_, i) => c0 + .35 + i * gap), done = lock[n - 1] + .1;
      const cs = slot.cues[1] ?? done + .5;
      const cy = area.h * (P ? .3 : .4);
      let panel = null, cmd = null, outEl = null;
      if (v === 'terminal') {
        const pw = Math.min(area.w, P ? area.w : 1000), ph = P ? 420 : 380;
        panel = box(el('div', 'mk-glass mk-term', wrap, `<div class="tb"><i></i><i></i><i></i><span>${esc(p.kicker || 'terminal')}</span></div><div class="ln"><b>$</b><span class="cmd"></span></div><div class="ln o"></div>`), (area.w - pw) / 2, cy - ph / 2, pw, ph);
        cmd = panel.querySelector('.cmd'); outEl = panel.querySelector('.o');
        outEl.innerHTML = `<span class="ok">${MK.icon('check', 40, 3)}</span><span>${rich(p.sub || '')}</span>`;
      }
      const kick = v !== 'terminal' && p.kicker ? box(el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)), 0, cy - 170, area.w) : null;
      if (kick) kick.style.textAlign = 'center';
      const wEl = v === 'terminal' ? null : box(el('div', 'w mk-abs', wrap), 0, cy - 90, area.w);
      const units = wEl ? word.map(ch => { const u = el('span', 'u', wEl); u.textContent = ch; return u; }) : [];
      const sub = v !== 'terminal' && p.sub ? box(el('div', 'mk-word-sub mk-abs', wrap, rich(p.sub)), 0, cy + 110, area.w) : null;
      if (sub) sub.style.textAlign = 'center';
      ctx.measure(() => {
        if (wEl) { units.forEach(u => { u.style.width = (/[\u3000-\u9fff]/.test(u.textContent) ? 1 : .62) + 'em'; }); const s = fit(wEl, P ? 170 : 180, 64, area.w * .92, null); wEl.style.top = (cy - wEl.offsetHeight / 2) + 'px'; if (sub) sub.style.top = (cy + wEl.offsetHeight / 2 + 30) + 'px'; if (kick) kick.style.top = (cy - wEl.offsetHeight / 2 - 60) + 'px'; units.forEach(u => { u.style.width = (/[　-鿿]/.test(u.textContent) ? 1 : .62) + 'em'; }); wEl._s = s; }
        if (sub) fit(sub, 42, 26, area.w * .9, null);
        if (cmd) { cmd.textContent = p.word; fit(cmd, P ? 72 : 80, 36, panel.offsetWidth - 150, null); cmd.textContent = ''; const ot = outEl.lastChild; ot.style.whiteSpace = 'nowrap'; fit(ot, Math.min(44, parseFloat(cmd.style.fontSize) * .6), 20, panel.offsetWidth - 92 - 58, null); }
      });
      if (v === 'terminal') {
        const tEnd = c0 + n * .09 + .1;
        S(c0 - .2, 'card', .5); S(c0, 'type', .4, 0, { d: tEnd - c0 }); S(tEnd + .25, 'key', .7); S(cs, 'ding', .35, 0, { m: 93 });
        wrap._tEnd = tEnd;
      } else {
        S(c0, 'glitch', .4, 0, { d: lock[n - 1] - c0 + .2 });
        lock.forEach((c, i) => { if (i % Math.ceil(n / 8) === 0) S(c, 'blip', .3, (i / n - .5), { n: i }); });
        S(done, v === 'matrix' ? 'hit' : 'thud', .7); flash(done, .2);
        if (sub) S(cs, 'pop', .4);
      }
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          if (kick) set(kick, { o: pr(t, slot.t0, slot.t0 + .4) });
          if (v === 'terminal') {
            const k = pr(t, c0 - .25, c0 + .25);
            tf(panel, { o: clamp(k * 3), s: .9 + .1 * EZ.back(k), y: (1 - EZ.expo(k)) * 40 });
            const shown = Math.floor(clamp((t - c0) / Math.max(.01, wrap._tEnd - c0)) * n + 1e-6), caret = t < wrap._tEnd + .35 && Math.floor(t * 3.2) % 2 === 0;
            html(cmd, esc(word.slice(0, shown).join('')) + (caret ? '<span class="mk-caret">▍</span>' : ''));
            const ok = pr(t, cs, cs + .4);
            tf(outEl, { o: clamp(ok * 3), x: (1 - EZ.expo(ok)) * -30 });
            const last = t > cs + .4 && Math.floor(t * 2) % 2 === 0;
            outEl.dataset.caret = last ? '1' : '';
            return;
          }
          units.forEach((u, i) => {
            const fi = Math.floor(t * 24), locked = t >= lock[i], live = t >= c0 + i * .02;
            const ch = locked ? word[i] : glyph(word[i], fi * 31 + i);
            if (u.textContent !== ch) u.textContent = ch;
            const k = pr(t, lock[i], lock[i] + .3);
            if (v === 'matrix') { const f = pr(t, c0 + i * gap, lock[i]); tf(u, { o: live ? clamp(f * 4) : 0, y: -(1 - EZ.bounce(f)) * 360 }); }
            else tf(u, { o: live ? (locked ? 1 : .55 + .45 * rnd(fi, i)) : 0, y: locked ? 0 : (rnd(fi, i + 9) - .5) * 10, s: 1 + (1 - EZ.out(k)) * .25 * (locked ? 1 : 0) });
            u.style.color = locked ? (k < 1 ? 'var(--a)' : '') : 'rgba(var(--a-rgb),.7)';
          });
          wEl.style.textShadow = t >= done ? `0 0 ${(30 + 10 * idle(t, done, 3).wave).toFixed(1)}px rgba(${T().a},.55)` : '';
          if (sub) set(sub, { o: pr(t, cs, cs + .35), y: (1 - EZ.expo(pr(t, cs, cs + .5))) * 20 });
        },
        bg(c, t) {
          if (v !== 'matrix') return;
          const a = pr(t, slot.t0, c0 + .2) * (1 - leave(t, slot)) * (t > done ? .45 : 1), sz = 26;
          c.save(); c.globalCompositeOperation = 'lighter'; c.font = `500 ${sz}px 'Geist Mono',monospace`; c.textAlign = 'center';
          for (let x = area.x + 20, i = 0; x < area.x + area.w; x += 38, i++) {
            const sp = 160 + rnd(i, 72) * 260, head = ((t * sp + rnd(i, 73) * 2000) % (area.h + 400)) - 200;
            for (let j = 0; j < 14; j++) {
              const y = area.y + head - j * sz; if (y < area.y - sz || y > area.y + area.h) continue;
              c.fillStyle = j === 0 ? `rgba(255,255,255,${.8 * a})` : `rgba(${T().a},${(1 - j / 14) * .45 * a})`;
              c.fillText(POOL_L[Math.floor(rnd(i * 50 + j + Math.floor(t * 8), 74) * POOL_L.length)], x, y);
            }
          }
          c.restore();
        },
        fg(c, t) { if (v !== 'terminal') T().paint.burst(c, t, done, area.x + area.w / 2, area.y + cy, { n: 36, sp: 700, life: .8 }); },
        hint: { cx: area.x + area.w / 2, cy: area.y + cy },
      };
    },
  });

  /* ---------- rotator：轮换词 ----------
     「固定前半句 + 轮换的词」，每个 cue 换一个词，最后一个词停住并扫光。
     slot 老虎机滚轮（带过冲和动态模糊）/ flip 三维翻牌 / type 删除后重新输入 */
  MK.control('rotator', {
    variants: ['slot', 'flip', 'type'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait, words = p.words, n = words.length;
      const wrap = box(el('div', 'mk-abs mk-rot', ctx.root), area.x, area.y, area.w, area.h);
      const y0 = area.h * (P ? .12 : .2);
      const kick = p.kicker ? box(el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)), 0, y0 - 70, area.w) : null;
      const lead = box(el('div', 'lead mk-abs', wrap, rich(p.lead)), 0, y0, area.w);
      const pill = el('div', 'pill mk-abs', wrap);
      const win = el('div', 'win mk-abs', wrap), reel = el('div', 'reel', win);
      const items = (v === 'type' ? [words[0]] : words).map(s => el('div', 'it', reel, v === 'type' ? esc(s) : rich(s)));
      const tail = p.tail ? box(el('div', 'mk-word-sub mk-abs', wrap, rich(p.tail)), 0, 0, area.w) : null;
      [kick, lead, tail].forEach(e => { if (e) e.style.textAlign = 'center'; });
      let lh = 160, ws = [];
      ctx.measure(() => {
        fit(lead, P ? 96 : 92, 44, area.w * .94, null);
        const longest = words.reduce((a, b) => (MK.plainLen(b) > MK.plainLen(a) ? b : a));
        const plain = x => String(x).replace(/\*/g, '');
        items[0].textContent = plain(longest); const size = fit(items[0], P ? 168 : 160, 56, area.w * .82, null); html(items[0], v === 'type' ? esc(plain(words[0])) : rich(words[0]));
        items.forEach(e => { e.style.fontSize = size + 'px'; });
        lh = items[0].offsetHeight;
        const probe = el('span', 'it', wrap); probe.style.cssText += `position:absolute;visibility:hidden;font-size:${size}px`;
        ws = words.map(s => { probe.textContent = plain(s); return probe.offsetWidth; }); probe.remove();
        const wy = y0 + lead.offsetHeight + 24;
        Object.assign(win.style, { top: wy + 'px', height: lh + 'px', left: '0', width: area.w + 'px' });
        Object.assign(pill.style, { top: (wy - 6) + 'px', height: (lh + 12) + 'px' });
        if (tail) { fit(tail, 46, 26, area.w * .9, null); tail.style.top = (wy + lh + 36) + 'px'; }
        wrap._wy = wy;
      });
      const at = beats(slot, n, .55, 1.1, 1.3);
      const last = at[n - 1];
      S(slot.t0, 'swoosh', .45);
      at.forEach((c, i) => { if (!i) { S(c, 'pop', .5); return; } if (v === 'slot') { S(c - .1, 'counter', .3, 0, { d: .35 }); S(c + .25, 'tick', .5); } else if (v === 'flip') { S(c, 'card', .55); S(c + .2, 'tick', .4); } else { S(c - .4, 'key', .5); S(c - .1, 'type', .35, 0, { d: .35 }); } });
      S(last + .35, 'shine', .4);
      /* 当前词序号（连续值）：每个 cue 向下一个词过渡 */
      const idxAt = t => at.slice(1).reduce((s, c) => s + EZ.back(pr(t, c - .05, c + .4)), 0);
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 10 });
          if (kick) set(kick, { o: pr(t, slot.t0, slot.t0 + .4) });
          set(lead, { o: pr(t, slot.t0, slot.t0 + .4), y: (1 - EZ.expo(pr(t, slot.t0, slot.t0 + .6))) * 30 });
          const k0 = pr(t, at[0] - .1, at[0] + .45), cur = Math.min(n - 1, at.filter(c => t >= c).length - 1);
          const prev = Math.max(0, cur - 1), tk = cur > 0 ? EZ.out5(pr(t, at[cur] - .05, at[cur] + .35)) : 1;
          const pw = lerp(ws[prev] || 0, ws[Math.max(0, cur)] || 0, tk) + 60;
          Object.assign(pill.style, { left: ((area.w - pw) / 2).toFixed(1) + 'px', width: pw.toFixed(1) + 'px' });
          set(pill, { o: clamp(k0 * 3), s: .8 + .2 * EZ.back(k0) });
          set(win, { o: clamp(k0 * 3) });
          if (v === 'slot') {
            const f = idxAt(t), vel = at.slice(1).reduce((s, c) => s + Math.sin(Math.PI * pr(t, c - .05, c + .3)), 0);
            reel.style.transform = `translateY(${(-f * lh).toFixed(2)}px)`;
            reel.style.filter = vel > .05 ? `blur(${(vel * 5).toFixed(1)}px)` : '';
          } else if (v === 'flip') {
            items.forEach((e, i) => {
              const kin = i === 0 ? 1 : pr(t, at[i] - .05, at[i] + .4), kout = i < n - 1 ? pr(t, at[i + 1] - .05, at[i + 1] + .25) : 0;
              Object.assign(e.style, { position: 'absolute', left: '0', right: '0', top: '0', transformOrigin: `50% 50% -${(lh / 2).toFixed(0)}px` });
              tf(e, { p: 900, rx: kout > 0 ? -90 * EZ.in(kout) : (1 - EZ.back(kin)) * 90, o: (kin > 0 ? 1 : 0) * (1 - clamp(kout * 1.4)) });
            });
          } else {
            /* 输入：在 cue 前 0.4 秒删掉上一个词，cue 起打出新词 */
            let s = words[0], caret = false;
            for (let i = 1; i < n; i++) {
              if (t < at[i] - .4) break;
              const del = pr(t, at[i] - .4, at[i] - .05), ty = pr(t, at[i], at[i] + .35);
              const a = [...words[i - 1].replace(/\*/g, '')], b = [...words[i].replace(/\*/g, '')];
              s = ty > 0 ? b.slice(0, Math.ceil(ty * b.length)).join('') : a.slice(0, Math.round((1 - del) * a.length)).join('');
              caret = t < at[i] + .9;
            }
            html(items[0], esc(s) + (caret && Math.floor(t * 3.2) % 2 === 0 ? '<span class="mk-caret">▍</span>' : '<span class="mk-caret" style="opacity:0">▍</span>'));
          }
          const sh = pr(t, last + .3, last + 1.1), k2 = idle(t, last + 1.2, 3.4);
          win.style.setProperty('--sh', `${lerp(130, -30, t < last + 1.2 ? EZ.inout(sh) : EZ.inout(clamp(k2.sweep * 2.5))).toFixed(1)}%`);
          if (tail) set(tail, { o: pr(t, at[0] + .2, at[0] + .6), y: (1 - EZ.expo(pr(t, at[0] + .2, at[0] + .7))) * 18 });
        },
        bg(c, t) {
          const a = 1 - leave(t, slot);
          at.forEach((c0, i) => MK.fx.ripple(c, t, c0 + .1, area.x + area.w / 2, area.y + (wrap._wy || 300) + lh / 2, { r: 260, rings: 1, col: i === n - 1 ? T().w : T().a, w: 2 * a }));
        },
        hint: { cx: area.x + area.w / 2, cy: area.y + area.h * .45 },
      };
    },
  });

  /* ---------- marquee：滚动横幅 ----------
     belt   两条倾斜色带交叉，反向滚动
     ticker 新闻滚动条 + 居中大标题
     wall   满屏多行描边大字左右交替滚动，中间一行实色
     可选 big：在横幅之上砸入一个大词。停留时一直在滚动（不会死屏） */
  MK.control('marquee', {
    variants: ['belt', 'ticker', 'wall'],
    build(slot, p, ctx) {
      const { area, W } = ctx, v = ctx.variant, P = ctx.portrait;
      const seq = p.items.map(s => `<span>${esc(s)}</span><i>✦</i>`).join('');
      const cy = area.y + area.h * (P ? .42 : .48);
      const rowDefs = v === 'belt' ? [{ y: cy - 70, r: -6, dir: -1, cls: 'solid' }, { y: cy + 70, r: 5, dir: 1, cls: 'dark' }]
        : v === 'ticker' ? [{ y: area.y + area.h * (P ? .78 : .82), r: 0, dir: -1, cls: 'tick' }, { y: area.y + area.h * (P ? .86 : .93), r: 0, dir: 1, cls: 'tick2' }]
        : Array.from({ length: P ? 7 : 5 }, (_, i, N = P ? 7 : 5) => ({ y: area.y + area.h * (.08 + .84 * i / (N - 1)), r: 0, dir: i % 2 ? 1 : -1, cls: i === Math.floor(N / 2) ? 'solid-out' : 'out' }));
      const rows = rowDefs.map(d => {
        const r = el('div', 'mk-mq mk-abs ' + d.cls, ctx.root), inner = el('div', 'in', r, seq);
        if (d.cls === 'tick') { const lab = el('div', 'lab', r, `<b></b>${esc(p.kicker || 'LIVE')}`); lab.style.zIndex = 2; }
        return { ...d, r_deg: d.r, r, inner, unit: 600 };
      });
      const big = p.big ? el('div', 'mk-mq-big mk-abs' + (v === 'wall' ? ' plate' : ''), ctx.root, rich(p.big)) : null;
      ctx.measure(() => {
        rows.forEach(row => {
          const bw = W * 1.5; Object.assign(row.r.style, { left: (-W * .25) + 'px', width: bw + 'px' });
          row.unit = row.inner.scrollWidth || 600;
          row.inner.innerHTML = seq.repeat(Math.ceil(bw * 2 / row.unit) + 1);
          row.h = row.r.offsetHeight; row.r.style.top = (row.y - row.h / 2) + 'px';
        });
        if (big) { big.style.textAlign = 'center'; fit(big, P ? 170 : 180, 60, area.w * .9, null); big._w = big.offsetWidth; big._h = big.offsetHeight; }
      });
      const c0 = slot.cues[0] ?? slot.t0 + .1, cb = slot.cues[1] ?? c0 + .9;
      rows.forEach((row, i) => S(c0 + i * .08, i % 2 ? 'swipe' : 'whoosh', .4, row.dir * .5));
      if (big) { S(cb - .05, 'whoosh', .5); S(cb, 'hit', .8); flash(cb, .25); shake(cb, 10); punch(cb, .04); }
      const sp = v === 'wall' ? 120 : v === 'ticker' ? 160 : 210;
      return {
        update(t) {
          const out = leave(t, slot);
          rows.forEach((row, i) => {
            const k = pr(t, c0 + i * .08, c0 + i * .08 + .6);
            /* 循环位移：向左 0 → -unit；向右 -unit → 0 */
            const x = ((t - slot.t0) * sp * (1 + i % 2 * .2)) % row.unit;
            row.inner.style.transform = `translateX(${(row.dir < 0 ? -x : x - row.unit).toFixed(2)}px)`;
            if (v === 'wall') tf(row.r, { o: clamp(k * 3) * (1 - out), x: row.dir * (1 - EZ.out5(k)) * 400 });
            else tf(row.r, { o: clamp(k * 4) * (1 - out), sy: Math.max(.01, EZ.back(k)), blur: out * 8 });
            row.r.style.rotate = `${row.r_deg}deg`;
            if (v === 'wall' && big && row.cls === 'solid-out') row.r.style.opacity = (+row.r.style.opacity * (1 - .8 * pr(t, cb - .1, cb + .3))).toFixed(3);
          });
          if (big) {
            const k = pr(t, cb - .05, cb + .4);
            tf(big, { x: area.x + (area.w - big._w) / 2, y: (v === 'ticker' ? area.y + area.h * (P ? .38 : .4) : cy) - big._h / 2, o: clamp(k * 5) * (1 - out), s: 1 + (1 - EZ.out5(k)) * 1.2, blur: (1 - k) * 10 + out * 10 });
            big.style.textShadow = `0 0 ${(36 + 12 * idle(t, cb + .5, 3).wave).toFixed(1)}px rgba(${T().a},.5),0 8px 40px rgba(0,0,0,.8)`;
          }
        },
        fg(c, t) { if (big) T().paint.burst(c, t, cb, area.x + area.w / 2, v === 'ticker' ? area.y + area.h * .4 : cy, { n: 40, sp: 900 }); },
        hint: { cx: area.x + area.w / 2, cy },
      };
    },
  });

  /* ---------- bigtype：巨字 ----------
     mask    图片/视频透过巨大的字显示，从字里拉远（无素材时为流动渐变）
     outline 描边先画出，再像液体一样从下往上灌满
     split   一道光切过，字上下两半错开，副标题从裂缝中出现 */
  MK.control('bigtype', {
    variants: ['mask', 'outline', 'split'],
    build(slot, p, ctx) {
      const { area } = ctx, v = ctx.variant, P = ctx.portrait;
      const wrap = box(el('div', 'mk-abs mk-big', ctx.root), area.x, area.y, area.w, area.h);
      const cy = area.h * (P ? .34 : .42);
      const kick = p.kicker ? box(el('div', 'mk-kick mk-abs', wrap, esc(p.kicker)), 0, 0, area.w) : null;
      if (kick) kick.style.textAlign = 'center';
      const stage = el('div', 'st mk-abs', wrap);
      let im = null, layers = [];
      if (v === 'mask') {
        if (p.src) { stage.classList.add('media'); im = el('img', '', stage); el('div', 'cut', stage, esc(p.word)); }
        else el('div', 'w grad', stage, esc(p.word));
      } else if (v === 'outline') layers = [el('div', 'w stroke', stage, esc(p.word)), el('div', 'w fill', stage, esc(p.word))];
      else layers = [el('div', 'w top', stage, esc(p.word)), el('div', 'w bot', stage, esc(p.word))];
      const sub = p.sub ? box(el('div', 'mk-word-sub mk-abs', wrap, rich(p.sub)), 0, 0, area.w) : null;
      if (sub) sub.style.textAlign = 'center';
      let bw = 600, bh = 300;
      ctx.measure(() => {
        const probe = stage.querySelector('.w, .cut');
        probe.style.position = 'static'; const size = fit(probe, P ? 330 : 380, 110, area.w * .96, null); probe.style.position = '';
        bw = probe.offsetWidth; bh = probe.offsetHeight;
        stage.querySelectorAll('.w, .cut').forEach(e => { e.style.fontSize = size + 'px'; e.style.width = bw + 'px'; });
        Object.assign(stage.style, { left: ((area.w - bw) / 2) + 'px', top: (cy - bh / 2) + 'px', width: bw + 'px', height: bh + 'px' });
        if (sub) { fit(sub, 46, 26, area.w * .9, null); sub.style.top = (v === 'split' ? cy - sub.offsetHeight / 2 : cy + bh / 2 + 18) + 'px'; }
        /* split：上下两半各移开 gap，裂缝必须容得下副标题 */
        stage._gap = v === 'split' ? Math.max(bh * .22, sub ? sub.offsetHeight / 2 + 26 : 0) : 0;
        if (kick) kick.style.top = (cy - bh / 2 - 50 - stage._gap) + 'px';
      });
      if (im) ctx.mediaOf(im, p, 'src');
      const c0 = slot.cues[0] ?? slot.t0 + .2, cs = slot.cues[1] ?? c0 + (v === 'outline' ? 1.9 : 1.1);
      if (v === 'mask') { S(c0 - .3, 'riser', .35, 0, { d: .4 }); S(c0 + .1, 'boom', .6); punch(c0 + .1, .03); }
      else if (v === 'outline') { S(c0, 'marker', .5, 0, { d: .5 }); S(c0 + .5, 'swell', .4, 0, { d: 1.2 }); S(c0 + 1.75, 'thud', .6); }
      else { S(c0, 'hit', .7); S(cs - .15, 'zap', .55); S(cs + .05, 'crash', .5); flash(cs, .3); shake(cs, 12); }
      if (sub && v !== 'split') S(cs, 'pop', .4);
      return {
        update(t) {
          const out = leave(t, slot);
          set(wrap, { o: 1 - out, blur: out * 12, s: 1 + EZ.in(out) * .05 });
          if (kick) set(kick, { o: v === 'split' ? pr(t, cs + .2, cs + .6) : pr(t, c0 + .4, c0 + .8) });
          const k = pr(t, c0, c0 + .9), hold = idle(t, c0 + 1, 5);
          if (v === 'mask') {
            tf(stage, { o: clamp(k * 3), s: 1 + (1 - EZ.out5(k)) * 2.2, blur: (1 - EZ.out(k)) * 16 });
            if (im) {
              /* 素材只透过字形显示：取当前帧作为文字的背景并裁到字形 */
              ctx.frameAt(im, p, t, 'src');
              const cut = stage.lastChild, z = 118 - 18 * EZ.out(pr(t, c0, slot.t1));
              const url = `url("${im.src}")`; if (cut._u !== url) { cut._u = url; cut.style.backgroundImage = url; }
              cut.style.backgroundSize = `${z.toFixed(2)}% auto`; cut.style.backgroundPosition = `${(50 + Math.sin(t * .3) * 4).toFixed(2)}% 50%`;
            }
            else stage.firstChild.style.backgroundPosition = `${(t * 18 % 200).toFixed(1)}% 50%`;
          } else if (v === 'outline') {
            const [st, fl] = layers, d = pr(t, c0, c0 + .55), lv = EZ.inout(pr(t, c0 + .5, c0 + 1.75));
            set(stage, { o: 1 });
            st.style.clipPath = `inset(0 ${((1 - EZ.out(d)) * 100).toFixed(2)}% 0 0)`;
            const amp = 16 * Math.sin(Math.PI * lv), base = (1 - lv) * bh, pts = [];
            for (let i = 0; i <= 24; i++) { const x = i / 24 * 100; pts.push(`${x.toFixed(1)}% ${(base + Math.sin(i / 24 * Math.PI * 4 + t * 6) * amp).toFixed(1)}px`); }
            fl.style.clipPath = `polygon(${pts.join(',')},100% 100%,0 100%)`;
            fl.style.textShadow = lv >= 1 ? `0 0 ${(30 + 14 * hold.wave).toFixed(1)}px rgba(${T().a},.5)` : '';
          } else {
            const [a, b] = layers, s = EZ.out5(pr(t, cs, cs + .55));
            tf(stage, { o: clamp(k * 4), s: 1 + (1 - EZ.out5(pr(t, c0, c0 + .35))) * .6 });
            const dx = Math.min(area.w * .07, Math.max(12, (area.w - bw) / 2));   /* 横向错开不超出内容区 */
            tf(a, { x: -s * dx, y: -s * stage._gap, r: -s * 2 });
            tf(b, { x: s * dx, y: s * stage._gap, r: -s * 2 });
          }
          if (sub) { const q = pr(t, cs + (v === 'split' ? .15 : 0), cs + .55); set(sub, { o: clamp(q * 2), y: (1 - EZ.expo(q)) * (v === 'split' ? 0 : 20), s: v === 'split' ? .7 + .3 * EZ.back(q) : 1 }); }
        },
        bg(c, t) {
          const a = 1 - leave(t, slot), mx = area.x + area.w / 2, my = area.y + cy;
          if (v === 'split') { const q = pr(t, cs - .2, cs + .1); if (q > 0 && q < 1) T().paint.beam(c, mx - bw * .7, my - 4, mx + bw * .7, my + 4, T().aLite, a, { p: EZ.inout(q), w: 4 }); }
          MK.fx.glow(c, mx, my, Math.max(bw, bh) * .7, T().a, .5 * a * pr(t, c0, c0 + 1));
        },
        fg(c, t) { if (v === 'split') T().paint.burst(c, t, cs, area.x + area.w / 2, area.y + cy, { n: 60, sp: 1100 }); },
        hint: { cx: area.x + area.w / 2, cy: area.y + cy },
      };
    },
  });
})();
