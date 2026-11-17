# Notes pour les évolutions de l'application

- Langue de l'interface et des échanges : français.
- **Tenir à jour l'onglet Dev à chaque évolution** :
  - `Dev > Caractéristiques` (« Fiches : champs obligatoires et règles de saisie ») : table `dev_fields`, mise à jour par une étape idempotente de `scripts/migrate.mjs` (drapeau `dev_fields_vN`) dès qu'un champ, une règle de saisie ou un message change.
  - `Dev > Automatisations` : liste `devFields.automations` dans `src/lib/i18n/fr.ts` (et `en.ts`), à compléter dès qu'une étape automatique est ajoutée ou modifiée.
  - `Dev > Règles` : textes `rules` dans les fichiers i18n.
- Les étapes de données ponctuelles vont dans `scripts/migrate.mjs`, avant le commentaire « Fruits et légumes : rattacher les produits », protégées par un drapeau `app_settings`.
