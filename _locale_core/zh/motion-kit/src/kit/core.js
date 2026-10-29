/* motiongit.caption-publish-safe/1 — editorial preview preset, not platform certification. */
(function(root){
  'use strict';
  if(root.MotionCaptionSafeArea)return;
  const PROFILE='motiongit.caption-publish-safe/1';
  const DEFAULT={bottomRatio:.19,leftRatio:.08,rightRatio:.16};
  function resolve(width,height,value){
    if(height<=width&&value==null)return null;
    if(value!=null&&(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(DEFAULT,k))))
      throw Error('CAPTION_POSITION: use optional bottomRatio, leftRatio, rightRatio; keep original text and times.');
    const p={...DEFAULT,...value};
    for(const[k,v]of Object.entries(p))if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>=1)
      throw Error('CAPTION_POSITION: '+k+' must be a finite ratio in [0,1).');
    if(p.leftRatio+p.rightRatio>=.8)
      throw Error('CAPTION_POSITION: insufficient reading space; review the publish preview and adjust the optional position.');
    const side=height>width?Math.max(p.leftRatio,p.rightRatio):null;
    const left=width*(side??p.leftRatio),right=width*(1-(side??p.rightRatio));
    return {profile:PROFILE,...p,left,right,
      bottom:height*(1-p.bottomRatio),top:height*.1,width:right-left,height};
  }
  function page(){
    const input=root.MOTION_INPUTS?.timeline||root.KINETIC_INPUT||root.MOTION_CONFIG;
    if(input){
      const portrait=input.layout==='portrait';
      return input.captionSafeArea==='frame'||!portrait?null:resolve(1080,1920,input.captionPosition);
    }
    const c=typeof CONFIG!=='undefined'?CONFIG:root.CONFIG;
    if(c&&(c.height||1080)>(c.width||1920))return resolve(c.width||1920,c.height||1080,c.subtitlePosition);
    return null;
  }
  function position(element,p){
    if(!p)return;
    Object.assign(element.style,{top:'auto',bottom:(p.height-p.bottom)+'px',left:p.left+'px',
      right:'auto',width:p.width+'px',boxSizing:'border-box'});
    element.dataset.captionSafeArea=PROFILE;
  }
  // Preserve exact display characters, including spaces at explicit line boundaries.
  // This is typography only: it creates no new cue, word timestamp, or semantic cut.
  function wrap(element,text,width,language,maxLines=2){
    const style=getComputedStyle(element),context=document.createElement('canvas').getContext('2d');
    context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const units=[...new Intl.Segmenter(language||'zh',{granularity:'word'}).segment(text)].map(x=>x.segment);
    const lines=[''];
    for(const unit of units){
      if(context.measureText(unit).width>width+.1)throw Error('CAPTION_READABLE_WIDTH: a complete word exceeds the reading area. Re-layout the visual or use a reviewed phrase boundary; never squeeze or clip the subtitle.');
      if(lines.at(-1)&&context.measureText(lines.at(-1)+unit).width>width+.1)lines.push('');
      lines[lines.length-1]+=unit;
    }
    if(lines.length>maxLines)throw Error('CAPTION_READABLE_LINES: complete caption needs more than two lines. Use an actual reviewed phrase boundary or adjust the available layout; keep full meaning and real times.');
    element.replaceChildren();
    for(const text of lines){const line=document.createElement('span');line.className='publish-caption-line';
      line.style.cssText='display:block;white-space:pre';line.textContent=text;element.append(line);}
    return lines;
  }
  function reflowUnits(box,width,maxLines=2){
    const originals=[...box.children],rows=[];
    for(const old of originals){
      let row=[];rows.push(row);let used=0;
      for(const unit of [...old.children]){
        unit.style.display='inline-block';unit.style.whiteSpace='pre';
        const w=unit.getBoundingClientRect().width;
        if(w>width+.1)throw Error('CAPTION_READABLE_WIDTH: re-layout a complete measured word; never invent smaller word intervals.');
        if(row.length&&used+w>width+.1){row=[];rows.push(row);used=0;}
        row.push(unit);used+=w;
      }
    }
    if(rows.length>maxLines)throw Error('CAPTION_READABLE_LINES: keep complete captions and use reviewed phrase/layout adjustments.');
    box.replaceChildren();for(const units of rows){const line=document.createElement('div');line.style.whiteSpace='pre';line.append(...units);box.append(line);}
  }
  function visible(element){
    for(let e=element;e&&e!==document.body;e=e.parentElement){const s=getComputedStyle(e);
      if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)<.04)return false;}
    return true;
  }
  /* motiongit.caption-visible-inset/1: unsupported geometry stays conservative. */
  function insetRect(element,style,cache){
    if(cache.has(element))return cache.get(element);
    let result=null;
    const match=style.clipPath.match(/^inset\(([^()]+)\)$/);
    if(match){
      const values=match[1].trim().split(/\s+/),length=/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|%)?$/;
      // Only axis-aligned, positive 2D transforms have a correct mapping from
      // the border box to this screen rectangle. Never use an AABB as though
      // it were the shape of a rotated/skewed/perspective clipping window.
      let aligned=values.length>=1&&values.length<=4;
      for(let e=element;aligned&&e;e=e.parentElement){const s=getComputedStyle(e);
        if((s.rotate&&s.rotate!=='none')||(s.scale&&s.scale!=='none')||
          (s.offsetPath&&s.offsetPath!=='none')||(s.perspective&&s.perspective!=='none'))aligned=false;
        if(s.transform!=='none')try{const m=new DOMMatrixReadOnly(s.transform);
          if(!m.is2D||m.b!==0||m.c!==0||m.a<=0||m.d<=0)aligned=false;
        }catch{aligned=false;}
      }
      const size=(axis)=>{let n=parseFloat(style[axis]);
        if(style.boxSizing!=='border-box')for(const key of axis==='width'?['paddingLeft','paddingRight','borderLeftWidth','borderRightWidth']:['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'])n+=parseFloat(style[key]);
        return n;
      };
      const width=size('width'),height=size('height');
      if(aligned&&width>0&&height>0&&Number.isFinite(width)&&Number.isFinite(height)){
        const expanded=values.length===1?[values[0],values[0],values[0],values[0]]:
          values.length===2?[values[0],values[1],values[0],values[1]]:
          values.length===3?[values[0],values[1],values[2],values[1]]:values;
        const offsets=expanded.map((value,index)=>{const m=value.match(length);
          if(!m||(!m[2]&&Number(m[1])!==0))return NaN;
          return Number(m[1])*(m[2]==='%'?(index%2?width:height)/100:1);
        });
        const [top,right,bottom,left]=offsets;
        // Overconstrained insets have CSS proportional reduction rules. Keep
        // the original conservative bounds instead of guessing those shapes.
        if(offsets.every(Number.isFinite)&&left+right<=width&&top+bottom<=height){
          const b=element.getBoundingClientRect(),sx=b.width/width,sy=b.height/height;
          result={left:b.left+left*sx,right:b.right-right*sx,top:b.top+top*sy,bottom:b.bottom-bottom*sy};
        }
      }
    }
    cache.set(element,result);return result;
  }
  function clippedRect(box,element,cache,ownOverflow=false,insets=true){
    let r={left:box.left,right:box.right,top:box.top,bottom:box.bottom};
    for(let e=element;e&&e!==document.body;e=e.parentElement){const s=getComputedStyle(e),b=e.getBoundingClientRect();
      if(e!==element||ownOverflow){
        if(['hidden','clip'].includes(s.overflowX)){r.left=Math.max(r.left,b.left);r.right=Math.min(r.right,b.right);}
        if(['hidden','clip'].includes(s.overflowY)){r.top=Math.max(r.top,b.top);r.bottom=Math.min(r.bottom,b.bottom);}
      }
      if(insets&&s.clipPath!=='none'){const c=insetRect(e,s,cache);if(c){
        r.left=Math.max(r.left,c.left);r.right=Math.min(r.right,c.right);
        r.top=Math.max(r.top,c.top);r.bottom=Math.min(r.bottom,c.bottom);
      }}
    }
    return r;
  }
  function rect(element,cache,insets=true){return clippedRect(element.getBoundingClientRect(),element,cache,false,insets);}
  function inspect(){
    const p=page();if(!p)return {profile:PROFILE,enabled:false,hits:[],captions:[]};
    const hits=[],captions=[],insetCache=new WeakMap(),selector='.mk-cap,#vivid-captions,.native-subtitles,#user-captions,#captions';
    const obstacles=[...document.querySelectorAll('img,video,[data-caption-obstacle],.mk-title,.mk-cta')].filter(e=>{
      if(e.closest(selector)||e.closest('#vivid-mark,[data-motiongit-signature],[data-motiongit-source-clock]')||!visible(e))return false;
      const b=rect(e,insetCache);if(b.right-b.left<=4||b.bottom-b.top<=4)return false;
      // A narrow visible strip of a large subject still obstructs a caption;
      // clipping must not turn that subject into an ignored small icon.
      const original=e.getBoundingClientRect();return !e.matches('img,video')||original.width>=120&&original.height>=120;
    });
    const textObstacles=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    for(let node;node=walker.nextNode();){
      const e=node.parentElement;if(!node.textContent.trim()||!e||e.closest(selector)||!visible(e)||
        e.closest('script,style,#hud,[data-motiongit-hud],[data-motiongit-content-header],[data-motiongit-source-clock]')||parseFloat(getComputedStyle(e).fontSize)<24)continue;
      const range=document.createRange();range.selectNode(node);
      for(const original of range.getClientRects()){const b=clippedRect(original,e,insetCache,true);
        if(b.right-b.left>4&&b.bottom-b.top>4)textObstacles.push({tag:'TEXT',text:node.textContent,rect:b});}
    }
    for(const element of document.querySelectorAll(selector)){
      if(!element.textContent.trim()||!visible(element))continue;
      // Keep the previous caption bounds: clipping its own text must never
      // disguise an out-of-area caption as a valid, shorter visible box.
      const b=rect(element,insetCache,false),row={selector:element.id?'#'+element.id:'.'+element.classList[0],text:element.textContent,rect:b};
      captions.push(row);
      // Two pixels allow glyph stroke/raster rounding, not a lower publish position.
      if(b.left<p.left-2||b.right>p.right+2||b.top<p.top||b.bottom>p.bottom+2)
        hits.push({...row,kind:'caption-outside-publish-area'});
      for(const obstacle of obstacles){const a=rect(obstacle,insetCache);
        if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>4&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>4)
          hits.push({...row,kind:'caption-subject-overlap',obstacle:{tag:obstacle.tagName,id:obstacle.id,classes:obstacle.className,rect:a}});
      }
      for(const obstacle of textObstacles){const a=obstacle.rect;
        if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>4&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>4)
          hits.push({...row,kind:'caption-readable-text-overlap',obstacle});
      }
    }
    return {profile:PROFILE,enabled:true,preset:'short-video-editorial',officialPlatformGuarantee:false,
      readingArea:{left:p.left,right:p.right,top:p.top,bottom:p.bottom},captions,hits,
      embeddedCaptionPixels:'Not detectable from DOM geometry. Review actual media frames separately.'};
  }
  function assertFrame(){const report=inspect();root.CAPTION_SAFE_STATE=report;
    if(report.hits.length)throw Error('CAPTION_PUBLISH_SAFE: '+JSON.stringify(report.hits[0])+'. Re-layout the specific media/title in the existing visual area, or adjust the optional caption position after checking the intended publish interface. Preserve the subject and complete text; do not crop, shrink everything, or change cue times.');
    return report;
  }
  root.MotionCaptionSafeArea={profile:PROFILE,defaults:DEFAULT,resolve,page,position,wrap,reflowUnits,inspect,assertFrame};
})(globalThis);

