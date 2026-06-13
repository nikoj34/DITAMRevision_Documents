# Revue de documents d'études

Application web de suivi des **remarques** et **décisions** sur les documents
d'études de grands projets de construction : Programme, ESQ, APS1/APS2…, APD,
PRO, DCE — et projets sans MOE classique (régie, marchés globaux…).

Conçue lors d'un atelier avec une équipe complète d'utilisateurs simulés
(MOA, programmiste/AMO, architecte, BET, économiste, contrôleur technique,
exploitants, secrétaire de séance) — voir [`docs/ATELIER.md`](docs/ATELIER.md).

## Ce que fait l'application

- **Projets multi-opérations** avec phases paramétrables et itérations
  (APS1, APS2… avant de passer à l'APD).
- **Documents versionnés par indices** (A, B, C…) : PDF affichés dans une
  visionneuse intégrée, Word/Excel stockés et téléchargeables. Les documents
  originaux ne sont **jamais modifiés**.
- **Remarques ancrées** : épingle ou zone tracée directement sur le PDF,
  et/ou référence textuelle (chapitre de CCTP, onglet/cellule Excel, local).
  Saisie minimale : un clic + un texte suffisent.
- **Cycle de vie complet** : à traiter → en cours → répondue → à revérifier →
  traitée / sans objet / reportée phase suivante. Fil de discussion signé,
  sens de réponse normalisé (prise en compte, refusée justifiée, demande de
  précision, nécessite arbitrage, hors mission).
- **Report inter-versions** : au dépôt d'un nouvel indice, les remarques non
  soldées sont reportées automatiquement en « à revérifier ». **Jamais de
  clôture automatique** — seul l'émetteur (ou MOA/secrétaire) clôt.
- **Registre des décisions vivant**, transverse aux phases : actée /
  à arbitrer / modifiée / reportée / abandonnée, avec **vérification phase
  par phase** (conforme / non conforme / non vérifiable) — la mémoire de
  l'opération, même quand l'APD reformule tout.
- **Tableau de bord** : remarques ouvertes, bloquantes non levées, échéances
  dépassées, alerte sur les décisions actées non re-vérifiées sur la phase
  en cours.
- **Suivi par sujet** : étiquetez remarques et décisions par local, ouvrage
  ou thème (« Escalier aile B »…) et consultez leur histoire complète à
  travers les phases, même quand les documents sont reformulés.
- **Référentiel d'exigences** (origine libre : programme, DSST santé &
  sécurité au travail, équipe de recherche, réglementation, sûreté…) :
  chaque exigence est vérifiée phase après phase (conforme / non conforme /
  écart accepté / non vérifiable), avec taux de conformité, remarques
  rattachées, import/export Excel du référentiel.
- **Aller-retour MOE sans accès à l'application** (fiche navette) : export
  du registre Excel **protégé** — le texte des observations est verrouillé,
  l'insertion/suppression de lignes bloquée (mot de passe de protection :
  `CIRAD`), seules les colonnes Réponse / Sens de la réponse (liste
  déroulante) sont saisissables ; les ajouts de la MOE passent par la
  feuille dédiée « Nouvelles remarques (MOE) ». Au ré-import : réponses
  rattachées par n°, lignes nouvelles créées comme remarques « à traiter »,
  **aucune clôture automatique** — répondre n'est pas corriger.
- **Export Excel** conforme au tableau d'observations type des marchés
  publics (+ feuille registre des décisions), livrable tel quel en annexe de
  compte rendu. **Import Excel** tolérant avec assistant de correspondance
  des colonnes et rapport ligne à ligne (reprise des projets en cours).
- **Profils simples sans mot de passe** : on choisit sa carte (nom,
  organisme, rôle) ; toutes les actions sont signées et horodatées.

## Stack

- Frontend : **React 19 + Vite + TypeScript** (react-router, zustand,
  pdf.js « legacy » pour la compatibilité navigateurs, SheetJS).
- Backend : **PocketBase** (un seul exécutable : base SQLite, API REST,
  stockage des fichiers, temps réel). Le schéma est créé automatiquement au
  premier démarrage par la migration `pb/pb_migrations/`.

