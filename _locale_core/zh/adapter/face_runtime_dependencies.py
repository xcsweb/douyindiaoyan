"""Standard-library host checks; no dependency installation during production."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

CHECK_CODE = "import importlib.metadata,json,sys\nfrom pathlib import Path\nif sys.version_info[:2] not in ((3,11),(3,12),(3,13)):\n    raise ValueError('Face runtime needs isolated Python 3.11, 3.12 or 3.13; run normal setup')\nimport cv2\nversion=importlib.metadata.version('opencv-python-headless')\nif version!='4.12.0.88' or cv2.__version__!='4.12.0':\n    raise ValueError('Expected opencv-python-headless==4.12.0.88; installed '+version+' / cv2 '+str(cv2.__version__))\nxml_path=Path(cv2.data.haarcascades)/'haarcascade_frontalface_default.xml'\nxml=xml_path.read_text(encoding='utf-8')\nstorage=cv2.FileStorage(xml,cv2.FILE_STORAGE_READ|cv2.FILE_STORAGE_MEMORY)\ntry:\n    detector=cv2.CascadeClassifier()\n    if not storage.isOpened() or not detector.read(storage.getFirstTopLevelNode()) or detector.empty():\n        raise ValueError('Frontal face model could not load from memory')\nfinally:\n    storage.release()\nprint(json.dumps({'distributionVersion':version,'opencvVersion':cv2.__version__,'model':'haarcascade_frontalface_default.xml','modelBytes':len(xml.encode('utf-8')),'modelLoaded':True,'python':sys.executable}))\n"

def check_face_runtime(python, *, env=None):
    result=subprocess.run([str(python),'-B','-c',CHECK_CODE],env=env,shell=False,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=60)
    if result.returncode:
        detail=(result.stderr or result.stdout or 'No diagnostic').strip()[-1800:]
        raise ValueError('FACE_RUNTIME_NOT_READY: Run normal setup to repair the isolated OpenCV dependency and model. '+detail)
    return json.loads(result.stdout)

def _compatible_python(*, env=None):
    candidates=[sys.executable] + [name for name in (shutil.which('python3.13'),shutil.which('python3.12'),shutil.which('python3.11')) if name]
    uv=shutil.which('uv')
    if uv:
        for version in ('3.13','3.12','3.11'):
            found=subprocess.run([uv,'python','find','--offline',version],env=env,shell=False,capture_output=True,text=True,timeout=30)
            if found.returncode==0:candidates.append(found.stdout.strip())
    if os.name=='nt' and shutil.which('py'):
        for version in ('-3.13','-3.12','-3.11'):
            found=subprocess.run(['py',version,'-c','import sys;print(sys.executable)'],env=env,shell=False,capture_output=True,text=True,timeout=30)
            if found.returncode==0:candidates.append(found.stdout.strip())
    for python in dict.fromkeys(candidates):
        result=subprocess.run([str(python),'-c','import json,sys;print(json.dumps(list(sys.version_info[:2])))'],env=env,shell=False,capture_output=True,text=True,timeout=30)
        if result.returncode==0 and json.loads(result.stdout) in ([3,11],[3,12],[3,13]):return str(python)
    raise ValueError('FACE_RUNTIME_PYTHON_REQUIRED: Install Python 3.13, 3.12 or 3.11, then run normal setup. OpenCV 4.12 uses NumPy wheels unavailable for Python 3.14; no global Python is changed.')

def create_face_venv(directory, *, env=None, clear=False):
    directory=Path(directory)
    if directory.is_symlink() or directory.name!='.venv':
        raise ValueError('Face dependency environment must be the verified cache .venv')
    if clear and (not directory.is_dir() or not (directory/'pyvenv.cfg').is_file() or (directory/'pyvenv.cfg').is_symlink()):
        raise ValueError('Cannot repair an unrecognized Python dependency environment')
    result=subprocess.run([_compatible_python(env=env),'-m','venv',*(['--clear'] if clear else []),str(directory)],env=env,shell=False,capture_output=True,text=True)
    if result.returncode:raise ValueError('FACE_RUNTIME_SETUP_FAILED: '+(result.stderr or result.stdout)[-3000:])

def repair_face_runtime(python, *, env=None, requirements=None):
    try:
        return check_face_runtime(python,env=env)
    except ValueError:
        version=subprocess.run([str(python),'-c','import json,sys;print(json.dumps(list(sys.version_info[:2])))'],env=env,shell=False,capture_output=True,text=True)
        if version.returncode==0 and json.loads(version.stdout) not in ([3,11],[3,12],[3,13]):
            if requirements is None:raise ValueError('FACE_RUNTIME_PYTHON_REQUIRED: Run normal setup with the declared requirements and Python 3.11, 3.12 or 3.13')
            create_face_venv(Path(python).parent.parent,env=env,clear=True)
            installed=subprocess.run([str(python),'-m','pip','install','--only-binary=:all:','-r',str(requirements)],env=env,shell=False,capture_output=True,text=True,encoding='utf-8',errors='replace')
            if installed.returncode:raise ValueError('FACE_RUNTIME_SETUP_FAILED: '+(installed.stderr or installed.stdout)[-3000:])
        result=subprocess.run([str(python),'-m','pip','install','--only-binary=:all:','--force-reinstall','opencv-python-headless==4.12.0.88'],env=env,shell=False,capture_output=True,text=True,encoding='utf-8',errors='replace')
        if result.returncode:
            raise ValueError('FACE_RUNTIME_SETUP_FAILED: '+(result.stderr or result.stdout or 'No diagnostic').strip()[-3000:])
        return check_face_runtime(python,env=env)
