const { spawnSync } = require('node:child_process');

const TRANSIENT = new Set([
  'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNREFUSED',
  'ENETUNREACH', 'E408', 'E429', 'E500', 'E502', 'E503', 'E504'
]);

function classify(result) {
  let report;
  try { report = JSON.parse(result.stdout); } catch { /* Fail closed on an unknown response. */ }
  const counts = report?.metadata?.vulnerabilities;
  if (counts && ['moderate', 'high', 'critical'].some(level => counts[level] > 0)) {
    return { kind: 'vulnerabilities', ok: false, report };
  }
  const code = report?.error?.code || result.error?.code;
  if (TRANSIENT.has(code)) return { kind: 'network', ok: false, code };
  const valid = counts && ['info', 'low', 'moderate', 'high', 'critical'].every(level =>
    Number.isInteger(counts[level]) && counts[level] >= 0);
  return { kind: result.status === 0 && valid && !report.error ? 'clean' : 'unknown',
    ok: Boolean(result.status === 0 && valid && !report.error), report };
}

async function audit({ run, delay = ms => new Promise(resolve => setTimeout(resolve, ms)), log = console.log }) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const outcome = classify(await run());
    log(JSON.stringify({ attempt, outcome: outcome.kind, code: outcome.code,
      vulnerabilities: outcome.report?.metadata?.vulnerabilities,
      packages: Object.entries(outcome.report?.vulnerabilities || {}).map(([name, value]) =>
        ({ name, severity: value.severity, fixAvailable: value.fixAvailable })) }));
    if (outcome.kind !== 'network' || attempt === 3) return outcome;
    await delay(attempt * 5000);
  }
}

async function main() {
  if (!process.env.npm_execpath) throw new Error('Run this audit with npm run security:audit.');
  const outcome = await audit({ run: () => spawnSync(process.execPath, [process.env.npm_execpath,
    'audit', '--package-lock-only', '--audit-level=moderate', '--json'], {
    encoding: 'utf8', timeout: 60000, maxBuffer: 5 * 1024 * 1024,
    env: { ...process.env, NPM_CONFIG_FETCH_RETRIES: '0', NPM_CONFIG_FETCH_TIMEOUT: '20000' }
  }) });
  if (!outcome.ok) process.exitCode = 1;
}

if (require.main === module) main().catch(() => {
  console.error('Dependency audit failed. Inspect the workflow; no automatic fix or merge was performed.');
  process.exitCode = 1;
});

module.exports = { classify, audit };
