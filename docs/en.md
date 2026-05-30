# Sharely — Technical Documentation

> **Version:** 1.0.0 · **License:** MIT · **Node.js:** ≥ 18

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Directory Structure](#4-directory-structure)
5. [Configuration & Environment Variables](#5-configuration--environment-variables)
6. [Data Models](#6-data-models)
7. [REST API](#7-rest-api)
8. [WebSocket API](#8-websocket-api)
9. [File Serving Routes](#9-file-serving-routes)
10. [Authentication & Security](#10-authentication--security)
11. [Upload System](#11-upload-system)
12. [Thumbnail Generation](#12-thumbnail-generation)
13. [Email & SMTP](#13-email--smtp)
14. [Internationalization](#14-internationalization)
15. [Frontend (React SPA)](#15-frontend-react-spa)
16. [Admin Dashboard](#16-admin-dashboard)
17. [GDPR / Privacy](#17-gdpr--privacy)
18. [Background Jobs](#18-background-jobs)
19. [Deployment](#19-deployment)
20. [Development Environment](#20-development-environment)
21. [Migrations & Scripts](#21-migrations--scripts)
22. [End-to-End Tests](#22-end-to-end-tests)

---

## 1. Project Overview

Sharely is a **self-hosted file sharing platform** with a clean web interface, ShareX integration, and API access. Users upload screenshots, files, and media and share them instantly via short links.

### Core Features

| Feature | Description |
|---|---|
| Web Upload | Drag-and-drop, up to 500 files at once |
| Chunked Upload | Files up to 2 GB via parallel multi-part upload |
| ShareX Integration | `.sxcu` configuration file downloadable with one click |
| API Upload | Bearer token authentication, compatible with curl/wget |
| File Viewer | Zoom images, stream videos/audio (HTTP Range), PDFs inline, code syntax-highlighted |
| Embed Modes | *embed* (OG/Twitter Card HTML) or *raw* (direct redirect) |
| Thumbnails | Automatic JPEG previews for videos (ffmpeg) and PDFs (ghostscript) |
| Collections | Group collections of files with optional password and expiry date |
| Share Links | Per-file links with password, expiry, and download limit |
| Real-Time UI | WebSocket-based live updates (upload, delete, view counter, admin stats) |
| Multilingual | 8 languages: EN, DE, FR, ES, IT, PT, JA, ZH |
| Admin Dashboard | Statistics, user management, file management, audit log (CSV export) |
| GDPR Compliance | Privacy features compliant with EU GDPR (Art. 17, 20, 32 et al.) |
| XBackBone Import | Migration of existing XBackBone installations |
| Docker-ready | `docker compose up -d` starts the complete environment |

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

### Data Flow: Standard Upload

```
Browser → POST /api/web-upload (multipart/form-data)
       → multer: Datei in uploads/{folderName}/
       → File.createUnique() → MongoDB
       → generateThumbnail() (async, non-blocking)
       → logAudit()
       → broadcast('file:uploaded') via WebSocket
       ← JSON: { files: [...] }
```

### Data Flow: ShareX Upload

```
ShareX → POST /upload (token im Formular-Body)
       → multer: Datei temporär in uploads/
       → requireApiKey: Token-Lookup → User
       → fs.renameSync → uploads/{folderName}/
       → File.create() → MongoDB
       ← JSON: { url, delete_url }
```

---

## 3. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Runtime** | Node.js | ≥ 18 |
| **Backend Framework** | Express.js | 4.x |
| **Database** | MongoDB + Mongoose | Mongo 7, Mongoose 8.x |
| **Sessions** | express-session + connect-mongo | — |
| **Real-Time** | WebSocket (`ws`) | 8.x |
| **File Upload** | Multer | 1.x |
| **Email** | Nodemailer | 8.x |
| **Password Hashing** | bcryptjs | 2.x (12 Rounds) |
| **API Key Hashing** | SHA-256 (Node Crypto) | — |
| **Rate Limiting** | express-rate-limit | 8.x |
| **XBackBone Import** | sql.js | 1.x |
| **Frontend Framework** | React 18 | 18.3.x |
| **Routing (Frontend)** | React Router v6 | 6.x |
| **Build Tool** | Vite | 6.x |
| **Styling** | Tailwind CSS + Radix UI | 3.x |
| **UI Components** | shadcn/ui (Radix primitives) | — |
| **Icons** | FontAwesome | 6.x |
| **i18n** | i18next + react-i18next | — |
| **Syntax Highlighting** | highlight.js | 11.x |
| **Container** | Docker + Docker Compose | — |
| **Tests** | Playwright (E2E) | 1.60.x |

---

## 4. Directory Structure

```
sharely/
├── app.js                          # Express entry point, startup sequence
├── package.json
├── .env.example                    # Template for all environment variables
├── Dockerfile
├── docker-compose.yml
│
├── src/
│   ├── config/
│   │   └── db.js                   # MongoDB connection (Mongoose)
│   ├── middleware/
│   │   ├── auth.js                 # requireLogin / requireAdmin / requireApiKey
│   │   └── upload.js               # Multer configuration, blocklist
│   ├── models/
│   │   ├── AuditLog.js             # Audit events (TTL 90 days)
│   │   ├── Collection.js           # File collections
│   │   ├── File.js                 # File metadata
│   │   ├── ShareLink.js            # Per-file share links
│   │   ├── SiteSettings.js         # Singleton: operator settings
│   │   └── User.js                 # User accounts + API keys
│   ├── routes/
│   │   ├── api.js                  # Main API (upload, gallery, admin, ...)
│   │   ├── auth.js                 # Login / Register / Password reset
│   │   ├── files.js                # File serving, OG embeds, range requests
│   │   ├── import.js               # XBackBone migration
│   │   ├── install.js              # Initial installation endpoint
│   │   └── shares.js               # Share link file serving
│   ├── jobs/
│   │   └── retentionCleanup.js     # Daily deletion of expired files
│   ├── migrations/
│   │   ├── migrateApiKeyHashes.js  # One-time: plaintexts → SHA-256 hashes
│   │   └── migrateUserFolders.js   # One-time: move files into user folders
│   ├── utils/
│   │   ├── audit.js                # logAudit() helper function
│   │   ├── generateThumbnail.js    # ffmpeg / ghostscript integration
│   │   ├── mailer.js               # Nodemailer wrapper + i18n email templates
│   │   └── sanitizeFilename.js     # Sanitize filename
│   └── ws.js                       # WebSocket server + action dispatcher
│
├── client/                         # React frontend
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx                # React entry point
│       ├── App.jsx                 # Router configuration
│       ├── index.css               # Global styles
│       ├── context/
│       │   └── AuthContext.jsx     # Global auth state
│       ├── hooks/
│       │   ├── use-toast.js        # Toast notification hook
│       │   └── useWebSocket.js     # WS connection + event handlers
│       ├── components/
│       │   ├── Layout.jsx          # App shell (navbar, sidebar)
│       │   ├── ProtectedRoute.jsx  # Auth guard
│       │   ├── ShareLinkDialog.jsx # Share link creation dialog
│       │   ├── AddToCollectionDialog.jsx
│       │   ├── CookieBanner.jsx
│       │   ├── LanguageSelector.jsx
│       │   ├── RequireEmailDialog.jsx
│       │   ├── UserAvatar.jsx
│       │   └── ui/                 # shadcn/ui base components
│       ├── pages/
│       │   ├── Upload.jsx          # Upload page
│       │   ├── Gallery.jsx         # File gallery
│       │   ├── FileView.jsx        # File detail view
│       │   ├── Collections.jsx     # Collections overview
│       │   ├── CollectionView.jsx  # Individual collection
│       │   ├── ShareView.jsx       # Public share link page
│       │   ├── Settings.jsx        # User settings
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   ├── ForgotPassword.jsx
│       │   ├── ResetPassword.jsx
│       │   ├── Install.jsx         # Initial installation
│       │   ├── PrivacyPolicy.jsx
│       │   ├── TermsOfService.jsx
│       │   └── admin/
│       │       ├── Dashboard.jsx   # Admin home page
│       │       ├── Users.jsx       # User management
│       │       ├── Files.jsx       # File management
│       │       ├── AuditLog.jsx    # Audit log view
│       │       ├── SiteSettings.jsx# Operator settings
│       │       └── Import.jsx      # XBackBone import
│       ├── i18n/
│       │   ├── index.js            # i18next configuration
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
│           └── utils.js            # Tailwind helper (cn())
│
├── scripts/
│   ├── setup-db.js
│   ├── mongo-init.js               # MongoDB initialization script
│   ├── migrate-uploads-to-user-folders.js
│   └── generate-missing-thumbnails.js
│
├── e2e/                            # Playwright tests
│   ├── admin.spec.js
│   ├── bulk-actions-fixes.spec.js
│   ├── gallery.spec.js
│   ├── sharelink.spec.js
│   ├── tags.spec.js
│   ├── upload.spec.js
│   ├── helpers.js
│   └── global-setup.js
│
├── uploads/                        # File uploads (runtime)
│   ├── .thumbnails/
│   ├── .avatars/
│   └── .chunks/                    # Temporary chunks
│
└── docs/assets/                    # Screenshots and logo
```

---

## 5. Configuration & Environment Variables

All variables are loaded from `.env` (via `dotenv`). The file `.env.example` contains the complete template.

### Required Fields

| Variable | Description |
|---|---|
| `SESSION_SECRET` | Secret for session encryption — long random string, e.g. `openssl rand -hex 32` |
| `MONGO_ROOT_PASSWORD` | MongoDB root password (required for Docker Compose only) |
| `MONGO_APP_PASSWORD` | MongoDB application user password |

### All Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | TCP port of the HTTP server |
| `MONGODB_URI` | _(constructed from Docker Compose)_ | Full MongoDB connection URI |
| `MONGO_ROOT_PASSWORD` | — | MongoDB root password |
| `MONGO_APP_USER` | `appuser` | MongoDB application username |
| `MONGO_APP_PASSWORD` | — | MongoDB application user password |
| `MONGO_DB_NAME` | `sharely` | MongoDB database name |
| `SESSION_SECRET` | — | **Required** — session encryption secret |
| `BASE_URL` | `http://localhost:3000` | Public base URL for generated share links (no trailing `/`) |
| `SITE_NAME` | `sharely` | Site name in Open Graph embeds |
| `MAX_FILE_SIZE_MB` | `100` | Maximum file size for standard uploads in MB (chunked uploads up to 2 GB independently) |
| `ALLOW_REGISTRATION` | `true` | `false` disables public registration |
| `SMTP_HOST` | — | SMTP server hostname; leave empty to disable email features |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_SECURE` | `false` | `true` for implicit TLS (port 465), `false` for STARTTLS |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | _(SMTP_USER)_ | Sender address in outgoing emails |
| `UPLOAD_DIR` | `./uploads` | Absolute path to upload directory |
| `NODE_ENV` | — | `production` enables secure cookies |

---

## 6. Data Models

### User (`src/models/User.js`)

```
{
  username:                    String (3–32, unique, alphanumeric + _-)
  password:                    String (bcrypt, 12 Rounds)
  role:                        'admin' | 'user'
  apiKey:                      String (Legacy, empty after migration)
  apiKeyHash:                  String (SHA-256, unique, sparse)
  apiKeyPrefix:                String (first 8 characters of plaintext)
  folderName:                  String (unique, sparse, max 64)
  avatarExt:                   String | null (.jpg/.png/.gif/.webp)
  embedMode:                   'embed' | 'raw'
  isActive:                    Boolean
  email:                       String (lowercase, unique, sparse)
  emailVerified:               Boolean
  emailVerificationToken:      String | null (SHA-256 hash of plaintext)
  emailVerificationExpires:    Date | null
  passwordResetToken:          String | null (SHA-256 hash)
  passwordResetExpires:        Date | null
  language:                    'en'|'de'|'fr'|'es'|'it'|'pt'|'ja'|'zh'
  predefinedTags:              [String] (max 100 tags × 50 characters)
  createdAt:                   Date
}
```

**Important Methods:**
- `user.comparePassword(candidate)` — bcrypt comparison
- `user.regenerateApiKey()` — generates new plaintext, stores hash, returns plaintext (visible once only)
- `User.findByApiKey(plaintext)` — looks up by SHA-256 hash, active users only

### File (`src/models/File.js`)

```
{
  shortId:      String (8 hex characters: 6 timestamp + 2 random, unique)
  deleteToken:  String (32 hex characters, unique)
  originalName: String (sanitized)
  storedName:   String (relative path: "folderName/8hex.ext")
  mimeType:     String
  size:         Number (bytes)
  uploader:     ObjectId → User
  views:        Number
  tags:         [String] (max 20 × 50 characters)
  createdAt:    Date
}
```

**Virtuals:**
- `sizeHuman` — human-readable size (B / KB / MB / GB)
- `displayType` — classification: `image|video|audio|pdf|code|text|file`

**Short ID Algorithm:**
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

> Expired collections are automatically deleted by MongoDB TTL index 7 days after expiry.

### ShareLink (`src/models/ShareLink.js`)

```
{
  token:         String (32 Hex, unique)
  file:          ObjectId → File
  createdBy:     ObjectId → User
  label:         String (max 100)
  password:      String | null (bcrypt)
  expiresAt:     Date | null
  downloadLimit: Number (-1 = unlimited)
  downloadCount: Number
  createdAt:     Date
}
```

> Like collections: 7-day grace period after expiry via TTL index.

### SiteSettings (`src/models/SiteSettings.js`)

Singleton document (`_id: 'singleton'`):

```
{
  operatorName:        String
  operatorAddress:     String
  operatorEmail:       String
  cloudflareAnalytics: Boolean
  fileRetentionDays:   Number (0 = disabled)
  encryptionAtRest:    Boolean
  sessionDurationDays: Number (default: 7)
  allowRegistration:   Boolean
}
```

### AuditLog (`src/models/AuditLog.js`)

```
{
  timestamp: Date (TTL index: 90 days)
  userId:    ObjectId → User | null
  username:  String | null
  action:    String
  ip:        String | null
  meta:      Mixed (action-specific metadata)
}
```

---

## 7. REST API

### Base URL: `/api`

All JSON endpoints return `Content-Type: application/json`. Errors: `{ "error": "message" }`.

---

### Authentication (`/api/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/me` | Session | Currently logged-in user |
| `POST` | `/login` | — | Log in (rate-limited: 10/15min) |
| `POST` | `/register` | — | Register (rate-limited, first user becomes admin) |
| `POST` | `/logout` | — | Log out |
| `GET` | `/smtp-enabled` | — | Check whether SMTP is configured |
| `GET` | `/verify-email?token=` | — | Verify email address |
| `GET` | `/verify-reset-token?token=` | — | Validate reset token |
| `POST` | `/forgot-password` | — | Send password reset email (rate-limited: 5/hr) |
| `POST` | `/reset-password` | — | Set new password |

**Login Request:**
```json
POST /api/auth/login
{ "username": "max", "password": "meinPasswort123" }
```

**Login Response:**
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

### File Upload

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/upload` | API Key | ShareX upload (legacy endpoint in `app.js`) |
| `POST` | `/api/upload` | API Key | ShareX/API upload (field: `file`) |
| `POST` | `/api/web-upload` | Session | Web upload (field: `files[]`, max 500) |
| `POST` | `/api/chunk/init` | Session | Initialize chunked upload |
| `POST` | `/api/chunk/:uploadId` | Session | Upload a single chunk (field: `chunk`) |
| `POST` | `/api/chunk/:uploadId/complete` | Session | Assemble chunks |
| `DELETE` | `/api/chunk/:uploadId` | Session | Cancel upload & clean up |

**API Upload Response:**
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

#### Chunked Upload Flow

1. `POST /api/chunk/init` → `{ uploadId: "32hex" }`
2. `POST /api/chunk/:uploadId` (Body: `chunkIndex=N`, File: `chunk`) → `{ received: N }`  
   Parallel with 3–5 concurrent chunks
3. `POST /api/chunk/:uploadId/complete` → `{ files: [fileObject] }`

---

### File Management

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/gallery` | Session | Own files (admin: all), paginated (24/page), filters: `q`, `type`, `tag`, `page` |
| `GET` | `/api/file/:shortId` | — | File metadata (increments view counter) |
| `PATCH` | `/api/file/:shortId` | Session | Update tags/name |
| `DELETE` | `/api/file/:shortId` | Session | Delete file |
| `DELETE` | `/api/delete/:shortId` | API Key | Delete file (API key auth) |
| `POST` | `/api/files/bulk` | Session | Bulk actions: `delete`, `tag`, `removeTag`, `addToCollection`, `moveToCollection` |
| `GET` | `/api/tags` | Session | All tag suggestions for the user |

**Gallery Query Parameters:**
- `q` — search in filename (regex-safe)
- `type` — `all|image|video|audio|pdf|code`
- `tag` — exact tag filter
- `page` — page number (default: 1)

---

### User Settings

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/my-key` | Session | Show API key prefix |
| `POST` | `/api/regen-key` | Session | Regenerate API key |
| `GET` | `/api/sharex-config` | Session | Download ShareX `.sxcu` (regenerates key) |
| `PATCH` | `/api/user/username` | Session | Change username (password required) |
| `PATCH` | `/api/user/password` | Session | Change password |
| `PATCH` | `/api/user/email` | Session | Change email (sends verification email) |
| `PATCH` | `/api/user/language` | Session | Set UI language |
| `PATCH` | `/api/user/embed-mode` | Session | Set embed mode (`embed`/`raw`) |
| `POST` | `/api/user/resend-verification` | Session | Resend verification email |
| `GET` | `/api/user/export` | Session | Data export (GDPR Art. 20) as JSON |
| `DELETE` | `/api/user/account` | Session | Delete account (GDPR Art. 17, password required) |
| `GET` | `/api/user/predefined-tags` | Session | Retrieve predefined tags |
| `PATCH` | `/api/user/predefined-tags` | Session | Update predefined tags |
| `POST` | `/api/user/avatar` | Session | Upload avatar (max 2 MB, JPEG/PNG/GIF/WebP) |
| `DELETE` | `/api/user/avatar` | Session | Delete avatar |
| `GET` | `/api/user/avatar/:userId` | — | Serve avatar |

---

### Share Links

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/file/:shortId/share-links` | Session (Owner/Admin) | All share links for a file |
| `POST` | `/api/file/:shortId/share-links` | Session (Owner/Admin) | Create share link |
| `DELETE` | `/api/share-links/:token` | Session (Owner/Creator/Admin) | Delete share link |
| `GET` | `/api/share-links/:token` | — | Share link metadata (public) |
| `POST` | `/api/share-links/:token/verify` | — | Verify share link password |

**Create Share Link:**
```json
POST /api/file/a1b2c3d4/share-links
{
  "label": "For colleagues",
  "password": "secret",
  "expiresAt": "2025-12-31T23:59:59Z",
  "downloadLimit": 10
}
```

---

### Collections

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/collections` | Session | Own collections (admin: all) |
| `POST` | `/api/collections` | Session | Create collection |
| `GET` | `/api/collections/:id` | — | View collection (public, password if set) |
| `PATCH` | `/api/collections/:id` | Session (Owner/Admin) | Update collection |
| `DELETE` | `/api/collections/:id` | Session (Owner/Admin) | Delete collection |
| `POST` | `/api/collections/:id/files` | Session (Owner/Admin) | Add file to collection |
| `DELETE` | `/api/collections/:id/files/:fileShortId` | Session (Owner/Admin) | Remove file from collection |
| `POST` | `/api/collections/:id/verify` | — | Verify collection password |

---

### Admin Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/admin/stats` | Admin | Dashboard statistics |
| `GET` | `/api/admin/users` | Admin | All users (including file counts) |
| `POST` | `/api/admin/users` | Admin | Create user |
| `PATCH` | `/api/admin/users/:id/toggle` | Admin | Activate/deactivate user |
| `PATCH` | `/api/admin/users/:id/role` | Admin | Change user role |
| `DELETE` | `/api/admin/users/:id` | Admin | Delete user |
| `POST` | `/api/admin/users/:id/regen-key` | Admin | Regenerate API key |
| `PATCH` | `/api/admin/users/:id/password` | Admin | Set password |
| `PATCH` | `/api/admin/users/:id/folder` | Admin | Change folder name (moves files) |
| `GET` | `/api/admin/files` | Admin | All files, paginated (30/page) |
| `GET` | `/api/admin/site-settings` | Admin | Read operator settings |
| `PATCH` | `/api/admin/site-settings` | Admin | Update operator settings |
| `GET` | `/api/admin/audit-log` | Admin | Paginated audit log (50/page) |
| `GET` | `/api/admin/audit-log/export` | Admin | Download audit log as CSV |
| `GET` | `/api/site-settings` | — | Public operator info (for privacy page) |

---

### Site Settings (Public)

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

## 8. WebSocket API

**Connection:** `wss://example.com/ws` (logged-in users only, session cookie required)

### Protocol

**Client → Server (Request):**
```json
{ "id": "req-abc123", "action": "file:list", "payload": { "type": "image", "page": 1 } }
```

**Server → Client (Response):**
```json
{ "id": "req-abc123", "data": { ... } }
```

**Server → Client (Error):**
```json
{ "id": "req-abc123", "error": "Forbidden", "status": 403 }
```

**Server → Client (Broadcast):**
```json
{ "event": "file:uploaded", "data": { "shortId": "a1b2c3d4", "uploaderId": "..." } }
```

### Available Actions

| Action | Auth | Description |
|---|---|---|
| `site-settings:get` | — | Public site settings |
| `auth:me` | User | Own user data |
| `file:get` | User | File details (increments views) |
| `file:list` | User | File list with filter/pagination |
| `file:delete` | User | Delete file |
| `user:get-key` | User | API key prefix |
| `user:regen-key` | User | Regenerate API key |
| `user:change-password` | User | Change password |
| `user:change-username` | User | Change username |
| `user:change-email` | User | Change email |
| `user:change-language` | User | Set language |
| `user:change-embed-mode` | User | Set embed mode |
| `user:resend-verification` | User | Resend verification email |
| `user:export` | User | Data export |
| `user:delete-account` | User | Delete account |
| `admin:stats` | Admin | Dashboard statistics |
| `admin:settings:get` | Admin | Read site settings |
| `admin:settings:update` | Admin | Update site settings |
| `admin:users:list` | Admin | All users |
| `admin:users:create` | Admin | Create user |
| `admin:users:toggle` | Admin | Activate/deactivate user |
| `admin:users:role` | Admin | Change user role |
| `admin:users:delete` | Admin | Delete user |
| `admin:users:regen-key` | Admin | Regenerate API key |
| `admin:users:password` | Admin | Set password |
| `admin:users:folder` | Admin | Change folder name |
| `admin:files:list` | Admin | All files |
| `admin:audit-log:list` | Admin | Paginated audit log |

### Broadcast Events

| Event | Recipients | Payload |
|---|---|---|
| `file:uploaded` | Uploader | `{ shortId, uploaderId }` |
| `file:deleted` | File owner | `{ shortId, uploaderId }` |
| `file:view` | All | `{ shortId, views }` |
| `user:created` | Admins | `{ id, username, role, ... }` |
| `user:deleted` | Admins | `{ id }` |
| `user:updated` | Admins | `{ id, ...changed fields }` |
| `audit:log` | Admins | Complete AuditLog object |
| `settings:updated` | Admins | Updated SiteSettings object |
| `stats:invalidate` | Admins | `{}` (trigger stats refresh) |

---

## 9. File Serving Routes

### `/f/:shortId` — File Viewer

- **Browser request:** Passes through to React SPA (`index.html`) — SPA renders the viewer.
- **Social media bot** (Discord, Telegram, Twitter, etc.): Returns a minimal HTML page with Open Graph / Twitter Card meta tags.
  - `embedMode = 'embed'`: OG HTML with redirect
  - `embedMode = 'raw'` + image/video/audio: HTTP 302 → `/f/:shortId/raw`

### `/f/:shortId/raw` — Direct Access

Serves the file as an HTTP response with range request support (206 Partial Content). Images/videos/audio: `Content-Disposition: inline`, others: `attachment`.

### `/f/:shortId/download` — Force Download

Like `/raw`, but always `Content-Disposition: attachment`.

### `/f/:shortId/thumb` — Thumbnail

Returns JPEG thumbnail (for videos and PDFs). `Cache-Control: public, max-age=86400`.

### `/f/:shortId/delete/:token` — ShareX Deletion

Deletes file without session via unique delete token.

### `/s/:token` — Share Link File Serving (`src/routes/shares.js`)

Checks password (via session flag), expiry date and download limit, then serves the file.

---

## 10. Authentication & Security

### Session Authentication

- Express session with MongoDB store (`connect-mongo`)
- Session cookie: `httpOnly: true`, `sameSite: 'strict'`, `secure: true` in production
- Session duration: configurable via `SiteSettings.sessionDurationDays` (default: 7 days), live-cached for 60 seconds

### API Key Authentication

- API keys are stored as SHA-256 hashes, never in plaintext
- The first 8 characters are stored as `apiKeyPrefix` (for display purposes)
- Lookup: `User.findByApiKey(plaintext)` computes hash and searches in `apiKeyHash`
- When downloading the ShareX config, the key is regenerated — the plaintext is visible only at that moment

### Middleware Chain (`src/middleware/auth.js`)

```
requireLogin    → checks req.session.user → 401 if not logged in
requireAdmin    → like requireLogin, additionally role === 'admin' → 403
requireApiKey   → checks Authorization header or req.body.token
```

### CSRF Protection

`requireSameOrigin()` in `app.js` compares the `Origin` header with the `Host` header for all API routes. Complements `sameSite: 'strict'` cookies.

### Content Security Policy

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
media-src 'self' blob:;
connect-src 'self' https://cloudflareinsights.com;
frame-ancestors 'self';
```

### Security Headers

- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`

### Rate Limiting

| Endpoint | Limit | Window |
|---|---|---|
| Upload (`/upload`, `/api/upload`, `/api/web-upload`) | 60 requests | 15 minutes |
| Auth (`/api/auth/login`, `/register`, etc.) | 10 requests | 15 minutes |
| Password reset | 5 requests | 1 hour |

### File Blocklist

The following MIME types and extensions are rejected on upload:

**Blocked MIME types:** `application/x-executable`, `application/x-sh`, `application/x-csh`, `application/x-bat`

**Blocked extensions:** `.bat`, `.cmd`, `.com`, `.ps1`, `.psm1`, `.psd1`, `.sh`, `.bash`, `.csh`, `.zsh`, `.fish`, `.vbs`, `.vbe`, `.jse`, `.scr`, `.pif`, `.application`, `.gadget`, `.hta`, `.php`, `.php3–5`, `.phtml`, `.asp`, `.aspx`, `.jsp`, `.jspx`, `.cfm`

### Path Traversal Protection

All file accesses via `resolveUploadPath()` verify that the resolved path lies within `UPLOAD_DIR`.

---

## 11. Upload System

### Standard Upload (Multer)

- **Storage:** `multer.diskStorage` → `uploads/{folderName}/{8hex}{.ext}`
- **Filename:** `crypto.randomBytes(4).hex() + original-extension`
- **Limit:** `MAX_FILE_SIZE_MB` (default: 100 MB)
- **Location:** User-specific folder (`user.folderName`)

### Chunked Upload (>250 MB)

The frontend client automatically switches to chunked mode for large files.

**Server-side directory structure:**
```
uploads/.chunks/{uploadId}/
  meta.json          { filename, mimeType, totalSize, totalChunks, userId, createdAt }
  chunk-0
  chunk-1
  ...
  chunk-N
```

**Chunk size:** 10–20 MB (max 51 MB accepted for backward compatibility)  
**Parallelism:** 3–5 concurrent chunk uploads  
**Assembly:** Stream-based (no full loading into RAM)

### Avatar Upload

- **Storage:** `multer.memoryStorage()` (no disk buffer)
- **Location:** `uploads/.avatars/{userId}{.ext}`
- **Limit:** 2 MB
- **Formats:** JPEG, PNG, GIF, WebP

---

## 12. Thumbnail Generation

Thumbnails are generated asynchronously after upload (`.catch(() => {})` — errors are silently ignored).

### Video Thumbnails (ffmpeg)

```bash
ffmpeg -y -i <file> -ss 00:00:01 -vframes 1 \
  -vf "scale=320:320:force_original_aspect_ratio=increase,crop=320:320" \
  -q:v 3 uploads/.thumbnails/<shortId>.jpg
```

### PDF Thumbnails (Ghostscript)

```bash
gs -dNOPAUSE -dBATCH -dSAFER \
  -sDEVICE=jpeg -dFirstPage=1 -dLastPage=1 \
  -r72 -dJPEGQ=85 \
  -sOutputFile=uploads/.thumbnails/<shortId>.jpg \
  <file>
```

**Timeout:** 30 seconds per thumbnail generation  
**Fallback:** If ffmpeg/ghostscript is not available, generation is silently skipped.

### Backfill Script

```bash
npm run migrate:thumbnails
# or in container:
docker exec -it <container> npm run migrate:thumbnails
```

---

## 13. Email & SMTP

### Configuration

SMTP is activated when `SMTP_HOST` is set. `mailer.isConfigured()` checks this value.

### Email Templates

All emails are sent in the user's language (8 languages). Templates are embedded in `src/utils/mailer.js`.

**Email types sent:**

| Type | Trigger | Token Validity |
|---|---|---|
| Email verification | Registration, email change | 24 hours |
| Password reset | `POST /api/auth/forgot-password` | 1 hour |

### Token Security

- Tokens: `crypto.randomBytes(32).hex()` (64 hex characters)
- Stored: SHA-256 hash of the token
- Email contains plaintext token as URL parameter
- Verification: hash of incoming token compared against stored hash

---

## 14. Internationalization

**Library:** i18next + react-i18next + i18next-browser-languagedetector

**Supported Languages:**

| Code | Language |
|---|---|
| `en` | English |
| `de` | Deutsch |
| `fr` | Français |
| `es` | Español |
| `it` | Italiano |
| `pt` | Português |
| `ja` | 日本語 |
| `zh` | 中文 |

**Language Selection:**
1. Browser language detection (automatic)
2. User preference in the database (`user.language`)
3. Persistence via `PATCH /api/user/language`

Translation files: `client/src/i18n/locales/{code}.json`

---

## 15. Frontend (React SPA)

### Router Configuration (`client/src/App.jsx`)

| Route | Component | Auth |
|---|---|---|
| `/` | Redirect → `/gallery` | No |
| `/auth/login` | Login.jsx | No |
| `/auth/register` | Register.jsx | No |
| `/auth/forgot-password` | ForgotPassword.jsx | No |
| `/auth/reset-password` | ResetPassword.jsx | No |
| `/install` | Install.jsx | No |
| `/upload` | Upload.jsx | **Yes** |
| `/gallery` | Gallery.jsx | **Yes** |
| `/f/:shortId` | FileView.jsx | **Yes** |
| `/collections` | Collections.jsx | **Yes** |
| `/c/:id` | CollectionView.jsx | No (public) |
| `/s/:token` | ShareView.jsx | No (public) |
| `/settings` | Settings.jsx | **Yes** |
| `/admin` | Dashboard.jsx | **Admin** |
| `/admin/users` | Users.jsx | **Admin** |
| `/admin/files` | Files.jsx | **Admin** |
| `/admin/audit-log` | AuditLog.jsx | **Admin** |
| `/admin/site-settings` | SiteSettings.jsx | **Admin** |
| `/admin/import` | Import.jsx | **Admin** |
| `/privacy` | PrivacyPolicy.jsx | No |
| `/terms` | TermsOfService.jsx | No |

### Auth Context (`client/src/context/AuthContext.jsx`)

Global state for the logged-in user. Initialized at app start via `GET /api/auth/me`.

### WebSocket Hook (`client/src/hooks/useWebSocket.js`)

Manages the persistent WS connection. Provides `sendMessage()` and event handler registration. Reconnect logic on connection drop.

### UI Components

Based on **shadcn/ui** (Radix UI Primitives + Tailwind CSS):

- `Dialog`, `AlertDialog`, `DropdownMenu`, `ContextMenu`, `Popover`
- `Select`, `Checkbox`, `Input`, `Textarea`, `Label`
- `Card`, `Badge`, `Button`, `Separator`, `Tabs`, `Table`
- `Toast` / `Toaster` for notifications
- `Calendar` / `DateTimePicker` for expiry date selection
- `Pagination` for paginated lists
- `ScrollArea`, `Tooltip`

---

## 16. Admin Dashboard

The admin dashboard (`/admin/*`) is accessible only to users with `role: 'admin'`.

### Dashboard (`/admin`)

- Total number of users, files, storage usage
- 10 most recently uploaded files
- Live updates via WebSocket (`stats:invalidate`)

### User Management (`/admin/users`)

- All users with file count and storage usage
- Create users, activate/deactivate, change role
- Reset password, regenerate API key
- Change folder name (physical files are moved on the server)
- Delete user (all files are deleted)

### File Management (`/admin/files`)

- All files from all users, paginated
- Search by filename
- Delete file

### Audit Log (`/admin/audit-log`)

- Paginated log of all actions (50/page)
- Filter by username and action
- CSV export for regulatory purposes

### Site Settings (`/admin/site-settings`)

- Operator information (name, address, email)
- Enable Cloudflare Analytics
- File retention period
- Session duration
- Enable/disable registration

### XBackBone Import (`/admin/import`)

- Preview and import from XBackBone SQLite database
- Users are matched by username
- Idempotent (already imported files are skipped)

---

## 17. GDPR / Privacy

| Feature | GDPR Article |
|---|---|
| Privacy policy (configurable) | Art. 13/14 – Transparency |
| Terms of service page (configurable) | Art. 13/14 – Transparency |
| Data export (JSON with URLs) | Art. 20 – Data portability |
| Account self-deletion (files + data) | Art. 17 – Right to erasure |
| Audit log (90-day TTL via MongoDB) | Art. 5(2) – Accountability |
| Audit log CSV export | Art. 5(2) – Accountability |
| Configurable file retention | Art. 5(1)(e) – Storage limitation |
| API keys as SHA-256 hash | Art. 32 – Security |
| Passwords as bcrypt (12 rounds) | Art. 32 – Security |
| Cookie consent for Cloudflare Analytics | Art. 13 – Transparency |
| Anonymization on account deletion | Art. 17 – Right to erasure |

### GDPR Deletion Flow

On account deletion (`user:delete-account` / `DELETE /api/user/account`):
1. All user files are deleted from disk
2. Thumbnails are deleted
3. Avatar is deleted
4. Audit log entries are anonymized (`username: '[deleted]'`, `ip: null`, `userId: null`)
5. User document is deleted
6. Session is destroyed

---

## 18. Background Jobs

### Retention Cleanup (`src/jobs/retentionCleanup.js`)

- **Execution:** On startup and then daily (`setInterval(runRetentionCleanup, 24h)`)
- **Action:** If `SiteSettings.fileRetentionDays > 0`, files older than this value are deleted
- Deletes: file on disk, thumbnail, MongoDB document
- Broadcasts `stats:invalidate` to admins

### MongoDB TTL Indexes (automatic)

| Collection | TTL | Trigger |
|---|---|---|
| `AuditLog` | 90 days | `timestamp` |
| `Collection` | 7 days after `expiresAt` | `expiresAt` |
| `ShareLink` | 7 days after `expiresAt` | `expiresAt` |

---

## 19. Deployment

### Docker (recommended)

```bash
git clone https://github.com/Christianoooooo/sharely.git
cd sharely
cp .env.example .env
# Edit .env (SESSION_SECRET, MONGO passwords, BASE_URL)
docker compose up -d
```

**Services:**
- `app` — Node.js app (port 3000)
- `mongo` — MongoDB 7 (port 127.0.0.1:27017, not externally accessible)

**Volumes:**
- `uploads` — persistent file storage
- `mongo_data` — MongoDB data

**Health checks:** App checks HTTP 200 on `/`, MongoDB checks `db.adminCommand('ping')`.

### Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name files.example.com;

    client_max_body_size 2100M;  # At least as large as the biggest chunk + buffer

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

> `BASE_URL` in `.env` must match the public domain.

### First Start

The first registered user automatically receives the `admin` role (`User.countDocuments() === 0`).

---

## 20. Development Environment

### Prerequisites

- Node.js ≥ 18
- MongoDB (local or via Docker)
- Optional: ffmpeg, ghostscript (for thumbnails)

### Setup

```bash
# Backend
npm install
cp .env.example .env
# Edit .env

# Frontend
cd client
npm install
```

### Starting

```bash
# Backend (port 3000, with nodemon)
npm run dev

# Frontend (port 5173, separate terminal)
cd client
npm run dev
```

The Vite dev server automatically proxies API requests to `localhost:3000`.

### Build

```bash
npm run build   # Builds client/dist/, backend remains unchanged
npm start       # Starts the production Express server
```

---

## 21. Migrations & Scripts

### Automatic Migrations (on every start)

These migrations run at app startup in `app.js` and are idempotent:

| Migration | File | Function |
|---|---|---|
| User folder migration | `src/migrations/migrateUserFolders.js` | Moves files from `uploads/` into `uploads/{folderName}/` |
| API key hash migration | `src/migrations/migrateApiKeyHashes.js` | Converts plaintext API keys to SHA-256 hashes |

### Manual Scripts

```bash
# Generate thumbnails for already existing files
npm run migrate:thumbnails
# or:
node scripts/generate-missing-thumbnails.js

# Move uploads to user folders (manual)
npm run migrate:user-folders
# or:
node scripts/migrate-uploads-to-user-folders.js
```

### Database Initialization (Docker)

`scripts/mongo-init.js` is executed on the first start of the MongoDB container and creates the app user with the correct permissions.

---

## 22. End-to-End Tests

**Framework:** Playwright (`@playwright/test`)

### Test Files

| File | Test Suite |
|---|---|
| `e2e/upload.spec.js` | Upload flows |
| `e2e/gallery.spec.js` | Gallery and file management |
| `e2e/admin.spec.js` | Admin dashboard |
| `e2e/sharelink.spec.js` | Share link creation and usage |
| `e2e/tags.spec.js` | Tag management |
| `e2e/bulk-actions-fixes.spec.js` | Bulk actions |

### Running Tests

```bash
# All tests
npm run test:e2e

# With UI
npm run test:e2e:ui
```

**Playwright configuration:** `playwright.config.js`  
**Global setup:** `e2e/global-setup.js` (creates test users, admin, etc.)  
**Helpers:** `e2e/helpers.js` (shared helper functions)

---

## Appendix: Audit Log Actions

| Action | Trigger |
|---|---|
| `login` | Successful login |
| `logout` | Logout |
| `register` | Registration |
| `upload` | File upload |
| `delete_file` | File deleted |
| `delete_account` | Account deleted |
| `change_password` | Password changed |
| `change_username` | Username changed |
| `change_email` | Email changed |
| `verify_email` | Email verified |
| `forgot_password` | Password reset requested |
| `reset_password` | Password reset |
| `regen_api_key` | API key regenerated |
| `sharex_config` | ShareX configuration downloaded |
| `export_data` | Data export |
| `admin_create_user` | Admin: user created |
| `admin_delete_user` | Admin: user deleted |
| `admin_toggle_user` | Admin: user activated/deactivated |
| `admin_change_role` | Admin: user role changed |
| `admin_change_password` | Admin: password set |
| `admin_regen_key` | Admin: API key regenerated |

---

*Documentation generated from the source code of sharely v1.0.0*
