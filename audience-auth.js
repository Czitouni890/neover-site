const express = require('express');
const path = require('node:path');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const { rateLimit } = require('express-rate-limit');

const IDLE_MS = 15 * 60000;
const MAX_MS = 8 * 60 * 60000;
const digest = value => createHash('sha256').update(value).digest();
const equal = (a, b) => timingSafeEqual(digest(a), digest(b));

function createAdminAccess({ enabled, password, production, now = Date.now }) {
  const router = express.Router();
  const store = new MemoryStore({ checkPeriod: 60000, max: 1000, ttl: IDLE_MS });
  const name = production ? '__Host-neover_admin' : 'neover_admin';
  const cookie = { httpOnly: true, secure: production, sameSite: 'strict', path: '/' };
  const sessionMiddleware = session({
    name, secret: randomBytes(48).toString('hex'), store,
    resave: false, saveUninitialized: false, rolling: true,
    cookie: { ...cookie, maxAge: IDLE_MS }
  });
  const paths = ['/statistiques', '/statistiques-assets', '/admin-assets',
    '/api/audience/session', '/api/audience/login', '/api/audience/logout',
    '/api/audience/report', '/api/audience/export'];
  router.use(paths, (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.set('Referrer-Policy', 'no-referrer');
    if (!enabled) return res.status(503).json({ ok: false, code: 'NOT_CONFIGURED' });
    if (production && !req.secure) return res.status(403).end();
    sessionMiddleware(req, res, next);
  });
  function authenticated(req) {
    return req.session?.admin === true && now() - req.session.startedAt < MAX_MS &&
      now() - req.session.lastSeen < IDLE_MS;
  }
  function token(req) {
    if (!req.session.csrf) req.session.csrf = randomBytes(32).toString('hex');
    return req.session.csrf;
  }
  function csrf(req, res, next) {
    const supplied = req.get('x-csrf-token') || '';
    if (req.get('origin') !== `${req.protocol}://${req.get('host')}` ||
        req.get('sec-fetch-site') === 'cross-site' || !req.session.csrf ||
        supplied.length !== 64 || !equal(supplied, req.session.csrf)) {
      return res.status(403).json({ ok: false, code: 'CSRF_REJECTED' });
    }
    next();
  }
  router.get('/statistiques/connexion', (req, res) => {
    if (authenticated(req)) return res.redirect('/statistiques');
    res.sendFile(path.join(__dirname, 'admin', 'login.html'));
  });
  router.get('/statistiques-assets/:file', (req, res) => {
    const files = { 'login.js': 'login.js', 'login.css': 'admin.css' };
    if (!Object.hasOwn(files, req.params.file)) return res.status(404).end();
    res.sendFile(path.join(__dirname, 'admin', files[req.params.file]));
  });
  const bootstrapLimiter = rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false });
  router.get('/api/audience/session', bootstrapLimiter, (req, res) => {
    res.json({ authenticated: authenticated(req), csrf: token(req) });
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60000, limit: 5, skipSuccessfulRequests: true,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { ok: false, code: 'LOGIN_LIMITED' }
  });
  router.post('/api/audience/login', csrf, loginLimiter, (req, res, next) => {
    const username = typeof req.body?.username === 'string' ? req.body.username : '';
    const supplied = typeof req.body?.password === 'string' ? req.body.password : '';
    const validUsername = equal(username, 'admin');
    const validPassword = equal(supplied, password);
    if (username.length > 128 || supplied.length > 512 || !validUsername || !validPassword) {
      return res.status(401).json({ ok: false, code: 'INVALID_CREDENTIALS' });
    }
    // A successful login receives a new identifier and CSRF token (no session fixation).
    req.session.regenerate(error => {
      if (error) return next(error);
      req.session.admin = true;
      req.session.startedAt = now();
      req.session.lastSeen = now();
      const csrfToken = token(req);
      req.session.save(error => {
        if (error) return next(error);
        res.json({ ok: true, csrf: csrfToken });
      });
    });
  });
  router.post('/api/audience/logout', csrf, (req, res, next) => {
    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie(name, cookie);
      res.json({ ok: true });
    });
  });
  function protect(req, res, next) {
    if (!authenticated(req)) {
      req.session.destroy(error => {
        if (error) return next(error);
        res.clearCookie(name, cookie);
        const pathname = req.originalUrl.split('?')[0];
        if (pathname === '/statistiques' || pathname === '/statistiques/') return res.redirect('/statistiques/connexion');
        return res.status(401).json({ ok: false, code: 'LOGIN_REQUIRED' });
      });
      return;
    }
    req.session.lastSeen = now();
    next();
  }
  return { router, protect, close: () => { store.stopInterval(); store.clear(); } };
}

module.exports = { createAdminAccess };
