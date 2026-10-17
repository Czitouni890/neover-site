(() => {
  document.getElementById('logout').addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try {
      const session = await fetch('/api/audience/session');
      const data = await session.json();
      const response = await fetch('/api/audience/logout', {
        method: 'POST', headers: { 'x-csrf-token': data.csrf }
      });
      if (!response.ok) throw new Error('D\u00e9connexion indisponible. R\u00e9essayez.');
      location.replace('/statistiques/connexion');
    } catch (error) {
      document.getElementById('status').textContent = error.message;
      document.getElementById('logout').disabled = false;
    }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  let idleTimer;
  function armIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      document.body.replaceChildren();
      location.replace('/statistiques/connexion');
    }, 15 * 60000);
  }
  armIdleTimer();
  const form = document.getElementById('period');
  const status = document.getElementById('status');
  const exporter = document.getElementById('export');
  exporter.addEventListener('click', armIdleTimer);
  let view = 'daily';
  let loaded = null;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const offset = days => { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
  form.elements.from.value = offset(-6);
  form.elements.to.value = today;
  for (const input of form.querySelectorAll('input')) { input.min = offset(-89); input.max = today; }
  function updateExport() {
    if (loaded) exporter.href = '/api/audience/export?' + new URLSearchParams({ from: loaded.from, to: loaded.to, view });
  }
  function rows(target, data) {
    target.replaceChildren(...data.map(values => {
      const row = document.createElement('tr');
      for (const value of values) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
      return row;
    }));
  }
  async function load() {
    status.className = '';
    status.textContent = 'Chargement des statistiques...';
    form.querySelector('button').disabled = true;
    exporter.hidden = true;
    try {
      const response = await fetch('/api/audience/report?' + new URLSearchParams(new FormData(form)));
      if (response.status === 401) { location.replace('/statistiques/connexion'); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Statistiques indisponibles.');
      armIdleTimer();
      loaded = data;
      rows(document.getElementById('daily'), data.daily.map(row => [row.day, row.visitors ?? '\u2014', row.visits ?? '\u2014', row.views ?? '\u2014']));
      rows(document.getElementById('pages'), data.pages.map(row => [row.label, row.page, row.views]));
      document.getElementById('today').textContent = data.daily.find(row => row.day === data.today)?.visitors ?? '\u2014';
      document.getElementById('visits').textContent = data.daily.reduce((sum, row) => sum + row.visits, 0);
      document.getElementById('views').textContent = data.daily.reduce((sum, row) => sum + row.views, 0);
      status.textContent = data.pages.length ? 'Statistiques actualis\u00e9es.' : 'Aucune visite mesur\u00e9e sur cette p\u00e9riode.';
      updateExport();
      exporter.hidden = false;
    } catch (error) { status.className = 'error'; status.textContent = error.message; }
    finally { form.querySelector('button').disabled = false; }
  }
  for (const tab of document.querySelectorAll('[role=tab]')) {
    tab.addEventListener('click', () => {
      view = tab.dataset.view;
      for (const button of document.querySelectorAll('[role=tab]')) { const active = button === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; }
      document.getElementById('daily-panel').hidden = view !== 'daily';
      document.getElementById('pages-panel').hidden = view !== 'pages';
      updateExport();
    });
    tab.addEventListener('keydown', event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const other = document.getElementById(view === 'daily' ? 'pages-tab' : 'daily-tab'); other.click(); other.focus(); } });
  }
  form.addEventListener('submit', event => { event.preventDefault(); load(); });
  load();
})();
