const test = require('node:test');
const assert = require('node:assert/strict');
const { audit, classify } = require('../scripts/audit-dependencies.cjs');
const { notifyFailure, TITLE } = require('../scripts/notify-security-failure.cjs');

const clean = { status: 0, stdout: JSON.stringify({ metadata: {
  vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 }
} }) };
const network = code => ({ status: 1, stdout: JSON.stringify({ error: { code } }) });

test('temporary audit errors are retried at most twice and may recover', async () => {
  let calls = 0;
  const waits = [];
  const outcome = await audit({ run: () => ++calls < 3 ? network('EAI_AGAIN') : clean,
    delay: async ms => waits.push(ms), log: () => {} });
  assert.equal(outcome.ok, true);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [5000, 10000]);
});

test('persistent network failures remain blocking after three attempts', async () => {
  let calls = 0;
  const outcome = await audit({ run: () => { calls++; return network('E503'); },
    delay: async () => {}, log: () => {} });
  assert.equal(calls, 3);
  assert.equal(outcome.ok, false);
});

test('vulnerabilities are never retried, even if an error also looks transient', async () => {
  for (const severity of ['moderate', 'high', 'critical']) {
    let calls = 0;
    const report = JSON.parse(clean.stdout);
    report.metadata.vulnerabilities[severity] = 1;
    report.error = { code: 'ETIMEDOUT' };
    const result = await audit({ run: () => { calls++; return { status: 1, stdout: JSON.stringify(report) }; },
      delay: async () => assert.fail('Unexpected retry'), log: () => {} });
    assert.equal(result.kind, 'vulnerabilities');
    assert.equal(calls, 1);
  }
});

test('unknown responses, authentication and process failures do not pass or retry', async () => {
  for (const result of [{ status: 0, stdout: '{}' }, { status: 0, stdout: 'invalid' },
    { ...clean, status: 1 }, network('E401'), network('E403'),
    { status: null, error: { code: 'ENOENT' } }]) {
    let calls = 0;
    const outcome = await audit({ run: () => { calls++; return result; }, log: () => {} });
    assert.equal(outcome.ok, false);
    assert.equal(calls, 1);
  }
  assert.equal(classify(clean).ok, true);
});

test('audit logging omits raw provider errors and their potential secrets', async () => {
  const logs = [];
  await audit({ run: () => ({ status: 1, stdout: JSON.stringify({ error: {
    code: 'E401', summary: 'secret-token@example.com'
  } }), stderr: 'private-token' }), log: line => logs.push(line) });
  assert.equal(logs.join('').includes('secret-token'), false);
  assert.equal(logs.join('').includes('private-token'), false);
});

const context = { repository: 'Czitouni890/neover-site', runId: '1234', audit: 'failure', tests: 'success' };

test('a failed main run creates an assigned issue linking the actual logs', async () => {
  const writes = [];
  const result = await notifyFailure({ ...context, api: async (method, route, body) => {
    if (method === 'GET') return [];
    writes.push({ method, route, body });
    return { number: 1 };
  } });
  assert.equal(result, 'opened');
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].body.assignees, ['Czitouni890']);
  assert.match(writes[0].body.body, /actions\/runs\/1234/);
  assert.equal(writes[0].method, 'POST');
});

test('existing failure issues are not duplicated, modified or automatically closed', async () => {
  let calls = 0;
  const result = await notifyFailure({ ...context, api: async method => {
    calls++;
    assert.equal(method, 'GET');
    return [{ title: TITLE, number: 1 }];
  } });
  assert.equal(result, 'already_open');
  assert.equal(calls, 1);
});

test('issue lookup paginates and does not confuse pull requests with failure issues', async () => {
  let calls = 0;
  const result = await notifyFailure({ ...context, api: async (method, route) => {
    assert.equal(method, 'GET');
    calls++;
    if (route.endsWith('page=1')) return Array.from({ length: 100 }, () => ({ title: TITLE, pull_request: {} }));
    return [{ title: TITLE }];
  } });
  assert.equal(result, 'already_open');
  assert.equal(calls, 2);
});

test('invalid or successful contexts never access GitHub; notification failures are visible', async () => {
  for (const changes of [{ repository: 'other/repo' }, { runId: 'invalid' }, { audit: 'success' }]) {
    await assert.rejects(notifyFailure({ ...context, ...changes, api: () => assert.fail('Unexpected API call') }));
  }
  await assert.rejects(notifyFailure({ ...context, api: async () => { throw Error('API unavailable'); } }));
});
