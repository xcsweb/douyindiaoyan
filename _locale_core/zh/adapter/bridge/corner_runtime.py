"""Managed content binding for legacy native projects; no network or AI calls."""
import json
from pathlib import Path
import re
import shutil

KINDS = {'user-explicit', 'assistant-summary', 'bound-excerpt'}

def resolve_header(inputs):
    header=None;header_field='header.shortTitle'
    for container,prefix in [(inputs,''),(inputs.get('timeline',{}),'timeline.'),(inputs.get('brief',{}),'brief.')]:
        if isinstance(container,dict) and container.get('header') is not None:
            header=container['header'];header_field=prefix+'header.shortTitle';break
    if header is not None:
        if not isinstance(header, dict) or set(header)-{'shortTitle','source'} or not isinstance(header.get('shortTitle'), str) or not header['shortTitle'].strip() or len(header['shortTitle']) > 2000:
            raise ValueError('Invalid managed content header')
        source = header.get('source', {'kind':'user-explicit','field':header_field})
        if not isinstance(source,dict) or set(source)!={'kind','field'} or source.get('kind') not in KINDS or not isinstance(source.get('field'),str) or not 1 <= len(source['field']) <= 256:
            raise ValueError('Invalid managed content header source')
        return {'shortTitle':header['shortTitle'],'source':source}
    if isinstance(inputs.get('shortTitle'),str) and inputs['shortTitle'].strip():
        return {'shortTitle':inputs['shortTitle'],'source':{'kind':'user-explicit','field':'shortTitle'}}
    candidates=[]
    def add(value,field):
        if isinstance(value,str) and value.strip(): candidates.append((value.strip(),field))
    def walk(node,field,depth=0):
        if depth>8:return
        if isinstance(node,str):
            add(node,field);return
        if isinstance(node,list):
            for i,value in enumerate(node[:32]):walk(value,f'{field}[{i}]',depth+1)
        if not isinstance(node,dict):return
        if isinstance(node.get('lead'),str) and isinstance(node.get('payoff'),str):add(node['lead']+' '+node['payoff'],field+'.{lead,payoff}')
        if isinstance(node.get('a'),str) and isinstance(node.get('b'),str):add(node['a']+node['b'],field+'.{a,b}')
        for key in ['spokenText','text','originalText','title','headline','sentence','zh','en']:add(node.get(key),field+'.'+key)
        if isinstance(node.get('line1'),str):add(' '.join(node[k] for k in ['line1','line2'] if isinstance(node.get(k),str)),field+'.{line1,line2}')
        for key,value in node.items():
            if key in ['brand','hud','media','assets','src','source','header','a','b']:continue
            if isinstance(value,(dict,list)):walk(value,field+'.'+key,depth+1)
            elif re.fullmatch(r'(?:text|txt)[_-]?\d+',key):add(value,field+'.'+key)
    for key in ['spokenText','text','originalText','title','headline','sentence']:
        add(inputs.get(key),key)
        if isinstance(inputs.get(key),(dict,list)):walk(inputs[key],key)
    for key in ['content','captions','copy','brief','segments','timeline']:walk(inputs.get(key),key)
    for value,field in candidates:
        match=re.search(r'^[\s\S]*?[。！？!?](?:\s|$)|^[\s\S]*?\.(?:\s|$)',value)
        sentence=match.group().strip() if match else value
        if len(sentence)<=2000:return {'shortTitle':sentence,'source':{'kind':'bound-excerpt','field':field}}
    return None


def fixed_branding(template_id, params=None):
    # Explicit template/group design metadata; never inspect output pixels.
    brief=(params or {}).get('brief',{})
    if int(template_id) in [607,608] and brief.get('allowedStyles')==['02-B']:
        return {'policy':'fixed','variant':'light'}
    return {'policy':'fixed','variant':'dark' if int(template_id) in [605,606,607,608,623,624] else 'light'}


def install_project_signature(project, root, params, template_id):
    """Newly generated project only; preserve old projects and original inputs."""
    project,root=Path(project),Path(root)
    target=project/'brand';target.mkdir(exist_ok=True)
    for tone in ['lighter','path']:
        name='motiongit-circle-'+tone+'.webm'
        shutil.copyfile(root/'brand'/name,target/name)
    declaration={'schema':'motiongit.output-signature/2','assets':'brand','branding':fixed_branding(template_id,params)}
    # The optional legacy input is preserved in the original project, but no
    # longer inferred or forwarded to a newly generated output declaration.
    (project/'output-signature.json').write_text(json.dumps(declaration,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return declaration


def shared_config(project, config):
    declaration=json.loads((Path(project)/'output-signature.json').read_text(encoding='utf-8'))
    return {**config,'appliedBy':'deterministic-renderer','header':None,'branding':declaration.get('branding')}


def valid_declaration(value):
    if not isinstance(value,dict) or value.get('schema')!='motiongit.output-signature/2' or value.get('assets')!='brand' or set(value)-{'schema','assets','header','branding'}:return False
    if 'header'in value:resolve_header({'header':value['header']})
    branding=value.get('branding')
    return branding is None or (isinstance(branding,dict) and branding.get('policy')=='fixed' and branding.get('variant') in ['light','dark'])


def verify_shared_export(manifest, config):
    """Require every real native segment to prove the managed layer was drawn."""
    segments=manifest.get('segments',[])
    if not segments:raise ValueError('Managed native export is missing renderer segment receipts')
    for segment in segments:
        output=json.loads(segment['renderer_output'])
        signature=output.get('signature') or {}
        if signature.get('schema')!='motiongit.output-signature/4-alternating' or signature.get('pixelReads')!=0 or signature.get('samplingScreenshots')!=0:
            raise ValueError('Managed native export lacks fixed signature proof')
        if signature.get('labelWindows') or signature.get('contentHeader',{}).get('text'):
            raise ValueError('Native export must not restore the retired adjacent title')
        if config.get('branding') and signature.get('branding',{}).get('variant')!=config['branding']['variant']:
            raise ValueError('Native export design variant differs from the reviewed declaration')
    return True
