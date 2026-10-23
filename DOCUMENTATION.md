# Sharely — Technische Dokumentation

> **Version:** 1.0.0 · **Lizenz:** MIT · **Node.js:** ≥ 22

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
       → normalizeMime(): MIME-Typ auf genau einen "typ/subtyp" reduzieren
       → stripIfEnabled(): Bild-Metadaten entfernen (falls aktiviert)
       → sealUpload(): mit ENCRYPTION_KEY verschlüsseln (sonst unverändert)
       → File.createUnique() → MongoDB
       → startThumbnail() (async, non-blocking; danach Klartext-Kopie löschen)
       → logAudit()
       → broadcast('file:uploaded') via WebSocket
       ← JSON: { files: [...] }
```

### Datenfluss: ShareX-Upload

```
ShareX → POST /upload (token im Formular-Body)
       → multer: Datei temporär in uploads/
       → requireApiKey: Token-Lookup → User (bei Fehler wird die Datei sofort gelöscht)
       → fs.renameSync → uploads/{folderName}/
       → normalizeMime() · sealUpload() · File.createUnique() → MongoDB
       → startThumbnail()
       ← JSON: { url, delete_url }
```

---

## 3. Tech-Stack

| Schicht | Technologie | Version |
|---|---|---|
| **Laufzeit** | Node.js | ≥ 22 |
| **Backend-Framework** | Express.js | 4.x |
| **Datenbank** | MongoDB + Mongoose | Mongo 7, Mongoose 8.x |
| **Sessions** | express-session + connect-mongo | — |
| **Echtzeit** | WebSocket (`ws`) | 8.x |
| **Datei-Upload** | Multer | 2.x |
| **Datei-Verschlüsselung** | AES-256-GCM, HKDF-SHA256 (Node Crypto) | — |
| **E-Mail** | Nodemailer | 10.x |
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
│   │   ├── auth.js                 # requireLogin / requireAdmin / requireApiKey / establishSession
│   │   ├── lookupLimiter.js        # Gemeinsames Rate-Limit für fehlgeschlagene ID-Lookups
│   │   └── upload.js               # Multer-Konfiguration, Blockliste
│   ├── models/
│   │   ├── AuditLog.js             # Audit-Events (TTL 90 Tage)
│   │   ├── Collection.js           # Dateisammlungen
│   │   ├── File.js                 # Datei-Metadaten
│   │   ├── Paste.js                # Text-Pastes
│   │   ├── ShareLink.js            # Per-Datei-Share-Links
│   │   ├── SiteSettings.js         # Singleton: Betreiber-Einstellungen
│   │   └── User.js                 # Nutzerkonten + API-Keys
│   ├── routes/
│   │   ├── api.js                  # Haupt-API (Upload, Gallery, Admin, ...)
│   │   ├── auth.js                 # Login / Register / Password-Reset
│   │   ├── docs.js                 # Öffentliche Dokumentationsseite (/docs)
│   │   ├── files.js                # Datei-Serving, OG-Embeds, Range-Requests
│   │   ├── import.js               # XBackBone-Migration
│   │   ├── install.js              # Erstinstallations-Endpoint (Setup-Token)
│   │   ├── pastes.js               # Paste-API
│   │   └── shares.js               # Share-Link-Datei-Serving
│   ├── jobs/
│   │   └── retentionCleanup.js     # Tägliches Löschen abgelaufener Dateien und Upload-Reste
│   ├── migrations/
│   │   ├── migrateApiKeyHashes.js  # Einmalig: Plaintexts → SHA-256-Hashes
│   │   └── migrateUserFolders.js   # Einmalig: Dateien in Nutzer-Ordner verschieben
│   ├── utils/
│   │   ├── asyncRouter.js          # Express-Router, der async-Fehler an den Error-Handler gibt
│   │   ├── audit.js                # logAudit()-Hilfsfunktion
│   │   ├── deleteUserData.js       # Vollständige Löschung aller Daten eines Kontos
│   │   ├── fileCrypto.js           # Verschlüsselung gespeicherter Dateien (AES-256-GCM)
│   │   ├── generateThumbnail.js    # Thumbnail erzeugen (lokal oder über thumbnailer-Container)
│   │   ├── thumbnailQueue.js       # Datei-Warteschlange zum thumbnailer-Container
│   │   ├── thumbnailTools.js       # ffmpeg / ghostscript Aufrufe
│   │   ├── mailer.js               # Nodemailer-Wrapper + i18n-E-Mail-Templates
│   │   ├── mime.js                 # MIME-Normalisierung, Whitelist für Inline-Auslieferung
│   │   ├── sanitizeFilename.js     # Dateiname bereinigen
│   │   ├── setupToken.js           # Setup-Token der Erstinstallation
│   │   ├── storeUpload.js          # Upload verschlüsseln, Thumbnail aus Klartext-Kopie
│   │   └── uploadPath.js           # Pfadauflösung mit Path-Traversal-Schutz
│   ├── thumbnailWorker.js          # Einstieg des thumbnailer-Containers
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
│   ├── generate-missing-thumbnails.js
│   └── encrypt-existing-files.js   # Bestehende Dateien nachträglich verschlüsseln
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
| `BIND_ADDRESS` | `127.0.0.1` | Host-Adresse, auf der Docker den Port veröffentlicht. Hinter Reverse Proxy auf Loopback lassen; `0.0.0.0` nur hinter externer Firewall oder ohne Proxy (siehe „Cloudflare Tunnel / Proxy im Container“) |
| `TRUST_PROXY` | `1` | Anzahl vertrauenswürdiger Proxy-Hops (z. B. `2` für Cloudflare → nginx); muss zum Setup passen, sonst sind Client-IPs und Rate-Limits falsch |
| `ENCRYPTION_KEY` | — | 32-Byte-Schlüssel (`openssl rand -base64 32`). Ist er gesetzt, werden neue Uploads und Thumbnails verschlüsselt gespeichert (siehe „Verschlüsselung gespeicherter Dateien“). **Geht er verloren, sind verschlüsselte Dateien unlesbar** |
| `INSTALL_TOKEN` | _(zufällig, wird ins Log geschrieben)_ | Token, das für die Erstinstallation nötig ist |
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
| `NODE_ENV` | — | Optional. Sichere Cookies hängen nicht davon ab: Sie werden automatisch gesetzt, sobald der Request per HTTPS ankommt (`X-Forwarded-Proto` vom Proxy) |
| `UPDATE_ENABLED` | `false` | Aktiviert das Self-Update per Knopfdruck im Admin-Panel |
| `UPDATE_CHANNEL` | `release` | Update-Erkennung: `release` (neuestes GitHub-Release-Tag) oder `branch` (neue Commits auf `UPDATE_BRANCH`) |
| `UPDATE_BRANCH` | `main` | Branch, den der Updater zieht — und im `branch`-Modus zum Vergleich heranzieht |
| `UPDATE_REPO` | `Christianoooooo/sharely` | GitHub-Repo, das auf neue Releases geprüft wird |
| `COMPOSE_PROJECT_NAME` | `sharely` | Compose-Projektname; muss zwischen Host und Updater identisch sein |

### Automatische Updates

Das Admin-Panel (**Admin → Website-Einstellungen → Version & Updates**) zeigt stets die installierte Version und ob ein Update verfügbar ist.

**Woran „Update verfügbar" festgemacht wird**, steuert `UPDATE_CHANNEL`:

- `release` (Standard) — die installierte Version wird mit dem neuesten **GitHub-Release-Tag** verglichen. Passend, wenn pro Version ein Release erstellt wird.
- `branch` — der installierte **Commit** wird mit der Spitze von `UPDATE_BRANCH` verglichen. Ein Update ist verfügbar, sobald neue Commits auf dem Branch liegen — ohne dass ein Release nötig ist. Installierte Version/Commit meldet der Updater-Container, daher braucht dieser Modus den laufenden Updater.

Optional lässt sich ein Update per Knopfdruck einspielen. Dies übernimmt ein eigener `updater`-Container — die **einzige** Komponente mit Zugriff auf den Docker-Socket. Die Web-App berührt den Socket nie: sie legt nur eine Anforderungsdatei in ein gemeinsames Volume, der Updater führt dann `git pull` + `docker compose build app thumbnailer` + `docker compose up -d app thumbnailer` aus.

> ⚠️ **Sicherheitshinweis:** Der Updater mountet den Docker-Socket, was Root-Rechten auf dem Host entspricht. Nur aktivieren, wenn dieser Kompromiss bewusst akzeptiert wird. Bei einer kompromittierten Web-App kann höchstens ein Rebuild aus dem konfigurierten Branch ausgelöst werden — keine beliebigen Host-Befehle. Dafür gehört das gemeinsame Control-Verzeichnis `root` und hat das Sticky-Bit (`1777`): Die App darf nur `update.request` anlegen und `update.state` schreiben, aber keine Dateien des Updaters ersetzen oder durch Symlinks austauschen.

Voraussetzungen: Deployment aus einem **Git-Checkout**, `UPDATE_ENABLED=true` in der `.env`, unveränderter `COMPOSE_PROJECT_NAME`, und Start inklusive Updater via `docker compose --profile updater up -d --build`. Der Updater liegt hinter dem Compose-Profil `updater` — ein normales `docker compose up` startet den privilegierten Container also nie. Beim Einspielen wird der App-Container neu gebaut und ist kurz nicht erreichbar; die Seite zeigt den Fortschritt und verbindet sich automatisch neu. Mit `UPDATE_ENABLED=false` (und ohne Profil) bleibt das Panel reine Benachrichtigung.

Der Updater baut per `--no-deps` ausschließlich den App- und den Thumbnail-Container neu — die Datenbank wird nie mit-recreated. Er aktualisiert jedoch **sich selbst nicht**: Nach Änderungen unter `updater/` ist einmalig `docker compose --profile updater up -d --build updater` nötig.

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
  sessionVersion:              Number (wird bei Passwort-Änderung/-Reset erhöht, macht andere Sessions ungültig)
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
  shortId:       String (24 Hex-Zeichen, zufällig, unique)
  deleteToken:   String (32 Hex-Zeichen, unique; select: false, nie in API-Antworten)
  originalName:  String (sanitisiert)
  storedName:    String (relativer Pfad: "folderName/8hex.ext")
  mimeType:      String (normalisiert auf genau einen "typ/subtyp")
  encrypted:     Boolean (Datei liegt im Format von src/utils/fileCrypto.js vor)
  size:          Number (Bytes, Klartextgröße)
  uploader:      ObjectId → User
  views:         Number
  expiresAt:     Date | null (Selbstzerstörung nach Datum)
  maxDownloads:  Number | null (Selbstzerstörung nach N Downloads)
  downloadCount: Number
  tags:          [String] (max 20 × 50 Zeichen)
  description:   String (max 1000)
  createdAt:     Date
}
```

