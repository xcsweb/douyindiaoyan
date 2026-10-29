#!/usr/bin/env node
// Local, read-only media analysis. Candidates are hints; the assistant chooses
// controls and edits extractive copy before rendering. No model/API calls.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseSubtitles, rmsWindows, planSegments } from './timeline-planner.mjs';

const USAGE = 'node tools/plan-timeline.mjs --subtitles talk.srt --voiceover talk.mov [--layout landscape|portrait] --out draft.json';
const fail = message => { console.error(`plan-timeline: ${message}`); process.exit(1); };
const args = process.argv.slice(2), opt = { layout: 'landscape' };
while (args.length) {
  const key = args.shift();
  if (key === '--help' || key === '-h') { console.log(USAGE); process.exit(0); }
  const value = args.shift();
  if (!['--subtitles', '--voiceover', '--layout', '--out'].includes(key) || value == null || value.startsWith('--')) fail(`未知或缺值的参数 ${key}\n${USAGE}`);
  opt[key.slice(2)] = value;
}
if (!opt.subtitles || !opt.voiceover || !opt.out) fail(USAGE);
if (!['landscape', 'portrait'].includes(opt.layout)) fail('layout 只能是 landscape / portrait');

try {
  const subtitles = path.resolve(opt.subtitles), voice = path.resolve(opt.voiceover), out = path.resolve(opt.out), base = path.dirname(out);
  if (fs.existsSync(out)) throw Error(`拒绝覆盖已存在的输出：${out}`);
  if (!fs.statSync(base).isDirectory()) throw Error('输出的父目录必须已存在');
  for (const source of [subtitles, voice]) if (!fs.statSync(source).isFile()) throw Error(`素材不是普通文件：${source}`);
  const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const hashes = { voiceover: digest(voice), subtitles: digest(subtitles) };
  const command = (cmd, argv, binary = false) => {
    const r = spawnSync(cmd, argv, { encoding: binary ? null : 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.error || r.status !== 0) throw Error(`${cmd} 失败：${r.error?.message || String(r.stderr).trim().split('\n').slice(-3).join(' ')}`);
    return r.stdout;
  };
  const media = JSON.parse(command('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', voice]));
  const audio = media.streams?.find(s => s.codec_type === 'audio'), video = media.streams?.find(s => s.codec_type === 'video');
  if (!audio) throw Error('口播没有音轨；需要真实人声才能检测停顿');
  const duration = Number(audio.duration || media.format?.duration);
  if (!(duration >= 5 && duration <= 600 && Number.isFinite(duration))) throw Error('配音时长需为 5–600 秒，与 motion-kit 模板时长范围一致；不自动裁切或补长音频');
  if (Math.abs(Number(audio.start_time || 0) - Number(media.format?.start_time || 0)) > .02) throw Error('音轨相对媒体起点偏移超过 20 ms，请先在副本中对齐口播与字幕');
  const rows = parseSubtitles(fs.readFileSync(subtitles, 'utf8'), duration);
  const pcm = command('ffmpeg', ['-v', 'error', '-i', voice, '-vn', '-map', '0:a:0', '-t', String(duration), '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], true);
  if (Math.abs(pcm.length / 4 / 16000 - duration) > .025) throw Error('解码人声长度与声明时长相差超过 25 ms，请先核对素材');
  const planned = planSegments(rows, rmsWindows(pcm), duration);
  const relative = file => path.relative(base, file).split(path.sep).join('/') || path.basename(file);
  const materialNotes = [];
  if (video && Number(video.duration) < duration - .001) materialNotes.push({ code: 'presenter-shorter-than-voiceover', videoDuration: Number(video.duration), audioDuration: duration, shortageSeconds: duration - Number(video.duration), message: '源视频流比人声短；现有渲染器末尾会保持最后一帧。若不接受，请在素材副本里修复视频尾部后重新规划。' });
  const timeline = { layout: opt.layout, duration, voiceover: relative(voice), subtitles: relative(subtitles), ending: 'cut', segments: planned.segments,
    $planning: { schema: 'motion-kit-timeline-plan/1', status: 'needs-assistant-review', deterministic: true, networkRequests: 0, modelCalls: 0,
      method: '16kHz mono PCM; 20ms RMS; each segment mean RMS minus 5dB; measured pause >=120ms',
      boundaryPolicy: '完整字幕块之间的端点；必须落在真实音频停顿内。连续识别块不等于完整语法句，助手必须复核句界；不估算词锚点，不切音频或原字幕。',
      controlPolicy: 'keyword 仅为可渲染草稿默认；$candidates 是候选，助手按语义选择控件，数字/步骤候选不证明结构存在。',
      copyPolicy: 'props 为原话前缀，可能截短，不是语义摘要；所有原话与 cue 归属保存在 $text / subtitleIds，助手改写上屏文案。',
      durationPolicy: { targetMin: 3, targetMax: 9, preferred: 6, fullVoiceoverCovered: true, withinTargetRange: planned.withinTargetRange, allTargetPathExists: planned.allTargetPathExists },
      sourceHashes: hashes, audioDuration: duration, decodedAudioDuration: pcm.length / 4 / 16000, subtitleCount: rows.length,
      candidateBoundaryCount: planned.candidateBoundaryCount, segments: planned.measurements, warnings: planned.warnings, materialNotes } };
  if (video) timeline.presenter = { src: relative(voice) };
  if (digest(voice) !== hashes.voiceover || digest(subtitles) !== hashes.subtitles) throw Error('分析时素材发生变化；请重新规划');
  fs.writeFileSync(out, JSON.stringify(timeline, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output: out, duration, segments: timeline.segments.length, subtitles: rows.length, withinTargetRange: planned.withinTargetRange, warnings: planned.warnings, materialNotes }, null, 2));
} catch (e) { fail(e.message); }
