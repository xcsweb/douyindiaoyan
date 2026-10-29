// Preparation only. Sampling the renderer's decoded files also honors sourceStart and rotation.
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function validatePresenterFace(p) {
  if (!p) return;
  if (p.framing != null && !['auto', 'none'].includes(p.framing))
    throw Error('presenter.framing must be auto or none');
  if (p.face != null && (!p.face || typeof p.face !== 'object' || Array.isArray(p.face) ||
      Object.keys(p.face).some(k => !['cx', 'cy', 'h', 'w'].includes(k)) ||
      !['cx', 'cy', 'h'].every(k => Number.isFinite(p.face[k]) && p.face[k] > 0 && p.face[k] <= 1) ||
      (p.face.w != null && !(Number.isFinite(p.face.w) && p.face.w > 0 && p.face.w <= 1))))
    throw Error('presenter.face requires normalized cx, cy and h, with optional w in (0,1]');
}

export function preparePresenterFace(p, samples, {manualPolicy=false}={}) {
  validatePresenterFace(p);
  const profile = 'motiongit.static-presenter-face/1';
  // Poster original mode disables the generic TK carrier with mode='none'
  // while keeping its separate vivid presenter visible. Only public framing
  // opt-out or the actual hide flag disables framing for the supplied source.
  if (p.framing === 'none' || p.hide === true)
    return {profile, status: 'disabled', sampleCount: 0, detectedSamples: 0, reviewRequired: false};
  if (p.face)
    return {profile, status: 'manual', sampleCount: 0, detectedSamples: 0, reviewRequired: false};
  if (manualPolicy)
    return {profile, status: 'policy', sampleCount: 0, detectedSamples: 0, reviewRequired: false};
  const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), 'static_face_samples.py');
  const result = spawnSync(process.env.PYTHON || 'python3', [helper], {
    input: JSON.stringify(samples), encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024,
    env: {...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8'},
  });
  if (result.status !== 0)
    throw Error('PRESENTER_FACE_PREPARATION: ' + (result.error?.message || result.stderr || 'Local detector failed'));
  let value;
  try { value = JSON.parse(result.stdout); } catch { throw Error('PRESENTER_FACE_PREPARATION: invalid detector result'); }
  validatePresenterFace({face: value.face});
  if (!value.framing || !['approximate', 'undetected'].includes(value.framing.status))
    throw Error('PRESENTER_FACE_PREPARATION: invalid detector report');
  p.face = value.face;
  return value.framing;
}

export async function presenterGeometry(page) {
  return page.evaluate(()=>(window.STYLE_CHILDREN||[window]).flatMap(w=>
    [...w.document.querySelectorAll('img[data-presenter-geometry]')].map(im=>
      JSON.parse(im.dataset.presenterGeometry))));
}
