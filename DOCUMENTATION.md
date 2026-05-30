# Sharely — Technische Dokumentation

> **Version:** 1.0.0 · **Lizenz:** MIT · **Node.js:** ≥ 18

---

## Inhaltsverzeichnis

1. [Projektübersicht](#1-projektübersicht)
2. [Architektur](#2-architektur)
3. [Tech-Stack](#3-tech-stack)
4. [Verzeichnisstruktur](#4-verzeichnisstruktur)
5. [Konfiguration & Umgebungsvariablen](#5-konfiguration--umgebungsvariablen)
6. [Datenmodelle](#6-datenmodelle)
7. [REST API](#7-rest-api)
8. [WebSocket API](#8-websocket-api)
9. [Datei-Serving-Routen](#9-datei-serving-routen)
10. [Authentifizierung & Sicherheit](#10-authentifizierung--sicherheit)
11. [Upload-System](#11-upload-system)
12. [Thumbnail-Generierung](#12-thumbnail-generierung)
13. [E-Mail & SMTP](#13-e-mail--smtp)
14. [Internationalisierung](#14-internationalisierung)
15. [Frontend (React SPA)](#15-frontend-react-spa)
16. [Admin-Dashboard](#16-admin-dashboard)
17. [GDPR / Datenschutz](#17-gdpr--datenschutz)
18. [Hintergrund-Jobs](#18-hintergrund-jobs)
19. [Deployment](#19-deployment)
20. [Entwicklungsumgebung](#20-entwicklungsumgebung)
21. [Migrationen & Skripte](#21-migrationen--skripte)
22. [End-to-End-Tests](#22-end-to-end-tests)

---

## 1. Projektübersicht

Sharely ist eine **selbst gehostete Dateifreigabe-Plattform** mit einer sauberen Web-Oberfläche, ShareX-Integration und API-Zugang. Nutzer laden Screenshots, Dateien und Medien hoch und teilen sie sofort über Kurz-Links.

### Kernfunktionen

| Feature | Beschreibung |
|---|---|
| Web-Upload | Drag-and-Drop, bis zu 500 Dateien gleichzeitig |
| Chunked Upload | Dateien bis 2 GB via parallelem Multi-Part-Upload |
| ShareX-Integration | `.sxcu`-Konfigurationsdatei per Knopfdruck herunterladbar |
| API-Upload | Bearer-Token-Authentifizierung, kompatibel mit curl/wget |
| Datei-Viewer | Bilder zoomen, Videos/Audio streamen (HTTP Range), PDFs inline, Code syntax-highlighted |
| Einbettungsmodi | *embed* (OG/Twitter-Card-HTML) oder *raw* (Direkt-Redirect) |
| Thumbnails | Automatische JPEG-Vorschaubilder für Videos (ffmpeg) und PDFs (ghostscript) |
| Collections | Gruppensammlungen von Dateien mit optionalem Passwort und Ablaufdatum |
| Share-Links | Per-Datei-Links mit Passwort, Ablauf und Download-Limit |
| Echtzeit-UI | WebSocket-basierte Live-Updates (Upload, Delete, View-Counter, Admin-Stats) |
| Mehrsprachigkeit | 8 Sprachen: EN, DE, FR, ES, IT, PT, JA, ZH |
| Admin-Dashboard | Statistiken, Nutzerverwaltung, Dateiverwaltung, Audit-Log (CSV-Export) |
| GDPR-Compliance | Datenschutz-Features nach EU-DSGVO (Art. 17, 20, 32 u. a.) |
| XBackBone-Import | Migration bestehender XBackBone-Installationen |
| Docker-ready | `docker compose up -d` startet die vollständige Umgebung |

---

## 2. Architektur

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

### Datenfluss: Standard-Upload

```
Browser → POST /api/web-upload (multipart/form-data)
       → multer: Datei in uploads/{folderName}/
       → File.createUnique() → MongoDB
       → generateThumbnail() (async, non-blocking)
       → logAudit()
       → broadcast('file:uploaded') via WebSocket
       ← JSON: { files: [...] }
```

### Datenfluss: ShareX-Upload

```
ShareX → POST /upload (token im Formular-Body)
       → multer: Datei temporär in uploads/
       → requireApiKey: Token-Lookup → User
       → fs.renameSync → uploads/{folderName}/
       → File.create() → MongoDB
       ← JSON: { url, delete_url }
```

---

## 3. Tech-Stack

| Schicht | Technologie | Version |
|---|---|---|
| **Laufzeit** | Node.js | ≥ 18 |
| **Backend-Framework** | Express.js | 4.x |
| **Datenbank** | MongoDB + Mongoose | Mongo 7, Mongoose 8.x |
| **Sessions** | express-session + connect-mongo | — |
| **Echtzeit** | WebSocket (`ws`) | 8.x |
| **Datei-Upload** | Multer | 1.x |
| **E-Mail** | Nodemailer | 8.x |
| **Passwort-Hashing** | bcryptjs | 2.x (12 Rounds) |
| **API-Key-Hashing** | SHA-256 (Node Crypto) | — |
| **Rate-Limiting** | express-rate-limit | 8.x |
| **XBackBone-Import** | sql.js | 1.x |
| **Frontend-Framework** | React 18 | 18.3.x |
| **Routing (Frontend)** | React Router v6 | 6.x |
| **Build-Tool** | Vite | 6.x |
| **Styling** | Tailwind CSS + Radix UI | 3.x |
| **UI-Komponenten** | shadcn/ui (Radix primitives) | — |
| **Icons** | FontAwesome | 6.x |
| **i18n** | i18next + react-i18next | — |
| **Syntax-Highlighting** | highlight.js | 11.x |
| **Container** | Docker + Docker Compose | — |
| **Tests** | Playwright (E2E) | 1.60.x |

---

## 4. Verzeichnisstruktur

```
sharely/
├── app.js                          # Express-Einstiegspunkt, Startup-Sequenz
├── package.json
├── .env.example                    # Vorlage für alle Umgebungsvariablen
├── Dockerfile
├── docker-compose.yml
│
├── src/
│   ├── config/
│   │   └── db.js                   # MongoDB-Verbindung (Mongoose)
│   ├── middleware/
│   │   ├── auth.js                 # requireLogin / requireAdmin / requireApiKey
│   │   └── upload.js               # Multer-Konfiguration, Blockliste
│   ├── models/
│   │   ├── AuditLog.js             # Audit-Events (TTL 90 Tage)
│   │   ├── Collection.js           # Dateisammlungen
│   │   ├── File.js                 # Datei-Metadaten
│   │   ├── ShareLink.js            # Per-Datei-Share-Links
│   │   ├── SiteSettings.js         # Singleton: Betreiber-Einstellungen
│   │   └── User.js                 # Nutzerkonten + API-Keys
│   ├── routes/
│   │   ├── api.js                  # Haupt-API (Upload, Gallery, Admin, ...)
│   │   ├── auth.js                 # Login / Register / Password-Reset
│   │   ├── files.js                # Datei-Serving, OG-Embeds, Range-Requests
│   │   ├── import.js               # XBackBone-Migration
│   │   ├── install.js              # Erstinstallations-Endpoint
│   │   └── shares.js               # Share-Link-Datei-Serving
│   ├── jobs/
│   │   └── retentionCleanup.js     # Tägliches Löschen abgelaufener Dateien
│   ├── migrations/
│   │   ├── migrateApiKeyHashes.js  # Einmalig: Plaintexts → SHA-256-Hashes
│   │   └── migrateUserFolders.js   # Einmalig: Dateien in Nutzer-Ordner verschieben
│   ├── utils/
│   │   ├── audit.js                # logAudit()-Hilfsfunktion
│   │   ├── generateThumbnail.js    # ffmpeg / ghostscript Integration
│   │   ├── mailer.js               # Nodemailer-Wrapper + i18n-E-Mail-Templates
│   │   └── sanitizeFilename.js     # Dateiname bereinigen
│   └── ws.js                       # WebSocket-Server + Action-Dispatcher
│
├── client/                         # React-Frontend
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx                # React-Einstiegspunkt
│       ├── App.jsx                 # Router-Konfiguration
│       ├── index.css               # Globale Styles
│       ├── context/
│       │   └── AuthContext.jsx     # Globaler Auth-State
│       ├── hooks/
│       │   ├── use-toast.js        # Toast-Notification-Hook
│       │   └── useWebSocket.js     # WS-Verbindung + Event-Handler
│       ├── components/
│       │   ├── Layout.jsx          # App-Shell (Navbar, Sidebar)
│       │   ├── ProtectedRoute.jsx  # Auth-Guard
│       │   ├── ShareLinkDialog.jsx # Share-Link-Erstell-Dialog
│       │   ├── AddToCollectionDialog.jsx
│       │   ├── CookieBanner.jsx
│       │   ├── LanguageSelector.jsx
│       │   ├── RequireEmailDialog.jsx
│       │   ├── UserAvatar.jsx
│       │   └── ui/                 # shadcn/ui Basis-Komponenten
│       ├── pages/
│       │   ├── Upload.jsx          # Upload-Seite
│       │   ├── Gallery.jsx         # Datei-Galerie
│       │   ├── FileView.jsx        # Datei-Detailansicht
│       │   ├── Collections.jsx     # Sammlungsübersicht
│       │   ├── CollectionView.jsx  # Einzelne Sammlung
│       │   ├── ShareView.jsx       # Öffentliche Share-Link-Seite
│       │   ├── Settings.jsx        # Nutzer-Einstellungen
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   ├── ForgotPassword.jsx
│       │   ├── ResetPassword.jsx
│       │   ├── Install.jsx         # Erstinstallation
│       │   ├── PrivacyPolicy.jsx
│       │   ├── TermsOfService.jsx
│       │   └── admin/
│       │       ├── Dashboard.jsx   # Admin-Startseite
│       │       ├── Users.jsx       # Nutzerverwaltung
│       │       ├── Files.jsx       # Dateiverwaltung
│       │       ├── AuditLog.jsx    # Audit-Log-Ansicht
│       │       ├── SiteSettings.jsx# Betreiber-Einstellungen
│       │       └── Import.jsx      # XBackBone-Import
│       ├── i18n/
│       │   ├── index.js            # i18next-Konfiguration
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
│           └── utils.js            # Tailwind-Helfer (cn())
│
├── scripts/
│   ├── setup-db.js
│   ├── mongo-init.js               # MongoDB-Initialisierungsskript
│   ├── migrate-uploads-to-user-folders.js
│   └── generate-missing-thumbnails.js
│
├── e2e/                            # Playwright-Tests
│   ├── admin.spec.js
│   ├── bulk-actions-fixes.spec.js
│   ├── gallery.spec.js
│   ├── sharelink.spec.js
│   ├── tags.spec.js
│   ├── upload.spec.js
│   ├── helpers.js
│   └── global-setup.js
│
├── uploads/                        # Datei-Uploads (Laufzeit)
│   ├── .thumbnails/
│   ├── .avatars/
│   └── .chunks/                    # Temporäre Chunks
│
└── docs/assets/                    # Screenshots und Logo
```

---

## 5. Konfiguration & Umgebungsvariablen

Alle Variablen werden aus `.env` geladen (via `dotenv`). Die Datei `.env.example` enthält die vollständige Vorlage.

### Pflichtfelder

| Variable | Beschreibung |
|---|---|
| `SESSION_SECRET` | Geheimnis für Session-Verschlüsselung — langer Zufallsstring, z. B. `openssl rand -hex 32` |
| `MONGO_ROOT_PASSWORD` | MongoDB-Root-Passwort (nur für Docker Compose benötigt) |
| `MONGO_APP_PASSWORD` | MongoDB-App-Nutzer-Passwort |

### Alle Umgebungsvariablen

| Variable | Standard | Beschreibung |
|---|---|---|
| `PORT` | `3000` | TCP-Port des HTTP-Servers |
| `MONGODB_URI` | _(aus Docker Compose konstruiert)_ | Vollständige MongoDB-Verbindungs-URI |
| `MONGO_ROOT_PASSWORD` | — | MongoDB-Root-Passwort |
| `MONGO_APP_USER` | `appuser` | MongoDB-App-Nutzername |
| `MONGO_APP_PASSWORD` | — | MongoDB-App-Nutzer-Passwort |
| `MONGO_DB_NAME` | `sharely` | MongoDB-Datenbankname |
| `SESSION_SECRET` | — | **Pflicht** — Session-Verschlüsselungsgeheimnis |
| `BASE_URL` | `http://localhost:3000` | Öffentliche Basis-URL für generierte Share-Links (kein abschließendes `/`) |
| `SITE_NAME` | `sharely` | Sitename in Open Graph Embeds |
| `MAX_FILE_SIZE_MB` | `100` | Maximale Dateigröße für Standard-Uploads in MB (Chunked Uploads bis 2 GB unabhängig davon) |
| `ALLOW_REGISTRATION` | `true` | `false` deaktiviert öffentliche Registrierung |
| `SMTP_HOST` | — | SMTP-Server-Hostname; leer lassen = E-Mail-Features deaktiviert |
| `SMTP_PORT` | `587` | SMTP-Port |
| `SMTP_SECURE` | `false` | `true` für implizites TLS (Port 465), `false` für STARTTLS |
| `SMTP_USER` | — | SMTP-Benutzername |
| `SMTP_PASS` | — | SMTP-Passwort |
| `SMTP_FROM` | _(SMTP_USER)_ | Absenderadresse in ausgehenden E-Mails |
| `UPLOAD_DIR` | `./uploads` | Absoluter Pfad zum Upload-Verzeichnis |
| `NODE_ENV` | — | `production` aktiviert sichere Cookies |

---

## 6. Datenmodelle

### User (`src/models/User.js`)

```
{
  username:                    String (3–32, unique, alphanumerisch + _-)
  password:                    String (bcrypt, 12 Rounds)
  role:                        'admin' | 'user'
  apiKey:                      String (Legacy, nach Migration leer)
  apiKeyHash:                  String (SHA-256, unique, sparse)
  apiKeyPrefix:                String (erste 8 Zeichen des Klartexts)
  folderName:                  String (unique, sparse, max 64)
  avatarExt:                   String | null (.jpg/.png/.gif/.webp)
  embedMode:                   'embed' | 'raw'
  isActive:                    Boolean
  email:                       String (lowercase, unique, sparse)
  emailVerified:               Boolean
  emailVerificationToken:      String | null (SHA-256-Hash des Klartexts)
  emailVerificationExpires:    Date | null
  passwordResetToken:          String | null (SHA-256-Hash)
  passwordResetExpires:        Date | null
  language:                    'en'|'de'|'fr'|'es'|'it'|'pt'|'ja'|'zh'
  predefinedTags:              [String] (max 100 Tags × 50 Zeichen)
  createdAt:                   Date
}
```

**Wichtige Methoden:**
- `user.comparePassword(candidate)` — bcrypt-Vergleich
- `user.regenerateApiKey()` — generiert neuen Plaintext, speichert Hash, gibt Plaintext zurück (einmalig sichtbar)
- `User.findByApiKey(plaintext)` — sucht nach SHA-256-Hash, nur aktive Nutzer

### File (`src/models/File.js`)

```
{
  shortId:      String (8 Hex-Zeichen: 6 Timestamp + 2 Random, unique)
  deleteToken:  String (32 Hex-Zeichen, unique)
  originalName: String (sanitisiert)
  storedName:   String (relativer Pfad: "folderName/8hex.ext")
  mimeType:     String
  size:         Number (Bytes)
  uploader:     ObjectId → User
  views:        Number
  tags:         [String] (max 20 × 50 Zeichen)
  createdAt:    Date
}
```

**Virtuals:**
- `sizeHuman` — lesbare Größe (B / KB / MB / GB)
- `displayType` — Klassifikation: `image|video|audio|pdf|code|text|file`

**Short-ID-Algorithmus:**
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

> Abgelaufene Collections werden nach 7 weiteren Tagen durch MongoDB-TTL-Index automatisch gelöscht.

### ShareLink (`src/models/ShareLink.js`)

```
{
  token:         String (32 Hex, unique)
  file:          ObjectId → File
  createdBy:     ObjectId → User
  label:         String (max 100)
  password:      String | null (bcrypt)
  expiresAt:     Date | null
  downloadLimit: Number (-1 = unbegrenzt)
  downloadCount: Number
  createdAt:     Date
}
```

> Wie Collections: 7 Tage Karenzzeit nach Ablauf via TTL-Index.

### SiteSettings (`src/models/SiteSettings.js`)

Singleton-Dokument (`_id: 'singleton'`):

```
{
  operatorName:        String
  operatorAddress:     String
  operatorEmail:       String
  cloudflareAnalytics: Boolean
  fileRetentionDays:   Number (0 = deaktiviert)
  encryptionAtRest:    Boolean
  sessionDurationDays: Number (Standard: 7)
  allowRegistration:   Boolean
}
```

### AuditLog (`src/models/AuditLog.js`)

```
{
  timestamp: Date (TTL-Index: 90 Tage)
  userId:    ObjectId → User | null
  username:  String | null
  action:    String
  ip:        String | null
  meta:      Mixed (action-spezifische Metadaten)
}
```

---

## 7. REST API

### Basis-URL: `/api`

Alle JSON-Endpunkte geben `Content-Type: application/json` zurück. Fehler: `{ "error": "Nachricht" }`.

---

### Authentifizierung (`/api/auth`)

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/me` | Session | Eingeloggter Nutzer |
| `POST` | `/login` | — | Einloggen (rate-limited: 10/15min) |
| `POST` | `/register` | — | Registrieren (rate-limited, erster Nutzer wird Admin) |
| `POST` | `/logout` | — | Ausloggen |
| `GET` | `/smtp-enabled` | — | Prüft ob SMTP konfiguriert ist |
| `GET` | `/verify-email?token=` | — | E-Mail-Adresse bestätigen |
| `GET` | `/verify-reset-token?token=` | — | Reset-Token prüfen |
| `POST` | `/forgot-password` | — | Passwort-Reset-E-Mail senden (rate-limited: 5/Std.) |
| `POST` | `/reset-password` | — | Neues Passwort setzen |

**Login-Request:**
```json
POST /api/auth/login
{ "username": "max", "password": "meinPasswort123" }
```

**Login-Response:**
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

### Datei-Upload

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `POST` | `/upload` | API-Key | ShareX-Upload (Legacy-Endpoint in `app.js`) |
| `POST` | `/api/upload` | API-Key | ShareX/API-Upload (Feld: `file`) |
| `POST` | `/api/web-upload` | Session | Web-Upload (Feld: `files[]`, max 500) |
| `POST` | `/api/chunk/init` | Session | Chunked Upload initialisieren |
| `POST` | `/api/chunk/:uploadId` | Session | Einen Chunk hochladen (Feld: `chunk`) |
| `POST` | `/api/chunk/:uploadId/complete` | Session | Chunks zusammenführen |
| `DELETE` | `/api/chunk/:uploadId` | Session | Upload abbrechen & aufräumen |

**API-Upload-Response:**
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

#### Chunked-Upload-Flow

1. `POST /api/chunk/init` → `{ uploadId: "32hex" }`
2. `POST /api/chunk/:uploadId` (Body: `chunkIndex=N`, File: `chunk`) → `{ received: N }`  
   Parallel mit 3–5 gleichzeitigen Chunks
3. `POST /api/chunk/:uploadId/complete` → `{ files: [fileObject] }`

---

### Dateiverwaltung

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/api/gallery` | Session | Eigene Dateien (Admin: alle), paginiert (24/Seite), Filter: `q`, `type`, `tag`, `page` |
| `GET` | `/api/file/:shortId` | — | Datei-Metadaten (inkrementiert View-Counter) |
| `PATCH` | `/api/file/:shortId` | Session | Tags/Name aktualisieren |
| `DELETE` | `/api/file/:shortId` | Session | Datei löschen |
| `DELETE` | `/api/delete/:shortId` | API-Key | Datei löschen (API-Key-Auth) |
| `POST` | `/api/files/bulk` | Session | Bulk-Aktionen: `delete`, `tag`, `removeTag`, `addToCollection`, `moveToCollection` |
| `GET` | `/api/tags` | Session | Alle Tag-Vorschläge des Nutzers |

**Gallery-Query-Parameter:**
- `q` — Suche im Dateinamen (regex-sicher)
- `type` — `all|image|video|audio|pdf|code`
- `tag` — Exakter Tag-Filter
- `page` — Seite (Standard: 1)

---

### Nutzer-Einstellungen

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/api/my-key` | Session | API-Key-Prefix anzeigen |
| `POST` | `/api/regen-key` | Session | API-Key neu generieren |
| `GET` | `/api/sharex-config` | Session | ShareX `.sxcu` herunterladen (regeneriert Key) |
| `PATCH` | `/api/user/username` | Session | Benutzername ändern (Passwort erforderlich) |
| `PATCH` | `/api/user/password` | Session | Passwort ändern |
| `PATCH` | `/api/user/email` | Session | E-Mail ändern (sendet Bestätigungs-E-Mail) |
| `PATCH` | `/api/user/language` | Session | UI-Sprache setzen |
| `PATCH` | `/api/user/embed-mode` | Session | Embed-Modus setzen (`embed`/`raw`) |
| `POST` | `/api/user/resend-verification` | Session | Bestätigungs-E-Mail erneut senden |
| `GET` | `/api/user/export` | Session | Daten-Export (GDPR Art. 20) als JSON |
| `DELETE` | `/api/user/account` | Session | Account löschen (GDPR Art. 17, Passwort erforderlich) |
| `GET` | `/api/user/predefined-tags` | Session | Vordefinierte Tags abrufen |
| `PATCH` | `/api/user/predefined-tags` | Session | Vordefinierte Tags aktualisieren |
| `POST` | `/api/user/avatar` | Session | Avatar hochladen (max 2 MB, JPEG/PNG/GIF/WebP) |
| `DELETE` | `/api/user/avatar` | Session | Avatar löschen |
| `GET` | `/api/user/avatar/:userId` | — | Avatar servieren |

---

### Share-Links

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/api/file/:shortId/share-links` | Session (Owner/Admin) | Alle Share-Links einer Datei |
| `POST` | `/api/file/:shortId/share-links` | Session (Owner/Admin) | Share-Link erstellen |
| `DELETE` | `/api/share-links/:token` | Session (Owner/Creator/Admin) | Share-Link löschen |
| `GET` | `/api/share-links/:token` | — | Share-Link-Metadaten (öffentlich) |
| `POST` | `/api/share-links/:token/verify` | — | Share-Link-Passwort prüfen |

**Share-Link erstellen:**
```json
POST /api/file/a1b2c3d4/share-links
{
  "label": "Für Kollegen",
  "password": "geheim",
  "expiresAt": "2025-12-31T23:59:59Z",
  "downloadLimit": 10
}
```

---

### Collections

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/api/collections` | Session | Eigene Collections (Admin: alle) |
| `POST` | `/api/collections` | Session | Collection erstellen |
| `GET` | `/api/collections/:id` | — | Collection anzeigen (öffentlich, ggf. Passwort) |
| `PATCH` | `/api/collections/:id` | Session (Owner/Admin) | Collection aktualisieren |
| `DELETE` | `/api/collections/:id` | Session (Owner/Admin) | Collection löschen |
| `POST` | `/api/collections/:id/files` | Session (Owner/Admin) | Datei zur Collection hinzufügen |
| `DELETE` | `/api/collections/:id/files/:fileShortId` | Session (Owner/Admin) | Datei aus Collection entfernen |
| `POST` | `/api/collections/:id/verify` | — | Collection-Passwort prüfen |

---

### Admin-Endpunkte

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/api/admin/stats` | Admin | Dashboard-Statistiken |
| `GET` | `/api/admin/users` | Admin | Alle Nutzer (inkl. Datei-Counts) |
| `POST` | `/api/admin/users` | Admin | Nutzer erstellen |
| `PATCH` | `/api/admin/users/:id/toggle` | Admin | Nutzer aktivieren/deaktivieren |
| `PATCH` | `/api/admin/users/:id/role` | Admin | Nutzer-Rolle ändern |
| `DELETE` | `/api/admin/users/:id` | Admin | Nutzer löschen |
| `POST` | `/api/admin/users/:id/regen-key` | Admin | API-Key regenerieren |
| `PATCH` | `/api/admin/users/:id/password` | Admin | Passwort setzen |
| `PATCH` | `/api/admin/users/:id/folder` | Admin | Ordnername ändern (verschiebt Dateien) |
| `GET` | `/api/admin/files` | Admin | Alle Dateien, paginiert (30/Seite) |
| `GET` | `/api/admin/site-settings` | Admin | Betreiber-Einstellungen lesen |
| `PATCH` | `/api/admin/site-settings` | Admin | Betreiber-Einstellungen aktualisieren |
| `GET` | `/api/admin/audit-log` | Admin | Paginierter Audit-Log (50/Seite) |
| `GET` | `/api/admin/audit-log/export` | Admin | Audit-Log als CSV herunterladen |
| `GET` | `/api/site-settings` | — | Öffentliche Betreiber-Infos (für Datenschutzseite) |

---

### Site-Settings (öffentlich)

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

**Verbindung:** `wss://example.com/ws` (nur für eingeloggte Nutzer, Session-Cookie erforderlich)

### Protokoll

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

### Verfügbare Actions

| Action | Auth | Beschreibung |
|---|---|---|
| `site-settings:get` | — | Öffentliche Site-Einstellungen |
| `auth:me` | User | Eigene Nutzer-Daten |
| `file:get` | User | Datei-Details (inkrementiert Views) |
| `file:list` | User | Dateiliste mit Filter/Paginierung |
| `file:delete` | User | Datei löschen |
| `user:get-key` | User | API-Key-Prefix |
| `user:regen-key` | User | API-Key neu generieren |
| `user:change-password` | User | Passwort ändern |
| `user:change-username` | User | Benutzername ändern |
| `user:change-email` | User | E-Mail ändern |
| `user:change-language` | User | Sprache setzen |
| `user:change-embed-mode` | User | Embed-Modus setzen |
| `user:resend-verification` | User | Bestätigungs-E-Mail erneut senden |
| `user:export` | User | Daten-Export |
| `user:delete-account` | User | Account löschen |
| `admin:stats` | Admin | Dashboard-Statistiken |
| `admin:settings:get` | Admin | Site-Einstellungen lesen |
| `admin:settings:update` | Admin | Site-Einstellungen aktualisieren |
| `admin:users:list` | Admin | Alle Nutzer |
| `admin:users:create` | Admin | Nutzer erstellen |
| `admin:users:toggle` | Admin | Nutzer aktivieren/deaktivieren |
| `admin:users:role` | Admin | Nutzer-Rolle ändern |
| `admin:users:delete` | Admin | Nutzer löschen |
| `admin:users:regen-key` | Admin | API-Key regenerieren |
| `admin:users:password` | Admin | Passwort setzen |
| `admin:users:folder` | Admin | Ordnername ändern |
| `admin:files:list` | Admin | Alle Dateien |
| `admin:audit-log:list` | Admin | Paginierter Audit-Log |

### Broadcast-Events

| Event | Empfänger | Payload |
|---|---|---|
| `file:uploaded` | Uploader | `{ shortId, uploaderId }` |
| `file:deleted` | Datei-Owner | `{ shortId, uploaderId }` |
| `file:view` | Alle | `{ shortId, views }` |
| `user:created` | Admins | `{ id, username, role, ... }` |
| `user:deleted` | Admins | `{ id }` |
| `user:updated` | Admins | `{ id, ...geänderte Felder }` |
| `audit:log` | Admins | Vollständiges AuditLog-Objekt |
| `settings:updated` | Admins | Aktualisiertes SiteSettings-Objekt |
| `stats:invalidate` | Admins | `{}` (Stats-Refresh auslösen) |

---

## 9. Datei-Serving-Routen

### `/f/:shortId` — Datei-Viewer

- **Browser-Aufruf:** Leitet zur React-SPA (`index.html`) durch — SPA rendert den Viewer.
- **Social-Media-Bot** (Discord, Telegram, Twitter, etc.): Liefert eine minimale HTML-Seite mit Open Graph / Twitter Card Meta-Tags.
  - `embedMode = 'embed'`: OG-HTML mit Redirect
  - `embedMode = 'raw'` + Bild/Video/Audio: HTTP 302 → `/f/:shortId/raw`

### `/f/:shortId/raw` — Direktzugriff

Liefert die Datei als HTTP-Response mit Range-Request-Unterstützung (206 Partial Content). Bilder/Videos/Audio: `Content-Disposition: inline`, andere: `attachment`.

### `/f/:shortId/download` — Force-Download

Wie `/raw`, aber immer `Content-Disposition: attachment`.

### `/f/:shortId/thumb` — Thumbnail

Liefert JPEG-Thumbnail (für Videos und PDFs). `Cache-Control: public, max-age=86400`.

### `/f/:shortId/delete/:token` — ShareX-Deletion

Löscht Datei ohne Session via eindeutigem Delete-Token.

### `/s/:token` — Share-Link-Datei-Serving (`src/routes/shares.js`)

Prüft Passwort (via Session-Flag), Ablaufdatum und Download-Limit, dann liefert die Datei aus.

---

## 10. Authentifizierung & Sicherheit

### Session-Authentifizierung

- Express-Session mit MongoDB-Store (`connect-mongo`)
- Session-Cookie: `httpOnly: true`, `sameSite: 'strict'`, `secure: true` in Production
- Session-Dauer: konfigurierbar über `SiteSettings.sessionDurationDays` (Standard: 7 Tage), Live-gecacht für 60 Sekunden

### API-Key-Authentifizierung

- API-Keys werden als SHA-256-Hash gespeichert, nie im Klartext
- Die ersten 8 Zeichen werden als `apiKeyPrefix` gespeichert (für Anzeigezwecke)
- Lookup: `User.findByApiKey(plaintext)` berechnet Hash und sucht in `apiKeyHash`
- Beim Download der ShareX-Konfiguration wird der Key neu generiert — der Plaintext ist nur in diesem Moment sichtbar

### Middleware-Kette (`src/middleware/auth.js`)

```
requireLogin    → prüft req.session.user → 401 wenn nicht eingeloggt
requireAdmin    → wie requireLogin, zusätzlich role === 'admin' → 403
requireApiKey   → prüft Authorization-Header oder req.body.token
```

### CSRF-Schutz

`requireSameOrigin()` in `app.js` vergleicht `Origin`-Header mit `Host`-Header für alle API-Routen. Ergänzt `sameSite: 'strict'`-Cookies.

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

### Security-Headers

- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`

### Rate-Limiting

| Endpunkt | Limit | Fenster |
|---|---|---|
| Upload (`/upload`, `/api/upload`, `/api/web-upload`) | 60 Requests | 15 Minuten |
| Auth (`/api/auth/login`, `/register`, etc.) | 10 Requests | 15 Minuten |
| Passwort-Reset | 5 Requests | 1 Stunde |

### Datei-Blockliste

Folgende MIME-Types und Erweiterungen werden auf Upload abgelehnt:

**Blockierte MIME-Types:** `application/x-executable`, `application/x-sh`, `application/x-csh`, `application/x-bat`

**Blockierte Erweiterungen:** `.bat`, `.cmd`, `.com`, `.ps1`, `.psm1`, `.psd1`, `.sh`, `.bash`, `.csh`, `.zsh`, `.fish`, `.vbs`, `.vbe`, `.jse`, `.scr`, `.pif`, `.application`, `.gadget`, `.hta`, `.php`, `.php3–5`, `.phtml`, `.asp`, `.aspx`, `.jsp`, `.jspx`, `.cfm`

### Path-Traversal-Schutz

Alle Datei-Zugriffe über `resolveUploadPath()` prüfen, ob der aufgelöste Pfad innerhalb von `UPLOAD_DIR` liegt.

---

## 11. Upload-System

### Standard-Upload (Multer)

- **Storage:** `multer.diskStorage` → `uploads/{folderName}/{8hex}{.ext}`
- **Dateiname:** `crypto.randomBytes(4).hex() + original-extension`
- **Limit:** `MAX_FILE_SIZE_MB` (Standard: 100 MB)
- **Speicherort:** Nutzer-spezifischer Ordner (`user.folderName`)

### Chunked Upload (>250 MB)

Der Frontend-Client wechselt automatisch in den Chunked-Modus für große Dateien.

**Server-seitige Verzeichnisstruktur:**
```
uploads/.chunks/{uploadId}/
  meta.json          { filename, mimeType, totalSize, totalChunks, userId, createdAt }
  chunk-0
  chunk-1
  ...
  chunk-N
```

**Chunk-Größe:** 10–20 MB (max 51 MB akzeptiert für Rückwärtskompatibilität)  
**Parallelität:** 3–5 gleichzeitige Chunk-Uploads  
**Assemblierung:** Stream-basiert (kein vollständiges Laden in RAM)

### Avatar-Upload

- **Storage:** `multer.memoryStorage()` (kein Festplatten-Zwischenspeicher)
- **Speicherort:** `uploads/.avatars/{userId}{.ext}`
- **Limit:** 2 MB
- **Formate:** JPEG, PNG, GIF, WebP

---

## 12. Thumbnail-Generierung

Thumbnails werden asynchron nach dem Upload generiert (`.catch(() => {})` — Fehler werden ignoriert).

### Video-Thumbnails (ffmpeg)

```bash
ffmpeg -y -i <file> -ss 00:00:01 -vframes 1 \
  -vf "scale=320:320:force_original_aspect_ratio=increase,crop=320:320" \
  -q:v 3 uploads/.thumbnails/<shortId>.jpg
```

### PDF-Thumbnails (Ghostscript)

```bash
gs -dNOPAUSE -dBATCH -dSAFER \
  -sDEVICE=jpeg -dFirstPage=1 -dLastPage=1 \
  -r72 -dJPEGQ=85 \
  -sOutputFile=uploads/.thumbnails/<shortId>.jpg \
  <file>
```

**Timeout:** 30 Sekunden pro Thumbnail-Generierung  
**Fallback:** Wenn ffmpeg/ghostscript nicht verfügbar, wird die Generierung lautlos übersprungen.

### Backfill-Skript

```bash
npm run migrate:thumbnails
# oder im Container:
docker exec -it <container> npm run migrate:thumbnails
```

---

## 13. E-Mail & SMTP

### Konfiguration

SMTP wird aktiviert, wenn `SMTP_HOST` gesetzt ist. `mailer.isConfigured()` prüft diesen Wert.

### E-Mail-Templates

Alle E-Mails werden in der Sprache des Nutzers gesendet (8 Sprachen). Templates sind in `src/utils/mailer.js` eingebettet.

**Gesendete E-Mail-Typen:**

| Typ | Trigger | Token-Gültigkeit |
|---|---|---|
| E-Mail-Bestätigung | Registrierung, E-Mail-Änderung | 24 Stunden |
| Passwort-Reset | `POST /api/auth/forgot-password` | 1 Stunde |

### Token-Sicherheit

- Tokens: `crypto.randomBytes(32).hex()` (64 Hex-Zeichen)
- Gespeichert: SHA-256-Hash des Tokens
- E-Mail enthält Klartext-Token als URL-Parameter
- Verifizierung: Hash des eingehenden Tokens gegen gespeicherten Hash

---

## 14. Internationalisierung

**Bibliothek:** i18next + react-i18next + i18next-browser-languagedetector

**Unterstützte Sprachen:**

| Code | Sprache |
|---|---|
| `en` | English |
| `de` | Deutsch |
| `fr` | Français |
| `es` | Español |
| `it` | Italiano |
| `pt` | Português |
| `ja` | 日本語 |
| `zh` | 中文 |

**Sprachauswahl:**
1. Browser-Language-Detection (automatisch)
2. Nutzer-Einstellung in der Datenbank (`user.language`)
3. Persistierung über `PATCH /api/user/language`

Übersetzungsdateien: `client/src/i18n/locales/{code}.json`

---

## 15. Frontend (React SPA)

### Router-Konfiguration (`client/src/App.jsx`)

| Route | Komponente | Auth |
|---|---|---|
| `/` | Redirect → `/gallery` | Nein |
| `/auth/login` | Login.jsx | Nein |
| `/auth/register` | Register.jsx | Nein |
| `/auth/forgot-password` | ForgotPassword.jsx | Nein |
| `/auth/reset-password` | ResetPassword.jsx | Nein |
| `/install` | Install.jsx | Nein |
| `/upload` | Upload.jsx | **Ja** |
| `/gallery` | Gallery.jsx | **Ja** |
| `/f/:shortId` | FileView.jsx | **Ja** |
| `/collections` | Collections.jsx | **Ja** |
| `/c/:id` | CollectionView.jsx | Nein (öffentlich) |
| `/s/:token` | ShareView.jsx | Nein (öffentlich) |
| `/settings` | Settings.jsx | **Ja** |
| `/admin` | Dashboard.jsx | **Admin** |
| `/admin/users` | Users.jsx | **Admin** |
| `/admin/files` | Files.jsx | **Admin** |
| `/admin/audit-log` | AuditLog.jsx | **Admin** |
| `/admin/site-settings` | SiteSettings.jsx | **Admin** |
| `/admin/import` | Import.jsx | **Admin** |
| `/privacy` | PrivacyPolicy.jsx | Nein |
| `/terms` | TermsOfService.jsx | Nein |

### Auth-Context (`client/src/context/AuthContext.jsx`)

Globaler State für den eingeloggten Nutzer. Wird beim App-Start via `GET /api/auth/me` initialisiert.

### WebSocket-Hook (`client/src/hooks/useWebSocket.js`)

Verwaltet die persistente WS-Verbindung. Stellt `sendMessage()` und Event-Handler-Registration bereit. Reconnect-Logik bei Verbindungsabbruch.

### UI-Komponenten

Basiert auf **shadcn/ui** (Radix UI Primitives + Tailwind CSS):

- `Dialog`, `AlertDialog`, `DropdownMenu`, `ContextMenu`, `Popover`
- `Select`, `Checkbox`, `Input`, `Textarea`, `Label`
- `Card`, `Badge`, `Button`, `Separator`, `Tabs`, `Table`
- `Toast` / `Toaster` für Benachrichtigungen
- `Calendar` / `DateTimePicker` für Ablaufdatum-Auswahl
- `Pagination` für paginierte Listen
- `ScrollArea`, `Tooltip`

---

## 16. Admin-Dashboard

Das Admin-Dashboard (`/admin/*`) ist nur für Nutzer mit `role: 'admin'` zugänglich.

### Dashboard (`/admin`)

- Gesamtanzahl Nutzer, Dateien, Speicherverbrauch
- 10 zuletzt hochgeladene Dateien
- Live-Updates via WebSocket (`stats:invalidate`)

### Nutzerverwaltung (`/admin/users`)

- Alle Nutzer mit Datei-Count und Speichernutzung
- Nutzer erstellen, aktivieren/deaktivieren, Rolle ändern
- Passwort zurücksetzen, API-Key regenerieren
- Ordnername ändern (physische Dateien werden auf dem Server verschoben)
- Nutzer löschen (alle Dateien werden gelöscht)

### Dateiverwaltung (`/admin/files`)

- Alle Dateien aller Nutzer, paginiert
- Suche nach Dateiname
- Datei löschen

### Audit-Log (`/admin/audit-log`)

- Paginierter Log aller Aktionen (50/Seite)
- Filter nach Nutzername und Aktion
- CSV-Export für regulatorische Zwecke

### Site-Einstellungen (`/admin/site-settings`)

- Betreiber-Informationen (Name, Adresse, E-Mail)
- Cloudflare Analytics aktivieren
- Datei-Retention-Zeitraum
- Session-Dauer
- Registrierung aktivieren/deaktivieren

### XBackBone-Import (`/admin/import`)

- Vorschau und Import aus XBackBone SQLite-Datenbank
- Nutzer werden nach Username gematcht
- Idempotent (bereits importierte Dateien werden übersprungen)

---

## 17. GDPR / Datenschutz

| Feature | DSGVO-Artikel |
|---|---|
| Datenschutzerklärung (konfigurierbar) | Art. 13/14 – Transparenz |
| AGB-Seite (konfigurierbar) | Art. 13/14 – Transparenz |
| Daten-Export (JSON mit URLs) | Art. 20 – Datenportabilität |
| Account-Selbstlöschung (Dateien + Daten) | Art. 17 – Löschrecht |
| Audit-Log (90-Tage-TTL via MongoDB) | Art. 5(2) – Rechenschaftspflicht |
| Audit-Log-CSV-Export | Art. 5(2) – Rechenschaftspflicht |
| Konfigurierbarer Datei-Retention | Art. 5(1)(e) – Speicherbegrenzung |
| API-Keys als SHA-256-Hash | Art. 32 – Sicherheit |
| Passwörter als bcrypt (12 Rounds) | Art. 32 – Sicherheit |
| Cookie-Consent für Cloudflare Analytics | Art. 13 – Transparenz |
| Anonymisierung bei Account-Löschung | Art. 17 – Löschrecht |

### GDPR-Lösch-Flow

Bei Account-Löschung (`user:delete-account` / `DELETE /api/user/account`):
1. Alle Dateien des Nutzers werden von der Festplatte gelöscht
2. Thumbnails werden gelöscht
3. Avatar wird gelöscht
4. Audit-Log-Einträge werden anonymisiert (`username: '[deleted]'`, `ip: null`, `userId: null`)
5. User-Dokument wird gelöscht
6. Session wird zerstört

---

## 18. Hintergrund-Jobs

### Retention-Cleanup (`src/jobs/retentionCleanup.js`)

- **Ausführung:** Beim Start und dann täglich (`setInterval(runRetentionCleanup, 24h)`)
- **Aktion:** Wenn `SiteSettings.fileRetentionDays > 0`, werden Dateien gelöscht, die älter als dieser Wert sind
- Löscht: Datei auf Festplatte, Thumbnail, MongoDB-Dokument
- Broadcastet `stats:invalidate` an Admins

### MongoDB-TTL-Indizes (automatisch)

| Collection | TTL | Trigger |
|---|---|---|
| `AuditLog` | 90 Tage | `timestamp` |
| `Collection` | 7 Tage nach `expiresAt` | `expiresAt` |
| `ShareLink` | 7 Tage nach `expiresAt` | `expiresAt` |

---

## 19. Deployment

### Docker (empfohlen)

```bash
git clone https://github.com/Christianoooooo/sharely.git
cd sharely
cp .env.example .env
# .env bearbeiten (SESSION_SECRET, MONGO-Passwörter, BASE_URL)
docker compose up -d
```

**Services:**
- `app` — Node.js-App (Port 3000)
- `mongo` — MongoDB 7 (Port 127.0.0.1:27017, nicht von außen erreichbar)

**Volumes:**
- `uploads` — Persistente Datei-Ablage
- `mongo_data` — MongoDB-Daten

**Health-Checks:** App prüft HTTP 200 auf `/`, MongoDB prüft `db.adminCommand('ping')`.

### Nginx-Reverse-Proxy

```nginx
server {
    listen 443 ssl;
    server_name files.example.com;

    client_max_body_size 2100M;  # Mind. so groß wie größter Chunk + Puffer

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket-Support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

> `BASE_URL` in `.env` muss der öffentlichen Domain entsprechen.

### Erster Start

Der erste registrierte Nutzer erhält automatisch die `admin`-Rolle (`User.countDocuments() === 0`).

---

## 20. Entwicklungsumgebung

### Voraussetzungen

- Node.js ≥ 18
- MongoDB (lokal oder via Docker)
- Optional: ffmpeg, ghostscript (für Thumbnails)

### Setup

```bash
# Backend
npm install
cp .env.example .env
# .env anpassen

# Frontend
cd client
npm install
```

### Starten

```bash
# Backend (Port 3000, mit nodemon)
npm run dev

# Frontend (Port 5173, separates Terminal)
cd client
npm run dev
```

Der Vite-Dev-Server proxyt API-Requests automatisch an `localhost:3000`.

### Build

```bash
npm run build   # Baut client/dist/, Backend bleibt unverändert
npm start       # Startet produktiven Express-Server
```

---

## 21. Migrationen & Skripte

### Automatische Migrationen (bei jedem Start)

Diese Migrationen laufen beim App-Start in `app.js` und sind idempotent:

| Migration | Datei | Funktion |
|---|---|---|
| User-Folder-Migration | `src/migrations/migrateUserFolders.js` | Verschiebt Dateien aus `uploads/` in `uploads/{folderName}/` |
| API-Key-Hash-Migration | `src/migrations/migrateApiKeyHashes.js` | Konvertiert Klartext-API-Keys zu SHA-256-Hashes |

### Manuelle Skripte

```bash
# Thumbnails für bereits vorhandene Dateien generieren
npm run migrate:thumbnails
# oder:
node scripts/generate-missing-thumbnails.js

# Uploads in Nutzer-Ordner verschieben (manuell)
npm run migrate:user-folders
# oder:
node scripts/migrate-uploads-to-user-folders.js
```

### Datenbankinitialisierung (Docker)

`scripts/mongo-init.js` wird beim ersten Start des MongoDB-Containers ausgeführt und erstellt den App-Nutzer mit den richtigen Berechtigungen.

---

## 22. End-to-End-Tests

**Framework:** Playwright (`@playwright/test`)

### Test-Dateien

| Datei | Testsuite |
|---|---|
| `e2e/upload.spec.js` | Upload-Flows |
| `e2e/gallery.spec.js` | Galerie und Datei-Verwaltung |
| `e2e/admin.spec.js` | Admin-Dashboard |
| `e2e/sharelink.spec.js` | Share-Link-Erstellung und -Nutzung |
| `e2e/tags.spec.js` | Tag-Verwaltung |
| `e2e/bulk-actions-fixes.spec.js` | Bulk-Aktionen |

### Ausführen

```bash
# Alle Tests
npm run test:e2e

# Mit UI
npm run test:e2e:ui
```

**Playwright-Konfiguration:** `playwright.config.js`  
**Global Setup:** `e2e/global-setup.js` (erstellt Test-Nutzer, -Admin etc.)  
**Helfer:** `e2e/helpers.js` (gemeinsame Hilfsfunktionen)

---

## Anhang: Audit-Log-Aktionen

| Aktion | Trigger |
|---|---|
| `login` | Erfolgreicher Login |
| `logout` | Logout |
| `register` | Registrierung |
| `upload` | Datei-Upload |
| `delete_file` | Datei gelöscht |
| `delete_account` | Account gelöscht |
| `change_password` | Passwort geändert |
| `change_username` | Benutzername geändert |
| `change_email` | E-Mail geändert |
| `verify_email` | E-Mail bestätigt |
| `forgot_password` | Passwort-Reset angefordert |
| `reset_password` | Passwort zurückgesetzt |
| `regen_api_key` | API-Key regeneriert |
| `sharex_config` | ShareX-Konfiguration heruntergeladen |
| `export_data` | Daten-Export |
| `admin_create_user` | Admin: Nutzer erstellt |
| `admin_delete_user` | Admin: Nutzer gelöscht |
| `admin_toggle_user` | Admin: Nutzer aktiviert/deaktiviert |
| `admin_change_role` | Admin: Nutzer-Rolle geändert |
| `admin_change_password` | Admin: Passwort gesetzt |
| `admin_regen_key` | Admin: API-Key regeneriert |

---

*Dokumentation generiert aus dem Quellcode von sharely v1.0.0*
