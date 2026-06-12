# Atelier de conception — Revue de documents d'études (12/06/2026)

Application de suivi des remarques et décisions sur les documents d'études de
grands projets de construction (Programme, ESQ, APS1/APS2…, APD, PRO, DCE — et
projets hors loi MOP). Stack : React + Vite + TypeScript, backend PocketBase
(hébergeable sur serveur CIRAD), visionneuse PDF intégrée, profils simples sans
mot de passe, export/import Excel.

## Participants (personas simulés)

| Groupe | Personas |
|---|---|
| Maîtrise d'ouvrage | Chef de projet MOA (établissement public de recherche), Programmiste/AMO |
| Maîtrise d'œuvre | Architecte mandataire, Ingénieur BET fluides/structure, Économiste de la construction |
| Contrôle & exploitation | Contrôleur technique, Représentant des utilisateurs/exploitants, Secrétaire de séance |
| Conception | UX designer, Architecte logiciel |

## 1. Constats partagés (irritants majeurs)

1. **Consolidation manuelle infernale** : chaque relecteur renvoie son propre
   Excel par mail ; 2 à 3 jours de recopie par phase, doublons, versions
   `_v3_CONSOLIDE_final_VF2.xlsx` dont on ne sait plus laquelle fait foi.
2. **Perte de mémoire entre phases** : une décision actée en APS2 (CR p. 6)
   n'est pas revérifiée en APD car tout est reformulé/repaginé. Régressions
   silencieuses découvertes en PRO.
3. **Localisation ambiguë** : « voir remarque ventilation » — quel document,
   quelle page, quel indice ? Un aller-retour de 3 semaines perdu sur un
   malentendu.
4. **Pas de clôture formelle** : les mêmes remarques resurgissent à chaque
   phase ; « répondu » est confondu avec « vérifié et clos ».
5. **Avis émis sur des versions périmées**, remarques contradictoires entre
   relecteurs jamais arbitrées, relances artisanales sans trace.

## 2. Principes de conception actés

1. **Le document logique versionné est le squelette** : un document (« Plan
   RDC », « Notice CVC ») a des versions/indices successifs (A, B, C…). Les
   remarques s'ancrent sur une *version* ; le document logique survit aux
   fichiers.
2. **La remarque et la décision sont des objets indépendants des fichiers**,
   reliés à des localisations dans des versions. Quand le fichier est
   remplacé, rien n'est perdu.
3. **Report automatique, jamais de clôture automatique** : au dépôt d'un
   nouvel indice, les remarques non soldées sont reportées sur la nouvelle
   version avec le statut « à revérifier ». Seul un humain clôt.
4. **Registre des décisions vivant et transverse aux phases** : statuts
   actée / à arbitrer / modifiée / reportée / abandonnée, avec trace de
   vérification phase par phase (« vérifiée conforme en APD : plan A-201
   ind. C »). C'est la mémoire de l'opération.
5. **Saisie minimale, enrichissement progressif** : 3 champs suffisent pour
   créer une remarque (document/page, texte, criticité). Lot, thème, type,
   exigence… sont requalifiables ensuite. La rigueur est portée par le chef
   de projet, pas imposée au relecteur occasionnel.
6. **Excel = interface contractuelle** : export conforme au tableau
   d'observations type des marchés publics français (livrable tel quel en
   annexe de compte rendu), import tolérant avec assistant de correspondance
   des colonnes et rapport d'erreurs ligne à ligne. Le n° d'origine des
   remarques importées est conservé (réf. externe).
7. **Numérotation unique, pérenne, jamais réattribuée** (ex. `R-0042`),
   séquentielle par projet.
8. **Profils simples sans mot de passe** : on choisit sa carte (nom,
   organisme, rôle coloré). Toutes les actions sont signées et horodatées.
9. **Phases paramétrables** : APS1/APS2 = deux phases chaînées (type APS,
   itération 1 et 2) ; séquence libre pour les projets hors MOE.

## 3. Cycle de vie d'une remarque

```
ÉMISE (à traiter) → RÉPONDUE (prise en compte / refusée+justification /
   demande de précision / nécessite arbitrage / hors mission / reportée)
→ dépôt nouvel indice → À REVÉRIFIER (report automatique)
→ vérification humaine → CLOSE (traitée) | non corrigée (reste à revérifier)
États terminaux : TRAITÉE / SANS OBJET–ABANDONNÉE / REPORTÉE phase suivante
```

- Une remarque peut être **transformée en décision** (ou liée à une décision).
- Réponses en fil de discussion signé ; les changements de statut sont tracés.
- Criticité : bloquante / importante / normale / mineure. Une phase ne devrait
  pas être validée avec des bloquantes ouvertes (alerte au tableau de bord).

## 4. Statuts d'une décision

`à arbitrer` → `actée` | `abandonnée` | `reportée` (à une phase) |
`modifiée` (remplacée par une autre décision, lien conservé).
Chaque décision garde : phase d'origine, remarques sources, décideur, date,
référence du CR/arbitrage, et son **historique de vérification par phase**
(conforme / non conforme → génère une remarque / non vérifiable à ce stade).

## 5. Périmètre V1 (construit) et V2 (noté)

**V1** : projets multi-opérations, phases paramétrables avec itérations,
documents versionnés (PDF affiché, Word/Excel stockés et référencés par
chapitre/cellule), visionneuse PDF avec épingles/zones et panneau latéral,
registre des remarques filtrable, fils de réponses, report inter-versions avec
checklist de revérification, registre des décisions transverse avec suivi par
phase, tableau de bord (compteurs, retards, bloquantes, décisions à arbitrer),
export Excel conforme à la trame type, import Excel avec mapping de colonnes.

