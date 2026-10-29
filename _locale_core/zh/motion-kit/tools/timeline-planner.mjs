// Deterministic planning only: no network, model, speech edits, or inferred word times.
// Like the measured orb-fusion planning contract: mono 16 kHz PCM, 20 ms RMS,
// each candidate segment's mean RMS minus 5 dB, pauses >= 120 ms. A subtitle
// boundary must lie inside such a pause; a 0 ms SRT gap is NOT itself a pause.
// Prefer 3–9 s segments globally. If complete cues + measured pauses cannot
// satisfy that range, preserve speech and report the exact duration exceptions.
export const WINDOW_SECONDS = .02;
export const MIN_PAUSE = .12;
const EPS = 1e-7;
const round = n => Math.round(n * 1e6) / 1e6;

function timestamp(text) {
  const m = /^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(text);
  if (!m || +m[2] >= 60 || +m[3] >= 60) throw Error(`非法字幕时间 ${text}`);
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
}

export function parseSubtitles(source, duration) {
  const blocks = source.replace(/^\uFEFF/, '').replace(/\r/g, '').trim().split(/\n\s*\n/);
  const rows = blocks.map((block, i) => {
    const lines = block.split('\n'), at = lines.findIndex(l => l.includes('-->'));
    if (at < 0) throw Error(`字幕块 ${i + 1} 缺少时间码`);
    const parts = lines[at].trim().split(/\s*-->\s*/);
    if (parts.length !== 2) throw Error(`字幕块 ${i + 1} 时间码无效`);
    const s = timestamp(parts[0]), e = timestamp(parts[1]), text = lines.slice(at + 1).join('\n').trim();
    if (!text || !(e > s) || s < 0 || e > duration + .001) throw Error(`字幕块 ${i + 1} 为空、时间倒置或超出配音时长`);
    // A sub-millisecond source/container quantization may be clamped, never a phrase.
    return { id: i + 1, s, e: Math.min(e, duration), text };
  });
  if (!rows.length) throw Error('字幕至少需要一条非空台词');
  rows.forEach((r, i) => {
    if (i && r.s < rows[i - 1].e - EPS) throw Error(`字幕块 ${i} 与 ${i + 1} 重叠；先在副本里修正时间码`);
  });
  return rows;
}

export function rmsWindows(pcm, sampleRate = 16000) {
  if (pcm.length % 4) throw Error('PCM 字节数不是完整 Float32 样本');
  const samplesPerWindow = Math.round(sampleRate * WINDOW_SECONDS), result = [];
  for (let p = 0; p < pcm.length; p += samplesPerWindow * 4) {
    const end = Math.min(pcm.length, p + samplesPerWindow * 4);
    let sum = 0;
    for (let j = p; j < end; j += 4) {
      const v = pcm.readFloatLE(j);
      if (!Number.isFinite(v)) throw Error('PCM 含非有限样本');
      sum += v * v;
    }
    result.push(Math.sqrt(sum / ((end - p) / 4)));
  }
  return result;
}

export function meanRms(rms, start, end) {
  let sum = 0, weight = 0;
  for (let i = Math.max(0, Math.floor(start / WINDOW_SECONDS)); i < Math.min(rms.length, Math.ceil(end / WINDOW_SECONDS)); i++) {
    const w = Math.min(end, (i + 1) * WINDOW_SECONDS) - Math.max(start, i * WINDOW_SECONDS);
    if (w > 0) { sum += rms[i] * w; weight += w; }
  }
  return weight ? sum / weight : 0;
}

export function pauseAt(rms, boundary, threshold, duration) {
  let at = Math.floor(boundary / WINDOW_SECONDS);
  // An exact bin endpoint may belong to a quiet bin on either side. Inspect
  // only this contiguous run, not every earlier pause for every DP edge.
  if (!(at < rms.length && rms[at] <= threshold)) {
    if (Math.abs(boundary - at * WINDOW_SECONDS) > EPS || at < 1 || rms[at - 1] > threshold) return null;
    at--;
  }
  let first = at, last = at + 1;
  while (first > 0 && rms[first - 1] <= threshold) first--;
  while (last < rms.length && rms[last] <= threshold) last++;
  const s = first * WINDOW_SECONDS, e = Math.min(last * WINDOW_SECONDS, duration);
  return e - s >= MIN_PAUSE - EPS && boundary >= s - EPS && boundary <= e + EPS ? { s: round(s), e: round(e), duration: round(e - s) } : null;
}

