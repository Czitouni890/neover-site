const express = require('express');
const path = require('path');
const { randomUUID } = require('node:crypto');
const { rateLimit } = require('express-rate-limit');

const app = express();
const SITE_DIR = path.join(__dirname, 'neover-export');

app.disable('x-powered-by');
// Render forwards public requests through its reverse proxy.
app.set('trust proxy', process.env.RENDER === 'true' ? 1 : false);
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, code: 'RATE_LIMITED' }
});
app.use('/api/contact', contactLimiter);
app.use(express.json({ limit: '25kb' }));
app.use(express.urlencoded({ extended: false, limit: '25kb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

function normalizeField(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getContactWebhookUrl() {
  return process.env.CONTACT_WEBHOOK_URL || 'https://formsubmit.co/ajax/contact.neover@gmail.com';
}

function formatWebhookPayload(lead) {
  return {
    _subject: `Nouvelle demande NEOVER - ${lead.project}`,
    _template: 'table',
    _captcha: 'false',
    _replyto: lead.email,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    project: lead.project,
    message: lead.message,
    page: lead.page,
    createdAt: lead.createdAt
  };
}
app.post('/api/contact', async (req, res) => {
  const body = req.body || {};

  if (body.website) {
    return res.status(200).json({ ok: true });
  }

  const lead = {
    name: normalizeField(body.name, 80),
    phone: normalizeField(body.phone, 30),
    email: normalizeField(body.email, 120),
    project: normalizeField(body.project, 80),
    message: normalizeField(body.message, 1200),
    consent: body.consent === true || body.consent === 'on' || body.consent === 'true',
    page: normalizeField(body.page, 120),
    createdAt: new Date().toISOString()
  };

  const errors = {};
  if (lead.name.length < 2) errors.name = 'Nom requis';
  if (!/^[-+().\s\d]{8,30}$/.test(lead.phone)) errors.phone = 'Telephone invalide';
  if (!isValidEmail(lead.email)) errors.email = 'Email invalide';
  if (!lead.project) errors.project = 'Type de projet requis';
  if (lead.message.length < 10) errors.message = 'Message trop court';
  if (!lead.consent) errors.consent = 'Consentement requis';

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ ok: false, errors });
  }

  const requestId = randomUUID();

  try {
    const response = await fetch(getContactWebhookUrl(), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify(formatWebhookPayload(lead)),
      signal: AbortSignal.timeout(5000)
    });

    const result = await response.json().catch(() => null);
    const isFormSubmit = new URL(getContactWebhookUrl()).hostname === 'formsubmit.co';
    if (!response.ok || result?.success === false || result?.success === 'false' ||
        result?.ok === false || (isFormSubmit && result?.success !== true && result?.success !== 'true')) {
      console.error('NEOVER_CONTACT_FAILED', JSON.stringify({ requestId, status: response.status }));
      return res.status(502).json({ ok: false, code: 'DELIVERY_FAILED' });
    }
  } catch (_error) {
    console.error('NEOVER_CONTACT_FAILED', JSON.stringify({ requestId, reason: 'unavailable' }));
    return res.status(502).json({ ok: false, code: 'DELIVERY_FAILED' });
  }

  console.info('NEOVER_CONTACT_SENT', JSON.stringify({ requestId }));
  res.status(200).json({ ok: true });
});

app.use(express.static(SITE_DIR, {
  extensions: ['html'],
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

app.get('*', (_req, res) => {
  res.sendFile(path.join(SITE_DIR, 'index.html'));
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur NEOVER disponible sur le port ${PORT}`);
  });
}

module.exports = app;
