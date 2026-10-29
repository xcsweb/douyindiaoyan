/* Fixed anchor inside the existing carrier. No frame tracking or container geometry changes. */
(function(root){
  const requests=new WeakMap();
  const imageURL=(im,value)=>value?new URL(value,im.ownerDocument.baseURI).href:'';
  function paint(im,state,wait=true){
    const request=state.latest;
    if(!request)return;
    const {p,width,height,round,source}=request;
    if(!p || p.framing==='none' || ['disabled','policy'].includes(p.faceFraming?.status))return;
    if(source!==imageURL(im,im.src))return;
    const sw=im.naturalWidth,sh=im.naturalHeight;
    // Assigning src can clear the decoded size until imgWait/decode completes.
    // Never fit against the preceding picture or replace another media onload.
    if(!im.complete || imageURL(im,im.currentSrc)!==source || !(sw>0&&sh>0)){
      if(wait && typeof im.decode==='function' && state.decoding!==source){
        state.decoding=source;
        im.decode().then(()=>{
          if(state.decoding===source)state.decoding=null;
          paint(im,state,false);
        },()=>{if(state.decoding===source)state.decoding=null;});
      }
      return;
    }
    if(!(width>0&&height>0))return;
    const reliable=!!p.face && ['manual','approximate'].includes(p.faceFraming?.status);
    const g=root.MotionGitPresenterFraming(sw,sh,width,height,p.face,{round,reliable});
    Object.assign(im.style,{position:'absolute',left:g.x+'px',top:g.y+'px',right:'auto',bottom:'auto',
      width:g.width+'px',height:g.height+'px',maxWidth:'none',maxHeight:'none',
      objectFit:'fill',objectPosition:'50% 50%',transform:'none'});
    im.dataset.presenterFraming=p.faceFraming?.status||'undetected';
    im.dataset.presenterSourceSize=sw+'x'+sh;
    im.dataset.presenterGeometry=JSON.stringify({sourceWidth:sw,sourceHeight:sh,
      carrierWidth:width,carrierHeight:height,round,reliable,face:p.face||null,crop:g});
  }
  root.MotionGitStaticPresenter = function(im, p, width, height, round=false){
    if(!im)return;
    let state=requests.get(im);
    if(!state){
      state={latest:null,decoding:null};requests.set(im,state);
      im.addEventListener('load',()=>paint(im,state,false));
    }
    // Even an opt-out replaces the latest request so an older decode cannot
    // asynchronously write its crop after the user selected none/manual policy.
    state.latest={p,width,height,round,source:imageURL(im,im.src)};
    paint(im,state);
  };
})(globalThis);
