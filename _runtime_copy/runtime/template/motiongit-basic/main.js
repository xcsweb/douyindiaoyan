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

(() => {
  'use strict';
  const C = window.MOTION_CONFIG;
  if (!C) throw Error('Missing normalized MotionGit configuration');
  const W = C.width, H = C.height, portrait = C.layout === 'portrait';
  const stage = document.getElementById('stage');
  stage.className = C.style + (portrait ? ' portrait' : ' landscape');
  Object.assign(stage.style, {width: W + 'px', height: H + 'px'});
  Object.assign(document.documentElement.style, {width: W + 'px', height: H + 'px'});
  Object.assign(document.body.style, {width: W + 'px', height: H + 'px'});
  window.END = C.totalFrames / C.fps;
  window.CONFIG = {fps: C.fps, end: window.END, demo: false};
  window.SFX = [];
  const SOUND = {keyword:'pop', points:'tick', explanation:'slide', conclusion:'check'};
  C.segments.forEach(s => {
    window.SFX.push({t:(s.startFrame+6)/C.fps,type:'whoosh',g:.35,p:0});
    s.cueFrames.forEach(f => window.SFX.push({t:(s.startFrame+f)/C.fps,type:SOUND[s.kind],g:s.kind==='conclusion'?.42:.3,p:0}));
  });
  window.SFX.sort((a,b) => a.t-b.t);

  const box = portrait
    ? {x:70,y:166,w:940,h:C.presenter?560:1394}
    : {x:96,y:148,w:C.presenter?1274:1728,h:650};
  const inset = portrait ? 46 : 60;
  const titleSize = portrait ? 64 : 70;
  const bodySize = portrait ? 47 : 48;
  const captions = document.getElementById('captions');
  const cn = document.getElementById('caption-cn'), en = document.getElementById('caption-en');
  Object.assign(captions.style, {left:portrait?'70px':'230px',top:portrait?'1615px':'870px',width:portrait?'940px':'1460px',height:portrait?'250px':'170px'});
  const publishArea=MotionCaptionSafeArea.page();MotionCaptionSafeArea.position(captions,publishArea);if(publishArea)captions.style.height='auto';
  const presenter = document.getElementById('presenter'), talk = document.getElementById('talk');
  presenter.style.display = C.presenter ? 'block' : 'none';
  Object.assign(presenter.style, portrait
    ? {left:'325px',top:'790px',width:'430px',height:'500px'}
    : {left:'1486px',top:'148px',width:'338px',height:'650px'});
  const hud = document.getElementById('hud');
  Object.assign(hud.style, {left:'96px',top:'44px',width:portrait?'872px':'1728px',height:'48px'});
  document.getElementById('brand').textContent = C.brand;
  const progress = document.getElementById('progress'); progress.style.width=W+'px';
  const timecode = document.getElementById('timecode');
  const clamp = x => Math.max(0,Math.min(1,x));
  const ease = x => 1-(1-clamp(x))**3;
  const smooth = x => {x=clamp(x);return x*x*(3-2*x);};
  const pop = x => {x=clamp(x);return 1+2.70158*(x-1)**3+1.70158*(x-1)**2;};
  const localProgress = (frame,start,length=30) => ease((frame-start)/length);
  const nodes = [];
  function node(tag, className, parent, value) {
    const el = document.createElement(tag); el.className=className;
    if(value !== undefined) el.textContent=value;
    parent.appendChild(el); return el;
  }
  function rect(el,x,y,w,h) {Object.assign(el.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});return el;}
  function motion(el,alpha,x=0,y=0,scale=1,rotate=0) {
    el.style.opacity=String(clamp(alpha));
    el.style.transform=`translate(${x}px,${y}px) scale(${scale}) rotate(${rotate}deg)`;
  }
  function fit(el, max, min, width, height) {
    el.style.width=width+'px';el.style.maxWidth=width+'px';
    for(let size=max;size>=min;size--) {
      el.style.fontSize=size+'px';
      if(el.scrollWidth<=width+1 && el.scrollHeight<=height+1) {
        el.dataset.fitSize=String(size);return;
      }
    }
    throw Error('Text exceeds readable layout capacity: '+el.textContent.slice(0,60));
  }
  function addFit(record,el,max,min,w,h) {record.fits.push({el,max,min,w,h});}
  function base(s,index) {
    const scene = node('section','scene kind-'+s.kind,document.getElementById('scenes'));
    scene.dataset.kind=s.kind;scene.dataset.segment=String(index);
    const panel=rect(node('div','panel',scene),box.x,box.y,box.w,box.h);
    const label=node('span','eyebrow',panel,String(index+1).padStart(2,'0')+' / '+String(C.segments.length).padStart(2,'0'));
    rect(label,inset,28,box.w-inset*2,32);
    const record={s,scene,panel,fits:[],motion:()=>{},contentW:box.w,contentH:box.h};
    if(s.evidence) {
      const e=s.evidence;
      const x=portrait?inset:Math.floor(box.w*.57),y=portrait?box.h-360:146;
      const ew=portrait?box.w-inset*2:box.w-x-32,eh=portrait?320:box.h-y-40;
      const frame=rect(node('div','evidence',panel),x,y,ew,eh);
      const im=node('img','',frame);im.alt='本期证据录屏';
      record.evidence={frame,im,config:e};
      record.contentW=portrait?box.w:x-20;
      record.contentH=portrait?y-28:box.h;
      frame.style.display='none';
    }
    if(C.style==='vivid'&&!s.evidence) {
      const character=node('div','character',panel);
      const face=node('div','character-face',character);node('span','character-mouth',face);
      const left=node('div','character-arm',character),right=node('div','character-arm right',character);
      node('div','character-foot',character);node('div','character-foot right',character);
      record.character={el:character,left,right};
    }
    return record;
  }
  function keyword(r) {
    const BW=r.contentW,BH=r.contentH;
    const {s,panel}=r;
    const wordValue=s.text.trim()||s.title;
    const hasLabel=Boolean(s.text.trim()&&s.title.trim());
    const label=rect(node('h2','keyword-label',panel,hasLabel?s.title:''),inset,100,BW-inset*2,90);
    if(hasLabel)addFit(r,label,portrait?46:44,34,BW-inset*2,90);
    const wy=r.evidence&&portrait?210:hasLabel?portrait?260:230:portrait?230:188;
    const wordH=Math.min(portrait?360:226,BH-wy-70);
    const word=rect(node('h1','keyword-text',panel,wordValue),inset+28,wy,BW-inset*2-56,wordH);
    addFit(r,word,portrait?110:120,56,BW-inset*2-56,wordH);
    const line=rect(node('div','underline',panel),inset+28,wy+wordH+16,BW-inset*2-56,16);
    const a=rect(node('div','bracket lt',panel),inset,wy-24,40,40);
    const b=rect(node('div','bracket rb',panel),BW-inset-40,wy+wordH-24,40,40);
    const ring=node('div','keyword-orbit',panel);
    r.motion=f=>{
      const p=clamp((f-s.cueFrames[0])/32), v=pop(p);
      motion(label,localProgress(f,5),0,(1-localProgress(f,5))*-18);
      motion(word,p,0,(1-v)*85,v, C.style==='vivid'?(1-v)*-5:0);
      line.style.transform=`scaleX(${ease(p)})`;line.style.opacity=String(p);
      motion(a,p,(1-ease(p))*-34,(1-ease(p))*-20);
      motion(b,p,(1-ease(p))*34,(1-ease(p))*20);
      motion(ring,p,0,0,.7+.3*ease(p),f*.12);
    };
  }
  function points(r) {
    const BW=r.contentW,BH=r.contentH;
    const {s,panel}=r,n=s.items.length;
    const title=rect(node('h1','title',panel,s.title),inset,90,BW-inset*2,portrait?142:105);
    addFit(r,title,titleSize,40,BW-inset*2,portrait?142:105);
    let y=portrait?(r.evidence?238:276):232;
    if(s.text.trim()) {
      const intro=rect(node('p','body',panel,s.text),inset,portrait?234:192,BW-inset*2,portrait?96:70);
      addFit(r,intro,portrait?36:32,28,BW-inset*2,portrait?96:70);
      y=portrait?368:282;
    }
    const columns=portrait&&C.presenter&&n>3?2:1,rows=Math.ceil(n/columns);
    if(portrait&&C.presenter)y=s.text.trim()?334:240;
    const columnWidth=(BW-inset*2-(columns-1)*24)/columns;
    const bottom=BH-44,gap=Math.min(portrait?112:77,(bottom-y)/rows);
    if(gap<55)throw Error('Too many points for this layout');
    const rail=rect(node('div','points-rail',panel),inset+26,y+28,4,Math.max(0,(rows-1)*gap));
    const items=s.items.map((value,i)=>{
      const row=rect(node('div','point',panel),inset+(i%columns)*(columnWidth+24),y+Math.floor(i/columns)*gap,columnWidth,gap-12);
      const dot=node('div','point-number',row,String(i+1));
      const label=node('div','point-text',row,value);label.style.flex='1';
      addFit(r,label,portrait?43:42,30,columnWidth-82-(r.character?170:0),gap-14);
      const line=node('div','point-rule',row);return{row,dot,line};
    });
    r.motion=f=>{
      motion(title,localProgress(f,5),0,(1-localProgress(f,5))*-24);
      rail.style.transform=`scaleY(${localProgress(f,s.cueFrames[0],Math.max(24,s.cueFrames[n-1]-s.cueFrames[0]+24))})`;
      items.forEach(({row,dot,line},i)=>{
        const p=localProgress(f,s.cueFrames[i]);
        motion(row,p,(1-p)*(i%2?55:-55),0);
        dot.style.transform=`scale(${.55+.45*pop(clamp((f-s.cueFrames[i])/26))})`;
        line.style.transform=`scaleX(${localProgress(f,s.cueFrames[i]+8,30)})`;
      });
    };
  }
  function explanation(r) {
    const BW=r.contentW,BH=r.contentH;
    const {s,panel}=r;
    const title=rect(node('h1','title',panel,s.title),inset,96,BW-inset*2,portrait?180:128);
    if(s.title.trim())addFit(r,title,titleSize,40,BW-inset*2,portrait?180:128);
    const y=s.title.trim()?(portrait?325:272):140;
    const h=BH-y-(r.character?182:38);
    const line=rect(node('div','explain-rule',panel),inset,y,6,h);
    const body=rect(node('p','body',panel,s.text||s.title),inset+36,y,BW-inset*2-36,h);
    // If only title was supplied, show it once as body.
    if(!s.text.trim())title.style.visibility='hidden';
    addFit(r,body,bodySize,34,BW-inset*2-36,h);
    const dot=rect(node('div','explain-dot',panel),inset-7,y-10,20,20);
    const sweep=rect(node('div','explain-sweep',panel),inset+25,y+5,BW-inset*2-25,68);
    r.motion=f=>{
      const p=localProgress(f,s.cueFrames[0],42);
      motion(title,localProgress(f,4),0,(1-localProgress(f,4))*-20);
      line.style.transform=`scaleY(${p})`;motion(dot,p,0,(1-p)*-30);
      motion(body,p,(1-p)*48,0);sweep.style.transform=`scaleX(${p})`;
    };
  }
  function conclusion(r) {
    const BW=r.contentW,BH=r.contentH;
    const {s,panel}=r;
    const compact=Boolean(portrait&&(r.evidence||C.presenter));
    const diameter=compact?132:portrait?236:176,centerX=BW/2,cy=compact?160:portrait?252:205;
    const ring=rect(node('div','conclusion-ring',panel),centerX-diameter/2,cy-diameter/2,diameter,diameter);
    const seal=rect(node('div','conclusion-seal',panel,'◆'),centerX-55,cy-55,110,110);
    const titleY=compact?264:portrait?414:344,titleH=compact?154:portrait?226:148;
    const title=rect(node('h1','title',panel,s.title||s.text),inset,titleY,BW-inset*2,titleH);
    title.style.textAlign='center';addFit(r,title,portrait?82:80,42,BW-inset*2,titleH);
    const bodyY=titleY+titleH+24,bodyH=BH-bodyY-38,bodyW=BW-inset*2-(r.character?180:0);
    const body=rect(node('p','body',panel,s.title?s.text:''),inset,bodyY,bodyW,Math.max(1,bodyH));
    body.style.textAlign='center';
    if(s.title&&s.text)addFit(r,body,portrait?46:40,32,bodyW,Math.max(1,bodyH));
    const rule=rect(node('div','conclusion-rule',panel),centerX-160,titleY-24,320,5);
    r.motion=f=>{
      const p=clamp((f-s.cueFrames[0])/36),e=pop(p);
      motion(seal,p,0,(1-e)*-55,.6+.4*e,C.style==='vivid'?(1-e)*-18:0);
      motion(ring,p,0,0,.45+.55*ease(p),f*.07);
      motion(title,localProgress(f,s.cueFrames[0]+13,32),0,(1-localProgress(f,s.cueFrames[0]+13,32))*34);
      motion(body,localProgress(f,s.cueFrames[0]+25,32),0,(1-localProgress(f,s.cueFrames[0]+25,32))*26);
      rule.style.transform=`scaleX(${ease(p)})`;
    };
  }
  const builders={keyword,points,explanation,conclusion};
  C.segments.forEach((s,i)=>{const r=base(s,i);builders[s.kind](r);nodes.push(r);});
  let decodePending=Promise.resolve();
  async function evidenceFrame(r,frame) {
    const {config:e,im}=r.evidence;
    const relative=frame-r.s.startFrame-e.startFrame;
    const active=relative>=0&&relative<e.durationFrames;
    r.evidence.frame.style.display=active?'block':'none';
    if(!active)return;
    if(relative>=e.frameCount)throw Error('Evidence does not cover frame '+relative);
    const source=`${e.frameDir}/f_${String(relative+1).padStart(5,'0')}.jpg`;
    if(im.getAttribute('src')!==source)im.setAttribute('src',source);
    const expected=im.src;await im.decode();
    if(im.src!==expected||!im.naturalWidth)throw Error('Evidence frame changed during decode');
    im.dataset.outputFrame=String(frame);im.dataset.sourceFrame=String(relative+1);
  }
  async function presenterFrame(frame) {
    if(!C.presenter)return;
    const folders=typeof TALKF!=='undefined'?TALKF:window.TALKF;
    const mapping=typeof TALKMAP!=='undefined'?TALKMAP:window.TALKMAP;
    if(!Array.isArray(folders)||!Array.isArray(mapping)||mapping.length<C.totalFrames)throw Error('Presenter media does not cover the output timeline');
    const pair=mapping[frame];
    if(!Array.isArray(pair)||!Number.isInteger(pair[0])||!Number.isInteger(pair[1])||pair[1]<1)throw Error('Invalid TALKMAP frame '+frame);
    const folder=folders[pair[0]];
    if(typeof folder!=='string'||!/^[-a-zA-Z0-9_]+$/.test(folder))throw Error('Invalid presenter folder');
    const relative=`talk/${folder}/f_${String(pair[1]).padStart(5,'0')}.jpg`;
    if(talk.getAttribute('src')!==relative)talk.setAttribute('src',relative);
    const expected=talk.src;
    decodePending=talk.decode().then(()=>{
      if(talk.src!==expected||!talk.naturalWidth)throw Error('Presenter frame changed during decode');
      talk.dataset.outputFrame=String(frame);talk.dataset.sourceFrame=String(pair[1]);
    });
    await decodePending;
  }
  function captionAt(t) {
    const active=C.captions.filter(c=>c.start<=t&&t<c.end);
    const source=active.map(c=>c.text).join('\n'),translation=active.map(c=>c.translation).filter(Boolean).join('\n');
    if(cn.textContent!==source) {
      cn.textContent=source;cn.style.display=source?'block':'none';
      if(source){if(publishArea){cn.style.fontSize='48px';MotionCaptionSafeArea.wrap(cn,source,publishArea.width,C.language||'zh');}else fit(cn,portrait?48:47,34,portrait?940:1460,portrait?130:94);}
    }
    if(en.textContent!==translation) {
      en.textContent=translation;en.style.display=translation?'block':'none';
      if(translation){if(publishArea){en.style.fontSize='37px';MotionCaptionSafeArea.wrap(en,translation,publishArea.width,'en');}else fit(en,portrait?37:34,28,portrait?940:1460,portrait?100:70);}
    }
    if(!source)cn.style.display='none';if(!translation)en.style.display='none';
  }
  async function render(t) {
    if(!Number.isFinite(t)||t<0||t>window.END+1e-8)throw Error('Render time outside output timeline');
    const frame=Math.min(C.totalFrames-1,Math.floor(t*C.fps+1e-6));
    const evidencePending=[];
    nodes.forEach(r=>{
      const active=frame>=r.s.startFrame&&frame<r.s.startFrame+r.s.durationFrames;
      r.scene.style.display=active?'block':'none';
      if(!active)return;
      const f=frame-r.s.startFrame;
      const incoming=localProgress(f,0,26),outgoing=smooth((r.s.durationFrames-1-f)/24);
      motion(r.panel,1,0,(1-incoming)*22+(1-outgoing)*-18,.98+.02*incoming);
      // Closing displacement is bounded; content stays visible through the last frame.
      r.motion(f);
      if(r.evidence)evidencePending.push(evidenceFrame(r,frame));
      if(r.character) {
        const p=localProgress(f,r.s.cueFrames[0],38),lift=20*Math.sin(Math.PI*clamp((f-r.s.cueFrames[0])/45));
        motion(r.character.el,p,0,-lift, .8+.2*pop(clamp((f-r.s.cueFrames[0])/30)),(1-p)*-8);
        r.character.left.style.transform=`rotate(${-22*p}deg)`;r.character.right.style.transform=`rotate(${-65*p}deg)`;
      }
    });
    captionAt(frame/C.fps);
    timecode.textContent=`${String(Math.floor(frame/C.fps)).padStart(2,'0')}:${String(frame%C.fps).padStart(2,'0')}`;
    progress.style.transform=`scaleX(${(frame+1)/C.totalFrames})`;
    await presenterFrame(frame);
    await Promise.all(evidencePending);
    stage.dataset.frame=String(frame);
  }
  window.imgWait=async()=>{await decodePending;};
  window.renderAt=async t=>{await window.READY;await render(t);};
  window.READY=(async()=>{
    await document.fonts.load('500 48px "Motion Noto"');
    await document.fonts.load('700 24px "Motion Mono"');
    await document.fonts.ready;
    if(!document.fonts.check('500 48px "Motion Noto"')||!document.fonts.check('700 24px "Motion Mono"'))throw Error('Local Noto fonts did not load');
    // Layout measurement must see each scene, independently of its timeline.
    nodes.forEach(r=>{
      r.scene.style.display='block';r.fits.forEach(({el,max,min,w,h})=>fit(el,max,min,w,h));r.scene.style.display='none';
    });
    const brand=document.getElementById('brand');if(C.brand)fit(brand,22,16,portrait?690:1220,40);
    await render(0);
    document.title='done';return{width:W,height:H,frames:C.totalFrames};
  })();
})();