**Virtuals:**
- `sizeHuman` — lesbare Größe (B / KB / MB / GB)
- `displayType` — Klassifikation: `image|video|audio|pdf|code|text|file`

**Short-ID-Algorithmus:**
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

### Installation (`/api/install`)

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/status` | — | `{ installed: Boolean }` (ob bereits Nutzer existieren) |
| `POST` | `/setup` | Setup-Token | Admin-Konto und Betreiber-Einstellungen anlegen; nur solange kein Nutzer existiert |

Das Setup-Token steht beim Start im Log (`[install] Not installed yet. Setup token: …`) oder wird über `INSTALL_TOKEN` vorgegeben. Ohne passendes `setupToken` im Body antwortet `/setup` mit `403`.

---

### Authentifizierung (`/api/auth`)

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/me` | Session | Eingeloggter Nutzer |
| `POST` | `/login` | — | Einloggen (rate-limited: 10/15min; vergibt eine neue Session-ID) |
| `POST` | `/register` | — | Registrieren (rate-limited; der erste Admin entsteht nur über die Installation) |
| `POST` | `/logout` | — | Ausloggen |
| `GET` | `/smtp-enabled` | — | Prüft ob SMTP konfiguriert ist |
| `GET` | `/verify-email?token=` | — | E-Mail-Adresse bestätigen |
| `GET` | `/verify-reset-token?token=` | — | Reset-Token prüfen |
| `POST` | `/forgot-password` | — | Passwort-Reset-E-Mail senden (rate-limited: 5/Std.) |
| `POST` | `/reset-password` | — | Neues Passwort setzen (beendet alle bestehenden Sessions) |

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
   Quota-Prüfung gegen `totalSize` plus die angekündigten Größen aller offenen Chunk-Uploads des Nutzers
