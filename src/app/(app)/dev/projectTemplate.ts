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
`.trim();
