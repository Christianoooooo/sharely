# Sharely — Documentation Technique

> **Version :** 1.0.0 · **Licence :** MIT · **Node.js :** ≥ 18

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
       → File.createUnique() → MongoDB
       → generateThumbnail() (async, non-blocking)
       → logAudit()
       → broadcast('file:uploaded') via WebSocket
       ← JSON: { files: [...] }
```

### Flux de données : Upload ShareX

```
ShareX → POST /upload (token im Formular-Body)
       → multer: Datei temporär in uploads/
       → requireApiKey: Token-Lookup → User
       → fs.renameSync → uploads/{folderName}/
       → File.create() → MongoDB
       ← JSON: { url, delete_url }
```

---

## 3. Stack technique

| Couche | Technologie | Version |
|---|---|---|
| **Runtime** | Node.js | ≥ 18 |
| **Framework backend** | Express.js | 4.x |
| **Base de données** | MongoDB + Mongoose | Mongo 7, Mongoose 8.x |
| **Sessions** | express-session + connect-mongo | — |
| **Temps réel** | WebSocket (`ws`) | 8.x |
| **Upload de fichiers** | Multer | 1.x |
| **E-mail** | Nodemailer | 8.x |
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
│   │   ├── auth.js                 # requireLogin / requireAdmin / requireApiKey
│   │   └── upload.js               # Configuration Multer, liste de blocage
│   ├── models/
│   │   ├── AuditLog.js             # Événements d'audit (TTL 90 jours)
│   │   ├── Collection.js           # Collections de fichiers
│   │   ├── File.js                 # Métadonnées des fichiers
│   │   ├── ShareLink.js            # Liens de partage par fichier
│   │   ├── SiteSettings.js         # Singleton : paramètres opérateur
│   │   └── User.js                 # Comptes utilisateurs + clés API
│   ├── routes/
│   │   ├── api.js                  # API principale (upload, galerie, admin, ...)
│   │   ├── auth.js                 # Connexion / Inscription / Réinitialisation du mot de passe
│   │   ├── files.js                # Service des fichiers, embeds OG, requêtes de plage
│   │   ├── import.js               # Migration XBackBone
│   │   ├── install.js              # Endpoint d'installation initiale
│   │   └── shares.js               # Service des fichiers via lien de partage
│   ├── jobs/
│   │   └── retentionCleanup.js     # Suppression quotidienne des fichiers expirés
│   ├── migrations/
│   │   ├── migrateApiKeyHashes.js  # Unique : textes en clair → hachages SHA-256
│   │   └── migrateUserFolders.js   # Unique : déplacement des fichiers dans les dossiers utilisateurs
│   ├── utils/
│   │   ├── audit.js                # Fonction utilitaire logAudit()
│   │   ├── generateThumbnail.js    # Intégration ffmpeg / ghostscript
│   │   ├── mailer.js               # Wrapper Nodemailer + modèles d'e-mail i18n
│   │   └── sanitizeFilename.js     # Nettoyage du nom de fichier
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
│   └── generate-missing-thumbnails.js
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
| `NODE_ENV` | — | `production` active les cookies sécurisés |

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
  shortId:      String (8 caractères hexadécimaux : 6 timestamp + 2 aléatoires, unique)
  deleteToken:  String (32 caractères hexadécimaux, unique)
  originalName: String (assaini)
  storedName:   String (chemin relatif : "folderName/8hex.ext")
  mimeType:     String
  size:         Number (octets)
  uploader:     ObjectId → User
  views:        Number
  tags:         [String] (max 20 × 50 caractères)
  createdAt:    Date
}
```

**Propriétés calculées :**
- `sizeHuman` — taille lisible (B / Ko / Mo / Go)
- `displayType` — classification : `image|video|audio|pdf|code|text|file`

**Algorithme Short ID :**
```
shortId = hex(seconds_since_2024-01-01, 6 chars) + randomBytes(2).hex()
```

### Collection (`src/models/Collection.js`)

