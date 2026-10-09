(() => {
  const key = 'neover-audience-choice';
  let recorded = false;
  let available = false;
  function read(name) {
    try { return JSON.parse(localStorage.getItem(name)); } catch { return null; }
  }
  function choice() {
    const value = read(key);
    return value && value.expires > Date.now() ? value.value : null;
  }
  function day() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  async function record() {
    if (!available || recorded || choice() !== 'granted') return;
    if (!['/', '/index.html', '/qui-sommes-nous.html', '/services.html', '/contact.html', '/mentions-legales.html'].includes(location.pathname)) return;
    try {
      const date = day();
      let visitor = read('neover-audience-visitor');
      if (!visitor || visitor.day !== date) visitor = { day: date, id: crypto.randomUUID() };
      let session = read('neover-audience-session');
      if (!session || session.day !== date || Date.now() - session.last > 30 * 60000) session = { day: date, id: crypto.randomUUID() };
      session.last = Date.now();
      localStorage.setItem('neover-audience-visitor', JSON.stringify(visitor));
      localStorage.setItem('neover-audience-session', JSON.stringify(session));
      recorded = true;
      await fetch('/api/audience/event', {
        method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ consent: true, visitorId: visitor.id, sessionId: session.id, eventId: crypto.randomUUID(), page: location.pathname })
      });
    } catch { /* Statistics never interrupt site navigation. */ }
  }
  function save(value) {
    try {
      localStorage.setItem(key, JSON.stringify({ value, expires: Date.now() + 180 * 86400000 }));
      if (value === 'denied') {
        localStorage.removeItem('neover-audience-visitor');
        localStorage.removeItem('neover-audience-session');
      }
    } catch { /* Without storage, tracking stays disabled. */ }
    document.getElementById('neover-audience-consent')?.remove();
    record();
  }
  function open() {
    if (document.getElementById('neover-audience-consent')) return;
    const banner = document.createElement('aside');
    banner.id = 'neover-audience-consent';
    banner.setAttribute('aria-label', "Pr\u00e9f\u00e9rences de mesure d'audience");
    const text = document.createElement('p');
    text.textContent = "Avec votre accord, NEOVER mesure les visites et les pages consult\u00e9es avec des identifiants al\u00e9atoires. Aucun nom, email ou adresse IP n'est enregistr\u00e9 dans ces statistiques. Votre choix reste modifiable en bas de page.";
    const link = document.createElement('a');
    link.href = '/confidentialite.html';
    link.textContent = 'En savoir plus';
    const actions = document.createElement('div');
    for (const [label, value] of [['Refuser', 'denied'], ['Accepter', 'granted']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => save(value));
      actions.append(button);
    }
    text.append(' ', link);
    banner.append(text, actions);
    document.body.append(banner);
  }
  function preferences() {
    const footer = document.querySelector('footer');
    if (!available || !footer || document.getElementById('neover-audience-preferences')) return;
    const button = document.createElement('button');
    button.id = 'neover-audience-preferences'; button.type = 'button';
    button.textContent = "Pr\u00e9f\u00e9rences d'audience";
    button.addEventListener('click', open);
    footer.append(button);
  }
  window.addEventListener('storage', event => {
    if (event.key === key) { if (choice() !== null) document.getElementById('neover-audience-consent')?.remove(); record(); }
  });
  fetch('/api/audience/config').then(response => response.json()).then(config => {
    available = config.enabled === true;
    if (!available) return;
    preferences();
    new MutationObserver(preferences).observe(document.getElementById('root'), { childList: true, subtree: true });
    if (choice() === null) open();
    else record();
  }).catch(() => {});
})();
