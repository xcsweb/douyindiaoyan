#!/usr/bin/env node
import {createSignature} from './signature.mjs';
import {validatePresenterFace,preparePresenterFace,presenterGeometry} from './static-presenter-face.mjs';
import {createFrameWriter,stopEncoder,trackEncoder,installRenderCancellation} from './performance-frame-pipeline.mjs';
// motion-kit 渲染器：时间轴 JSON → 校验 → 准备媒体 → 逐帧 renderAt(t) → 合成音效 → 混音 → 成片。
//
//   node tools/render.mjs --timeline film.json --plan                 只打印时间轴检查结果（先跑这个）
//   node tools/render.mjs --timeline film.json --out stills --stills 1,3,6
//   node tools/render.mjs --timeline film.json --out final.mp4        画面 + 音效 + 配音 + 配乐
//   node tools/render.mjs --timeline film.json --out v.mp4 --silent
//   可选：--theme dark-tech  --fps 60  --crf 18
//
// 素材路径相对时间轴文件所在目录。依赖（不会自动安装）：Node ≥ 20、ffmpeg/ffprobe、Chrome、playwright-core、Python3+NumPy
//   PLAYWRIGHT_CORE=<playwright-core 目录>  CHROME_PATH=<Chrome>  PYTHON=<带 NumPy 的 python3>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import {prepareOutput,verifyEncodedVideo,createExportStage,captionGeometry} from './export-output.mjs';
import { loadSpec, layerOf } from './kit-spec.mjs';
import {styleSelection,prepareStyledPage} from './style-compositor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
// Decode samples and preserve the source container clock; no credential reaches this renderer.
const AUDIO_HELPER=path.join(ROOT,'tools','audio_integrity.py');
// MOTIONGIT_MOTIONKIT_WINDOWS_REPAIR_V1
function checkedPythonResult(result, context) {
  if (result.error) {
    const code = result.error.code || result.error.name || 'spawn error';
    fail(`${context}: Python could not start (${code}): ${result.error.message}. Run setup and doctor for the selected motion-kit dependency cache.`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    const termination = result.signal ? `signal ${result.signal}` : `exit ${result.status}`;
    fail(`${context} (${termination}): ${detail || 'no diagnostic output'}`);
  }
  return JSON.parse(result.stdout);
}
function audioGuard(args){const r=spawnSync(process.env.PYTHON||'python3',[AUDIO_HELPER,...args.map(String)],{encoding:'utf8',maxBuffer:4*1024*1024});return checkedPythonResult(r,'Audio validation failed');}
const audioIntegrity={profile:'motiongit.audio-integrity/1',voice:null,music:null,encodedMix:null,embeddedPresenter:false};
function alignedAudio(file,name,start,duration,tmp){const target=path.join(tmp,name+'.wav');audioGuard(['extract',file,target,'--start',start,'--duration',duration]);return target;}

const USAGE = '用法：node tools/render.mjs --timeline film.json (--plan | --out final.mp4 [--silent] | --out DIR --stills 1,3 | --sfx cues.json) [--theme dark-tech] [--fps 60] [--crf 18] [--expect-version 0.2.0]';
const fail = m => { throw Error('render: '+m); };
const INTEGRATION_PATCH_VERSION = 'motiongit-media-1';

const opt = { fps: 60, crf: 18, theme: 'dark-tech' };
const argv = process.argv.slice(2);
while (argv.length) {
  const k = argv.shift();
  if (k === '--plan' || k === '--silent') { opt[k.slice(2)] = true; continue; }
  const v = argv.shift();
  if (!['--timeline', '--out', '--fps', '--crf', '--stills', '--theme', '--sfx', '--expect-version'].includes(k) || v == null) fail(`未知或缺值的参数 ${k}\n${USAGE}`);
  opt[k.slice(2)] = v;
}
if (opt.sfx) { if (opt.out) fail('--sfx 后面跟音效清单的输出文件名（.json），不要与 --out 同时使用'); if (!/\.json$/i.test(opt.sfx)) fail('--sfx 需要 .json 文件名，例如 --sfx /tmp/sfx.json'); opt.out = opt.sfx; opt.silent = true; }
if (!opt.timeline || (!opt.out && !opt.plan)) fail(USAGE);
opt.fps = Number(opt.fps); opt.crf = Number(opt.crf);
if (!(Number.isInteger(opt.fps) && opt.fps >= 1 && opt.fps <= 120)) fail('--fps 需为 1–120 的整数');
const kitSpec = loadSpec(SRC);
if (opt['expect-version'] && kitSpec.version !== opt['expect-version']) fail(`控件版本不符：要求 ${opt['expect-version']}，实际 ${kitSpec.version}；请使用对应的冻结源码，未开始渲染。`);
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const groupFiles = fs.readdirSync(path.join(SRC, 'controls')).filter(f => /\.(js|css|spec\.json)$/.test(f) && !['text.js', 'structure.js'].includes(f)).sort().map(f => `controls/${f}`);
const runtime = { engineVersion: kitSpec.version, integrationPatchVersion: INTEGRATION_PATCH_VERSION, fps: opt.fps, sourceHashes: Object.fromEntries([
  'kit/spec.json', 'kit/core.js', 'kit/timeline.js', 'kit/highlight-readability.js', 'kit/caption-typography.js', 'controls/text.js', 'controls/structure.js',
  `themes/${opt.theme}.js`, `themes/${opt.theme}.css`, ...(fs.existsSync(path.join(SRC, 'kit/icons.js')) ? ['kit/icons.js'] : []), 'index.html', ...groupFiles,
].map(p => [`src/${p}`, sha(path.join(SRC, p))])) };
runtime.sourceHashes.renderer = sha(fileURLToPath(import.meta.url));
for(const n of ['static-presenter-face.mjs','static_face_samples.py','presenter_face.py'])runtime.sourceHashes['tools/'+n]=sha(path.join(ROOT,'tools',n));
for(const n of ['presenter-framing.js','static-presenter-dom.js'])runtime.sourceHashes['src/kit/'+n]=sha(path.join(SRC,'kit',n));
const out = opt.out && path.resolve(opt.out);
if (out && fs.existsSync(out)) fail(`拒绝覆盖已存在的输出：${out}`);
if(out&&!opt.plan)prepareOutput(out);
if (!fs.existsSync(path.join(SRC, 'themes', opt.theme + '.js'))) fail(`没有这个主题：${opt.theme}`);
for (const t of ['ffmpeg', 'ffprobe']) if (spawnSync(t, ['-version'], { stdio: 'ignore' }).status !== 0) fail(`找不到 ${t}`);

/* ---------- 读时间轴 ---------- */
const TLP = path.resolve(opt.timeline), BASE = path.dirname(TLP);
let TL; try { TL = JSON.parse(fs.readFileSync(TLP, 'utf8')); } catch (e) { fail(`无法读取时间轴：${e.message}`); }
if(TL.captionAlignment!=null&&!['frame-center','content-center'].includes(TL.captionAlignment))fail('captionAlignment must be frame-center or content-center');
if(TL.captionSafeArea!=null&&!['short-video','frame'].includes(TL.captionSafeArea))fail('Invalid captionSafeArea');
if(TL.captionPosition!=null){const p=TL.captionPosition;if(typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['bottomRatio','leftRatio','rightRatio'].includes(k))||Object.values(p).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>=1)||(p.leftRatio??.08)+(p.rightRatio??.16)>=.8)fail('CAPTION_POSITION: invalid optional publish-preview ratios; keep real text and cue times.');}
const STYLE_CONFIG=JSON.parse(fs.readFileSync(path.join(ROOT,'style-profiles.json'),'utf8'));
const STYLE_SELECTION=styleSelection(TL,STYLE_CONFIG);
if(TL.highlightReadability!=null&&TL.highlightReadability!=='complete-text/1')fail('Unknown highlightReadability');
if(TL.captionLayout!=null&&TL.captionLayout!=='balanced-lines/1')fail('Unknown captionLayout');
if(TL.narrationComposition!=null&&TL.narrationComposition!=='readable/1')fail('Unknown narrationComposition');
if(TL.narrationComposition==='readable/1'&&((TL.captions?.length||TL.subtitles)&&TL.captionLayout!=='balanced-lines/1'))fail('NARRATION_COMPOSITION_UNRESOLVED: use the normal source-bound entry to resolve the explicit new-production profile before rendering');
runtime.templateStyleProfiles={default:TL.styleProfile||STYLE_CONFIG.defaultProfile,scenes:STYLE_SELECTION,contractSha256:sha(path.join(ROOT,'style-profiles.json'))};
validatePresenterFace(TL.presenter);
const SPEC = kitSpec.controls;
const errors = [], notes = [];

