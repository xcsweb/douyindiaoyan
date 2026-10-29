/* Local review profile. Opus control bodies and source themes remain frozen. */
(()=>{'use strict';const {rgb}=MK;
const T=MK.T={id:'template01-editorial-review',name:'现代图文 · 原风格扩展',bg:'#F7F7F5',tx:'#0A0A0A',dim:'#6B6B6B',accent:'#2462EA',accent2:'#5B8CFF',warm:'#2462EA',ok:'#287754',bad:'#C94248',deep:'#2462EA'};
MK.applyTheme=()=>{T.a=rgb(T.accent);T.a2=rgb(T.accent2);T.w=rgb(T.warm);T.g=rgb(T.ok);T.r=rgb(T.bad);T.aLite=T.a;T.dust=T.a;T.grid='231,231,228';T.bg0=T.bg;
 const vars={'--bg':T.bg,'--tx':T.tx,'--dim':T.dim,'--a':T.accent,'--a2':T.accent2,'--w':T.warm,'--ok':T.ok,'--bad':T.bad,'--deep':T.deep,'--a-rgb':T.a,'--a2-rgb':T.a2,'--w-rgb':T.w,'--ok-rgb':T.g,'--bad-rgb':T.r};for(const [k,v]of Object.entries(vars))document.documentElement.style.setProperty(k,v);};
const P=T.paint={};P.base=(c,W,H)=>{c.fillStyle=T.bg;c.fillRect(0,0,W,H);c.strokeStyle='#E7E7E4';c.lineWidth=1;for(let x=0;x<W;x+=240){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke()}for(let y=0;y<H;y+=240){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke()}};
P.floor=P.dust=P.burst=()=>{};
P.ball=(c,x,y,r,col,a=1)=>{if(a<.002)return;c.save();c.globalCompositeOperation='source-over';c.globalAlpha=a;c.fillStyle=`rgba(${col},.08)`;c.strokeStyle=`rgba(${col},.6)`;c.lineWidth=2;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.stroke();c.restore()};
P.beam=(c,x1,y1,x2,y2,col,a=1,o={})=>{c.save();c.globalAlpha=a;c.strokeStyle=`rgba(${col==='255,255,255'?'107,107,107':col},.75)`;c.lineWidth=o.w||2;c.beginPath();c.moveTo(x1,y1);const k=o.p??1;c.lineTo(x1+(x2-x1)*k,y1+(y2-y1)*k);c.stroke();c.restore()};
P.arcRing=(c,x,y,r,a0,a1,col,a=1)=>{c.save();c.globalAlpha=a;c.strokeStyle=`rgba(${col},.55)`;c.lineWidth=2;c.beginPath();c.arc(x,y,r,a0,a1);c.stroke();c.restore()};
T.background=(c,t,W,H)=>P.base(c,W,H);MK.applyTheme();})();

(()=>{MK.T.bg='#0A0A0A';MK.T.tx='#FFFFFF';MK.T.dim='#8C8C8C';MK.applyTheme();MK.T.paint.base=(c,W,H)=>{c.fillStyle='#0A0A0A';c.fillRect(0,0,W,H);c.strokeStyle='#1a1a1a';c.lineWidth=1;for(let x=0;x<W;x+=240){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke()}for(let y=0;y<H;y+=240){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke()}};})();