"""Preserve the existing template workflow and validate whole-narration coverage."""
from pathlib import Path
import json,subprocess,sys
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1]
from duration_policy import validate
def main():
 args=sys.argv[1:];contract=json.loads((ROOT/'duration-policy.json').read_text());entry=ROOT/contract['originalEntry']
 if entry.resolve()==Path(__file__).resolve():raise ValueError('Recursive duration entry')
 op=next((x for x in args if x in {'check-params','plan','prepare','preview','render','setup','doctor','capabilities'}),None)
 if op in {'check-params','plan','prepare'}and '--demo'not in args:
  at=args.index(op);name=args[at+1]if at+1<len(args)else ''
  for flag in ['--input','--timeline','--parameters']:
   if flag in args:name=args[args.index(flag)+1]
  if name and name!='@vault':
   file=ROOT/name[6:]if name.startswith('@core/')else Path(name)
   if file.is_file():
    inputs=args[args.index('--inputs')+1]if '--inputs'in args else str(file.resolve().parent)
    root=ROOT if inputs=='@core'else Path(inputs)
    if inputs!='@vault':validate(json.loads(file.read_text()),root)
 result=subprocess.run([sys.executable,str(entry),*args],stderr=subprocess.PIPE,stdout=subprocess.PIPE if op=='capabilities'else None,text=True)
 if result.stderr:sys.stderr.write(result.stderr)
 if op=='capabilities'and result.returncode==0:
  capability=json.loads(result.stdout)
  capability['template']=json.loads((ROOT/'motion.json').read_text())['template']
  capability['operations']=['capabilities','setup','doctor','check-params','plan','prepare','preview','render']
  capability.setdefault('newNarration',{})['operation']='plan'
  print(json.dumps(capability,ensure_ascii=False))
 if result.returncode and any(x in(result.stderr or '')for x in ['cannot keep original action speed','outside selected scene','does not fit in target scene','needs at least','cannot fit all authored beats','Conflicting library asset definitions']):
  print('SCENE_PLAN_RETRY: This is a selected-scene/cue or planner conflict, not a whole-film duration cap. Keep the original narration and recompose compatible scenes; inspect an asset-definition conflict as a tool failure. Do not ask the user to shorten narration as the default remedy. Read DURATION.md.',file=sys.stderr)
 return result.returncode
if __name__=='__main__':
 try:raise SystemExit(main())
 except ValueError as error:raise SystemExit(str(error))
