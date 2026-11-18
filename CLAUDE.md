# Notes pour les évolutions de l'application

- Langue de l'interface et des échanges : français.
- **Tenir à jour l'onglet Dev à chaque évolution** :
  - `Dev > Caractéristiques` (« Fiches : champs obligatoires et règles de saisie ») : table `dev_fields`, mise à jour par une étape idempotente de `scripts/migrate.mjs` (drapeau `dev_fields_vN`) dès qu'un champ, une règle de saisie ou un message change.
  - `Dev > Caractéristiques` (bloc « Vue d'ensemble des étapes automatisées ») : liste `devFields.automations` dans `src/lib/i18n/fr.ts` (et `en.ts`), à compléter dès qu'une étape automatique est ajoutée ou modifiée.
  - `Dev > Règles` : textes `rules` dans les fichiers i18n.
  - **Schéma de l'application** (bouton du menu, fenêtre « Le parcours d'une livraison ») : `src/components/AppFlow.tsx`, à mettre à jour dès qu'une étape, un blocage, une automatisation ou un module change.
  - **Procédures** (menu Procédures : réception en parties repliables Avant de commencer / Contrôler la livraison (contrôles, refus, pesée, conformité des produits) / Saisie, réclamation, réglementation ; les conditions par catégorie de produits sont dans `Dev > Règles`) : `src/app/(app)/protocoles/Procedures.tsx`, à tenir à jour de la même façon.
- Les étapes de données ponctuelles vont dans `scripts/migrate.mjs`, avant le commentaire « Fruits et légumes : rattacher les produits », protégées par un drapeau `app_settings`.
