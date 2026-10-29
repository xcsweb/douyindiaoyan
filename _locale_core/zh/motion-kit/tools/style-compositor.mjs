import fs from 'node:fs';import path from 'node:path';
export function styleSelection(tl,config){
 const def=tl.styleProfile||config.defaultProfile;
 if(!Object.hasOwn(config.profiles,def))throw Error('Unknown template style profile: '+def);
 return tl.segments.map(s=>{const id=s.styleProfile||def;if(!Object.hasOwn(config.profiles,id))throw Error('Unknown scene style profile: '+id);return id});
}
export function prepareStyledPage(page,source,tl,config){
 const selected=styleSelection(tl,config),profiles=[...new Set(selected)],html=fs.readFileSync(path.join(page,'index.html'),'utf8');
 for(const id of profiles){
  const descriptor=config.profiles[id],dir=path.join(page,'profile-'+id);
  if(!/^[a-z][a-z0-9-]*$/.test(id))throw Error('Unsafe style identifier');
  // Every original segment stays in each independent style runtime. Counts,
  // automatic variants, cues, closure state and media clocks remain unchanged.
  fs.mkdirSync(dir);for(const entry of fs.readdirSync(page,{withFileTypes:true})){
   if(entry.name.startsWith('profile-'))continue;
   fs.cpSync(path.join(page,entry.name),path.join(dir,entry.name),{recursive:true});
  }
  for(const name of ['theme.js','index.html','inputs.js'])if(fs.existsSync(path.join(dir,name)))fs.chmodSync(path.join(dir,name),0o600);
  const base=path.join(source,descriptor.root);
  for(const name of ['theme.js','style.css','bridge.js'])fs.copyFileSync(path.join(base,name),path.join(dir,{'style.css':'template-profile.css','bridge.js':'template-profile-bridge.js'}[name]||name));
  fs.writeFileSync(path.join(dir,'inputs.js'),'window.MOTION_INPUTS='+JSON.stringify({timeline:tl,theme:tl.theme||{}})+';\n');
  fs.writeFileSync(path.join(dir,'index.html'),html.replace('</head>','<link rel="stylesheet" href="template-profile.css"></head>').replace('<script src="controls/text.js">','<script src="template-profile-bridge.js"></script><script src="controls/text.js">'));
 }
 const w=tl.layout==='portrait'?1080:1920,h=tl.layout==='portrait'?1920:1080;
 fs.chmodSync(path.join(page,'index.html'),0o600);
 fs.writeFileSync(path.join(page,'index.html'),`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}#stage{position:relative;width:${w}px;height:${h}px}iframe{position:absolute;inset:0;width:${w}px;height:${h}px;border:0;visibility:hidden}</style><div id="stage">${profiles.map(id=>`<iframe data-profile="${id}" src="profile-${id}/index.html"></iframe>`).join('')}</div><script>window.STYLE_TIMELINE=${JSON.stringify(tl)};window.STYLE_SELECTION=${JSON.stringify(selected)};</script><script src="style-host.js"></script>`);
 fs.writeFileSync(path.join(page,'style-host.js'),`(()=>{'use strict';const tl=STYLE_TIMELINE,ids=STYLE_SELECTION,frames=[...document.querySelectorAll('iframe')],states=new Map();
 for(const f of frames)states.set(f.dataset.profile,new Promise((resolve,reject)=>{f.onerror=()=>reject(Error('Missing style runtime'));f.onload=async()=>{try{const c=f.contentWindow;if(!c.READY||!c.renderAt)throw Error('Missing source render contract');await c.READY;await c.document.fonts.ready;resolve(c)}catch(e){reject(e)}}}));
 let active;window.END=tl.duration;window.STYLE_CHILDREN=[];window.imgWait=async()=>{};
 window.renderAt=async t=>{const index=tl.segments.findIndex(s=>t>=s.t0-1e-7&&t<s.t1-1e-7);if(index<0)throw Error('No active styled scene at '+t);const id=ids[index],child=await states.get(id);for(const f of frames)f.style.visibility=f.dataset.profile===id?'visible':'hidden';await child.renderAt(t);await child.imgWait();await child.document.fonts.ready;
 await Promise.all([...child.document.images].filter(i=>i.getAttribute('src')&&i.offsetWidth).map(async i=>{await i.decode();if(!i.naturalWidth)throw Error('Missing styled media frame')}));
 for(const card of child.document.querySelectorAll('.mk-tk')){const badge=card.querySelector('.lab'),span=badge?.querySelector('span');if(!badge||!span||card.clientWidth<1)continue;const width=Math.max(80,card.clientWidth-20);badge.style.maxWidth=width+'px';badge.style.boxSizing='border-box';badge.style.width='max-content';badge.style.whiteSpace='nowrap';span.style.whiteSpace='nowrap';badge.style.fontSize='19px';let size=19;while(badge.scrollWidth>width+1&&size>12){size-=.5;badge.style.fontSize=size+'px';}if(badge.scrollWidth>width+1){badge.style.whiteSpace='normal';span.style.whiteSpace='normal';badge.style.overflowWrap='anywhere';badge.style.lineHeight='1.2';}}
 window.STYLE_ACTIVE={profile:id,segment:index,time:t};if(active!==id){await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));active=id;}};
 window.READY=Promise.all(states.values()).then(children=>{window.STYLE_CHILDREN=children;const expected=JSON.stringify(children[0].SFX);if(children.some(c=>JSON.stringify(c.SFX)!==expected))throw Error('Style adaptation changed sound cues');window.SFX=children[0].SFX;document.title='done'});
})();`);
 return {defaultProfile:tl.styleProfile||config.defaultProfile,profilesUsed:profiles,sceneProfiles:selected,styleContract:config.schema};
}