```
{
  shortId:     String (8 Hex, unique)
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

### Authentification (`/api/auth`)

| Méthode | Chemin | Auth | Description |
|---|---|---|---|
| `GET` | `/me` | Session | Utilisateur connecté |
| `POST` | `/login` | — | Connexion (limité : 10/15min) |
| `POST` | `/register` | — | Inscription (limité, premier utilisateur devient admin) |
| `POST` | `/logout` | — | Déconnexion |
| `GET` | `/smtp-enabled` | — | Vérifie si SMTP est configuré |
| `GET` | `/verify-email?token=` | — | Vérifier l'adresse e-mail |
| `GET` | `/verify-reset-token?token=` | — | Valider le jeton de réinitialisation |
| `POST` | `/forgot-password` | — | Envoyer l'e-mail de réinitialisation du mot de passe (limité : 5/h) |
| `POST` | `/reset-password` | — | Définir un nouveau mot de passe |

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
2. `POST /api/chunk/:uploadId` (Corps : `chunkIndex=N`, Fichier : `chunk`) → `{ received: N }`  
   En parallèle avec 3 à 5 morceaux simultanés
3. `POST /api/chunk/:uploadId/complete` → `{ files: [fileObject] }`

---

### Gestion des fichiers

| Méthode | Chemin | Auth | Description |
|---|---|---|---|
| `GET` | `/api/gallery` | Session | Propres fichiers (admin : tous), paginé (24/page), filtres : `q`, `type`, `tag`, `page` |
| `GET` | `/api/file/:shortId` | — | Métadonnées du fichier (incrémente le compteur de vues) |
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

---

### Liens de partage

| Méthode | Chemin | Auth | Description |
|---|---|---|---|
| `GET` | `/api/file/:shortId/share-links` | Session (Propriétaire/Admin) | Tous les liens de partage d'un fichier |
| `POST` | `/api/file/:shortId/share-links` | Session (Propriétaire/Admin) | Créer un lien de partage |
| `DELETE` | `/api/share-links/:token` | Session (Propriétaire/Créateur/Admin) | Supprimer un lien de partage |
| `GET` | `/api/share-links/:token` | — | Métadonnées du lien de partage (public) |
| `POST` | `/api/share-links/:token/verify` | — | Vérifier le mot de passe du lien de partage |

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
| `POST` | `/api/collections/:id/verify` | — | Vérifier le mot de passe de la collection |

---

### Endpoints d'administration

| Méthode | Chemin | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/stats` | Admin | Statistiques du tableau de bord |
| `GET` | `/api/admin/users` | Admin | Tous les utilisateurs (avec nombre de fichiers) |
| `POST` | `/api/admin/users` | Admin | Créer un utilisateur |
| `PATCH` | `/api/admin/users/:id/toggle` | Admin | Activer/désactiver un utilisateur |
| `PATCH` | `/api/admin/users/:id/role` | Admin | Changer le rôle d'un utilisateur |
| `DELETE` | `/api/admin/users/:id` | Admin | Supprimer un utilisateur |
| `POST` | `/api/admin/users/:id/regen-key` | Admin | Régénérer la clé API |
| `PATCH` | `/api/admin/users/:id/password` | Admin | Définir un mot de passe |
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
| `file:view` | Tous | `{ shortId, views }` |
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

Sert le fichier comme réponse HTTP avec support des requêtes de plage (206 Partial Content). Images/vidéos/audio : `Content-Disposition: inline`, autres : `attachment`.

### `/f/:shortId/download` — Téléchargement forcé

Comme `/raw`, mais toujours `Content-Disposition: attachment`.

### `/f/:shortId/thumb` — Miniature

Retourne la miniature JPEG (pour les vidéos et les PDF). `Cache-Control: public, max-age=86400`.

### `/f/:shortId/delete/:token` — Suppression ShareX

Supprime le fichier sans session via un jeton de suppression unique.

### `/s/:token` — Service de fichiers via lien de partage (`src/routes/shares.js`)

Vérifie le mot de passe (via flag de session), la date d'expiration et la limite de téléchargement, puis sert le fichier.

---

## 10. Authentification & Sécurité

### Authentification par session

- Session Express avec stockage MongoDB (`connect-mongo`)
- Cookie de session : `httpOnly: true`, `sameSite: 'strict'`, `secure: true` en production
- Durée de session : configurable via `SiteSettings.sessionDurationDays` (par défaut : 7 jours), mis en cache en direct pendant 60 secondes

### Authentification par clé API