/* ---------- 校验：props 按 spec.json，时间按控件最短时长 ---------- */
function checkProps(props, schema, where) {
  if (!props || typeof props !== 'object' || Array.isArray(props)) { errors.push(`${where}：props 需为对象`); return; }
  for (const k of Object.keys(props)) if (!(k in schema)) errors.push(`${where}.${k}：这个控件没有该字段（可用：${Object.keys(schema).join(', ')}）`);
  for (const [k, s] of Object.entries(schema)) {
    const v = props[k], at = `${where}.${k}`;
    if (v == null || v === '') { if (s.required) errors.push(`${at}：必填`); continue; }
    if (s.type === 'string' || s.type === 'media') {
      if (typeof v !== 'string') { errors.push(`${at}：应为文字`); continue; }
      const n = [...v.replace(/\*/g, '')].length;
      if (s.max && n > s.max) errors.push(`${at}：最多 ${s.max} 个字（现在 ${n}）`);
    } else if (s.type === 'number' || s.type === 'integer') {
      if (typeof v !== 'number' || !Number.isFinite(v) || (s.type === 'integer' && !Number.isInteger(v))) errors.push(`${at}：应为数字`);
      else if ((s.min != null && v < s.min) || (s.max != null && v > s.max)) errors.push(`${at}：范围 ${s.min ?? '-∞'}–${s.max ?? '∞'}`);
    } else if (s.type === 'enum') { if (!s.values.includes(v)) errors.push(`${at}：只能是 ${s.values.join(' / ')}`); }
    else if (s.type === 'icon') { if (!kitSpec.icons.includes(v)) errors.push(`${at}：没有图标 ${v}（可用：${kitSpec.icons.join(' ')}）`); }
    else if (s.type === 'boolean') { if (typeof v !== 'boolean') errors.push(`${at}：应为 true / false`); }
    else if (s.type === 'object') checkProps(v, s.props, at);
    else if (s.type === 'array') {
      if (!Array.isArray(v)) { errors.push(`${at}：应为数组`); continue; }
      if (s.minItems != null && v.length < s.minItems) errors.push(`${at}：至少 ${s.minItems} 项`);
      if (s.maxItems != null && v.length > s.maxItems) errors.push(`${at}：最多 ${s.maxItems} 项（现在 ${v.length}）`);
      v.forEach((x, i) => {
        if (s.of === 'string') { if (typeof x !== 'string') errors.push(`${at}[${i}]：应为文字`); else if (s.max && [...x.replace(/\*/g, '')].length > s.max) errors.push(`${at}[${i}]：最多 ${s.max} 个字`); }
        else if (s.of === 'object') checkProps(x, s.props, `${at}[${i}]`);
      });
    }
  }
}
const lay = TL.layout || 'landscape';
if (!['landscape', 'portrait'].includes(lay)) errors.push('layout 只能是 landscape / portrait');
if (!(TL.duration > 0 && TL.duration <= 600)) errors.push('duration 需为 0–600 秒');
if (!Array.isArray(TL.segments) || !TL.segments.length) errors.push('segments 至少一段');
let prevEnd = 0;
const segNames = Object.keys(SPEC).filter(k => layerOf(SPEC[k]) === 'segment'), ovNames = Object.keys(SPEC).filter(k => layerOf(SPEC[k]) === 'overlay');
(TL.segments || []).forEach((sg, i) => {
  const at = `segments[${i}]`, spec = SPEC[sg.control];
  if (!spec) { errors.push(`${at}.control：没有控件 ${sg.control}（可用：${Object.keys(SPEC).join(', ')}）`); return; }
  if (layerOf(spec) !== 'segment') { errors.push(`${at}.control：${sg.control} 是叠加层控件，请放进 timeline.overlays`); return; }
  if (!(sg.t1 > sg.t0)) errors.push(`${at}：t1 必须大于 t0`);
  if (Math.abs(sg.t0 - prevEnd) > 1e-3) errors.push(`${at}：t0=${sg.t0} 与上一段结尾 ${prevEnd} 不相接（段与段必须首尾相接，不留空档）`);
  prevEnd = sg.t1;
  if (sg.t1 - sg.t0 < spec.minDur) errors.push(`${at}（${sg.control}）：至少 ${spec.minDur} 秒，现在 ${(sg.t1 - sg.t0).toFixed(2)} 秒`);
  checkProps(sg.props, spec.props, `${at}.props`);
  (sg.cues || []).forEach((c, k) => { if (!(c >= sg.t0 && c <= sg.t1 - .4)) errors.push(`${at}.cues[${k}]=${c}：须落在本段 ${sg.t0}–${(sg.t1 - .4).toFixed(2)} 内`); });
  if (sg.variant && !spec.variants.includes(sg.variant)) errors.push(`${at}.variant：${sg.control} 的变体只能是 ${spec.variants.join(' / ')}`);
  if (sg.presenter && !['card', 'small', 'hide'].includes(sg.presenter)) errors.push(`${at}.presenter 只能是 card / small / hide`);
  if (sg.transition && !kitSpec.transitions.includes(sg.transition)) errors.push(`${at}.transition 只能是 ${kitSpec.transitions.join(' / ')}`);
});
/* 叠加层：可与段落及彼此重叠，只要求落在全片之内 */
if (TL.overlays != null && !Array.isArray(TL.overlays)) errors.push('overlays 需为数组');
(Array.isArray(TL.overlays) ? TL.overlays : []).forEach((sg, i) => {
  const at = `overlays[${i}]`, spec = SPEC[sg.control];
  if (!spec || layerOf(spec) !== 'overlay') { errors.push(`${at}.control：没有叠加层控件 ${sg.control}（可用：${ovNames.join(', ')}）`); return; }
  if (!(sg.t0 >= 0 && sg.t1 > sg.t0 && sg.t1 <= TL.duration + 1e-3)) errors.push(`${at}：需 0 ≤ t0 < t1 ≤ duration`);
  if (sg.t1 - sg.t0 < spec.minDur) errors.push(`${at}（${sg.control}）：至少 ${spec.minDur} 秒，现在 ${(sg.t1 - sg.t0).toFixed(2)} 秒`);
  checkProps(sg.props, spec.props, `${at}.props`);
  (sg.cues || []).forEach((c, k) => { if (!(c >= sg.t0 && c <= sg.t1 - .2)) errors.push(`${at}.cues[${k}]=${c}：须落在本层 ${sg.t0}–${(sg.t1 - .2).toFixed(2)} 内`); });
  if (sg.variant && !spec.variants.includes(sg.variant)) errors.push(`${at}.variant：${sg.control} 的变体只能是 ${spec.variants.join(' / ')}`);
});
if (TL.segments?.length && Math.abs(prevEnd - TL.duration) > 1e-3) errors.push(`最后一段结尾 ${prevEnd} 必须等于 duration ${TL.duration}`);
if (errors.length) fail('时间轴不合格：\n  - ' + errors.join('\n  - '));

