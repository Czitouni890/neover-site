const TITLE = 'NEOVER indisponible - controle automatique';
const LABEL = 'availability';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function checkSite({ base = 'https://neover.fr', fetcher = fetch, attempts = 3, delay = pause } = {}) {
  const origin = new URL(base);
  if (origin.username || origin.password || (origin.protocol !== 'https:' &&
    !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) {
    throw new Error('Use HTTPS or a local test server without URL credentials.');
  }
  let results = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    results = [];
    for (const route of ['/health', '/', '/contact.html']) {
      try {
        const response = await fetcher(origin.origin + route, {
          signal: AbortSignal.timeout(8000), redirect: 'error',
          headers: { 'user-agent': 'NEOVER-Availability/1.0', 'cache-control': 'no-cache' }
        });
        let valid = response.status === 200;
        if (valid && route === '/health') {
          valid = (await response.json()).status === 'ok';
        } else if (valid) {
          const html = await response.text();
          valid = /^text\/html\b/i.test(response.headers.get('content-type') || '') &&
            html.includes('/assets/multipage.js') && /id=["']root["']/.test(html);
        } else {
          await response.body?.cancel();
        }
        results.push({ route, ok: valid, reason: valid ? 'ok' : `http_${response.status}_or_invalid_content` });
      } catch (error) {
        results.push({ route, ok: false, reason: ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'network_or_invalid_response' });
      }
    }
    if (results.every(result => result.ok)) return { ok: true, attempts: attempt, results };
    if (attempt < attempts) await delay(10000);
  }
  return { ok: false, attempts, results };
}

async function syncIncident(report, { api, repository, runUrl, assignee = 'Czitouni890' }) {
  const path = `/repos/${repository}/issues`;
  const issues = await api('GET', `${path}?state=open&labels=${LABEL}&per_page=100`);
  const incident = issues.find(issue => issue.title === TITLE && !issue.pull_request);
  if (!report.ok && !incident) {
    const details = report.results.filter(result => !result.ok).map(result => `- ${result.route}: ${result.reason}`).join('\n');
    await api('POST', path, {
      title: TITLE, labels: [LABEL], assignees: [assignee],
      body: `Le controle a echoue apres ${report.attempts} passages.\n\n${details}\n\nExecution : ${runUrl}\n\nSuivre SURVEILLANCE_RESTAURATION.md. Aucun rollback automatique n'est declenche.`
    });
    return 'opened';
  }
  if (report.ok && incident) {
    await api('POST', `${path}/${incident.number}/comments`, {
      body: `Retablissement constate : /health, / et /contact.html repondent correctement.\n\nExecution : ${runUrl}`
    });
    await api('PATCH', `${path}/${incident.number}`, { state: 'closed', state_reason: 'completed' });
    return 'closed';
  }
  return incident ? 'already_open' : 'healthy';
}

async function testNotification({ api, repository, runUrl }) {
  const path = `/repos/${repository}/issues`;
  const issue = await api('POST', path, {
    title: 'EXERCICE - test alerte de disponibilite NEOVER',
    labels: [LABEL], assignees: ['Czitouni890'],
    body: `EXERCICE demande manuellement : aucune panne reelle et aucun retour arriere.\n\nLe site a ete controle comme disponible. Cette notification valide le canal GitHub et sera fermee automatiquement.\n\nExecution : ${runUrl}`
  });
  await api('PATCH', `${path}/${issue.number}`, { state: 'closed', state_reason: 'completed' });
  return issue.number;
}

async function main() {
  const baseArg = process.argv.find(arg => arg.startsWith('--url='));
  const notify = process.argv.includes('--notify');
  if (notify && baseArg) throw new Error('Notifications only monitor the fixed production origin.');
  const report = await checkSite({ base: baseArg ? baseArg.slice(6) : 'https://neover.fr' });
  console.log(JSON.stringify(report));
  if (notify) {
    const token = process.env.GITHUB_TOKEN;
    const repository = process.env.GITHUB_REPOSITORY;
    const runId = process.env.GITHUB_RUN_ID;
    if (!token || repository !== 'Czitouni890/neover-site' || !/^\d+$/.test(runId || '')) {
      throw new Error('Missing or unexpected GitHub workflow configuration.');
    }
    const api = async (method, route, body) => {
      const response = await fetch(`https://api.github.com${route}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
          'content-type': 'application/json', 'x-github-api-version': '2022-11-28' },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      if (!response.ok) throw new Error(`GitHub incident API failed (${response.status}).`);
      return response.status === 204 ? null : response.json();
    };
    const options = { api, repository, runUrl: `https://github.com/${repository}/actions/runs/${runId}` };
    console.log('Incident:', await syncIncident(report, options));
    if (report.ok && process.env.UPTIME_NOTIFICATION_TEST === 'true') {
      console.log('Notification exercise issue:', await testNotification(options));
    }
  }
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) main().catch(() => {
  console.error('Availability check or incident notification failed. Inspect the workflow and service status.');
  process.exitCode = 1;
});

module.exports = { checkSite, syncIncident, testNotification };
