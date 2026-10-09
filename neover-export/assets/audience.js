(() => {
  const key = 'neover-audience-choice';
  let recorded = false;
  let available = false;
  function notice() {
    if (location.pathname !== '/mentions-legales.html' || document.getElementById('audience')) return;
    const main = document.querySelector('main') || document.getElementById('mentions-legales');
    if (!main) return;
    const section = document.createElement('div');
    section.id = 'audience';
    const title = document.createElement('h2');
    title.textContent = "Mesure d'audience";
    const text = document.createElement('p');
    text.textContent = "NEOVER propose une mesure facultative des visites, uniquement apr\u00e8s votre accord. Le stockage local du navigateur conserve votre choix pendant 6 mois, un identifiant al\u00e9atoire renouvel\u00e9 chaque jour et une session renouvel\u00e9e apr\u00e8s 30 minutes d'inactivit\u00e9. Le serveur conserve les dates, pages consult\u00e9es et identifiants pseudonymis\u00e9s, pour produire des statistiques de fr\u00e9quentation. Le tableau pr\u00e9sente 90 jours d'historique. Les \u00e9v\u00e9nements plus anciens sont supprim\u00e9s lors de l'enregistrement d'une nouvelle visite. Aucun nom, email, adresse IP ou contenu de formulaire n'est enregistr\u00e9 dans cette base. Le stockage en ligne est assur\u00e9 par Supabase si cette option est configur\u00e9e. Vous pouvez refuser ou retirer votre accord via les pr\u00e9f\u00e9rences d'audience en bas de page. Pour toute demande relative \u00e0 vos donn\u00e9es : contact.neover@gmail.com.";
    section.append(title, text);
    main.append(section);
    if (location.hash === '#audience') section.scrollIntoView();
  }
  notice();
  new MutationObserver(notice).observe(document.getElementById('root'), { childList: true, subtree: true });
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
    link.href = '/mentions-legales.html#audience';
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