/* ---------- 素材：MotionGit integration preflight ---------- */
const media = f => {
  if (typeof f !== 'string' || !f) fail('素材路径应为非空文字');
  const p = path.resolve(BASE, f);
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) fail(`找不到普通素材文件 ${f}（相对 ${BASE}）`);
  return p;
};
const decoded = new Map();
const probe = f => {
  if (decoded.has(f)) return decoded.get(f);
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f], { encoding: 'utf8' });
  if (r.status !== 0) fail(`素材无法解析：${f}`);
  let data; try { data = JSON.parse(r.stdout); } catch { fail(`素材探测不是有效 JSON：${f}`); }
  const video = data.streams?.find(x => x.codec_type === 'video' && !x.disposition?.attached_pic);
  const audio = data.streams?.find(x => x.codec_type === 'audio');
  const still = !!video && /(?:image2|_pipe)(?:,|$)/.test(data.format?.format_name || '');
  const result = { video, audio, still, videoDuration: Number(video?.duration || data.format?.duration || 0) };
  if (video) {
    const d = spawnSync('ffmpeg', ['-v', 'error', '-xerror', '-i', f, '-map', '0:v:0', '-frames:v', still ? '1' : '2147483647', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (d.status !== 0 || d.error) fail(`画面解码失败：${f}：${(d.stderr || d.error?.message || '').trim().slice(-500)}`);
  }
  if (audio) {
    // Measure decoded audio samples rather than the container's video/audio tail.
    const d = spawnSync('ffmpeg', ['-v', 'error', '-xerror', '-i', f, '-map', '0:a:0', '-af', 'asetpts=N/SR/TB', '-progress', 'pipe:1', '-nostats', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (d.status !== 0 || d.error) fail(`声音解码失败：${f}`);
    const ticks = [...d.stdout.matchAll(/^out_time_us=(\d+)$/gm)];
    result.audioDuration = ticks.length ? Number(ticks.at(-1)[1]) / 1e6 : 0;
    if (!(result.audioDuration > 0)) fail(`声音没有可用解码时长：${f}`);
  }
  decoded.set(f, result); return result;
};
const policies = TL.mediaPolicies || {};
if (typeof policies !== 'object' || Array.isArray(policies)) fail('mediaPolicies 应为以素材路径为键的对象');
for (const [key, p] of Object.entries(policies)) {
  if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(k => !['role', 'fit', 'focus', 'sourceStart'].includes(k))) fail(`mediaPolicies[${key}] 字段无效`);
  if (Object.hasOwn(p, 'role') && !['presenter', 'photo', 'product', 'screenshot', 'evidence', 'logo'].includes(p.role)) fail(`mediaPolicies[${key}].role 无效`);
  if (Object.hasOwn(p, 'fit') && !['contain', 'cover'].includes(p.fit)) fail(`mediaPolicies[${key}].fit 无效`);
  if (Object.hasOwn(p, 'sourceStart') && !(Number.isFinite(p.sourceStart) && p.sourceStart >= 0)) fail(`mediaPolicies[${key}].sourceStart 无效`);
  if (Object.hasOwn(p, 'focus') && (!p.focus || typeof p.focus !== 'object' || Array.isArray(p.focus) || !(Number.isFinite(p.focus.x) && p.focus.x >= 0 && p.focus.x <= 1 && Number.isFinite(p.focus.y) && p.focus.y >= 0 && p.focus.y <= 1) || Object.keys(p.focus).some(k => !['x', 'y'].includes(k)))) fail(`mediaPolicies[${key}].focus 需 x/y 0–1`);
}
const START = TL.sourceStart || 0, D = TL.duration, tolerance = 1 / opt.fps + .002;
if (!(Number.isFinite(START) && START >= 0)) fail('sourceStart 需为非负有限秒数');
const assignV = list => { const seen = {}; return list.map(s => { const vs = SPEC[s.control].variants, k = seen[s.control] = (seen[s.control] ?? -1) + 1; return s.variant && vs.includes(s.variant) ? s.variant : vs[k % vs.length]; }); };
const VAR = assignV(TL.segments), OVS = TL.overlays || [], OVAR = assignV(OVS);
// The readable policy is explicit: replay of old inputs retains its original choreography.
if(TL.narrationCuePolicy!=null && TL.narrationCuePolicy!=='readable-at-cue/1')fail('Unknown narrationCuePolicy');
if(TL.narrationCuePolicy==='readable-at-cue/1')TL.segments.forEach((sg,i)=>{
  if(sg.control!=='polaroid'||VAR[i]!=='drop')return;
  const cues=sg.cues||[];
  if(cues.length!==sg.props.items.length||cues.some((c,j)=>!Number.isFinite(c)||c<sg.t0+.8-1e-7||(j&&c<cues[j-1])))
    fail('READABLE_CUE_LEAD: polaroid/drop needs one real cue per item and 0.8 seconds of scene lead. Keep the real cue; move the visual scene earlier or choose another expression.');
});
// List rail read points must have room for the original entry and precede the exit.
// Apply the same guard to overlays: both normal timeline paths pass cuePolicy to controls.
if(TL.narrationCuePolicy==='readable-at-cue/1')for(const [segments,variants] of [[TL.segments,VAR],[OVS,OVAR]])segments.forEach((sg,i)=>{
  if(sg.control!=='list'||variants[i]!=='rail')return;
  const cues=sg.cues||[];
  if(cues.length!==sg.props.items.length||cues.some((c,j)=>!Number.isFinite(c)||c<sg.t0+.55-1e-7||c>=sg.t1||(j&&c<cues[j-1])))
    fail('READABLE_CUE_LEAD: list/rail needs one real cue per item and 0.55 seconds of scene lead. Keep the real cue; move the visual scene earlier, split the list, or choose another expression.');
  if(cues.some(c=>c>sg.t1-.35))fail('READABLE_CUE_EXIT: list/rail cues must precede its final 0.35 seconds of exit. Keep the real cue; extend the visual scene, split the list, or choose another expression.');
});
const plan = { runtime, layout: lay, duration: D, sourceStart: START, segments: TL.segments.map((s, i) => `${s.t0.toFixed(2)}–${s.t1.toFixed(2)}  ${s.control}/${VAR[i]}${s.cues?.length ? '  cues ' + s.cues.join(', ') : ''}`), mediaBindings: [] };
if (OVS.length) plan.overlays = OVS.map((s, i) => `${s.t0.toFixed(2)}–${s.t1.toFixed(2)}  ${s.control}/${OVAR[i]}${s.cues?.length ? '  cues ' + s.cues.join(', ') : ''}`);
TL.segments.forEach((sg, i) => {
  if (sg.control === 'linechart') {
    const has2 = sg.props.points.map(p => p.value2 != null);
    if (has2.some(Boolean) && !has2.every(Boolean)) fail(`segments[${i}] 第二系列须为每个点提供 value2，不能静默忽略部分数据`);
    if (VAR[i] === 'spark' && (has2.some(Boolean) || sg.props.series?.length > 1)) fail(`segments[${i}] spark 只显示第一系列，请选择 line/area 或明确只提交一个系列`);
  }
  if (sg.control === 'subscribe' && sg.props.items?.length > (VAR[i] === 'follow' ? 1 : VAR[i] === 'bell' ? 2 : 3)) fail(`segments[${i}] ${VAR[i]} 无法完整展示这些按钮，请选 triple 或减少实际选定按钮`);
  if (sg.control === 'collage' && VAR[i] === 'mosaic' && sg.props.items.length > 1) fail(`segments[${i}] mosaic 只显示第一张，请选 masonry/wall 或明确只提交一张`);
});
const presenter = TL.presenter?.src ? { ...TL.presenter, abs: media(TL.presenter.src) } : null;
if(TL.presenter?.audio!=null&&!['source','mute'].includes(TL.presenter.audio))fail('presenter.audio must be source or mute');
let voice=TL.voiceover?media(TL.voiceover):null;
if(!voice&&!opt.silent&&presenter&&TL.presenter?.audio!=='mute'){
 const source=audioGuard(['measure',presenter.abs,'--allow-missing','--allow-silent']);
 if(source.audioStream){voice=presenter.abs;audioIntegrity.embeddedPresenter=true;}
}
const music=TL.music?media(TL.music):null;
let VOICE_START=START;
if(TL.narrationRange!=null&&!voice)fail('narrationRange requires a bound voice or original presenter audio');
if(voice){
 const full=audioGuard(['measure',voice,'--role','narration']);const range=TL.narrationRange,tol=Math.max(.05,2/opt.fps);
 if(range){if(!range||Object.keys(range).some(k=>!['start','end'].includes(k))||!(Number.isFinite(range.start)&&range.start>=0&&Number.isFinite(range.end)&&range.end>range.start)||range.end>full.durationSeconds+tol||Math.abs(range.end-range.start-D)>tol)fail('AUDIO_CLOCK_MISMATCH: invalid explicit narrationRange');VOICE_START=range.start;}
 else if(Math.abs(full.durationSeconds-START-D)>tol)fail('AUDIO_CLOCK_MISMATCH: preserve the complete narration and recompose shots; original voice duration differs from the film');
 audioIntegrity.voice=VOICE_START||range?audioGuard(['measure',voice,'--role','narration','--start',VOICE_START,'--duration',D]):full;
 audioIntegrity.voiceClock=audioGuard(['clock',voice]);
 plan.voiceover={decodedSeconds:full.durationSeconds,selection:{start:VOICE_START,end:VOICE_START+D},explicitRange:!!range,originalPresenter:audioIntegrity.embeddedPresenter};
}
if(music){const full=audioGuard(['measure',music,'--role','music']);if(full.durationSeconds<D-.05)fail('MUSIC_TOO_SHORT: bind a full-duration authorized track');audioIntegrity.music=audioGuard(['measure',music,'--role','music','--duration',D]);}
plan.audioIntegrity=audioIntegrity;
plan.highlightReadability={value:TL.highlightReadability||'original',explicit:TL.highlightReadability!=null,scope:'highlight marker/circle/underline only; clear final cut text, other control exits unchanged',guide:'NARRATION-VISUAL.md'};
const alignment=spawnSync(process.env.PYTHON||'python3',[path.join(ROOT,'tools','narration_alignment.py'),path.resolve(opt.timeline),...(voice?['--required']:[])],{encoding:'utf8',maxBuffer:4*1024*1024});
plan.narrationAlignment=checkedPythonResult(alignment,'Narration map validation failed');
const binding = (src, fallbackRole, fallbackStart, duration, where) => {
  const abs = media(src), data = probe(abs), p = policies[src] || {};
  if (!data.video) fail(`${where} 需要能解码的图片或视频`);
  const role = p.role || fallbackRole, fit = p.fit || (['screenshot', 'evidence', 'logo', 'product'].includes(role) ? 'contain' : 'cover');
  const sourceStart = p.sourceStart ?? fallbackStart ?? 0, focus = p.focus || { x: .5, y: .5 };
  if (!data.still && (!(data.videoDuration > 0) || sourceStart + duration > data.videoDuration + tolerance)) fail(`${where} 视频范围 ${sourceStart}–${sourceStart + duration}s 超出实际画面 ${data.videoDuration}s；不能冻结尾帧补齐`);
  if (!(Number.isFinite(sourceStart) && sourceStart >= 0)) fail(`${where} sourceStart 无效`);
  const result = { abs, still: data.still, role, fit, focus, sourceStart, duration };
  plan.mediaBindings.push({ source: src, sha256: sha(abs), where, role, fit, focus, sourceStart, duration, videoDuration: data.still ? null : data.videoDuration });
  return result;
};
const presenterBinding = presenter && binding(TL.presenter.src, 'presenter', START, D, 'presenter.src');
const segmentBindings = new Map();
const walkBindings = (obj, schema, sg, where) => {
  for (const [k, s] of Object.entries(schema || {})) {
    const v = obj?.[k]; if (v == null || v === '') continue;
    const at = `${where}.${k}`;
    if (s.type === 'media') {
      const role = k === 'avatar' ? 'photo' : sg.control === 'logo' ? 'logo' : ['media', 'browser', 'device', 'cursor', 'spotlight'].includes(sg.control) ? 'screenshot' : 'photo';
      segmentBindings.set(at, binding(v, role, obj.sourceStart || 0, sg.t1 - sg.t0, at));
    } else if (s.type === 'object') walkBindings(v, s.props, sg, at);
    else if (s.type === 'array' && s.of === 'object') v.forEach((x, i) => walkBindings(x, s.props, sg, `${at}[${i}]`));
  }
};
TL.segments.forEach((sg, i) => walkBindings(sg.props, SPEC[sg.control].props, sg, `segments[${i}].props`));
OVS.forEach((sg, i) => walkBindings(sg.props, SPEC[sg.control].props, sg, `overlays[${i}].props`));
const usedSources = new Set(plan.mediaBindings.map(b => b.source));
for (const key of Object.keys(policies)) if (!usedSources.has(key)) fail(`mediaPolicies[${key}] 未对应任何实际画面素材，请检查路径`);
/* 字幕：保留原文；本播放器只有两个字幕行，超出须先重排。 */
const captionText = (text, where) => {
  if (typeof text !== 'string' || !text.trim()) fail(`${where} 字幕文字需为非空字符串`);
  if (text.replace(/\r/g, '').split('\n').length > 2) fail(`${where} 字幕超过两行，请重排成两行或拆为逐句字幕，不能静默省略后续文字`);
  return text.replace(/\r/g, '');
};
if (TL.captions != null && !Array.isArray(TL.captions)) fail('captions 应为字幕数组');
let captions = TL.captions || [];
const validateCaptions = rows => {
  let previousEnd = 0;
  return rows.map((q, i) => {
    const at = `captions[${i}]`;
    if (!q || typeof q !== 'object' || Array.isArray(q) || !(Number.isFinite(q.s) && Number.isFinite(q.e) && q.s >= 0 && q.e > q.s && q.e <= D + 1e-6)) fail(`${at} 字幕时间需满足 0 ≤ s < e ≤ duration`);
    if (q.s < previousEnd - 1e-6) fail(`${at} 与上一条字幕重叠，播放器无法同时完整展示两条字幕`);
    previousEnd = q.e;
    return { ...q, text: captionText(q.text, at) };
  });
};
captions = validateCaptions(captions);
if (TL.subtitles) {
  const srt = fs.readFileSync(media(TL.subtitles), 'utf8').replace(/\r/g, '').replace(/^\uFEFF/, '');
  const ts = s => {
    const m = /^(\d+):([0-5]\d):([0-5]\d)[,.](\d{1,3})$/.exec(s);
    if (!m) fail(`SRT 时间格式无效：${s}`);
    return +m[1] * 3600 + +m[2] * 60 + +m[3] + Number(m[4]) / 10 ** m[4].length;
  };
  captions = []; let sourcePreviousEnd = 0;
  for (const [index, b] of srt.trim().split(/\n\s*\n/).entries()) {
    if (!b.trim()) continue;
    const ls = b.trim().split('\n'), i = ls.findIndex(l => l.includes('-->'));
    if (i < 0) fail(`SRT 段 ${index + 1} 缺少时间范围`);
    const parts = ls[i].split('-->'); if (parts.length !== 2) fail(`SRT 段 ${index + 1} 时间范围无效`);
    const [a, z] = parts.map(x => ts(x.trim()));
    if (!(z > a)) fail(`SRT 段 ${index + 1} 结束时间须大于开始时间`);
    if (a < sourcePreviousEnd - 1e-6) fail(`SRT 段 ${index + 1} 与上一条字幕重叠`);
    sourcePreviousEnd = z;
    const text = captionText(ls.slice(i + 1).join('\n'), `SRT 段 ${index + 1}`);
    const s = a - VOICE_START, e = z - VOICE_START;
    if (e <= 0 || s >= D) continue;
    captions.push({ s: Math.max(0, s), e: Math.min(D, e), text });
  }
}
captions = validateCaptions(captions);
/* 停留检查：每段里最后一个动作之后到段尾的时间；超过 6 秒报出，提示拆段或加动作 */
const ACTION_TAIL = { title: 1.6, keyword: 1.2, number: 1.8, list: 1, compare: 1, steps: 1, quote: 1.5, bars: 1.4, media: 1, stamp: 1, chapter: 1, fusion: 1.2 };
for (const [k, c] of Object.entries(SPEC)) if (ACTION_TAIL[k] == null) ACTION_TAIL[k] = c.tail ?? 1.2;
plan.holds = [];
TL.segments.forEach((s, i) => {
  const last = Math.max(s.t0 + .6, ...(s.cues || []));
  const hold = s.t1 - (last + (ACTION_TAIL[s.control] || 1));
  const rotates = ['list', 'title', 'keyword', 'media'].includes(s.control) || !!SPEC[s.control].idle;
  if (hold > 6 && !rotates) plan.holds.push(`segments[${i}] ${s.control}：最后一个动作后停留 ${hold.toFixed(1)} 秒，建议拆成两段或补一个 cue`);
  if (hold > 10 && rotates) plan.holds.push(`segments[${i}] ${s.control}：停留 ${hold.toFixed(1)} 秒，虽有轮转/扫光，仍建议拆段`);
});
plan.captions = captions.length;
plan.captionRows = captions;
plan.captionSourceStart = TL.subtitles ? VOICE_START : null;
plan.notes = notes;
if (opt.plan) { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }

/* ---------- 浏览器 ---------- */
async function loadChromium() {
  const req = createRequire(path.join(process.cwd(), 'package.json')), cands = [];
  if (process.env.PLAYWRIGHT_CORE) { let p = path.resolve(process.env.PLAYWRIGHT_CORE); if (fs.statSync(p).isDirectory()) p = createRequire(path.join(p, 'package.json')).resolve(p); cands.push(p); }
  for (const n of ['playwright-core', 'playwright']) { try { cands.push(req.resolve(n)); } catch {} try { cands.push(createRequire(import.meta.url).resolve(n)); } catch {} }
  for (const c of cands) { const m = await import(pathToFileURL(c).href); const ch = m.chromium || m.default?.chromium; if (ch) return ch; }
  fail('找不到 playwright-core。请设置 PLAYWRIGHT_CORE=<模块目录>');
}
function chromePath(ch) {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const list = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe')].filter(Boolean);
  const f = list.find(p => fs.existsSync(p)); if (f) return f;
  try { const p = ch.executablePath(); if (fs.existsSync(p)) return p; } catch {}
  fail('找不到 Chrome/Chromium，请设置 CHROME_PATH');
}
const run = (cmd, args, what) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); if (r.status !== 0) fail(`${what}失败：${(r.stderr || '').trim().split('\n').slice(-3).join(' ')}`); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-kit-'));
const performanceStats={profile:'fixed-signature-bounded-frames/1',startedMs:performance.now(),initializationMs:0,frameUpdateMs:0,captureMs:0,encoderFinishMs:0};
let ff, browser, exportStage;
const cancellation=installRenderCancellation(()=>({encoder:ff,browser}));
try {
  /* 页面目录：src 的副本 + 主题 + 输入 */
  const page = path.join(tmp, 'page');
  fs.cpSync(SRC, page, { recursive: true });
  // The signed helper's source is immutable. Only this new temporary page
  // receives writable modes for current input/theme files and safe cleanup.
  const makePageWritable=dir=>{fs.chmodSync(dir,0o700);for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())makePageWritable(file);else fs.chmodSync(file,0o600);}};
  makePageWritable(page);
  fs.copyFileSync(path.join(SRC, 'themes', opt.theme + '.js'), path.join(page, 'theme.js'));
  fs.copyFileSync(path.join(SRC, 'themes', opt.theme + '.css'), path.join(page, 'theme.css'));
  const toURL = p => pathToFileURL(p).href;
  const seq = (dir, fps) => ({ src: toURL(path.join(dir, 'f_X.jpg')).replace('f_X', 'f_%05d'), frames: fs.readdirSync(dir).length, fps });
  const extract = (abs, start, dur, name, scale) => {
    const dir = path.join(tmp, name); fs.mkdirSync(dir);
    run('ffmpeg', ['-v', 'error', '-copyts', '-start_at_zero', '-i', abs, '-t', String(dur), '-vf', `fps=${opt.fps}:start_time=0,trim=start=${start}:duration=${dur},setpts=PTS-STARTPTS,${scale}`, '-q:v', '3', path.join(dir, 'f_%05d.jpg')], `${name} 拆帧`);
    return seq(dir, opt.fps);
  };
  const TLX = JSON.parse(JSON.stringify(TL));
  TLX.layout = lay; TLX.captions = captions; delete TLX.subtitles;
  const prepared = new Map();
  const prepareBinding = (b, name) => {
    const key = JSON.stringify([b.abs, b.sourceStart, b.duration, b.role, b.fit, b.focus]);
    if (prepared.has(key)) return prepared.get(key);
    const raw = b.still ? { src: toURL(b.abs) } : extract(b.abs, b.sourceStart, b.duration, name, 'scale=1600:-2');
    const result = { ...raw, role: b.role, fit: b.fit, focus: b.focus };
    if (raw.frames != null && raw.frames < Math.round(b.duration * opt.fps)) fail(`${name} 解码画面帧数不足，不能冻结尾帧补齐`);
    prepared.set(key, result); return result;
  };
  if (presenter) Object.assign(TLX.presenter, prepareBinding(presenterBinding, 'presenter'));
  if (presenter) {
    const p=TLX.presenter;
    const samples=p.frames?[...new Set([.05,.25,.5,.75,.95].map(f=>Math.min(p.frames,Math.max(1,Math.floor((p.frames-1)*f)+1))))]
      .map(i=>fileURLToPath(p.src.replace(/%0(\d)d/,(_,n)=>String(i).padStart(+n,'0')))):[fileURLToPath(p.src)];
    p.faceFraming=preparePresenterFace(p,samples,{manualPolicy:!!policies[TL.presenter.src]&&['fit','focus'].some(k=>Object.hasOwn(policies[TL.presenter.src],k))});
    runtime.presenterFaceFraming={...p.faceFraming,face:p.face||null};
  }

  let mediaN = 0;
  const walkMedia = (obj, schema, where) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, s] of Object.entries(schema)) {
      const v = obj[k]; if (v == null || v === '') continue;
      const at = `${where}.${k}`;
      if (s.type === 'media') {
        const m = prepareBinding(segmentBindings.get(at), `media${mediaN++}`);
        (obj.$media ||= {})[k] = m;
        if (k === 'src') obj.media = m; // legacy controls use props.media.
      } else if (s.type === 'object') walkMedia(v, s.props, at);
      else if (s.type === 'array' && s.of === 'object') v.forEach((x, i) => walkMedia(x, s.props, `${at}[${i}]`));
    }
  };
  TLX.segments.forEach((sg, i) => walkMedia(sg.props, SPEC[sg.control].props, `segments[${i}].props`));
  (TLX.overlays || []).forEach((sg, i) => walkMedia(sg.props, SPEC[sg.control].props, `overlays[${i}].props`));
  fs.writeFileSync(path.join(page, 'inputs.js'), 'window.MOTION_INPUTS = ' + JSON.stringify({ timeline: TLX, theme: TL.theme || {} }) + ';\n');

  const styleApplication=prepareStyledPage(page,SRC,TLX,STYLE_CONFIG);
  const chromium = await loadChromium(), exe = chromePath(chromium);
  const W = lay === 'portrait' ? 1080 : 1920, H = lay === 'portrait' ? 1920 : 1080;
  browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--allow-file-access-from-files'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errs = [];
  await ctx.route('**/*', r => (/^https?:|^wss?:/i.test(r.request().url()) ? (errs.push('已拦截网络请求 ' + r.request().url()), r.abort()) : r.continue()));
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push('脚本错误：' + e.message + (e.stack ? '\n' + String(e.stack).split('\n').slice(1, 4).join('\n').replace(/file:\/\/[^ )]*\/page\//g, '') : '')));
  pg.on('requestfailed', r => errs.push(`资源加载失败：${r.url()}`));
  const check = () => { cancellation.check(); if (errs.length) throw Error(errs.join('\n')); };
  await pg.goto(toURL(path.join(page, 'index.html')), { waitUntil: 'load' });
  /* 页面脚本出错时 READY 永远不会出现：轮询期间发现错误立即报出，不干等超时 */
  for (let w = 0; ; w += 250) {
    check();
    if (await pg.evaluate(() => !!window.READY && typeof window.renderAt === 'function')) break;
    if (w > 60000) throw Error('页面 60 秒内未就绪');
    await new Promise(r => setTimeout(r, 250));
  }
  await pg.evaluate(() => window.READY); check();
  const suppressed = await pg.evaluate(() => [...document.querySelectorAll('.mk-dn .ctr .cl,.mk-pg .ctr .cl')].filter(e => e.style.display === 'none' && e.textContent.trim()).map(e => ({ control: e.closest('[data-control]')?.dataset.control, text: e.textContent })));
  const layoutDiagnostics = suppressed.map(s => ({ ...s, code: 'duplicate-center-label-hidden', detail: '中心重复标签未显示；旁侧图例仍保留该数据，不判定为内容丢失。' }));
  const mediaGeometry = await pg.evaluate(() => (window.STYLE_CHILDREN||[window]).flatMap(c=>[...c.document.querySelectorAll('img[data-media-role]')]).map(e => ({ role: e.dataset.mediaRole, fit: getComputedStyle(e).objectFit, focus: getComputedStyle(e).objectPosition, naturalWidth: e.naturalWidth, naturalHeight: e.naturalHeight, width: e.clientWidth, height: e.clientHeight })));
  if(runtime.presenterFaceFraming)runtime.presenterFaceFraming.decodedSizes=await pg.evaluate(()=>(window.STYLE_CHILDREN||[window]).map(w=>{const im=w.document.querySelector('#vivid-presenter img,.mk-tk img');return im?{width:im.naturalWidth,height:im.naturalHeight}:null}));
  const signature=await createSignature(pg,{requireContentHeader:true,/* motiongit-managed-content-header */ inputs:TL,width:W,height:H,duration:D,fps:opt.fps,mode:'dom',selector:'body'});
  performanceStats.initializationMs=performance.now()-performanceStats.startedMs;
  const frame = async t => { const started=performance.now(); await signature.frame(t); await pg.evaluate(()=>{
  const visit=w=>{w.MotionCaptionSafeArea?.assertFrame();for(const frame of w.document.querySelectorAll('iframe')){
    const s=w.getComputedStyle(frame);if(frame.contentWindow&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>=.04)visit(frame.contentWindow);
  }};visit(window);
}); performanceStats.frameUpdateMs+=performance.now()-started; check(); };
  const cues = await pg.evaluate(() => ({ end: window.END, sfx: window.SFX }));

  if (opt.sfx) {
    fs.writeFileSync(out, JSON.stringify(cues, null, 1) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ sfx: out, cues: cues.sfx.length }));
  } else if (opt.stills) {
    const times = opt.stills.split(',').map(Number);
    if (times.some(t => !(t >= 0 && t < D))) fail(`--stills 时间必须在 0–${D} 之间`);
    fs.mkdirSync(out);
    const captionSamples=[];
    for (const t of times) { await frame(t); await pg.screenshot({ path: path.join(out, `t_${t.toFixed(2)}.png`) }); captionSamples.push({time:t,items:await captionGeometry(pg),presenterFraming:await presenterGeometry(pg)}); }
    console.log(JSON.stringify({ runtime, stills: out, times, captionSamples, mediaBindings: plan.mediaBindings, mediaGeometry, layoutDiagnostics }));
  } else {
    if (!out.toLowerCase().endsWith('.mp4')) fail('--out 需要 .mp4 后缀');
    const n = Math.round(D * opt.fps);
    exportStage=createExportStage(out,{frames:n,fps:opt.fps,width:W,height:H,runtime});
    const video=path.join(exportStage.root,'v.mp4');
    const captionSamples=[],sampleFrames=new Set([Math.min(n-1,opt.fps),Math.floor(n/2),Math.max(0,n-1-opt.fps)]);
    ff = spawn('ffmpeg', ['-v', 'error', '-f', 'image2pipe', '-framerate', String(opt.fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', String(opt.crf), '-pix_fmt', 'yuv420p', '-frames:v', String(n), '-video_track_timescale','15360','-movie_timescale','60000','-movflags', '+faststart', video], { stdio: ['pipe', 'ignore', 'inherit'] });
    trackEncoder(ff);
    ff.stdin.on('error',()=>{});
    const done=new Promise((resolve,reject)=>{ff.once('error',reject);ff.once('close',(code,signal)=>code===0&&!signal?resolve(0):reject(Error(`ffmpeg encoding failed: code=${code}, signal=${signal}`)));});
    void done.catch(()=>{});
    const frameWriter = createFrameWriter(ff.stdin);
    for (let i = 0; i < n; i++) {
      await frame(i / opt.fps);
      const captureStarted=performance.now();
      const buf = await pg.screenshot({ type: 'jpeg', quality: 95 });
      performanceStats.captureMs+=performance.now()-captureStarted;
      if(sampleFrames.has(i))captionSamples.push({time:i/opt.fps,items:await captionGeometry(pg),presenterFraming:await presenterGeometry(pg)});
      await frameWriter.push(i, buf);
      if (i % (opt.fps * 2) === 0) process.stderr.write(`\r画面 ${i}/${n}`);
    }
    const encoderFinishStarted=performance.now();
    await frameWriter.finish();
    if (await done !== 0) fail('ffmpeg 编码失败');
    performanceStats.encoderFinishMs=performance.now()-encoderFinishStarted;
    exportStage.validated(video,verifyEncodedVideo(video,{width:W,height:H,frames:n,fps:opt.fps,audio:false}));
    process.stderr.write(`\r画面 ${n}/${n}\n`);
    let final = video, audio = 'none';
    if (!opt.silent) {
      const sj = path.join(tmp, 'sfx.json'), sw = path.join(tmp, 'sfx.wav');
      fs.writeFileSync(sj, JSON.stringify(cues));
      run(process.env.PYTHON || 'python3', [path.join(ROOT, 'audio', 'sfx.py'), sj, sw], '音效合成（需要 Python 3 + NumPy；加 --silent 可跳过）');
      const inA = ['-i', video, '-i', sw], fx = [], mix = [], DS = D.toFixed(3);
      const voiceInput=voice?alignedAudio(voice,'voice-clock',VOICE_START,D,tmp):null,musicInput=music?alignedAudio(music,'music-clock',0,D,tmp):null,expectedMix=path.join(tmp,'expected-mix.wav');
      const add = (...a) => { inA.push(...a); return inA.filter(x => x === '-i').length - 1; };
      fx.push(`[1:a]aresample=48000,volume=${voice ? -8 : -4}dB[s]`); mix.push('[s]');
      if (voice) { const k = add('-t', DS, '-i', voiceInput); fx.push(`[${k}:a]aresample=48000,${TL.ending === 'cut' ? '' : 'highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000,'}apad=whole_dur=${DS}${music ? ',asplit=2[v][vsc]' : '[v]'}`); mix.push('[v]'); }
      if (music) { const k = add('-t', DS, '-i', musicInput); fx.push(`[${k}:a]aresample=48000,volume=${voice ? -14 : -8}dB,apad=whole_dur=${DS}${voice ? '[m0];[m0][vsc]sidechaincompress=threshold=0.05:ratio=3:attack=30:release=450[m]' : '[m]'}`); mix.push('[m]'); }
      const tail = TL.ending === 'cut' ? `afade=t=out:st=${(D - .03).toFixed(3)}:d=0.03` : `afade=t=out:st=${(D - .6).toFixed(3)}:d=0.6`;
      fx.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=first,alimiter=limit=0.89,${tail},asplit=2[a][acheck]`);
      final = path.join(exportStage.root, 'final.mp4');
      run('ffmpeg', ['-v', 'error', ...inA, '-filter_complex', fx.join(';'), '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', DS, '-video_track_timescale','15360','-movie_timescale','60000','-movflags', '+faststart', final, '-map', '[acheck]', '-c:a', 'pcm_f32le', '-ar', '48000', '-t', DS, expectedMix], '混音');
      audioIntegrity.encodedMix=audioGuard(['verify-mix',expectedMix,final]);
      audio = ['sfx', voice && 'voiceover', music && 'music'].filter(Boolean).join(' + ');
    }
    const encoded=verifyEncodedVideo(final,{width:W,height:H,frames:n,fps:opt.fps,audio:!opt.silent});
    if(final!==video)exportStage.validated(final,encoded);
    const exportVerification=exportStage.publish(final);
    console.log(JSON.stringify({ runtime, mediaBindings: plan.mediaBindings, mediaGeometry, layoutDiagnostics, exportVerification, encoded, performance:{...performanceStats,elapsedMs:performance.now()-performanceStats.startedMs,frameWriter:frameWriter.stats}, output: out, frames: n, fps: opt.fps, duration: D, width: W, height: H, audio, audioIntegrity, captionSamples, holds: plan.holds, notes }));
  }
} catch(error) {
  if(exportStage)console.error(JSON.stringify(exportStage.failed(error)));
  throw error;
} finally {
  await stopEncoder(ff);
  try { await cancellation.closeBrowser(); } finally {
    cancellation.dispose();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
