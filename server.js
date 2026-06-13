const express = require('express');
const path = require('path');

const app = express();
const SITE_DIR = path.join(__dirname, 'neover-export');

app.disable('x-powered-by');

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use(express.static(SITE_DIR, {
  extensions: ['html'],
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

app.get('*', (_req, res) => {
  res.sendFile(path.join(SITE_DIR, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur NEOVER disponible sur le port ${PORT}`);
});
