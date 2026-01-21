const express = require('express');
const path = require('path');
const app = express();

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname)));

// Route pour toutes les autres requêtes - servir index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Serveur NEOVER running on http://localhost:${PORT}`);
  console.log(`📧 Email: contact.neover@gmail.com`);
  console.log(`📞 Téléphone: 07 81 14 92 89`);
  console.log(`📍 Localisation: 32 RUE DE PARIS 92100 BOULOGNE-BILLANCOURT`);
});