2. `POST /api/chunk/:uploadId` (Body: `chunkIndex=N`, File: `chunk`) → `{ received: N }`  
   Parallel mit 3–5 gleichzeitigen Chunks; `413`, sobald die empfangenen Bytes `totalSize` überschreiten
3. `POST /api/chunk/:uploadId/complete` → `{ files: [fileObject] }`  
   `400`, wenn die zusammengesetzte Datei nicht exakt `totalSize` groß ist

---

### Dateiverwaltung

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/api/gallery` | Session | Eigene Dateien (Admin: alle), paginiert (24/Seite), Filter: `q`, `type`, `tag`, `page` |
| `GET` | `/api/file/:shortId` | — | Datei-Metadaten ohne `deleteToken` (inkrementiert View-Counter) |
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

Benutzername, Passwort, E-Mail, Bestätigungs-E-Mail und Kontolöschung sind pro Nutzer auf 10 Versuche in 15 Minuten begrenzt (gegen Passwort-Raten mit gestohlener Session und Mail-Spam). Eine Passwort-Änderung beendet alle anderen Sessions des Nutzers; die aktuelle bleibt eingeloggt.

---

### Share-Links

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/api/file/:shortId/share-links` | Session (Owner/Admin) | Alle Share-Links einer Datei |
| `POST` | `/api/file/:shortId/share-links` | Session (Owner/Admin) | Share-Link erstellen |
| `DELETE` | `/api/share-links/:token` | Session (Owner/Creator/Admin) | Share-Link löschen |
| `GET` | `/api/share-links/:token` | — | Share-Link-Metadaten (öffentlich; ohne `shortId` der Datei, damit Passwort, Ablauf und Limit nicht über `/f/` umgangen werden können) |
| `POST` | `/api/share-links/:token/verify` | — | Share-Link-Passwort prüfen (max. 10 Fehlversuche pro IP in 15 Minuten) |

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
| `POST` | `/api/collections/:id/verify` | — | Collection-Passwort prüfen (max. 10 Fehlversuche pro IP in 15 Minuten) |

