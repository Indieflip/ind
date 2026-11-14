# Réception marchandises

Application web (mobile + ordinateur) de contrôle des livraisons : vérification du BL, traçabilité HACCP, suivi des prix par rapport au mercurial, anomalies et reporting.

- **Téléphone** : réception en 4 étapes (livraison → photo du BL → contrôle produit par produit → réserves + signature). Installable sur l'écran d'accueil, fonctionne hors connexion (la réception est gardée sur le téléphone et envoyée au retour du réseau).
- **Ordinateur** : historique, suivi des prix, fournisseurs / mercurial, anomalies, reporting, réglages.
- **Profils** : Administrateur, Économe, Comptable, Invité économe. Droits par défaut dans `src/lib/permissions.ts`, modifiables dans Réglages > Droits utilisateurs.
- **Langues** : français / anglais (bouton FR/EN).

## Stack

Next.js 16 (App Router) · PostgreSQL (Neon) via Drizzle ORM · Tailwind CSS 4 · Vercel (hébergement, Blob pour les photos) · API Claude pour la lecture des BL.

## Variables d'environnement (Vercel)

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DATABASE_URL` | oui | Ajoutée automatiquement par l'intégration Neon ↔ Vercel |
| `BLOB_READ_WRITE_TOKEN` | conseillé | Ajoutée en créant un store Vercel Blob relié au projet. Sans elle, les photos sont stockées en base |
| `ANTHROPIC_API_KEY` | non | Active la lecture automatique des BL. Sans elle, la saisie est manuelle |
| `AUTH_SECRET` | non | Secret des sessions ; sinon généré et stocké en base au premier lancement |
| `RESEND_API_KEY` | non | Envoi automatique des sauvegardes par e-mail (service Resend) |
| `CRON_SECRET` | non | Protège la tâche planifiée de sauvegarde (`/api/cron/backup`, chaque jour à 4 h UTC) |
| `BACKUP_FROM_EMAIL` | non | Expéditeur des e-mails de sauvegarde (domaine vérifié chez Resend) |

## Déploiement

Chaque push sur `main` est déployé par Vercel. Le build (`npm run build`) applique d'abord les migrations de la base (`scripts/migrate.mjs`) puis compile l'application.

Au premier lancement, ouvrir l'application : la page **Première configuration** crée le compte administrateur.

## Développement local

```bash
npm install
echo 'DATABASE_URL=postgres://user:pass@localhost:5432/reception' > .env.local
npm run db:migrate
npm run dev
```

Après une modification de `src/db/schema.ts` : `npm run db:generate` (crée la migration SQL dans `drizzle/`).

## Import du mercurial

Fournisseurs → **Importer une liste** : une ligne par produit au format
`Fournisseur ; Produit ; Unité ; Catégorie ; Prix` (collage ou fichier CSV). Les produits existants sont mis à jour.
