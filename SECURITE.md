# Sécurité — notes de conception et de déploiement

Cette application est conçue pour un usage **interne CIRAD, sur réseau de
confiance, sans mot de passe** (profils choisis librement). Ce document
explique le modèle de menace retenu, les protections en place, et ce qui
**doit être configuré côté infrastructure** au déploiement.

## Modèle de menace retenu

Le risque n'est pas l'attaquant authentifié (il n'y a pas d'authentification),
mais :
1. le **contenu hostile** qui transite par les exports/imports Excel vers la
   MOE (externe) et revient ;
2. la **corruption de données** par concurrence ou absence de validation ;
3. un poste compromis sur le LAN exploitant l'API.

## Protections en place dans l'application

| Risque | Protection | Vérifié |
|---|---|---|
| **Injection de formule Excel** (cellule `=`, `+`, `-`, `@` ouverte par la MOE) | Toutes les cellules texte des exports sont neutralisées (préfixe apostrophe) ; les classeurs n'émettent que des cellules de type **texte** (jamais formule). | ✅ test auto |
| **XSS / contenu HTML** dans les remarques | Rendu via React (échappement) ; extraction de texte par `plainText` (DOMParser, **sans** `innerHTML`, n'exécute ni script ni chargement de ressource). | ✅ test auto |
| **Collision de numéros** (R-0042 en multi-utilisateur) | Index **unique** `(project, number)` en base + création avec **retry** automatique sur conflit. 5 créations simultanées → 1 seule réussit, les autres reprennent le numéro suivant. | ✅ test auto |
| **Injection de filtre PocketBase** | Aucune saisie libre n'entre dans un filtre serveur (recherches faites côté client) ; seuls des IDs et des constantes d'enum sont interpolés. | ✅ audit |
| **Valeurs hors domaine** (statut, criticité, type…) | Champs `select` PocketBase : les valeurs hors énumération sont **refusées par le serveur**. | ✅ test auto |
| **Champs obligatoires** (texte, auteur, numéro) | `required` côté serveur ; numéro `min = 1`. | ✅ test auto |
| **Suppression de données** | `deleteRule` réservé aux super-admins : aucune suppression via l'API publique (le cycle de vie passe par les statuts et l'archivage). | ✅ test auto |
| **Types/poids de fichiers** | `document_versions.file` restreint aux types bureautiques (PDF, Word, Excel, ODF, CSV) et **60 Mo** max. | ✅ migration |
| **Clôture abusive** | Clôture d'une remarque réservée à son émetteur / MOA / secrétaire (contrôle applicatif). | ✅ |

## À configurer impérativement côté infrastructure (serveur CIRAD)

Comme il n'y a pas d'authentification, **l'isolation réseau est le contrôle
principal** :

1. **Restreindre l'accès réseau** au LAN/VPN CIRAD (allowlist d'IP sur le
   reverse-proxy, ou service exposé uniquement sur le réseau interne).
   Ne jamais exposer PocketBase directement sur Internet.
2. **HTTPS** via le reverse-proxy (Apache/Nginx).
3. **Servir les fichiers déposés en `Content-Disposition: attachment`**
   (téléchargement forcé), jamais en `inline`, pour qu'un éventuel fichier
   HTML/SVG ne s'exécute pas dans le contexte du domaine.
4. **Sauvegarder** `pb/pb_data/` (base SQLite + fichiers) régulièrement.
5. Tenir à jour PocketBase, `pdfjs-dist` et `xlsx` (correctifs de sécurité
   des parseurs de fichiers non fiables).

## Évolution possible : authentification légère

Si l'application doit sortir de l'intranet, activer l'authentification
PocketBase (même un compte partagé par organisme) permet de passer les règles
d'accès de « public » à « authentifié uniquement »
(`@request.auth.id != ""`), et d'ajouter un PIN par profil. L'architecture
(profils = collection `stakeholders`) est prête pour cette évolution.

## Tests de sécurité automatisés

Les protections ci-dessus sont couvertes par des tests reproductibles
(intégrité des champs, validation serveur, unicité sous concurrence,
neutralisation des formules, non-exécution XSS, anti-doublons d'import,
suppression interdite). Résultat de la dernière passe : **45 contrôles, 0
échec**.
