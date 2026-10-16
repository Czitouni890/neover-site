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

## Statistiques privees

Le tableau est accessible a `/statistiques`. Identifiant : `admin`.
Le mot de passe vient de `ANALYTICS_ADMIN_PASSWORD` (16 caracteres minimum).
Le suivi reste desactive si les secrets ou le stockage ne sont pas configures.

### Stockage durable sur Render gratuit

Le systeme de fichiers de Render gratuit est ephemere. Ne pas y stocker la base locale.
L'option cloud implementee utilise une base Supabase via son API, sans bibliotheque supplementaire.

1. Creer un projet Supabase dans une region UE et verifier le plan, ses limites et la retention des sauvegardes.
2. Executer `supabase-audience.sql` dans son editeur SQL. Le script active RLS et interdit l'acces aux roles publics.
3. Configurer dans Render > Environment :
   - `SUPABASE_URL` : URL du projet, par exemple `https://identifiant.supabase.co`.
   - `SUPABASE_SERVICE_ROLE_KEY` : cle privee serveur (secret key ou ancienne service_role), jamais la cle publique anon.
   - `ANALYTICS_ADMIN_PASSWORD` : mot de passe unique de 16 caracteres minimum.
   - `ANALYTICS_HASH_SECRET` : secret aleatoire unique de 32 caracteres minimum.
   - `SITE_URL` : `https://neover.fr`.
4. Redeployer. `/api/audience/config` doit retourner `{"enabled":true}` apres verification du stockage.
5. Ouvrir `/statistiques`, puis verifier une visite apres acceptation du suivi.

Ne jamais transmettre les cles dans le chat ni les ajouter au depot. Les saisir directement dans les variables Render.
Les nouvelles valeurs de secrets peuvent etre generees avec un gestionnaire de mots de passe.
La creation du compte, de la base et les variables Render necessitent un acces aux comptes externes.

### Apercu local

Un fichier `.env.audience.local` ignore par Git contient les identifiants de l'apercu et `ANALYTICS_DB_PATH`.
Lancer `node --env-file=.env.audience.local server.js` dans ce dossier avec Node 22.13 ou plus recent.
La base est hors du repertoire public et persiste aux redemarrages locaux.
Les donnees de test ne sont pas transferees vers le stockage de production.

### Mesures et export

- Visiteurs uniques estimes : navigateurs distincts par jour, pour les personnes acceptant le suivi.
- Visites : nouvelles sessions apres 30 minutes d'inactivite, renouvelees chaque jour.
- Pages vues : chargements des cinq pages publiques; un rechargement compte une nouvelle vue.
- Dates : fuseau Europe/Paris, y compris les changements d'heure.
- Aucun nom, email, adresse IP, agent utilisateur ou message du formulaire dans cette base.
- Choix du suivi conserve 6 mois, modifiable en bas de page. Identifiants aleatoires renouveles chaque jour.
- Evenements pseudonymises conserves 90 jours. Le nettoyage intervient lors de la prochaine visite enregistree.
- Refus de suivi, bloqueurs, suppressions du stockage et autres appareils limitent la precision des estimations.
- Bouton Exporter Excel : fichier CSV UTF-8, separateurs point-virgule, ouvrable avec Excel. Ce n'est pas un fichier XLSX.
- Export disponible pour le tableau quotidien ou les pages consultees selon l'onglet selectionne.
- Aucun chiffre retroactif avant activation du suivi.

Tests : `npm test`, `npm run test:ui` et `node test/audience-ui.cjs` (Edge installe pour les tests d'interface).
