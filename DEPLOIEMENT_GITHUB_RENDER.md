# Deploiement GitHub et Render

## Fichiers importants

- `server.js` : serveur Express utilise par Render.
- `package.json` et `package-lock.json` : dependances et commandes Node.
- `render.yaml` : configuration automatique du service Render.
- `.gitignore` : fichiers locaux exclus de GitHub.

## Publier sur GitHub

Depuis ce dossier :

```powershell
git init
git add .
git commit -m "Publier la nouvelle version multipage de NEOVER"
git branch -M main
git remote add origin URL_DU_DEPOT_GITHUB
git push -u origin main
```

## Deployer sur Render

1. Connecter le depot GitHub dans Render.
2. Choisir **New > Blueprint** pour utiliser automatiquement `render.yaml`.
3. Verifier que le service utilise :
   - Build Command : `npm ci`
   - Start Command : `npm start`
   - Health Check Path : `/health`
4. Lancer le deploiement.

Chaque nouveau push sur la branche connectee declenchera ensuite un deploiement automatique.
