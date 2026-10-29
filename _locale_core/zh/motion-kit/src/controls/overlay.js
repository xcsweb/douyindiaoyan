/* motion-kit · 叠加层控件（0.3.0）：lowerthird / callout / sticker / emoji / progressbar / tag / confetti / frame
   全部写在 timeline.overlays[]，可与正文段及彼此重叠；页面只调用 update 和 fg（fg 画在叠加层专用画布上，不随镜头漂移震动）。
   排版用 ctx.safe，避开 ctx.presenterCard（横屏在右侧、竖屏在下半屏）和底部字幕带；横竖屏各自排版。音效偏轻，不盖过口播。
   lowerthird  人名条      bar 色条推出 / glass 玻璃卡翻入 / line 细线描出
   callout     箭头标注    arrow 手绘箭头 / circle 手绘圈出 / box 四角框选
   sticker     贴纸        pop 白边贴纸砸下 / badge 锯齿圆徽旋入 / burst 漫画爆炸星
   emoji       表情        float 直播点赞飘起 / rain 从上落下弹跳 / burst 中心喷射
   progressbar 章节进度    top 顶部分段条 / bottom 底部胶囊滑块 / dots 节点步进器
   tag         角标        corner 角落叠块 / pill 胶囊组 / ribbon 斜角丝带
   confetti    庆祝        cannons 两侧礼花炮 / rain 彩纸雨 / fireworks 烟花
   frame       画面装饰    viewfinder 取景框 / rec 录制标 + 时间码 / glow 霓虹边框
   约定见 AUTHORING.md：只由 t 求值，音效在 build 里登记，颜色只取主题。 */
