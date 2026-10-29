/* Explicit complete-text highlight composition. Original mode does no work. */
(() => {
  'use strict';
  const policy='complete-text/1',audit=[];
  const enabled=()=>window.MOTION_INPUTS?.timeline?.highlightReadability===policy;
  const fail=message=>{throw Error('HIGHLIGHT_READABILITY: '+message+' Keep every character and the original speech/caption/cue/sound clocks. Recompose a fresh supported area or split complete semantic groups; never shrink the whole film, crop text, invent word timing or extend the film to pass.');};
  function lines(el){
    const result=[],walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    for(let node;node=walker.nextNode();){let at=0;for(const ch of node.textContent){
      const r=document.createRange();r.setStart(node,at);at+=ch.length;r.setEnd(node,at);const b=r.getBoundingClientRect();
      if(!b.height&&ch.trim())fail('A text glyph has no measurable line');
      if(!b.height)continue;let line=result.find(l=>Math.abs(l.top-b.top)<2);
      if(!line){line={top:b.top,text:''};result.push(line);}line.text+=ch;
    }}return result.filter(l=>l.text.trim()).map(l=>l.text);
  }
  function prepare(q,ems){
    if(!enabled())return;
    if(!CSS.supports('text-wrap','balance'))fail('This browser lacks balanced text wrapping');
    q.dataset.highlightReadable=policy;q.style.textWrap='balance';
    const originalText=q.textContent;
    // Keep closing punctuation with the marked box. Moving only the existing
    // punctuation nodes preserves text order and all original phrase objects,
    // interpolation and SFX events; it creates no speech/word time.
    for(const em of ems){
      for(;;){
        const walker=document.createTreeWalker(q,NodeFilter.SHOW_TEXT),nodes=[];
        for(let n;n=walker.nextNode();)nodes.push(n);
        const last=nodes.findLastIndex(n=>em.contains(n)),next=nodes.slice(last+1).find(n=>n.textContent);
        if(!next||next.parentElement.closest('em'))break;
        const prefix=next.textContent.match(/^[\s]*[，。！？、；：,.!?;:)\]}»”’）】》」』]+/u)?.[0];
        if(!prefix)break;
        next.textContent=next.textContent.slice(prefix.length);em.append(document.createTextNode(prefix));
      }
    }
    if(q.textContent!==originalText)fail('Punctuation binding changed complete text');
    // A marked semantic group stays together when it fits. A longer group
    // wraps inside its own bounded box, rather than leaving its first glyph on
    // the previous line. No word/cue split or text-node rewrite is performed.
    ems.forEach(e=>Object.assign(e.style,{display:'inline-block',maxWidth:'100%',whiteSpace:'normal',textWrap:'balance',verticalAlign:'baseline'}));
    // Ink belongs to the reviewed profile/surface CSS. A higher-specificity
    // runtime override would undo orange-stage ink and dark-blue marker fixes.
  }
  function measure(q,ems,slot,ctx){
    if(!enabled())return;
    const expected=ctx.portrait?88:86,font=parseFloat(getComputedStyle(q).fontSize),before=q.textContent;
    if(font<expected-.1)fail('The original preferred font cannot fit this content area without shrinking');
    const maximum=ctx.area.h*(ctx.portrait ? .8 : .74)-(q.parentElement.querySelector('.mk-kick')?60:0);
    if(q.scrollWidth>q.clientWidth+2||q.scrollHeight>maximum+2)fail('Complete marked text exceeds the available body area');
    q.dataset.fit=String(font);
    const groups=ems.map(e=>({text:e.textContent,lines:lines(e),width:e.getBoundingClientRect().width}));
    for(const group of groups){
      if(group.width>q.clientWidth+2)fail('A complete marked group exceeds its body width');
      if(group.lines.length>1&&group.lines.some(s=>[...s].filter(c=>/[\p{L}\p{N}]/u.test(c)).length===1))
        fail('A multi-character marked group still has an isolated line fragment');
    }
    if(q.textContent!==before)fail('Text changed during layout');
    const textLines=lines(q);
    if(/[\p{L}\p{N}]/u.test(before)&&textLines.some(s=>!/[\p{L}\p{N}]/u.test(s)))fail('Closing punctuation is isolated on a separate line');
    const row={start:slot.t0,end:slot.t1,text:before,fontSize:font,lines:textLines,groups,
      tail:readableTail(slot)?'Keep text clear to this final cut; original timing and decorative exit remain':'Original non-final/fade exit retained'};
    const at=audit.findIndex(r=>r.start===slot.t0);if(at<0)audit.push(row);else audit[at]=row;
    window.MOTION_HIGHLIGHT_READABILITY_AUDIT={policy,scope:'Measured layout only; no word timing or semantic/owner acceptance',rows:audit};
  }
  function readableTail(slot){const tl=window.MOTION_INPUTS.timeline;return enabled()&&tl.ending==='cut'&&Math.abs(slot.t1-tl.duration)<1e-7;}
  function preferred(q,ctx){if(!enabled())return false;q.style.fontSize=(ctx.portrait?88:86)+'px';return true;}
  // An inline-block may contain several complete lines. The old78% band can
  // leave English descenders outside its paint while the whole phrase uses
  // marker ink. Cover the complete marked box in the explicit mode; keep the
  // original width interpolation, palette and legacy78% band unchanged.
  const markerBackground=width=>`${width}% ${enabled()?'100':'78'}%`;
  window.MotionHighlightReadability={prepare,preferred,measure,markerBackground,exit:(original,slot)=>readableTail(slot)?0:original};
})();
