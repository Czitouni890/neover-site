const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { createHash, createHmac, timingSafeEqual } = require('node:crypto');
const { rateLimit } = require('express-rate-limit');

const pages = {
  '/': 'Accueil', '/qui-sommes-nous.html': 'Qui sommes-nous',
  '/services.html': 'Services', '/contact.html': 'Contact', '/mentions-legales.html': 'Mentions legales'
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function parisDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}
function shiftDay(day, offset) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
function range(query, today) {
  const from = query.from || shiftDay(today, -6);
  const to = query.to || today;
  const valid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid(from) || !valid(to) || from > to || to > today || from < shiftDay(today, -89)) return null;
  return { from, to };
}

function sqliteStore(filename) {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS neover_events (
      event_id TEXT PRIMARY KEY, day TEXT NOT NULL, visitor_hash TEXT NOT NULL,
      session_hash TEXT NOT NULL, page TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS neover_events_day ON neover_events(day);
    CREATE TABLE IF NOT EXISTS neover_audience_meta (id INTEGER PRIMARY KEY, started_day TEXT NOT NULL);`);
  return {
    async record(event) {
      db.prepare('INSERT OR IGNORE INTO neover_audience_meta VALUES (1, ?)').run(event.day);
      db.prepare('DELETE FROM neover_events WHERE day < ?').run(shiftDay(event.day, -89));
      db.prepare('INSERT OR IGNORE INTO neover_events VALUES (?, ?, ?, ?, ?)').run(event.event_id, event.day, event.visitor_hash, event.session_hash, event.page);
    },
    async report(from, to) {
      return {
        startedOn: db.prepare('SELECT started_day FROM neover_audience_meta WHERE id=1').get()?.started_day || null,
        daily: db.prepare('SELECT day, count(DISTINCT visitor_hash) AS visitors, count(DISTINCT session_hash) AS visits, count(*) AS views FROM neover_events WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day DESC').all(from, to),
        pages: db.prepare('SELECT page, count(*) AS views FROM neover_events WHERE day BETWEEN ? AND ? GROUP BY page ORDER BY views DESC, page').all(from, to)
      };
    },
    close: () => db.close()
  };
}

function supabaseStore(url, key, fetcher = fetch) {
  const origin = new URL(url);
  if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.supabase.co')) throw new Error('Invalid analytics storage URL');
  async function rpc(name, body) {
    const headers = { apikey: key, 'content-type': 'application/json' };
    if (key.startsWith('ey')) headers.authorization = `Bearer ${key}`;
    const response = await fetcher(`${origin.origin}/rest/v1/rpc/${name}`, {
      method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('Analytics storage unavailable');
    return response.status === 204 ? null : response.json();
  }
  return {
    record: event => rpc('neover_record', Object.fromEntries(Object.entries(event).map(([key, value]) => [`p_${key}`, value]))),
    report: (from, to) => rpc('neover_report', { p_from: from, p_to: to }),
    close() {}
  };
}

function createAnalytics(options = {}) {
  const env = options.env || process.env;
  const router = express.Router();
  const password = env.ANALYTICS_ADMIN_PASSWORD || '';
  const secret = env.ANALYTICS_HASH_SECRET || '';
  let store = options.store || null;
  if (!store && password.length >= 16 && secret.length >= 32) {
    try {
      if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) store = supabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      else if (env.ANALYTICS_DB_PATH && (env.RENDER !== 'true' || env.ANALYTICS_PERSISTENT_DISK === 'true')) store = sqliteStore(env.ANALYTICS_DB_PATH);
    } catch (_error) { console.error('NEOVER_AUDIENCE_CONFIGURATION_UNAVAILABLE'); }
  }
  const enabled = Boolean(store && password.length >= 16 && secret.length >= 32);
  const clock = options.clock || (() => new Date());
  const digest = value => createHash('sha256').update(value).digest();
  const pseudonym = (day, value) => createHmac('sha256', secret).update(`${day}:${value}`).digest('hex');
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/api/audience/config', async (_req, res) => {
    if (!enabled) return res.json({ enabled: false });
    try {
      const today = parisDay(clock());
      await store.report(today, today);
      res.json({ enabled: true });
    } catch (_error) { res.json({ enabled: false }); }
  });
  router.post('/api/audience/event', rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }), async (req, res) => {
    if (!enabled) return res.status(503).json({ ok: false });
    const origin = env.SITE_URL || `${req.protocol}://${req.get('host')}`;
    if (req.get('origin') !== new URL(origin).origin) return res.status(403).json({ ok: false });
    const body = req.body || {};
    const page = body.page === '/index.html' ? '/' : body.page;
    if (body.consent !== true || ![body.visitorId, body.sessionId, body.eventId].every(value => typeof value === 'string' && uuid.test(value)) || !Object.hasOwn(pages, page)) return res.status(400).json({ ok: false });
    const day = parisDay(clock());
    try {
      await store.record({ event_id: pseudonym(day, body.eventId), day, visitor_hash: pseudonym(day, body.visitorId), session_hash: pseudonym(day, `${body.visitorId}:${body.sessionId}`), page });
      res.status(204).end();
    } catch (_error) {
      console.error('NEOVER_AUDIENCE_STORAGE_UNAVAILABLE');
      res.status(503).json({ ok: false });
    }
  });

  const loginLimiter = rateLimit({ windowMs: 15 * 60000, limit: 10, skipSuccessfulRequests: true, standardHeaders: 'draft-8', legacyHeaders: false });
  function auth(req, res, next) {
    if (!enabled) return res.status(503).type('text').send('Statistiques non configurees.');
    if (env.RENDER === 'true' && !req.secure) return res.status(403).end();
    const header = req.get('authorization') || '';
    const supplied = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
    if (!timingSafeEqual(digest(supplied), digest(`admin:${password}`))) {
      res.set('WWW-Authenticate', 'Basic realm="NEOVER statistiques", charset="UTF-8"');
      return res.status(401).end();
    }
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    next();
  }
  router.use(['/statistiques', '/admin-assets', '/api/audience/report', '/api/audience/export'], loginLimiter, auth);
  router.get('/statistiques', (_req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));
  router.get('/admin-assets/:file', (req, res) => {
    if (!['admin.css', 'admin.js'].includes(req.params.file)) return res.status(404).end();
    res.sendFile(path.join(__dirname, 'admin', req.params.file));
  });
  async function report(req, res, exportFile = false) {
    const today = parisDay(clock());
    const period = range(req.query, today);
    if (!period) return res.status(400).json({ ok: false, message: 'Choisir une periode dans les 90 derniers jours.' });
    try {
      const raw = await store.report(period.from, period.to);
      const byDay = new Map(raw.daily.map(row => [row.day, row]));
      const daily = [];
      for (let day = period.to; day >= period.from; day = shiftDay(day, -1)) {
        const row = byDay.get(day) || {};
        const measured = raw.startedOn && day >= raw.startedOn;
        daily.push({ day, visitors: measured ? Number(row.visitors || 0) : null, visits: measured ? Number(row.visits || 0) : null, views: measured ? Number(row.views || 0) : null });
      }
      const consulted = raw.pages.map(row => ({ page: row.page, label: pages[row.page] || row.page, views: Number(row.views) }));
      if (exportFile) {
        const rows = req.query.view === 'pages'
          ? [['Page', 'URL', 'Pages vues'], ...consulted.map(row => [row.label, row.page, row.views])]
          : [['Date (Europe/Paris)', 'Visiteurs uniques estimes', 'Visites', 'Pages vues'], ...daily.map(row => [row.day, row.visitors ?? 'Non mesure', row.visits ?? 'Non mesure', row.views ?? 'Non mesure'])];
        const escape = value => `"${String(value).replace(/"/g, '""')}"`;
        res.set('Content-Disposition', `attachment; filename="neover-${req.query.view === 'pages' ? 'pages' : 'visites'}-${period.from}-${period.to}.csv"`);
        return res.type('text/csv; charset=utf-8').send('\uFEFF' + rows.map(row => row.map(escape).join(';')).join('\r\n') + '\r\n');
      }
      res.json({ today, ...period, startedOn: raw.startedOn, daily, pages: consulted });
    } catch (_error) {
      console.error('NEOVER_AUDIENCE_REPORT_UNAVAILABLE');
      res.status(503).json({ ok: false, message: 'Statistiques temporairement indisponibles.' });
    }
  }
  router.get('/api/audience/report', (req, res) => report(req, res));
  router.get('/api/audience/export', (req, res) => report(req, res, true));
  return { router, enabled, close: () => store?.close() };
}

module.exports = { createAnalytics, sqliteStore, supabaseStore, parisDay, shiftDay };