(function () {
  'use strict';
  const { clamp, lerp, pr, EZ, el, box, set, tf, fit, rich, esc, S, idle, split, stagger, svg, draw, rnd } = MK;
  const T = () => MK.T;
  const leave = (t, slot) => pr(t, slot.t1 - .35, slot.t1);

  /* ---------- 叠加层公共几何 ----------
     zone = 安全区去掉口播卡（横屏卡在右侧 → 收窄右边；竖屏卡在下半屏 → 收短底边）与底部字幕带 */
  const geo = ctx => {
    const { W, H } = ctx, P = ctx.portrait, s = ctx.safe, pc = ctx.presenterCard;
    const card = pc ? { x: pc.x - pc.w / 2, y: pc.y - pc.h / 2, w: pc.w, h: pc.h, r: pc.r || 24 } : null;
    const capTop = H - (P ? 240 : 200);
    const x0 = s.x, y0 = s.y;
    let x1 = s.x + s.w, y1 = Math.min(s.y + s.h, capTop);
    if (card) { if (P) y1 = Math.min(y1, card.y - 28); else x1 = Math.min(x1, card.x - 30); }
    return { W, H, P, card, capTop, safe: { ...s, r: s.x + s.w, b: s.y + s.h }, zone: { x: x0, y: y0, w: x1 - x0, h: y1 - y0, r: x1, b: y1 } };
  };
  const hitArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  /* 摆放代价：压口播卡、压字幕带、出安全区 */
  const penalty = (g, r) => {
    let k = r.w * r.h - hitArea(r, g.safe) + hitArea(r, { x: 0, y: g.capTop, w: g.W, h: g.H }) * 2;
    if (g.card) k += hitArea(r, { x: g.card.x - 24, y: g.card.y - 24, w: g.card.w + 48, h: g.card.h + 48 }) * 3;
    return k;
  };
  /* 画布：挖掉口播卡（粒子从卡后面经过） */
  const clipCard = (c, g, m = 10) => {
    if (!g.card) return;
    const k = g.card; c.beginPath(); c.rect(0, 0, g.W, g.H); c.roundRect(k.x - m, k.y - m, k.w + 2 * m, k.h + 2 * m, k.r + m); c.clip('evenodd');
  };
  /* DOM 粒子：靠近字幕带、口播卡时淡出 */
  const fadeAt = (g, x, y, m = 40) => {
    let k = 1 - pr(y, g.capTop - 70, g.capTop);
    if (g.card) { const c = g.card, dx = Math.max(c.x - x, 0, x - c.x - c.w), dy = Math.max(c.y - y, 0, y - c.y - c.h); k *= clamp(Math.hypot(dx, dy) / m); }
    return k;
  };
  /* fit 后收回到文字实际宽度（fit 会把宽度撑到上限） */
  const fitw = (e, max, min, w, h) => {
    const s = fit(e, max, min, w, h);
    e.style.width = 'max-content';
    const ww = Math.min(w, Math.ceil(e.getBoundingClientRect().width) + 1);
    e.style.width = ww + 'px';
    return { s, w: ww, h: e.offsetHeight };
  };
  /* 左右遮罩揭开：k 0..1 */
  const reveal = (e, k, fromLeft) => { const r = ((1 - clamp(k)) * 100).toFixed(2); e.style.clipPath = fromLeft ? `inset(-20px ${r}% -20px -20px)` : `inset(-20px -20px -20px ${r}%)`; };
  const tcode = s => { s = Math.max(0, s); const x = Math.floor(s + 1e-6), f = Math.floor(s * 30 + 1e-6) % 30; return [Math.floor(x / 3600), Math.floor(x / 60) % 60, x % 60, f].map(n => String(n).padStart(2, '0')).join(':'); };
  const shine = (e, t, t0, period = 3.2) => e.style.setProperty('--sh', lerp(140, -40, clamp(idle(t, t0, period).sweep * 3)).toFixed(1) + '%');

  /* ---------- lowerthird：人名条 ----------
     bar   左侧色块弹起，主色擦条推出深色名字条，第二个 cue 推出主色头衔条；停留时名字条扫光、色块呼吸
     glass 玻璃卡从边缘三维翻入，头像外圈描出，名字逐字弹起，头衔从左揭开；停留时外圈虚线环转动、在线点闪
     line  一根细线描出，名字从线上方升起、头衔从线下方落下（遮罩）；停留时光点沿线流动
     side=right 时整体镜像贴右；横屏放在口播卡左侧、字幕带之上，竖屏放在口播卡上方 */
  MK.control('lowerthird', {
    variants: ['bar', 'glass', 'line'],
    build(slot, p, ctx) {
      const g = geo(ctx), Z = g.zone, P = g.P, v = ctx.variant, R = p.side === 'right', dir = R ? -1 : 1, t1 = slot.t1;
      const c0 = slot.cues[0] ?? slot.t0 + .15, c1 = slot.cues[1] ?? c0 + .55;
      const wrap = el('div', 'mk-abs mk-lt mk-lt-' + v + (R ? ' r' : ''), ctx.root);
      const kind = p.avatar ? 'av' : p.icon ? 'ic' : null;
      const mkFace = parent => {
        const f = el('div', 'face mk-abs ' + kind, parent);
        if (kind === 'av') { const im = el('img', '', f); ctx.mediaOf(im, p, 'avatar'); f._im = im; } else f.innerHTML = MK.icon(p.icon, 48, 2);
        return f;
      };
      const X = (off, w) => (R ? Z.r - off - w : Z.x + off);
      const pan = R ? .45 : -.45;

      if (v === 'bar') {
        const acc = el('div', 'acc mk-abs', wrap), face = kind ? mkFace(wrap) : null;
        const np = el('div', 'np mk-abs', wrap), nm = el('div', 'nm', np, rich(p.name));
        const tp = p.title ? el('div', 'tp mk-abs', wrap) : null, tt = tp ? el('div', 'tt', tp, rich(p.title)) : null;
        const wp = [el('div', 'wp mk-abs', wrap), tp ? el('div', 'wp mk-abs', wrap) : null];
        const nh = P ? 92 : 86, th = P ? 56 : 52;
        const G = { nx: 0, nw: 1, tx: 0, tw: 1 };
        ctx.measure(() => {
          const H0 = nh + (tp ? th : 0), fw = face ? H0 : 0, maxW = Math.min(Z.w * (P ? 1 : .74), P ? 940 : 820) - 12 - fw;
          const a = fitw(nm, P ? 58 : 54, 26, maxW - 68), b = tt ? fitw(tt, P ? 32 : 30, 16, maxW - 52) : { w: 0 };
          const nw = a.w + 68, tw = b.w + 52, y0 = Z.b - 16 - H0;
          box(acc, X(0, 12), y0, 12, H0);
          if (face) box(face, X(12, fw), y0, fw, fw);
          box(np, X(12 + fw, nw), y0, nw, nh);
          if (tp) box(tp, X(12 + fw, tw), y0 + nh, tw, th);
          Object.assign(G, { nx: X(12 + fw, nw), nw, tx: X(12 + fw, tw), tw });
          wp.forEach((w, i) => w && box(w, 0, y0 + (i ? nh : 0), 22, i ? th : nh));
        });
        S(c0, 'swoosh', .3, pan); S(c0 + .2, 'snap', .22, pan); if (tp) S(c1, 'blip', .18, pan, { n: 4 });
        return {
          update(t) {
            const ka = pr(t, c0, c0 + .34), qa = pr(t, t1 - .16, t1);
            tf(acc, { sy: Math.max(.001, EZ.back(ka) * (1 - EZ.in(qa))), o: ka > 0 && qa < 1 ? 1 : 0 });
            acc.style.boxShadow = `0 0 ${(18 + 12 * idle(t, c1 + .5, 2.4).wave).toFixed(1)}px rgba(var(--a-rgb),.65)`;
            if (face) { const k = pr(t, c0 + .08, c0 + .5), q = pr(t, t1 - .3, t1 - .06); tf(face, { s: Math.max(0, (.3 + .7 * EZ.spring(k)) * (1 - EZ.backIn(q))), r: dir * (1 - EZ.out(k)) * -18, o: clamp(k * 4) }); }
            const kn = EZ.expo(pr(t, c0 + .16, c0 + .62)) * (1 - EZ.inout(pr(t, t1 - .32, t1 - .06)));
            const kt = tp ? EZ.expo(pr(t, c1, c1 + .45)) * (1 - EZ.inout(pr(t, t1 - .38, t1 - .14))) : 0;
            reveal(np, kn, !R); if (tp) reveal(tp, kt, !R);
            tf(nm, { x: -dir * (1 - EZ.out5(pr(t, c0 + .3, c0 + .8))) * 46, o: clamp(pr(t, c0 + .28, c0 + .5) * 2) });
            if (tt) tf(tt, { x: -dir * (1 - EZ.out5(pr(t, c1 + .1, c1 + .55))) * 36, o: clamp(pr(t, c1 + .08, c1 + .3) * 2) });
            /* 擦条骑在揭开的边缘上 */
            [[kn, G.nx, G.nw], [kt, G.tx, G.tw]].forEach(([k, x, w], i) => {
              const e = wp[i]; if (!e) return;
              const edge = R ? x + w - k * w : x + k * w;
              tf(e, { x: R ? edge : edge - 22, o: k > .002 && k < .995 ? 1 : 0, sx: .4 + .6 * Math.sin(Math.PI * k) });
            });
            shine(np, t, c1 + .7, 3.2);
          },
        };
      }

      if (v === 'glass') {
        const card = el('div', 'gc mk-abs', wrap), face = kind ? mkFace(card) : null, D = P ? 112 : 104, pad = P ? 24 : 22;
        const ring = face ? svg(card, D + 40, D + 40, `<circle class="r1" cx="${D / 2 + 20}" cy="${D / 2 + 20}" r="${D / 2 + 7}"/><g class="r2g"><circle class="r2" cx="${D / 2 + 20}" cy="${D / 2 + 20}" r="${D / 2 + 15}"/></g>`, 'ring') : null;
        const r1 = ring && ring.querySelector('.r1'), r2g = ring && ring.querySelector('.r2g');
        const nm = el('div', 'nm mk-abs', card), chars = split(nm, p.name, 'char');
        const tt = p.title ? el('div', 'tt mk-abs', card, `<i></i><span>${rich(p.title)}</span>`) : null, dot = tt && tt.querySelector('i');
        ctx.measure(() => {
          const maxT = Math.min(Z.w * (P ? 1 : .74), P ? 940 : 820) - 2 * pad - (face ? D + 26 : 0) - 8;
          const a = fitw(nm, P ? 52 : 48, 24, maxT), b = tt ? fitw(tt, P ? 30 : 28, 16, maxT) : { w: 0, h: 0 };
          const tw = Math.max(a.w, b.w), th = a.h + (tt ? b.h + 4 : 0), ih = Math.max(face ? D : 0, th);
          const cw = 2 * pad + (face ? D + 26 : 0) + tw + 8, ch = ih + 2 * pad;
          box(card, X(0, cw), Z.b - 16 - ch, cw, ch);
          if (face) { box(face, pad, pad + (ih - D) / 2, D, D); ring.style.left = (pad - 20) + 'px'; ring.style.top = (pad + (ih - D) / 2 - 20) + 'px'; }
          const x1 = pad + (face ? D + 26 : 0), y1 = pad + (ih - th) / 2;
          Object.assign(nm.style, { left: x1 + 'px', top: y1 + 'px' });
          if (tt) Object.assign(tt.style, { left: x1 + 'px', top: (y1 + a.h + 4) + 'px' });
        });
        S(c0, 'swoosh', .28, pan); if (face) S(c0 + .32, 'pop', .26, pan); if (tt) S(c1, 'notif', .2, pan);
        return {
          update(t) {
            const k = pr(t, c0, c0 + .62), q = pr(t, t1 - .35, t1);
            card.style.transformOrigin = R ? '100% 50%' : '0 50%';
            tf(card, { p: 1200, ry: dir * ((1 - EZ.out5(k)) * 80 + EZ.in(q) * 70), x: -dir * (1 - EZ.expo(k)) * 30, s: .92 + .08 * EZ.back(k), o: clamp(k * 4) * (1 - q) });
            if (face) {
              draw(r1, EZ.out(pr(t, c0 + .15, c0 + .75)));
              r2g.setAttribute('transform', `rotate(${((t - slot.t0) * 40 % 360).toFixed(2)} ${D / 2 + 20} ${D / 2 + 20})`);
              r2g.style.opacity = pr(t, c0 + .6, c0 + 1).toFixed(3);
              const kf = pr(t, c0 + .3, c0 + .75); tf(face, { s: .4 + .6 * EZ.spring(kf), o: clamp(kf * 4) });
            }
            chars.forEach((u, j) => { const a = c0 + .3 + j * .03, kk = pr(t, a, a + .42); tf(u, { o: clamp(kk * 3), y: (1 - EZ.back(kk)) * 30 }); });
            if (tt) {
              const k2 = pr(t, c1, c1 + .45); reveal(tt, EZ.expo(k2), !R);
              tf(tt, { x: -dir * (1 - EZ.out5(k2)) * 20, o: clamp(k2 * 3) });
              dot.style.transform = `scale(${(1 + .45 * Math.max(0, Math.sin((t - c1) * 5))).toFixed(3)})`;
            }
            shine(card, t, c1 + .8, 3.4);
          },
        };
      }

      /* line */
      const ln = el('div', 'ln mk-abs', wrap), hd = el('div', 'hd mk-abs', wrap);
      const m1 = el('div', 'mask mk-abs', wrap), nm = el('div', 'nm', m1, rich(p.name));
      const m2 = p.title ? el('div', 'mask mk-abs', wrap) : null, tt = m2 ? el('div', 'tt', m2, rich(p.title)) : null;
      const face = kind ? mkFace(wrap) : null, D = P ? 92 : 86;
      const ring = face ? svg(wrap, D + 20, D + 20, `<circle cx="${D / 2 + 10}" cy="${D / 2 + 10}" r="${D / 2 + 5}"/>`, 'ring') : null, rc = ring && ring.firstChild;
      const G = { lx: 0, lw: 1, nh: 50, th: 30 };
      ctx.measure(() => {
        const off = face ? D + 26 : 0, maxT = Math.min(Z.w * (P ? 1 : .74), P ? 940 : 820) - off - 40;
        const a = fitw(nm, P ? 60 : 56, 26, maxT), b = tt ? fitw(tt, P ? 30 : 28, 16, maxT) : { w: 0, h: 0 };
        const lw = off + Math.max(a.w, b.w) + 40, ly = Z.b - 16 - (tt ? b.h + 16 : 8);
        box(ln, X(0, lw), ly - 1.5, lw, 3);
        box(m1, X(off, a.w + 4), ly - 10 - a.h, a.w + 4, a.h);
        if (m2) box(m2, X(off, b.w + 4), ly + 12, b.w + 4, b.h);
        if (face) { box(face, X(0, D) + (R ? 0 : 0), ly - D / 2, D, D); ring.style.left = (X(0, D) - 10) + 'px'; ring.style.top = (ly - D / 2 - 10) + 'px'; }
        box(hd, 0, ly - 7, 14, 14);
        Object.assign(G, { lx: X(0, lw), lw, nh: a.h, th: b.h });
      });
      S(c0, 'swoosh', .24, pan); S(c0 + .3, 'blip', .18, pan, { n: 2 }); if (tt) S(c1, 'blip', .16, pan, { n: 6 });
      return {
        update(t) {
          const kl = EZ.expo(pr(t, c0, c0 + .55)), ql = EZ.inout(pr(t, t1 - .32, t1 - .02)), exiting = t > t1 - .32;
          ln.style.transformOrigin = (exiting ? R : !R) ? '0 50%' : '100% 50%';
          tf(ln, { sx: Math.max(.001, kl * (1 - ql)), o: kl > 0 && ql < 1 ? 1 : 0 });
          shine(ln, t, c1 + .6, 2.6);
          /* 线头光点：描线时在前端，收线时在远端 */
          const far = R ? G.lx : G.lx + G.lw, near = R ? G.lx + G.lw : G.lx;
          const hx = exiting ? lerp(near, far, ql) : lerp(near, far, kl);
          const br = 1 + .35 * Math.max(0, idle(t, c0 + .8, 1.6).wave);
          tf(hd, { x: hx - 7, s: br, o: (kl > .01 ? 1 : 0) * (1 - ql) });
          const ny = 1 - EZ.out5(pr(t, c0 + .25, c0 + .72)) + EZ.in(pr(t, t1 - .42, t1 - .14));
          tf(nm, { y: ny * (G.nh + 8), blur: ny * 4 });
          if (tt) { const ty = 1 - EZ.out5(pr(t, c1, c1 + .45)) + EZ.in(pr(t, t1 - .45, t1 - .18)); tf(tt, { y: -ty * (G.th + 8) }); }
          if (face) {
            draw(rc, EZ.out(pr(t, c0 + .08, c0 + .6)) * (1 - pr(t, t1 - .3, t1)));
            const kf = pr(t, c0 + .25, c0 + .65); tf(face, { s: (.4 + .6 * EZ.spring(kf)) * (1 - EZ.in(pr(t, t1 - .3, t1 - .05))), o: clamp(kf * 4) });
          }
        },
      };
    },
  });

  /* ---------- callout：箭头标注 ----------
     x/y 是目标点（画面比例）。标签自动选一个不压口播卡、不压字幕、不盖住目标的方位。
     arrow  手绘弯箭头从标签描向目标，箭头落下时目标亮点 + 波纹，标签弹出；停留时箭头轻点目标、波纹循环
     circle 手绘椭圆圈住目标（过冲一圈），引线连到标签；停留时圈线呼吸发光、周围闪星
     box    四个角从外飞入框住目标，虚线框流动（行军蚁），标签像页签贴在框边；p.w / p.h 控制框大小 */
  MK.control('callout', {
    variants: ['arrow', 'circle', 'box'],
    build(slot, p, ctx) {
      const g = geo(ctx), { W, H, P } = g, v = ctx.variant, t1 = slot.t1;
      const tx = clamp(p.x) * W, ty = clamp(p.y) * H;
      const c0 = slot.cues[0] ?? slot.t0 + .12, c1 = slot.cues[1] ?? c0 + (v === 'arrow' ? .55 : .7);
      const ink = svg(ctx.root, W, H, '', 'mk-co-ink');
      const lab = el('div', 'mk-abs mk-co-lab' + (v === 'box' ? ' tab' : ''), ctx.root), txt = el('span', '', lab, rich(p.text));
      const bw = v === 'box' ? (p.w ?? (P ? .36 : .18)) * W : 0, bh = v === 'box' ? (p.h ?? (P ? .13 : .2)) * H : 0;
      const B = { x: tx - bw / 2, y: ty - bh / 2, w: bw, h: bh }, E = { rx: P ? 118 : 104, ry: P ? 74 : 66 };
      let L = { x: 0, y: 0, w: 10, h: 10 }, dirv = [1, 0], els = {}, labTop = true;
      ctx.measure(() => {
        const f = fitw(txt, P ? 44 : 40, 22, Math.min(g.zone.w * .64, P ? 760 : 620));
        const lw = f.w + (P ? 48 : 44), lh = f.h + (P ? 24 : 22);
        box(lab, 0, 0, lw, lh);
        const keep = { x: tx - 80, y: ty - 80, w: 160, h: 160 };
        let cands;
        if (v === 'box') cands = [[B.x, B.y - lh - 10, 1], [B.x, B.y + B.h + 10, 0], [B.x + B.w - lw, B.y - lh - 10, 1], [B.x + B.w - lw, B.y + B.h + 10, 0]];
        else { const D = v === 'circle' ? (P ? 240 : 250) : (P ? 290 : 300); cands = [-140, -40, 140, 40, 180, 0, -90, 90].map(a => { const r = a * Math.PI / 180; return [tx + Math.cos(r) * D * 1.15 - lw / 2, ty + Math.sin(r) * D * .8 - lh / 2, a]; }); }
        const S0 = g.safe;
        cands = cands.map(([x, y, k]) => [clamp(x, S0.x, S0.r - lw), clamp(y, S0.y, S0.b - lh), k]);
        let best = cands[0], bs = Infinity;
        cands.forEach((c, i) => { const r = { x: c[0], y: c[1], w: lw, h: lh }; const s = penalty(g, r) * 10 + hitArea(r, keep) * 20 + (v === 'box' ? hitArea(r, B) * 20 : 0) + i; if (s < bs) { bs = s; best = c; } });
        L = { x: best[0], y: best[1], w: lw, h: lh }; labTop = !!best[2];
        lab.style.left = L.x + 'px'; lab.style.top = L.y + 'px';
        const lc = [L.x + lw / 2, L.y + lh / 2];
        /* 标签边上朝向目标的点 */
        const edgeToward = (px, py, m = 12) => { const dx = px - lc[0], dy = py - lc[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d; const s = Math.min(Math.abs(ux) > 1e-6 ? (lw / 2 + m) / Math.abs(ux) : 1e9, Math.abs(uy) > 1e-6 ? (lh / 2 + m) / Math.abs(uy) : 1e9); return [lc[0] + ux * s, lc[1] + uy * s, ux, uy]; };
        if (v === 'arrow') {
          const [ax, ay, ux, uy] = edgeToward(tx, ty), gap = P ? 40 : 36, ex = tx - ux * gap, ey = ty - uy * gap;
          const len = Math.hypot(ex - ax, ey - ay), sg = ux >= 0 ? -1 : 1, cx = (ax + ex) / 2 - uy * len * .28 * sg, cy = (ay + ey) / 2 + ux * len * .28 * sg;
          const pts = Array.from({ length: 33 }, (_, i) => { const q = i / 32, a = (1 - q) * (1 - q), b = 2 * q * (1 - q), c = q * q, j = i && i < 32 ? (rnd(i, 81) - .5) * 2.6 : 0; return `${(a * ax + b * cx + c * ex + j).toFixed(1)} ${(a * ay + b * cy + c * ey + j).toFixed(1)}`; });
          const hl = Math.hypot(ex - cx, ey - cy) || 1, hx = (ex - cx) / hl, hy = (ey - cy) / hl, hs = P ? 34 : 30;
          const rot = a => [-hx * Math.cos(a) + hy * Math.sin(a), -hx * Math.sin(a) - hy * Math.cos(a)];
          const h1 = rot(.5), h2 = rot(-.5);
          ink.innerHTML = `<g class="g"><path class="ar" d="M${pts.join(' L')}"/><path class="hd" d="M${(ex + h1[0] * hs).toFixed(1)} ${(ey + h1[1] * hs).toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)} L${(ex + h2[0] * hs).toFixed(1)} ${(ey + h2[1] * hs).toFixed(1)}"/></g><circle class="tg" cx="${tx}" cy="${ty}" r="20"/>`;
          dirv = [hx, hy];
          lab.style.transformOrigin = `${(ax - L.x).toFixed(1)}px ${(ay - L.y).toFixed(1)}px`;
        } else if (v === 'circle') {
          const a0 = -2.4 + rnd(3, 61) * .4;
          const pts = Array.from({ length: 80 }, (_, k) => { const a = a0 + k / 79 * Math.PI * 2.14, j = 1 + (rnd(k, 62) - .5) * .035 + k / 79 * .07; return `${(tx + Math.cos(a) * E.rx * j).toFixed(1)} ${(ty + Math.sin(a) * E.ry * j).toFixed(1)}`; });
          const [ax, ay] = edgeToward(tx, ty, 8), ph = Math.atan2((ay - ty) / E.ry, (ax - tx) / E.rx), px = tx + Math.cos(ph) * E.rx * 1.08, py = ty + Math.sin(ph) * E.ry * 1.08;
          ink.innerHTML = `<g class="g"><path class="ar" d="M${pts.join(' L')}"/><path class="ld" d="M${px.toFixed(1)} ${py.toFixed(1)} L${ax.toFixed(1)} ${ay.toFixed(1)}"/></g>`;
          lab.style.transformOrigin = `${(ax - L.x).toFixed(1)}px ${(ay - L.y).toFixed(1)}px`;
        } else {
          const a = Math.min(B.w, B.h) * .24, { x, y, w, h } = B;
          const cs = [[x, y, `M${x} ${y + a} L${x} ${y} L${x + a} ${y}`, -1, -1], [x + w, y, `M${x + w - a} ${y} L${x + w} ${y} L${x + w} ${y + a}`, 1, -1], [x + w, y + h, `M${x + w} ${y + h - a} L${x + w} ${y + h} L${x + w - a} ${y + h}`, 1, 1], [x, y + h, `M${x + a} ${y + h} L${x} ${y + h} L${x} ${y + h - a}`, -1, 1]];
          ink.innerHTML = `<rect class="fl" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/><rect class="ants" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>` + cs.map(c => `<g class="cn" data-dx="${c[3]}" data-dy="${c[4]}"><path d="${c[2]}"/></g>`).join('');
          lab.style.transformOrigin = labTop ? '50% 100%' : '50% 0';
        }
        els = { g: ink.querySelector('.g'), ar: ink.querySelector('.ar'), hd: ink.querySelector('.hd'), ld: ink.querySelector('.ld'), tg: ink.querySelector('.tg'), fl: ink.querySelector('.fl'), ants: ink.querySelector('.ants'), cn: [...ink.querySelectorAll('.cn')] };
      });
      if (v === 'arrow') { S(c0, 'swoosh', .24); S(c0 + .45, 'snap', .24); }
      else if (v === 'circle') { S(c0, 'swoosh', .22); S(c0 + .5, 'blip', .18, 0, { n: 3 }); }
      else { S(c0, 'snap', .22); S(c0 + .32, 'blip', .18, 0, { n: 5 }); }
      S(c1, v === 'box' ? 'notif' : 'pop', .28);
      return {
        update(t) {
          const out = leave(t, slot);
          set(ink, { o: 1 - out });
          if (v === 'arrow') {
            draw(els.ar, EZ.inout(pr(t, c0, c0 + .45))); draw(els.hd, EZ.out(pr(t, c0 + .4, c0 + .56))); draw(els.tg, EZ.out(pr(t, c0 + .45, c0 + .85)));
            const w = Math.sin(Math.max(0, t - c1 - .5) * 5.4) * 6 * pr(t, c1 + .5, c1 + .8);
            els.g.setAttribute('transform', `translate(${(dirv[0] * w).toFixed(2)} ${(dirv[1] * w).toFixed(2)})`);
          } else if (v === 'circle') {
            draw(els.ar, EZ.out(pr(t, c0, c0 + .58))); draw(els.ld, EZ.out(pr(t, c0 + .5, c0 + .72)));
            els.g.style.filter = t > c0 + .7 ? `drop-shadow(0 0 ${(6 + 6 * idle(t, c0 + .7, 2).wave).toFixed(1)}px rgba(${T().w},.8))` : '';
          } else {
            els.cn.forEach((e, i) => {
              const k = pr(t, c0 + i * .05, c0 + i * .05 + .42), d = (1 - EZ.back(k)) * 90 + 5 * idle(t, c0 + .9, 1.8).wave * pr(t, c0 + .8, c0 + 1.1);
              e.setAttribute('transform', `translate(${(+e.dataset.dx * d).toFixed(2)} ${(+e.dataset.dy * d).toFixed(2)})`); e.style.opacity = clamp(k * 3).toFixed(3);
            });
            const ka = pr(t, c0 + .32, c0 + .55);
            els.ants.style.opacity = ka.toFixed(3); els.ants.style.strokeDashoffset = (-(t - slot.t0) * 36).toFixed(1);
            els.fl.style.opacity = (ka * (.18 + .5 * (1 - pr(t, c0 + .4, c0 + 1)))).toFixed(3);
          }
          const kl = pr(t, c1, c1 + .5), bob = Math.sin(Math.max(0, t - c1 - .5) * 2.2) * 2.5;
          if (v === 'box') tf(lab, { sy: Math.max(.01, EZ.back(kl)), o: clamp(kl * 4) * (1 - out), blur: out * 6 });
          else tf(lab, { s: .2 + .8 * EZ.spring(kl), r: (1 - EZ.out(kl)) * -8, y: bob, o: clamp(kl * 4) * (1 - out), blur: out * 6 });
        },
        fg(c, t) {
          const a = 1 - leave(t, slot); if (a <= .002) return;
          c.save(); clipCard(c, g);
          if (v === 'box') { if (t > c1) MK.fx.twinkle(c, t, B.x - 30, B.y - 30, B.w + 60, B.h + 60, 6, T().w, a * pr(t, c1, c1 + .5)); }
          else {
            const k = pr(t, c0 + (v === 'arrow' ? .45 : .5), c0 + .75);
            MK.fx.glow(c, tx, ty, 80, T().w, k * a);
            c.fillStyle = `rgba(${T().w},${(k * a).toFixed(3)})`; c.beginPath(); c.arc(tx, ty, 7 * EZ.back(k), 0, 7); c.fill();
            if (v === 'arrow') for (let j = 0; j < 12; j++) { const r0 = c0 + .5 + j * 1.5; if (r0 > t1) break; MK.fx.ripple(c, t, r0, tx, ty, { r: 90, r0: 12, col: T().w, rings: 2, life: 1 }); }
            else if (t > c0 + .6) MK.fx.twinkle(c, t, tx - E.rx - 40, ty - E.ry - 40, E.rx * 2 + 80, E.ry * 2 + 80, 7, T().w, a * pr(t, c0 + .6, c0 + 1));
          }
          c.restore();
        },
      };
    },
  });

  /* ---------- sticker：贴纸 ----------
     pop   白边贴纸从镜头前砸下（压扁回弹 + 落地火花），第二个 cue 摇摆一下；停留时轻飘、扫光
     badge 锯齿圆徽旋转着弹入，外圈一直慢转，第二个 cue 盖章式放大；停留时扫光
     burst 漫画爆炸星弹性炸开 + 速度线，边缘以 8 帧/秒「沸腾」抖动，第二个 cue 再炸一次
     x/y 指定中心（画面比例），会被收进可用区，不压口播卡与字幕 */
  MK.control('sticker', {
    variants: ['pop', 'badge', 'burst'],
    build(slot, p, ctx) {
      const g = geo(ctx), Z = g.zone, { W, H, P } = g, v = ctx.variant, t1 = slot.t1;
      const c0 = slot.cues[0] ?? slot.t0 + .1, c1 = slot.cues[1] ?? Math.min(t1 - .9, c0 + 1.2);
      const rot = p.rot ?? (v === 'pop' ? -7 : v === 'badge' ? 8 : -5);
      const icn = p.icon || (p.text ? null : 'star');
      const st = el('div', 'mk-abs mk-st mk-st-' + v, ctx.root);
      const body = `${icn ? MK.icon(icn, 48, v === 'pop' ? 2.6 : 2.4) : ''}${p.text ? `<span>${rich(p.text)}</span>` : ''}`;
      let cx = 0, cy = 0, sw = 200, sh = 120;
      const place = () => {
        const m = 16 + .14 * Math.max(sw, sh), dx = p.x != null ? p.x * W : Z.x + Z.w * (P ? .74 : .8), dy = p.y != null ? p.y * H : Z.y + Z.h * (P ? .16 : .2);
        cx = Z.w > sw + 2 * m ? clamp(dx, Z.x + sw / 2 + m, Z.r - sw / 2 - m) : Z.x + Z.w / 2;
        cy = Z.h > sh + 2 * m ? clamp(dy, Z.y + sh / 2 + m, Z.b - sh / 2 - m) : Z.y + Z.h / 2;
        box(st, cx - sw / 2, cy - sh / 2, sw, sh);
      };
      let parts = {};
      if (v === 'pop') {
        const inn = el('div', 'in', st, body);
        ctx.measure(() => { const f = fitw(inn, P ? 66 : 62, 26, Math.min(Z.w * .56, P ? 640 : 560)); sw = f.w; sh = f.h; place(); });
        parts = { inn };
        S(c0 + .2, 'snap', .26); S(c0 + .24, 'pop', .3); S(c1, 'bubble', .2, 0, { n: 3 });
      } else if (v === 'badge') {
        const D = P ? 270 : 250, R0 = D / 2 - 4, N = 30;
        const pts = Array.from({ length: N * 2 }, (_, i) => { const a = i * Math.PI / N, r = i % 2 ? R0 * .9 : R0; return `${(D / 2 + Math.cos(a) * r).toFixed(1)},${(D / 2 + Math.sin(a) * r).toFixed(1)}`; }).join(' ');
        const seal = svg(st, D, D, `<polygon points="${pts}"/><circle cx="${D / 2}" cy="${D / 2}" r="${(R0 * .76).toFixed(1)}"/>`, 'seal');
        const gl = el('div', 'gl mk-abs', st), ct = el('div', 'ct mk-abs', st, body), sp = ct.querySelector('span');
        sw = sh = D;
        ctx.measure(() => { box(gl, D * .1, D * .1, D * .8, D * .8); box(ct, D * .15, D * .15, D * .7, D * .7); if (sp) fit(sp, P ? 54 : 50, 18, D * .6, icn ? D * .27 : D * .44); place(); });
        parts = { seal, gl };
        S(c0, 'swoosh', .22); S(c0 + .45, 'ding', .22, 0, { m: 93 }); S(c1, 'pop', .24);
      } else {
        const BW = P ? 340 : 320, BH = Math.round(BW * .8);
        const sv = svg(st, BW, BH, '<polygon class="o"/><polygon class="i"/>', 'boom');
        const tx = el('div', 'tx mk-abs', st, body), sp = tx.querySelector('span');
        sw = BW; sh = BH;
        ctx.measure(() => { box(tx, BW * .17, BH * .2, BW * .66, BH * .6); if (sp) fit(sp, P ? 64 : 60, 20, BW * .6, icn ? BH * .3 : BH * .46); place(); });
        const star = (seed, sc) => Array.from({ length: 28 }, (_, j) => { const a = j * Math.PI / 14 + (rnd(j, 90 + seed) - .5) * .2, r = (j % 2 ? .6 + .1 * rnd(j, 91 + seed) : .9 + .1 * rnd(j, 92 + seed)) * sc; return `${(BW / 2 + Math.cos(a) * r * BW / 2).toFixed(1)},${(BH / 2 + Math.sin(a) * r * BH / 2).toFixed(1)}`; }).join(' ');
        parts = { po: sv.querySelector('.o'), pi: sv.querySelector('.i'), star, last: '' };
        S(c0, 'pop', .34); S(c0 + .06, 'snap', .2); S(c1, 'pop', .28);
      }
      return {
        update(t) {
          const out = leave(t, slot), u = Math.max(0, t - c0 - .9), xs = Math.max(0, 1 - EZ.backIn(out));
          if (v === 'pop') {
            const k = pr(t, c0 - .02, c0 + .24), q = pr(t, c0 + .24, c0 + .9), w2 = pr(t, c1, c1 + .8);
            const sq = q > 0 ? 1 - EZ.spring(q) : 0, wig = w2 > 0 && w2 < 1 ? Math.sin(w2 * Math.PI * 5) * 10 * (1 - w2) : 0;
            const s = lerp(2.6, 1, EZ.in(k)) * (1 + .1 * Math.sin(Math.PI * w2)) * xs;
            tf(st, { sx: s * (1 + .2 * sq), sy: s * (1 - .2 * sq), r: rot + (1 - k) * 18 + Math.sin(u * 1.4) * 2.2 + wig, y: Math.sin(u * 1.9) * 4, o: clamp(k * 4) });
            const lift = (1 - k) * 40 + 4 * Math.sin(Math.PI * w2);
            st.style.filter = `drop-shadow(0 ${(8 + lift).toFixed(1)}px ${(14 + lift).toFixed(1)}px rgba(0,0,0,.55))`;
            shine(parts.inn, t, c0 + .9, 2.8);
          } else if (v === 'badge') {
            const k = pr(t, c0, c0 + .6), pz = Math.sin(Math.PI * pr(t, c1, c1 + .35));
            tf(st, { s: (.15 + .85 * EZ.back(k)) * (1 + .12 * pz) * xs, r: rot - (1 - EZ.out5(k)) * 200, y: Math.sin(u * 1.6) * 3, o: clamp(k * 4) });
            parts.seal.style.transform = `rotate(${((t - slot.t0) * 14).toFixed(2)}deg)`;
            st.style.filter = `drop-shadow(0 10px 18px rgba(0,0,0,.5)) drop-shadow(0 0 ${(14 + 8 * idle(t, c0 + .9, 2.2).wave).toFixed(1)}px rgba(var(--w-rgb),.35))`;
            shine(parts.gl, t, c0 + .9, 2.8);
          } else {
            const k = pr(t, c0, c0 + .55), b2 = Math.sin(Math.PI * pr(t, c1, c1 + .4)), kt = pr(t, c0 + .12, c0 + .5);
            tf(st, { s: Math.max(0, EZ.elastic(k)) * (1 + .12 * b2) * xs, r: rot + (1 - EZ.out(k)) * -25 + Math.sin(u * 2.2) * 1.5, o: clamp(k * 5) });
            const seed = t < c0 + .55 ? 0 : Math.floor(t * 8), sc = 1 + .18 * b2, key = seed + ':' + sc.toFixed(3);
            if (key !== parts.last) { parts.last = key; parts.po.setAttribute('points', parts.star(seed, sc)); parts.pi.setAttribute('points', parts.star(seed + 37, sc * .8)); }
            tf(st.querySelector('.tx'), { s: .2 + .8 * EZ.back(kt), o: clamp(kt * 4), r: -4 });
            st.style.filter = 'drop-shadow(0 12px 20px rgba(0,0,0,.5))';
          }
        },
        fg(c, t) {
          const a = 1 - leave(t, slot); if (a <= .002) return;
          c.save(); clipCard(c, g);
          if (v === 'pop') { T().paint.burst(c, t, c0 + .24, cx, cy + sh * .3, { n: 18, sp: 520, life: .6, col: T().w }); MK.fx.twinkle(c, t, cx - sw / 2 - 40, cy - sh / 2 - 40, sw + 80, sh + 80, 6, T().w, a * pr(t, c0 + .3, c0 + .7)); }
          else if (v === 'badge') { MK.fx.ripple(c, t, c0 + .45, cx, cy, { r: sw * .5, r0: sw * .45, col: T().w, rings: 2 }); MK.fx.ripple(c, t, c1, cx, cy, { r: sw * .4, r0: sw * .48, col: T().w, rings: 1 }); }
          else {
            for (const t0 of [c0, c1]) {
              const lt = t - t0; if (lt < 0 || lt > .5) continue;
              const q = lt / .5; c.lineCap = 'round';
              for (let i = 0; i < 22; i++) {
                const an = i / 22 * Math.PI * 2 + rnd(i, 93) * .2, r0 = sw * .5 + EZ.out(q) * 140, r1 = r0 + 40 + 60 * rnd(i, 94);
                c.strokeStyle = `rgba(${T().w},${((1 - q) * a).toFixed(3)})`; c.lineWidth = 3;
                c.beginPath(); c.moveTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0 * .8); c.lineTo(cx + Math.cos(an) * r1, cy + Math.sin(an) * r1 * .8); c.stroke();
              }
            }
          }
          c.restore();
        },
      };
    },
  });

  /* ---------- emoji：表情雨 / 飘赞 ----------
     icon 名字画成彩色圆泡里的白色图标；text 填 1–2 个 emoji 字符则直接用表情字形。n 为数量。
     float 从右侧（口播卡外侧）一串串往上飘，左右摇摆、弹出后缩小淡出，像直播点赞
     rain  从顶上落下，落地弹跳几下停住再消失（竖屏口播卡模式时落在卡片上沿）
     burst 中心先弹出一个大表情，随后分 1–3 波向四周喷射，大表情跟着每波心跳
     粒子靠近口播卡、字幕带时淡出 */
  MK.control('emoji', {
    variants: ['float', 'rain', 'burst'],
    build(slot, p, ctx) {
      const g = geo(ctx), Z = g.zone, { W, H, P, card } = g, v = ctx.variant, t1 = slot.t1, dur = t1 - slot.t0;
      const n = Math.round(clamp(p.n ?? (v === 'float' ? 16 : v === 'rain' ? 22 : 24), 3, 40));
      const c0 = slot.cues[0] ?? slot.t0 + .1;
      const ic = p.icon || 'heart', glyph = p.text ? esc(p.text) : null;
      const base = P ? 76 : 66;
      const hue = ['heart', 'fire'].includes(ic) ? 'var(--bad)' : ['like', 'star', 'sparkle', 'trophy', 'crown', 'gift', 'medal', 'money'].includes(ic) ? 'var(--w)' : 'var(--a)';
      const others = ['var(--bad)', 'var(--w)', 'var(--a)', 'var(--a2)', 'var(--ok)'].filter(c => c !== hue);
      const mk = (sz, i) => {
        const e = el('div', 'mk-abs mk-emo ' + (glyph ? 'g' : 'b'), ctx.root, glyph || MK.icon(ic, Math.round(sz * .52), 2.4));
        e.style.width = e.style.height = sz.toFixed(0) + 'px';
        if (glyph) e.style.fontSize = (sz * .86).toFixed(0) + 'px';
        else e.style.background = rnd(i, 5) < .6 ? hue : others[Math.floor(rnd(i, 6) * others.length)];
        return e;
      };
      const ps = Array.from({ length: n }, (_, i) => { const sz = base * (.72 + .5 * rnd(i, 2)); return { e: mk(sz, i), sz }; });
      const hero = v === 'burst' ? { e: mk(base * 2, 99), sz: base * 2 } : null;
      if (hero) hero.e.classList.add('hero');

      /* 各变体的时间与路径参数 */
      let bx = 0, by = 0, top = 0, waves = [];
      if (v === 'float') {
        bx = p.x != null ? p.x * W : card ? card.x + card.w + (W - card.x - card.w) / 2 : W - (P ? 150 : 170);
        by = g.capTop - 40; top = P ? 380 : 150;
        const span = clamp(dur - 2.6, .8, n * .22);
        ps.forEach((q, i) => { q.b = c0 + span * i / n + rnd(i, 7) * .08; q.L = 2.2 + .9 * rnd(i, 8); q.A = 22 + 20 * rnd(i, 9); q.ph = rnd(i, 10) * 6.28; });
        if (card && p.x == null) { const lim = bx - card.x - card.w - 6; ps.forEach(q => { q.A = Math.max(4, Math.min(q.A, lim - q.sz / 2)); }); }
        ps.forEach((q, i) => { if (i % 3 === 0) S(q.b, 'bubble', .14, .6, { n: i % 9 }); });
      } else if (v === 'rain') {
        const span = clamp(dur - 1.9, .6, 1.4 + n * .03);
        ps.forEach((q, i) => { q.x = Z.x + 30 + rnd(i, 11) * (Z.w - 60); q.b = c0 + span * rnd(i, 12); q.L = .85 + .45 * rnd(i, 13); q.fy = Z.b - q.sz / 2 - rnd(i, 14) * 50; q.ra = (rnd(i, 15) - .5) * 40; });
        S(c0, 'swoosh', .2); ps.forEach((q, i) => { if (i % 4 === 0) S(q.b + q.L * .36, 'blip', .1, (q.x / W - .5), { n: i % 8 }); });
      } else {
        bx = p.x != null ? p.x * W : Z.x + Z.w / 2; by = p.y != null ? p.y * H : Z.y + Z.h * .5;
        const nw = clamp(Math.floor((t1 - .9 - (c0 + .3)) / 1.1) + 1, 1, 3);
        waves = Array.from({ length: nw }, (_, k) => c0 + .3 + k * 1.1);
        ps.forEach((q, i) => { q.b = waves[i % nw] + rnd(i, 16) * .08; q.an = -Math.PI / 2 + (rnd(i, 17) - .5) * Math.PI * 1.8; q.sp = (P ? 1000 : 900) * (.5 + .5 * rnd(i, 18)); q.L = 1.3 + .5 * rnd(i, 19); q.spin = (rnd(i, 20) - .5) * 400; });
        S(c0, 'pop', .3); waves.forEach((w, k) => S(w, 'bubble', .2, 0, { n: 2 + k * 3 }));
      }
      return {
        update(t) {
          const out = 1 - leave(t, slot);
          for (let i = 0; i < n; i++) {
            const q = ps[i], lt = t - q.b, e = q.e;
            let x = 0, y = 0, s = 1, r = 0, o = 0;
            if (v === 'float') {
              if (lt >= 0 && lt <= q.L) {
                const k = lt / q.L;
                y = by - (by - top) * (k * .75 + EZ.out(k) * .25) * (.75 + .25 * rnd(i, 21));
                x = bx + Math.sin(lt * 2.4 + q.ph) * q.A * Math.min(1, lt / .5);
                s = (.2 + .8 * EZ.back(pr(lt, 0, .32))) * (1 - .4 * pr(lt, q.L * .65, q.L));
                r = Math.sin(lt * 3 + q.ph) * 12; o = clamp(lt / .08) * (1 - pr(lt, q.L * .6, q.L));
              }
            } else if (v === 'rain') {
              if (lt >= 0 && lt <= q.L + .9) {
                const k = pr(lt, 0, q.L);
                y = lerp(-q.sz, q.fy, EZ.bounce(k)); x = q.x + Math.sin(lt * 3 + i) * 10 * (1 - k);
                r = q.ra * k + (1 - k) * lt * 90; s = 1 - .6 * EZ.in(pr(lt, q.L + .6, q.L + .9)); o = 1 - pr(lt, q.L + .55, q.L + .9);
              }
            } else if (lt >= 0 && lt <= q.L) {
              const dr = 2.6, ee = (1 - Math.exp(-lt * dr)) / dr;
              x = bx + Math.cos(q.an) * q.sp * ee; y = by + Math.sin(q.an) * q.sp * ee + 260 * lt * lt;
              s = (.3 + .7 * EZ.back(pr(lt, 0, .25))) * (1 - .3 * pr(lt, q.L * .6, q.L)); r = q.spin * lt; o = clamp(lt / .05) * (1 - pr(lt, q.L * .55, q.L));
            }
            o *= out * fadeAt(g, x, y);
            tf(e, { x: x - q.sz / 2, y: y - q.sz / 2, s, r, o });
          }
          if (hero) {
            const k = pr(t, c0, c0 + .5), beat = waves.reduce((m, w) => m + Math.sin(Math.PI * pr(t, w - .06, w + .24)), 0), hb = Math.max(0, Math.sin((t - c0) * 5.2)) * .04 * pr(t, c0 + .6, c0 + 1);
            tf(hero.e, { x: bx - hero.sz / 2, y: by - hero.sz / 2, s: Math.max(0, EZ.spring(k) * (1 + .22 * beat + hb) * (1 - EZ.backIn(leave(t, slot)))), r: (1 - EZ.out(k)) * -30, o: clamp(k * 5) });
          }
        },
        fg(c, t) {
          if (v !== 'burst') return;
          const a = 1 - leave(t, slot); if (a <= .002) return;
          c.save(); clipCard(c, g);
          MK.fx.glow(c, bx, by, 180, T().w, .8 * a * pr(t, c0, c0 + .3));
          waves.forEach((w, k) => MK.fx.ripple(c, t, w, bx, by, { r: 240, r0: 50, col: k % 2 ? T().a : T().w, rings: 2 }));
          c.restore();
        },
      };
    },
  });

  /* ---------- progressbar：章节进度 ----------
     chapters 为 2–6 个章节名，current 为当前第几章（从 1 起）。
     top    顶部分段条（横屏只占口播卡左侧），段落依次长出，指针从头滑到当前段中间，已完成段点亮；
            停留时当前段继续缓慢推进、扫光，指针光晕呼吸
     bottom 字幕下方一排胶囊，选中块从第一章滑到当前章（弹性），内部进度条缓慢填充
     dots   顶部节点步进器：节点弹出、连线长出，光点沿线跑到当前节点，当前节点展开成带章节名的胶囊；停留时胶囊脉冲 */
  MK.control('progressbar', {
    variants: ['top', 'bottom', 'dots'],
    build(slot, p, ctx) {
      const g = geo(ctx), Z = g.zone, { W, H, P } = g, v = ctx.variant, t1 = slot.t1;
      const chs = p.chapters, n = chs.length, cur = clamp(Math.round(p.current || 1), 1, n) - 1;
      const c0 = slot.cues[0] ?? slot.t0 + .1, c1 = slot.cues[1] ?? c0 + .3 + n * .07;
      const wrap = el('div', 'mk-abs mk-pg mk-pg-' + v, ctx.root);
      const num = i => String(i + 1).padStart(2, '0');
      S(c0, 'swoosh', .22);

      if (v === 'top') {
        const y = P ? 136 : 96, gap = 10, x0 = Z.x, x1 = Z.r, sw = (x1 - x0 - gap * (n - 1)) / n;
        const head = el('div', 'hd mk-abs', wrap, `${p.title ? `<span>${esc(p.title)}</span>` : ''}<b>${num(cur)}</b><i>/ ${num(n - 1)}</i>`);
        const segs = chs.map((s, i) => { const tr = box(el('div', 'tr mk-abs', wrap), x0 + i * (sw + gap), y, sw, 8), fl = el('div', 'fl', tr), lb = el('div', 'lb mk-abs', wrap, esc(s)); return { tr, fl, lb }; });
        const knob = box(el('div', 'kn mk-abs', wrap), 0, y - 7, 22, 22);
        ctx.measure(() => {
          const f = fitw(head, P ? 22 : 20, 14, Math.min(Z.w * .6, 520)); Object.assign(head.style, { left: (x1 - f.w) + 'px', top: (y - f.h - 12) + 'px' });
          segs.forEach(({ lb }, i) => { const a = fitw(lb, P ? 26 : 24, 13, sw - 8); Object.assign(lb.style, { left: (x0 + i * (sw + gap) + (sw - a.w) / 2) + 'px', top: (y + 18) + 'px' }); });
        });
        segs.forEach((_, i) => S(c0 + .08 + i * .06, 'blip', .1, (i / n - .5), { n: i * 2 }));
        S(c1 + .4 + cur * .12, 'ding', .18, 0, { m: 91 });
        const pos = t => EZ.inout(pr(t, c1, c1 + .45 + cur * .12)) * (cur + .5) + .35 * EZ.sine(pr(t, c1 + 1.2, t1 - .2));
        const px = q => { const i = Math.min(n - 1, Math.floor(q)); return x0 + i * (sw + gap) + (q - i) * sw; };
        return {
          update(t) {
            const out = leave(t, slot), q = pos(t);
            set(wrap, { o: 1 - out, y: -EZ.in(out) * 16 });
            tf(head, { o: pr(t, c0 + .1, c0 + .4), x: (1 - EZ.out5(pr(t, c0 + .1, c0 + .6))) * 30 });
            segs.forEach(({ tr, fl, lb }, i) => {
              const k = pr(t, c0 + i * .06, c0 + i * .06 + .38);
              tr.style.transformOrigin = '0 50%'; tf(tr, { sx: Math.max(.001, EZ.out5(k)), o: clamp(k * 4) });
              const f = clamp(q - i); fl.style.width = (f * 100).toFixed(2) + '%';
              fl.classList.toggle('cur', i === cur && q > cur);
              const kl = pr(t, c0 + .1 + i * .06, c0 + .5 + i * .06); tf(lb, { o: clamp(kl * 2) * (i === cur && q > cur ? 1 : i < cur ? .75 : .5), y: (1 - EZ.out5(kl)) * -12 });
              lb.classList.toggle('on', i === cur && q > cur);
            });
            const ka = pr(t, c1 - .05, c1 + .15), hb = idle(t, c1 + 1, 1.4).wave;
            tf(knob, { x: px(q) - 11, s: (.4 + .6 * EZ.back(ka)) * (1 + .12 * hb), o: clamp(ka * 4) });
            segs[cur].fl.style.setProperty('--sh', lerp(140, -40, clamp(idle(t, c1 + .9, 2.4).sweep * 2)).toFixed(1) + '%');
          },
        };
      }

      if (v === 'bottom') {
        const ch = P ? 44 : 40, y = H - (P ? 84 : 68), S0 = g.safe;
        const title = p.title ? el('div', 'ti mk-abs', wrap, esc(p.title)) : null;
        const sel = el('div', 'sel mk-abs', wrap, '<i></i>'), bar = sel.firstChild;
        const chips = chs.map((s, i) => el('div', 'cp mk-abs' + (i < cur ? ' done' : ''), wrap, `<span>${esc(s)}</span>`));
        const G = { xs: [], cw: 100 };
        ctx.measure(() => {
          let x0 = S0.x;
          if (title) {
            /* 竖屏宽度不够：标题放到条的上方，不占横向空间 */
            if (P) { const f = fitw(title, 22, 13, S0.r - x0); Object.assign(title.style, { left: x0 + 'px', top: (y - f.h - 10) + 'px' }); }
            else { const f = fitw(title, 22, 13, 240); Object.assign(title.style, { left: x0 + 'px', top: (y + (ch - f.h) / 2) + 'px' }); x0 += f.w + 20; }
          }
          const gap = P ? 8 : 12, cw = (S0.r - x0 - gap * (n - 1)) / n;
          chips.forEach((c, i) => { box(c, x0 + i * (cw + gap), y, cw, ch); fit(c.firstChild, P ? 24 : 24, 12, cw - 16, null); G.xs.push(x0 + i * (cw + gap)); });
          G.cw = cw; box(sel, 0, y, cw, ch);
        });
        chips.forEach((_, i) => S(c0 + .1 + i * .05, 'blip', .1, (i / n - .5), { n: i * 2 }));
        S(c1 + .1, 'swoosh', .18); S(c1 + .45 + cur * .06, 'snap', .2);
        return {
          update(t) {
            const out = leave(t, slot);
            if (title) tf(title, { o: pr(t, c0, c0 + .3) * (1 - out), x: (1 - EZ.out5(pr(t, c0, c0 + .5))) * -30 });
            chips.forEach((c, i) => {
              const k = pr(t, c0 + .1 + i * .05, c0 + .55 + i * .05), qo = pr(t, t1 - .35 + i * .03, t1 - .1 + i * .03);
              tf(c, { y: (1 - EZ.back(k)) * 50 + EZ.in(qo) * 50, o: clamp(k * 3) * (1 - qo) });
            });
            const ks = EZ.back(pr(t, c1, c1 + .5 + cur * .06)), qo = pr(t, t1 - .35 + cur * .03, t1 - .1 + cur * .03);
            const x = lerp(G.xs[0], G.xs[cur], ks), on = pr(t, c1 + .3 + cur * .06, c1 + .5 + cur * .06);
            tf(sel, { x, y: EZ.in(qo) * 50, s: 1 + .06 * Math.sin(Math.PI * pr(t, c1 + .4 + cur * .06, c1 + .75 + cur * .06)), o: clamp(pr(t, c0 + .35, c0 + .6) * 3) * (1 - qo) });
            chips[cur].classList.toggle('on', on > .5);
            bar.style.width = (EZ.sine(pr(t, c1 + .6, t1 - .3)) * 100).toFixed(2) + '%';
            sel.style.boxShadow = `0 0 ${(18 + 10 * idle(t, c1 + .8, 2).wave).toFixed(1)}px rgba(var(--a-rgb),.55)`;
          },
        };
      }

      /* dots */
      const Dn = P ? 30 : 28, link = P ? 46 : 52, ph = P ? 48 : 44, cy = P ? 142 : 104;
      const nodes = chs.map((s, i) => el('div', 'nd mk-abs', wrap, `<b>${i + 1}</b>` + (i === cur ? `<span><i>${num(i)}</i>${esc(s)}</span>` : '')));
      const links = chs.slice(1).map(() => el('div', 'lk mk-abs', wrap, '<i></i>'));
      const title = p.title ? el('div', 'ti mk-abs', wrap, esc(p.title)) : null;
      const G = { pw: 200, xs: [] };
      ctx.measure(() => {
        const lab = nodes[cur].querySelector('span');
        const avail = Z.w - (n - 1) * (Dn + link) - link - 20;
        const f = fitw(lab, P ? 26 : 24, 13, Math.min(avail - 40, P ? 340 : 380)); G.pw = f.w + 40;
        nodes.forEach(nd => { box(nd, 0, cy - Dn / 2, Dn, Dn); });
        nodes[cur].style.height = ph + 'px'; nodes[cur].style.top = (cy - ph / 2) + 'px';
        links.forEach(l => box(l, 0, cy - 1.5, link, 3));
        if (title) { const end = Z.x + (n - 1) * (Dn + link) + G.pw + 28; const a = fitw(title, P ? 22 : 20, 12, Math.max(60, Z.r - end)); Object.assign(title.style, { left: end + 'px', top: (cy - a.h / 2) + 'px' }); }
      });
      nodes.forEach((_, i) => S(c0 + i * .06, 'blip', .1, (i / n - .5), { n: i * 2 }));
      const tReach = c1 + .3 + cur * .12;
      S(c1, 'swoosh', .16); S(tReach, 'pop', .24);
      const U = t => EZ.inout(pr(t, c1, tReach)) * cur;
      return {
        update(t) {
          const out = leave(t, slot), u = U(t), e = EZ.back(pr(t, tReach - .05, tReach + .4));
          set(wrap, { o: 1 - out, y: -EZ.in(out) * 14 });
          let x = Z.x; G.xs = [];
          nodes.forEach((nd, i) => {
            const w = i === cur ? lerp(Dn, G.pw, e) : Dn, k = pr(t, c0 + i * .06, c0 + i * .06 + .4);
            nd.style.left = x.toFixed(1) + 'px'; nd.style.width = w.toFixed(1) + 'px';
            if (i === cur) { const hh = lerp(Dn, ph, e); nd.style.height = hh.toFixed(1) + 'px'; nd.style.top = (cy - hh / 2).toFixed(1) + 'px'; nd.classList.toggle('open', e > .3); }
            tf(nd, { s: .2 + .8 * EZ.spring(k), o: clamp(k * 4) });
            nd.classList.toggle('done', i < cur && u >= i - .001 && t >= c1);
            nd.classList.toggle('on', i === cur && t >= tReach - .05);
            G.xs.push(x + w / 2);
            if (i < n - 1) {
              const l = links[i], kl = pr(t, c0 + .15 + i * .06, c0 + .45 + i * .06);
              l.style.left = (x + w).toFixed(1) + 'px'; l.style.transformOrigin = '0 50%';
              tf(l, { sx: Math.max(.001, EZ.out5(kl)), o: kl > 0 ? 1 : 0 });
              l.firstChild.style.width = (clamp(u - i) * 100).toFixed(1) + '%';
            }
            x += w + link;
          });
          nodes[cur].style.boxShadow = t > tReach ? `0 0 ${(16 + 10 * idle(t, tReach + .5, 2.2).wave).toFixed(1)}px rgba(var(--a-rgb),.6)` : '';
          if (title) tf(title, { o: pr(t, c0 + .3, c0 + .7), x: (1 - EZ.out5(pr(t, c0 + .3, c0 + .8))) * 20 });
        },
        fg(c, t) {
          const a = 1 - leave(t, slot); if (a <= .002 || !G.xs.length) return;
          const u = U(t);
          if (cur > 0 && u > 0 && u < cur) MK.fx.comet(c, G.xs.slice(0, cur + 1).map(x => [x, cy]), u / cur, T().aLite, a, { r: 6, tail: .012 });
          for (let j = 0; j < 12; j++) { const r0 = tReach + j * 2.2; if (r0 > t1) break; MK.fx.ripple(c, t, r0, G.xs[cur], cy, { r: 70, r0: 20, rings: 1, life: 1 }); }
        },
      };
    },
  });

  /* ---------- tag：角标 / 话题标签 ----------
     items 1–3 条短字（「#干货」「第 3 集」「新」），pos = tl / tr 贴在可用区的左上或右上角（横屏口播卡左侧）。
     corner 第一条是主色大块、其余深色小块，逐块斜切滑入；停留时主块扫光、角上小点闪动
     pill   一排胶囊从上方弹落；停留时依次起伏、轮流点亮边框
     ribbon 斜角丝带：每条一根燕尾丝带从边缘展开并摆正倾角；停留时轻轻飘动、扫光 */
  MK.control('tag', {
    variants: ['corner', 'pill', 'ribbon'],
    build(slot, p, ctx) {
      const g = geo(ctx), Z = g.zone, P = g.P, v = ctx.variant, R = p.pos === 'tr', dir = R ? -1 : 1, t1 = slot.t1;
      const items = p.items, n = items.length;
      const at = stagger(n, slot.t0 + .12, .2, slot.cues);
      const wrap = el('div', 'mk-abs mk-tg mk-tg-' + v + (R ? ' r' : ''), ctx.root);
      const X = w => (R ? Z.r - w : Z.x), pan = R ? .4 : -.4;
      const els = items.map((s, i) => { const o = el('div', 'it mk-abs' + (i ? '' : ' first'), wrap); const inn = el('div', 'in', o, `<span>${rich(s)}</span>`); return { o, inn, sp: inn.firstChild }; });
      const G = [];
      if (v === 'corner') {
        const blink = el('div', 'bl mk-abs', wrap);
        ctx.measure(() => {
          let y = Z.y;
          els.forEach(({ o, sp }, i) => {
            const f = fitw(sp, i ? (P ? 30 : 28) : (P ? 44 : 42), 16, Math.min(Z.w * (P ? .7 : .45), 460));
            const w = f.w + (i ? 40 : 52), h = f.h + (i ? 14 : 18), x = X(w) + dir * i * 16;
            box(o, x, y, w, h); G.push({ x, y, w, h }); y += h + 8;
          });
          box(blink, R ? G[0].x - 7 : G[0].x + G[0].w - 7, G[0].y - 7, 14, 14);
        });
        at.forEach((c, i) => { S(c - .05, 'swoosh', .2, pan); if (!i) S(c + .15, 'snap', .2, pan); });
        return {
          update(t) {
            const out = slot.t1 - .45;
            els.forEach(({ o, inn }, i) => {
              const k = EZ.expo(pr(t, at[i], at[i] + .45)) * (1 - EZ.inout(pr(t, out + (n - 1 - i) * .06, out + .3 + (n - 1 - i) * .06)));
              reveal(o, k, !R);
              tf(inn, { x: -dir * (1 - EZ.out5(pr(t, at[i] + .05, at[i] + .5))) * 50, o: clamp(pr(t, at[i] + .05, at[i] + .25) * 3) });
            });
            const gl = idle(t, at[n - 1] + .7, 2.6);
            shine(els[0].o, t, at[n - 1] + .7, 2.6);
            els[0].o.style.filter = `brightness(${(1 + .3 * Math.max(0, 1 - gl.sweep * 6)).toFixed(3)})`;
            tf(blink, { s: EZ.back(pr(t, at[0] + .4, at[0] + .7)) * (1 - leave(t, slot)), o: (Math.floor((t - slot.t0) * 2.4) % 2 ? .35 : 1) * pr(t, at[0] + .4, at[0] + .5) * (1 - leave(t, slot)) });
          },
        };
      }
      if (v === 'pill') {
        ctx.measure(() => {
          const gap = 12, maxW = Math.min(Z.w * .96, P ? 940 : 900);
          let size = P ? 34 : 32, ws = [];
          for (; size >= 16; size--) { els.forEach(({ sp }) => { sp.style.fontSize = size + 'px'; }); ws = els.map(({ o }) => { o.style.width = 'max-content'; return Math.ceil(o.getBoundingClientRect().width) + 1; }); if (ws.reduce((a, b) => a + b, 0) + gap * (n - 1) <= maxW) break; }
          if (size < 16) throw Error(`文字放不下（标签总宽超出 ${maxW}px）：${items.join(' ')}`);
          let x = R ? Z.r : Z.x;
          els.forEach(({ o }, i) => { const w = ws[i]; const xx = R ? x - w : x; box(o, xx, Z.y, w); G.push({ x: xx, w }); x += dir * (w + gap); });
        });
        at.forEach((c, i) => S(c, 'pop', .22, pan, {}));
        return {
          update(t) {
            const out = leave(t, slot), u = Math.max(0, t - at[n - 1] - .6), hot = Math.floor(u / 1.1) % n;
            els.forEach(({ o }, i) => {
              const k = pr(t, at[i], at[i] + .5);
              tf(o, { s: (.3 + .7 * EZ.spring(k)) * (1 - EZ.backIn(out) * .6), y: (1 - EZ.back(k)) * -40 + Math.sin(u * 2.4 - i * .9) * 4 * pr(t, at[n - 1] + .6, at[n - 1] + 1), o: clamp(k * 4) * (1 - out) });
              o.classList.toggle('hot', u > 0 && i === hot);
            });
          },
        };
      }
      /* ribbon */
      ctx.measure(() => {
        let y = Z.y + 6;
        els.forEach(({ o, inn, sp }, i) => {
          const f = fitw(sp, i ? (P ? 32 : 30) : (P ? 40 : 38), 16, Math.min(Z.w * (P ? .7 : .45), 460));
          const w = f.w + 84, h = f.h + 16;
          box(o, X(w) + dir * i * 22, y, w, h); box(inn, 0, 0, w, h); G.push({ w, h }); y += h + 14;
        });
      });
      at.forEach((c, i) => { S(c, 'swoosh', .2, pan); S(c + .3, 'blip', .14, pan, { n: 3 + i * 2 }); });
      return {
        update(t) {
          const out = slot.t1 - .45;
          els.forEach(({ o, inn }, i) => {
            const k = EZ.expo(pr(t, at[i], at[i] + .5)) * (1 - EZ.inout(pr(t, out + (n - 1 - i) * .06, out + .32 + (n - 1 - i) * .06)));
            reveal(o, k, !R);
            const kr = pr(t, at[i], at[i] + .8), u = Math.max(0, t - at[i] - .8);
            const tilt = dir * (-4 - (1 - EZ.spring(kr)) * 10), fl = Math.sin(u * 3 + i) * 1.6 * pr(t, at[i] + .8, at[i] + 1.2);
            o.style.transformOrigin = R ? '100% 50%' : '0 50%';
            o.style.transform = `rotate(${(tilt + fl * .3).toFixed(3)}deg) skewY(${fl.toFixed(3)}deg)`;
            o.style.opacity = k > .002 ? '1' : '0';
            shine(inn, t, at[n - 1] + .9 + i * .2, 3);
          });
        },
      };
    },
  });

  /* ---------- confetti：庆祝特效 ----------
     text 可选短句（居中弹出，停留时扫光、轻飘）；每个 cue 一波（最多 3 波，缺省按节奏自动排）。
     cannons   可用区左右下角两门礼花炮向内上方喷出彩纸，彩纸减速后飘落、翻转
     rain      彩纸从顶上持续飘落，左右摇摆翻面，夹杂闪星
     fireworks 烟花弹拖着尾巴升空，炸成一圈火花，下坠时闪烁
     粒子从口播卡后面经过（画布挖掉口播卡），接近字幕带时淡出 */
  MK.control('confetti', {
    variants: ['cannons', 'rain', 'fireworks'],
    build(slot, p, ctx) {
      const g = geo(ctx), Z = g.zone, P = g.P, v = ctx.variant, t1 = slot.t1;
      const waves = slot.cues.length ? slot.cues.slice(0, 3) : [slot.t0 + .12, slot.t0 + 1.15, slot.t0 + 2.1].filter((x, i) => !i || x < t1 - 1.3);
      const tx = p.text ? el('div', 'mk-abs mk-cf-t', ctx.root, `<span>${rich(p.text)}</span>`) : null;
      const ty = Z.y + Z.h * (P ? .32 : .36);
      if (tx) ctx.measure(() => { const f = fitw(tx, P ? 112 : 104, 40, Z.w * .86); Object.assign(tx.style, { left: (Z.x + (Z.w - f.w) / 2) + 'px', top: (ty - f.h / 2) + 'px' }); });
      const tt = waves[0] + .15;
      if (tx) S(tt + .05, 'tada', .26);
      const cols = MK.palette();
      const guns = [[Z.x + 30, Z.b + 10, -1.08], [Z.r - 30, Z.b + 10, -Math.PI + 1.08]];
      const shells = [];
      if (v === 'cannons') waves.forEach((w, k) => { S(w, 'pop', .34, -.6); S(w + .04, 'pop', .3, .6); if (!tx && !k) S(w + .1, 'tada', .22); });
      else if (v === 'rain') { S(waves[0], 'tada', .24); waves.slice(1).forEach(w => S(w, 'blip', .14, 0, { n: 6 })); }
      else waves.forEach((w, k) => { for (let j = 0; j < (k ? 2 : 1) + (waves.length === 1 ? 1 : 0); j++) { const id = k * 3 + j, at = w + j * .32; shells.push({ at, x: Z.x + Z.w * (.18 + .64 * rnd(id, 95)), y: Z.y + Z.h * (.16 + .22 * rnd(id, 96)), col: cols[id % cols.length], seed: id }); S(at, 'swoosh', .16, rnd(id, 95) - .5); S(at + .55, 'pop', .3, rnd(id, 95) - .5); S(at + .6, 'snap', .14); } });
      const paper = (c, px, py, rot, sz, col, al, kind) => {
        c.globalAlpha = al; c.fillStyle = `rgb(${col})`; c.strokeStyle = `rgb(${col})`;
        c.translate(px, py); c.rotate(rot);
        if (kind === 0) { c.beginPath(); c.arc(0, 0, sz * .4, 0, 7); c.fill(); }
        else if (kind === 1) { c.lineWidth = 3; c.beginPath(); for (let s = -1; s <= 1.001; s += .25) c.lineTo(s * sz, Math.sin(s * 5 + rot) * sz * .3); c.stroke(); }
        else { c.scale(1, Math.abs(Math.cos(rot * 1.7)) * .85 + .15); c.fillRect(-sz / 2, -sz * .3, sz, sz * .6); }
        c.setTransform(1, 0, 0, 1, 0, 0);
      };
      return {
        update(t) {
          if (!tx) return;
          const k = pr(t, tt, tt + .6), out = leave(t, slot), u = Math.max(0, t - tt - .6);
          tf(tx, { s: Math.max(0, EZ.elastic(k)) * (1 - .2 * EZ.in(out)), r: (1 - EZ.out(k)) * -6, y: Math.sin(u * 1.8) * 5, o: clamp(k * 5) * (1 - out) });
          shine(tx, t, tt + .8, 2.6);
        },
        fg(c, t) {
          const out = 1 - leave(t, slot); if (out <= .002) return;
          c.save(); clipCard(c, g);
          const fade = y => 1 - pr(y, g.capTop - 80, g.capTop);
          if (v === 'cannons') {
            waves.forEach((w, k) => guns.forEach(([gx, gy, ang], side) => {
              const lt = t - w - side * .04; if (lt < 0 || lt > 3.6) return;
              MK.fx.glow(c, gx, gy, 160, T().w, (1 - pr(lt, 0, .3)) * out);
              const N = P ? 80 : 90, seed = k * 10 + side * 5;
              for (let i = 0; i < N; i++) {
                const a = ang + (rnd(i, seed) - .5) * .7, v0 = (P ? 1900 : 1750) * (.4 + .6 * rnd(i, seed + 1)), d = 1.7 + .8 * rnd(i, seed + 2), vt = 150 + 90 * rnd(i, seed + 3);
                const e = (1 - Math.exp(-lt * d)) / d, life = 2.4 + rnd(i, seed + 4);
                if (lt > life) continue;
                const px = gx + Math.cos(a) * v0 * e + Math.sin(lt * 2.6 + i) * 22 * lt, py = gy + Math.sin(a) * v0 * e + vt * (lt - e);
                paper(c, px, py, lt * (5 + 9 * rnd(i, seed + 5)) + i, 10 + 9 * rnd(i, seed + 6), cols[i % cols.length], (1 - pr(lt, life * .7, life)) * fade(py) * out, i % 7 === 0 ? 1 : i % 3 === 0 ? 0 : 2);
              }
            }));
          } else if (v === 'rain') {
            const N = P ? 130 : 150;
            for (let i = 0; i < N; i++) {
              const w = waves[i % waves.length], b = w + rnd(i, 51) * Math.min(2.4, (t1 - w) * .55), lt = t - b; if (lt < 0) continue;
              const vt = 170 + 120 * rnd(i, 52), py = -30 + vt * lt; if (py > g.capTop + 20) continue;
              const px = Z.x + rnd(i, 53) * Z.w + Math.sin(lt * 2 + i) * 30;
              paper(c, px, py, lt * (3 + 5 * rnd(i, 54)) + i, 10 + 9 * rnd(i, 55), cols[i % cols.length], fade(py) * out * clamp(lt * 4), i % 9 === 0 ? 1 : i % 4 === 0 ? 0 : 2);
            }
            MK.fx.twinkle(c, t, Z.x, Z.y, Z.w, Z.h * .7, 14, T().aLite, out * pr(t, waves[0], waves[0] + .6));
          } else {
            c.lineCap = 'round';
            for (const s of shells) {
              const lt = t - s.at; if (lt < 0 || lt > 2.4) continue;
              const by = Z.b + 20, rise = .55;
              if (lt < rise) { const k = EZ.out(lt / rise), hx = s.x + Math.sin(lt * 9) * 3, hy = lerp(by, s.y, k); MK.fx.comet(c, [[s.x, by], [s.x, s.y]], clamp(k, .01, .99), s.col, out, { r: 5, tail: .02 }); MK.fx.glow(c, hx, hy, 40, s.col, out); continue; }
              const bt = lt - rise; MK.fx.glow(c, s.x, s.y, 300, s.col, (1 - pr(bt, 0, .5)) * out * 1.4);
              const N = 64;
              for (let i = 0; i < N; i++) {
                const a = i / N * Math.PI * 2 + rnd(i, s.seed + 60) * .1, sp = (P ? 520 : 480) * (.8 + .2 * rnd(i, s.seed + 61)), d = 2.2, life = 1.3 + .4 * rnd(i, s.seed + 62); if (bt > life) continue;
                const pos = q => { const e = (1 - Math.exp(-q * d)) / d; return [s.x + Math.cos(a) * sp * e, s.y + Math.sin(a) * sp * e + 90 * q * q]; };
                const [x1, y1] = pos(bt), [x0, y0] = pos(Math.max(0, bt - .07)), al = (1 - pr(bt, life * .55, life)) * out * fade(y1);
                const crackle = bt > .8 ? (rnd(i + Math.floor(t * 24), s.seed + 63) > .45 ? 1 : .2) : 1;
                c.strokeStyle = `rgba(${s.col},${(al * crackle).toFixed(3)})`; c.lineWidth = 3; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
                c.fillStyle = `rgba(255,255,255,${(al * crackle * .8).toFixed(3)})`; c.beginPath(); c.arc(x1, y1, 1.8, 0, 7); c.fill();
              }
            }
          }
          c.globalAlpha = 1; c.restore();
        },
      };
    },
  });

  /* ---------- frame：画面装饰框 ----------
     框住可用区（有口播卡时只框内容区），适合给整段画面加氛围；label 为可选短字。
     viewfinder 四角取景框从外飞入，中心十字描出、对焦框缩放过冲后闪两下确认（变绿）；停留时四角呼吸、对焦框微动、扫描线下移
     rec        录制标：一条亮线横向展开再上下打开（开机），红点 REC + 运行时间码 + 电量；停留时红点闪、扫描线滚动
     glow       霓虹边框从顶部中点向两侧描出，两颗光点沿边框环绕，标签像标题嵌在上边框 */
  MK.control('frame', {
    variants: ['viewfinder', 'rec', 'glow'],
    build(slot, p, ctx) {
      const g = geo(ctx), Z = g.zone, P = g.P, v = ctx.variant, t1 = slot.t1;
      const c0 = slot.cues[0] ?? slot.t0 + .1;
      const R = { x: Z.x + 6, y: Z.y + 6, w: Z.w - 12, h: Z.h - 12 }; R.r = R.x + R.w; R.b = R.y + R.h;
      const wrap = el('div', 'mk-abs mk-fr mk-fr-' + v, ctx.root);
      const lab = p.label ? el('div', 'lab mk-abs', wrap, esc(p.label)) : null;
      const fitLab = (max, wmax) => (lab ? fitw(lab, max, 14, wmax) : { w: 0, h: 0 });

      if (v === 'viewfinder') {
        const arm = clamp(Math.min(R.w, R.h) * .09, 46, 90);
        const cn = [[R.x, R.y, -1, -1], [R.r, R.y, 1, -1], [R.r, R.b, 1, 1], [R.x, R.b, -1, 1]].map(([x, y, dx, dy], i) => { const e = box(el('div', 'cn mk-abs c' + i, wrap), dx < 0 ? x : x - arm, dy < 0 ? y : y - arm, arm, arm); e.style.height = arm + 'px'; return { e, dx, dy }; });
        const fx = R.x + R.w / 2, fy = R.y + R.h / 2, fw = P ? 220 : 200, fh = P ? 150 : 130;
        const fb = box(el('div', 'fb mk-abs', wrap), fx - fw / 2, fy - fh / 2, fw, fh); fb.style.height = fh + 'px';
        const cross = svg(wrap, 60, 60, '<path d="M30 6 V54 M6 30 H54"/>', 'cross'); cross.style.left = (fx - 30) + 'px'; cross.style.top = (fy - 30) + 'px';
        const cp = cross.firstChild;
        const bat = el('div', 'bat mk-abs', wrap, '<i></i><i></i><i></i>');
        ctx.measure(() => {
          const f = fitLab(P ? 24 : 22, R.w * .5); if (lab) Object.assign(lab.style, { left: (R.x + 22) + 'px', top: (R.y + arm * .35) + 'px' });
          box(bat, R.r - 22 - 46, R.y + arm * .35 + (f.h ? (f.h - 22) / 2 : 0), 46, 22); bat.style.height = '22px';
        });
        S(c0, 'swoosh', .22); S(c0 + .75, 'blip', .18, 0, { n: 6 }); S(c0 + .92, 'blip', .18, 0, { n: 9 });
        return {
          update(t) {
            const out = leave(t, slot), br = 5 * idle(t, c0 + 1, 2.6).wave * pr(t, c0 + 1, c0 + 1.4);
            cn.forEach(({ e, dx, dy }, i) => { const k = pr(t, c0 + i * .05, c0 + i * .05 + .5), d = (1 - EZ.back(k)) * 110 + br + EZ.in(out) * 40; tf(e, { x: dx * d, y: dy * d, o: clamp(k * 3) * (1 - out) }); });
            const kf = pr(t, c0 + .3, c0 + .7), hunt = 1 + .025 * MK.noise((t - slot.t0) * 1.3) * pr(t, c0 + 1.2, c0 + 1.6);
            tf(fb, { s: (1 + (1 - EZ.out5(kf)) * .8) * hunt, o: clamp(kf * 3) * (1 - out) });
            const blink = (t > c0 + .75 && t < c0 + .85) || (t > c0 + .92 && t < c0 + 1.02);
            fb.classList.toggle('ok', t > c0 + .75); fb.style.opacity = (blink ? .25 : +fb.style.opacity).toString();
            draw(cp, EZ.out(pr(t, c0 + .2, c0 + .6))); set(cross, { o: 1 - out });
            if (lab) tf(lab, { o: pr(t, c0 + .4, c0 + .7) * (1 - out), x: (1 - EZ.out5(pr(t, c0 + .4, c0 + .9))) * -20 });
            tf(bat, { o: pr(t, c0 + .5, c0 + .8) * (1 - out) });
          },
          fg(c, t) {
            const a = (1 - leave(t, slot)) * pr(t, c0 + .6, c0 + 1); if (a <= .002) return;
            c.save(); c.beginPath(); c.rect(R.x, R.y, R.w, R.h); c.clip();
            const y = R.y + ((t - c0) / 3.5 % 1) * R.h, gr = c.createLinearGradient(0, y - 60, 0, y);
            gr.addColorStop(0, `rgba(${T().a},0)`); gr.addColorStop(1, `rgba(${T().a},${(.12 * a).toFixed(3)})`);
            c.fillStyle = gr; c.fillRect(R.x, y - 60, R.w, 60);
            c.fillStyle = `rgba(${T().aLite},${(.35 * a).toFixed(3)})`; c.fillRect(R.x, y, R.w, 1.5);
            c.restore();
          },
        };
      }

      if (v === 'rec') {
        const rec = el('div', 'rec mk-abs', wrap, '<i></i><b>REC</b><span></span>'), dot = rec.firstChild, tcEl = rec.lastChild;
        const bat = el('div', 'bat mk-abs', wrap, '<i></i><i></i><i></i>');
        ctx.measure(() => {
          tcEl.textContent = '00:00:00:00'; const f = fitw(rec, P ? 26 : 24, 14, R.w * .6); Object.assign(rec.style, { left: (R.x + 30) + 'px', top: (R.y + 26) + 'px' });
          const b = fitLab(P ? 24 : 22, R.w * .36); const by = R.y + 26 + (f.h - 22) / 2;
          box(bat, R.r - 30 - 46, by, 46, 22); bat.style.height = '22px';
          if (lab) Object.assign(lab.style, { left: (R.r - 30 - 46 - 18 - b.w) + 'px', top: (R.y + 26 + (f.h - b.h) / 2) + 'px' });
        });
        S(c0, 'blip', .2, 0, { n: 3 }); S(c0 + .28, 'snap', .16);
        const flick = (t, a) => (t < a ? 0 : t > a + .3 ? 1 : (rnd(Math.floor(t * 30), 97) > .45 ? 1 : .15));
        return {
          update(t) {
            const out = 1 - leave(t, slot), o = flick(t, c0 + .3) * out;
            set(rec, { o }); set(bat, { o }); if (lab) set(lab, { o });
            dot.style.opacity = Math.floor((t - c0) * 2) % 2 ? '.25' : '1';
            tcEl.textContent = tcode(t - c0 - .3);
          },
          fg(c, t) {
            const a = 1 - leave(t, slot), k1 = EZ.out5(pr(t, c0, c0 + .18)), k2 = EZ.inout(pr(t, c0 + .16, c0 + .42)); if (a <= .002 || k1 <= 0) return;
            c.save(); clipCard(c, g);
            const cx = R.x + R.w / 2, cy = R.y + R.h / 2, w = R.w * k1, h = Math.max(2, R.h * k2);
            if (k2 < 1) { c.fillStyle = `rgba(255,255,255,${(.85 * (1 - k2) * a).toFixed(3)})`; c.fillRect(cx - w / 2, cy - h / 2, w, Math.min(h, 3)); MK.fx.glow(c, cx, cy, w * .3, T().aLite, (1 - k2) * a); }
            const x0 = cx - w / 2, y0 = cy - h / 2, arm = 34;
            c.strokeStyle = `rgba(255,255,255,${(.16 * a).toFixed(3)})`; c.lineWidth = 1.5; c.strokeRect(x0, y0, w, h);
            c.strokeStyle = `rgba(255,255,255,${(.85 * a).toFixed(3)})`; c.lineWidth = 3;
            if (k2 > .5) for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x0 + w, y0, -1, 1], [x0 + w, y0 + h, -1, -1], [x0, y0 + h, 1, -1]]) { c.beginPath(); c.moveTo(x + dx * arm, y); c.lineTo(x, y); c.lineTo(x, y + dy * arm); c.stroke(); }
            /* 扫描线 + 滚动亮带 */
            c.beginPath(); c.rect(x0, y0, w, h); c.clip();
            c.fillStyle = `rgba(0,0,0,${(.12 * a * k2).toFixed(3)})`; for (let y = y0; y < y0 + h; y += 4) c.fillRect(x0, y, w, 1.5);
            const by = y0 + (((t - c0) / 4) % 1) * (h + 160) - 80, gr = c.createLinearGradient(0, by - 80, 0, by + 80);
            gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, `rgba(255,255,255,${(.05 * a * k2).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
            c.fillStyle = gr; c.fillRect(x0, by - 80, w, 160);
            c.restore();
          },
        };
      }

      /* glow */
      const rr = P ? 34 : 28, N = 480;
      const per = (() => {
        const segs = [[R.x + R.w / 2, R.y, R.r - rr, R.y], ['a', R.r - rr, R.y + rr, -Math.PI / 2], [R.r, R.y + rr, R.r, R.b - rr], ['a', R.r - rr, R.b - rr, 0], [R.r - rr, R.b, R.x + rr, R.b], ['a', R.x + rr, R.b - rr, Math.PI / 2], [R.x, R.b - rr, R.x, R.y + rr], ['a', R.x + rr, R.y + rr, Math.PI], [R.x + rr, R.y, R.x + R.w / 2, R.y]];
        const lens = segs.map(s => (s[0] === 'a' ? Math.PI / 2 * rr : Math.hypot(s[2] - s[0], s[3] - s[1]))), tot = lens.reduce((a, b) => a + b, 0);
        return Array.from({ length: N + 1 }, (_, i) => {
          let d = i / N * tot, j = 0; while (j < segs.length - 1 && d > lens[j]) { d -= lens[j]; j++; }
          const s = segs[j], q = clamp(d / lens[j]);
          if (s[0] === 'a') { const an = s[3] + q * Math.PI / 2; return [s[1] + Math.cos(an) * rr, s[2] + Math.sin(an) * rr]; }
          return [lerp(s[0], s[2], q), lerp(s[1], s[3], q)];
        });
      })();
      ctx.measure(() => { const f = fitLab(P ? 28 : 26, R.w * .6); if (lab) Object.assign(lab.style, { left: (R.x + (R.w - f.w) / 2) + 'px', top: (R.y - f.h / 2) + 'px' }); });
      S(c0, 'swoosh', .22); if (lab) S(c0 + .55, 'ding', .18, 0, { m: 91 });
      return {
        update(t) {
          if (!lab) return;
          const k = pr(t, c0 + .5, c0 + .9), out = leave(t, slot);
          tf(lab, { s: (.3 + .7 * EZ.spring(k)) * (1 - .3 * EZ.in(out)), o: clamp(k * 4) * (1 - out) });
          lab.style.boxShadow = `0 0 ${(16 + 10 * idle(t, c0 + 1, 2.4).wave).toFixed(1)}px rgba(var(--a-rgb),.55)`;
        },
        fg(c, t) {
          const a = 1 - leave(t, slot), k = EZ.inout(pr(t, c0, c0 + .75)); if (a <= .002 || k <= 0) return;
          c.save(); clipCard(c, g);
          const half = Math.round(k * N / 2), br = .78 + .22 * idle(t, c0 + .9, 2.4).wave;
          const gr = c.createLinearGradient(R.x, 0, R.r, 0); gr.addColorStop(0, `rgba(${T().a2},1)`); gr.addColorStop(.5, `rgba(${T().a},1)`); gr.addColorStop(1, `rgba(${T().a2},1)`);
          const stroke = (w, al) => {
            c.globalAlpha = al * a * br; c.strokeStyle = gr; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round';
            c.beginPath(); for (let i = 0; i <= half; i++) c.lineTo(...per[i]); c.stroke();
            c.beginPath(); for (let i = N; i >= N - half; i--) c.lineTo(...per[i]); c.stroke();
          };
          c.globalCompositeOperation = 'lighter';
          stroke(16, .1); stroke(7, .25); stroke(2.4, .95);
          c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
          if (k < 1) { MK.fx.glow(c, ...per[half], 50, T().aLite, a); MK.fx.glow(c, ...per[N - half], 50, T().aLite, a); }
          else {
            const u = (t - c0 - .75) / 4.5;
            for (const off of [0, .5]) { const q = ((u + off) % 1 + 1) % 1; MK.fx.comet(c, per, clamp(q, .002, .998), T().aLite, a, { r: 6, tail: .004 }); }
            for (const [x, y] of [[R.x, R.y], [R.r, R.y], [R.r, R.b], [R.x, R.b]]) MK.fx.glow(c, x, y, 36, T().a, a * br * .8);
          }
          c.restore();
        },
      };
    },
  });
})();
