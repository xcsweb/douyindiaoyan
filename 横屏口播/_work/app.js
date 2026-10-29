/* ==========================================================
   MotionGit 站内通用交互（导航、菜单、复制、卡片动画、上传）
   ========================================================== */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // Short-lived wishlist drafts belong to the signed-in browser session.
  document.addEventListener('submit', e => {
    if (e.target instanceof HTMLFormElement && e.target.getAttribute('action') === '/logout') {
      try { for (const key of Object.keys(sessionStorage)) if (key.startsWith('mg-idea-draft-')) sessionStorage.removeItem(key); } catch {}
    }
  });

  /* Editing a note submits another form; protect unsaved template details. */
  $$('[data-unsaved-form]').forEach(details => {
    let dirty = false;
    document.addEventListener('mg-language-switch', () => { dirty = false; });
    details.addEventListener('input', () => { dirty = true; });
    details.addEventListener('change', () => { dirty = true; });
    details.addEventListener('submit', e => { if (!e.defaultPrevented) dirty = false; });
    window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('submit', e => {
      if (dirty && e.target !== details) {
        if (!window.confirm(details.dataset.unsavedWarning)) { e.preventDefault(); details.querySelector('button[type="submit"]')?.focus(); }
        else dirty = false;
      }
    }, true);
  });

  window.MotionGitNavigation.mount(document);

  /* 复制按钮 */
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const src = b.dataset.copy ? $(b.dataset.copy) : b.previousElementSibling;
    const text = src ? (src.value ?? src.textContent) : '';
    try { await navigator.clipboard.writeText(text.trim()); const o = b.textContent; b.textContent = (!document.documentElement.lang.startsWith('zh') ? window.MGCopy('Copied') : '已复制'); setTimeout(() => (b.textContent = o), 1400); } catch { /* ignore */ }
  }));

  /* 确认操作 */
  $$('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));
  $$('[data-confirm-btn]').forEach((b) => b.addEventListener('click', (e) => { if (!confirm(b.dataset.confirmBtn)) e.preventDefault(); }));

  /* 模板分享说明仅在展开时显示，支持键盘和点击外部收起。 */
  const shareMenus = $$('[data-template-share-menu]');
  shareMenus.forEach(menu => menu.addEventListener('focusout', e => {
    if (e.relatedTarget && !menu.contains(e.relatedTarget)) menu.open = false;
  }));
  document.addEventListener('click', e => shareMenus.forEach(menu => { if (!menu.contains(e.target)) menu.open = false; }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') shareMenus.forEach(menu => {
      if (menu.open) { menu.open = false; $('summary', menu).focus(); e.preventDefault(); }
    });
  });

  /* 分享：优先调用系统分享，其次复制链接 */
  $$('[data-share]').forEach((b) => b.addEventListener('click', async () => {
    const url = b.dataset.share, title = b.dataset.title || document.title, text = b.dataset.text || '';
    if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch { /* 用户取消 */ } }
    try { await navigator.clipboard.writeText(`${text} ${url}`.trim()); const o = b.innerHTML; b.textContent = (!document.documentElement.lang.startsWith('zh') ? window.MGCopy('Link copied') : '链接已复制'); setTimeout(() => (b.innerHTML = o), 1600); } catch { prompt((!document.documentElement.lang.startsWith('zh') ? window.MGCopy('Copy link') : '复制链接'), url); }
  }));

  /* 卡片封面：渲染画面并在可见时播放 */
  const MG = window.MGArt;
  const previews = window.MotionGitPreviews.create(MG?.updateArt);
  if (MG) {
    $$('[data-art-variant]').forEach(slot => {
      let options = {};
      try { options = JSON.parse(slot.dataset.artOpts || '{}'); } catch {}
      slot.insertAdjacentHTML('afterbegin', MG.art(slot.dataset.artVariant, options));
      MG.updateArt($('.motion-art', slot), +(slot.dataset.p || 0.62), 3);
    });
  }
  $$('.vcard[data-dur]').forEach((card, i) => {
    // The variant switcher owns its stage so it cannot acquire two animation loops.
    if (!$('[data-static]', card) && !(card.id === 'stage' && $('.style-rail'))) previews.observe(card, i);
  });

  /* 文件拖放区 */
  $$('[data-drop]').forEach((zone) => {
    const input = $('input[type=file]', zone), label = $('[data-drop-label]', zone);
    const show = () => { const f = input.files && input.files[0]; if (label && f) label.textContent = `${f.name} · ${(f.size / 1048576).toFixed(1)} MB`; zone.classList.toggle('has', !!f); };
    ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.remove('over'); }));
    zone.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; show(); } });
    input.addEventListener('change', show);
  });

  /* 用户名输入：实时规范化 */
  $$('input[data-handle]').forEach((i) => i.addEventListener('input', () => { i.value = i.value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 39); }));
})();
