# NEOVER - Site Vitrine

## 📋 Contenu du dossier

```
neover-export/
├── index.html          # Page principale du site
├── assets/             # Fichiers CSS et JavaScript compilés
├── images/             # Images des produits et du site
├── .htaccess           # Configuration Apache
├── robots.txt          # Fichier robots pour SEO
└── sitemap.xml         # Sitemap pour les moteurs de recherche
```

## 🚀 Instructions de déploiement

### Option 1 : Hébergement simple (HTML statique)

1. **Téléchargez les fichiers** sur votre serveur web
2. **Configurez votre serveur** pour servir le fichier `index.html` comme page par défaut
3. **Pointez votre domaine** (neover.com) vers votre serveur

### Option 2 : Serveur Node.js

Si vous avez un serveur Node.js :

```bash
# Installer les dépendances
npm install express

# Créer un fichier server.js
cat > server.js << 'ENDFILE'
const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname)));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur NEOVER running on port ${PORT}`);
});
ENDFILE

# Démarrer le serveur
node server.js
```

### Option 3 : Hébergement cloud (Vercel, Netlify, etc.)

1. Connectez votre dépôt Git
2. Déployez le dossier `neover-export`
3. Configurez votre domaine personnalisé

## 📝 Configuration du domaine neover.com

1. **Achetez le domaine** sur Namecheap, GoDaddy ou Hover
2. **Configurez les DNS** pour pointer vers votre serveur :
   - Type: A Record
   - Name: @ (ou neover.com)
   - Value: Adresse IP de votre serveur

3. **Attendez la propagation DNS** (24-48 heures)

## 📧 Contact

- **Email** : contact.neover@gmail.com
- **Localisation** : Île-de-France

## 🎨 Personnalisations possibles

Le site contient :
- ✅ Logo NEOVER
- ✅ 8 images de produits professionnelles
- ✅ Formulaire de contact fonctionnel
- ✅ Design responsive
- ✅ Navigation sticky

Pour modifier le contenu, éditez le fichier `index.html` directement.

## 📱 Responsive Design

Le site est optimisé pour :
- 📱 Mobiles (320px+)
- 📱 Tablettes (768px+)
- 🖥️ Desktop (1024px+)

---

**Créé avec ❤️ pour NEOVER - Solutions Énergétiques**
