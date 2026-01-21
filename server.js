const express = require('express');
const path = require('path');

const app = express();
const SITE_DIR = path.join(__dirname, 'neover-export');

app.use(express.static(SITE_DIR));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Site NEOVER en ligne sur http://localhost:${PORT}`);
});
