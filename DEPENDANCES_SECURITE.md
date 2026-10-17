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
