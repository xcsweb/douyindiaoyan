/** Ordered, bounded PNG transport. Rendering/capture remains strictly serial. */
export function createFrameWriter(stream, {maxFrames = 2, maxBytes = 32 * 1024 * 1024} = {}) {
  if (!Number.isInteger(maxFrames) || maxFrames < 1 || !Number.isInteger(maxBytes) || maxBytes < 1) throw Error('Invalid frame queue limits');
  const pending = [];
  let bytes = 0, expected = 0, failed, finished = false;
  const stats = {frames:0, peakFrames:0, peakBytes:0, maxFrames, maxBytes, waitMs:0};
  const onError = error => { failed ??= error; };
  stream.on('error', onError);
  async function drainOne() {
    const start = performance.now(), first = pending.shift();
    await first.done; bytes -= first.bytes; stats.waitMs += performance.now() - start;
    if (failed) throw failed;
  }
  return {
    stats,
    async push(index, buffer) {
      if (finished) throw Error('Frame writer already finished');
      if (index !== expected || !Buffer.isBuffer(buffer)) throw Error('Non-sequential captured frame');
      if (buffer.byteLength > maxBytes) throw Error('Captured frame exceeds bounded queue capacity');
      while (pending.length && (pending.length >= maxFrames || bytes + buffer.byteLength > maxBytes)) await drainOne();
      if (failed) throw failed;
      const item = {bytes:buffer.byteLength};
      item.done = new Promise(resolve => {
        try { stream.write(buffer, error => { if (error) onError(error); resolve(); }); }
        catch (error) { onError(error); resolve(); }
      });
      pending.push(item); bytes += item.bytes; expected++; stats.frames++;
      stats.peakFrames = Math.max(stats.peakFrames, pending.length); stats.peakBytes = Math.max(stats.peakBytes, bytes);
    },
    async finish() {
      if (finished) throw Error('Frame writer already finished');
      finished = true;
      while (pending.length) await drainOne();
      if (failed) throw failed;
      await new Promise((resolve, reject) => stream.end(error => error ? reject(error) : resolve()));
      if (failed) throw failed;
    },
  };
}

const encoderClosures = new WeakMap();
/** Register immediately after spawn: exit alone does not mean stdio has closed. */
export function trackEncoder(child) {
  if (!encoderClosures.has(child)) encoderClosures.set(child, new Promise(resolve => child.once('close', resolve)));
  return child;
}

/** Do not remove the export directory before an encoder has released its files (Windows). */
export async function stopEncoder(child) {
  if (!child) return;
  const closed = encoderClosures.get(child);
  if (!closed) throw Error('Encoder close tracking was not registered at spawn');
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await closed;
}

/** Cancellation enters the same awaited cleanup path as render failures. */
export function installRenderCancellation(resources) {
  let cancellation, browserClose;
  function closeBrowser() {
    const {browser}=resources();
    if (browser && !browserClose) browserClose=browser.close();
    return browserClose ?? Promise.resolve();
  }
  const signals = process.platform === 'win32' ? ['SIGINT','SIGTERM','SIGBREAK'] : ['SIGINT','SIGTERM'];
  function cancel(signal) {
    cancellation ??= Error('RENDER_CANCELLED: ' + signal);
    const {encoder} = resources();
    if (encoder && encoder.exitCode === null && encoder.signalCode === null) encoder.kill('SIGKILL');
    void closeBrowser().catch(()=>{});
  }
  const listeners=signals.map(signal=>[signal,()=>cancel(signal)]);
  for(const [signal,listener] of listeners)process.on(signal,listener);
  return {
    check(){if(cancellation)throw cancellation;},
    closeBrowser,
    dispose(){for(const [signal,listener] of listeners)process.off(signal,listener);},
  };
}
