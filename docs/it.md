# Sharely — Documentazione Tecnica

> **Versione:** 1.0.0 · **Licenza:** MIT · **Node.js:** ≥ 20

---

## Indice

1. [Panoramica del progetto](#1-panoramica-del-progetto)
2. [Architettura](#2-architettura)
3. [Stack tecnologico](#3-stack-tecnologico)
4. [Struttura delle directory](#4-struttura-delle-directory)
5. [Configurazione e variabili d'ambiente](#5-configurazione-e-variabili-dambiente)
6. [Modelli di dati](#6-modelli-di-dati)
7. [API REST](#7-api-rest)
8. [API WebSocket](#8-api-websocket)
9. [Route di servizio dei file](#9-route-di-servizio-dei-file)
10. [Autenticazione e sicurezza](#10-autenticazione-e-sicurezza)
11. [Sistema di upload](#11-sistema-di-upload)
12. [Generazione delle miniature](#12-generazione-delle-miniature)
13. [Email e SMTP](#13-email-e-smtp)
14. [Internazionalizzazione](#14-internazionalizzazione)
15. [Frontend (React SPA)](#15-frontend-react-spa)
16. [Pannello di amministrazione](#16-pannello-di-amministrazione)
17. [GDPR / Privacy](#17-gdpr--privacy)
18. [Job in background](#18-job-in-background)
19. [Deployment](#19-deployment)
20. [Ambiente di sviluppo](#20-ambiente-di-sviluppo)
21. [Migrazioni e script](#21-migrazioni-e-script)
22. [Test end-to-end](#22-test-end-to-end)

---

## 1. Panoramica del progetto

Sharely è una **piattaforma di condivisione file self-hosted** con un'interfaccia web pulita, integrazione con ShareX e accesso tramite API. Gli utenti caricano screenshot, file e contenuti multimediali e li condividono istantaneamente tramite link brevi.

### Funzionalità principali

| Funzionalità | Descrizione |
|---|---|
| Upload web | Drag-and-drop, fino a 500 file contemporaneamente |
| Upload a blocchi | File fino a 2 GB tramite upload multi-part parallelo |
| Integrazione ShareX | File di configurazione `.sxcu` scaricabile con un clic |
| Upload via API | Autenticazione con token Bearer, compatibile con curl/wget |
| Visualizzatore file | Zoom sulle immagini, streaming video/audio (HTTP Range), PDF inline, codice con evidenziazione della sintassi |
| Modalità di incorporazione | *embed* (HTML OG/Twitter Card) o *raw* (reindirizzamento diretto) |
| Miniature | Anteprime JPEG automatiche per video (ffmpeg) e PDF (ghostscript) |
| Raccolte | Gruppi di file con password e data di scadenza opzionali |
| Link di condivisione | Link per file con password, scadenza e limite di download |
| Interfaccia in tempo reale | Aggiornamenti live via WebSocket (upload, eliminazione, contatore visualizzazioni, statistiche admin) |
| Multilingua | 8 lingue: EN, DE, FR, ES, IT, PT, JA, ZH |
| Pannello admin | Statistiche, gestione utenti, gestione file, log di audit (esportazione CSV) |
| Conformità GDPR | Funzionalità privacy conformi al GDPR dell'UE (Art. 17, 20, 32, ecc.) |
| Importazione XBackBone | Migrazione di installazioni XBackBone esistenti |
| Pronto per Docker | `docker compose up -d` avvia l'ambiente completo |

---

## 2. Architettura

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

### Flusso di dati: Upload standard

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

### Flusso di dati: Upload ShareX

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

## 3. Stack tecnologico

| Livello | Tecnologia | Versione |
|---|---|---|
| **Runtime** | Node.js | ≥ 20 |
| **Framework backend** | Express.js | 4.x |
| **Database** | MongoDB + Mongoose | Mongo 7, Mongoose 8.x |
| **Sessioni** | express-session + connect-mongo | — |
| **Tempo reale** | WebSocket (`ws`) | 8.x |
| **Upload file** | Multer | 2.x |
| **Cifratura file** | AES-256-GCM, HKDF-SHA256 (Node Crypto) | — |
| **Email** | Nodemailer | 10.x |
| **Hashing password** | bcryptjs | 2.x (12 round) |
| **Hashing chiavi API** | SHA-256 (Node Crypto) | — |
| **Rate limiting** | express-rate-limit | 8.x |
| **Importazione XBackBone** | sql.js | 1.x |
| **Framework frontend** | React 18 | 18.3.x |
| **Routing (frontend)** | React Router v6 | 6.x |
| **Strumento di build** | Vite | 6.x |
| **Stile** | Tailwind CSS + Radix UI | 3.x |
| **Componenti UI** | shadcn/ui (Radix primitives) | — |
| **Icone** | FontAwesome | 6.x |
| **i18n** | i18next + react-i18next | — |
| **Evidenziazione sintassi** | highlight.js | 11.x |
| **Container** | Docker + Docker Compose | — |
| **Test** | Playwright (E2E) | 1.60.x |

---

## 4. Struttura delle directory

```
sharely/
├── app.js                          # Punto di ingresso Express, sequenza di avvio
├── package.json
├── .env.example                    # Modello per tutte le variabili d'ambiente
├── Dockerfile
├── docker-compose.yml
│
├── src/
│   ├── config/
│   │   └── db.js                   # Connessione MongoDB (Mongoose)
│   ├── middleware/
│   │   ├── auth.js                 # requireLogin / requireAdmin / requireApiKey / establishSession
│   │   ├── lookupLimiter.js        # Rate limit condiviso per le ricerche di ID fallite
│   │   └── upload.js               # Configurazione Multer, lista di blocco
│   ├── models/
│   │   ├── AuditLog.js             # Eventi di audit (TTL 90 giorni)
│   │   ├── Collection.js           # Raccolte di file
│   │   ├── File.js                 # Metadati dei file
│   │   ├── Paste.js                # Paste di testo
│   │   ├── ShareLink.js            # Link di condivisione per file
│   │   ├── SiteSettings.js         # Singleton: impostazioni operatore
│   │   └── User.js                 # Account utente + chiavi API
│   ├── routes/
│   │   ├── api.js                  # API principale (upload, galleria, admin, ...)
│   │   ├── auth.js                 # Login / Registrazione / Reset password
│   │   ├── docs.js                 # Pagina pubblica della documentazione (/docs)
│   │   ├── files.js                # Servizio file, embed OG, richieste di intervallo
│   │   ├── import.js               # Migrazione XBackBone
│   │   ├── install.js              # Endpoint di installazione iniziale (token di setup)
│   │   ├── pastes.js               # API dei paste
│   │   └── shares.js               # Servizio file tramite link di condivisione
│   ├── jobs/
│   │   └── retentionCleanup.js     # Eliminazione giornaliera dei file scaduti e dei residui di upload
│   ├── migrations/
│   │   ├── migrateApiKeyHashes.js  # Una tantum: testi in chiaro → hash SHA-256
│   │   └── migrateUserFolders.js   # Una tantum: spostamento file nelle cartelle utente
│   ├── utils/
│   │   ├── asyncRouter.js          # Router Express che inoltra gli errori async all'error handler
│   │   ├── audit.js                # Funzione helper logAudit()
│   │   ├── deleteUserData.js       # Eliminazione completa di tutti i dati di un account
│   │   ├── fileCrypto.js           # Cifratura dei file salvati (AES-256-GCM)
│   │   ├── generateThumbnail.js    # Integrazione ffmpeg / ghostscript
│   │   ├── mailer.js               # Wrapper Nodemailer + template email i18n
│   │   ├── mime.js                 # Normalizzazione MIME, whitelist per la consegna inline
│   │   ├── sanitizeFilename.js     # Sanificazione del nome file
│   │   ├── setupToken.js           # Token di setup dell'installazione iniziale
│   │   ├── storeUpload.js          # Cifratura dell'upload, miniatura dalla copia in chiaro
│   │   └── uploadPath.js           # Risoluzione dei percorsi con protezione da path traversal
│   └── ws.js                       # Server WebSocket + dispatcher azioni
│
├── client/                         # Frontend React
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx                # Punto di ingresso React
│       ├── App.jsx                 # Configurazione del router
│       ├── index.css               # Stili globali
│       ├── context/
│       │   └── AuthContext.jsx     # Stato di autenticazione globale
│       ├── hooks/
│       │   ├── use-toast.js        # Hook per notifiche toast
│       │   └── useWebSocket.js     # Connessione WS + gestori eventi
│       ├── components/
│       │   ├── Layout.jsx          # Shell dell'app (barra di navigazione, sidebar)
│       │   ├── ProtectedRoute.jsx  # Guardia di autenticazione
│       │   ├── ShareLinkDialog.jsx # Dialogo di creazione link di condivisione
│       │   ├── AddToCollectionDialog.jsx
│       │   ├── CookieBanner.jsx
│       │   ├── LanguageSelector.jsx
│       │   ├── RequireEmailDialog.jsx
│       │   ├── UserAvatar.jsx
│       │   └── ui/                 # Componenti base shadcn/ui
│       ├── pages/
│       │   ├── Upload.jsx          # Pagina di upload
│       │   ├── Gallery.jsx         # Galleria file
│       │   ├── FileView.jsx        # Vista dettaglio file
│       │   ├── Collections.jsx     # Panoramica raccolte
│       │   ├── CollectionView.jsx  # Raccolta singola
│       │   ├── ShareView.jsx       # Pagina pubblica del link di condivisione
│       │   ├── Settings.jsx        # Impostazioni utente
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   ├── ForgotPassword.jsx
│       │   ├── ResetPassword.jsx
│       │   ├── Install.jsx         # Installazione iniziale
│       │   ├── PrivacyPolicy.jsx
│       │   ├── TermsOfService.jsx
│       │   └── admin/
│       │       ├── Dashboard.jsx   # Home page admin
│       │       ├── Users.jsx       # Gestione utenti
│       │       ├── Files.jsx       # Gestione file
│       │       ├── AuditLog.jsx    # Vista log di audit
│       │       ├── SiteSettings.jsx# Impostazioni operatore
│       │       └── Import.jsx      # Importazione XBackBone
│       ├── i18n/
│       │   ├── index.js            # Configurazione i18next
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
│           └── utils.js            # Helper Tailwind (cn())
│
├── scripts/
│   ├── setup-db.js
│   ├── mongo-init.js               # Script di inizializzazione MongoDB
│   ├── migrate-uploads-to-user-folders.js
│   ├── generate-missing-thumbnails.js
│   └── encrypt-existing-files.js   # Cifratura successiva dei file esistenti
│
├── e2e/                            # Test Playwright
│   ├── admin.spec.js
│   ├── bulk-actions-fixes.spec.js
│   ├── gallery.spec.js
│   ├── sharelink.spec.js
│   ├── tags.spec.js
│   ├── upload.spec.js
│   ├── helpers.js
│   └── global-setup.js
│
├── uploads/                        # File caricati (runtime)
│   ├── .thumbnails/
│   ├── .avatars/
│   └── .chunks/                    # Blocchi temporanei
│
└── docs/assets/                    # Screenshot e logo
```

---

## 5. Configurazione e variabili d'ambiente

Tutte le variabili vengono caricate da `.env` (tramite `dotenv`). Il file `.env.example` contiene il modello completo.

### Campi obbligatori

| Variabile | Descrizione |
|---|---|
| `SESSION_SECRET` | Segreto per la crittografia delle sessioni — stringa casuale lunga, es. `openssl rand -hex 32` |
| `MONGO_ROOT_PASSWORD` | Password root di MongoDB (richiesta solo per Docker Compose) |
| `MONGO_APP_PASSWORD` | Password dell'utente applicativo MongoDB |

### Tutte le variabili d'ambiente

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `PORT` | `3000` | Porta TCP del server HTTP |
| `BIND_ADDRESS` | `127.0.0.1` | Indirizzo host su cui Docker pubblica la porta. Dietro un reverse proxy mantenere loopback; `0.0.0.0` solo dietro un firewall esterno o senza proxy (vedi «Cloudflare Tunnel / proxy in un container») |
| `TRUST_PROXY` | `1` | Numero di hop proxy attendibili (es. `2` per Cloudflare → nginx); deve corrispondere al setup, altrimenti IP client e rate limit sono errati |
| `ENCRYPTION_KEY` | — | Chiave da 32 byte (`openssl rand -base64 32`). Se impostata, i nuovi upload e le miniature vengono salvati cifrati (vedi «Cifratura dei dati a riposo»). **Se va persa, i file cifrati sono illeggibili** |
| `INSTALL_TOKEN` | _(casuale, scritto nel log)_ | Token necessario per completare l'installazione iniziale |
| `MONGODB_URI` | _(costruita da Docker Compose)_ | URI di connessione MongoDB completa |
| `MONGO_ROOT_PASSWORD` | — | Password root di MongoDB |
| `MONGO_APP_USER` | `appuser` | Nome utente applicativo MongoDB |
| `MONGO_APP_PASSWORD` | — | Password dell'utente applicativo MongoDB |
| `MONGO_DB_NAME` | `sharely` | Nome del database MongoDB |
| `SESSION_SECRET` | — | **Obbligatorio** — segreto di crittografia delle sessioni |
| `BASE_URL` | `http://localhost:3000` | URL base pubblica per i link di condivisione generati (senza `/` finale) |
| `SITE_NAME` | `sharely` | Nome del sito negli embed Open Graph |
| `MAX_FILE_SIZE_MB` | `100` | Dimensione massima file per gli upload standard in MB (upload a blocchi fino a 2 GB indipendentemente) |
| `ALLOW_REGISTRATION` | `true` | `false` disabilita la registrazione pubblica |
| `SMTP_HOST` | — | Hostname del server SMTP; lasciare vuoto per disabilitare le funzionalità email |
| `SMTP_PORT` | `587` | Porta SMTP |
| `SMTP_SECURE` | `false` | `true` per TLS implicito (porta 465), `false` per STARTTLS |
| `SMTP_USER` | — | Nome utente SMTP |
| `SMTP_PASS` | — | Password SMTP |
| `SMTP_FROM` | _(SMTP_USER)_ | Indirizzo mittente nelle email in uscita |
| `UPLOAD_DIR` | `./uploads` | Percorso assoluto alla directory di upload |
| `NODE_ENV` | — | Opzionale. I cookie sicuri non dipendono da essa: vengono impostati automaticamente non appena la richiesta arriva via HTTPS (`X-Forwarded-Proto` dal proxy) |

---

## 6. Modelli di dati

### User (`src/models/User.js`)

```
{
  username:                    String (3–32, unico, alfanumerico + _-)
  password:                    String (bcrypt, 12 round)
  role:                        'admin' | 'user'
  apiKey:                      String (legacy, vuoto dopo la migrazione)
  apiKeyHash:                  String (SHA-256, unico, sparse)
  apiKeyPrefix:                String (primi 8 caratteri del testo in chiaro)
  folderName:                  String (unico, sparse, max 64)
  avatarExt:                   String | null (.jpg/.png/.gif/.webp)
  embedMode:                   'embed' | 'raw'
  isActive:                    Boolean
  sessionVersion:              Number (incrementato al cambio/reset della password, invalida le altre sessioni)
  email:                       String (minuscolo, unico, sparse)
  emailVerified:               Boolean
  emailVerificationToken:      String | null (hash SHA-256 del testo in chiaro)
  emailVerificationExpires:    Date | null
  passwordResetToken:          String | null (hash SHA-256)
  passwordResetExpires:        Date | null
  language:                    'en'|'de'|'fr'|'es'|'it'|'pt'|'ja'|'zh'
  predefinedTags:              [String] (max 100 tag × 50 caratteri)
  createdAt:                   Date
}
```

**Metodi importanti:**
- `user.comparePassword(candidate)` — confronto bcrypt
- `user.regenerateApiKey()` — genera nuovo testo in chiaro, memorizza l'hash, restituisce il testo in chiaro (visibile una sola volta)
- `User.findByApiKey(plaintext)` — ricerca per hash SHA-256, solo utenti attivi

### File (`src/models/File.js`)

```
{
  shortId:       String (24 caratteri esadecimali casuali, unico)
  deleteToken:   String (32 caratteri esadecimali, unico; select: false, mai nelle risposte API)
  originalName:  String (sanificato)
  storedName:    String (percorso relativo: "folderName/8hex.ext")
  mimeType:      String (normalizzato a esattamente un "tipo/sottotipo")
  encrypted:     Boolean (il file è nel formato di src/utils/fileCrypto.js)
  size:          Number (byte, dimensione in chiaro)
  uploader:      ObjectId → User
  views:         Number
  expiresAt:     Date | null (autodistruzione dopo una data)
  maxDownloads:  Number | null (autodistruzione dopo N download)
  downloadCount: Number
  tags:          [String] (max 20 × 50 caratteri)
  description:   String (max 1000)
  createdAt:     Date
}
```

**Proprietà calcolate:**
- `sizeHuman` — dimensione leggibile (B / KB / MB / GB)
- `displayType` — classificazione: `image|video|audio|pdf|code|text|file`

**Algoritmo Short ID:**
```
shortId = randomBytes(12).hex()   // 24 hex chars; older IDs keep their 8-char format
```

### Collection (`src/models/Collection.js`)

```
{
  shortId:     String (24 Hex, unico)
  name:        String (max 100)
  description: String (max 500)
  owner:       ObjectId → User
  files:       [ObjectId → File]
  password:    String | null (bcrypt)
  expiresAt:   Date | null
  createdAt:   Date
}
```

> Le raccolte scadute vengono eliminate automaticamente dall'indice TTL di MongoDB 7 giorni dopo la scadenza.

### ShareLink (`src/models/ShareLink.js`)

```
{
  token:         String (32 Hex, unico)
  file:          ObjectId → File
  createdBy:     ObjectId → User
  label:         String (max 100)
  password:      String | null (bcrypt)
  expiresAt:     Date | null
  downloadLimit: Number (-1 = illimitato)
  downloadCount: Number
  createdAt:     Date
}
```

> Come le raccolte: periodo di grazia di 7 giorni dopo la scadenza tramite indice TTL.

### SiteSettings (`src/models/SiteSettings.js`)

Documento singleton (`_id: 'singleton'`):

```
{
  operatorName:        String
  operatorAddress:     String
  operatorEmail:       String
  cloudflareAnalytics: Boolean
  fileRetentionDays:   Number (0 = disabilitato)
  encryptionAtRest:    Boolean
  sessionDurationDays: Number (predefinito: 7)
  allowRegistration:   Boolean
}
```

### AuditLog (`src/models/AuditLog.js`)

```
{
  timestamp: Date (indice TTL: 90 giorni)
  userId:    ObjectId → User | null
  username:  String | null
  action:    String
  ip:        String | null
  meta:      Mixed (metadati specifici dell'azione)
}
```

---

## 7. API REST

### URL base: `/api`

Tutti gli endpoint JSON restituiscono `Content-Type: application/json`. Errori: `{ "error": "messaggio" }`.

---

### Installazione (`/api/install`)

| Metodo | Percorso | Auth | Descrizione |
|---|---|---|---|
| `GET` | `/status` | — | `{ installed: Boolean }` (se esistono già utenti) |
| `POST` | `/setup` | Token di setup | Creare l'account admin e le impostazioni operatore; solo finché non esiste alcun utente |

Il token di setup viene scritto nel log all'avvio (`[install] Not installed yet. Setup token: …`) oppure fornito tramite `INSTALL_TOKEN`. Senza un `setupToken` corrispondente nel body, `/setup` risponde con `403`.

---

### Autenticazione (`/api/auth`)

| Metodo | Percorso | Auth | Descrizione |
|---|---|---|---|
| `GET` | `/me` | Sessione | Utente attualmente connesso |
| `POST` | `/login` | — | Accesso (limitato: 10/15min; assegna un nuovo ID di sessione) |
| `POST` | `/register` | — | Registrazione (limitata; il primo admin si crea solo tramite l'installazione) |
| `POST` | `/logout` | — | Disconnessione |
| `GET` | `/smtp-enabled` | — | Verifica se SMTP è configurato |
| `GET` | `/verify-email?token=` | — | Verificare l'indirizzo email |
| `GET` | `/verify-reset-token?token=` | — | Validare il token di reset |
| `POST` | `/forgot-password` | — | Inviare l'email di reset password (limitato: 5/h) |
| `POST` | `/reset-password` | — | Impostare la nuova password (termina tutte le sessioni esistenti) |

**Richiesta di accesso:**
```json
POST /api/auth/login
{ "username": "max", "password": "meinPasswort123" }
```

**Risposta di accesso:**
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

### Upload di file

| Metodo | Percorso | Auth | Descrizione |
|---|---|---|---|
| `POST` | `/upload` | Chiave API | Upload ShareX (endpoint legacy in `app.js`) |
| `POST` | `/api/upload` | Chiave API | Upload ShareX/API (campo: `file`) |
| `POST` | `/api/web-upload` | Sessione | Upload web (campo: `files[]`, max 500) |
| `POST` | `/api/chunk/init` | Sessione | Inizializzare upload a blocchi |
| `POST` | `/api/chunk/:uploadId` | Sessione | Caricare un blocco (campo: `chunk`) |
| `POST` | `/api/chunk/:uploadId/complete` | Sessione | Assemblare i blocchi |
| `DELETE` | `/api/chunk/:uploadId` | Sessione | Annullare upload e pulire |

**Risposta di upload API:**
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

#### Flusso di upload a blocchi

1. `POST /api/chunk/init` → `{ uploadId: "32hex" }`  
   Verifica della quota rispetto a `totalSize` più le dimensioni annunciate di tutti gli upload a blocchi aperti dell'utente
2. `POST /api/chunk/:uploadId` (Body: `chunkIndex=N`, File: `chunk`) → `{ received: N }`  
   In parallelo con 3–5 blocchi simultanei; `413` non appena i byte ricevuti superano `totalSize`
3. `POST /api/chunk/:uploadId/complete` → `{ files: [fileObject] }`  
   `400` se il file assemblato non ha esattamente la dimensione `totalSize`

---

### Gestione file

| Metodo | Percorso | Auth | Descrizione |
|---|---|---|---|
| `GET` | `/api/gallery` | Sessione | File propri (admin: tutti), paginato (24/pagina), filtri: `q`, `type`, `tag`, `page` |
| `GET` | `/api/file/:shortId` | — | Metadati del file senza `deleteToken` (incrementa il contatore visualizzazioni) |
| `PATCH` | `/api/file/:shortId` | Sessione | Aggiornare tag/nome |
| `DELETE` | `/api/file/:shortId` | Sessione | Eliminare file |
| `DELETE` | `/api/delete/:shortId` | Chiave API | Eliminare file (autenticazione chiave API) |
| `POST` | `/api/files/bulk` | Sessione | Azioni in blocco: `delete`, `tag`, `removeTag`, `addToCollection`, `moveToCollection` |
| `GET` | `/api/tags` | Sessione | Tutti i suggerimenti di tag dell'utente |

**Parametri di query della galleria:**
- `q` — ricerca nel nome file (sicuro per regex)
- `type` — `all|image|video|audio|pdf|code`
- `tag` — filtro tag esatto
- `page` — numero di pagina (predefinito: 1)

---

### Impostazioni utente

| Metodo | Percorso | Auth | Descrizione |
|---|---|---|---|
| `GET` | `/api/my-key` | Sessione | Mostra il prefisso della chiave API |
| `POST` | `/api/regen-key` | Sessione | Rigenerare la chiave API |
| `GET` | `/api/sharex-config` | Sessione | Scaricare ShareX `.sxcu` (rigenera la chiave) |
| `PATCH` | `/api/user/username` | Sessione | Cambiare nome utente (password richiesta) |
| `PATCH` | `/api/user/password` | Sessione | Cambiare password |
| `PATCH` | `/api/user/email` | Sessione | Cambiare email (invia email di verifica) |
| `PATCH` | `/api/user/language` | Sessione | Impostare la lingua dell'interfaccia |
| `PATCH` | `/api/user/embed-mode` | Sessione | Impostare la modalità di incorporazione (`embed`/`raw`) |
| `POST` | `/api/user/resend-verification` | Sessione | Reinviare l'email di verifica |
| `GET` | `/api/user/export` | Sessione | Esportazione dati (GDPR Art. 20) come JSON |
| `DELETE` | `/api/user/account` | Sessione | Eliminare account (GDPR Art. 17, password richiesta) |
| `GET` | `/api/user/predefined-tags` | Sessione | Recuperare tag predefiniti |
| `PATCH` | `/api/user/predefined-tags` | Sessione | Aggiornare tag predefiniti |
| `POST` | `/api/user/avatar` | Sessione | Caricare avatar (max 2 MB, JPEG/PNG/GIF/WebP) |
| `DELETE` | `/api/user/avatar` | Sessione | Eliminare avatar |
| `GET` | `/api/user/avatar/:userId` | — | Servire avatar |

Nome utente, password, email, email di verifica ed eliminazione dell'account sono limitati per utente a 10 tentativi in 15 minuti (contro il tentativo di indovinare la password con una sessione rubata e lo spam di email). Un cambio di password termina tutte le altre sessioni dell'utente; quella corrente resta connessa.

---

### Link di condivisione

| Metodo | Percorso | Auth | Descrizione |
|---|---|---|---|
| `GET` | `/api/file/:shortId/share-links` | Sessione (Proprietario/Admin) | Tutti i link di condivisione di un file |
| `POST` | `/api/file/:shortId/share-links` | Sessione (Proprietario/Admin) | Creare link di condivisione |
| `DELETE` | `/api/share-links/:token` | Sessione (Proprietario/Creatore/Admin) | Eliminare link di condivisione |
| `GET` | `/api/share-links/:token` | — | Metadati del link di condivisione (pubblico; senza lo `shortId` del file, così che password, scadenza e limite non possano essere aggirati tramite `/f/`) |
| `POST` | `/api/share-links/:token/verify` | — | Verificare la password del link di condivisione (max 10 tentativi falliti per IP in 15 minuti) |

**Creare link di condivisione:**
```json
POST /api/file/a1b2c3d4/share-links
{
  "label": "Per i colleghi",
  "password": "segreto",
  "expiresAt": "2025-12-31T23:59:59Z",
  "downloadLimit": 10
}
```

---

### Raccolte

| Metodo | Percorso | Auth | Descrizione |
|---|---|---|---|
| `GET` | `/api/collections` | Sessione | Raccolte proprie (admin: tutte) |
| `POST` | `/api/collections` | Sessione | Creare raccolta |
| `GET` | `/api/collections/:id` | — | Visualizzare raccolta (pubblica, password se impostata) |
| `PATCH` | `/api/collections/:id` | Sessione (Proprietario/Admin) | Aggiornare raccolta |
| `DELETE` | `/api/collections/:id` | Sessione (Proprietario/Admin) | Eliminare raccolta |
| `POST` | `/api/collections/:id/files` | Sessione (Proprietario/Admin) | Aggiungere file alla raccolta |
| `DELETE` | `/api/collections/:id/files/:fileShortId` | Sessione (Proprietario/Admin) | Rimuovere file dalla raccolta |
| `POST` | `/api/collections/:id/verify` | — | Verificare la password della raccolta (max 10 tentativi falliti per IP in 15 minuti) |

---

### Endpoint di amministrazione

| Metodo | Percorso | Auth | Descrizione |
|---|---|---|---|
| `GET` | `/api/admin/stats` | Admin | Statistiche del pannello |
| `GET` | `/api/admin/users` | Admin | Tutti gli utenti (con numero di file) |
| `POST` | `/api/admin/users` | Admin | Creare utente |
| `PATCH` | `/api/admin/users/:id/toggle` | Admin | Attivare/disattivare utente |
| `PATCH` | `/api/admin/users/:id/role` | Admin | Cambiare ruolo utente (effetto immediato, anche sulle sessioni aperte) |
| `DELETE` | `/api/admin/users/:id` | Admin | Eliminare l'utente e tutti i suoi dati |
| `POST` | `/api/admin/users/:id/regen-key` | Admin | Rigenerare chiave API |
| `PATCH` | `/api/admin/users/:id/password` | Admin | Impostare password (termina tutte le sessioni dell'utente) |
| `PATCH` | `/api/admin/users/:id/folder` | Admin | Cambiare nome cartella (sposta i file) |
| `GET` | `/api/admin/files` | Admin | Tutti i file, paginato (30/pagina) |
| `GET` | `/api/admin/site-settings` | Admin | Leggere impostazioni operatore |
| `PATCH` | `/api/admin/site-settings` | Admin | Aggiornare impostazioni operatore |
| `GET` | `/api/admin/audit-log` | Admin | Log di audit paginato (50/pagina) |
| `GET` | `/api/admin/audit-log/export` | Admin | Scaricare log di audit come CSV |
| `GET` | `/api/site-settings` | — | Informazioni pubbliche dell'operatore (per la pagina privacy) |

---

### Impostazioni del sito (pubbliche)

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

**Connessione:** `wss://example.com/ws` (solo per utenti connessi, cookie di sessione richiesto)

### Protezione

- **Verifica dell'origine:** l'handshake viene rifiutato con `403` se l'header `Origin` non corrisponde a `Host` (stessa regola di `requireSameOrigin` per l'API HTTP). Il proxy deve inoltrare l'`Host` originale.
- **Verifica continua dei permessi:** sessione, stato attivo, ruolo e `sessionVersion` vengono ricontrollati a ogni messaggio e inoltre ogni 30 secondi per tutte le connessioni. Dopo logout, disattivazione, eliminazione, cambio di password o declassamento, la connessione viene chiusa oppure perde i diritti admin e i broadcast admin.
- **Heartbeat:** ping ogni 30 secondi; le connessioni senza pong vengono chiuse.
- **Limiti:** massimo 64 KiB per messaggio (messaggi più grandi chiudono la connessione con codice `1009`), fino a 30 messaggi consecutivi e poi 5 al secondo per connessione (altrimenti risposta con `status: 429`), massimo 20 connessioni simultanee per IP client. Le azioni che verificano la password o inviano email sono limitate per utente a 10 in 15 minuti.

### Protocollo

**Client → Server (Richiesta):**
```json
{ "id": "req-abc123", "action": "file:list", "payload": { "type": "image", "page": 1 } }
```

**Server → Client (Risposta):**
```json
{ "id": "req-abc123", "data": { ... } }
```

**Server → Client (Errore):**
```json
{ "id": "req-abc123", "error": "Forbidden", "status": 403 }
```

**Server → Client (Broadcast):**
```json
{ "event": "file:uploaded", "data": { "shortId": "a1b2c3d4", "uploaderId": "..." } }
```

### Azioni disponibili

| Azione | Auth | Descrizione |
|---|---|---|
| `site-settings:get` | — | Impostazioni pubbliche del sito |
| `auth:me` | Utente | Dati dell'utente connesso |
| `file:get` | Utente | Dettagli del file (incrementa le visualizzazioni) |
| `file:list` | Utente | Lista file con filtro/paginazione |
| `file:delete` | Utente | Eliminare file |
| `user:get-key` | Utente | Prefisso chiave API |
| `user:regen-key` | Utente | Rigenerare chiave API |
| `user:change-password` | Utente | Cambiare password |
| `user:change-username` | Utente | Cambiare nome utente |
| `user:change-email` | Utente | Cambiare email |
| `user:change-language` | Utente | Impostare lingua |
| `user:change-embed-mode` | Utente | Impostare modalità di incorporazione |
| `user:resend-verification` | Utente | Reinviare email di verifica |
| `user:export` | Utente | Esportazione dati |
| `user:delete-account` | Utente | Eliminare account |
| `admin:stats` | Admin | Statistiche del pannello |
| `admin:settings:get` | Admin | Leggere impostazioni del sito |
| `admin:settings:update` | Admin | Aggiornare impostazioni del sito |
| `admin:users:list` | Admin | Tutti gli utenti |
| `admin:users:create` | Admin | Creare utente |
| `admin:users:toggle` | Admin | Attivare/disattivare utente |
| `admin:users:role` | Admin | Cambiare ruolo utente |
| `admin:users:delete` | Admin | Eliminare utente |
| `admin:users:regen-key` | Admin | Rigenerare chiave API |
| `admin:users:password` | Admin | Impostare password |
| `admin:users:folder` | Admin | Cambiare nome cartella |
| `admin:files:list` | Admin | Tutti i file |
| `admin:audit-log:list` | Admin | Log di audit paginato |

### Eventi broadcast

| Evento | Destinatari | Payload |
|---|---|---|
| `file:uploaded` | Uploader | `{ shortId, uploaderId }` |
| `file:deleted` | Proprietario del file | `{ shortId, uploaderId }` |
| `file:view` | Proprietario del file + admin | `{ shortId, views }` |
| `user:created` | Admin | `{ id, username, role, ... }` |
| `user:deleted` | Admin | `{ id }` |
| `user:updated` | Admin | `{ id, ...campi modificati }` |
| `audit:log` | Admin | Oggetto AuditLog completo |
| `settings:updated` | Admin | Oggetto SiteSettings aggiornato |
| `stats:invalidate` | Admin | `{}` (attiva l'aggiornamento delle statistiche) |

---

## 9. Route di servizio dei file

### `/f/:shortId` — Visualizzatore file

- **Richiesta del browser:** Passa alla React SPA (`index.html`) — la SPA renderizza il visualizzatore.
- **Bot di social media** (Discord, Telegram, Twitter, ecc.): Restituisce una pagina HTML minimale con meta tag Open Graph / Twitter Card.
  - `embedMode = 'embed'`: HTML OG con reindirizzamento
  - `embedMode = 'raw'` + immagine/video/audio: HTTP 302 → `/f/:shortId/raw`

### `/f/:shortId/raw` — Accesso diretto

Serve il file come risposta HTTP con supporto delle richieste di intervallo (206 Partial Content, anche intervalli suffisso come `bytes=-500`). I file cifrati vengono decifrati al volo.

Quali file vengono mostrati direttamente nel browser lo decide una whitelist (`src/utils/mime.js`) in base al tipo MIME normalizzato:

| Caso | `Content-Type` | `Content-Disposition` | Inoltre |
|---|---|---|---|
| Immagini (PNG, JPEG, GIF, WebP, AVIF, BMP, ICO), formati video/audio comuni, PDF | tipo reale | `inline` | — |
| Testo e codice (secondo `displayType`) | `text/plain; charset=utf-8` | `inline` | `CSP: sandbox` |
| HTML, SVG, XML e tutto il resto | `application/octet-stream` | `attachment` | `CSP: sandbox` |

In questo modo un file caricato non può essere né renderizzato come pagina nell'origine dell'app né incluso come script.

Se il file ha un limite di download (`maxDownloads`), `/raw` conta solo i recuperi completi (senza `Range` o a partire dal byte 0), e una sola volta per sessione del visitatore: anteprima e download successivo dello stesso visitatore consumano insieme un solo download. I recuperi del proprietario e degli admin non contano mai. Una volta raggiunto il limite, la route risponde con `410`.

### `/f/:shortId/download` — Download forzato

Come `/raw`, ma sempre `Content-Disposition: attachment` e `application/octet-stream`. Ogni nuovo visitatore conta rispetto a `maxDownloads`.

### `/f/:shortId/thumb` — Miniatura

Restituisce la miniatura JPEG (per video e PDF), decifrata se la cifratura è attiva. `Cache-Control: public, max-age=86400`. L'ID deve essere composto da `[A-Za-z0-9_-]` (protezione contro il path traversal tramite `%2F`).

### `/f/:shortId/delete/:token` — Eliminazione ShareX

Elimina il file senza sessione tramite token di eliminazione univoco. Il token viene restituito solo all'upload e non compare in nessun'altra risposta API.

### `/s/:token` — Servizio file tramite link di condivisione (`src/routes/shares.js`)

Verifica la password (tramite flag di sessione), la data di scadenza e il limite di download, poi serve il file.

### Protezione contro il tentativo sistematico di ID

Tutti i recuperi pubblici tramite ID o token (`/f/*`, `/s/*`, `/api/file/:shortId`, `/api/share-links/:token`, `/api/collections/:id`, paste) condividono un rate limit: massimo 100 recuperi falliti (404/410/401 …) per IP in 15 minuti. I recuperi riusciti non contano. Gli ID di file più vecchi da 8 caratteri restano validi, ma sono più corti e quindi più facili da indovinare rispetto a quelli nuovi.

---

## 10. Autenticazione e sicurezza

### Autenticazione tramite sessione

- Sessione Express con store MongoDB (`connect-mongo`)
- Cookie di sessione: `httpOnly: true`, `sameSite: 'strict'`, `secure: 'auto'` (impostato non appena la richiesta arriva via HTTPS; dietro un proxy tramite `X-Forwarded-Proto` e `TRUST_PROXY`)
- Durata della sessione: configurabile tramite `SiteSettings.sessionDurationDays` (predefinito: 7 giorni), con cache live di 60 secondi
- Login, registrazione e installazione assegnano un nuovo ID di sessione (`establishSession`, protezione contro la session fixation)
- A ogni richiesta, ruolo, stato attivo e `sessionVersion` dell'utente vengono letti dal database: account eliminati o disattivati e sessioni precedenti a un cambio di password perdono immediatamente l'accesso, i cambi di ruolo hanno effetto immediato

### Autenticazione tramite chiave API

- Le chiavi API sono memorizzate come hash SHA-256, mai in testo in chiaro
- I primi 8 caratteri sono memorizzati come `apiKeyPrefix` (per scopi di visualizzazione)
- Ricerca: `User.findByApiKey(plaintext)` calcola l'hash e cerca in `apiKeyHash`
- Al download della configurazione ShareX, la chiave viene rigenerata — il testo in chiaro è visibile solo in quel momento

### Catena middleware (`src/middleware/auth.js`)

```
requireLogin    → verifica req.session.user → 401 se non connesso
requireAdmin    → come requireLogin, in aggiunta role === 'admin' → 403
requireApiKey   → verifica Authorization: Bearer, X-API-Key, ?api_key= o req.body.token
```

Tutti i router vengono creati tramite `asyncRouter()`: gli errori negli handler `async` arrivano all'error handler centrale (`500`) invece di lasciare la richiesta in sospeso. Una `uncaughtException` termina il processo, Docker lo riavvia (`restart: unless-stopped`).

### Protezione CSRF

`requireSameOrigin()` in `app.js` confronta l'header `Origin` con l'header `Host` per tutte le route API. Complementa i cookie `sameSite: 'strict'`.

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

### Header di sicurezza

- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (solo per richieste HTTPS)
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin` (gli URL di file, paste e condivisione non arrivano a siti esterni tramite Referer)
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`

### Rate limiting

| Endpoint | Limite | Finestra | Chiave |
|---|---|---|---|
| Upload (`/upload`, `/api/upload`, `/api/web-upload`) | 60 richieste | 15 minuti | IP |
| Auth (`/api/auth/login`, `/register`, ecc.) | 10 richieste | 15 minuti | IP |
| Reset password | 5 richieste | 1 ora | IP |
| Verifica password di link di condivisione, raccolte, paste | 10 tentativi falliti | 15 minuti | IP |
| Azioni sull'account (nome, password, email, email di verifica, eliminazione) | 10 richieste | 15 minuti | Utente |
| Recuperi di ID/token falliti (vedi capitolo 9) | 100 richieste | 15 minuti | IP |
| WebSocket | vedi capitolo 8 | — | Connessione / IP / Utente |

L'IP del client dipende da `TRUST_PROXY`; la porta dell'app deve quindi essere raggiungibile solo tramite il reverse proxy (`BIND_ADDRESS`), altrimenti `X-Forwarded-For` può essere falsificato.

### Logging

L'access log (stdout → log Docker) contiene indirizzi IP abbreviati (IPv4 a `/24`, IPv6 a `/48`). Chiavi API (`api_key=`), token nei parametri di query (`token=`), token di eliminazione e token di condivisione vengono oscurati. Il log di audit memorizza l'IP completo e viene eliminato automaticamente dopo 90 giorni.

### Lista di blocco dei file

I seguenti tipi MIME ed estensioni vengono rifiutati all'upload:

**Tipi MIME bloccati:** `application/x-executable`, `application/x-sh`, `application/x-csh`, `application/x-bat`

**Estensioni bloccate:** `.bat`, `.cmd`, `.com`, `.ps1`, `.psm1`, `.psd1`, `.sh`, `.bash`, `.csh`, `.zsh`, `.fish`, `.vbs`, `.vbe`, `.jse`, `.scr`, `.pif`, `.application`, `.gadget`, `.hta`, `.php`, `.php3–5`, `.phtml`, `.asp`, `.aspx`, `.jsp`, `.jspx`, `.cfm`

### Protezione da path traversal

Tutti gli accessi ai file tramite `resolveUploadPath()` verificano che il percorso risolto si trovi all'interno di `UPLOAD_DIR`. Gli ID delle miniature vengono inoltre verificati rispetto a `[A-Za-z0-9_-]`.

---

## 11. Sistema di upload

### Upload standard (Multer)

- **Archiviazione:** `multer.diskStorage` → `uploads/{folderName}/{8hex}{.ext}`
- **Nome file:** `crypto.randomBytes(4).hex() + estensione-originale`
- **Limite:** `MAX_FILE_SIZE_MB` (predefinito: 100 MB)
- **Posizione:** Cartella specifica dell'utente (`user.folderName`)
- **Tipo MIME:** ridotto con `normalizeMime()` a esattamente un `tipo/sottotipo` (parametri e tipi aggiuntivi separati da virgola vengono scartati, i valori non validi diventano `application/octet-stream`)
- **Cifratura:** con `ENCRYPTION_KEY`, `sealUpload()` cifra il file sul posto; una copia in chiaro (`<file>.plain-<hex>`) resta solo fino alla generazione della miniatura
- **Endpoint ShareX `/upload`:** Multer scrive il file prima della verifica della chiave API; se la richiesta viene rifiutata, il file viene eliminato subito

### Upload a blocchi (>250 MB)

Il client frontend passa automaticamente alla modalità a blocchi per i file di grandi dimensioni.

**Struttura delle directory lato server:**
```
uploads/.chunks/{uploadId}/
  meta.json          { filename, mimeType, totalSize, totalChunks, userId, createdAt }
  chunk-0
  chunk-1
  ...
  chunk-N
```

**Dimensione blocco:** 10–20 MB (max 51 MB accettato per compatibilità con versioni precedenti)  
**Parallelismo:** 3–5 upload di blocchi simultanei  
**Assemblaggio:** Basato su stream (senza caricamento completo in RAM)  
**Verifica della dimensione:** i byte ricevuti non possono superare `totalSize`; il file finale deve avere esattamente la dimensione `totalSize`  
**Pulizia:** le directory di upload non completate vengono eliminate dal job di conservazione dopo 24 ore

### Upload avatar

- **Archiviazione:** `multer.memoryStorage()` (nessun buffer su disco)
- **Posizione:** `uploads/.avatars/{userId}{.ext}`
- **Limite:** 2 MB
- **Formati:** JPEG, PNG, GIF, WebP

---

## 12. Generazione delle miniature

Le miniature vengono generate in modo asincrono dopo l'upload (`startThumbnail()` — gli errori vengono ignorati silenziosamente). ffmpeg e Ghostscript vengono eseguiti con un ambiente vuoto (solo `PATH`), quindi non vedono né `SESSION_SECRET` né le credenziali del database o SMTP. Contro una vera esecuzione di codice questo protegge solo in parte, poiché i processi girano con lo stesso utente dell'app.

Se `ENCRYPTION_KEY` è impostata, la miniatura viene generata dalla copia in chiaro, poi cifrata e la copia eliminata. Se la generazione fallisce, un'eventuale miniatura scritta a metà viene rimossa.

### Miniature video (ffmpeg)

```bash
ffmpeg -y -i <file> -ss 00:00:01 -vframes 1 \
  -vf "scale=320:320:force_original_aspect_ratio=increase,crop=320:320" \
  -q:v 3 uploads/.thumbnails/<shortId>.jpg
```

### Miniature PDF (Ghostscript)

```bash
gs -dNOPAUSE -dBATCH -dSAFER \
  -sDEVICE=jpeg -dFirstPage=1 -dLastPage=1 \
  -r72 -dJPEGQ=85 \
  -sOutputFile=uploads/.thumbnails/<shortId>.jpg \
  <file>
```

**Timeout:** 30 secondi per generazione di miniatura  
**Fallback:** Se ffmpeg/ghostscript non è disponibile, la generazione viene ignorata silenziosamente.

### Script di backfill

```bash
npm run migrate:thumbnails
# o nel container:
docker exec -it <container> npm run migrate:thumbnails
```

Per i file cifrati, lo script decifra brevemente la sorgente in un file temporaneo e cifra la miniatura generata.

---

## 13. Email e SMTP

### Configurazione

SMTP viene attivato quando `SMTP_HOST` è impostato. `mailer.isConfigured()` verifica questo valore.

### Template email

Tutte le email vengono inviate nella lingua dell'utente (8 lingue). I template sono incorporati in `src/utils/mailer.js`.

**Tipi di email inviati:**

| Tipo | Trigger | Validità token |
|---|---|---|
| Verifica email | Registrazione, cambio email | 24 ore |
| Reset password | `POST /api/auth/forgot-password` | 1 ora |

### Sicurezza dei token

- Token: `crypto.randomBytes(32).hex()` (64 caratteri esadecimali)
- Memorizzati: hash SHA-256 del token
- L'email contiene il token in testo in chiaro come parametro URL
- Verifica: hash del token in arrivo confrontato con l'hash memorizzato

---

## 14. Internazionalizzazione

**Libreria:** i18next + react-i18next + i18next-browser-languagedetector

**Lingue supportate:**

| Codice | Lingua |
|---|---|
| `en` | English |
| `de` | Deutsch |
| `fr` | Français |
| `es` | Español |
| `it` | Italiano |
| `pt` | Português |
| `ja` | 日本語 |
| `zh` | 中文 |

**Selezione della lingua:**
1. Rilevamento della lingua del browser (automatico)
2. Preferenza dell'utente nel database (`user.language`)
3. Persistenza tramite `PATCH /api/user/language`

File di traduzione: `client/src/i18n/locales/{code}.json`

---

## 15. Frontend (React SPA)

### Configurazione del router (`client/src/App.jsx`)

| Route | Componente | Auth |
|---|---|---|
| `/` | Reindirizzamento → `/gallery` | No |
| `/auth/login` | Login.jsx | No |
| `/auth/register` | Register.jsx | No |
| `/auth/forgot-password` | ForgotPassword.jsx | No |
| `/auth/reset-password` | ResetPassword.jsx | No |
| `/install` | Install.jsx | No |
| `/upload` | Upload.jsx | **Sì** |
| `/gallery` | Gallery.jsx | **Sì** |
| `/f/:shortId` | FileView.jsx | **Sì** |
| `/collections` | Collections.jsx | **Sì** |
| `/c/:id` | CollectionView.jsx | No (pubblico) |
| `/s/:token` | ShareView.jsx | No (pubblico) |
| `/settings` | Settings.jsx | **Sì** |
| `/admin` | Dashboard.jsx | **Admin** |
| `/admin/users` | Users.jsx | **Admin** |
| `/admin/files` | Files.jsx | **Admin** |
| `/admin/audit-log` | AuditLog.jsx | **Admin** |
| `/admin/site-settings` | SiteSettings.jsx | **Admin** |
| `/admin/import` | Import.jsx | **Admin** |
| `/privacy` | PrivacyPolicy.jsx | No |
| `/terms` | TermsOfService.jsx | No |

### Contesto di autenticazione (`client/src/context/AuthContext.jsx`)

Stato globale per l'utente connesso. Inizializzato all'avvio dell'app tramite `GET /api/auth/me`.

### Hook WebSocket (`client/src/hooks/useWebSocket.js`)

Gestisce la connessione WS persistente. Fornisce `sendMessage()` e la registrazione dei gestori eventi. Logica di riconnessione in caso di interruzione della connessione.

### Componenti UI

Basato su **shadcn/ui** (Radix UI Primitives + Tailwind CSS):

- `Dialog`, `AlertDialog`, `DropdownMenu`, `ContextMenu`, `Popover`
- `Select`, `Checkbox`, `Input`, `Textarea`, `Label`
- `Card`, `Badge`, `Button`, `Separator`, `Tabs`, `Table`
- `Toast` / `Toaster` per le notifiche
- `Calendar` / `DateTimePicker` per la selezione della data di scadenza
- `Pagination` per le liste paginate
- `ScrollArea`, `Tooltip`

---

## 16. Pannello di amministrazione

Il pannello di amministrazione (`/admin/*`) è accessibile solo agli utenti con `role: 'admin'`.

### Dashboard (`/admin`)

- Numero totale di utenti, file, utilizzo dello storage
- 10 file caricati più di recente
- Aggiornamenti live via WebSocket (`stats:invalidate`)

### Gestione utenti (`/admin/users`)

- Tutti gli utenti con numero di file e utilizzo dello storage
- Creare utenti, attivare/disattivare, cambiare ruolo (disattivazione e declassamento hanno effetto immediato, anche sulle sessioni aperte e sulle connessioni WebSocket)
- Reimpostare password (disconnette l'utente ovunque), rigenerare chiave API
- Cambiare nome cartella (i file fisici vengono spostati sul server)
- Eliminare utente (tutti i dati come nell'autoeliminazione, vedi capitolo 17)

### Gestione file (`/admin/files`)

- Tutti i file di tutti gli utenti, paginato
- Ricerca per nome file
- Eliminare file

### Log di audit (`/admin/audit-log`)

- Log paginato di tutte le azioni (50/pagina)
- Filtro per nome utente e azione
- Esportazione CSV per scopi normativi

### Impostazioni del sito (`/admin/site-settings`)

- Informazioni sull'operatore (nome, indirizzo, email)
- Abilitare Cloudflare Analytics
- Periodo di conservazione dei file
- Durata delle sessioni
- Abilitare/disabilitare la registrazione

### Importazione XBackBone (`/admin/import`)

- Anteprima e importazione da database SQLite di XBackBone
- Gli utenti vengono abbinati per nome utente
- Idempotente (i file già importati vengono ignorati)

---

## 17. GDPR / Privacy

| Funzionalità | Articolo GDPR |
|---|---|
| Informativa sulla privacy (configurabile) | Art. 13/14 – Trasparenza |
| Pagina termini di servizio (configurabile) | Art. 13/14 – Trasparenza |
| Esportazione dati (JSON con URL) | Art. 20 – Portabilità dei dati |
| Eliminazione account (file, paste, raccolte, link di condivisione, avatar) | Art. 17 – Diritto alla cancellazione |
| Log di audit (TTL 90 giorni via MongoDB) | Art. 5(2) – Responsabilità |
| Esportazione CSV del log di audit | Art. 5(2) – Responsabilità |
| Conservazione file configurabile | Art. 5(1)(e) – Limitazione della conservazione |
| Chiavi API come hash SHA-256 | Art. 32 – Sicurezza |
| Password come bcrypt (12 round) | Art. 32 – Sicurezza |
| Consenso cookie per Cloudflare Analytics | Art. 13 – Trasparenza |
| Anonimizzazione alla cancellazione dell'account | Art. 17 – Diritto alla cancellazione |
| Cifratura opzionale dei file salvati (`ENCRYPTION_KEY`) | Art. 32 – Sicurezza |
| Indirizzi IP abbreviati e token oscurati nell'access log | Art. 5(1)(c) – Minimizzazione dei dati |

### Flusso di eliminazione GDPR

Alla cancellazione dell'account (`user:delete-account` / `DELETE /api/user/account`) e all'eliminazione da parte di un admin (`admin:users:delete` / `DELETE /api/admin/users/:id`) si esegue la stessa procedura (`src/utils/deleteUserData.js`):
1. Tutti i file dell'utente vengono eliminati dal disco
2. Le miniature vengono eliminate
3. I link di condivisione dell'utente e quelli verso i suoi file vengono eliminati
4. I paste e le raccolte dell'utente vengono eliminati; i suoi file vengono rimossi anche dalle raccolte di altri utenti
5. L'avatar viene eliminato
6. Le voci del log di audit vengono anonimizzate (`username: '[deleted]'`, `ip: null`, `userId: null`)
7. Il documento utente viene eliminato
8. In caso di autoeliminazione: la sessione viene distrutta; le sessioni aperte e le connessioni WebSocket perdono l'accesso alla richiesta successiva

La voce di audit dell'eliminazione stessa resta come prova e viene eliminata automaticamente dopo 90 giorni.

---

## 18. Job in background

### Pulizia per conservazione (`src/jobs/retentionCleanup.js`)

- **Esecuzione:** All'avvio e poi quotidianamente (`setInterval(runRetentionCleanup, 24h)`)
- **Azione:** Se `SiteSettings.fileRetentionDays > 0`, i file più vecchi di questo valore vengono eliminati; inoltre i file ad autodistruzione dopo `expiresAt` o al raggiungimento di `maxDownloads`
- Elimina: file su disco, miniatura, documento MongoDB
- Pulisce: upload a blocchi non completati più vecchi di 24 ore e copie in chiaro rimaste di upload cifrati (`*.plain-*`) più vecchie di 1 ora
- Invia broadcast `stats:invalidate` agli admin

### Indici TTL MongoDB (automatici)

| Collezione | TTL | Trigger |
|---|---|---|
| `AuditLog` | 90 giorni | `timestamp` |
| `Collection` | 7 giorni dopo `expiresAt` | `expiresAt` |
| `ShareLink` | 7 giorni dopo `expiresAt` | `expiresAt` |

---

## 19. Deployment

### Docker (consigliato)

```bash
git clone https://github.com/Christianoooooo/sharely.git
cd sharely
cp .env.example .env
# Modificare .env (SESSION_SECRET, password MONGO, BASE_URL)
docker compose up -d
```

**Servizi:**
- `app` — Applicazione Node.js (porta 3000, pubblicata per impostazione predefinita solo su `127.0.0.1`, vedi `BIND_ADDRESS`)
- `mongo` — MongoDB 7 (porta 127.0.0.1:27017, non accessibile dall'esterno)
- `updater` — self-updater opzionale (solo con il profilo `updater`)

**Volumi:**
- `uploads` — archiviazione persistente dei file
- `mongo_data` — dati MongoDB
- `control` — scambio tra app e updater

**Health check:** L'app verifica HTTP 200 su `/`, MongoDB verifica `db.adminCommand('ping')`.

### Reverse proxy Nginx

```nginx
server {
    listen 443 ssl;
    server_name files.example.com;

    client_max_body_size 2100M;  # Almeno quanto il blocco più grande + buffer

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Supporto WebSocket
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

> `BASE_URL` in `.env` deve corrispondere al dominio pubblico.

### Cloudflare Tunnel / proxy in un container

Per impostazione predefinita Docker pubblica la porta dell'app solo su `127.0.0.1` (`BIND_ADDRESS`). Un proxy eseguito direttamente sull'host, come l'esempio nginx sopra, la raggiunge. Un proxy o `cloudflared` in un proprio container no, e risponde con **502 Bad Gateway**.

- **Consigliato:** collegare il container del proxy alla rete Docker di sharely (`<progetto>_default`, predefinita `sharely_default`) e puntarlo a `http://app:3000`. In questo modo non serve pubblicare alcuna porta:
  ```bash
  docker network connect sharely_default <cloudflared-or-proxy-container>
  ```
  Per mantenerlo dopo i riavvii, dichiarare la rete come `external` nel file compose del proxy.
- **Con un firewall esterno** che blocca la porta 3000 da Internet (ad es. Hetzner Cloud Firewall): impostare `BIND_ADDRESS=0.0.0.0` in `.env`. Non farlo senza un tale firewall: Docker aggira i firewall dell'host come `ufw`, e chi raggiunge direttamente la porta aggira TLS e può falsificare `X-Forwarded-For`, rendendo inefficaci i rate limit.

Il proxy deve inoltrare l'header `Host` originale (le connessioni WebSocket vengono rifiutate se `Origin` e `Host` differiscono) e `X-Forwarded-Proto` (necessario per cookie sicuri e HSTS). Cloudflare Tunnel e l'esempio nginx lo fanno di default; non impostare `httpHostHeader` nella configurazione del tunnel. Dopo la configurazione, verificare che l'audit log mostri gli IP reali dei client; altrimenti regolare `TRUST_PROXY`.

> **Nota di aggiornamento:** Le versioni precedenti pubblicavano la porta 3000 su tutte le interfacce. Se il proxy gira in un container, impostare `BIND_ADDRESS` o collegare la rete come descritto sopra prima dell'aggiornamento.

### Cifratura dei dati a riposo

Con `ENCRYPTION_KEY` impostata, sharely cifra ogni nuovo upload e la sua miniatura con AES-256-GCM prima di salvarli (una chiave per file, derivata dalla chiave principale). I file vengono decifrati al volo quando vengono serviti, incluse le richieste Range e i download ZIP.

- Genera la chiave una sola volta con `openssl rand -base64 32`, inseriscila in `.env` e **salvala separatamente**: senza di essa i file cifrati non sono recuperabili. Cambiare o rimuovere la chiave in seguito non è supportato.
- I file esistenti restano non cifrati finché non esegui la migrazione (prima fai un backup del volume `uploads`): `docker compose exec app npm run migrate:encrypt`
- Non coperti: paste, nomi dei file e altri metadati in MongoDB, avatar e la memoria del server in esecuzione. Durante l'elaborazione (unione dei chunk, rimozione dei metadati, generazione della miniatura) un upload esiste brevemente non cifrato su disco.
- L'impostazione di amministrazione sulla cifratura del disco/volume dichiara solo una cifratura del volume nell'informativa privacy ed è indipendente da questa.

### Primo avvio

Al primo avvio senza utenti, sharely scrive un token di installazione nel log (`docker compose logs app`), oppure usa `INSTALL_TOKEN` se impostato. La pagina di installazione richiede questo token e crea l'account amministratore; la registrazione normale non crea mai un amministratore.

---

## 20. Ambiente di sviluppo

### Prerequisiti

- Node.js ≥ 20
- MongoDB (locale o tramite Docker)
- Opzionale: ffmpeg, ghostscript (per le miniature)

### Configurazione

```bash
# Backend
npm install
cp .env.example .env
# Modificare .env

# Frontend
cd client
npm install
```

### Avvio

```bash
# Backend (porta 3000, con nodemon)
npm run dev

# Frontend (porta 5173, terminale separato)
cd client
npm run dev
```

Il server di sviluppo Vite fa il proxy delle richieste API verso `localhost:3000` automaticamente.

### Build

```bash
npm run build   # Compila client/dist/, il backend rimane invariato
npm start       # Avvia il server Express di produzione
```

---

## 21. Migrazioni e script

### Migrazioni automatiche (a ogni avvio)

Queste migrazioni vengono eseguite all'avvio dell'app in `app.js` e sono idempotenti:

| Migrazione | File | Funzione |
|---|---|---|
| Migrazione cartelle utente | `src/migrations/migrateUserFolders.js` | Sposta i file da `uploads/` a `uploads/{folderName}/` |
| Migrazione hash chiavi API | `src/migrations/migrateApiKeyHashes.js` | Converte le chiavi API in testo in chiaro in hash SHA-256 |

### Script manuali

```bash
# Generare miniature per i file già esistenti
npm run migrate:thumbnails
# oppure:
node scripts/generate-missing-thumbnails.js

# Spostare gli upload nelle cartelle utente (manuale)
npm run migrate:user-folders
# oppure:
node scripts/migrate-uploads-to-user-folders.js

# Cifrare file e miniature esistenti (richiede ENCRYPTION_KEY, prima fare un backup)
npm run migrate:encrypt
# o nel container:
docker compose exec app npm run migrate:encrypt
```

`migrate:encrypt` scrive ogni file cifrato in `<storedName>.enc`, poi aggiorna il record e solo allora elimina il testo in chiaro. Un'esecuzione interrotta può essere ripetuta senza rischi.

### Inizializzazione del database (Docker)

`scripts/mongo-init.js` viene eseguito al primo avvio del container MongoDB e crea l'utente applicativo con i permessi corretti.

---

## 22. Test end-to-end

**Framework:** Playwright (`@playwright/test`)

### File di test

| File | Suite di test |
|---|---|
| `e2e/upload.spec.js` | Flussi di upload |
| `e2e/gallery.spec.js` | Galleria e gestione file |
| `e2e/admin.spec.js` | Pannello di amministrazione |
| `e2e/sharelink.spec.js` | Creazione e utilizzo dei link di condivisione |
| `e2e/tags.spec.js` | Gestione dei tag |
| `e2e/bulk-actions-fixes.spec.js` | Azioni in blocco |

### Esecuzione

```bash
# Tutti i test
npm run test:e2e

# Con interfaccia grafica
npm run test:e2e:ui
```

**Configurazione Playwright:** `playwright.config.js` (avvia il server con `INSTALL_TOKEN`, predefinito `e2e-install-token`)  
**Setup globale:** `e2e/global-setup.js` (esegue l'installazione con questo token, crea utenti di test, admin, ecc.)  
**Helper:** `e2e/helpers.js` (funzioni helper condivise)

### Test unitari

```bash
npm test
```

Funzionano senza database: `src/utils/validateEmail.test.js`, `src/utils/stripMetadata.test.js` e `src/utils/fileCrypto.test.js` (cifratura: roundtrip, intervalli di byte, rilevamento di manomissioni).

---

## Appendice: Azioni del log di audit

| Azione | Trigger |
|---|---|
| `login` | Accesso riuscito |
| `logout` | Disconnessione |
| `register` | Registrazione |
| `upload` | Upload file |
| `delete_file` | File eliminato |
| `delete_account` | Account eliminato |
| `change_password` | Password modificata |
| `change_username` | Nome utente modificato |
| `change_email` | Email modificata |
| `verify_email` | Email verificata |
| `forgot_password` | Reset password richiesto |
| `reset_password` | Password reimpostata |
| `regen_api_key` | Chiave API rigenerata |
| `sharex_config` | Configurazione ShareX scaricata |
| `export_data` | Esportazione dati |
| `admin_create_user` | Admin: utente creato |
| `admin_delete_user` | Admin: utente eliminato |
| `admin_toggle_user` | Admin: utente attivato/disattivato |
| `admin_change_role` | Admin: ruolo utente modificato |
| `admin_change_password` | Admin: password impostata |
| `admin_regen_key` | Admin: chiave API rigenerata |

---

*Documentazione generata dal codice sorgente di sharely v1.0.0*
