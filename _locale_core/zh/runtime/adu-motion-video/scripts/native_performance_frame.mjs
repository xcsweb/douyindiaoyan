/** Serialized browser-side native frame; preserves original readiness/guard order. */
export async function nativePerformanceFrame({time, signature: enabled}) {
  const started = performance.now();
  const signature = enabled ? window.__motiongitSignature : null;
  if (signature) signature.before(time);
  const readyStarted = performance.now();

        await Promise.race([(async () => {
          if (time !== null) await window.renderAt(time);
          if (window.imgWait) await window.imgWait();
          await document.fonts.ready;
          if (document.querySelector('video,audio')) throw Error('Native video/audio elements require a separate deterministic adapter');
          const visibleImages = [...document.images].filter(im => {
            if (!(im.getAttribute('src') || im.currentSrc)) return false;
            for (let el = im; el; el = el.parentElement) {
              const style = getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
            }
            return true;
          });
          // A hidden outgoing sequence can have its decode cancelled by Chromium.
          // Only painted images are frame requirements; failed resource requests
          // still fail the render, including requests made by hidden elements.
          for (const im of visibleImages) {
            const expected = im.src;
            if (im._aduDecodedSource !== expected) {
              try { await im.decode(); }
              catch (error) {
                // Chromium can cancel a decode during a same-frame visibility
                // change. Retry the unchanged, successfully loaded image once;
                // never advance time or substitute an earlier video frame.
                if (error.name !== 'EncodingError' || im.src !== expected || !im.complete || !im.naturalWidth) {
                  throw Error(`Image decode failed: ${expected} (${error.message})`);
                }
                await new Promise(resolve => requestAnimationFrame(resolve));
                try { await im.decode(); }
                catch (retryError) { throw Error(`Image decode retry failed: ${expected} (${retryError.message})`); }
                window.ADU_DECODE_RETRIES = (window.ADU_DECODE_RETRIES || 0) + 1;
              }
              if (im.src !== expected) throw Error('Image source changed while decoding: ' + expected);
              im._aduDecodedSource = expected;
            }
            if (!im.naturalWidth) throw Error('Broken image resource');
          }
        })(), new Promise((_, reject) => setTimeout(() => reject(Error('Font/image/frame readiness timed out')), 30000))]);

  const readyMs = performance.now() - readyStarted;
  const signatureStarted = performance.now();
  if (signature && time !== null) { signature.hideSourceClocks(); signature.draw(time); }
  const signatureMs = performance.now() - signatureStarted;
  const guardStarted = performance.now();

  const visit=w=>{w.MotionCaptionSafeArea?.assertFrame();for(const frame of w.document.querySelectorAll('iframe')){
    const s=w.getComputedStyle(frame);if(frame.contentWindow&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>=.04)visit(frame.contentWindow);
  }};visit(window);
  return {browserMs:performance.now()-started,readyMs,signatureMs,guardMs:performance.now()-guardStarted};
}
