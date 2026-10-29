/* The wrapper changes paint only, never control motion, cues or fitting. */
(()=>{'use strict';const register=MK.control;const proxies=new WeakMap();
const light=c=>{if(proxies.has(c))return proxies.get(c);const p=new Proxy(c,{get(t,k){const v=t[k];return typeof v==='function'?v.bind(t):v},set(t,k,v){if(['strokeStyle','fillStyle'].includes(k)&&typeof v==='string'){v=v.replace(/rgba\(255\s*,\s*255\s*,\s*255\s*,/g,'rgba(107,107,107,');if(/^#(?:fff|ffffff)$/i.test(v))v='#6B6B6B'}if(k==='shadowBlur')v=0;t[k]=v;return true}});proxies.set(c,p);return p;};
MK.control=(id,def)=>register(id,{...def,build(slot,props,ctx){ctx.root.dataset.reviewSkin='template01-editorial';const x=def.build(slot,props,ctx);
 if(id==='compare'&&ctx.variant==='panels')ctx.measure(()=>{
  for(const col of ctx.root.querySelectorAll('.mk-vs .col')){
   if(!MotionNarrationLayout.enabled()&&!(id==='compare'&&ctx.portrait&&ctx.mode==='card')){
   col.style.setProperty('padding','24px 28px','important');
   const big=col.querySelector('.big'),lines=[...col.querySelectorAll('.line')];
   let b=parseFloat(getComputedStyle(big).fontSize),l=lines.length?parseFloat(getComputedStyle(lines[0]).fontSize):0;
   while(col.scrollHeight>col.clientHeight+1&&(b>44||l>26)){b=Math.max(44,b-2);l=Math.max(26,l-2);big.style.fontSize=b+'px';for(const line of lines)line.style.fontSize=l+'px';}
   }
   if(col.scrollHeight>col.clientHeight+1)throw Error('Compare panel capacity: split this content into more scenes');
   col.dataset.capacity='whole-text-visible';
  }
 });
 return {...x,bg:x.bg?(c,t)=>x.bg(light(c),t):undefined,fg:x.fg?(c,t)=>x.fg(light(c),t):undefined}}});
})();
