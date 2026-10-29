/* Frozen 01 scenes remain intact. Explicit display geometry repairs are separate. */
(()=>{'use strict';
const original=window.renderAt,W=CONFIG.width,H=CONFIG.height,p=H>W,offset=CONFIG.integrated01OffsetFrame||0;
const root=document.createElement('div');root.className='integrated01-header';
root.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:80';
const left=document.createElement('div'),clock=document.createElement('div'),y=p?82:50;
for(const n of [left,clock])n.style.cssText=`position:absolute;top:${y}px;height:44px;display:flex;align-items:center;font:500 ${p?34:27}px/44px 'Adu Mono','Adu Sans',sans-serif;letter-spacing:1px;white-space:nowrap`;
left.style.left='86px';left.style.maxWidth=(W-420)+'px';clock.style.right='86px';clock.dataset.motiongitSourceClock='true';left.dataset.motiongitHud='left';left.style.display='none';root.append(left,clock);document.getElementById('ov').append(root);
let ready=false;
const labels={'01-A':'01-A · 原片节奏','01-B':'01-B · 连续形变','01-C':'01-C · 纵深舞台','01-D':'01-D · 杂志分屏','01-E':'01-E · 节拍字效','01-B-legacy':'01-B · 目标与干扰'};
function tone(sc){const c=getComputedStyle(sc.el).backgroundColor.match(/[\d.]+/g);return c&&c.slice(0,3).map(Number).reduce((a,b)=>a+b,0)>420?'#4d5360':'#b5c2d2';}
window.renderAt=async t=>{await original(t);if(!ready)return;
 const f=Math.min(MACRO_PLAN.end_frame-1,Math.max(0,Math.floor(t*60+1e-6))),i=MACRO_PLAN.scenes.findIndex(s=>f>=s.output_start_frame&&f<s.output_end_frame),item=MACRO_PLAN.scenes[i],sc=SCENES[i];if(!sc)return;

 // Source B concept stays at its native anchor and clock. The separate output
 // layer uniformly fits only its glyphs to the portrait reading safe area.
 if(p&&CONFIG.integrated01Style==='01-B'&&item.sceneId==='decompose-and-consolidate'){
  const e=[...sc.el.querySelectorAll('.e')].find(e=>e._x===1090&&e._y===389),n=e?.firstElementChild;
  if(n){n.style.scale='1';n.style.transformOrigin='top left';const range=document.createRange();range.selectNodeContents(n);let r=range.getBoundingClientRect();
   if(r.width>0&&r.left>=0&&r.left<W-140){const k=Math.min(1,Math.max(0,(W-86-r.left-2)/r.width));n.style.scale=String(k);r=range.getBoundingClientRect();
    window.INTEGRATED01_CONCEPT_FIT={text:n.textContent,scale:k,rect:[r.left,r.top,r.right,r.bottom],glyphHeight:r.height,minimumGlyphHeight:50,rightSafeEdge:W-86};
    const st=window.MACRO_TEMPLATE_SOURCE_T;if(st>=86.75&&st<=89.3&&(r.right>W-85.5||r.height<50))throw Error('Shorten the portrait B concept: actual glyphs need at least50px height inside the right safe edge');
   }
  }
 }

 // Explicit portrait-only layout repair. The original C camera was 389px
 // tall at y45, across the header. Keep its source animation; fit its displayed
 // frame below the header and inside the portrait foreground area.
 if(p&&!window.PortraitDirector)for(const cam of sc.el.querySelectorAll('.cam')){
  cam.style.translate='none';cam.style.scale='1';let r=cam.getBoundingClientRect();
  if(r.width>10&&r.width<W*.48){
   cam.style.transformOrigin='top right';const k=Math.min(1,260/r.height);cam.style.scale=String(k);r=cam.getBoundingClientRect();
   const parentScale=r.width/Math.max(1,cam.offsetWidth)/k,dx=Math.max(0,86-r.left)+Math.min(0,W-86-r.right),dy=Math.max(0,170-r.top);
   cam.style.translate=`${dx/parentScale}px ${dy/parentScale}px`;
  }
 }
 const gf=f+offset;left.textContent=labels[CONFIG.integrated01Style]||CONFIG.libraryTitle||'01 · 现代图文口播';
 clock.textContent=String(Math.floor(gf/3600)).padStart(2,'0')+':'+String(Math.floor(gf/60)%60).padStart(2,'0');
 let mark=0;for(const e of CONFIG.motiongitHeaderMarks||[])if(gf>=e.start_frame&&gf<e.end_frame_exclusive)mark=Math.max(mark,Math.min(1,(gf-e.start_frame)/e.fade_frames,(e.end_frame_exclusive-gf)/e.fade_frames));
 const edge=Math.max(0,Math.min(1,(f-item.output_start_frame)/12,(item.output_end_frame-f)/12));left.style.opacity=String(edge);clock.style.opacity=String(edge*(1-mark));clock.dataset.markEnvelope=String(mark);
 left.style.color=clock.style.color=tone(sc);root.dataset.outputFrame=String(gf);
 if(left.scrollWidth>left.clientWidth+1)throw Error('Shorten the readable 01 chapter label');
};
window.READY=Promise.resolve(window.READY).then(async()=>{
 for(let i=0;i<SCENES.length;i++){const sc=SCENES[i];
  for(const e of sc.el.querySelectorAll('.e'))if(Number.isFinite(e._y)&&e._y>=40&&e._y<=55&&!e.querySelector('.cam,img,canvas,svg'))e.style.setProperty('display','none','important');
  for(const n of sc.el.querySelectorAll('.tag,.portrait-top-tag,.portrait-time-tag'))n.style.setProperty('display','none','important');
  for(const n of sc.el.querySelectorAll('.cam .lab'))n.textContent=window.PACK_PRESENTER_LABEL||'本期主讲人';
  if(p&&PACK_LAYOUT.pack==='stage-performance'&&MACRO_PLAN.scenes[i].sceneId==='evidence-and-focus')
   for(const win of sc.el.querySelectorAll('.macwin')){const island=win.closest('.portrait-island');if(island)island.style.translate='-24px 0';}
  if(p&&PACK_LAYOUT.pack==='stage-performance'&&MACRO_PLAN.scenes[i].sceneId==='evidence-and-focus')
   for(const e of sc.el.querySelectorAll('.e'))if(e._x===689&&e._y===810){
    const island=e.closest('.portrait-island');if(island)island.style.translate='0 -84px';
   }
  // C's opening headline uses x140, unlike the x640 stage headings. Its
  // inherited portrait map clipped the entire static reading phase at left.
  if(p&&PACK_LAYOUT.pack==='stage-performance'&&MACRO_PLAN.scenes[i].sceneId==='claim-and-response')
   for(const e of sc.el.querySelectorAll('.e'))if((e._x===140&&e._y===218)||(e._x===148&&[589,657].includes(e._y))){
    const island=e.closest('.portrait-island');if(island)island.style.translate='375px 0';
   }
  if(p&&PACK_LAYOUT.pack==='editorial-performance'&&MACRO_PLAN.scenes[i].sceneId==='evidence-to-handbook')
   for(const e of sc.el.querySelectorAll('.e'))if(e._x===1299&&[425,548,671].includes(e._y)){
    const island=e.closest('.portrait-island');if(island)island.style.translate='-174px 0';
   }
 }
 ready=true;await window.renderAt(0);window.INTEGRATED01_QUALITY={nativeChoreographyClockChanged:false,
  portraitRepair:p?'Presenter height/header clearance, C opening headline/evidence window/footer and D flying handbook items offsets; separate from original frozen layout':null,captionReport:window.CAPTION_LAYOUT_PREFLIGHT?.()};
});
})();
