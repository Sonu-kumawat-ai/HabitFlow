function showError(msg) {
  const el = document.getElementById('errorMsg');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  const data = {
    email: document.getElementById('email').value,
    password: document.getElementById('password').value
  };

  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (json.success) {
      window.location.href = json.redirect;
      return;
    }
    showError(json.message);
  } catch (err) {
    showError('Network error. Please try again.');
  }

  btn.disabled = false;
  btn.textContent = 'Sign In';
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Creating account...';

  const data = {
    username: document.getElementById('username').value,
    email: document.getElementById('email').value,
    password: document.getElementById('password').value
  };

  try {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (json.success) {
      window.location.href = json.redirect;
      return;
    }
    showError(json.message);
  } catch (err) {
    showError('Network error. Please try again.');
  }

  btn.disabled = false;
  btn.textContent = 'Create Account';
}

(function initAuthPage() {
  const mode = document.body.dataset.mode;
  if (mode === 'login') {
    const form = document.getElementById('loginForm');
    if (form) form.addEventListener('submit', handleLoginSubmit);
  } else {
    const form = document.getElementById('registerForm');
    if (form) form.addEventListener('submit', handleRegisterSubmit);
  }
})();
