# Confirmation des demandes

Le serveur transmet d'abord la demande a Formspree. Apres acceptation, il
demande a Resend un accuse de reception pour l'adresse saisie. Le contenu
du formulaire n'est pas recopie dans cet email.

## Configuration Render

- Ajouter `RESEND_API_KEY` dans Environment, jamais dans Git ou le navigateur.
- Verifier `notifications.neover.fr` dans Resend.
- Expediteur fixe : `NEOVER <contact@notifications.neover.fr>`.
- Les reponses sont dirigees vers `contact.neover@gmail.com`.
- Sans cle, seule la transmission Formspree fonctionne.

## Verification apres deploiement

Envoyer une demande depuis la page contact avec une adresse que vous controlez.
Verifier la demande dans Formspree et la boite NEOVER, puis la confirmation
dans la boite du demandeur (et les spams). Verifier les evenements de livraison
dans Resend : une acceptation API ne prouve pas la reception dans la boite.

Les logs `NEOVER_CONFIRMATION_ACCEPTED`, `NEOVER_CONFIRMATION_FAILED` et
`NEOVER_CONFIRMATION_SKIPPED` ne contiennent ni coordonnees ni cle ni message.
Une panne ou un quota Resend epuise ne transforme pas une demande acceptee
en erreur : pas de nouvel envoi de la demande et pas de relance automatique.
Les confirmations ne sont pas mises en file durable : surveiller les echecs.
Le plafond par IP et ALTCHA restent actifs, mais ne garantissent pas l'absence
d'abus ni l'identite du proprietaire de l'adresse saisie.

API utilisee : https://resend.com/docs/api-reference/emails/send-email
