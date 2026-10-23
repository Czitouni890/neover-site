const TITLE = 'NEOVER - echec des controles de securite ou des tests';

async function notifyFailure({ api, repository, runId, audit, tests }) {
  if (repository !== 'Czitouni890/neover-site' || !/^\d+$/.test(runId || '') ||
      ![audit, tests].includes('failure')) throw new Error('Unexpected failure notification context.');
  const route = `/repos/${repository}/issues`;
  // Paginate to avoid creating duplicates when the repository has many open issues.
  for (let page = 1; ; page++) {
    const issues = await api('GET', `${route}?state=open&per_page=100&page=${page}`);
    if (issues.some(issue => !issue.pull_request && issue.title === TITLE)) return 'already_open';
    if (issues.length < 100) break;
  }
  await api('POST', route, {
    title: TITLE, assignees: ['Czitouni890'],
    body: `Un controle sur main a echoue.\n\n- Dependency Audit : ${audit}\n- Application Tests : ${tests}\n\nLogs : https://github.com/${repository}/actions/runs/${runId}\n\nConsulter les logs et les propositions Dependabot. Les erreurs reseau de l'audit ont au maximum deux relances ; les vulnerabilites et echecs applicatifs ne sont pas relances automatiquement.\n\nAucune correction generique, fusion, mise en production ou fermeture automatique de cette issue. Valider le correctif et fermer cette issue apres verification. Voir DEPENDANCES_SECURITE.md.`
  });
  return 'opened';
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token || process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_EVENT_NAME === 'pull_request') {
    throw new Error('Notifications are restricted to trusted main runs.');
  }
  const api = async (method, route, body) => {
    const response = await fetch(`https://api.github.com${route}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) throw new Error(`Notification API returned ${response.status}.`);
    return response.json();
  };
  console.log(await notifyFailure({ api, repository: process.env.GITHUB_REPOSITORY,
    runId: process.env.GITHUB_RUN_ID, audit: process.env.AUDIT_RESULT, tests: process.env.TESTS_RESULT }));
}

if (require.main === module) main().catch(() => {
  console.error('GitHub failure notification failed. Inspect Actions directly.');
  process.exitCode = 1;
});
module.exports = { notifyFailure, TITLE };
