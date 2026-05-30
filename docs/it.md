# Sharely — Documentazione Tecnica

> **Versione:** 1.0.0 · **Licenza:** MIT · **Node.js:** ≥ 18

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
       → File.createUnique() → MongoDB
       → generateThumbnail() (async, non-blocking)
       → logAudit()
       → broadcast('file:uploaded') via WebSocket
       ← JSON: { files: [...] }
```

### Flusso di dati: Upload ShareX

```
ShareX → POST /upload (token im Formular-Body)
       → multer: Datei temporär in uploads/
       → requireApiKey: Token-Lookup → User
       → fs.renameSync → uploads/{folderName}/
       → File.create() → MongoDB
       ← JSON: { url, delete_url }
```

---

## 3. Stack tecnologico

| Livello | Tecnologia | Versione |
|---|---|---|
| **Runtime** | Node.js | ≥ 18 |
| **Framework backend** | Express.js | 4.x |
| **Database** | MongoDB + Mongoose | Mongo 7, Mongoose 8.x |
| **Sessioni** | express-session + connect-mongo | — |
| **Tempo reale** | WebSocket (`ws`) | 8.x |
| **Upload file** | Multer | 1.x |
| **Email** | Nodemailer | 8.x |
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
│   │   ├── auth.js                 # requireLogin / requireAdmin / requireApiKey
│   │   └── upload.js               # Configurazione Multer, lista di blocco
│   ├── models/
│   │   ├── AuditLog.js             # Eventi di audit (TTL 90 giorni)
│   │   ├── Collection.js           # Raccolte di file
│   │   ├── File.js                 # Metadati dei file
│   │   ├── ShareLink.js            # Link di condivisione per file
│   │   ├── SiteSettings.js         # Singleton: impostazioni operatore
│   │   └── User.js                 # Account utente + chiavi API
│   ├── routes/
│   │   ├── api.js                  # API principale (upload, galleria, admin, ...)
│   │   ├── auth.js                 # Login / Registrazione / Reset password
│   │   ├── files.js                # Servizio file, embed OG, richieste di intervallo
│   │   ├── import.js               # Migrazione XBackBone
│   │   ├── install.js              # Endpoint di installazione iniziale
│   │   └── shares.js               # Servizio file tramite link di condivisione
│   ├── jobs/
│   │   └── retentionCleanup.js     # Eliminazione giornaliera dei file scaduti
│   ├── migrations/
│   │   ├── migrateApiKeyHashes.js  # Una tantum: testi in chiaro → hash SHA-256
│   │   └── migrateUserFolders.js   # Una tantum: spostamento file nelle cartelle utente
│   ├── utils/
│   │   ├── audit.js                # Funzione helper logAudit()
│   │   ├── generateThumbnail.js    # Integrazione ffmpeg / ghostscript
│   │   ├── mailer.js               # Wrapper Nodemailer + template email i18n
│   │   └── sanitizeFilename.js     # Sanificazione del nome file
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
│   └── generate-missing-thumbnails.js
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
| `NODE_ENV` | — | `production` abilita i cookie sicuri |

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
  shortId:      String (8 caratteri esadecimali: 6 timestamp + 2 casuali, unico)
  deleteToken:  String (32 caratteri esadecimali, unico)
  originalName: String (sanificato)
  storedName:   String (percorso relativo: "folderName/8hex.ext")
  mimeType:     String
  size:         Number (byte)
  uploader:     ObjectId → User
  views:        Number
  tags:         [String] (max 20 × 50 caratteri)
  createdAt:    Date
}
```

**Proprietà calcolate:**
- `sizeHuman` — dimensione leggibile (B / KB / MB / GB)
- `displayType` — classificazione: `image|video|audio|pdf|code|text|file`

**Algoritmo Short ID:**
```
shortId = hex(seconds_since_2024-01-01, 6 chars) + randomBytes(2).hex()
```

### Collection (`src/models/Collection.js`)

