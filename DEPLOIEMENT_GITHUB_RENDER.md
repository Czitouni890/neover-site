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
La connexion passe par `/statistiques/connexion`, avec les memes identifiants qu'avant.
L'ancienne authentification Basic n'est plus acceptee, meme pour les exports.
Le suivi reste desactive si les secrets ou le stockage ne sont pas configures.

### Protection de la connexion

- Session cote serveur, cookie HttpOnly et SameSite Strict, Secure en production HTTPS.
- Identifiant de session et jeton CSRF renouveles a chaque connexion ; aucune sauvegarde du mot de passe dans le navigateur par le site.
- Expiration apres 15 minutes sans requete privee, avec une duree maximale de 8 heures meme en cas d'activite.
- Bouton de deconnexion invalidant la session cote serveur, y compris une copie de son cookie.
- 5 echecs de connexion par IP sur 15 minutes ; les consultations du tableau ne consomment pas cette limite.
- Protection CSRF de la connexion/deconnexion ; rapports, exports et scripts prives inaccessibles sans session.
- Pages privees non mises en cache, non indexables et sans referent transmis aux liens externes.
- Sessions en memoire, plafonnees a 1 000 avec nettoyage periodique. Un redemarrage/deploiement deconnecte les administrateurs, sans effacer les statistiques stockees.
- Pour plusieurs instances, remplacer ce stockage par un registre de sessions partage et des secrets partages.
- Aucun changement des variables existantes n'est requis. Cette etape n'ajoute pas encore de double authentification.

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

## Antispam du formulaire

- ALTCHA est auto-heberge : widget, traduction francaise et worker SHA-256 servis par NEOVER, sans CDN ni compte externe.
- La verification demarre a l'envoi. Aucune preuve n'est envoyee au prestataire email.
- Le serveur exige une preuve signee, valable cinq minutes et utilisable une seule fois.
- Limites distinctes : 5 envois de formulaire et 30 demandes de verification par IP sur 15 minutes.
- Les champs restent remplis si la verification ou le prestataire d'envoi echoue. Une nouvelle tentative genere une nouvelle preuve.
- Le registre antirejeu reste en memoire, limite a 10 000 preuves. Il refuse les nouvelles preuves s'il est plein, sans effacer celles encore valides.
- Les secrets sont generes au demarrage. Un redemarrage invalide les anciennes preuves et leur registre ensemble ; le visiteur peut reessayer.
- Cette configuration vise une seule instance Render. Avant une mise a l'echelle multi-instance, prevoir des secrets partages et un registre antirejeu atomique partage.
- La politique CSP conserve les scripts locaux uniquement, sans `unsafe-eval`, WebAssembly ni workers `blob:`.
- Aucun reglage DNS ou secret supplementaire n'est necessaire. Ce controle complete les limites existantes, sans garantir le blocage de tous les robots.

Tests : `npm test`, `npm run test:ui`, `npm run test:antispam`.
Le dernier teste des preuves reelles navigateur/serveur avec un prestataire email simule, sans email reel.

## Reception des demandes de contact

Sans `CONTACT_WEBHOOK_URL`, le serveur utilise `https://formsubmit.co/ajax/contact.neover@gmail.com`.
Le champ `_url` et les en-tetes `Origin` / `Referer` transmettent explicitement l'origine officielle de la page contact pour FormSubmit. Un envoi serveur n'a pas automatiquement ces informations ; `_url` seul ne suffit pas pour son endpoint AJAX.
Ces en-tetes sont fixes cote serveur, jamais issus du formulaire visiteur, et ne sont ajoutes que pour FormSubmit.
Une reponse HTTP 200 du prestataire ne suffit pas : `success` doit aussi confirmer l'acceptation.
FormSubmit peut demander une activation dans la boite destinataire ; verifier les spams et suivre uniquement un lien attendu du prestataire.
Un refus d'activation remonte une erreur au visiteur, conserve son formulaire et journalise seulement le motif technique `activation_required`, sans coordonnees ni contenu du prestataire.
L'acceptation par le prestataire n'est pas une preuve de remise dans Gmail. Confirmer la reception d'un message technique avant de considerer le parcours valide de bout en bout.
Aucun mot de passe Gmail n'est necessaire. Ne jamais activer de journalisation contenant les coordonnees ou le message du visiteur.

## Surveillance des dependances

Voir `DEPENDANCES_SECURITE.md` : alertes Dependabot, audit quotidien, tests de chaque proposition et validation manuelle avant fusion.
Le Blueprint demande maintenant un deploiement apres succes des controles et un build `npm ci && npm run security:check`.
Si ce service existant n'est pas gere par un Blueprint synchronise, confirmer ces deux reglages dans Render ; modifier le YAML seul ne les applique pas.
