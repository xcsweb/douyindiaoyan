/* 模板页：样式分支即时切换（不刷新页面，保留可分享的 ?style= 地址） */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const rail = $('.style-rail'), slot = $('#stageSlot'), MG = window.MGArt;
  if (!rail || !slot || !MG) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const variant = (slot.querySelector('[data-art-variant]') || {}).dataset?.artVariant || 'prism';
  const previews = window.MotionGitPreviews.create(MG.updateArt);
  const stage = $('#stage');
  const ratio = /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(slot.dataset.ratio || '') ? slot.dataset.ratio.replace(':','/') : '16/9';
  /* 标签页键盘模式：只有当前项在 Tab 序列里，←→ Home End 切换并立即生效 */
  const tabs = $$('.sr-item', rail);
  const roving = (cur) => tabs.forEach((x) => x.setAttribute('tabindex', x === cur ? '0' : '-1'));
  roving(tabs.find((x) => x.classList.contains('on')) || tabs[0]);
  rail.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement); if (i < 0) return;
    const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length];
    next.focus(); next.click();
  });
  tabs.forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    roving(a);
    tabs.forEach((x) => { x.classList.toggle('on', x === a); x.setAttribute('aria-selected', x === a ? 'true' : 'false'); });
    previews.clear();
    $('video', slot)?.pause();
    stage.classList.remove('swap'); void stage.offsetWidth; stage.classList.add('swap');
    if (a.dataset.preview) {
      slot.innerHTML = `<div class="vthumb stage-frame" style="--stage-ratio:${ratio};aspect-ratio:${ratio}"><video class="ready" src="${esc(a.dataset.preview)}" controls autoplay muted playsinline style="opacity:1;position:static;display:block;aspect-ratio:${ratio};width:100%;background:#000;object-fit:contain"></video></div>`;
    } else {
      let o = {}; try { o = JSON.parse(a.dataset.opts || '{}'); } catch { /* ignore */ }
      slot.innerHTML = `<div class="vthumb stage-frame">${MG.art(variant, o)}</div>`;
      MG.updateArt($('.motion-art', slot), 0.7, 0);
      previews.observe(stage);
    }
    $('#stageName').textContent = a.dataset.name;
    const vh = $('#valHead'); if (vh) vh.textContent = a.dataset.name;
    let vals = {}; try { vals = JSON.parse(a.dataset.values || '{}'); } catch { /* ignore */ }
    $$('.ptable tr[data-key]').forEach((tr) => {
      const k = tr.dataset.key; if (!(k in vals)) return;
      const v = vals[k], cell = $('.pv', tr);
      const txt = Array.isArray(v) ? JSON.stringify(v) : String(v);
      cell.innerHTML = tr.dataset.color && /^#[0-9a-f]{6}$/i.test(txt) ? `<span class="cval"><i style="background:${txt}"></i><code class="mono">${esc(txt)}</code></span>` : `<code class="mono">${esc(txt)}</code>`;
      cell.classList.remove('flash-cell'); void cell.offsetWidth; cell.classList.add('flash-cell');
    });
    const ho = $('#handoff');
    if (ho && a.dataset.handoff) ho.textContent = a.dataset.handoff;
    else if (ho) ho.textContent = (!document.documentElement.lang.startsWith('zh') ? `Use this MotionGit template for my content, using the “${a.dataset.name}” style (presets/${a.dataset.vid}.json). Read motion.json and README first. Do not run code from the package directly.` : `用这个 MotionGit 模板做我的内容，使用「${a.dataset.name}」样式（presets/${a.dataset.vid}.json）。先读 motion.json 和 README，不要直接执行包内代码。`);
    const url = new URL(location.href); url.searchParams.set('style', a.dataset.vid); history.replaceState(null, '', url);
    document.dispatchEvent(new Event('mg-preview-updated'));
  }));
  if ($('.motion-art', slot)) previews.observe(stage);
  document.addEventListener('visibilitychange', () => { if (document.hidden) $('video', slot)?.pause(); });
  window.addEventListener('pagehide', () => $('video', slot)?.pause());
})();
