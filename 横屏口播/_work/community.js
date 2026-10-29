(() => {
  'use strict';
  document.querySelectorAll('[data-community-confirm]').forEach((form) =>
    form.addEventListener('submit', (event) => {
      if (!confirm(form.dataset.communityConfirm)) event.preventDefault();
    }),
  );
  const form = document.querySelector('[data-community-form]');
  if (!form) return;
  const file = form.querySelector('[name=file]'),
    body = form.querySelector('[name=body]'),
    button = form.querySelector('[type=submit]'),
    status = form.querySelector('[data-community-status]'),
    error = form.querySelector('[data-community-error]');
  let busy = false;
  const fail = (message) => {
    error.textContent = message;
    error.hidden = false;
    error.focus();
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    error.hidden = true;
    const attachment = file.files[0];
    if (!body.value.trim() && !attachment) {
      fail(form.dataset.invalid);
      return;
    }
    if (attachment && attachment.size > 32 * 1024 * 1024) {
      fail(form.dataset.tooLarge);
      return;
    }
    if (!form.reportValidity()) return;
    busy = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = form.dataset.uploading;
    const data = new FormData(form);
    try {
      // Shrink decoded local photos before transfer; the server still independently
      // validates and re-encodes every upload. Videos are compressed on the server.
      if (
        attachment &&
        /^image\/(jpeg|png|webp)$/.test(attachment.type) &&
        window.createImageBitmap
      ) {
        let bitmap;
        try {
          bitmap = await createImageBitmap(attachment);
          const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(2, Math.round(bitmap.width * ratio));
          canvas.height = Math.max(2, Math.round(bitmap.height * ratio));
          canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.8));
          if (blob && blob.type === 'image/webp') data.set('file', blob, 'creation.webp');
        } catch {
          /* Browser decoding is optional; server validation is authoritative. */
        } finally {
          bitmap?.close();
        }
      }
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', form.action);
        xhr.timeout = 180000;
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('x-csrf', String(data.get('_csrf')));
        xhr.upload.onprogress = (e) => {
          status.textContent =
            form.dataset.uploading +
            (e.lengthComputable ? ' ' + Math.round((e.loaded / e.total) * 100) + '%' : '');
        };
        xhr.upload.onload = () => {
          status.textContent = attachment ? form.dataset.processing : form.dataset.uploading;
        };
        xhr.onerror = xhr.ontimeout = () => reject(new Error(form.dataset.failed));
        xhr.onload = () => {
          let response;
          try {
            response = JSON.parse(xhr.responseText);
          } catch {
            reject(new Error(form.dataset.failed));
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300 && response.ok) {
            const next = new URL(response.url, location.href);
            if (next.pathname === location.pathname && next.search === location.search) {
              history.replaceState(null, '', next.href);
              location.reload();
            } else location.assign(next.href);
            resolve();
          } else reject(new Error(response.message || form.dataset.failed));
        };
        xhr.send(data);
      });
    } catch (e) {
      fail(e.message || form.dataset.failed);
      status.textContent = '';
      busy = false;
      button.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
})();
