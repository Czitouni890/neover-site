# Surveillance des dependances

## Controles automatiques

- Dependabot propose chaque lundi les mises a jour npm et GitHub Actions, sous forme de pull requests. Les versions majeures restent separees des groupes mineurs/correctifs.
- Les alertes Dependabot et les propositions de correctifs de securite doivent rester activees dans Settings > Advanced Security / Code security. Elles sont distinctes du calendrier hebdomadaire des mises a jour ordinaires.
- Le workflow `Security and Tests` execute chaque jour a 06:23 UTC un audit de toutes les dependances verrouillees, y compris les outils de developpement. Il tourne aussi sur chaque push vers main et chaque pull request.
- Un avis connu de gravite moderee ou superieure fait echouer l'audit. Les avis faibles restent visibles dans son resultat mais ne bloquent pas seuls.
- Les pull requests passent une revue des nouvelles dependances, les tests serveur et les tests navigateur du formulaire, de l'antispam, des statistiques et des images.
- Les captures sont disponibles sept jours dans les artefacts du workflow. Les tests utilisent uniquement des donnees fictives et aucun secret de production.
- Les actions sont epinglees par SHA. Dependabot surveille aussi leurs mises a jour.
- Aucune fusion automatique ni commande `npm audit fix --force` n'est configuree.

## Avant de fusionner

### Relances et propositions de correction

- L'audit reconnait uniquement une liste limitee d'erreurs reseau temporaires
  (timeout, DNS temporaire, HTTP 429/502/503/504 notamment). Il fait au maximum
  trois passages, avec attentes de 5 puis 10 secondes. Une reponse inconnue,
  une erreur d'authentification ou une vulnerabilite reste bloquante sans relance.
- L'installation npm en CI autorise deux nouvelles tentatives de telechargement
  par requete. Les tests applicatifs et navigateur ne sont jamais relances
  automatiquement pour masquer un echec.
- Si l'audit ou les tests echouent sur main, le workflow ouvre une issue assignee
  a Czitouni890, avec un lien vers les logs. Une issue deja ouverte n'est pas
  dupliquee. La fermer manuellement apres verification du correctif ; elle
  n'est pas mise a jour pour chaque nouvel echec. Les echecs de PR restent
  visibles dans leurs controles, sans droit d'ecriture pour leur code.
- Dependabot peut preparer une PR quand un correctif de vulnerabilite connu
  est disponible et resoluble. Cela ne garantit ni un correctif pour chaque
  alerte, ni la correction automatique d'un bug applicatif. Les reglages
  Dependabot security updates sont distincts du calendrier hebdomadaire.
- Les PR sont testees automatiquement, mais leur fusion reste manuelle et
  soumise aux controles de branche. Aucun agent ne modifie arbitrairement le
  code, ne force les mises a jour majeures ou ne fusionne tout seul.
- Les emails d'alerte dependent des preferences personnelles GitHub. L'issue
  et les logs sont consultables meme si les notifications email sont coupees.

### Validation humaine

1. Ouvrir la proposition Dependabot et lire le changelog, notamment les ruptures de compatibilite.
2. Attendre les controles `Dependency Audit`, `Application Tests` et `Dependency Review` au vert.
3. Examiner les changements de package.json/package-lock.json et les captures des tests. Pour une mise a jour majeure, verifier aussi le site localement.
4. Fusionner manuellement uniquement apres validation. La protection de main doit imposer les trois controles, branche a jour et interdiction des pushes forces.
5. Verifier le deploiement Render, `/health`, la page contact et l'acces aux statistiques. Les tests ne doivent pas envoyer de vrai message client.

## Barriere Render

`render.yaml` declare `autoDeployTrigger: checksPass` et la commande de build `npm ci && npm run security:check`.

Pour un service existant qui n'est pas synchronise par un Blueprint, le fichier seul ne modifie pas ses reglages. Dans Render > neover-site > Settings, appliquer ou confirmer :

- Auto-Deploy : **After CI Checks Pass**.
- Build Command : `npm ci && npm run security:check`.

Le build refuse les vulnerabilites connues moderees ou superieures des dependances de production, puis verifie la syntaxe et les tests serveur. Ne pas desactiver les controles pour faire passer un correctif. Un audit indisponible echoue de facon bloquante ; examiner l'erreur avant une relance.

## Alertes et entretien

- Ouvrir l'onglet Security > Dependabot et l'onglet Actions du depot pour consulter les alertes et audits.
- Configurer les notifications personnelles GitHub pour recevoir les alertes Dependabot et les echecs Actions. Les preferences email du compte ne sont pas gerees par les fichiers du depot.
- Prioriser les failles critiques/elevees et les dependances exposees en production ; verifier les correctifs avant fusion, meme en urgence.
- Un audit sans alerte signifie uniquement qu'aucun avis connu n'a ete trouve a cet instant. Il ne prouve pas l'absence de faille ou de paquet malveillant.

Verification locale :

```powershell
npm ci
npm run security:audit
npm run security:check
npm run test:ui
npm run test:antispam
npm run test:audience
npm run test:images
```

Edge est utilise localement. La CI installe Chromium et definit `PLAYWRIGHT_CHANNEL=chromium`.
