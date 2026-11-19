/** Document « Projet » (Dev > Développement commercial), modifiable dans l'application */
export const PROJECT_TEMPLATE = `
<h1>Projet : application de réception des marchandises</h1>
<div data-callout="" data-variant="info"><p><strong>En une phrase</strong> : l'application contrôle chaque livraison sur téléphone, du camion jusqu'à l'avoir encaissé, et produit seule la fiche de réception exigée en cas de contrôle sanitaire. Les chiffres clés et le calcul coût / gains au-dessus sont calculés en direct.</p></div>

<h2>1. Le problème</h2>
<table><tbody>
<tr><th><p>Constat</p></th><th><p>Conséquence</p></th></tr>
<tr><td><p>Réception sur papier ou Excel</p></td><td><p>Températures, DLC et lots oubliés ; fiche incomplète le jour d'un contrôle</p></td></tr>
<tr><td><p>Écarts de quantité, de poids et de prix vus trop tard</p></td><td><p>De l'argent perdu chaque semaine, jamais réclamé</p></td></tr>
<tr><td><p>Réclamations dispersées (mails, WhatsApp, appels)</p></td><td><p>Relances oubliées, avoirs jamais vérifiés sur facture</p></td></tr>
<tr><td><p>Mercurial pas à jour</p></td><td><p>Les hausses de prix passent inaperçues</p></td></tr>
</tbody></table>

<h2>2. La solution</h2>
<table><tbody>
<tr><th><p>Module</p></th><th><p>Ce que fait l'application</p></th></tr>
<tr><td><p><strong>Réception guidée</strong></p></td><td><p>Photo du BL lue automatiquement, signatures, températures, DLC, décision Acceptée / Refus proposée</p></td></tr>
<tr><td><p><strong>Anomalies et réclamations</strong></p></td><td><p>Créées automatiquement ; relances au délai propre à chaque fournisseur</p></td></tr>
<tr><td><p><strong>Économies justifiées</strong></p></td><td><p>Chaque euro récupéré renvoie à sa réclamation et à son avoir</p></td></tr>
<tr><td><p><strong>Fiche de réception</strong></p></td><td><p>Exportée chaque soir, figée, archivée 5 ans, prête pour la DDPP</p></td></tr>
<tr><td><p><strong>Mercurial et prix</strong></p></td><td><p>Mis à jour à chaque livraison ; hausses signalées</p></td></tr>
</tbody></table>

<h2>3. Ce que ça rapporte</h2>
<ul>
<li><p><strong>Argent récupéré</strong> : avoirs et régularisations obtenus, mesurés chaque mois.</p></li>
<li><p><strong>Temps gagné</strong> : saisie, relances, fiche de réception, mise à jour du mercurial.</p></li>
<li><p><strong>Conformité</strong> : preuves datées (photos, signatures, relevés), fiche figée.</p></li>
<li><p><strong>Pilotage</strong> : variations de prix, fournisseurs à problèmes, taux de récupération.</p></li>
</ul>
<div data-callout="" data-variant="info"><p><strong>Gains</strong> = économies obtenues + temps gagné × coût horaire. <strong>Résultat</strong> = gains − coût de l'application (calcul ci-dessus).</p></div>

<h2>4. Le marché</h2>
<div data-callout="" data-variant="warning"><p>Prix et fonctions des concurrents relevés dans le tableau « Appli », à revérifier avant toute présentation.</p></div>
<table><tbody>
<tr><th><p>Type de solution</p></th><th><p>Prix</p></th><th><p>Ce qui manque</p></th></tr>
<tr><td><p>Papier / Excel</p></td><td><p>Gratuit</p></td><td><p>Aucun rappel, preuves fragiles, rien sur les réclamations</p></td></tr>
<tr><td><p>Applis HACCP</p></td><td><p>0 à 55 € / mois</p></td><td><p>Ni quantités, ni prix, ni avoirs</p></td></tr>
<tr><td><p>Gestion de restaurant / achats</p></td><td><p>49 à 180 € / mois</p></td><td><p>HACCP en option payante, contrôle à réception limité</p></td></tr>
<tr><td><p>Plateformes de commande</p></td><td><p>Variable</p></td><td><p>Pas de contrôle de conformité ni de suivi des écarts</p></td></tr>
</tbody></table>
<p><strong>Notre position</strong> : la seule chaîne complète, sanitaire et économique : réception → anomalie → réclamation → relance → avoir → économie justifiée.</p>

<h2>5. L'offre envisagée</h2>
<table><tbody>
<tr><th><p>Offre</p></th><th><p>Contenu</p></th><th><p>Prix HT / mois / site</p></th></tr>
<tr><td><p>Réception</p></td><td><p>Contrôle sanitaire et économique, réclamations, économies, fiche DDPP</p></td><td><p>59 à 69 €</p></td></tr>
<tr><td><p>Réception + Commandes</p></td><td><p>+ commandes reliées à la réception</p></td><td><p>89 à 99 €</p></td></tr>
<tr><td><p>Groupe</p></td><td><p>Plusieurs sites, tableau de bord commun</p></td><td><p>Dégressif ou sur devis</p></td></tr>
<tr><td><p>Mise en place</p></td><td><p>Import mercurial, fournisseurs, procédures, seuils</p></td><td><p>150 à 300 €, une fois</p></td></tr>
</tbody></table>
<p>Lecture des BL : 150 à 200 BL / mois inclus, au-delà facturés.</p>

<h2>6. Ce qui nous démarque</h2>
<ul>
<li><p>Chaîne complète jusqu'à l'avoir vérifié et l'économie justifiée.</p></li>
<li><p>HACCP inclus, sans module en supplément ni matériel à acheter.</p></li>
<li><p>Fiche DDPP exportée chaque soir, figée, archivée 5 ans.</p></li>
<li><p>Décision proposée automatiquement (seuils réglementaires et marges).</p></li>
<li><p>Cas du terrain : pesée avec tares, prix bloqués, fruits et légumes au prix du mois.</p></li>
<li><p>Conçue dans un vrai restaurant, par quelqu'un du métier.</p></li>
</ul>
<p><strong>Pistes</strong> : commandes reliées à la réception, rapport mensuel au gérant, lecture des factures électroniques, comparaison anonymisée des prix entre clients (cadre juridique à vérifier).</p>

<h2>7. Coûts de fonctionnement</h2>
<table><tbody>
<tr><th><p>Poste</p></th><th><p>Détail</p></th><th><p>Coût mensuel</p></th></tr>
<tr><td><p>Hébergement</p></td><td><p>Vercel</p></td><td><p>à compléter</p></td></tr>
<tr><td><p>Base de données</p></td><td><p>Neon</p></td><td><p>à compléter</p></td></tr>
<tr><td><p>Lecture des BL</p></td><td><p>Claude, environ 5 à 12 centimes par BL</p></td><td><p>environ 15 à 35 € pour 300 BL</p></td></tr>
<tr><td><p>Envoi des mails</p></td><td><p>Resend (sauvegardes)</p></td><td><p>à compléter</p></td></tr>
<tr><td><p>Maintenance et formation</p></td><td><p>Heures passées par mois</p></td><td><p>à compléter</p></td></tr>
</tbody></table>

<h2>8. Réponses aux objections</h2>
<table><tbody>
<tr><th><p>Objection</p></th><th><p>Réponse</p></th></tr>
<tr><td><p>« Ça existe déjà. »</p></td><td><p>Les outils couvrent l'HACCP ou les achats ; aucun ne relie la réception aux avoirs.</p></td></tr>
<tr><td><p>« Ça coûte cher. »</p></td><td><p>Économies et temps gagné sont mesurés chaque mois (calcul ci-dessus).</p></td></tr>
<tr><td><p>« Les équipes ne l'utiliseront pas. »</p></td><td><p>Téléphone, étapes guidées, brouillon, décision proposée.</p></td></tr>
<tr><td><p>« Et les données ? »</p></td><td><p>Sauvegardes, exports PDF / Excel, fiches figées avec historique.</p></td></tr>
<tr><td><p>« Et un contrôle sanitaire ? »</p></td><td><p>Fiche du jour, photos, signatures, températures, lots et DLC exportables tout de suite.</p></td></tr>
</tbody></table>

<h2>9. Feuille de route</h2>
<h3>Prochaines étapes</h3>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"><p>Activer la lecture des BL et mesurer le coût réel pendant 3 mois</p></li>
<li data-type="taskItem" data-checked="false"><p>Lecture automatique des étiquettes (lot, DLC)</p></li>
<li data-type="taskItem" data-checked="false"><p>Photo d'étiquette obligatoire pour les produits à DLC</p></li>
</ul>
<h3>Pour une version commercialisable</h3>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"><p>Plusieurs clients et établissements (comptes séparés) : prérequis n° 1</p></li>
<li data-type="taskItem" data-checked="false"><p>Commandes reliées à la réception : commandé / livré / facturé</p></li>
<li data-type="taskItem" data-checked="false"><p>Abonnement, paiement en ligne, conditions générales, RGPD, données en Europe</p></li>
<li data-type="taskItem" data-checked="false"><p>Rapprochement BL / facture (factures électroniques)</p></li>
</ul>
<p>Hors périmètre de la version de base : stocks, inventaires, fiches techniques, caisse.</p>

<h2>10. Risques et parades</h2>
<table><tbody>
<tr><th><p>Risque</p></th><th><p>Parade</p></th></tr>
<tr><td><p>Adoption par les équipes</p></td><td><p>Formation courte, un référent par service, saisie guidée</p></td></tr>
<tr><td><p>Dépendance à une seule personne</p></td><td><p>Documentation (Dev, procédures), code sauvegardé sur GitHub</p></td></tr>
<tr><td><p>Pas encore de références clients</p></td><td><p>Bilan chiffré du restaurant pilote à 6 mois</p></td></tr>
<tr><td><p>Coûts qui augmentent</p></td><td><p>Suivi mensuel dans ce document</p></td></tr>
</tbody></table>

<h2>11. Proposition au restaurant et propriété</h2>
<div data-callout="" data-variant="danger"><p>Note personnelle, pas un avis juridique : à faire valider par un avocat en propriété intellectuelle et par l'expert-comptable.</p></div>
<table><tbody>
<tr><th><p>Élément</p></th><th><p>Proposition</p></th></tr>
<tr><td><p>Contrat</p></td><td><p>CDD de 6 mois, « Contrôleur de coûts » (application + recherche d'économies)</p></td></tr>
<tr><td><p>Fixe</p></td><td><p>31 000 € brut par an (environ 2 000 € net par mois)</p></td></tr>
<tr><td><p>Prime</p></td><td><p>10 % des économies justifiées</p></td></tr>
<tr><td><p>Application</p></td><td><p>Utilisation gratuite pendant le CDD ; je reste propriétaire du code</p></td></tr>
<tr><td><p>Bilan</p></td><td><p>Point à 6 mois, chiffres de l'application à l'appui</p></td></tr>
</tbody></table>
<h3>Coût pour le restaurant sur 6 mois (estimation)</h3>
<ul>
<li><p>Fixe : environ 15 500 € brut, soit environ 21 000 € chargé.</p></li>
<li><p>Indemnité de fin de CDD : 10 % du brut (environ 1 550 € et plus selon la prime), si pas de CDI ensuite.</p></li>
<li><p>Prime : payée par les économies elles-mêmes.</p></li>
<li><p>Argument : sur environ 3 à 3,5 M€ d'achats par an (hypothèse), récupérer 1,5 % sur 6 mois (environ 25 k€) couvre le poste.</p></li>
</ul>
<h3>À écrire noir sur blanc</h3>
<ul>
<li><p><strong>Motif du CDD</strong> : à faire vérifier par l'expert-comptable ; sinon CDI avec période d'essai.</p></li>
<li><p><strong>Prime</strong> : « économies justifiées » = avoirs, régularisations et livraisons différées obtenus (Reporting › Économies, hors attente) ; préciser le sort des baisses de prix négociées et la fréquence de versement.</p></li>
<li><p><strong>Application</strong> : licence gratuite pendant le CDD, sans cession ; l'application et ses améliorations restent à moi (sinon elles reviennent à l'employeur, art. L113-9 du Code de la propriété intellectuelle).</p></li>
<li><p><strong>Données</strong> : celles du restaurant restent à lui ; export complet remis en fin de collaboration.</p></li>
</ul>
<h3>Le point à 6 mois</h3>
<ul>
<li><p>Bilan : économies obtenues et en attente, temps gagné, fiches DDPP.</p></li>
<li><p>Suite : CDI avec fixe revu selon les résultats, prime maintenue ; licence payante par nouvel établissement.</p></li>
<li><p>En cas d'arrêt : l'application reste à moi, les données sont rendues au restaurant.</p></li>
</ul>
<h3>Avant de négocier</h3>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"><p>Garder des preuves datées : historique GitHub, dépôt APP ou enveloppe Soleau (INPI)</p></li>
<li data-type="taskItem" data-checked="false"><p>Garder à mon nom les comptes GitHub, Vercel, Neon et Anthropic</p></li>
<li data-type="taskItem" data-checked="false"><p>Faire vérifier le motif du CDD et le coût exact par l'expert-comptable</p></li>
<li data-type="taskItem" data-checked="false"><p>Faire relire le contrat par un avocat en propriété intellectuelle</p></li>
</ul>
`.trim();