```
{
  shortId:     String (8 Hex, unico)
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

### Autenticazione (`/api/auth`)

| Metodo | Percorso | Auth | Descrizione |
|---|---|---|---|
| `GET` | `/me` | Sessione | Utente attualmente connesso |
| `POST` | `/login` | — | Accesso (limitato: 10/15min) |
| `POST` | `/register` | — | Registrazione (limitata, il primo utente diventa admin) |
| `POST` | `/logout` | — | Disconnessione |
| `GET` | `/smtp-enabled` | — | Verifica se SMTP è configurato |
| `GET` | `/verify-email?token=` | — | Verificare l'indirizzo email |
| `GET` | `/verify-reset-token?token=` | — | Validare il token di reset |
| `POST` | `/forgot-password` | — | Inviare l'email di reset password (limitato: 5/h) |
| `POST` | `/reset-password` | — | Impostare la nuova password |

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
2. `POST /api/chunk/:uploadId` (Body: `chunkIndex=N`, File: `chunk`) → `{ received: N }`  
   In parallelo con 3–5 blocchi simultanei
3. `POST /api/chunk/:uploadId/complete` → `{ files: [fileObject] }`

---

### Gestione file

| Metodo | Percorso | Auth | Descrizione |
|---|---|---|---|
| `GET` | `/api/gallery` | Sessione | File propri (admin: tutti), paginato (24/pagina), filtri: `q`, `type`, `tag`, `page` |
| `GET` | `/api/file/:shortId` | — | Metadati del file (incrementa il contatore visualizzazioni) |
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

---

### Link di condivisione

| Metodo | Percorso | Auth | Descrizione |
|---|---|---|---|
| `GET` | `/api/file/:shortId/share-links` | Sessione (Proprietario/Admin) | Tutti i link di condivisione di un file |
| `POST` | `/api/file/:shortId/share-links` | Sessione (Proprietario/Admin) | Creare link di condivisione |
| `DELETE` | `/api/share-links/:token` | Sessione (Proprietario/Creatore/Admin) | Eliminare link di condivisione |
| `GET` | `/api/share-links/:token` | — | Metadati del link di condivisione (pubblico) |
| `POST` | `/api/share-links/:token/verify` | — | Verificare la password del link di condivisione |

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
| `POST` | `/api/collections/:id/verify` | — | Verificare la password della raccolta |

---

### Endpoint di amministrazione

| Metodo | Percorso | Auth | Descrizione |
|---|---|---|---|
| `GET` | `/api/admin/stats` | Admin | Statistiche del pannello |
| `GET` | `/api/admin/users` | Admin | Tutti gli utenti (con numero di file) |
| `POST` | `/api/admin/users` | Admin | Creare utente |
| `PATCH` | `/api/admin/users/:id/toggle` | Admin | Attivare/disattivare utente |
| `PATCH` | `/api/admin/users/:id/role` | Admin | Cambiare ruolo utente |
| `DELETE` | `/api/admin/users/:id` | Admin | Eliminare utente |
| `POST` | `/api/admin/users/:id/regen-key` | Admin | Rigenerare chiave API |
| `PATCH` | `/api/admin/users/:id/password` | Admin | Impostare password |
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
| `file:view` | Tutti | `{ shortId, views }` |
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

Serve il file come risposta HTTP con supporto delle richieste di intervallo (206 Partial Content). Immagini/video/audio: `Content-Disposition: inline`, altri: `attachment`.

### `/f/:shortId/download` — Download forzato

Come `/raw`, ma sempre `Content-Disposition: attachment`.

### `/f/:shortId/thumb` — Miniatura

Restituisce la miniatura JPEG (per video e PDF). `Cache-Control: public, max-age=86400`.

### `/f/:shortId/delete/:token` — Eliminazione ShareX

Elimina il file senza sessione tramite token di eliminazione univoco.

### `/s/:token` — Servizio file tramite link di condivisione (`src/routes/shares.js`)

Verifica la password (tramite flag di sessione), la data di scadenza e il limite di download, poi serve il file.

---

## 10. Autenticazione e sicurezza

### Autenticazione tramite sessione

- Sessione Express con store MongoDB (`connect-mongo`)
- Cookie di sessione: `httpOnly: true`, `sameSite: 'strict'`, `secure: true` in produzione
- Durata della sessione: configurabile tramite `SiteSettings.sessionDurationDays` (predefinito: 7 giorni), con cache live di 60 secondi

### Autenticazione tramite chiave API

- Le chiavi API sono memorizzate come hash SHA-256, mai in testo in chiaro
- I primi 8 caratteri sono memorizzati come `apiKeyPrefix` (per scopi di visualizzazione)
- Ricerca: `User.findByApiKey(plaintext)` calcola l'hash e cerca in `apiKeyHash`
- Al download della configurazione ShareX, la chiave viene rigenerata — il testo in chiaro è visibile solo in quel momento

### Catena middleware (`src/middleware/auth.js`)

```
requireLogin    → verifica req.session.user → 401 se non connesso
requireAdmin    → come requireLogin, in aggiunta role === 'admin' → 403
requireApiKey   → verifica l'header Authorization o req.body.token
```

### Protezione CSRF

`requireSameOrigin()` in `app.js` confronta l'header `Origin` con l'header `Host` per tutte le route API. Complementa i cookie `sameSite: 'strict'`.

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

### Header di sicurezza

- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`

### Rate limiting

