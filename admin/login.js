(() => {
  const form = document.getElementById('login');
  const status = document.getElementById('status');
  const button = form.querySelector('button');
  let csrf = '';
  async function initialize() {
    const response = await fetch('/api/audience/session');
    if (!response.ok) throw new Error('Connexion temporairement indisponible. Rechargez la page.');
    const data = await response.json();
    csrf = data.csrf;
    button.disabled = false;
    status.textContent = '';
  }
  initialize().catch(error => { status.textContent = error.message; status.className = 'error'; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = 'Connexion en cours...';
    status.className = '';
    try {
      const response = await fetch('/api/audience/login', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      if (response.ok) { form.reset(); location.replace('/statistiques'); return; }
      form.elements.password.value = '';
      throw new Error(response.status === 429
        ? 'Trop de tentatives. Patientez 15 minutes avant de r\u00e9essayer.'
        : response.status === 401 ? 'Identifiant ou mot de passe incorrect.'
          : 'Connexion refus\u00e9e. Rechargez la page puis r\u00e9essayez.');
    } catch (error) {
      status.textContent = error.message;
      status.className = 'error';
    } finally { button.disabled = false; }
  });
})();