export function candidateControls(text) {
  const result = [];
  if (/\d|[一二三四五六七八九十百千万亿]+\s*(?:个|年|天|秒|分钟|元|倍|%|％)/.test(text)) result.push('number');
  if (/第[一二三四五六七八九十\d]|、/.test(text)) result.push('list');
  if (/(?:以前|过去|之前)[\s\S]*(?:现在|如今)|[\s\S]+还是[\s\S]+/.test(text)) result.push('compare');
  if (/先[\s\S]*然后|然后[\s\S]*最后|先[\s\S]*最后/.test(text)) result.push('steps');
  /* 0.3.0：额外候选排在原有候选之后，只是提示，不证明台词具备对应结构 */
  if (/%|％|占比|比例|一半|三分之/.test(text)) result.push('donut');
  if (/增长|下降|涨|跌|趋势|翻倍/.test(text)) result.push('linechart');
  if (/\d{4}\s*年|那年|后来|当时/.test(text)) result.push('timeline');
  if (/第一名|排名|最多|最少|top/i.test(text)) result.push('ranking');
  if (/[？?]/.test(text)) result.push('qa');
  if (/误区|其实|并不是|不是.+而是/.test(text)) result.push('myth');
  if (/优点|缺点|好处|坏处|优势|劣势/.test(text)) result.push('prosCons');
  if (/是指|叫做|意思是|定义/.test(text)) result.push('definition');
  if (/注意|小心|提醒|建议/.test(text)) result.push('tip');
  if (/循环|反复|闭环/.test(text)) result.push('cycle');
  if (/流程|环节|步骤/.test(text)) result.push('flow');
  if (/关注|点赞|订阅|评论区/.test(text)) result.push('cta');
  result.push('keyword', 'quote');
  if (/[，,]/.test(text) && [...text].length <= 30) result.push('kinetic');
  return [...new Set(result)];
}

export function extractiveProps(rows) {
  const first = rows[0].text.replace(/\s+/g, ' ').trim();
  const chars = [...first];
  // Literal prefixes only, not a semantic summary. $text always retains every cue.
  return { word: chars.slice(0, 10).join(''), sub: rows.slice(0, 3).map(r => [...r.text.replace(/\s+/g, ' ').trim()].slice(0, 28).join('')) };
}