**V2 (pisté, non construit)** : campagnes de relecture avec relances
automatiques, avis formels du contrôleur technique (favorable/suspendu/
défavorable) avec levée réservée à l'émetteur, multi-ancrage d'une remarque
sur plusieurs documents, liens « dépend de / en conflit avec / même sujet »,
référentiel d'exigences du programme et balance des surfaces, comparaison
côte à côte de deux indices, mode séance, notifications mail récapitulatives,
PIN par profil si exposition hors intranet.

## 6. Pièges identifiés à éviter (retenus comme garde-fous)

- Ancrer sur le n° de page seul : l'ancre robuste = version du document +
  zone graphique + référence textuelle (article CCTP, code article DPGF,
  local) qui survit à la repagination.
- Exiger que tout le monde s'y mette : l'Excel aller-retour reste possible.
- L'usine à gaz de workflow : 3 champs obligatoires maximum à la création.
- Un export « techniquement correct » mais non conforme à la trame
  contractuelle : l'export doit être livrable tel quel.
- Un import qui échoue en bloc : import ligne à ligne avec rapport détaillé.
- Permettre la clôture des réserves par quelqu'un d'autre que l'émetteur/MOA.
- Éditer silencieusement après clôture : l'historique est conservé.

## 7. Arbitrages pris (modifiables)

| Question | Choix V1 |
|---|---|
| Numérotation des remarques | Par projet (`R-0042`), simple à citer en réunion |
| APS1/APS2 | Phases distinctes chaînées (type + n° d'itération) |
| Word/Excel | Fichiers stockés et téléchargeables, ancrage par référence textuelle (onglet/cellule/code article, chapitre) ; visionneuse réservée aux PDF |
| Diff visuel de PDF | Non — la checklist des remarques reportées couvre le besoin |
| Authentification | Profils sans mot de passe (intranet de confiance), traçabilité par signature des actions |

---

# Revue critique (atelier n°2 — 12/06/2026)

Trois groupes ont relu l'application construite : technicien occasionnel +
chef de projet MOA, secrétaire + MOE + économiste, expert UX. Diagnostic
partagé : « une base de données navigable » à transformer en « outil de
tâches » pour des utilisateurs qui n'ouvrent l'app que 2-3 fois par an.

## Changements appliqués

1. **Page Accueil orientée tâches** (nouvelle page d'arrivée) : « À relire »
   (documents de la phase en cours), « Vos remarques » (réponses reçues, à
   revérifier), alertes de pilotage pour les rôles MOA/AMO/secrétaire, mode
   d'emploi en 4 étapes.
2. **Menu selon le rôle** : 3 entrées pour un relecteur (Accueil, Documents,
   Remarques) ; section « Pilotage » (Tableau de bord, Décisions, Exigences,
   Paramètres) réservée aux rôles MOA/AMO/secrétaire (déverrouillable d'un
   clic). « Import Excel » et « Suivi par sujet » ne sont plus des entrées :
   l'import est un bouton de la page Remarques, le suivi par sujet une vue
   (bascule Liste / Par sujet).
3. **Bandeau de filtre de phase** non-ignorable quand un filtre est actif
   (piège silencieux identifié), avec « Tout afficher ».
4. **Visionneuse** : « Mode remarque » remplacé par un bouton primaire
   « + Ajouter une remarque » + consigne ; formulaire réduit (texte +
   référence, le reste sous « Plus d'options ») ; toast de confirmation
   « ✓ Remarque R-00XX enregistrée » ; légende des statuts (« ? ») partout.
5. **Visionneuse Excel lecture seule** : classeur affiché onglet par onglet,
   clic sur une cellule → référence normalisée pré-remplie
   (« Lot 06!E3 — Faux plafond 600x600 »), cellules déjà commentées
   surlignées. Réponse au besoin n°1 de l'économiste.
6. **Navette durcie** : tri autorisé côté MOE (le rapprochement par n° le
   permet sans risque), colonnes « Répondant (MOE) » et « Renvoi » 
   déverrouillées (réponses signées du bon intervenant à l'import), feuille
   décisions retirée de la navette (export séparé sur la page Décisions),
   feuille « Nouvelles remarques » enrichie (Lot, Criticité avec liste).
7. **Import anti-doublons** : réponse identique déjà au fil → ignorée
   (double ré-import) ; remarque close → réponse NON intégrée, listée en
   avertissement (navette périmée) ; ligne nouvelle déjà importée (même
   réf. MOE) → ignorée. Rapport en trois sections (intégrées /
   avertissements / rejets).

## Backlog issu de la revue (non traité, priorisé)

- Entité « navette » en base (journal des exports/imports, destinataire,
  statut envoyée/retournée/intégrée) + prévisualisation avant import.
- Colonne « en attente de » (MOE/MOA/relecteur) + ancienneté sur le
  registre ; compteur « en attente MOE > 15 j ».
- Export PDF « ordre du jour de revue » (remarques ouvertes par lot).
- Réconciliation assistée des références Excel au changement d'indice
  (rapprochement par code article + libellé).
- Aperçu Word (conversion docx → HTML via mammoth.js).
- Simplification éventuelle à 4 statuts + drapeau « bloquante » (à valider
  à l'usage).