## Démarrage en développement

```bash
npm install

# Backend — télécharger PocketBase (une fois) :
cd pb
curl -L -o pb.zip https://github.com/pocketbase/pocketbase/releases/download/v0.36.2/pocketbase_0.36.2_linux_amd64.zip
unzip pb.zip pocketbase && rm pb.zip
# (macOS : pocketbase_0.36.2_darwin_arm64.zip ; Windows : ..._windows_amd64.zip)

# Terminal 1 — backend :
./pocketbase serve --http 127.0.0.1:8090

# Terminal 2 — frontend :
cd .. && npm run dev
```

Application : <http://localhost:5173> — Console d'administration PocketBase :
<http://127.0.0.1:8090/_/> (créez le compte super-utilisateur proposé au
premier lancement).

Données de démonstration (optionnel) :

```bash
node scripts/seed.mjs
```

## Déploiement sur un serveur (ex. serveur CIRAD)

PocketBase sert aussi le frontend compilé : **un seul service à exploiter**.

```bash
npm run build
mkdir -p pb/pb_public && cp -r dist/* pb/pb_public/

# Sur le serveur :
./pocketbase serve --http 0.0.0.0:8090
# ou derrière un reverse proxy (Apache/Nginx) avec HTTPS — recommandé.
```

- Les routes inconnues retombent sur `index.html` (application monopage).
- Si le frontend est servi par PocketBase (même origine), aucune
  configuration d'URL n'est nécessaire. Sinon, définir `VITE_PB_URL` dans un
  fichier `.env` avant `npm run build` (voir `.env.example`).
- Sauvegarde : le dossier `pb/pb_data/` contient toute la base et les
  fichiers déposés — c'est lui qu'il faut sauvegarder.
- Service systemd type :

```ini
[Unit]
Description=Revue de documents (PocketBase)
After=network.target

[Service]
WorkingDirectory=/opt/revue-docs/pb
ExecStart=/opt/revue-docs/pb/pocketbase serve --http 127.0.0.1:8090
Restart=on-failure
User=revuedocs

[Install]
WantedBy=multi-user.target
```

## Structure du code

```
pb/pb_migrations/    Schéma PocketBase (créé automatiquement au démarrage)
scripts/seed.mjs     Données de démonstration
src/
  lib/               Client PocketBase, types métier, hooks, Excel, pdf.js
  state/             Session (profil courant, filtre de phase)
  components/        Composants UI génériques (modale, tiroir, badges…)
  features/
    profil/          Choix du profil (sans mot de passe)
    projets/         Liste et création des opérations
    layout/          Coquille du projet (barre latérale, sélecteur de phase)
    dashboard/       Tableau de bord et alertes
    documents/       Documents, indices, report des remarques
    viewer/          Visionneuse PDF annotable (épingles, zones)
    remarques/       Registre, fiche remarque, fil de discussion, export
    decisions/       Registre des décisions, vérifications par phase
    import/          Assistant d'import Excel
    params/          Phases, lots, thèmes
docs/ATELIER.md      Synthèse des ateliers de conception et de revue
SECURITE.md          Modèle de menace, protections, déploiement sécurisé
```

## Sécurité

Voir [`SECURITE.md`](SECURITE.md) : neutralisation des formules Excel à
l'export, anti-XSS, index unique anti-collision de numéros, validation
serveur des champs, suppression réservée à l'admin, restriction des types de
fichiers — et la configuration réseau **à appliquer au déploiement** (l'app
étant sans mot de passe, l'isolation sur le réseau CIRAD est le contrôle
principal). Une batterie de tests automatisés couvre ces points.

## Pistes V2 (issues de l'atelier)

Campagnes de relecture avec relances, avis formels du contrôleur technique
avec levée réservée à l'émetteur, multi-ancrage d'une remarque sur plusieurs
documents, liens entre remarques (« dépend de », « même sujet »), balance des
surfaces par local, comparaison côte à côte de deux indices, mode séance,
notifications mail, PIN par profil.
