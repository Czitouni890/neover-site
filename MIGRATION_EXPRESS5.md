# Migration preparee vers Express 5

Cette branche prepare Express 5.3.0 sans modifier la branche main ni le site en production.

## Changements

- Mise a jour d'Express et du verrou npm.
- Remplacement de la route de repli `*` par `/{*path}` : Express 5 exige un joker nomme. Les accolades permettent aussi de couvrir la racine.
- Conservation du comportement existant : pages HTML, URL sans extension et anciennes URL renvoyant l'accueil.
- Aucun changement du design, des DNS, des secrets, de la collecte d'audience ou du prestataire email.
- Ajout de tests HTTP : pages, routes imbriquees, types MIME des modules/CSS/photos, HEAD, endpoint health et requetes non JSON.

Reference officielle : https://expressjs.com/en/guide/migrating-5/

## Validation

```powershell
npm ci
npm run security:audit
npm run security:check
npm run test:ui
npm run test:antispam
npm run test:audience
npm run test:images
```

Les tests serveur et navigateur couvrent aussi les sessions des statistiques, la deconnexion, les exports, l'antispam, les erreurs d'envoi et les limites de tentatives. Aucun email reel n'est envoye par ces tests.
La CI utilise Node 22 et doit valider la pull request avant toute fusion.

## Mise en production ulterieure

1. Examiner la pull request de migration complete plutot que fusionner la simple mise a jour Dependabot d'Express.
2. Attendre les trois controles obligatoires au vert et valider l'apercu local.
3. Fusionner manuellement seulement quand la migration est souhaitee. Cette fusion peut declencher Render.
4. Verifier `/health`, les pages, le formulaire et les acces prives apres deploiement.
5. En cas de regression, preparer une pull request annulant l'ensemble du commit de migration, verrou npm compris, et repasser les controles. Ne pas forcer main ni desactiver ses protections.
