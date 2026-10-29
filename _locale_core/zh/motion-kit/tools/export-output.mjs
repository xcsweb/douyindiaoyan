/** Output checks run before rendering; recovery contains derived media, never template source. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

export function prepareOutput(file) {
  const output=path.resolve(file),parent=path.dirname(output);
  try {fs.lstatSync(output);throw Error('OUTPUT_EXISTS: '+output);}
  catch(error){if(error.code!=='ENOENT')throw error;}
  fs.mkdirSync(parent,{recursive:true,mode:0o700});
  const probe=path.join(parent,'.motiongit-output-check-'+crypto.randomUUID());
  try {const fd=fs.openSync(probe,'wx',0o600);fs.closeSync(fd);}
  finally {fs.rmSync(probe,{force:true});}
  return output;
}

export function verifyEncodedVideo(file,{width,height,frames,fps,audio}) {
  let stat;
  try {stat=fs.lstatSync(file);}catch(error){if(error.code==='ENOENT')throw Error('RENDER_OUTPUT_MISSING: '+file);throw error;}
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size===0)throw Error('RENDER_OUTPUT_INVALID: '+file);
  const probe=count=>{
    const result=spawnSync('ffprobe',['-v','error',...(count?['-count_frames']:[]),'-show_entries',
      'stream=codec_type,width,height,nb_frames,nb_read_frames,avg_frame_rate:format=duration','-of','json',file],{encoding:'utf8'});
    if(result.error||result.status!==0||result.signal)throw Error('RENDER_OUTPUT_UNREADABLE: '+file);
    try{return JSON.parse(result.stdout);}catch{throw Error('RENDER_OUTPUT_UNREADABLE: '+file);}
  };
  let data=probe(false),video=data.streams?.find(s=>s.codec_type==='video');
  if(!Number.isFinite(Number(video?.nb_frames))){data=probe(true);video=data.streams?.find(s=>s.codec_type==='video');}
  const count=Number(video?.nb_read_frames??video?.nb_frames),fraction=String(video?.avg_frame_rate).split('/').map(Number);
  const rate=fraction[0]/fraction[1],duration=Number(data.format?.duration),hasAudio=!!data.streams?.some(s=>s.codec_type==='audio');
  if(video?.width!==width||video?.height!==height||count!==frames||!Number.isFinite(rate)||Math.abs(rate-fps)>1e-6||
    !Number.isFinite(duration)||Math.abs(duration-frames/fps)>Math.max(.1,1/fps)||audio!==undefined&&hasAudio!==audio)
    throw Error('RENDER_OUTPUT_CONTRACT_MISMATCH: '+file);
  return {width,height,frames:count,fps:rate,durationSeconds:duration,audio:hasAudio,bytes:stat.size};
}

function sha(file) {
  const hash=crypto.createHash('sha256'),buffer=Buffer.alloc(1024*1024),fd=fs.openSync(file,'r');
  try{let size;while((size=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,size));}
  finally{fs.closeSync(fd);}
  return hash.digest('hex');
}

export function createExportStage(output,context) {
  const root=fs.mkdtempSync(path.join(path.dirname(output),'.motiongit-render-'));
  fs.chmodSync(root,0o700);
  const journal=path.join(root,'recovery.json');
  let record={profile:'motiongit.component-export/1',output,context,status:'rendering',validatedMedia:[]};
  const save=()=>fs.writeFileSync(journal,JSON.stringify(record,null,2)+'\n',{mode:0o600});save();
  return {
    root,
    validated(file,details){record.validatedMedia.push({file:path.basename(file),sha256:sha(file),...details});save();},
    failed(error){record={...record,status:'failed',error:String(error.message??error).slice(0,2000)};
      let recoverySaved=true;try{save();}catch{recoverySaved=false;}
      return {recoveryDirectory:root,recoverySaved,validatedMedia:record.validatedMedia.filter(x=>fs.existsSync(path.join(root,x.file))).map(x=>x.file)};},
    publish(file){
      const expected=sha(file);let fd,created=false;
      try {
        fd=fs.openSync(output,'wx',0o600);created=true;
        const source=fs.openSync(file,'r'),buffer=Buffer.alloc(1024*1024);
        try{let count;while((count=fs.readSync(source,buffer,0,buffer.length,null))>0){
          let offset=0;while(offset<count)offset+=fs.writeSync(fd,buffer,offset,count-offset);
        }}finally{fs.closeSync(source);}
        fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
        if(sha(output)!==expected)throw Error('RENDER_OUTPUT_COPY_CHANGED');
        record={...record,status:'complete',sha256:expected};save();
        fs.rmSync(root,{recursive:true,force:true});
        return {sha256:expected,verifiedCopy:true};
      } catch(error) {
        if(fd!==undefined)fs.closeSync(fd);
        if(created)fs.rmSync(output,{force:true});
        throw error;
      }
    },
  };
}

/** Measure the rendered subtitle, including a selected style iframe, in output pixels. */
export async function captionGeometry(page) {
  return page.evaluate(()=>{
    const children=window.STYLE_CHILDREN?.length?window.STYLE_CHILDREN:[window],rows=[];
    for(const child of children){
      const frame=child.frameElement;
      if(frame&&getComputedStyle(frame).visibility==='hidden')continue;
      const origin=frame?frame.getBoundingClientRect():{left:0,top:0,width:innerWidth,height:innerHeight};
      const sx=origin.width/child.innerWidth,sy=origin.height/child.innerHeight;
      for(const element of child.document.querySelectorAll('.mk-cap,#vivid-captions')){
        const style=child.getComputedStyle(element),rect=element.getBoundingClientRect();
        if(style.visibility==='hidden'||Number(style.opacity)<.01||!element.textContent.trim())continue;
        const vivid=element.id==='vivid-captions';
        const units=vivid?[...element.querySelectorAll('.unit')].map(e=>e.firstElementChild):[];
        const boxes=units.map(e=>e.getBoundingClientRect());
        const bounds=boxes.length?{left:Math.min(...boxes.map(b=>b.left)),right:Math.max(...boxes.map(b=>b.right)),
          top:Math.min(...boxes.map(b=>b.top)),bottom:Math.max(...boxes.map(b=>b.bottom))}:rect;
        const width=bounds.right-bounds.left,height=bounds.bottom-bounds.top;
        rows.push({text:vivid?units.map(e=>e.textContent).join(''):element.textContent,renderer:vivid?'vivid-native':'motion-kit',
          alignment:vivid?'frame-center':element.dataset.alignment||'legacy-content-center',
          publishSafeArea:child.MotionCaptionSafeArea?.inspect()??null,
          left:origin.left+bounds.left*sx,right:origin.left+bounds.right*sx,top:origin.top+bounds.top*sy,bottom:origin.top+bounds.bottom*sy,
          centerX:origin.left+(bounds.left+width/2)*sx,width:width*sx,height:height*sy});
      }
    }
    return rows;
  });
}
