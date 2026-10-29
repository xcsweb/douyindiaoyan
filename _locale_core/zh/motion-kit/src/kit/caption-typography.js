/* Explicit bottom-caption typography. No text, cue or font-size changes. */
(() => {
  'use strict';
  const closing=/^[\s]*[，。！？、；：,.!?;:)\]}»”’）】》」』]/u,opening=/[([{«“‘（【《「『][\s]*$/u;
  const ink=s=>[...s].filter(c=>/[\p{L}\p{N}]/u.test(c)).length;
  function wrap(element,text,width,language,maxLines=2){
    const style=getComputedStyle(element),canvas=document.createElement('canvas').getContext('2d');
    canvas.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const letter=Number.parseFloat(style.letterSpacing)||0,measure=s=>canvas.measureText(s).width+Math.max(0,[...s].length-1)*letter;
    const words=[...new Intl.Segmenter(language||'zh',{granularity:'word'}).segment(text)].map(r=>r.segment),units=[];
    for(const word of words){if(closing.test(word)&&units.length)units[units.length-1]+=word;else units.push(word);}
    // Opening quotes/brackets must travel with the following unit.
    for(let i=units.length-2;i>=0;i--)if(opening.test(units[i]))units.splice(i,2,units[i]+units[i+1]);
    const fail=detail=>{throw Error('CAPTION_TYPOGRAPHY: '+detail+'. Preserve complete caption text and real times; re-layout a fresh caption area or use a genuine reviewed phrase boundary, never shrink/crop or invent word times.');};
    if(units.some(u=>measure(u)>width+.1))fail('A complete word/punctuation group exceeds the available width');
    let lines;
    if(measure(text)<=width+.1)lines=[text];
    else{
      let best=null;
      for(let i=1;i<units.length;i++){
        const left=units.slice(0,i).join(''),right=units.slice(i).join(''),a=measure(left),b=measure(right);
        if(a>width+.1||b>width+.1||!ink(left)||!ink(right)||closing.test(right)||opening.test(left))continue;
        if(ink(text)>2&&(ink(left)<2||ink(right)<2))continue;
        const score=Math.abs(a-b);if(!best||score<best.score)best={score,lines:[left,right]};
      }
      if(!best||maxLines<2)fail('No complete readable layout fits the declared line capacity');
      lines=best.lines;
    }
    element.replaceChildren();for(const value of lines){const line=document.createElement('span');line.className='publish-caption-line';line.style.cssText='display:block;white-space:pre';line.textContent=value;element.append(line);}
    if(element.textContent!==text)fail('Exact text changed during typography');
    element.dataset.captionTypography='balanced-lines/1';
    return lines;
  }
  window.MotionCaptionTypography={wrap};
})();
