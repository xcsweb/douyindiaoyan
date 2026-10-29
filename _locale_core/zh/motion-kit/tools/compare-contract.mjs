// Compare two frozen catalogues before integrating an updated library release.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export function compareContracts(before, after) {
  const breaking=[], changes=[], added=[];
  const issue=(target,reason)=>breaking.push({target,reason});
  const fields=(oldFields,newFields,path)=>{
    for(const [name,old] of Object.entries(oldFields||{})){
      const next=newFields?.[name], at=path+'.'+name;
      if(!next){issue(at,'field removed; existing inputs may contain it');continue;}
      if(old.type!==next.type||old.of!==next.of)issue(at,'field type changed');
      if(!old.required&&next.required)issue(at,'optional field became required');
      for(const bound of ['max','maxItems'])if(next[bound]!=null&&(old[bound]==null||next[bound]<old[bound]))issue(at,bound+' tightened');
      for(const bound of ['min','minItems'])if(next[bound]!=null&&(old[bound]==null||next[bound]>old[bound]))issue(at,bound+' tightened');
      if(old.values?.some(v=>!next.values?.includes(v)))issue(at,'allowed value removed');
      if(old.props)fields(old.props,next.props,at);
    }
    for(const [name,field] of Object.entries(newFields||{}))if(!oldFields?.[name]&&field.required)issue(path+'.'+name,'new required field');
  };
  for(const [id,old] of Object.entries(before.controls||{})){
    const next=after.controls?.[id], target='controls.'+id;
    if(!next){issue(target,'control removed');continue;}
    if((old.layer||'segment')!==(next.layer||'segment'))issue(target,'segment/overlay layer changed');
    fields(old.props,next.props,target+'.props');
    if(old.variants?.some(v=>!next.variants?.includes(v)))issue(target,'variant removed');
    if(next.minDur>old.minDur)issue(target,'minimum duration increased');
    for(const key of ['variants','cues','tail','idle','minDur'])if(JSON.stringify(old[key])!==JSON.stringify(next[key]))changes.push({target:target+'.'+key,reason:'timing/choreography selection requires fresh preview'});
  }
  for(const id of Object.keys(after.controls||{}))if(!before.controls?.[id])added.push(id);
  for(const key of ['transitions','icons'])if(before[key]?.some(v=>!after[key]?.includes(v)))issue(key,'allowed ID removed');
  return {profile:'motiongit-kit-compatibility/1',beforeVersion:before.version,afterVersion:after.version,
    existingInputsSchemaCompatible:breaking.length===0,breaking,changes,added,
    requiresNewTemplateRelease:true,requiresNewPreview:true,automaticRuntimeReplacement:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [oldFile,newFile]=process.argv.slice(2);
  if(!oldFile||!newFile)throw Error('Use compare-contract.mjs <old merged spec> <new merged spec>');
  console.log(JSON.stringify(compareContracts(JSON.parse(fs.readFileSync(oldFile)),JSON.parse(fs.readFileSync(newFile))),null,2));
}
