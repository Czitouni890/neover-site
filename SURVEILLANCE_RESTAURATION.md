# Surveillance et retour a une version fonctionnelle

## Surveillance active

Le workflow **Site Availability** controle `https://neover.fr/health`, l'accueil et la page contact toutes les 15 minutes (minutes 7, 22, 37 et 52 UTC).
Il verifie le contenu attendu, pas seulement un statut HTTP 200. Un echec provoque deux nouvelles tentatives espacees de dix secondes avant de declarer l'incident.

- Un seul incident GitHub ouvert avec le label `availability`, affecte a `Czitouni890`.
- Pas de nouvelle alerte a chaque passage si cet incident est deja ouvert.
- Au retablissement, commentaire et fermeture automatiques de l'incident.
- Le workflow est aussi marque en echec lors d'une panne ou d'une erreur de notification.
- Aucun message de contact, email client ou identifiant de visiteur n'est lu ou envoye. Les controles sont uniquement des GET publics.
- Aucun retour arriere ni changement DNS automatique : la decision reste humaine.

Acces :

- Historique : https://github.com/Czitouni890/neover-site/actions/workflows/availability.yml
- Incidents : https://github.com/Czitouni890/neover-site/issues?q=is%3Aissue+label%3Aavailability
- Preferences personnelles : https://github.com/settings/notifications

Dans les preferences GitHub, activer les notifications Actions sur le Web et/ou par email, et les notifications des issues affectees. L'adresse de notification est celle du compte GitHub : ce n'est pas automatiquement contact.neover@gmail.com.
Le code ne peut pas garantir les preferences personnelles ni la remise des emails ; confirmer la reception d'une notification dans le compte. Les notifications programmees Actions sont destinees au createur du workflow.

Pour tester le canal sans panne : ouvrir le workflow, choisir **Run workflow** puis cocher `notification_test`. Si le site est disponible, le bot cree une issue clairement nommee **EXERCICE**, l'affecte au proprietaire et la ferme. Ce test utilise le canal GitHub reel, sans email client ni rollback ; verifier sa notification dans GitHub et, selon les preferences personnelles, dans la boite mail.

GitHub Actions est une surveillance de base, sans garantie de passage exact toutes les 15 minutes : retards possibles, quotas et desactivation possible apres 60 jours sans activite dans un depot public. Verifier regulierement la derniere execution. Si les alertes deviennent critiques, ajouter un moniteur externe independant.
Ces controles ne prouvent ni le bon rendu JavaScript ni la livraison Gmail ni la disponibilite du stockage des statistiques. Les tests navigateur existants et des verifications metier restent complementaires.

Controle manuel sans alerte ni email :

```powershell
npm run monitor:check
```

## En cas d'alerte

1. Ouvrir l'incident, son execution et neover.fr depuis une autre connexion si possible.
2. Ouvrir Render > neover-site > Events et Logs. Ne partager que des erreurs techniques depourvues de donnees personnelles.
3. Comparer l'heure de la panne et le dernier deploiement. Consulter aussi https://status.render.com/ si plusieurs services sont touches.
4. Si le dernier deploiement a introduit le probleme, suivre le retour arriere ci-dessous. Une panne du fournisseur n'est pas forcement corrigee en restaurant le code.
5. Ne pas fermer manuellement un incident toujours reel : le moniteur pourrait en recreer un. Une fermeture ne desactive pas la surveillance.

## Retour arriere rapide dans Render

Service : https://dashboard.render.com/web/srv-d5oeq2q4d50c73c9g22g/events

1. Dans l'historique des deploiements, choisir un deploiement reussi avant la regression, pas simplement le precedent.
2. Noter le SHA et verifier sa compatibilite avec les donnees et le prestataire email actuel. Ne pas restaurer une ancienne version FormSubmit pour corriger un probleme sans rapport avec le mail.
3. Cliquer **Rollback**, puis confirmer le deploiement choisi. Render peut reutiliser un artefact recent encore conserve.
4. Attendre **Live**, puis verifier `/health`, les pages publiques et les acces prives. Un test du formulaire doit etre clairement identifie et sa reception confirmee, sans utiliser de donnees client.
5. Le retour arriere lance depuis le Dashboard desactive les deploiements automatiques. Les laisser desactives jusqu'a correction de main.

Attention : un rollback ne restaure pas les bases de donnees, les disques, le domaine ou les DNS. Render peut reutiliser les variables du deploiement choisi, tandis que les groupes d'environnement ont des regles propres : verifier les reglages d'envoi et les secrets sans les publier.
Les redemarrages invalident les sessions administrateur et les anciennes preuves antispam, sans restaurer les donnees d'audience.

## Corriger durablement GitHub

Le rollback Render ne corrige pas main. Depuis la pull request ayant introduit la regression, utiliser **Revert** pour ouvrir une proposition inverse, ou preparer une branche corrective.
Attendre `Dependency Audit`, `Application Tests` et `Dependency Review` au vert avant fusion. Ne jamais forcer main ni contourner ses protections.
Apres fusion de la correction, verifier la version choisie et reactiver **After CI Checks Pass** dans Render, puis confirmer le deploiement et le retablissement de la surveillance.
Si l'ancien artefact Render n'est plus disponible, reconstruire un commit connu comme fonctionnel via **Deploy specific commit**, avec les deploiements automatiques suspendus jusqu'a correction de main.

## Version de reference et exercice sans risque

Reference initiale : `0b532029a4304f05cd3b3a0ce0822d4636059030` (integration Formspree, Express 5). C'est une reference technique, pas une sauvegarde des donnees ou des reglages externes.
Tenir cette reference a jour apres les futures mises en production validees ; ne pas revenir a une version devenue vulnerable ou incompatible.

La remise en route est verifiee dans une copie Git isolee : checkout de ce commit, installation depuis package-lock.json, demarrage local sur un port temporaire et controle HTTP des pages. Aucun rollback reel n'est effectue sur neover.fr pour cet exercice.

Pour reproduire : creer un nouveau worktree detache au SHA de reference, y executer `npm ci --ignore-scripts`, puis demarrer avec `PORT` sur un port libre. Depuis le depot principal, lancer :

```powershell
npm run monitor:check -- --url=http://localhost:3015
```

Ne pas reutiliser un dossier contenant des changements non sauvegardes. Ne pas copier de secrets de production pour ce test, ne pas envoyer de vrai formulaire et ne pas utiliser `git reset --hard`.

Sources :
- https://render.com/docs/rollbacks
- https://render.com/docs/deploys
- https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs
- https://docs.github.com/en/actions/how-tos/troubleshoot-workflows