/* motion-kit · core.js
   标准控件的运行时：时间求值、缓动、元素摆放、文字自适应、音效提示、控件注册。
   所有动画由 t（秒）直接求值，可任意跳帧；不读系统时间，不用未设种子的随机数。 */
(function () {
  'use strict';
  const K = window.MK = {};

  /* ---------- 数学与缓动 ---------- */
  const clamp = K.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = K.lerp = (a, b, x) => a + (b - a) * x;
  const pr = K.pr = (t, a, b) => (b <= a ? (t >= a ? 1 : 0) : clamp((t - a) / (b - a)));
  K.hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  K.rnd = (i, k = 0) => K.hash(i * 13.37 + k * 71.1);
  K.noise = t => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return lerp(K.hash(i), K.hash(i + 1), u) * 2 - 1; };
  const EZ = K.EZ = {
    out: x => 1 - Math.pow(1 - x, 3),
    out5: x => 1 - Math.pow(1 - x, 5),
    expo: x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inout: x => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    in: x => x * x * x,
    back: x => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
    spring: x => (x >= 1 ? 1 : 1 - Math.exp(-7 * x) * Math.cos(8.5 * x) * (1 - x * .2)),
  };
  K.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  /* *强调* → <em>强调</em>（只认成对星号，其余原样转义） */
  K.rich = s => K.esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
  /* 只显示前 n 个字（按去掉星号后的字数），保留 <em> 高亮；用于逐字打出 */
  K.plainLen = s => [...String(s ?? '').replace(/\*/g, '')].length;
  K.richUpTo = (s, n) => {
    let left = n, out = '';
    for (const seg of String(s ?? '').split(/(\*[^*]+\*)/)) {
      if (!seg || left <= 0) continue;
      const em = /^\*.*\*$/.test(seg), body = [...(em ? seg.slice(1, -1) : seg)], take = body.slice(0, left).join('');
      left -= body.length; out += em ? `<em>${K.esc(take)}</em>` : K.esc(take);
    }
    return out;
  };
  /* 按标点把一句话切成短语（不切开 *强调*），用于分句出现 */
  K.phrases = s => {
    const out = []; let cur = '', inEm = false;
    for (const ch of String(s ?? '')) {
      cur += ch; if (ch === '*') inEm = !inEm;
      if (!inEm && /[，。、！？；：,.!?;:]/.test(ch)) { out.push(cur); cur = ''; }
    }
    if (cur.trim()) out.push(cur);
    return out;
  };
  K.rgb = (hex, to = null, k = 0) => {
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const a = p(hex), b = to ? p(to) : a;
    return a.map((v, i) => Math.round(lerp(v, b[i], k))).join(',');
  };

  /* ---------- DOM ---------- */
  K.el = (tag, cls, parent, html) => {
    const e = document.createElement(tag); if (cls) e.className = cls;
    if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e;
  };
  K.box = (e, x, y, w, h) => { Object.assign(e.style, { left: x + 'px', top: y + 'px', width: w + 'px', ...(h != null ? { height: h + 'px' } : {}) }); return e; };
  /* 设置 opacity / transform / filter；全部由当前值算出，不累加 */
  K.set = (e, o = {}) => {
    const op = o.o == null ? 1 : clamp(o.o);
    e.style.opacity = op.toFixed(3);
    e.style.visibility = op <= .002 ? 'hidden' : 'visible';
    const tf = `translate(${(o.x || 0).toFixed(2)}px,${(o.y || 0).toFixed(2)}px) rotate(${(o.r || 0).toFixed(3)}deg) scale(${(o.s == null ? 1 : o.s).toFixed(4)})`;
    e.style.transform = tf;
    e.style.filter = o.blur ? `blur(${o.blur.toFixed(2)}px)` : '';
  };
  K.html = (e, s) => { if (e._h !== s) { e._h = s; e.innerHTML = s; } };

  /* ---------- 入场 / 出场 ---------- */
  /* 统一入场：kind = rise | slam | pop | slide-l | slide-r | blur | mask | type
     返回 0..1 进度。出场 out 由调用者传入（秒）。 */
  K.enter = (e, t, t0, kind = 'rise', opt = {}) => {
    const d = opt.d || ({ slam: .42, pop: .5, mask: .6, blur: .6 }[kind] || .55);
    const x = pr(t, t0, t0 + d), E = EZ.expo(x);
    let o = clamp(x * 3), tx = 0, ty = 0, s = 1, blur = 0, r = 0;
    if (kind === 'rise') { ty = (1 - E) * (opt.dist || 40); blur = (1 - E) * 8; }
    if (kind === 'slam') { s = 1 + (1 - EZ.out5(x)) * (opt.k || .7); o = clamp(x * 5); blur = (1 - x) * 10; }
    if (kind === 'pop') { s = .6 + .4 * EZ.spring(x); o = clamp(x * 5); }
    if (kind === 'slide-l') { tx = -(1 - E) * (opt.dist || 120); blur = (1 - E) * 6; }
    if (kind === 'slide-r') { tx = (1 - E) * (opt.dist || 120); blur = (1 - E) * 6; }
    if (kind === 'blur') { blur = (1 - E) * 18; s = 1 + (1 - E) * .05; }
    if (kind === 'mask') { o = 1; e.style.clipPath = `inset(${((1 - E) * 100).toFixed(2)}% 0 0 0)`; ty = (1 - E) * 24; }
    if (opt.out != null) {
      const y = pr(t, opt.out, opt.out + (opt.od || .35)), Y = EZ.in(y);
      o *= 1 - y; ty -= Y * (opt.oy == null ? 16 : opt.oy); blur += 8 * Y;
    }
    K.set(e, { x: tx + (opt.x || 0), y: ty + (opt.y || 0), s: s * (opt.s || 1), r, o: o * (opt.o == null ? 1 : opt.o), blur });
    return x;
  };
  /* 逐字打出：返回已显示字符数 */
  K.type = (e, text, t, t0, cps = 18, cursor = true) => {
    const ch = [...String(text)], n = Math.floor(clamp((t - t0) * cps / Math.max(1, ch.length)) * ch.length + 1e-6);
    const c = cursor && t >= t0 - .2 && n < ch.length && Math.floor(t * 3.2) % 2 === 0 ? '<span class="mk-caret">▍</span>' : '';
    K.html(e, K.esc(ch.slice(0, n).join('')) + c);
    return n;
  };

  /* ---------- 文字自适应：在给定框内取最大可读字号；装不下抛错，不裁字 ---------- */
  K.fit = (e, max, min, w, h) => {
    /* 居中排版的元素收窄宽度时保持中心不动 */
    const ow = parseFloat(e.style.width), ol = parseFloat(e.style.left);
    e.style.width = w + 'px';
    if (Number.isFinite(ow) && Number.isFinite(ol) && ow !== w && getComputedStyle(e).textAlign === 'center') e.style.left = (ol + (ow - w) / 2) + 'px';
    for (let size = max; size >= min; size--) {
      e.style.fontSize = size + 'px';
      if (e.scrollWidth <= w + 1 && (h == null || e.scrollHeight <= h + 1)) { e.dataset.fit = String(size); return size; }
    }
    throw Error(`文字放不下（最小 ${min}px 仍超出 ${w}×${h}）：${e.textContent.slice(0, 40)}`);
  };

  /* ---------- 音效提示：导出为 sfx.json，由 audio/sfx.py 合成 ---------- */
  K.SFX = []; window.SFX = K.SFX;
  K.S = (t, type, g = 1, p = 0, x = {}) => K.SFX.push(Object.assign({ t: +(+t).toFixed(3), type, g, p }, x));

  /* ---------- 镜头冲击：闪白、震动 ---------- */
  K.FLASH = []; K.SHAKE = [];
  K.flash = (t, k = .5, d = .35) => K.FLASH.push([t, k, d]);
  K.shake = (t, amp = 10, d = .4) => K.SHAKE.push([t, amp, d]);

  /* ---------- 控件注册 ----------
     每个控件：K.control(name, { build(slot, props, ctx) → inst, minDur, sound })
     inst.update(t)：t 为全片秒数；inst 自己根据 slot.t0 / slot.t1 / cues 求值 */
  K.CONTROLS = {};
  K.control = (name, def) => { K.CONTROLS[name] = def; };
  /* 变体：同一控件在一条片子里重复出现时，按出现次序轮换动作（显式 variant 优先）。渲染器的 --plan 用同一规则 */
  K.assignVariants = (segments, variantsOf) => {
    const seen = {};
    return segments.map(sg => {
      const vs = variantsOf(sg.control) || ['default'], k = seen[sg.control] = (seen[sg.control] ?? -1) + 1;
      return sg.variant && vs.includes(sg.variant) ? sg.variant : vs[k % vs.length];
    });
  };
  /* 片段的通用进出：入场 0.6 s 内完成，出场在 t1 前 0.35 s 开始 */
  K.span = (slot, t) => ({ a: pr(t, slot.t0, slot.t0 + .6), out: slot.t1 - .35, live: t >= slot.t0 - .05 && t < slot.t1 + .05 });
  /* 停留中的「第二拍」：同一屏超过 hold 秒没有新动作时，按 beat 节奏给轻微变化（呼吸、扫光），避免画面停死 */
  K.idle = (t, t0, period = 3.2) => { const u = Math.max(0, t - t0); return { u, wave: Math.sin(u * 2 * Math.PI / period), sweep: (u % period) / period }; };

  /* ================= 0.3.0 新增（只加不改：上面的函数与 0.2.0 逐字相同） ================= */

  /* 更多缓动 */
  EZ.elastic = x => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - .75) * 2.0944) + 1);
  EZ.bounce = x => { const n = 7.5625, d = 2.75; return x < 1 / d ? n * x * x : x < 2 / d ? n * (x -= 1.5 / d) * x + .75 : x < 2.5 / d ? n * (x -= 2.25 / d) * x + .9375 : n * (x -= 2.625 / d) * x + .984375; };
  EZ.backIn = x => { const c1 = 1.70158; return (c1 + 1) * x * x * x - c1 * x * x; };
  EZ.sine = x => -(Math.cos(Math.PI * x) - 1) / 2;

  // MotionGit integration patch: preserve a binding's explicit media geometry on
  // the final img node. Controls still own their original animation transforms.
  K.applyMediaPolicy = (im, media) => {
    if (!im || !media) return;
    if (media.fit) im.style.objectFit = media.fit;
    if (media.focus) im.style.objectPosition = `${media.focus.x * 100}% ${media.focus.y * 100}%`;
    if (media.role) im.dataset.mediaRole = media.role;
  };

  /* 自由变换：比 set 多了 sx/sy（非等比缩放）、rx/ry（三维翻转）、p（透视）。同样全部由当前值算出 */
  K.tf = (e, o = {}) => {
    const op = o.o == null ? 1 : clamp(o.o);
    e.style.opacity = op.toFixed(3);
    e.style.visibility = op <= .002 ? 'hidden' : 'visible';
    e.style.transform = `${o.p ? `perspective(${o.p}px) ` : ''}translate(${(o.x || 0).toFixed(2)}px,${(o.y || 0).toFixed(2)}px) rotate(${(o.r || 0).toFixed(3)}deg)` +
      `${o.rx ? ` rotateX(${o.rx.toFixed(2)}deg)` : ''}${o.ry ? ` rotateY(${o.ry.toFixed(2)}deg)` : ''} scale(${(o.sx ?? o.s ?? 1).toFixed(4)},${(o.sy ?? o.s ?? 1).toFixed(4)})`;
    e.style.filter = o.blur ? `blur(${o.blur.toFixed(2)}px)` : '';
  };

  /* 错峰：n 个落点从 t0 起每隔 gap 秒一个；给了 cues 就用 cues */
  K.stagger = (n, t0, gap, cues = []) => Array.from({ length: n }, (_, i) => cues[i] ?? t0 + i * gap);

  /* 拆字 / 拆词：返回 span 数组，保留 *强调*。mode = 'char' | 'word'
     词：按空白切；中文没有空格时按字切。空白渲染成 0.28em 间距（中文里的空格就是词界标记） */
  K.split = (e, s, mode = 'char', cls = 'mk-u') => {
    e.innerHTML = '';
    const out = [];
    for (const seg of String(s ?? '').split(/(\*[^*]+\*)/)) {
      if (!seg) continue;
      const em = /^\*.*\*$/.test(seg), body = em ? seg.slice(1, -1) : seg;
      const parts = mode === 'word' && /\s/.test(String(s)) ? body.split(/(\s+)/) : [...body];
      for (let j = 0; j < parts.length; j++) {
        const p = parts[j];
        if (!p) continue;
        /* 空白：两侧都是中日韩字符时只作词界标记（不占宽），否则是 0.28em 词间距 */
        if (/^\s+$/.test(p)) { const cjk = x => /[\u3000-\u9fff\uff00-\uffef]/.test(x || ''); const g = document.createElement('span'); g.style.display = 'inline-block'; g.style.width = cjk((parts[j - 1] || '').slice(-1)) && cjk((parts[j + 1] || '')[0]) ? '0' : '.28em'; e.appendChild(g); continue; }
        const u = document.createElement(em ? 'em' : 'span'); u.className = cls; u.textContent = p;
        u.style.display = 'inline-block'; u.style.whiteSpace = 'pre'; e.appendChild(u); out.push(u);
      }
    }
    return out;
  };

  /* SVG 描线：path/line/circle 的 stroke 按 k (0..1) 画出 */
  K.draw = (p, k) => {
    if (!p) return;
    if (p._len == null) { try { p._len = p.getTotalLength(); } catch { p._len = 1000; } p.style.strokeDasharray = `${p._len} ${p._len}`; }
    p.style.strokeDashoffset = (p._len * (1 - clamp(k))).toFixed(2);
  };
  K.svg = (parent, w, h, inner = '', cls = '') => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', w); s.setAttribute('height', h); s.setAttribute('viewBox', `0 0 ${w} ${h}`);
    if (cls) s.setAttribute('class', cls);
    s.style.position = 'absolute'; s.style.left = '0'; s.style.top = '0'; s.style.overflow = 'visible';
    s.innerHTML = inner; if (parent) parent.appendChild(s); return s;
  };

  /* 数字格式：千分位 + 固定小数 */
  K.fmt = (v, dec = 0) => (+v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  K.decOf = (...vals) => (vals.some(v => v != null && !Number.isInteger(v)) ? 1 : 0);

  /* 图标：K.icon('check') → 内联 SVG 字符串（图标集见 kit/icons.js；未知名字退回一个圆点） */
  K.ICONS = K.ICONS || {};
  K.icon = (name, size = 48, sw = 2) => {
    const d = K.ICONS[name] || '<circle cx="12" cy="12" r="3"/>';
    return `<svg class="mk-ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  };

  /* 镜头推近：冲击时整幅画面短暂放大 k（0.03 左右），d 秒回落 */
  K.PUNCH = [];
  K.punch = (t, k = .035, d = .45) => K.PUNCH.push([t, k, d]);

  /* 通用画布特效（取主题颜色，主题可在 T.paint 里覆盖同名函数） */
  const FX = K.fx = {};
  const palette = () => (K.T && K.T.palette) || [K.T.a, K.T.w, K.T.g, K.T.a2, K.T.r];
  K.palette = palette;
  /* 彩纸：从 (x, y) 向上喷出，重力下落、翻转 */
  FX.confetti = (c, t, t0, x, y, o = {}) => {
    if (K.T.paint.confetti) return K.T.paint.confetti(c, t, t0, x, y, o);
    const lt = t - t0, life = o.life || 2.2; if (lt < 0 || lt > life) return;
    const n = o.n || 70, cols = o.cols || palette(), seed = o.seed || 0, spread = o.spread ?? 1;
    c.save();
    for (let i = 0; i < n; i++) {
      const an = -Math.PI / 2 + (K.rnd(i, 31 + seed) - .5) * 2.2 * spread, sp = (o.sp || 1300) * (.45 + .55 * K.rnd(i, 32 + seed));
      const vx = Math.cos(an) * sp, vy = Math.sin(an) * sp, drag = 2.2;
      const px = x + vx * (1 - Math.exp(-lt * drag)) / drag + Math.sin(lt * 4 + i) * 18 * lt, py = y + vy * (1 - Math.exp(-lt * drag)) / drag + 380 * lt * lt;
      const al = 1 - pr(lt, life * .65, life), rot = lt * (6 + 10 * K.rnd(i, 33 + seed)) + i, sz = 8 + 9 * K.rnd(i, 34 + seed);
      c.globalAlpha = al; c.fillStyle = `rgb(${cols[i % cols.length]})`;
      c.translate(px, py); c.rotate(rot); c.scale(1, Math.abs(Math.cos(rot * 1.7)) * .8 + .2);
      if (i % 3 === 0) { c.beginPath(); c.arc(0, 0, sz * .45, 0, 7); c.fill(); } else c.fillRect(-sz / 2, -sz * .3, sz, sz * .6);
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    c.restore();
  };
  /* 波纹 / 冲击环：从 (x, y) 扩散的 1–3 个圆环 */
  FX.ripple = (c, t, t0, x, y, o = {}) => {
    const lt = t - t0, life = o.life || .9; if (lt < 0 || lt > life + .3) return;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < (o.rings || 2); k++) {
      const q = pr(lt - k * .14, 0, life); if (q <= 0 || q >= 1) continue;
      c.strokeStyle = `rgba(${o.col || K.T.a},${(1 - q) * .8})`; c.lineWidth = (o.w || 3) * (1 - q) + .5;
      c.beginPath(); c.arc(x, y, (o.r0 || 20) + (o.r || 220) * EZ.out(q), 0, 7); c.stroke();
    }
    c.restore();
  };
  /* 光晕：在 (x, y) 叠一团柔光 */
  FX.glow = (c, x, y, r, col, a = 1) => {
    if (a <= .002) return;
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${col},${.35 * a})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.restore();
  };
  /* 星点闪烁：沿 (x, y, w, h) 区域散布若干闪光十字 */
  FX.twinkle = (c, t, x, y, w, h, n = 12, col, a = 1) => {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const k = Math.max(0, Math.sin(t * (1.6 + K.rnd(i, 41)) * 2 + i * 2.1)), px = x + K.rnd(i, 42) * w, py = y + K.rnd(i, 43) * h, s = (4 + 8 * K.rnd(i, 44)) * k;
      if (s < .5) continue;
      c.strokeStyle = `rgba(${col || K.T.aLite},${.8 * k * a})`; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(px - s, py); c.lineTo(px + s, py); c.moveTo(px, py - s); c.lineTo(px, py + s); c.stroke();
    }
    c.restore();
  };
  /* 拖尾光点：沿折线 pts 在进度 k 处画一颗带尾巴的亮点 */
  FX.comet = (c, pts, k, col, a = 1, o = {}) => {
    if (a <= .002 || k <= 0 || k >= 1 || pts.length < 2) return;
    const at = q => { const L = pts.length - 1, f = clamp(q) * L, i = Math.min(L - 1, Math.floor(f)), u = f - i; return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u)]; };
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    for (let j = 0; j < 14; j++) { const q = k - j * (o.tail || .006), [px, py] = at(q); if (q < 0) break; c.fillStyle = `rgba(${col},${a * (1 - j / 14) * .7})`; c.beginPath(); c.arc(px, py, (o.r || 7) * (1 - j / 18), 0, 7); c.fill(); }
    const [hx, hy] = at(k); FX.glow(c, hx, hy, 60, col, a);
    c.restore();
  };
})();

/* Measured cue utilities. No timing inference and no native clock changes. */
(function (root) {
  'use strict';
  const originals = new WeakMap();
  function complete(slot, count) {
    return slot.cues.length === count && slot.cues.every((t, i, cues) =>
      Number.isFinite(t) && t >= slot.t0 && t < slot.t1 && (!i || t >= cues[i - 1]));
  }
  function follows(slot, count) {
    return root.MOTION_INPUTS?.timeline?.narrationVisualMode === 'follow-speech' && complete(slot, count);
  }
  function focus(slot, at, time, index, fallback) {
    if (!slot.cues.length) return fallback();
    const latest = Math.max(-Infinity, ...at.filter(t => time >= t));
    // One genuine sentence can introduce a complete group simultaneously.
    // Equal measured cues must not invent an internal item order.
    return at[index] === latest ? Math.min(1, Math.max(0, (time - at[index]) / .3)) : 0;
  }
  function reveal(node, time, at, enabled) {
    if (!node) return;
    if (!enabled) {
      if (originals.has(node)) { node.style.visibility = originals.get(node); originals.delete(node); }
      return;
    }
    if (!originals.has(node)) originals.set(node, node.style.visibility);
    node.style.visibility = time < at ? 'hidden' : originals.get(node);
  }
  root.MotionNarrationCue = { complete, follows, focus, reveal };
})(globalThis);

/* Optional composition only. Existing projects keep their geometry and clocks. */
(function (root) {
  'use strict';
  const enabled = () => root.MOTION_INPUTS?.timeline?.narrationCardLayout === 'balanced' || root.MOTION_INPUTS?.timeline?.narrationLayout === 'balanced';
  const compact = (area, portrait, count) => portrait && area.h < 1000 && count >= 3;
  const horizontal = (portrait, variant, count, area) => compact(area, portrait, count) || (variant === 'grid' ? !portrait : portrait || (variant === 'row' && count === 2));
  function layout(area, portrait, variant, items, headerHeight) {
    const n = items.length, horiz = horizontal(portrait, variant, n, area);
    const described = items.some(it => it.text), stack = variant === 'stack';
    const cols = variant === 'grid' || compact(area, portrait, n) ? 2 : horiz && portrait ? 1 : n;
    const rows = Math.ceil(n / cols), gap = stack ? (portrait ? 68 : 88) : 60;
    // Leave room for the existing focus scale/lift and the stack's rotation.
    const margin = stack ? 48 : 30, width = area.w - margin * 2;
    const w = Math.min((width - gap * (cols - 1)) / cols,
      cols === 1 ? (stack ? area.w * .86 : width) : horiz ? 620 : 410);
    const wanted = horiz ? (described ? 246 : 212) : (described ? 380 : 268);
    const headGap = headerHeight ? 30 : 0;
    const h = Math.min(wanted, (area.h - headerHeight - headGap - margin * 2 - gap * (rows - 1)) / rows);
    const bodyHeight = rows * h + (rows - 1) * gap;
    const headerY = Math.max(margin, (area.h - headerHeight - headGap - bodyHeight) * .42);
    const y0 = headerY + headerHeight + headGap;
    const rects = items.map((_, i) => {
      const row = Math.floor(i / cols), count = Math.min(cols, n - row * cols);
      const x0 = (area.w - count * w - (count - 1) * gap) / 2;
      const u = count > 1 ? (i % cols) / (count - 1) * 2 - 1 : 0;
      return { x: x0 + (i % cols) * (w + gap), y: y0 + row * (h + gap), w, h,
        rot: stack ? (portrait ? (i % 2 ? 2 : -2) : u * 6) : 0 };
    });
    return { headerY, rects };
  }
  root.MotionNarrationCards = { enabled, horizontal, layout };
})(globalThis);

/* New-production layout opt-in. Original geometry and all action clocks remain. */
(function (root) {
  'use strict';
  const enabled = () => root.MOTION_INPUTS?.timeline?.narrationLayout === 'balanced';
  const fit = (...args) => root.MK.fit(...args), box = (...args) => root.MK.box(...args);
  function material(wrap, nodes) {
    const probe = root.MK.el('div', 'mk-glass', wrap);
    probe.style.visibility = 'hidden';
    const style = getComputedStyle(probe);
    for (const node of nodes) for (const key of ['background-image','background-color','border-color','border-radius','box-shadow','--tx','--dim'])
      node.style.setProperty(key, style.getPropertyValue(key), 'important');
    probe.remove();
  }
  function heading(title, area) {
    if (!title) return 0;
    title.style.whiteSpace = 'normal';
    fit(title, 68, 36, area.w - 48, 100);
    return title.offsetHeight;
  }
  function list(area, title, rows, variant, wrap, reserved = false) {
    const H = heading(title, area), pad = variant === 'cards' ? 12 : 0;
    const gap = reserved && rows.length > 1 ? Math.min(18, Math.max(4, (area.h - 48 - H - 30 - rows.length * (pad * 2 + 32)) / (rows.length - 1))) : 18;
    const h = Math.min(variant === 'cards' ? 92 : 80, (area.h - 48 - H - 30 - gap * (rows.length - 1)) / rows.length);
    const body = rows.length * h + (rows.length - 1) * gap;
    const y = Math.max(24, (area.h - H - 30 - body) * .35), top = y + H + 30;
    box(title, 24, y, area.w - 48);
    const badge = Math.min(48, h - pad * 2), xpad = pad ? 18 : 0;
    rows.forEach(({ r, tx, idx }, i) => {
      box(r, 24, top + i * (h + gap), area.w - 48, h);
      r.style.setProperty('width', (area.w - 48) + 'px', 'important');
      r.style.padding = `${pad}px ${xpad}px`;r.style.gap = '18px';
      Object.assign(idx.style, { width: badge + 'px', height: badge + 'px', fontSize: Math.min(26, badge * .5) + 'px' });
      fit(tx, Math.min(54, (h - pad * 2) / 1.2), 24, area.w - 48 - xpad * 2 - badge - 20, h - pad * 2);
    });
    if (variant === 'cards') material(wrap, rows.map(r => r.r));
    return { top, gap: h + gap, railX: 24 + xpad + badge / 2, railY: h / 2 };
  }
  function steps(area, title, cards, points, variant, portrait, reserved = false) {
    const H = heading(title, area), n = cards.length, pad = variant === 'cards' ? 14 : 0;
    const gap = portrait ? (reserved && n > 1 ? Math.min(20, Math.max(8, (area.h - H - 92 - n * (pad * 2 + 32)) / (n - 1))) : 20) : 34;
    if (portrait) {
      const h = Math.min(112, (area.h - H - 92 - gap * (n - 1)) / n);
      const body = n * h + (n - 1) * gap, y = Math.max(24, (area.h - H - 32 - body) * .35);
      if (title) box(title, 24, y, area.w - 48);
      cards.forEach(({ c, nm }, i) => {
        const cy = y + H + 32 + i * (h + gap);
        points[i].x = 48;points[i].y = cy + h / 2;
        box(c, 110, cy, area.w - 140, h);c.style.padding = `${pad}px 18px`;
        fit(nm, Math.min(52, (h - pad * 2) / 1.25), 24, area.w - 140 - 36 - 58, h - pad * 2);
      });
      return area.w - 140;
    }
    const w = (area.w - 48 - gap * (n - 1)) / n, h = variant === 'cards' ? 148 : 116;
    const rise = variant === 'ladder' ? 112 : 0, used = h + rise + 60;
    const y = Math.max(24, (area.h - H - 36 - used) * .35);
    if (title) box(title, 24, y, area.w - 48);
    const start = y + H + 36;
    cards.forEach(({ c, nm }, i) => {
      const x = 24 + i * (w + gap), cy = variant === 'ladder' ? start + rise * (1 - i / Math.max(1, n - 1)) : start + 52;
      points[i].x = x + w / 2;points[i].y = variant === 'ladder' ? cy + h + 28 : start;
      box(c, x, cy, w, h);c.style.padding = `${pad}px ${pad}px`;
      fit(nm, 46, 24, w - pad * 2, h - pad * 2 - 42);
    });
    return w;
  }
  function comparison(area, portrait, props, reserved = false) {
    const count = Math.max(props.left.lines?.length || 0, props.right.lines?.length || 0);
    const margin = reserved && portrait && props.verdict ? 24 : 30, gap = portrait ? 74 : reserved ? 64 : 96, verdict = props.verdict ? (reserved && portrait ? 88 : 112) : 24;
    const h = Math.min((portrait ? 184 : 210) + count * (portrait ? 48 : 52), portrait ? (area.h - margin * 2 - gap - verdict) / 2 : area.h - margin * 2 - verdict);
    const body = portrait ? h * 2 + gap : h, y = Math.max(margin, (area.h - body - verdict) * .38);
    const w = portrait ? area.w - margin * 2 : (area.w - margin * 2 - gap) / 2;
    return { L: { x: margin, y, w, h }, R: { x: portrait ? margin : margin + w + gap, y: portrait ? y + h + gap : y, w, h },
      vs: { x: area.w / 2, y: portrait ? y + h + gap / 2 : y + h / 2 }, verdictY: y + body + 66 };
  }
  function compareText(sides, verdict, area, variant) {
    const pad = variant === 'panels' ? 20 : 8;
    for (const side of sides) {
      side.c.style.padding = pad + 'px 24px';
      const w = side.g.w - 48;
      fit(side.lab, 24, 18, w, 36);
      const bigBudget = side.g.h - pad * 2 - side.lab.offsetHeight - 8 - side.lines.length * 36;
      fit(side.big, 84, 32, w, Math.min(108, Math.max(44, bigBudget)));
      const free = side.g.h - pad * 2 - side.lab.offsetHeight - 8 - side.big.offsetHeight - side.lines.length * 4;
      for (const line of side.lines) fit(line, 38, 20, w, free / side.lines.length);
    }
    if (verdict) {
      const chip = verdict.querySelector('.mk-chip');
      fit(chip, 32, 22, area.w - 100, 92);chip.style.width = 'max-content';chip.style.maxWidth = (area.w - 60) + 'px';
    }
  }
  function prosCards(area, portrait, count, header, verdict) {
    const margin = 30, gap = 64, columns = !portrait || (area.h < 1000 && count >= 3);
    const reserve = verdict ? 92 : 24, desired = 120 + count * (portrait ? 64 : 76);
    const h = Math.min(desired, columns ? area.h - header - 52 - reserve - margin * 2 : (area.h - header - 52 - reserve - margin * 2 - gap) / 2);
    const body = columns ? h : h * 2 + gap, headerY = Math.max(margin, (area.h - header - 52 - body - reserve) * .35);
    const w = columns ? (area.w - margin * 2 - gap) / 2 : area.w - margin * 2;
    return { headerY, rects: [0, 1].map(i => ({ x: columns ? margin + i * (w + gap) : margin, y: headerY + header + 52 + (columns ? 0 : i * (h + gap)), w, h })) };
  }
  function prosText(card, r) {
    card.c.style.padding = '24px';card.h.style.fontSize = '28px';card.h.style.lineHeight = '1.25';
    const list = card.c.querySelector('.ls');list.style.marginTop = '18px';
    const rh = Math.min(76, (r.h - 48 - card.h.offsetHeight - 18) / card.rows.length);
    card.rows.forEach(row => {row.r.style.height = rh + 'px';fit(row.tx, Math.min(38, rh * .65), 18, r.w - 48 - 66, rh - 6);});
  }
  root.MotionNarrationLayout = { enabled, list, steps, comparison, compareText, prosCards, prosText };
})(globalThis);