- Les clés API sont stockées sous forme de hachages SHA-256, jamais en texte clair
- Les 8 premiers caractères sont stockés comme `apiKeyPrefix` (à des fins d'affichage)
- Recherche : `User.findByApiKey(plaintext)` calcule le hachage et le cherche dans `apiKeyHash`
- Lors du téléchargement de la configuration ShareX, la clé est régénérée — le texte en clair n'est visible qu'à ce moment-là

### Chaîne de middleware (`src/middleware/auth.js`)

```
requireLogin    → vérifie req.session.user → 401 si non connecté
requireAdmin    → comme requireLogin, de plus role === 'admin' → 403
requireApiKey   → vérifie l'en-tête Authorization ou req.body.token
```

### Protection CSRF

`requireSameOrigin()` dans `app.js` compare l'en-tête `Origin` avec l'en-tête `Host` pour toutes les routes API. Complète les cookies `sameSite: 'strict'`.

### Politique de sécurité du contenu

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
media-src 'self' blob:;
connect-src 'self' https://cloudflareinsights.com;
frame-ancestors 'self';
```

### En-têtes de sécurité

- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`

### Limitation de débit

| Endpoint | Limite | Fenêtre |
|---|---|---|
| Upload (`/upload`, `/api/upload`, `/api/web-upload`) | 60 requêtes | 15 minutes |
| Auth (`/api/auth/login`, `/register`, etc.) | 10 requêtes | 15 minutes |
| Réinitialisation du mot de passe | 5 requêtes | 1 heure |

### Liste de blocage des fichiers

Les types MIME et extensions suivants sont rejetés à l'upload :

**Types MIME bloqués :** `application/x-executable`, `application/x-sh`, `application/x-csh`, `application/x-bat`

**Extensions bloquées :** `.bat`, `.cmd`, `.com`, `.ps1`, `.psm1`, `.psd1`, `.sh`, `.bash`, `.csh`, `.zsh`, `.fish`, `.vbs`, `.vbe`, `.jse`, `.scr`, `.pif`, `.application`, `.gadget`, `.hta`, `.php`, `.php3–5`, `.phtml`, `.asp`, `.aspx`, `.jsp`, `.jspx`, `.cfm`

### Protection contre la traversée de chemin

Tous les accès aux fichiers via `resolveUploadPath()` vérifient que le chemin résolu se trouve bien dans `UPLOAD_DIR`.

---

## 11. Système d'upload

### Upload standard (Multer)

- **Stockage :** `multer.diskStorage` → `uploads/{folderName}/{8hex}{.ext}`
- **Nom de fichier :** `crypto.randomBytes(4).hex() + extension-originale`
- **Limite :** `MAX_FILE_SIZE_MB` (par défaut : 100 Mo)
- **Emplacement :** Dossier spécifique à l'utilisateur (`user.folderName`)

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

### Upload d'avatar

- **Stockage :** `multer.memoryStorage()` (pas de tampon disque)
- **Emplacement :** `uploads/.avatars/{userId}{.ext}`
- **Limite :** 2 Mo
- **Formats :** JPEG, PNG, GIF, WebP

---

## 12. Génération de miniatures

Les miniatures sont générées de manière asynchrone après l'upload (`.catch(() => {})` — les erreurs sont ignorées silencieusement).

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
- Créer des utilisateurs, activer/désactiver, changer de rôle
- Réinitialiser le mot de passe, régénérer la clé API
- Changer le nom du dossier (les fichiers physiques sont déplacés sur le serveur)
- Supprimer un utilisateur (tous les fichiers sont supprimés)

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
| Suppression du compte (fichiers + données) | Art. 17 – Droit à l'effacement |
| Journal d'audit (TTL 90 jours via MongoDB) | Art. 5(2) – Responsabilité |
| Export CSV du journal d'audit | Art. 5(2) – Responsabilité |
| Rétention des fichiers configurable | Art. 5(1)(e) – Limitation de la conservation |
| Clés API sous forme de hachage SHA-256 | Art. 32 – Sécurité |
| Mots de passe en bcrypt (12 tours) | Art. 32 – Sécurité |
| Consentement aux cookies pour Cloudflare Analytics | Art. 13 – Transparence |
| Anonymisation lors de la suppression du compte | Art. 17 – Droit à l'effacement |

### Flux de suppression RGPD

Lors de la suppression du compte (`user:delete-account` / `DELETE /api/user/account`) :
1. Tous les fichiers de l'utilisateur sont supprimés du disque
2. Les miniatures sont supprimées
3. L'avatar est supprimé
4. Les entrées du journal d'audit sont anonymisées (`username: '[deleted]'`, `ip: null`, `userId: null`)
5. Le document utilisateur est supprimé
6. La session est détruite

---

## 18. Tâches en arrière-plan

### Nettoyage par rétention (`src/jobs/retentionCleanup.js`)

- **Exécution :** Au démarrage puis quotidiennement (`setInterval(runRetentionCleanup, 24h)`)
- **Action :** Si `SiteSettings.fileRetentionDays > 0`, les fichiers plus anciens que cette valeur sont supprimés
- Supprime : fichier sur disque, miniature, document MongoDB
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
- `app` — Application Node.js (port 3000)
- `mongo` — MongoDB 7 (port 127.0.0.1:27017, non accessible de l'extérieur)

**Volumes :**
- `uploads` — stockage de fichiers persistant
- `mongo_data` — données MongoDB

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

### Premier démarrage

Le premier utilisateur enregistré reçoit automatiquement le rôle `admin` (`User.countDocuments() === 0`).

---

## 20. Environnement de développement

### Prérequis

- Node.js ≥ 18
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
```

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

**Configuration Playwright :** `playwright.config.js`  
**Configuration globale :** `e2e/global-setup.js` (crée les utilisateurs de test, l'admin, etc.)  
**Utilitaires :** `e2e/helpers.js` (fonctions utilitaires partagées)

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
