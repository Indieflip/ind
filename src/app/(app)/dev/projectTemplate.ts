/** Document « Projet » proposé au départ (modifiable dans Dev > Projet) */
export const PROJECT_TEMPLATE = `
<h1>Projet : application de réception des marchandises</h1>
<div data-callout="" data-variant="info"><p>Document de travail pour organiser le projet et le défendre (concurrence, coût). Tout est modifiable : tapez « / » pour ajouter un titre, une liste, un tableau, un encadré… Les chiffres clés au-dessus sont calculés en direct à partir des données de l'application.</p></div>

<h2>1. Le problème de départ</h2>
<ul>
<li><p>Réception sur papier ou Excel : températures, DLC et lots oubliés, fiche HACCP incomplète le jour d'un contrôle sanitaire.</p></li>
<li><p>Écarts de quantité, de poids et de prix vus trop tard ou jamais réclamés : de l'argent perdu chaque semaine.</p></li>
<li><p>Réclamations et avoirs dispersés (mails, WhatsApp, appels) : relances oubliées, avoirs jamais vérifiés sur facture.</p></li>
<li><p>Mercurial pas à jour : les hausses de prix passent inaperçues.</p></li>
</ul>

<h2>2. La solution</h2>
<ul>
<li><p><strong>Réception guidée sur téléphone</strong> : photo du BL lue automatiquement, signatures, températures, DLC, conformité produit proposée automatiquement.</p></li>
<li><p><strong>Anomalies et réclamations</strong> créées automatiquement, avec relances au bon délai pour chaque fournisseur.</p></li>
<li><p><strong>Économies justifiées</strong> : chaque euro récupéré renvoie à sa réclamation et à son avoir.</p></li>
<li><p><strong>Fiche de réception de marchandises</strong> générée chaque jour, validée par le responsable, non modifiable, archivée 5 ans.</p></li>
<li><p><strong>Mercurial et suivi des prix</strong> mis à jour à chaque livraison.</p></li>
</ul>
<p>Détail complet : Dev &gt; Automatisations.</p>

<h2>3. Bénéfices mesurables</h2>
<ul>
<li><p>Argent récupéré : économies obtenues (chiffre clé ci-dessus).</p></li>
<li><p>Temps gagné : saisie, relances, fiche HACCP, mise à jour du mercurial.</p></li>
<li><p>Conformité : fiche quotidienne validée, preuves (photos, signatures), historique des modifications.</p></li>
<li><p>Pilotage : variations de prix, fournisseurs à problèmes, taux de récupération.</p></li>
</ul>
<p>Formule de rentabilité : <strong>gains = économies obtenues + temps gagné × coût horaire</strong> ; <strong>résultat = gains − coût de l'application</strong> (calcul ci-dessus).</p>

<h2>4. Concurrence</h2>
<div data-callout="" data-variant="warning"><p>Exemples cités à titre indicatif : vérifier les fonctionnalités et les tarifs actuels sur leur site avant toute présentation.</p></div>
<table><tbody>
<tr><th><p>Type de solution</p></th><th><p>Exemples</p></th><th><p>Points forts</p></th><th><p>Limites par rapport à notre application</p></th></tr>
<tr><td><p>Papier / Excel</p></td><td><p>Classeur HACCP, tableur</p></td><td><p>Gratuit, connu de tous</p></td><td><p>Aucun rappel, ressaisie, preuves fragiles, rien sur les réclamations et les économies</p></td></tr>
<tr><td><p>Logiciels HACCP / plan de maîtrise sanitaire</p></td><td><p>à compléter (ex. solutions de traçabilité et de relevés de températures)</p></td><td><p>Traçabilité, températures, étiquettes</p></td><td><p>Réception souvent sommaire ; pas de suivi des réclamations, avoirs et économies ; abonnement par établissement</p></td></tr>
<tr><td><p>Gestion des achats / food cost</p></td><td><p>à compléter</p></td><td><p>Commandes, stocks, coût matière</p></td><td><p>Contrôle sanitaire à réception limité ; mise en place plus lourde ; coût plus élevé</p></td></tr>
<tr><td><p>Plateformes de commande fournisseurs</p></td><td><p>à compléter</p></td><td><p>Commandes simplifiées</p></td><td><p>Pas de contrôle de conformité ni de suivi des écarts</p></td></tr>
</tbody></table>
<p><strong>Notre différence</strong> : une seule chaîne, de la réception à l'avoir encaissé (réception → anomalie → réclamation → relance → avoir → économie justifiée), avec la fiche HACCP produite automatiquement, et une application taillée sur nos process (fournisseurs, protocoles, mercurial).</p>

<h2>5. Coût</h2>
<table><tbody>
<tr><th><p>Poste</p></th><th><p>Détail</p></th><th><p>Coût mensuel estimé</p></th></tr>
<tr><td><p>Hébergement de l'application</p></td><td><p>Vercel</p></td><td><p>à compléter</p></td></tr>
<tr><td><p>Base de données</p></td><td><p>Neon</p></td><td><p>à compléter</p></td></tr>
<tr><td><p>Lecture automatique des BL</p></td><td><p>API Anthropic, coût par BL lu</p></td><td><p>à mesurer (nombre de BL × coût par lecture)</p></td></tr>
<tr><td><p>Envoi des mails</p></td><td><p>Resend (sauvegardes)</p></td><td><p>à compléter</p></td></tr>
<tr><td><p>Développement et maintenance</p></td><td><p>Heures passées / mois</p></td><td><p>à compléter</p></td></tr>
<tr><td><p>Formation des équipes</p></td><td><p>Une fois, puis nouveaux arrivants</p></td><td><p>à compléter</p></td></tr>
</tbody></table>
<p>À comparer avec : abonnement d'un concurrent × nombre d'établissements × 12 mois.</p>

<h2>6. Réponses aux objections</h2>
<ul>
<li><p><strong>« Ça existe déjà. »</strong> Les outils du marché couvrent une partie (HACCP ou achats) ; aucun ne relie la réception aux avoirs et aux économies justifiées.</p></li>
<li><p><strong>« Ça coûte cher. »</strong> Les économies obtenues et le temps gagné sont mesurés chaque mois dans l'application (calcul ci-dessus).</p></li>
<li><p><strong>« Les équipes ne l'utiliseront pas. »</strong> Saisie sur téléphone, étapes guidées, brouillon automatique, conformité proposée automatiquement.</p></li>
<li><p><strong>« Et la sécurité des données ? »</strong> Sauvegardes, exports PDF / Excel, archivage 5 ans, fiches validées non modifiables avec historique.</p></li>
<li><p><strong>« Et en cas de contrôle sanitaire ? »</strong> Fiche de réception du jour validée, photos, signatures, températures, lots et DLC exportables immédiatement.</p></li>
</ul>

<h2>7. Feuille de route</h2>
<h3>Fait</h3>
<p>Voir Dev &gt; Réalisé.</p>
<h3>Prochaines étapes</h3>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"><p>Paramétrer les champs obligatoires et les messages (Dev &gt; Caractéristiques)</p></li>
<li data-type="taskItem" data-checked="false"><p>Photo d'étiquette obligatoire pour les produits à DLC</p></li>
<li data-type="taskItem" data-checked="false"><p>Fiche d'organisation à réception et fiche de suivi d'anomalie</p></li>
<li data-type="taskItem" data-checked="false"><p>Mesurer le coût réel (hébergement, lecture des BL) pendant 3 mois</p></li>
</ul>
<h3>Plus tard</h3>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"><p>Plusieurs établissements</p></li>
<li data-type="taskItem" data-checked="false"><p>Tableau de bord direction</p></li>
</ul>

<h2>8. Risques et parades</h2>
<table><tbody>
<tr><th><p>Risque</p></th><th><p>Parade</p></th></tr>
<tr><td><p>Adoption par les équipes</p></td><td><p>Formation courte, référent par service, saisie guidée</p></td></tr>
<tr><td><p>Dépendance à une seule personne</p></td><td><p>Documentation (Dev, protocoles), code sauvegardé sur GitHub</p></td></tr>
<tr><td><p>Coûts qui augmentent</p></td><td><p>Suivi mensuel du coût dans ce document</p></td></tr>
</tbody></table>

<h2>9. Idées en vrac</h2>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"><p></p></li>
</ul>
<h2>10. Positionnement, offre et différenciation (analyse du 18/11/2026)</h2>
<div data-callout="" data-variant="warning"><p>Sources : tableau comparatif « Appli » (prix et fonctions des concurrents non revérifiés). Pense à réserver l'onglet Dev à ton compte si d'autres administrateurs ont accès à l'application.</p></div>
<h3>Position sur le marché</h3>
<ul>
<li><p><strong>Applis HACCP (0 à 55 €/mois)</strong> : contrôle sanitaire à réception, mais ni quantités, ni prix, ni avoirs.</p></li>
<li><p><strong>Gestion de restaurant (49 à 180 €/mois)</strong> : contrôle économique, HACCP en option payante (ex. +38 €).</p></li>
<li><p><strong>Notre position</strong> : la réception complète, sanitaire et économique, du camion jusqu'à l'avoir encaissé.</p></li>
</ul>
<h3>Minimum pour une version commercialisable</h3>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"><p>Plusieurs clients et plusieurs établissements (comptes séparés, paramétrage par client) : prérequis n° 1</p></li>
<li data-type="taskItem" data-checked="false"><p>Module commandes relié à la réception : commandé / livré / facturé</p></li>
<li data-type="taskItem" data-checked="false"><p>Abonnement et paiement en ligne, conditions générales, RGPD, hébergement des données en Europe</p></li>
<li data-type="taskItem" data-checked="false"><p>Rapprochement BL / facture (factures électroniques)</p></li>
</ul>
<p>À ne pas développer pour la version de base : stocks, inventaires, fiches techniques, caisse.</p>
<h3>Offre envisagée</h3>
<table><tbody>
<tr><th><p>Offre</p></th><th><p>Contenu</p></th><th><p>Prix (HT/mois/site)</p></th></tr>
<tr><td><p>Réception</p></td><td><p>HACCP + contrôle économique + réclamations + économies + fiche DDPP</p></td><td><p>59 à 69 €</p></td></tr>
<tr><td><p>Réception + Commandes</p></td><td><p>+ commandes reliées à la réception</p></td><td><p>89 à 99 €</p></td></tr>
<tr><td><p>Groupe</p></td><td><p>Plusieurs sites, tableau de bord commun</p></td><td><p>Dégressif ou sur devis</p></td></tr>
<tr><td><p>Mise en place</p></td><td><p>Import mercurial, fournisseurs, protocoles, seuils</p></td><td><p>150 à 300 € une fois</p></td></tr>
</tbody></table>
<p>Lecture des BL : quota inclus (150 à 200 BL/mois), au-delà facturé. Argument : l'argent récupéré, mesuré chaque mois (calcul coût / gains ci-dessus).</p>
<h3>Ce qui nous démarque déjà</h3>
<ul>
<li><p>Chaîne complète : anomalie → réclamation avec relances par fournisseur → avoir vérifié → économie justifiée.</p></li>
<li><p>HACCP inclus, sans module en supplément ; aucun matériel à acheter.</p></li>
<li><p>Fiche de réception DDPP exportée automatiquement chaque soir, figée, archivée 5 ans.</p></li>
<li><p>Conformité proposée automatiquement (seuils réglementaires et marges acceptables).</p></li>
<li><p>Cas du terrain : écarts de pesée avec tares, prix bloqués, fruits et légumes au prix du mois, suivi des prix automatique.</p></li>
<li><p>Conçue sur un vrai restaurant, par quelqu'un du métier.</p></li>
</ul>
<h3>Pistes pour se démarquer davantage</h3>
<ul>
<li><p>Commandes reliées à la réception dès l'offre de base.</p></li>
<li><p>Rapport mensuel envoyé au gérant (économies, fournisseurs à problèmes, hausses de prix).</p></li>
<li><p>Comparaison anonymisée des prix entre clients (cadre juridique à vérifier).</p></li>
<li><p>Lecture et rapprochement automatiques des factures électroniques.</p></li>
</ul>
<h3>Points faibles à traiter</h3>
<ul>
<li><p>Pas encore d'avis clients ni de références.</p></li>
<li><p>Dépendance à une seule personne ; support et formation à organiser.</p></li>
</ul>
<h2>11. Proposition au restaurant et propriété de l'application (mise à jour du 18/11/2026)</h2>
<div data-callout="" data-variant="danger"><p>Note personnelle : réserver l'onglet Dev à mon compte (bouton en haut de Dev) pour que les autres administrateurs ne la voient pas. Ceci n'est pas un avis juridique : à faire valider par un avocat en propriété intellectuelle et par l'expert-comptable.</p></div>

<h3>La proposition</h3>
<table><tbody>
<tr><th><p>Élément</p></th><th><p>Proposition</p></th></tr>
<tr><td><p>Contrat</p></td><td><p>CDD de 6 mois, poste « Contrôleur de coûts » (gestion de l'application + recherche d'économies)</p></td></tr>
<tr><td><p>Fixe</p></td><td><p>31 000 € brut par an (environ 2 000 € net par mois)</p></td></tr>
<tr><td><p>Prime</p></td><td><p>10 % des économies justifiées</p></td></tr>
<tr><td><p>Application</p></td><td><p>Utilisation gratuite pendant le CDD ; je reste propriétaire du code</p></td></tr>
<tr><td><p>Bilan</p></td><td><p>Point au bout de 6 mois, chiffres de l'application à l'appui</p></td></tr>
</tbody></table>

<h3>Coût pour le restaurant sur 6 mois (estimation)</h3>
<ul>
<li><p>Fixe : environ 15 500 € brut, soit environ 21 000 € chargé pour l'entreprise.</p></li>
<li><p>Indemnité de fin de CDD : 10 % de la rémunération brute (environ 1 550 € et plus selon la prime), due si le CDD n'est pas suivi d'un CDI.</p></li>
<li><p>Prime : 10 % des économies, donc payée par les économies elles-mêmes.</p></li>
<li><p>Argument : avec environ 3 à 3,5 M€ d'achats par an (hypothèse), récupérer 1,5 % sur 6 mois (environ 25 k€) couvre le poste ; l'application justifie chaque euro.</p></li>
</ul>

<h3>À faire préciser par écrit</h3>
<ul>
<li><p><strong>Motif du CDD</strong> : un CDD doit avoir un motif prévu par la loi. Faire vérifier lequel par l'expert-comptable ; sinon, un CDI avec période d'essai donne la même souplesse.</p></li>
<li><p><strong>Calcul de la prime</strong> : « économies justifiées » = avoirs et régularisations obtenus + livraisons différées, comme dans Reporting &gt; Économies (hors montants en attente) ; préciser si les baisses de prix négociées comptent, et sur quelle durée ; versement mensuel ou trimestriel.</p></li>
<li><p><strong>Application</strong> : licence d'utilisation gratuite pendant le CDD, sans cession des droits ; l'application existante reste ma propriété et hors du contrat de travail ; les améliorations faites pendant le CDD restent à moi (sinon elles reviennent à l'employeur, article L113-9 du Code de la propriété intellectuelle).</p></li>
<li><p><strong>Données</strong> : les données du restaurant (fournisseurs, prix, anomalies, protocoles) restent à lui ; export complet remis en cas de fin de collaboration.</p></li>
</ul>

<h3>Le point à 6 mois : options à préparer</h3>
<ul>
<li><p>Bilan chiffré : économies obtenues, en attente, temps gagné, fiches DDPP.</p></li>
<li><p>Suite possible : CDI avec un fixe revu à la hausse selon les résultats, prime maintenue ; licence payante pour chaque nouvel établissement (offre envisagée en section 10).</p></li>
<li><p>Si la collaboration s'arrête : l'application reste à moi, les données sont rendues au restaurant.</p></li>
</ul>

<h3>Propriété du code : ce qui compte</h3>
<ul>
<li><p>Le process, les protocoles, les fournisseurs et les prix fournis par le restaurant sont des informations : ils ne rendent pas le restaurant propriétaire du code (seul le code est protégé, pas les idées ni le cahier des charges). Ces données sont à eux : à retirer avant toute vente à un autre client.</p></li>
<li><p>Un logiciel créé par un salarié dans le cadre de ses fonctions ou sur instruction de l'employeur appartient à l'employeur. Créé de ma propre initiative, sur mon temps personnel et hors de mon poste, il est à moi ; une cession de droits doit toujours être écrite.</p></li>
</ul>

<h3>À faire avant de négocier</h3>
<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"><p>Garder les preuves datées : historique GitHub ; dépôt à l'APP (Agence pour la protection des programmes) ou enveloppe Soleau (INPI)</p></li>
<li data-type="taskItem" data-checked="false"><p>Garder à mon nom les comptes GitHub, Vercel, Neon et Anthropic</p></li>
<li data-type="taskItem" data-checked="false"><p>Faire vérifier le motif du CDD et le coût exact par l'expert-comptable</p></li>
<li data-type="taskItem" data-checked="false"><p>Faire relire le contrat (licence gratuite, propriété, prime) par un avocat en propriété intellectuelle avant de signer</p></li>
</ul>
`.trim();
