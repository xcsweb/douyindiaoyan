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

/* Shared output-clock captions. Preserve text and half-open cue intervals. */
if (typeof SUBS !== 'undefined' && CONFIG.subtitles !== false) (() => {
/* motiongit primary-language captions v1 */
  const subtitleLanguage=CONFIG.subtitleLanguage||"zh";
  if(!['zh','en','bilingual'].includes(subtitleLanguage))throw Error('Invalid subtitleLanguage');
  const portrait = (CONFIG.height || 1080) > (CONFIG.width || 1920);
  const presets = {
    standard: {top:872, gap:8, zhSize:44, enSize:26, compact:false},
    'large-en': {top:940, gap:6, zhSize:44, enSize:30, compact:true},
  };
  const name = CONFIG.subtitlePreset || 'standard';
  if (!presets[name]) throw Error(`Unknown subtitlePreset: ${name}`);
  const style = {...presets[name], ...(portrait ? {zhSize:50,enSize:30} : {}), ...CONFIG.subtitleStyle};
  const position = CONFIG.subtitlePosition ?? (portrait ? {bottomRatio:.19,leftRatio:.08,rightRatio:.16} : null);
  const width = CONFIG.width || 1920, height = CONFIG.height || 1080;
  const highlightColor=CONFIG.subtitleHighlightColor||'#7cc8ff';
  if(!CSS.supports('color',highlightColor))throw Error('Invalid subtitleHighlightColor');
  const colorProbe=document.createElement('canvas').getContext('2d');colorProbe.fillStyle=highlightColor;
  const rgb=colorProbe.fillStyle.match(/^#([\da-f]{6})$/i);
  if(!rgb)throw Error('subtitleHighlightColor must resolve to an opaque RGB color');
  const highlightRGB=[0,2,4].map(i=>parseInt(rgb[1].slice(i,i+2),16));
  const endPunctuation=CONFIG.subtitleEndPunctuation??'omit-comma-period';
  if(!['omit-comma-period','preserve'].includes(endPunctuation))throw Error('Invalid subtitleEndPunctuation');
  // Display-only projection. Validate the untouched reference/ASR units first.
  function trimDisplayEnd(el){
    if(endPunctuation==='preserve')return;
    const text=el.textContent,tail=text.match(/[，。,.\s]+$/u);
    if(!tail||!/[，。,.]/u.test(tail[0]))return;
    let remaining=tail[0].length;
    const nodes=[],walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    for(let n=walker.nextNode();n;n=walker.nextNode())nodes.push(n);
    for(const n of nodes.reverse()){const take=Math.min(remaining,n.length);n.deleteData(n.length-take,take);remaining-=take;if(!remaining)break;}
    for(const span of el.querySelectorAll('[data-word-start]'))if(!span.textContent)span.remove();
  }
  function validateHighlight(g){
    const h=g.highlight;if(!h)return;
    if(!['asr-word-boundaries','verified-word-boundaries'].includes(h.source)||!['zh','en'].includes(h.language)||!Array.isArray(h.units)||!h.units.length)throw Error('Caption highlight requires measured primary-language word boundaries');
    let previous=g.t0;
    for(const u of h.units){if(typeof u.text!=='string'||!u.text||!Number.isFinite(u.start)||!Number.isFinite(u.end)||u.start<previous-.001||u.end<u.start||u.start<g.t0-.001||u.end>g.t1+.001)throw Error('Invalid caption highlight word interval');previous=u.end;}
    if(h.units.map(u=>u.text).join('')!==g[h.language])throw Error('Highlight units must preserve caption text exactly');
    if(g.formatting)throw Error('Highlight units use literal text; formatted captions need plain-text alignment');
  }
  SUBS.forEach(validateHighlight);
  for(const g of SUBS)if(subtitleLanguage!=='bilingual'){
    if(typeof g[subtitleLanguage]!=='string'||!g[subtitleLanguage].trim())throw Error('Missing primary-language caption');
    if(g.highlight&&g.highlight.language!==subtitleLanguage)throw Error('Primary subtitle language disagrees with measured speech words');
  }
  const box = document.createElement('div'); box.className='native-subtitles';
  box.dataset.captionClock='final-output';
  box.style.cssText=`position:absolute;display:flex;flex-direction:column;align-items:center;gap:${style.gap}px;pointer-events:none;box-sizing:border-box`;
  // Inline priority deliberately beats frozen legacy portrait stylesheets.
  const set = (k,v) => box.style.setProperty(k,v,'important');
  if (position) {
    for (const key of ['bottomRatio','leftRatio','rightRatio']) if (!Number.isFinite(position[key]) || position[key]<0 || position[key]>=1) throw Error('Invalid subtitlePosition.'+key);
    if (position.leftRatio+position.rightRatio>=.9) throw Error('Insufficient caption width');
    set('top','auto'); set('bottom',`${height*position.bottomRatio}px`);
    const side=height>width?Math.max(position.leftRatio,position.rightRatio):null;
    set('left',`${width*(side??position.leftRatio)}px`); set('right',`${width*(side??position.rightRatio)}px`);
  } else { set('top',`${style.top}px`);set('bottom','auto');set('left','0');set('right','0'); }
  set('width','auto');set('max-width','none');
  const ov=document.getElementById('ov');if(!ov)throw Error('Missing caption mount #ov');ov.appendChild(box);
  // Measure the loaded font. Layout uses explicit word/phrase boundaries;
  // CSS wrapping, clipping and shrinking an unreadable long cue are forbidden.
  const layout = el => {
    const original=el.textContent, maxLines=CONFIG.subtitleLayout?.maxLines??2;
    if(!Number.isInteger(maxLines)||maxLines<1||maxLines>2)throw Error('subtitleLayout.maxLines must be 1 or 2');
    const nodes=[];const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    for(let n=walker.nextNode();n;n=walker.nextNode())nodes.push(n);
    const point=index=>{let off=0;for(const n of nodes){if(index<=off+n.length)return[n,index-off];off+=n.length;}return[nodes.at(-1),nodes.at(-1)?.length??0];};
    const range=(a,b)=>{const r=document.createRange();const [s,so]=point(a),[e,eo]=point(b);r.setStart(s,so);r.setEnd(e,eo);return r;};
    if(!original)return;
    const cs=getComputedStyle(el),available=el.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)-2*(parseFloat(cs.webkitTextStrokeWidth)||0);
    const measure=(a,b)=>range(a,b).getBoundingClientRect().width;
    let spans=[];
    const explicit=[...original.matchAll(/\r?\n/g)];
    if(explicit.length){let a=0;for(const m of explicit){spans.push([a,m.index]);a=m.index+m[0].length;}spans.push([a,original.length]);}
    else if(measure(0,original.length)<=available)spans=[[0,original.length]];
    else if(maxLines===2){
      const boundaries=new Intl.Segmenter(el.lang||'zh',{granularity:'word'}).segment(original);
      const closing=/^[，。！？；：、,.!?;:）】》」』％%]/,opening=/[（【《「『]$/;
      const candidates=[];
      const unitEnds=new Set();let unitOffset=0;for(const u of el.querySelectorAll('[data-word-start]')){unitOffset+=u.textContent.length;unitEnds.add(unitOffset);}
      for(const token of boundaries){const at=token.index+token.segment.length;if(at===original.length||closing.test(original.slice(at))||opening.test(original.slice(0,at))||(unitEnds.size&&!unitEnds.has(at)))continue;
        // Keep a number and its common unit together as a semantic boundary.
        if(/[\d.]$/.test(original.slice(0,at))&&/^(?:%|％|毫秒|秒|分钟|小时|帧|像素|积分|元|个|次|px|fps|ms|kg|GB|MB)/i.test(original.slice(at)))continue;
        const left=measure(0,at),right=measure(at,original.length);
        if(left<=available&&right<=available){const semantic=/[，。！？；：、,.!?;:]\s*$/.test(original.slice(0,at))?-.35:0;candidates.push({at,score:Math.abs(left-right)/available+semantic});}
      }
      candidates.sort((a,b)=>a.score-b.score||a.at-b.at);
      if(candidates.length)spans=[[0,candidates[0].at],[candidates[0].at,original.length]];
    }
    if(!spans.length||spans.length>maxLines||spans.some(([a,b])=>measure(a,b)>available+.1))throw Error('Caption exceeds '+maxLines+' readable lines; use verified phrase timestamps or revise caption layout: '+original);
    const fragments=spans.map(([a,b])=>range(a,b).cloneContents());
    el.replaceChildren();fragments.forEach((fragment,i)=>{if(i&&explicit.length)el.append(document.createTextNode(explicit[i-1]?.[0]??'\n'));const line=document.createElement('span');line.className='caption-line';line.style.cssText='display:block;white-space:pre!important;overflow-wrap:normal!important;word-break:keep-all!important';line.append(fragment);el.append(line);});
    el.style.setProperty('white-space','normal','important');
    el.dataset.layoutLines=String(spans.length);el.dataset.layoutWidth=String(available);el.dataset.sourceText=original;
  };
  const create=(text,lang,formatting,highlight) => {
    const el=document.createElement('div');el.className=lang==='zh'?'sz':'se';el.lang=lang;
    el.style.cssText=`display:block;box-sizing:border-box;width:100%;max-width:100%;padding:4px 12px 12px;text-align:center;overflow-wrap:normal;word-break:keep-all;color:#fff;background:transparent;paint-order:stroke fill;text-shadow:none`;
    const primary=subtitleLanguage==='bilingual'?lang==='zh':lang===subtitleLanguage;
    el.dataset.primaryLanguage=String(primary);
    el.style.setProperty('font-size',`${primary?style.zhSize:style.enSize}px`,'important');
    el.style.setProperty('line-height','1.28','important');el.style.setProperty('white-space','pre','important');
    el.style.fontFamily="-apple-system,'PingFang SC',sans-serif";el.style.fontWeight=primary?'600':'500';
    el.style.webkitTextStroke=primary?'4px rgba(10,10,10,.9)':'2.6px rgba(10,10,10,.85)';
    // Exact literal <, &, line breaks and combining characters; never innerHTML.
    if(highlight&&lang===highlight.language){
      el.dataset.highlightSource=highlight.source;
      for(const unit of highlight.units){const span=document.createElement('span');span.textContent=unit.text;
        span.dataset.wordStart=String(unit.start);span.dataset.wordEnd=String(unit.end);
        span.style.cssText='paint-order:stroke fill;-webkit-text-fill-color:currentcolor';
        el.append(span);
      }
    }else if(formatting==='srt-basic'){
      // Only explicit SRT b/i/u tags; attributes and unknown tags stay literal.
      const stack=[el];for(const token of text.split(/(<\/?[biu]>)/gi)){
        const tag=token.match(/^<(\/?)([biu])>$/i);
        if(!tag){stack.at(-1).append(document.createTextNode(token));continue;}
        const name=tag[2].toLowerCase();
        if(!tag[1]){const child=document.createElement(name);stack.at(-1).append(child);stack.push(child);}
        else if(stack.length>1&&stack.at(-1).tagName.toLowerCase()===name)stack.pop();
        else stack.at(-1).append(document.createTextNode(token));
      }
    }else el.textContent=text;
    trimDisplayEnd(el);
    box.appendChild(el);
    if(height>width){
      const originalSize=primary?style.zhSize:style.enSize,minimum=Math.ceil(originalSize*.88);
      for(let size=originalSize;;size--){el.style.setProperty('font-size',size+'px','important');try{layout(el);break;}catch(error){if(size<=minimum||!error.message.startsWith('Caption exceeds '))throw error;}}
    }else layout(el);el.dataset.referenceText=text;el.dataset.endPunctuation=endPunctuation;return el;
  };
  let key='';
  document.fonts.addEventListener('loadingdone',()=>{key='';});
  window.OVERLAY = t => {
    const active=SUBS.filter(g=>t>=g.t0&&t<g.t1);
    if(!active.length){box.style.opacity='0';return;}
    const current=JSON.stringify(active.map(g=>[g.id,g.t0,g.t1,g.zh,g.en,g.formatting,g.highlight]));
    if(current!==key){key='';box.replaceChildren();for(const g of active){validateHighlight(g);if(g.zh&&subtitleLanguage!=='en')create(g.zh,'zh',g.formatting,g.highlight);if(g.en&&subtitleLanguage!=='zh')create(g.en,'en',g.formatting,g.highlight);}key=current;}
    // Pure output-clock sweep: seek/reverse/pause have no accumulated state.
    // A multi-character ASR word retains one real interval, never fake character clocks.
    for(const span of box.querySelectorAll('[data-word-start]')){
      const a=+span.dataset.wordStart,b=+span.dataset.wordEnd,p=b>a?Math.max(0,Math.min(1,(t-a)/(b-a))):+(t>=a);
      span.style.color=`rgb(${highlightRGB.map(c=>Math.round(255+(c-255)*p)).join(',')})`;
      span.dataset.wordProgress=p.toFixed(6);
    }
    const first=active[0];const enter=Math.max(0,Math.min(1,(t-first.t0)/.12));
    box.style.opacity='1';
    // Enter upwards: even the translated box remains above the configured bottom.
    const canvasCenter=width/2;
    const dx=position||CONFIG.subtitleXByStart?.[String(first.t0)]===undefined ? 0 : CONFIG.subtitleXByStart[String(first.t0)]-canvasCenter;
    box.style.transform=`translate(${dx}px,${-10*(1-enter)}px)`;
    box.dataset.cueIds=JSON.stringify(active.map(g=>g.id??g.t0));
    const rect=box.getBoundingClientRect();
    box.dataset.fit=rect.top>=0&&rect.bottom<=height&&rect.left>=0&&rect.right<=width?'fits':'overflow';
  };
  window.CAPTION_LAYOUT_PREFLIGHT=()=>{
    const times=[...new Set(SUBS.flatMap(g=>[g.t0+Math.min(.2,(g.t1-g.t0)/2),g.t1-1e-6]))].sort((a,b)=>a-b);
    let maxLines=0;for(const t of times){window.OVERLAY(t);for(const e of box.querySelectorAll('[data-layout-lines]'))maxLines=Math.max(maxLines,+e.dataset.layoutLines);}
    return {schema:'adu-caption-layout/1',checkedTimes:times.length,maxLines,browserAutoWrap:false,fontStatus:document.fonts.status,timingChanged:false,subtitleLanguage,endPunctuation,referenceTextPreserved:true,highlightCues:SUBS.filter(g=>g.highlight).length,highlightClock:'measured word intervals; output clock'};
  };
})();
