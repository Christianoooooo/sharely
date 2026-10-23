# Sharely — Documentation Technique

> **Version :** 1.0.0 · **Licence :** MIT · **Node.js :** ≥ 22

---

## Table des matières

1. [Présentation du projet](#1-présentation-du-projet)
2. [Architecture](#2-architecture)
3. [Stack technique](#3-stack-technique)
4. [Structure des répertoires](#4-structure-des-répertoires)
5. [Configuration & Variables d'environnement](#5-configuration--variables-denvironnement)
6. [Modèles de données](#6-modèles-de-données)
7. [API REST](#7-api-rest)
8. [API WebSocket](#8-api-websocket)
9. [Routes de service des fichiers](#9-routes-de-service-des-fichiers)
10. [Authentification & Sécurité](#10-authentification--sécurité)
11. [Système d'upload](#11-système-dupload)
12. [Génération de miniatures](#12-génération-de-miniatures)
13. [E-mail & SMTP](#13-e-mail--smtp)
14. [Internationalisation](#14-internationalisation)
15. [Frontend (React SPA)](#15-frontend-react-spa)
16. [Tableau de bord administrateur](#16-tableau-de-bord-administrateur)
17. [RGPD / Confidentialité](#17-rgpd--confidentialité)
18. [Tâches en arrière-plan](#18-tâches-en-arrière-plan)
19. [Déploiement](#19-déploiement)
20. [Environnement de développement](#20-environnement-de-développement)
21. [Migrations & Scripts](#21-migrations--scripts)
22. [Tests end-to-end](#22-tests-end-to-end)

---

## 1. Présentation du projet

Sharely est une **plateforme de partage de fichiers auto-hébergée** dotée d'une interface web épurée, d'une intégration ShareX et d'un accès via API. Les utilisateurs téléversent des captures d'écran, des fichiers et des médias, puis les partagent instantanément via des liens courts.

### Fonctionnalités principales

| Fonctionnalité | Description |
|---|---|
| Upload web | Glisser-déposer, jusqu'à 500 fichiers simultanément |
| Upload par morceaux | Fichiers jusqu'à 2 Go via upload multi-part parallèle |
| Intégration ShareX | Fichier de configuration `.sxcu` téléchargeable en un clic |
| Upload via API | Authentification par jeton Bearer, compatible curl/wget |
| Visionneuse de fichiers | Zoom sur les images, streaming vidéo/audio (HTTP Range), PDF en ligne, code avec coloration syntaxique |
| Modes d'intégration | *embed* (HTML OG/Twitter Card) ou *raw* (redirection directe) |
| Miniatures | Aperçus JPEG automatiques pour les vidéos (ffmpeg) et les PDF (ghostscript) |
| Collections | Regroupements de fichiers avec mot de passe et date d'expiration optionnels |
| Liens de partage | Liens par fichier avec mot de passe, expiration et limite de téléchargement |
| Interface temps réel | Mises à jour en direct via WebSocket (upload, suppression, compteur de vues, stats admin) |
| Multilingue | 8 langues : EN, DE, FR, ES, IT, PT, JA, ZH |
| Tableau de bord admin | Statistiques, gestion des utilisateurs, gestion des fichiers, journal d'audit (export CSV) |
| Conformité RGPD | Fonctionnalités de confidentialité conformes au RGPD (Art. 17, 20, 32, etc.) |
| Import XBackBone | Migration d'installations XBackBone existantes |
| Prêt pour Docker | `docker compose up -d` démarre l'environnement complet |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser / Client                      │
│            React 18 SPA  ·  Vite  ·  Tailwind CSS           │
│   ┌──────────────────────────────────────────────────────┐   │
│   │  HTTP REST (/api/*)            WebSocket (/ws)       │   │
│   └──────────────────────────────────────────────────────┘   │
└───────────────────────────┬────────────────────┬─────────────┘
                            │ HTTP               │ WS
┌───────────────────────────▼────────────────────▼─────────────┐
│                    Express.js (app.js)                        │
│                                                               │
│  ┌──────────────┐  ┌───────────┐  ┌──────────┐  ┌────────┐  │
│  │  /api/auth   │  │  /api/*   │  │   /f/*   │  │  /s/*  │  │
│  │  /api/install│  │  routes   │  │  files   │  │ shares │  │
│  └──────────────┘  └───────────┘  └──────────┘  └────────┘  │
│                                                               │
│  Middleware: session · rate-limit · CSRF · CSP · auth        │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │  multer  │  │  ws.js   │  │  mailer  │  │ retention  │  │
│  │  upload  │  │ WebSocket│  │ nodemailer│  │  cleanup   │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└───────────────────────────┬───────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────┐
│                      MongoDB (Mongoose)                        │
│  User · File · Collection · ShareLink · SiteSettings          │
│  AuditLog                                                      │
└───────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────▼───────────────┐
              │     Dateisystem (uploads/)   │
              │  {folderName}/  ·  .chunks/  │
              │  .thumbnails/   ·  .avatars/ │
              └─────────────────────────────┘
```

### Flux de données : Upload standard

```
Browser → POST /api/web-upload (multipart/form-data)
       → multer: Datei in uploads/{folderName}/
       → normalizeMime() : réduit le type MIME à un seul « type/sous-type »
       → stripIfEnabled() : supprime les métadonnées des images (si activé)
       → sealUpload() : chiffre avec ENCRYPTION_KEY (sinon inchangé)
       → File.createUnique() → MongoDB
       → startThumbnail() (async, non-blocking ; supprime ensuite la copie en clair)
       → logAudit()
       → broadcast('file:uploaded') via WebSocket
       ← JSON: { files: [...] }
```

### Flux de données : Upload ShareX

```
ShareX → POST /upload (token im Formular-Body)
       → multer: Datei temporär in uploads/
       → requireApiKey: Token-Lookup → User (en cas d'échec, le fichier est supprimé immédiatement)
       → fs.renameSync → uploads/{folderName}/
       → normalizeMime() · sealUpload() · File.createUnique() → MongoDB
       → startThumbnail()
       ← JSON: { url, delete_url }
```

---

## 3. Stack technique

| Couche | Technologie | Version |
|---|---|---|
| **Runtime** | Node.js | ≥ 22 |
| **Framework backend** | Express.js | 4.x |
| **Base de données** | MongoDB + Mongoose | Mongo 7, Mongoose 8.x |
| **Sessions** | express-session + connect-mongo | — |
| **Temps réel** | WebSocket (`ws`) | 8.x |
| **Upload de fichiers** | Multer | 2.x |
| **Chiffrement des fichiers** | AES-256-GCM, HKDF-SHA256 (Node Crypto) | — |
| **E-mail** | Nodemailer | 10.x |
| **Hachage des mots de passe** | bcryptjs | 2.x (12 tours) |
| **Hachage des clés API** | SHA-256 (Node Crypto) | — |
| **Limitation de débit** | express-rate-limit | 8.x |
| **Import XBackBone** | sql.js | 1.x |
| **Framework frontend** | React 18 | 18.3.x |
| **Routage (frontend)** | React Router v6 | 6.x |
| **Outil de build** | Vite | 6.x |
| **Style** | Tailwind CSS + Radix UI | 3.x |
| **Composants UI** | shadcn/ui (Radix primitives) | — |
| **Icônes** | FontAwesome | 6.x |
| **i18n** | i18next + react-i18next | — |
| **Coloration syntaxique** | highlight.js | 11.x |
| **Conteneurs** | Docker + Docker Compose | — |
| **Tests** | Playwright (E2E) | 1.60.x |

---

## 4. Structure des répertoires

```
sharely/
├── app.js                          # Point d'entrée Express, séquence de démarrage
├── package.json
├── .env.example                    # Modèle pour toutes les variables d'environnement
├── Dockerfile
├── docker-compose.yml
│
├── src/
│   ├── config/
│   │   └── db.js                   # Connexion MongoDB (Mongoose)
│   ├── middleware/
│   │   ├── auth.js                 # requireLogin / requireAdmin / requireApiKey / establishSession
│   │   ├── lookupLimiter.js        # Limite de débit commune pour les recherches d'ID échouées
│   │   └── upload.js               # Configuration Multer, liste de blocage
│   ├── models/
│   │   ├── AuditLog.js             # Événements d'audit (TTL 90 jours)
│   │   ├── Collection.js           # Collections de fichiers
│   │   ├── File.js                 # Métadonnées des fichiers
│   │   ├── Paste.js                # Pastes de texte
│   │   ├── ShareLink.js            # Liens de partage par fichier
│   │   ├── SiteSettings.js         # Singleton : paramètres opérateur
│   │   └── User.js                 # Comptes utilisateurs + clés API
│   ├── routes/
│   │   ├── api.js                  # API principale (upload, galerie, admin, ...)
│   │   ├── auth.js                 # Connexion / Inscription / Réinitialisation du mot de passe
│   │   ├── docs.js                 # Page de documentation publique (/docs)
│   │   ├── files.js                # Service des fichiers, embeds OG, requêtes de plage
│   │   ├── import.js               # Migration XBackBone
│   │   ├── install.js              # Endpoint d'installation initiale (jeton d'installation)
│   │   ├── pastes.js               # API des pastes
│   │   └── shares.js               # Service des fichiers via lien de partage
│   ├── jobs/
│   │   └── retentionCleanup.js     # Suppression quotidienne des fichiers expirés et des restes d'upload
│   ├── migrations/
│   │   ├── migrateApiKeyHashes.js  # Unique : textes en clair → hachages SHA-256
│   │   └── migrateUserFolders.js   # Unique : déplacement des fichiers dans les dossiers utilisateurs
│   ├── utils/
│   │   ├── asyncRouter.js          # Routeur Express qui transmet les erreurs async au gestionnaire d'erreurs
│   │   ├── audit.js                # Fonction utilitaire logAudit()
│   │   ├── deleteUserData.js       # Suppression complète de toutes les données d'un compte
│   │   ├── fileCrypto.js           # Chiffrement des fichiers stockés (AES-256-GCM)
│   │   ├── generateThumbnail.js    # Intégration ffmpeg / ghostscript
│   │   ├── mailer.js               # Wrapper Nodemailer + modèles d'e-mail i18n
│   │   ├── mime.js                 # Normalisation MIME, liste blanche pour la distribution inline
│   │   ├── sanitizeFilename.js     # Nettoyage du nom de fichier
│   │   ├── setupToken.js           # Jeton d'installation de l'installation initiale
│   │   ├── storeUpload.js          # Chiffrement de l'upload, miniature depuis la copie en clair
│   │   └── uploadPath.js           # Résolution de chemin avec protection contre la traversée de chemin
│   └── ws.js                       # Serveur WebSocket + dispatcher d'actions
│
├── client/                         # Frontend React
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx                # Point d'entrée React
│       ├── App.jsx                 # Configuration du routeur
│       ├── index.css               # Styles globaux
│       ├── context/
│       │   └── AuthContext.jsx     # État d'authentification global
│       ├── hooks/
│       │   ├── use-toast.js        # Hook de notification toast
│       │   └── useWebSocket.js     # Connexion WS + gestionnaires d'événements
│       ├── components/
│       │   ├── Layout.jsx          # Shell de l'application (barre de navigation, sidebar)
│       │   ├── ProtectedRoute.jsx  # Garde d'authentification
│       │   ├── ShareLinkDialog.jsx # Dialogue de création de lien de partage
│       │   ├── AddToCollectionDialog.jsx
│       │   ├── CookieBanner.jsx
│       │   ├── LanguageSelector.jsx
│       │   ├── RequireEmailDialog.jsx
│       │   ├── UserAvatar.jsx
│       │   └── ui/                 # Composants de base shadcn/ui
│       ├── pages/
│       │   ├── Upload.jsx          # Page d'upload
│       │   ├── Gallery.jsx         # Galerie de fichiers
│       │   ├── FileView.jsx        # Vue détaillée d'un fichier
│       │   ├── Collections.jsx     # Vue d'ensemble des collections
│       │   ├── CollectionView.jsx  # Collection individuelle
│       │   ├── ShareView.jsx       # Page publique de lien de partage
│       │   ├── Settings.jsx        # Paramètres utilisateur
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   ├── ForgotPassword.jsx
│       │   ├── ResetPassword.jsx
│       │   ├── Install.jsx         # Installation initiale
│       │   ├── PrivacyPolicy.jsx
│       │   ├── TermsOfService.jsx
│       │   └── admin/
│       │       ├── Dashboard.jsx   # Page d'accueil admin
│       │       ├── Users.jsx       # Gestion des utilisateurs
│       │       ├── Files.jsx       # Gestion des fichiers
│       │       ├── AuditLog.jsx    # Vue du journal d'audit
│       │       ├── SiteSettings.jsx# Paramètres opérateur
│       │       └── Import.jsx      # Import XBackBone
│       ├── i18n/
│       │   ├── index.js            # Configuration i18next
│       │   └── locales/
│       │       ├── de.json
│       │       ├── en.json
│       │       ├── es.json
│       │       ├── fr.json
│       │       ├── it.json
│       │       ├── ja.json
│       │       ├── pt.json
│       │       └── zh.json
│       └── lib/
│           └── utils.js            # Utilitaire Tailwind (cn())
│
├── scripts/
│   ├── setup-db.js
│   ├── mongo-init.js               # Script d'initialisation MongoDB
│   ├── migrate-uploads-to-user-folders.js
│   ├── generate-missing-thumbnails.js
│   └── encrypt-existing-files.js   # Chiffrer a posteriori les fichiers existants
│
├── e2e/                            # Tests Playwright
│   ├── admin.spec.js
│   ├── bulk-actions-fixes.spec.js
│   ├── gallery.spec.js
│   ├── sharelink.spec.js
│   ├── tags.spec.js
│   ├── upload.spec.js
│   ├── helpers.js
│   └── global-setup.js
│
├── uploads/                        # Fichiers uploadés (runtime)
│   ├── .thumbnails/
│   ├── .avatars/
│   └── .chunks/                    # Morceaux temporaires
│
└── docs/assets/                    # Captures d'écran et logo
```

---

## 5. Configuration & Variables d'environnement

Toutes les variables sont chargées depuis `.env` (via `dotenv`). Le fichier `.env.example` contient le modèle complet.

### Champs obligatoires

| Variable | Description |
|---|---|
| `SESSION_SECRET` | Secret pour le chiffrement des sessions — chaîne aléatoire longue, ex. `openssl rand -hex 32` |
| `MONGO_ROOT_PASSWORD` | Mot de passe root MongoDB (requis uniquement pour Docker Compose) |
| `MONGO_APP_PASSWORD` | Mot de passe de l'utilisateur applicatif MongoDB |

### Toutes les variables d'environnement

| Variable | Par défaut | Description |
|---|---|---|
| `PORT` | `3000` | Port TCP du serveur HTTP |
| `BIND_ADDRESS` | `127.0.0.1` | Adresse de l'hôte sur laquelle Docker publie le port. Derrière un reverse proxy, garder loopback ; `0.0.0.0` uniquement derrière un pare-feu externe ou sans proxy (voir « Cloudflare Tunnel / proxy dans un conteneur ») |
| `TRUST_PROXY` | `1` | Nombre de sauts de proxy de confiance (ex. `2` pour Cloudflare → nginx) ; doit correspondre à votre configuration, sinon IP clientes et limites de débit sont fausses |
| `ENCRYPTION_KEY` | — | Clé de 32 octets (`openssl rand -base64 32`). Si elle est définie, les nouveaux fichiers et miniatures sont stockés chiffrés (voir « Chiffrement au repos »). **Sa perte rend les fichiers chiffrés illisibles** |
| `INSTALL_TOKEN` | _(aléatoire, écrit dans le journal)_ | Jeton requis pour terminer l'installation initiale |
| `MONGODB_URI` | _(construit depuis Docker Compose)_ | URI de connexion MongoDB complète |
| `MONGO_ROOT_PASSWORD` | — | Mot de passe root MongoDB |
| `MONGO_APP_USER` | `appuser` | Nom d'utilisateur applicatif MongoDB |
| `MONGO_APP_PASSWORD` | — | Mot de passe de l'utilisateur applicatif MongoDB |
| `MONGO_DB_NAME` | `sharely` | Nom de la base de données MongoDB |
| `SESSION_SECRET` | — | **Obligatoire** — secret de chiffrement des sessions |
| `BASE_URL` | `http://localhost:3000` | URL de base publique pour les liens de partage générés (sans `/` final) |
| `SITE_NAME` | `sharely` | Nom du site dans les embeds Open Graph |
| `MAX_FILE_SIZE_MB` | `100` | Taille maximale des fichiers pour les uploads standards en Mo (uploads par morceaux jusqu'à 2 Go indépendamment) |
| `ALLOW_REGISTRATION` | `true` | `false` désactive l'inscription publique |
| `SMTP_HOST` | — | Nom d'hôte du serveur SMTP ; laisser vide pour désactiver les fonctionnalités e-mail |
| `SMTP_PORT` | `587` | Port SMTP |
| `SMTP_SECURE` | `false` | `true` pour TLS implicite (port 465), `false` pour STARTTLS |
| `SMTP_USER` | — | Nom d'utilisateur SMTP |
| `SMTP_PASS` | — | Mot de passe SMTP |
| `SMTP_FROM` | _(SMTP_USER)_ | Adresse d'expédition dans les e-mails sortants |
| `UPLOAD_DIR` | `./uploads` | Chemin absolu vers le répertoire d'upload |
| `NODE_ENV` | — | Optionnel. Les cookies sécurisés n'en dépendent pas : ils sont définis automatiquement dès que la requête arrive en HTTPS (`X-Forwarded-Proto` du proxy) |
| `UPDATE_ENABLED` | `false` | Active la mise à jour en un clic dans le panneau d'administration |
| `UPDATE_CHANNEL` | `release` | Détection des mises à jour : `release` (dernier tag de release GitHub) ou `branch` (nouveaux commits sur `UPDATE_BRANCH`) |
| `UPDATE_BRANCH` | `main` | Branche récupérée par l'updater — et utilisée comme référence en mode `branch` |
| `UPDATE_REPO` | `Christianoooooo/sharely` | Dépôt GitHub vérifié pour les nouvelles releases |
| `COMPOSE_PROJECT_NAME` | `sharely` | Nom du projet Compose ; doit être identique sur l'hôte et dans l'updater |

### Mises à jour automatiques

Le panneau d'administration (**Admin → Paramètres du site → Version et mises à jour**) affiche toujours la version installée et indique si une mise à jour est disponible.

**Ce sur quoi repose « mise à jour disponible »** est contrôlé par `UPDATE_CHANNEL` :

- `release` (par défaut) — la version installée est comparée au dernier **tag de release GitHub**. Adapté si une release est créée pour chaque version.
- `branch` — le **commit** installé est comparé à la pointe de `UPDATE_BRANCH`. Une mise à jour est disponible dès que de nouveaux commits se trouvent sur la branche — sans release nécessaire. La version/le commit installé(e) est communiqué(e) par le conteneur de l'updater ; ce mode nécessite donc que l'updater tourne.

En option, une mise à jour peut être installée en un clic. Un conteneur dédié `updater` s'en charge — le **seul** composant ayant accès au socket Docker. L'application web ne touche jamais au socket : elle dépose seulement un fichier de demande dans un volume partagé, puis l'updater exécute `git pull` + `docker compose build app thumbnailer` + `docker compose up -d app thumbnailer`.

> ⚠️ **Note de sécurité :** L'updater monte le socket Docker, ce qui équivaut aux droits root sur l'hôte. Ne l'activer que si ce compromis est accepté en connaissance de cause. Une application web compromise peut tout au plus déclencher une reconstruction depuis la branche configurée — aucune commande arbitraire sur l'hôte. Pour cela, le répertoire de contrôle partagé appartient à `root` et possède le sticky bit (`1777`) : l'application peut seulement créer `update.request` et écrire `update.state`, mais ne peut ni remplacer les fichiers de l'updater ni les échanger contre des liens symboliques.

Prérequis : déploiement depuis un **checkout Git**, `UPDATE_ENABLED=true` dans le `.env`, `COMPOSE_PROJECT_NAME` inchangé, et démarrage incluant l'updater via `docker compose --profile updater up -d --build`. L'updater se trouve derrière le profil Compose `updater` — un simple `docker compose up` ne démarre donc jamais le conteneur privilégié. Pendant l'installation, le conteneur de l'application est reconstruit et brièvement indisponible ; la page affiche la progression et se reconnecte automatiquement. Avec `UPDATE_ENABLED=false` (et sans le profil), le panneau se limite aux notifications.

L'updater reconstruit avec `--no-deps` uniquement les conteneurs de l'application et des miniatures — la base de données n'est jamais recréée avec eux. Il ne **se met pas à jour lui-même** : après des modifications sous `updater/`, il faut exécuter une fois `docker compose --profile updater up -d --build updater`.

---

## 6. Modèles de données

### User (`src/models/User.js`)

```
{
  username:                    String (3–32, unique, alphanumérique + _-)
  password:                    String (bcrypt, 12 tours)
  role:                        'admin' | 'user'
  apiKey:                      String (héritage, vide après migration)
  apiKeyHash:                  String (SHA-256, unique, sparse)
  apiKeyPrefix:                String (8 premiers caractères du texte en clair)
  folderName:                  String (unique, sparse, max 64)
  avatarExt:                   String | null (.jpg/.png/.gif/.webp)
  embedMode:                   'embed' | 'raw'
  isActive:                    Boolean
  sessionVersion:              Number (incrémenté lors d'un changement/d'une réinitialisation du mot de passe, invalide les autres sessions)
  email:                       String (minuscules, unique, sparse)
  emailVerified:               Boolean
  emailVerificationToken:      String | null (hachage SHA-256 du texte en clair)
  emailVerificationExpires:    Date | null
  passwordResetToken:          String | null (hachage SHA-256)
  passwordResetExpires:        Date | null
  language:                    'en'|'de'|'fr'|'es'|'it'|'pt'|'ja'|'zh'
  predefinedTags:              [String] (max 100 tags × 50 caractères)
  createdAt:                   Date
}
```

**Méthodes importantes :**
- `user.comparePassword(candidate)` — comparaison bcrypt
- `user.regenerateApiKey()` — génère un nouveau texte en clair, stocke le hachage, retourne le texte en clair (visible une seule fois)
- `User.findByApiKey(plaintext)` — recherche par hachage SHA-256, utilisateurs actifs uniquement

### File (`src/models/File.js`)

```
{
  shortId:       String (24 caractères hexadécimaux aléatoires, unique)
  deleteToken:   String (32 caractères hexadécimaux, unique ; select: false, jamais dans les réponses de l'API)
  originalName:  String (assaini)
  storedName:    String (chemin relatif : "folderName/8hex.ext")
  mimeType:      String (normalisé en un seul « type/sous-type »)
  encrypted:     Boolean (le fichier est au format de src/utils/fileCrypto.js)
  size:          Number (octets, taille en clair)
  uploader:      ObjectId → User
  views:         Number
  expiresAt:     Date | null (autodestruction à une date donnée)
  maxDownloads:  Number | null (autodestruction après N téléchargements)
  downloadCount: Number
  tags:          [String] (max 20 × 50 caractères)
  description:   String (max 1000)
  createdAt:     Date
}
```

**Propriétés calculées :**
- `sizeHuman` — taille lisible (B / Ko / Mo / Go)
- `displayType` — classification : `image|video|audio|pdf|code|text|file`

**Algorithme Short ID :**
```
shortId = randomBytes(12).hex()   // 24 hex chars; older IDs keep their 8-char format
```

### Collection (`src/models/Collection.js`)

```
{
  shortId:     String (24 Hex, unique)
  name:        String (max 100)
  description: String (max 500)
  owner:       ObjectId → User
  files:       [ObjectId → File]
  password:    String | null (bcrypt)
  expiresAt:   Date | null
  createdAt:   Date
}
```

> Les collections expirées sont automatiquement supprimées par l'index TTL MongoDB 7 jours après leur expiration.

### ShareLink (`src/models/ShareLink.js`)

```
{
  token:         String (32 Hex, unique)
  file:          ObjectId → File
  createdBy:     ObjectId → User
  label:         String (max 100)
  password:      String | null (bcrypt)
  expiresAt:     Date | null
  downloadLimit: Number (-1 = illimité)
  downloadCount: Number
  createdAt:     Date
}
```

> Comme les collections : délai de grâce de 7 jours après expiration via l'index TTL.

### SiteSettings (`src/models/SiteSettings.js`)

Document singleton (`_id: 'singleton'`) :

```
{
  operatorName:        String
  operatorAddress:     String
  operatorEmail:       String
  cloudflareAnalytics: Boolean
  fileRetentionDays:   Number (0 = désactivé)
  encryptionAtRest:    Boolean
  sessionDurationDays: Number (par défaut : 7)
  allowRegistration:   Boolean
}
```

### AuditLog (`src/models/AuditLog.js`)

```
{
  timestamp: Date (index TTL : 90 jours)
  userId:    ObjectId → User | null
  username:  String | null
  action:    String
  ip:        String | null
  meta:      Mixed (métadonnées spécifiques à l'action)
}
```

---

## 7. API REST

### URL de base : `/api`

Tous les endpoints JSON retournent `Content-Type: application/json`. Erreurs : `{ "error": "message" }`.

---

### Installation (`/api/install`)

| Méthode | Chemin | Auth | Description |
|---|---|---|---|
| `GET` | `/status` | — | `{ installed: Boolean }` (si des utilisateurs existent déjà) |
| `POST` | `/setup` | Jeton d'installation | Créer le compte administrateur et les paramètres opérateur ; uniquement tant qu'aucun utilisateur n'existe |

Le jeton d'installation figure dans le journal au démarrage (`[install] Not installed yet. Setup token: …`) ou est défini via `INSTALL_TOKEN`. Sans `setupToken` correspondant dans le corps, `/setup` répond `403`.

---

### Authentification (`/api/auth`)

| Méthode | Chemin | Auth | Description |
|---|---|---|---|
| `GET` | `/me` | Session | Utilisateur connecté |
| `POST` | `/login` | — | Connexion (limité : 10/15min ; attribue un nouvel ID de session) |
| `POST` | `/register` | — | Inscription (limité ; le premier admin est créé uniquement via l'installation) |
| `POST` | `/logout` | — | Déconnexion |
| `GET` | `/smtp-enabled` | — | Vérifie si SMTP est configuré |
| `GET` | `/verify-email?token=` | — | Vérifier l'adresse e-mail |
| `GET` | `/verify-reset-token?token=` | — | Valider le jeton de réinitialisation |
| `POST` | `/forgot-password` | — | Envoyer l'e-mail de réinitialisation du mot de passe (limité : 5/h) |
| `POST` | `/reset-password` | — | Définir un nouveau mot de passe (met fin à toutes les sessions existantes) |

**Requête de connexion :**
```json
POST /api/auth/login
{ "username": "max", "password": "meinPasswort123" }
```

**Réponse de connexion :**
```json
{
  "user": {
    "id": "...", "username": "max", "role": "user",
    "avatarUrl": null, "email": "max@example.com",
    "emailVerified": true, "language": "de"
  }
}
```

---

### Upload de fichiers

| Méthode | Chemin | Auth | Description |
|---|---|---|---|
| `POST` | `/upload` | Clé API | Upload ShareX (endpoint héritage dans `app.js`) |
| `POST` | `/api/upload` | Clé API | Upload ShareX/API (champ : `file`) |
| `POST` | `/api/web-upload` | Session | Upload web (champ : `files[]`, max 500) |
| `POST` | `/api/chunk/init` | Session | Initialiser un upload par morceaux |
| `POST` | `/api/chunk/:uploadId` | Session | Uploader un morceau (champ : `chunk`) |
| `POST` | `/api/chunk/:uploadId/complete` | Session | Assembler les morceaux |
| `DELETE` | `/api/chunk/:uploadId` | Session | Annuler l'upload et nettoyer |

**Réponse d'upload API :**
```json
{
  "url": "https://example.com/f/a1b2c3d4",
  "raw": "https://example.com/f/a1b2c3d4/raw",
  "delete_url": "https://example.com/api/delete/a1b2c3d4",
  "short_id": "a1b2c3d4",
  "filename": "screenshot.png",
  "size": 102400
}
```

#### Flux d'upload par morceaux

1. `POST /api/chunk/init` → `{ uploadId: "32hex" }`  
   Vérification du quota par rapport à `totalSize` plus les tailles annoncées de tous les uploads par morceaux en cours de l'utilisateur
2. `POST /api/chunk/:uploadId` (Corps : `chunkIndex=N`, Fichier : `chunk`) → `{ received: N }`  
   En parallèle avec 3 à 5 morceaux simultanés ; `413` dès que les octets reçus dépassent `totalSize`
3. `POST /api/chunk/:uploadId/complete` → `{ files: [fileObject] }`  
   `400` si le fichier assemblé ne fait pas exactement `totalSize`

---

### Gestion des fichiers

| Méthode | Chemin | Auth | Description |
|---|---|---|---|
| `GET` | `/api/gallery` | Session | Propres fichiers (admin : tous), paginé (24/page), filtres : `q`, `type`, `tag`, `page` |
| `GET` | `/api/file/:shortId` | — | Métadonnées du fichier sans `deleteToken` (incrémente le compteur de vues) |
| `PATCH` | `/api/file/:shortId` | Session | Mettre à jour les tags/le nom |
| `DELETE` | `/api/file/:shortId` | Session | Supprimer un fichier |
| `DELETE` | `/api/delete/:shortId` | Clé API | Supprimer un fichier (authentification par clé API) |
| `POST` | `/api/files/bulk` | Session | Actions en masse : `delete`, `tag`, `removeTag`, `addToCollection`, `moveToCollection` |
| `GET` | `/api/tags` | Session | Toutes les suggestions de tags de l'utilisateur |

**Paramètres de requête de la galerie :**
- `q` — recherche dans le nom de fichier (sécurisé contre les regex)
- `type` — `all|image|video|audio|pdf|code`
- `tag` — filtre de tag exact
- `page` — numéro de page (par défaut : 1)

---

### Paramètres utilisateur

| Méthode | Chemin | Auth | Description |
|---|---|---|---|
| `GET` | `/api/my-key` | Session | Afficher le préfixe de la clé API |
| `POST` | `/api/regen-key` | Session | Régénérer la clé API |
| `GET` | `/api/sharex-config` | Session | Télécharger le fichier ShareX `.sxcu` (régénère la clé) |
| `PATCH` | `/api/user/username` | Session | Changer le nom d'utilisateur (mot de passe requis) |
| `PATCH` | `/api/user/password` | Session | Changer le mot de passe |
| `PATCH` | `/api/user/email` | Session | Changer l'e-mail (envoie un e-mail de confirmation) |
| `PATCH` | `/api/user/language` | Session | Définir la langue de l'interface |
| `PATCH` | `/api/user/embed-mode` | Session | Définir le mode d'intégration (`embed`/`raw`) |
| `POST` | `/api/user/resend-verification` | Session | Renvoyer l'e-mail de vérification |
| `GET` | `/api/user/export` | Session | Export des données (RGPD Art. 20) en JSON |
| `DELETE` | `/api/user/account` | Session | Supprimer le compte (RGPD Art. 17, mot de passe requis) |
| `GET` | `/api/user/predefined-tags` | Session | Récupérer les tags prédéfinis |
| `PATCH` | `/api/user/predefined-tags` | Session | Mettre à jour les tags prédéfinis |
| `POST` | `/api/user/avatar` | Session | Uploader un avatar (max 2 Mo, JPEG/PNG/GIF/WebP) |
| `DELETE` | `/api/user/avatar` | Session | Supprimer l'avatar |
| `GET` | `/api/user/avatar/:userId` | — | Servir l'avatar |

Le nom d'utilisateur, le mot de passe, l'e-mail, l'e-mail de vérification et la suppression du compte sont limités à 10 tentatives en 15 minutes par utilisateur (contre la devinette de mot de passe avec une session volée et le spam d'e-mails). Un changement de mot de passe met fin à toutes les autres sessions de l'utilisateur ; la session actuelle reste connectée.

---

### Liens de partage

| Méthode | Chemin | Auth | Description |
|---|---|---|---|
| `GET` | `/api/file/:shortId/share-links` | Session (Propriétaire/Admin) | Tous les liens de partage d'un fichier |
| `POST` | `/api/file/:shortId/share-links` | Session (Propriétaire/Admin) | Créer un lien de partage |
| `DELETE` | `/api/share-links/:token` | Session (Propriétaire/Créateur/Admin) | Supprimer un lien de partage |
| `GET` | `/api/share-links/:token` | — | Métadonnées du lien de partage (public ; sans le `shortId` du fichier, afin que mot de passe, expiration et limite ne puissent pas être contournés via `/f/`) |
| `POST` | `/api/share-links/:token/verify` | — | Vérifier le mot de passe du lien de partage (max. 10 tentatives échouées par IP en 15 minutes) |

**Créer un lien de partage :**
```json
POST /api/file/a1b2c3d4/share-links
{
  "label": "Pour les collègues",
  "password": "secret",
  "expiresAt": "2025-12-31T23:59:59Z",
  "downloadLimit": 10
}
```

---

### Collections

| Méthode | Chemin | Auth | Description |
|---|---|---|---|
| `GET` | `/api/collections` | Session | Propres collections (admin : toutes) |
| `POST` | `/api/collections` | Session | Créer une collection |
| `GET` | `/api/collections/:id` | — | Afficher une collection (publique, mot de passe si défini) |
| `PATCH` | `/api/collections/:id` | Session (Propriétaire/Admin) | Mettre à jour une collection |
| `DELETE` | `/api/collections/:id` | Session (Propriétaire/Admin) | Supprimer une collection |
| `POST` | `/api/collections/:id/files` | Session (Propriétaire/Admin) | Ajouter un fichier à la collection |
| `DELETE` | `/api/collections/:id/files/:fileShortId` | Session (Propriétaire/Admin) | Retirer un fichier de la collection |
| `POST` | `/api/collections/:id/verify` | — | Vérifier le mot de passe de la collection (max. 10 tentatives échouées par IP en 15 minutes) |

---

### Endpoints d'administration

| Méthode | Chemin | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/stats` | Admin | Statistiques du tableau de bord |
| `GET` | `/api/admin/users` | Admin | Tous les utilisateurs (avec nombre de fichiers) |
| `POST` | `/api/admin/users` | Admin | Créer un utilisateur |
| `PATCH` | `/api/admin/users/:id/toggle` | Admin | Activer/désactiver un utilisateur |
| `PATCH` | `/api/admin/users/:id/role` | Admin | Changer le rôle d'un utilisateur (effet immédiat, y compris sur les sessions ouvertes) |
| `DELETE` | `/api/admin/users/:id` | Admin | Supprimer un utilisateur et toutes ses données |
| `POST` | `/api/admin/users/:id/regen-key` | Admin | Régénérer la clé API |
| `PATCH` | `/api/admin/users/:id/password` | Admin | Définir un mot de passe (met fin à toutes les sessions de l'utilisateur) |
| `PATCH` | `/api/admin/users/:id/folder` | Admin | Changer le nom du dossier (déplace les fichiers) |
| `GET` | `/api/admin/files` | Admin | Tous les fichiers, paginé (30/page) |
| `GET` | `/api/admin/site-settings` | Admin | Lire les paramètres opérateur |
| `PATCH` | `/api/admin/site-settings` | Admin | Mettre à jour les paramètres opérateur |
| `GET` | `/api/admin/audit-log` | Admin | Journal d'audit paginé (50/page) |
| `GET` | `/api/admin/audit-log/export` | Admin | Télécharger le journal d'audit en CSV |
| `GET` | `/api/site-settings` | — | Informations publiques de l'opérateur (pour la page de confidentialité) |

---

### Paramètres du site (publics)

```json
GET /api/site-settings
{
  "operatorName": "Musterfirma GmbH",
  "operatorAddress": "Musterstr. 1, 12345 Musterstadt",
  "operatorEmail": "datenschutz@example.com",
  "cloudflareAnalytics": false,
  "fileRetentionDays": 365,
  "encryptionAtRest": false,
  "sessionDurationDays": 7
}
```

---

## 8. API WebSocket

**Connexion :** `wss://example.com/ws` (utilisateurs connectés uniquement, cookie de session requis)

### Sécurisation

- **Vérification de l'origine :** la poignée de main est refusée avec `403` si l'en-tête `Origin` ne correspond pas à `Host` (même règle que `requireSameOrigin` pour l'API HTTP). Le proxy doit transmettre le `Host` d'origine.
- **Vérification continue des droits :** la session, le statut actif, le rôle et `sessionVersion` sont revérifiés à chaque message et, en plus, toutes les 30 secondes pour toutes les connexions. Après une déconnexion, une désactivation, une suppression, un changement de mot de passe ou une rétrogradation, la connexion est fermée ou perd ses droits admin et les diffusions admin.
- **Heartbeat :** ping toutes les 30 secondes ; les connexions sans pong sont coupées.
- **Limites :** 64 Kio maximum par message (les messages plus grands ferment la connexion avec le code `1009`), jusqu'à 30 messages d'affilée puis 5 par seconde et par connexion (sinon réponse avec `status: 429`), 20 connexions simultanées maximum par IP client. Les actions qui vérifient le mot de passe ou envoient des e-mails sont limitées à 10 en 15 minutes par utilisateur.

### Protocole

**Client → Serveur (Requête) :**
```json
{ "id": "req-abc123", "action": "file:list", "payload": { "type": "image", "page": 1 } }
```

**Serveur → Client (Réponse) :**
```json
{ "id": "req-abc123", "data": { ... } }
```

**Serveur → Client (Erreur) :**
```json
{ "id": "req-abc123", "error": "Forbidden", "status": 403 }
```

**Serveur → Client (Diffusion) :**
```json
{ "event": "file:uploaded", "data": { "shortId": "a1b2c3d4", "uploaderId": "..." } }
```

### Actions disponibles

| Action | Auth | Description |
|---|---|---|
| `site-settings:get` | — | Paramètres publics du site |
| `auth:me` | Utilisateur | Données de l'utilisateur connecté |
| `file:get` | Utilisateur | Détails du fichier (incrémente les vues) |
| `file:list` | Utilisateur | Liste des fichiers avec filtre/pagination |
| `file:delete` | Utilisateur | Supprimer un fichier |
| `user:get-key` | Utilisateur | Préfixe de la clé API |
| `user:regen-key` | Utilisateur | Régénérer la clé API |
| `user:change-password` | Utilisateur | Changer le mot de passe |
| `user:change-username` | Utilisateur | Changer le nom d'utilisateur |
| `user:change-email` | Utilisateur | Changer l'e-mail |
| `user:change-language` | Utilisateur | Définir la langue |
| `user:change-embed-mode` | Utilisateur | Définir le mode d'intégration |
| `user:resend-verification` | Utilisateur | Renvoyer l'e-mail de vérification |
| `user:export` | Utilisateur | Export des données |
| `user:delete-account` | Utilisateur | Supprimer le compte |
| `admin:stats` | Admin | Statistiques du tableau de bord |
| `admin:settings:get` | Admin | Lire les paramètres du site |
| `admin:settings:update` | Admin | Mettre à jour les paramètres du site |
| `admin:users:list` | Admin | Tous les utilisateurs |
| `admin:users:create` | Admin | Créer un utilisateur |
| `admin:users:toggle` | Admin | Activer/désactiver un utilisateur |
| `admin:users:role` | Admin | Changer le rôle d'un utilisateur |
| `admin:users:delete` | Admin | Supprimer un utilisateur |
| `admin:users:regen-key` | Admin | Régénérer la clé API |
| `admin:users:password` | Admin | Définir un mot de passe |
| `admin:users:folder` | Admin | Changer le nom du dossier |
| `admin:files:list` | Admin | Tous les fichiers |
| `admin:audit-log:list` | Admin | Journal d'audit paginé |

### Événements de diffusion

| Événement | Destinataires | Charge utile |
|---|---|---|
| `file:uploaded` | Uploadeur | `{ shortId, uploaderId }` |
| `file:deleted` | Propriétaire du fichier | `{ shortId, uploaderId }` |
| `file:view` | Propriétaire du fichier + admins | `{ shortId, views }` |
| `user:created` | Admins | `{ id, username, role, ... }` |
| `user:deleted` | Admins | `{ id }` |
| `user:updated` | Admins | `{ id, ...champs modifiés }` |
| `audit:log` | Admins | Objet AuditLog complet |
| `settings:updated` | Admins | Objet SiteSettings mis à jour |
| `stats:invalidate` | Admins | `{}` (déclenche le rafraîchissement des stats) |

---

## 9. Routes de service des fichiers

### `/f/:shortId` — Visionneuse de fichiers

- **Requête navigateur :** Redirige vers la React SPA (`index.html`) — la SPA affiche la visionneuse.
- **Bot de réseau social** (Discord, Telegram, Twitter, etc.) : Retourne une page HTML minimale avec des balises méta Open Graph / Twitter Card.
  - `embedMode = 'embed'` : HTML OG avec redirection
  - `embedMode = 'raw'` + image/vidéo/audio : HTTP 302 → `/f/:shortId/raw`

### `/f/:shortId/raw` — Accès direct

Sert le fichier comme réponse HTTP avec support des requêtes de plage (206 Partial Content, y compris les plages suffixes comme `bytes=-500`). Les fichiers chiffrés sont déchiffrés à la volée.

Une liste blanche (`src/utils/mime.js`) basée sur le type MIME normalisé décide quels fichiers sont affichés directement dans le navigateur :

| Cas | `Content-Type` | `Content-Disposition` | En plus |
|---|---|---|---|
| Images (PNG, JPEG, GIF, WebP, AVIF, BMP, ICO), formats vidéo/audio courants, PDF | type réel | `inline` | — |
| Texte et code (selon `displayType`) | `text/plain; charset=utf-8` | `inline` | `CSP: sandbox` |
| HTML, SVG, XML et tout le reste | `application/octet-stream` | `attachment` | `CSP: sandbox` |

Ainsi, un fichier uploadé ne peut ni être rendu comme page dans l'origine de l'application, ni être inclus comme script.

Si le fichier a une limite de téléchargement (`maxDownloads`), `/raw` ne compte que les accès complets (sans `Range` ou à partir de l'octet 0), et ce une fois par session de visiteur : l'aperçu puis le téléchargement par le même visiteur consomment ensemble un seul téléchargement. Les accès du propriétaire et des admins ne comptent jamais. Une fois la limite atteinte, la route répond `410`.

### `/f/:shortId/download` — Téléchargement forcé

Comme `/raw`, mais toujours `Content-Disposition: attachment` et `application/octet-stream`. Chaque nouveau visiteur compte dans `maxDownloads`.

### `/f/:shortId/thumb` — Miniature

Retourne la miniature JPEG (pour les vidéos et les PDF), déchiffrée si le chiffrement est activé. `Cache-Control: public, max-age=86400`. L'ID doit être composé de `[A-Za-z0-9_-]` (protection contre la traversée de chemin via `%2F`).

### `/f/:shortId/delete/:token` — Suppression ShareX

Supprime le fichier sans session via un jeton de suppression unique. Le jeton n'est renvoyé qu'à l'upload et n'apparaît dans aucune autre réponse de l'API.

### `/s/:token` — Service de fichiers via lien de partage (`src/routes/shares.js`)

Vérifie le mot de passe (via flag de session), la date d'expiration et la limite de téléchargement, puis sert le fichier.

### Protection contre l'énumération des ID

Tous les accès publics par ID ou jeton (`/f/*`, `/s/*`, `/api/file/:shortId`, `/api/share-links/:token`, `/api/collections/:id`, pastes) partagent une limite de débit : 100 accès échoués maximum (404/410/401 …) par IP en 15 minutes. Les accès réussis ne comptent pas. Les anciens ID de fichier à 8 caractères restent valides, mais sont plus courts et donc plus faciles à deviner que les nouveaux.

---

## 10. Authentification & Sécurité

### Authentification par session

- Session Express avec stockage MongoDB (`connect-mongo`)
- Cookie de session : `httpOnly: true`, `sameSite: 'strict'`, `secure: 'auto'` (défini dès que la requête arrive en HTTPS ; derrière un proxy via `X-Forwarded-Proto` et `TRUST_PROXY`)
- Durée de session : configurable via `SiteSettings.sessionDurationDays` (par défaut : 7 jours), mis en cache en direct pendant 60 secondes
- La connexion, l'inscription et l'installation attribuent un nouvel ID de session (`establishSession`, protection contre la fixation de session)
- À chaque requête, le rôle, le statut actif et la `sessionVersion` de l'utilisateur sont lus depuis la base de données : les comptes supprimés ou désactivés et les sessions antérieures à un changement de mot de passe perdent immédiatement leur connexion, les changements de rôle s'appliquent immédiatement

### Authentification par clé API

- Les clés API sont stockées sous forme de hachages SHA-256, jamais en texte clair
- Les 8 premiers caractères sont stockés comme `apiKeyPrefix` (à des fins d'affichage)
- Recherche : `User.findByApiKey(plaintext)` calcule le hachage et le cherche dans `apiKeyHash`
- Lors du téléchargement de la configuration ShareX, la clé est régénérée — le texte en clair n'est visible qu'à ce moment-là

### Chaîne de middleware (`src/middleware/auth.js`)

```
requireLogin    → vérifie req.session.user → 401 si non connecté
requireAdmin    → comme requireLogin, de plus role === 'admin' → 403
requireApiKey   → vérifie Authorization: Bearer, X-API-Key, ?api_key= ou req.body.token
```

Tous les routeurs sont créés via `asyncRouter()` : les erreurs dans les gestionnaires `async` aboutissent au gestionnaire d'erreurs central (`500`) au lieu de laisser la requête en suspens. Une `uncaughtException` termine le processus, Docker le redémarre (`restart: unless-stopped`).

### Protection CSRF

`requireSameOrigin()` dans `app.js` compare l'en-tête `Origin` avec l'en-tête `Host` pour toutes les routes API. Complète les cookies `sameSite: 'strict'`.

### Politique de sécurité du contenu

```
default-src 'self';
script-src 'self' https://static.cloudflareinsights.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
media-src 'self' blob:;
connect-src 'self' https://cloudflareinsights.com;
frame-ancestors 'self';
base-uri 'none';
form-action 'self';
object-src 'none';
```

### En-têtes de sécurité

- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (uniquement pour les requêtes HTTPS)
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin` (les URL de fichiers, de pastes et de partage ne sont pas transmises aux sites tiers via le Referer)
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`

### Limitation de débit

| Endpoint | Limite | Fenêtre | Clé |
|---|---|---|---|
| Upload (`/upload`, `/api/upload`, `/api/web-upload`) | 60 requêtes | 15 minutes | IP |
| Auth (`/api/auth/login`, `/register`, etc.) | 10 requêtes | 15 minutes | IP |
| Réinitialisation du mot de passe | 5 requêtes | 1 heure | IP |
| Vérification du mot de passe des liens de partage, collections, pastes | 10 tentatives échouées | 15 minutes | IP |
| Actions sur le compte (nom, mot de passe, e-mail, e-mail de vérification, suppression) | 10 requêtes | 15 minutes | Utilisateur |
| Accès par ID/jeton échoués (voir chapitre 9) | 100 requêtes | 15 minutes | IP |
| WebSocket | voir chapitre 8 | — | Connexion / IP / utilisateur |

L'IP client dépend de `TRUST_PROXY` ; le port de l'application doit donc être accessible uniquement via le reverse proxy (`BIND_ADDRESS`), sinon `X-Forwarded-For` peut être falsifié.

### Journalisation

Le journal d'accès (stdout → journal Docker) contient des adresses IP tronquées (IPv4 en `/24`, IPv6 en `/48`). Les clés API (`api_key=`), les jetons dans les paramètres de requête (`token=`), les jetons de suppression et les jetons de partage sont masqués. Le journal d'audit enregistre l'IP complète et est supprimé automatiquement après 90 jours.

### Liste de blocage des fichiers

Les types MIME et extensions suivants sont rejetés à l'upload :

**Types MIME bloqués :** `application/x-executable`, `application/x-sh`, `application/x-csh`, `application/x-bat`

**Extensions bloquées :** `.bat`, `.cmd`, `.com`, `.ps1`, `.psm1`, `.psd1`, `.sh`, `.bash`, `.csh`, `.zsh`, `.fish`, `.vbs`, `.vbe`, `.jse`, `.scr`, `.pif`, `.application`, `.gadget`, `.hta`, `.php`, `.php3–5`, `.phtml`, `.asp`, `.aspx`, `.jsp`, `.jspx`, `.cfm`

### Protection contre la traversée de chemin

Tous les accès aux fichiers via `resolveUploadPath()` vérifient que le chemin résolu se trouve bien dans `UPLOAD_DIR`. Les ID de miniature sont en outre vérifiés par rapport à `[A-Za-z0-9_-]`.

---

## 11. Système d'upload

### Upload standard (Multer)

- **Stockage :** `multer.diskStorage` → `uploads/{folderName}/{8hex}{.ext}`
- **Nom de fichier :** `crypto.randomBytes(4).hex() + extension-originale`
- **Limite :** `MAX_FILE_SIZE_MB` (par défaut : 100 Mo)
- **Emplacement :** Dossier spécifique à l'utilisateur (`user.folderName`)
- **Type MIME :** réduit par `normalizeMime()` à un seul `type/sous-type` (les paramètres et les types supplémentaires séparés par des virgules sont supprimés, les valeurs invalides deviennent `application/octet-stream`)
- **Chiffrement :** avec `ENCRYPTION_KEY`, `sealUpload()` chiffre le fichier sur place ; une copie en clair (`<fichier>.plain-<hex>`) ne subsiste que jusqu'à la génération de la miniature
- **Endpoint ShareX `/upload` :** Multer écrit le fichier avant la vérification de la clé API ; si la requête est rejetée, il est supprimé immédiatement

### Upload par morceaux (>250 Mo)

Le client frontend bascule automatiquement en mode morceaux pour les fichiers volumineux.

**Structure de répertoires côté serveur :**
```
uploads/.chunks/{uploadId}/
  meta.json          { filename, mimeType, totalSize, totalChunks, userId, createdAt }
  chunk-0
  chunk-1
  ...
  chunk-N
```

**Taille des morceaux :** 10–20 Mo (max 51 Mo accepté pour la compatibilité descendante)  
**Parallélisme :** 3–5 uploads de morceaux simultanés  
**Assemblage :** Basé sur les flux (pas de chargement complet en RAM)  
**Vérification de taille :** les octets reçus ne doivent pas dépasser `totalSize` ; le fichier final doit faire exactement `totalSize`  
**Nettoyage :** les répertoires d'upload non terminés sont supprimés après 24 heures par la tâche de rétention

### Upload d'avatar

- **Stockage :** `multer.memoryStorage()` (pas de tampon disque)
- **Emplacement :** `uploads/.avatars/{userId}{.ext}`
- **Limite :** 2 Mo
- **Formats :** JPEG, PNG, GIF, WebP

---

## 12. Génération de miniatures

Les miniatures sont générées de manière asynchrone après l'upload (`startThumbnail()` — les erreurs sont ignorées silencieusement). Avec Docker Compose, ffmpeg et Ghostscript ne tournent pas dans le conteneur de l'application, mais dans un conteneur dédié `thumbnailer` : sans réseau, sans secrets, sous l'utilisateur `nobody`, avec un système de fichiers en lecture seule et sans accès à `uploads/`. L'application copie chaque fichier source dans le volume partagé `thumbjobs` (`in/`), le worker (`src/thumbnailWorker.js`) dépose le résultat dans `out/`, et l'application ne l'accepte que comme fichier régulier de 2 Mo maximum (pas de liens symboliques). Si le conteneur ne tourne pas, les miniatures sont ignorées et l'application journalise un avertissement une seule fois. Sans `THUMBNAIL_WORKER_DIR` (développement local), les outils s'exécutent directement dans l'application, avec un environnement vide (seulement `PATH`).

Si `ENCRYPTION_KEY` est défini, la miniature est générée à partir de la copie en clair, puis chiffrée, et la copie est supprimée. Si la génération échoue, une éventuelle miniature à moitié écrite est supprimée.

### Miniatures vidéo (ffmpeg)

```bash
ffmpeg -y -i <file> -ss 00:00:01 -vframes 1 \
  -vf "scale=320:320:force_original_aspect_ratio=increase,crop=320:320" \
  -q:v 3 uploads/.thumbnails/<shortId>.jpg
```

### Miniatures PDF (Ghostscript)

```bash
gs -dNOPAUSE -dBATCH -dSAFER \
  -sDEVICE=jpeg -dFirstPage=1 -dLastPage=1 \
  -r72 -dJPEGQ=85 \
  -sOutputFile=uploads/.thumbnails/<shortId>.jpg \
  <file>
```

**Délai d'expiration :** 30 secondes par génération de miniature  
**Repli :** Si ffmpeg/ghostscript n'est pas disponible, la génération est ignorée silencieusement.

### Script de remplissage

```bash
npm run migrate:thumbnails
# ou dans le conteneur :
docker exec -it <container> npm run migrate:thumbnails
```

Pour les fichiers chiffrés, le script déchiffre brièvement la source dans un fichier temporaire et chiffre la miniature générée.

---

## 13. E-mail & SMTP

### Configuration

SMTP est activé lorsque `SMTP_HOST` est défini. `mailer.isConfigured()` vérifie cette valeur.

### Modèles d'e-mail

Tous les e-mails sont envoyés dans la langue de l'utilisateur (8 langues). Les modèles sont intégrés dans `src/utils/mailer.js`.

**Types d'e-mails envoyés :**

| Type | Déclencheur | Validité du jeton |
|---|---|---|
| Vérification d'e-mail | Inscription, changement d'e-mail | 24 heures |
| Réinitialisation du mot de passe | `POST /api/auth/forgot-password` | 1 heure |

### Sécurité des jetons

- Jetons : `crypto.randomBytes(32).hex()` (64 caractères hexadécimaux)
- Stockés : hachage SHA-256 du jeton
- L'e-mail contient le jeton en texte clair comme paramètre URL
- Vérification : hachage du jeton entrant comparé au hachage stocké

---

## 14. Internationalisation

**Bibliothèque :** i18next + react-i18next + i18next-browser-languagedetector

**Langues prises en charge :**

| Code | Langue |
|---|---|
| `en` | English |
| `de` | Deutsch |
| `fr` | Français |
| `es` | Español |
| `it` | Italiano |
| `pt` | Português |
| `ja` | 日本語 |
| `zh` | 中文 |

**Sélection de la langue :**
1. Détection de la langue du navigateur (automatique)
2. Préférence de l'utilisateur en base de données (`user.language`)
3. Persistance via `PATCH /api/user/language`

Fichiers de traduction : `client/src/i18n/locales/{code}.json`

---

## 15. Frontend (React SPA)

### Configuration du routeur (`client/src/App.jsx`)

| Route | Composant | Auth |
|---|---|---|
| `/` | Redirection → `/gallery` | Non |
| `/auth/login` | Login.jsx | Non |
| `/auth/register` | Register.jsx | Non |
| `/auth/forgot-password` | ForgotPassword.jsx | Non |
| `/auth/reset-password` | ResetPassword.jsx | Non |
| `/install` | Install.jsx | Non |
| `/upload` | Upload.jsx | **Oui** |
| `/gallery` | Gallery.jsx | **Oui** |
| `/f/:shortId` | FileView.jsx | **Oui** |
| `/collections` | Collections.jsx | **Oui** |
| `/c/:id` | CollectionView.jsx | Non (public) |
| `/s/:token` | ShareView.jsx | Non (public) |
| `/settings` | Settings.jsx | **Oui** |
| `/admin` | Dashboard.jsx | **Admin** |
| `/admin/users` | Users.jsx | **Admin** |
| `/admin/files` | Files.jsx | **Admin** |
| `/admin/audit-log` | AuditLog.jsx | **Admin** |
| `/admin/site-settings` | SiteSettings.jsx | **Admin** |
| `/admin/import` | Import.jsx | **Admin** |
| `/privacy` | PrivacyPolicy.jsx | Non |
| `/terms` | TermsOfService.jsx | Non |

### Contexte d'authentification (`client/src/context/AuthContext.jsx`)

État global pour l'utilisateur connecté. Initialisé au démarrage de l'application via `GET /api/auth/me`.

### Hook WebSocket (`client/src/hooks/useWebSocket.js`)

Gère la connexion WS persistante. Fournit `sendMessage()` et l'enregistrement des gestionnaires d'événements. Logique de reconnexion en cas de déconnexion.

### Composants UI

Basé sur **shadcn/ui** (Radix UI Primitives + Tailwind CSS) :

- `Dialog`, `AlertDialog`, `DropdownMenu`, `ContextMenu`, `Popover`
- `Select`, `Checkbox`, `Input`, `Textarea`, `Label`
- `Card`, `Badge`, `Button`, `Separator`, `Tabs`, `Table`
- `Toast` / `Toaster` pour les notifications
- `Calendar` / `DateTimePicker` pour la sélection de date d'expiration
- `Pagination` pour les listes paginées
- `ScrollArea`, `Tooltip`

---

## 16. Tableau de bord administrateur

Le tableau de bord administrateur (`/admin/*`) est accessible uniquement aux utilisateurs avec `role: 'admin'`.

### Tableau de bord (`/admin`)

- Nombre total d'utilisateurs, de fichiers, espace de stockage utilisé
- 10 derniers fichiers uploadés
- Mises à jour en direct via WebSocket (`stats:invalidate`)

### Gestion des utilisateurs (`/admin/users`)

- Tous les utilisateurs avec nombre de fichiers et utilisation du stockage
- Créer des utilisateurs, activer/désactiver, changer de rôle (la désactivation et la rétrogradation prennent effet immédiatement, y compris sur les sessions ouvertes et les connexions WebSocket)
- Réinitialiser le mot de passe (déconnecte l'utilisateur partout), régénérer la clé API
- Changer le nom du dossier (les fichiers physiques sont déplacés sur le serveur)
- Supprimer un utilisateur (toutes les données comme pour l'auto-suppression, voir chapitre 17)

### Gestion des fichiers (`/admin/files`)

- Tous les fichiers de tous les utilisateurs, paginé
- Recherche par nom de fichier
- Supprimer un fichier

### Journal d'audit (`/admin/audit-log`)

- Journal paginé de toutes les actions (50/page)
- Filtrer par nom d'utilisateur et action
- Export CSV à des fins réglementaires

### Paramètres du site (`/admin/site-settings`)

- Informations de l'opérateur (nom, adresse, e-mail)
- Activer Cloudflare Analytics
- Période de rétention des fichiers
- Durée des sessions
- Activer/désactiver les inscriptions

### Import XBackBone (`/admin/import`)

- Aperçu et import depuis une base de données SQLite XBackBone
- Les utilisateurs sont associés par nom d'utilisateur
- Idempotent (les fichiers déjà importés sont ignorés)

---

## 17. RGPD / Confidentialité

| Fonctionnalité | Article RGPD |
|---|---|
| Politique de confidentialité (configurable) | Art. 13/14 – Transparence |
| Page des conditions d'utilisation (configurable) | Art. 13/14 – Transparence |
| Export des données (JSON avec URLs) | Art. 20 – Portabilité des données |
| Suppression du compte (fichiers, pastes, collections, liens de partage, avatar) | Art. 17 – Droit à l'effacement |
| Journal d'audit (TTL 90 jours via MongoDB) | Art. 5(2) – Responsabilité |
| Export CSV du journal d'audit | Art. 5(2) – Responsabilité |
| Rétention des fichiers configurable | Art. 5(1)(e) – Limitation de la conservation |
| Clés API sous forme de hachage SHA-256 | Art. 32 – Sécurité |
| Mots de passe en bcrypt (12 tours) | Art. 32 – Sécurité |
| Consentement aux cookies pour Cloudflare Analytics | Art. 13 – Transparence |
| Anonymisation lors de la suppression du compte | Art. 17 – Droit à l'effacement |
| Chiffrement optionnel des fichiers stockés (`ENCRYPTION_KEY`) | Art. 32 – Sécurité |
| Adresses IP tronquées et jetons masqués dans le journal d'accès | Art. 5(1)(c) – Minimisation des données |

### Flux de suppression RGPD

Lors de la suppression du compte (`user:delete-account` / `DELETE /api/user/account`) et lors de la suppression par un admin (`admin:users:delete` / `DELETE /api/admin/users/:id`), le même processus s'exécute (`src/utils/deleteUserData.js`) :
1. Tous les fichiers de l'utilisateur sont supprimés du disque
2. Les miniatures sont supprimées
3. Les liens de partage de l'utilisateur et ceux pointant vers ses fichiers sont supprimés
4. Les pastes et collections de l'utilisateur sont supprimés ; ses fichiers sont également retirés des collections des autres utilisateurs
5. L'avatar est supprimé
6. Les entrées du journal d'audit sont anonymisées (`username: '[deleted]'`, `ip: null`, `userId: null`)
7. Le document utilisateur est supprimé
8. En cas d'auto-suppression : la session est détruite ; les sessions ouvertes et les connexions WebSocket perdent leur connexion à la requête suivante

L'entrée d'audit de la suppression elle-même est conservée comme preuve et est supprimée automatiquement après 90 jours.

---

## 18. Tâches en arrière-plan

### Nettoyage par rétention (`src/jobs/retentionCleanup.js`)

- **Exécution :** Au démarrage puis quotidiennement (`setInterval(runRetentionCleanup, 24h)`)
- **Action :** Si `SiteSettings.fileRetentionDays > 0`, les fichiers plus anciens que cette valeur sont supprimés ; de même, les fichiers autodestructeurs après `expiresAt` ou une fois `maxDownloads` atteint
- Supprime : fichier sur disque, miniature, document MongoDB
- Nettoie : les uploads par morceaux non terminés de plus de 24 heures ainsi que les copies en clair abandonnées d'uploads chiffrés (`*.plain-*`) de plus d'1 heure
- Diffuse `stats:invalidate` aux admins

### Index TTL MongoDB (automatiques)

| Collection | TTL | Déclencheur |
|---|---|---|
| `AuditLog` | 90 jours | `timestamp` |
| `Collection` | 7 jours après `expiresAt` | `expiresAt` |
| `ShareLink` | 7 jours après `expiresAt` | `expiresAt` |

---

## 19. Déploiement

### Docker (recommandé)

```bash
git clone https://github.com/Christianoooooo/sharely.git
cd sharely
cp .env.example .env
# Éditer .env (SESSION_SECRET, mots de passe MONGO, BASE_URL)
docker compose up -d
```

**Services :**
- `app` — Application Node.js (port 3000, publié par défaut uniquement sur `127.0.0.1`, voir `BIND_ADDRESS`)
- `mongo` — MongoDB 7 (port 127.0.0.1:27017, non accessible de l'extérieur)
- `updater` — auto-updater optionnel (uniquement avec le profil `updater`)

**Volumes :**
- `uploads` — stockage de fichiers persistant
- `mongo_data` — données MongoDB
- `control` — échange entre l'application et l'updater

**Vérifications de santé :** L'application vérifie HTTP 200 sur `/`, MongoDB vérifie `db.adminCommand('ping')`.

### Proxy inverse Nginx

```nginx
server {
    listen 443 ssl;
    server_name files.example.com;

    client_max_body_size 2100M;  # Au moins aussi grand que le plus grand morceau + tampon

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Support WebSocket
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

> `BASE_URL` dans `.env` doit correspondre au domaine public.

### Cloudflare Tunnel / proxy dans un conteneur

Par défaut, Docker publie le port de l'application uniquement sur `127.0.0.1` (`BIND_ADDRESS`). Un proxy exécuté directement sur l'hôte, comme l'exemple nginx ci-dessus, y accède. Un proxy ou `cloudflared` dans son propre conteneur n'y accède pas et répond **502 Bad Gateway**.

- **Recommandé :** connecter le conteneur du proxy au réseau Docker de sharely (`<projet>_default`, par défaut `sharely_default`) et le faire pointer vers `http://app:3000`. Aucun port n'a alors besoin d'être publié :
  ```bash
  docker network connect sharely_default <cloudflared-or-proxy-container>
  ```
  Pour que cela survive aux redémarrages, déclarez le réseau comme `external` dans le fichier compose du proxy.
- **Avec un pare-feu externe** qui bloque le port 3000 depuis Internet (p. ex. Hetzner Cloud Firewall) : définir `BIND_ADDRESS=0.0.0.0` dans `.env`. Ne le faites pas sans un tel pare-feu : Docker contourne les pare-feu de l'hôte comme `ufw`, et quiconque atteint le port directement contourne TLS et peut falsifier `X-Forwarded-For`, ce qui annule les limites de débit.

Le proxy doit transmettre l'en-tête `Host` d'origine (les connexions WebSocket sont refusées si `Origin` et `Host` diffèrent) ainsi que `X-Forwarded-Proto` (nécessaire pour les cookies sécurisés et HSTS). Cloudflare Tunnel et l'exemple nginx le font par défaut ; ne définissez pas `httpHostHeader` dans la configuration du tunnel. Après la mise en place, vérifiez que le journal d'audit affiche les vraies IP clientes ; sinon ajustez `TRUST_PROXY`.

> **Note de mise à jour :** Les versions précédentes publiaient le port 3000 sur toutes les interfaces. Si votre proxy tourne dans un conteneur, définissez `BIND_ADDRESS` ou connectez le réseau comme décrit ci-dessus avant la mise à jour.

### Chiffrement au repos

Avec `ENCRYPTION_KEY` défini, sharely chiffre chaque nouvel envoi et sa miniature avec AES-256-GCM avant de les stocker (une clé par fichier, dérivée de la clé principale). Les fichiers sont déchiffrés à la volée lors de leur distribution, y compris pour les requêtes Range et les téléchargements ZIP.

- Générez la clé une fois avec `openssl rand -base64 32`, placez-la dans `.env` et **sauvegardez-la séparément** : sans elle, les fichiers chiffrés sont irrécupérables. Changer ou supprimer la clé ensuite n'est pas pris en charge.
- Les fichiers existants restent non chiffrés jusqu'à l'exécution de la migration (sauvegardez d'abord le volume `uploads`) : `docker compose exec app npm run migrate:encrypt`
- Non couvert : pastes, noms de fichiers et autres métadonnées dans MongoDB, avatars et mémoire du serveur en cours d'exécution. Pendant son traitement (assemblage des morceaux, suppression des métadonnées, génération de la miniature), un envoi existe brièvement en clair sur le disque.
- Le réglage d'administration sur le chiffrement du disque/volume ne fait que déclarer un chiffrement du volume dans la politique de confidentialité et en est indépendant.

### Premier démarrage

Au premier démarrage sans utilisateur, sharely écrit un jeton d'installation dans le journal (`docker compose logs app`), ou utilise `INSTALL_TOKEN` s'il est défini. La page d'installation demande ce jeton et crée le compte administrateur ; l'inscription normale ne crée jamais d'administrateur.

---

## 20. Environnement de développement

### Prérequis

- Node.js ≥ 22
- MongoDB (local ou via Docker)
- Optionnel : ffmpeg, ghostscript (pour les miniatures)

### Installation

```bash
# Backend
npm install
cp .env.example .env
# Éditer .env

# Frontend
cd client
npm install
```

### Démarrage

```bash
# Backend (port 3000, avec nodemon)
npm run dev

# Frontend (port 5173, terminal séparé)
cd client
npm run dev
```

Le serveur de développement Vite proxie automatiquement les requêtes API vers `localhost:3000`.

### Build

```bash
npm run build   # Construit client/dist/, le backend reste inchangé
npm start       # Démarre le serveur Express de production
```

---

## 21. Migrations & Scripts

### Migrations automatiques (à chaque démarrage)

Ces migrations s'exécutent au démarrage de l'application dans `app.js` et sont idempotentes :

| Migration | Fichier | Fonction |
|---|---|---|
| Migration des dossiers utilisateurs | `src/migrations/migrateUserFolders.js` | Déplace les fichiers de `uploads/` vers `uploads/{folderName}/` |
| Migration des hachages de clés API | `src/migrations/migrateApiKeyHashes.js` | Convertit les clés API en texte clair en hachages SHA-256 |

### Scripts manuels

```bash
# Générer des miniatures pour les fichiers existants
npm run migrate:thumbnails
# ou :
node scripts/generate-missing-thumbnails.js

# Déplacer les uploads vers les dossiers utilisateurs (manuel)
npm run migrate:user-folders
# ou :
node scripts/migrate-uploads-to-user-folders.js

# Chiffrer les fichiers et miniatures existants (ENCRYPTION_KEY requis, sauvegarde préalable)
npm run migrate:encrypt
# ou dans le conteneur :
docker compose exec app npm run migrate:encrypt
```

`migrate:encrypt` écrit chaque fichier chiffré dans `<storedName>.enc`, met ensuite à jour l'enregistrement et ne supprime le fichier en clair qu'après. Une exécution interrompue peut être relancée sans risque.

### Initialisation de la base de données (Docker)

`scripts/mongo-init.js` est exécuté au premier démarrage du conteneur MongoDB et crée l'utilisateur applicatif avec les permissions correctes.

---

## 22. Tests end-to-end

**Framework :** Playwright (`@playwright/test`)

### Fichiers de test

| Fichier | Suite de tests |
|---|---|
| `e2e/upload.spec.js` | Flux d'upload |
| `e2e/gallery.spec.js` | Galerie et gestion des fichiers |
| `e2e/admin.spec.js` | Tableau de bord admin |
| `e2e/sharelink.spec.js` | Création et utilisation des liens de partage |
| `e2e/tags.spec.js` | Gestion des tags |
| `e2e/bulk-actions-fixes.spec.js` | Actions en masse |

### Exécution

```bash
# Tous les tests
npm run test:e2e

# Avec interface graphique
npm run test:e2e:ui
```

**Configuration Playwright :** `playwright.config.js` (démarre le serveur avec `INSTALL_TOKEN`, par défaut `e2e-install-token`)  
**Configuration globale :** `e2e/global-setup.js` (effectue l'installation avec ce jeton, crée les utilisateurs de test, l'admin, etc.)  
**Utilitaires :** `e2e/helpers.js` (fonctions utilitaires partagées)

### Tests unitaires

```bash
npm test
```

S'exécutent sans base de données : `src/utils/validateEmail.test.js`, `src/utils/stripMetadata.test.js` et `src/utils/fileCrypto.test.js` (chiffrement : aller-retour, plages d'octets, détection de manipulation).

---

## Annexe : Actions du journal d'audit

| Action | Déclencheur |
|---|---|
| `login` | Connexion réussie |
| `logout` | Déconnexion |
| `register` | Inscription |
| `upload` | Upload de fichier |
| `delete_file` | Fichier supprimé |
| `delete_account` | Compte supprimé |
| `change_password` | Mot de passe modifié |
| `change_username` | Nom d'utilisateur modifié |
| `change_email` | E-mail modifié |
| `verify_email` | E-mail vérifié |
| `forgot_password` | Réinitialisation du mot de passe demandée |
| `reset_password` | Mot de passe réinitialisé |
| `regen_api_key` | Clé API régénérée |
| `sharex_config` | Configuration ShareX téléchargée |
| `export_data` | Export des données |
| `admin_create_user` | Admin : utilisateur créé |
| `admin_delete_user` | Admin : utilisateur supprimé |
| `admin_toggle_user` | Admin : utilisateur activé/désactivé |
| `admin_change_role` | Admin : rôle utilisateur modifié |
| `admin_change_password` | Admin : mot de passe défini |
| `admin_regen_key` | Admin : clé API régénérée |

---

*Documentation générée à partir du code source de sharely v1.0.0*