export function planSegments(rows, rms, duration) {
  // Integrating window RMS once keeps segment-local thresholds cheap even
  // for a 600 s voiceover with hundreds of SRT blocks (no global cutoff).
  const prefix = new Float64Array(rms.length + 1);
  rms.forEach((v, i) => { prefix[i + 1] = prefix[i] + v * WINDOW_SECONDS; });
  const integral = t => {
    const time = Math.max(0, Math.min(t, rms.length * WINDOW_SECONDS)), i = Math.floor(time / WINDOW_SECONDS);
    return prefix[i] + (i < rms.length ? rms[i] * (time - i * WINDOW_SECONDS) : 0);
  };
  const segmentMean = (start, end) => (integral(end) - integral(start)) / (end - start);
  const points = [{ t: 0, after: 0 }];
  for (let i = 0; i < rows.length - 1; i++) {
    // Midpoint stays outside both complete cues, including a shared endpoint.
    const t = round((rows[i].e + rows[i + 1].s) / 2);
    if (t > 0 && t < duration) points.push({ t, after: i + 1, srtGap: round(rows[i + 1].s - rows[i].e) });
  }
  points.push({ t: duration, after: rows.length });
  const costs = Array(points.length).fill(Infinity), previous = Array(points.length).fill(null), targetReachable = Array(points.length).fill(false);
  costs[0] = 0;
  targetReachable[0] = true;
  for (let j = 1; j < points.length; j++) {
    for (let i = 0; i < j; i++) {
      const d = points[j].t - points[i].t;
      if (!Number.isFinite(costs[i]) || d < 2 - EPS || points[j].after === points[i].after) continue;
      const mean = segmentMean(points[i].t, points[j].t), threshold = mean * 10 ** (-5 / 20);
      const pause = j === points.length - 1 ? null : pauseAt(rms, points[j].t, threshold, duration);
      if (j !== points.length - 1 && !pause) continue;
      const outside = d < 3 - EPS || d > 9 + EPS;
      if (!outside && targetReachable[i]) targetReachable[j] = true;
      // Lexicographic in practice: duration violations dominate ordinary pacing.
      // Never insert a cue split or invent a silent boundary just to reduce cost.
      const cost = costs[i] + (outside ? 100000 + Math.max(3 - d, d - 9) ** 2 * 100 : 0) + (d - 6) ** 2 + .1;
      if (cost < costs[j] - EPS) { costs[j] = cost; previous[j] = { i, mean, threshold, pause }; }
    }
  }
  if (!Number.isFinite(costs.at(-1))) throw Error('无法保留完整台词并满足控件最短 2 秒；请提供更长的口播');
  const path = [];
  for (let j = points.length - 1; j > 0;) {
    const p = previous[j];
    path.push({ from: points[p.i], to: points[j], ...p }); j = p.i;
  }
  path.reverse();
  const segments = [], measurements = [], warnings = [];
  path.forEach((edge, index) => {
    const owned = rows.slice(edge.from.after, edge.to.after), text = owned.map(r => r.text).join('\n');
    const d = edge.to.t - edge.from.t;
    const segment = { control: 'keyword', t0: edge.from.t, t1: edge.to.t, props: extractiveProps(owned), $candidates: candidateControls(text), $text: text, $sentenceVisualPlan: owned.map(r=>({subtitleId:r.id,start:r.s,end:r.e,spokenText:r.text,visualTarget:null,stateChange:null,status:'needs-visual-binding',timing:'provided-cue-unverified',candidates:candidateControls(r.text)})) };
    segments.push(segment);
    const measurement = { segment: index, subtitleIds: owned.map(r => r.id), meanRms: edge.mean, thresholdRms: edge.threshold, thresholdDbfs: edge.threshold > 0 ? 20 * Math.log10(edge.threshold) : null, boundary: index === path.length - 1 ? 'voiceover-end' : { at: edge.to.t, subtitleGap: edge.to.srtGap, audioPause: edge.pause, semanticReviewRequired: true } };
    measurements.push(measurement);
    if (d < 3 - EPS || d > 9 + EPS) {
      const alternatives = points.filter(p => p.t > edge.from.t && p.t < edge.to.t).map(p => {
        const left = p.t - edge.from.t, right = edge.to.t - p.t;
        const threshold = segmentMean(edge.from.t, p.t) * 10 ** (-5 / 20);
        const pause = pauseAt(rms, p.t, threshold, duration);
        return { at: p.t, afterSubtitle: p.after, leftDuration: round(left), rightDuration: round(right), bothInTargetRange: left >= 3 - EPS && left <= 9 + EPS && right >= 3 - EPS && right <= 9 + EPS, measuredPause: pause };
      });
      warnings.push({ segment: index, t0: segment.t0, t1: segment.t1, duration: round(d), code: 'duration-range-unreachable', reason: '所有 3–9 秒路径的可达性检查失败。完整字幕块边界、每段 RMS −5 dB 的真实停顿与目标时长无法同时满足；本段可选分界见 alternatives。保留原话和连续人声，助手复核句界与内容安排。', alternatives });
    }
  });
  return { segments, measurements, warnings, withinTargetRange: warnings.length === 0, allTargetPathExists: targetReachable.at(-1), candidateBoundaryCount: points.length - 2 };
}