| Endpoint | Limite | Finestra |
|---|---|---|
| Upload (`/upload`, `/api/upload`, `/api/web-upload`) | 60 richieste | 15 minuti |
| Auth (`/api/auth/login`, `/register`, ecc.) | 10 richieste | 15 minuti |
| Reset password | 5 richieste | 1 ora |

### Lista di blocco dei file

I seguenti tipi MIME ed estensioni vengono rifiutati all'upload:

**Tipi MIME bloccati:** `application/x-executable`, `application/x-sh`, `application/x-csh`, `application/x-bat`

**Estensioni bloccate:** `.bat`, `.cmd`, `.com`, `.ps1`, `.psm1`, `.psd1`, `.sh`, `.bash`, `.csh`, `.zsh`, `.fish`, `.vbs`, `.vbe`, `.jse`, `.scr`, `.pif`, `.application`, `.gadget`, `.hta`, `.php`, `.php3–5`, `.phtml`, `.asp`, `.aspx`, `.jsp`, `.jspx`, `.cfm`

### Protezione da path traversal

Tutti gli accessi ai file tramite `resolveUploadPath()` verificano che il percorso risolto si trovi all'interno di `UPLOAD_DIR`.

---

## 11. Sistema di upload

### Upload standard (Multer)

- **Archiviazione:** `multer.diskStorage` → `uploads/{folderName}/{8hex}{.ext}`
- **Nome file:** `crypto.randomBytes(4).hex() + estensione-originale`
- **Limite:** `MAX_FILE_SIZE_MB` (predefinito: 100 MB)
- **Posizione:** Cartella specifica dell'utente (`user.folderName`)

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

### Upload avatar

- **Archiviazione:** `multer.memoryStorage()` (nessun buffer su disco)
- **Posizione:** `uploads/.avatars/{userId}{.ext}`
- **Limite:** 2 MB
- **Formati:** JPEG, PNG, GIF, WebP

---

## 12. Generazione delle miniature

Le miniature vengono generate in modo asincrono dopo l'upload (`.catch(() => {})` — gli errori vengono ignorati silenziosamente).

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
- Creare utenti, attivare/disattivare, cambiare ruolo
- Reimpostare password, rigenerare chiave API
- Cambiare nome cartella (i file fisici vengono spostati sul server)
- Eliminare utente (tutti i file vengono eliminati)

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
| Autoeliminazione account (file + dati) | Art. 17 – Diritto alla cancellazione |
| Log di audit (TTL 90 giorni via MongoDB) | Art. 5(2) – Responsabilità |
| Esportazione CSV del log di audit | Art. 5(2) – Responsabilità |
| Conservazione file configurabile | Art. 5(1)(e) – Limitazione della conservazione |
| Chiavi API come hash SHA-256 | Art. 32 – Sicurezza |
| Password come bcrypt (12 round) | Art. 32 – Sicurezza |
| Consenso cookie per Cloudflare Analytics | Art. 13 – Trasparenza |
| Anonimizzazione alla cancellazione dell'account | Art. 17 – Diritto alla cancellazione |

### Flusso di eliminazione GDPR

Alla cancellazione dell'account (`user:delete-account` / `DELETE /api/user/account`):
1. Tutti i file dell'utente vengono eliminati dal disco
2. Le miniature vengono eliminate
3. L'avatar viene eliminato
4. Le voci del log di audit vengono anonimizzate (`username: '[deleted]'`, `ip: null`, `userId: null`)
5. Il documento utente viene eliminato
6. La sessione viene distrutta

---

## 18. Job in background

### Pulizia per conservazione (`src/jobs/retentionCleanup.js`)

- **Esecuzione:** All'avvio e poi quotidianamente (`setInterval(runRetentionCleanup, 24h)`)
- **Azione:** Se `SiteSettings.fileRetentionDays > 0`, i file più vecchi di questo valore vengono eliminati
- Elimina: file su disco, miniatura, documento MongoDB
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
- `app` — Applicazione Node.js (porta 3000)
- `mongo` — MongoDB 7 (porta 127.0.0.1:27017, non accessibile dall'esterno)

**Volumi:**
- `uploads` — archiviazione persistente dei file
- `mongo_data` — dati MongoDB

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

### Primo avvio

Il primo utente registrato riceve automaticamente il ruolo `admin` (`User.countDocuments() === 0`).

---

## 20. Ambiente di sviluppo

### Prerequisiti

- Node.js ≥ 18
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
```

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

**Configurazione Playwright:** `playwright.config.js`  
**Setup globale:** `e2e/global-setup.js` (crea utenti di test, admin, ecc.)  
**Helper:** `e2e/helpers.js` (funzioni helper condivise)

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