---

### Admin-Endpunkte

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/api/admin/stats` | Admin | Dashboard-Statistiken |
| `GET` | `/api/admin/users` | Admin | Alle Nutzer (inkl. Datei-Counts) |
| `POST` | `/api/admin/users` | Admin | Nutzer erstellen |
| `PATCH` | `/api/admin/users/:id/toggle` | Admin | Nutzer aktivieren/deaktivieren |
| `PATCH` | `/api/admin/users/:id/role` | Admin | Nutzer-Rolle ändern (wirkt sofort, auch auf offene Sessions) |
| `DELETE` | `/api/admin/users/:id` | Admin | Nutzer und alle seine Daten löschen |
| `POST` | `/api/admin/users/:id/regen-key` | Admin | API-Key regenerieren |
| `PATCH` | `/api/admin/users/:id/password` | Admin | Passwort setzen (beendet alle Sessions des Nutzers) |
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

### Absicherung

- **Origin-Prüfung:** Der Handshake wird mit `403` abgelehnt, wenn der `Origin`-Header nicht zum `Host` passt (gleiche Regel wie `requireSameOrigin` für die HTTP-API). Der Proxy muss den originalen `Host` weiterreichen.
- **Laufende Rechteprüfung:** Session, Aktiv-Status, Rolle und `sessionVersion` werden bei jeder Nachricht und zusätzlich alle 30 Sekunden für alle Verbindungen neu geprüft. Nach Logout, Deaktivierung, Löschung, Passwort-Änderung oder Herabstufung wird die Verbindung geschlossen bzw. verliert Admin-Rechte und Admin-Broadcasts.
- **Heartbeat:** Ping alle 30 Sekunden; Verbindungen ohne Pong werden getrennt.
- **Limits:** maximal 64 KiB pro Nachricht (größere schließen die Verbindung mit Code `1009`), bis zu 30 Nachrichten am Stück und danach 5 pro Sekunde pro Verbindung (sonst Antwort mit `status: 429`), maximal 20 gleichzeitige Verbindungen pro Client-IP. Aktionen, die das Passwort prüfen oder E-Mails senden, sind pro Nutzer auf 10 in 15 Minuten begrenzt.

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
| `file:view` | Datei-Owner + Admins | `{ shortId, views }` |
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

Liefert die Datei als HTTP-Response mit Range-Request-Unterstützung (206 Partial Content, auch Suffix-Ranges wie `bytes=-500`). Verschlüsselte Dateien werden dabei live entschlüsselt.

Welche Dateien direkt im Browser angezeigt werden, entscheidet eine Whitelist (`src/utils/mime.js`) auf Basis des normalisierten MIME-Typs:

| Fall | `Content-Type` | `Content-Disposition` | Zusätzlich |
|---|---|---|---|
| Bilder (PNG, JPEG, GIF, WebP, AVIF, BMP, ICO), gängige Video-/Audioformate, PDF | echter Typ | `inline` | — |
| Text und Code (nach `displayType`) | `text/plain; charset=utf-8` | `inline` | `CSP: sandbox` |
| HTML, SVG, XML und alles andere | `application/octet-stream` | `attachment` | `CSP: sandbox` |

So kann eine hochgeladene Datei weder als Seite im App-Origin gerendert noch als Skript eingebunden werden.

Hat die Datei ein Download-Limit (`maxDownloads`), zählt `/raw` nur vollständige Abrufe (ohne `Range` oder ab Byte 0), und zwar einmal pro Besucher-Session: Vorschau und anschließender Download desselben Besuchers verbrauchen zusammen einen Download. Abrufe von Eigentümer und Admins zählen nie. Ist das Limit erreicht, antwortet die Route mit `410`.

### `/f/:shortId/download` — Force-Download

Wie `/raw`, aber immer `Content-Disposition: attachment` und `application/octet-stream`. Jeder neue Besucher zählt gegen `maxDownloads`.

### `/f/:shortId/thumb` — Thumbnail

Liefert JPEG-Thumbnail (für Videos und PDFs), bei aktivierter Verschlüsselung entschlüsselt. `Cache-Control: public, max-age=86400`. Die ID muss aus `[A-Za-z0-9_-]` bestehen (Schutz gegen Path Traversal über `%2F`).

### `/f/:shortId/delete/:token` — ShareX-Deletion

Löscht Datei ohne Session via eindeutigem Delete-Token. Der Token wird nur beim Upload zurückgegeben und taucht in keiner anderen API-Antwort auf.

### `/s/:token` — Share-Link-Datei-Serving (`src/routes/shares.js`)

Prüft Passwort (via Session-Flag), Ablaufdatum und Download-Limit, dann liefert die Datei aus.

### Schutz vor Durchprobieren von IDs

Alle öffentlichen Abrufe über ID oder Token (`/f/*`, `/s/*`, `/api/file/:shortId`, `/api/share-links/:token`, `/api/collections/:id`, Pastes) teilen sich ein Rate-Limit: maximal 100 fehlgeschlagene Abrufe (404/410/401 …) pro IP in 15 Minuten. Erfolgreiche Abrufe zählen nicht. Ältere Datei-IDs mit 8 Zeichen bleiben gültig, sind aber kürzer und damit leichter zu erraten als neue.

---

## 10. Authentifizierung & Sicherheit

### Session-Authentifizierung

- Express-Session mit MongoDB-Store (`connect-mongo`)
- Session-Cookie: `httpOnly: true`, `sameSite: 'strict'`, `secure: 'auto'` (gesetzt, sobald der Request per HTTPS ankommt; hinter einem Proxy über `X-Forwarded-Proto` und `TRUST_PROXY`)
- Session-Dauer: konfigurierbar über `SiteSettings.sessionDurationDays` (Standard: 7 Tage), Live-gecacht für 60 Sekunden
- Login, Registrierung und Installation vergeben eine neue Session-ID (`establishSession`, Schutz gegen Session-Fixation)
- Bei jedem Request werden Rolle, Aktiv-Status und `sessionVersion` des Nutzers aus der Datenbank gelesen: Gelöschte oder deaktivierte Konten und Sessions von vor einer Passwort-Änderung verlieren sofort ihre Anmeldung, Rollenänderungen gelten sofort

### API-Key-Authentifizierung

- API-Keys werden als SHA-256-Hash gespeichert, nie im Klartext
- Die ersten 8 Zeichen werden als `apiKeyPrefix` gespeichert (für Anzeigezwecke)
- Lookup: `User.findByApiKey(plaintext)` berechnet Hash und sucht in `apiKeyHash`
- Beim Download der ShareX-Konfiguration wird der Key neu generiert — der Plaintext ist nur in diesem Moment sichtbar

### Middleware-Kette (`src/middleware/auth.js`)

```
requireLogin    → prüft req.session.user → 401 wenn nicht eingeloggt
requireAdmin    → wie requireLogin, zusätzlich role === 'admin' → 403
requireApiKey   → prüft Authorization: Bearer, X-API-Key, ?api_key= oder req.body.token
```

Alle Router werden über `asyncRouter()` erzeugt: Fehler in `async`-Handlern landen beim zentralen Error-Handler (`500`), statt den Request hängen zu lassen. Eine `uncaughtException` beendet den Prozess, Docker startet ihn neu (`restart: unless-stopped`).

### CSRF-Schutz

`requireSameOrigin()` in `app.js` vergleicht `Origin`-Header mit `Host`-Header für alle API-Routen. Ergänzt `sameSite: 'strict'`-Cookies.

### Content Security Policy

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

### Security-Headers

- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (nur bei HTTPS-Requests)
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin` (Datei-, Paste- und Share-URLs gelangen nicht per Referer an fremde Seiten)
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`

### Rate-Limiting

| Endpunkt | Limit | Fenster | Schlüssel |
|---|---|---|---|
| Upload (`/upload`, `/api/upload`, `/api/web-upload`) | 60 Requests | 15 Minuten | IP |
| Auth (`/api/auth/login`, `/register`, etc.) | 10 Requests | 15 Minuten | IP |
| Passwort-Reset | 5 Requests | 1 Stunde | IP |
| Passwort-Prüfung von Share-Links, Collections, Pastes | 10 Fehlversuche | 15 Minuten | IP |
| Konto-Aktionen (Name, Passwort, E-Mail, Bestätigungsmail, Löschung) | 10 Requests | 15 Minuten | Nutzer |
| Fehlgeschlagene ID-/Token-Abrufe (siehe Kapitel 9) | 100 Requests | 15 Minuten | IP |
| WebSocket | siehe Kapitel 8 | — | Verbindung / IP / Nutzer |

Die Client-IP hängt von `TRUST_PROXY` ab; der App-Port muss deshalb nur über den Reverse Proxy erreichbar sein (`BIND_ADDRESS`), sonst lässt sich `X-Forwarded-For` fälschen.

### Logging

Das Access-Log (stdout → Docker-Log) enthält gekürzte IP-Adressen (IPv4 auf `/24`, IPv6 auf `/48`). API-Keys (`api_key=`), Tokens in Query-Parametern (`token=`), Delete-Tokens und Share-Tokens werden geschwärzt. Das Audit-Log speichert die vollständige IP und wird nach 90 Tagen automatisch gelöscht.

### Datei-Blockliste

Folgende MIME-Types und Erweiterungen werden auf Upload abgelehnt:

**Blockierte MIME-Types:** `application/x-executable`, `application/x-sh`, `application/x-csh`, `application/x-bat`

**Blockierte Erweiterungen:** `.bat`, `.cmd`, `.com`, `.ps1`, `.psm1`, `.psd1`, `.sh`, `.bash`, `.csh`, `.zsh`, `.fish`, `.vbs`, `.vbe`, `.jse`, `.scr`, `.pif`, `.application`, `.gadget`, `.hta`, `.php`, `.php3–5`, `.phtml`, `.asp`, `.aspx`, `.jsp`, `.jspx`, `.cfm`

### Path-Traversal-Schutz

Alle Datei-Zugriffe über `resolveUploadPath()` prüfen, ob der aufgelöste Pfad innerhalb von `UPLOAD_DIR` liegt. Thumbnail-IDs werden zusätzlich gegen `[A-Za-z0-9_-]` geprüft.

---

## 11. Upload-System

### Standard-Upload (Multer)

- **Storage:** `multer.diskStorage` → `uploads/{folderName}/{8hex}{.ext}`
- **Dateiname:** `crypto.randomBytes(4).hex() + original-extension`
- **Limit:** `MAX_FILE_SIZE_MB` (Standard: 100 MB)
- **Speicherort:** Nutzer-spezifischer Ordner (`user.folderName`)
- **MIME-Typ:** wird mit `normalizeMime()` auf genau einen `typ/subtyp` reduziert (Parameter und kommagetrennte Zusatztypen fallen weg, ungültige Werte werden `application/octet-stream`)
- **Verschlüsselung:** mit `ENCRYPTION_KEY` verschlüsselt `sealUpload()` die Datei an Ort und Stelle; eine Klartext-Kopie (`<datei>.plain-<hex>`) bleibt nur bis zur Thumbnail-Erzeugung bestehen
- **ShareX-Endpunkt `/upload`:** Multer schreibt die Datei vor der API-Key-Prüfung; wird der Request abgelehnt, wird sie sofort wieder gelöscht

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
**Größenprüfung:** empfangene Bytes dürfen `totalSize` nicht überschreiten; die fertige Datei muss exakt `totalSize` groß sein  
**Aufräumen:** nicht abgeschlossene Upload-Verzeichnisse werden nach 24 Stunden vom Retention-Job gelöscht

### Avatar-Upload

- **Storage:** `multer.memoryStorage()` (kein Festplatten-Zwischenspeicher)
- **Speicherort:** `uploads/.avatars/{userId}{.ext}`
- **Limit:** 2 MB
- **Formate:** JPEG, PNG, GIF, WebP

---

## 12. Thumbnail-Generierung

Thumbnails werden asynchron nach dem Upload generiert (`startThumbnail()` — Fehler werden ignoriert). Mit Docker Compose laufen ffmpeg und Ghostscript nicht im App-Container, sondern im eigenen Container `thumbnailer`: ohne Netzwerk, ohne Secrets, als Nutzer `nobody`, mit schreibgeschütztem Dateisystem und ohne Zugriff auf `uploads/`. Die App kopiert jede Quelldatei in das gemeinsame Volume `thumbjobs` (`in/`), der Worker (`src/thumbnailWorker.js`) legt das Ergebnis in `out/` ab, und die App übernimmt es nur als reguläre Datei bis 2 MB (keine Symlinks). Läuft der Container nicht, werden Thumbnails übersprungen und die App loggt einmalig eine Warnung. Ohne `THUMBNAIL_WORKER_DIR` (lokale Entwicklung) laufen die Tools direkt in der App, mit leerer Umgebung (nur `PATH`).

> **Upgrade von älteren Versionen:** einmalig `docker compose up -d --build` ausführen, damit der Container `thumbnailer` angelegt wird. Mit Updater diesen ebenfalls einmal neu bauen (`docker compose --profile updater up -d --build updater`), ältere Updater erneuern nur den App-Container.

Ist `ENCRYPTION_KEY` gesetzt, wird das Thumbnail aus der Klartext-Kopie erzeugt, danach verschlüsselt und die Kopie gelöscht. Scheitert die Erzeugung, wird ein eventuell halb geschriebenes Thumbnail entfernt.

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

Für verschlüsselte Dateien entschlüsselt das Skript die Quelle kurzzeitig in eine temporäre Datei und verschlüsselt das erzeugte Thumbnail.

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
- Nutzer erstellen, aktivieren/deaktivieren, Rolle ändern (Deaktivierung und Herabstufung wirken sofort, auch auf offene Sessions und WebSocket-Verbindungen)
- Passwort zurücksetzen (meldet den Nutzer überall ab), API-Key regenerieren
- Ordnername ändern (physische Dateien werden auf dem Server verschoben)
- Nutzer löschen (alle Daten wie bei der Selbstlöschung, siehe Kapitel 17)

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
| Account-Löschung (Dateien, Pastes, Collections, Share-Links, Avatar) | Art. 17 – Löschrecht |
| Audit-Log (90-Tage-TTL via MongoDB) | Art. 5(2) – Rechenschaftspflicht |
| Audit-Log-CSV-Export | Art. 5(2) – Rechenschaftspflicht |
| Konfigurierbarer Datei-Retention | Art. 5(1)(e) – Speicherbegrenzung |
| API-Keys als SHA-256-Hash | Art. 32 – Sicherheit |
| Passwörter als bcrypt (12 Rounds) | Art. 32 – Sicherheit |
| Cookie-Consent für Cloudflare Analytics | Art. 13 – Transparenz |
| Anonymisierung bei Account-Löschung | Art. 17 – Löschrecht |
| Optionale Verschlüsselung gespeicherter Dateien (`ENCRYPTION_KEY`) | Art. 32 – Sicherheit |
| Gekürzte IP-Adressen und geschwärzte Tokens im Access-Log | Art. 5(1)(c) – Datenminimierung |

### GDPR-Lösch-Flow

Bei Account-Löschung (`user:delete-account` / `DELETE /api/user/account`) und beim Löschen durch einen Admin (`admin:users:delete` / `DELETE /api/admin/users/:id`) läuft derselbe Ablauf (`src/utils/deleteUserData.js`):
1. Alle Dateien des Nutzers werden von der Festplatte gelöscht
2. Thumbnails werden gelöscht
3. Share-Links des Nutzers und auf seine Dateien werden gelöscht
4. Pastes und Collections des Nutzers werden gelöscht; seine Dateien werden auch aus Collections anderer Nutzer entfernt
5. Avatar wird gelöscht
6. Audit-Log-Einträge werden anonymisiert (`username: '[deleted]'`, `ip: null`, `userId: null`)
7. User-Dokument wird gelöscht
8. Bei Selbstlöschung: Session wird zerstört; offene Sessions und WebSocket-Verbindungen verlieren beim nächsten Request ihre Anmeldung

Der Audit-Eintrag der Löschung selbst bleibt als Nachweis bestehen und wird nach 90 Tagen automatisch gelöscht.

---

## 18. Hintergrund-Jobs

### Retention-Cleanup (`src/jobs/retentionCleanup.js`)

- **Ausführung:** Beim Start und dann täglich (`setInterval(runRetentionCleanup, 24h)`)
- **Aktion:** Wenn `SiteSettings.fileRetentionDays > 0`, werden Dateien gelöscht, die älter als dieser Wert sind; außerdem selbstzerstörende Dateien nach `expiresAt` oder erreichtem `maxDownloads`
- Löscht: Datei auf Festplatte, Thumbnail, MongoDB-Dokument
- Räumt auf: nicht abgeschlossene Chunk-Uploads älter als 24 Stunden sowie liegengebliebene Klartext-Kopien verschlüsselter Uploads (`*.plain-*`) älter als 1 Stunde
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
- `app` — Node.js-App (Port 3000, standardmäßig nur auf `127.0.0.1` veröffentlicht, siehe `BIND_ADDRESS`)
- `mongo` — MongoDB 7 (Port 127.0.0.1:27017, nicht von außen erreichbar)
- `updater` — optionaler Self-Updater (nur mit Profil `updater`, siehe „Automatische Updates“)

**Volumes:**
- `uploads` — Persistente Datei-Ablage
- `mongo_data` — MongoDB-Daten
- `control` — Austausch zwischen App und Updater

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

### Cloudflare Tunnel / Proxy im Container

Docker veröffentlicht den App-Port standardmäßig nur auf `127.0.0.1` (`BIND_ADDRESS`). Ein Proxy, der direkt auf dem Host läuft, wie im nginx-Beispiel oben, erreicht ihn. Ein Proxy oder `cloudflared` in einem eigenen Container erreicht ihn nicht und antwortet mit **502 Bad Gateway**.

- **Empfohlen:** Den Proxy-Container in das Docker-Netz von sharely hängen (`<projekt>_default`, standardmäßig `sharely_default`) und auf `http://app:3000` zeigen lassen. Dann muss gar kein Port veröffentlicht werden:
  ```bash
  docker network connect sharely_default <cloudflared-or-proxy-container>
  ```
  Damit das Neustarts übersteht, das Netz in der Compose-Datei des Proxys als `external` eintragen.
- **Mit externer Firewall**, die Port 3000 aus dem Internet blockiert (z. B. Hetzner Cloud Firewall): `BIND_ADDRESS=0.0.0.0` in der `.env` setzen. Ohne eine solche Firewall nicht machen: Docker umgeht Host-Firewalls wie `ufw`, und wer den Port direkt erreicht, umgeht TLS und kann `X-Forwarded-For` fälschen, womit die Rate-Limits wirkungslos sind.

Der Proxy muss den originalen `Host`-Header weiterreichen (WebSocket-Verbindungen werden abgelehnt, wenn `Origin` und `Host` nicht übereinstimmen) sowie `X-Forwarded-Proto` (nötig für Secure-Cookies und HSTS). Cloudflare Tunnel und das nginx-Beispiel tun das standardmäßig; in der Tunnel-Konfiguration kein `httpHostHeader` setzen. Nach der Einrichtung prüfen, ob im Audit-Log echte Client-IPs stehen; sonst `TRUST_PROXY` anpassen.

> **Upgrade-Hinweis:** Frühere Versionen haben Port 3000 auf allen Interfaces veröffentlicht. Läuft der Proxy in einem Container, vor dem Update `BIND_ADDRESS` setzen oder das Netz wie oben beschrieben verbinden.

### Verschlüsselung gespeicherter Dateien

Ist `ENCRYPTION_KEY` gesetzt, verschlüsselt sharely jeden neuen Upload und sein Thumbnail vor dem Speichern mit AES-256-GCM (ein eigener, aus dem Hauptschlüssel abgeleiteter Schlüssel pro Datei). Beim Ausliefern wird live entschlüsselt, auch für Range-Requests und ZIP-Downloads.

- Schlüssel einmalig mit `openssl rand -base64 32` erzeugen, in die `.env` eintragen und **getrennt sichern**: Ohne ihn lassen sich verschlüsselte Dateien nicht wiederherstellen. Ein späterer Wechsel oder das Entfernen des Schlüssels wird nicht unterstützt.
- Bestehende Dateien bleiben unverschlüsselt, bis die Migration läuft (vorher das `uploads`-Volume sichern): `docker compose exec app npm run migrate:encrypt`
- Nicht abgedeckt: Pastes, Dateinamen und andere Metadaten in MongoDB, Avatare sowie der Arbeitsspeicher des laufenden Servers. Während ein Upload verarbeitet wird (Zusammensetzen der Chunks, Metadaten-Entfernung, Thumbnail-Erzeugung), liegt er kurz unverschlüsselt auf der Platte.
- Die Admin-Einstellung zur Festplatten-/Volume-Verschlüsselung erklärt nur eine Volume-Verschlüsselung in der Datenschutzerklärung und ist davon unabhängig.

### Erster Start

Beim ersten Start ohne Nutzer schreibt sharely ein Setup-Token ins Log (`docker compose logs app`), alternativ gilt `INSTALL_TOKEN`, falls gesetzt. Die Installationsseite verlangt dieses Token und legt damit das Admin-Konto an; über die normale Registrierung entsteht nie ein Admin.

---

## 20. Entwicklungsumgebung

### Voraussetzungen

- Node.js ≥ 22
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

# Bestehende Dateien und Thumbnails verschlüsseln (ENCRYPTION_KEY nötig, vorher Backup)
npm run migrate:encrypt
# oder im Container:
docker compose exec app npm run migrate:encrypt
```

`migrate:encrypt` schreibt jede Datei verschlüsselt nach `<storedName>.enc`, stellt danach den Datensatz um und löscht erst dann den Klartext. Ein abgebrochener Lauf lässt sich gefahrlos wiederholen.

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

**Playwright-Konfiguration:** `playwright.config.js` (startet den Server mit `INSTALL_TOKEN`, Standard `e2e-install-token`)  
**Global Setup:** `e2e/global-setup.js` (führt die Installation mit diesem Token aus, erstellt Test-Nutzer, -Admin etc.)  
**Helfer:** `e2e/helpers.js` (gemeinsame Hilfsfunktionen)

### Unit-Tests

```bash
npm test
```

Läuft ohne Datenbank: `src/utils/validateEmail.test.js`, `src/utils/stripMetadata.test.js` und `src/utils/fileCrypto.test.js` (Verschlüsselung: Roundtrip, Byte-Bereiche, Erkennung von Manipulation).

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
