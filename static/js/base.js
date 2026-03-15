function showToast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

async function apiCall(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

function showConfirmModal({
  title = 'Confirm Action',
  message = 'Are you sure?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
} = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('data-confirm-modal', '1');
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="close-btn" type="button" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <p style="color:var(--text-secondary);line-height:1.5;">${message}</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-role="cancel">${cancelText}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-role="confirm">${confirmText}</button>
        </div>
      </div>
    `;

    const closeButton = overlay.querySelector('.close-btn');
    const cancelButton = overlay.querySelector('[data-role="cancel"]');
    const confirmButton = overlay.querySelector('[data-role="confirm"]');

    const cleanup = result => {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      resolve(result);
    };

    const onKeydown = event => {
      if (event.key === 'Escape') cleanup(false);
    };

    closeButton.addEventListener('click', () => cleanup(false));
    cancelButton.addEventListener('click', () => cleanup(false));
    confirmButton.addEventListener('click', () => cleanup(true));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) cleanup(false);
    });

    document.addEventListener('keydown', onKeydown);
    document.body.appendChild(overlay);
    confirmButton.focus();
  });
}
