# Sharely — Documentación Técnica

> **Versión:** 1.0.0 · **Licencia:** MIT · **Node.js:** ≥ 22

---

## Índice

1. [Descripción del proyecto](#1-descripción-del-proyecto)
2. [Arquitectura](#2-arquitectura)
3. [Stack tecnológico](#3-stack-tecnológico)
4. [Estructura de directorios](#4-estructura-de-directorios)
5. [Configuración y variables de entorno](#5-configuración-y-variables-de-entorno)
6. [Modelos de datos](#6-modelos-de-datos)
7. [API REST](#7-api-rest)
8. [API WebSocket](#8-api-websocket)
9. [Rutas de servicio de archivos](#9-rutas-de-servicio-de-archivos)
10. [Autenticación y seguridad](#10-autenticación-y-seguridad)
11. [Sistema de carga](#11-sistema-de-carga)
12. [Generación de miniaturas](#12-generación-de-miniaturas)
13. [Correo electrónico y SMTP](#13-correo-electrónico-y-smtp)
14. [Internacionalización](#14-internacionalización)
15. [Frontend (React SPA)](#15-frontend-react-spa)
16. [Panel de administración](#16-panel-de-administración)
17. [RGPD / Privacidad](#17-rgpd--privacidad)
18. [Tareas en segundo plano](#18-tareas-en-segundo-plano)
19. [Despliegue](#19-despliegue)
20. [Entorno de desarrollo](#20-entorno-de-desarrollo)
21. [Migraciones y scripts](#21-migraciones-y-scripts)
22. [Pruebas end-to-end](#22-pruebas-end-to-end)

---

## 1. Descripción del proyecto

Sharely es una **plataforma de intercambio de archivos autoalojada** con una interfaz web limpia, integración con ShareX y acceso mediante API. Los usuarios suben capturas de pantalla, archivos y contenido multimedia, y los comparten al instante mediante enlaces cortos.

### Funcionalidades principales

| Funcionalidad | Descripción |
|---|---|
| Carga web | Arrastrar y soltar, hasta 500 archivos simultáneamente |
| Carga por partes | Archivos de hasta 2 GB mediante carga multi-parte paralela |
| Integración ShareX | Archivo de configuración `.sxcu` descargable con un clic |
| Carga por API | Autenticación por token Bearer, compatible con curl/wget |
| Visor de archivos | Zoom en imágenes, transmisión de vídeo/audio (HTTP Range), PDF en línea, código con resaltado de sintaxis |
| Modos de incrustación | *embed* (HTML OG/Twitter Card) o *raw* (redirección directa) |
| Miniaturas | Vistas previas JPEG automáticas para vídeos (ffmpeg) y PDFs (ghostscript) |
| Colecciones | Agrupaciones de archivos con contraseña y fecha de expiración opcionales |
| Enlaces de compartición | Enlaces por archivo con contraseña, expiración y límite de descargas |
| Interfaz en tiempo real | Actualizaciones en vivo por WebSocket (carga, eliminación, contador de visitas, estadísticas admin) |
| Multilingüe | 8 idiomas: EN, DE, FR, ES, IT, PT, JA, ZH |
| Panel de administración | Estadísticas, gestión de usuarios, gestión de archivos, registro de auditoría (exportación CSV) |
| Cumplimiento RGPD | Funcionalidades de privacidad conforme al RGPD (Art. 17, 20, 32, etc.) |
| Importación XBackBone | Migración de instalaciones XBackBone existentes |
| Listo para Docker | `docker compose up -d` inicia el entorno completo |

---

## 2. Arquitectura

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

### Flujo de datos: Carga estándar

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

### Flujo de datos: Carga ShareX

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

## 3. Stack tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| **Runtime** | Node.js | ≥ 22 |
| **Framework backend** | Express.js | 4.x |
| **Base de datos** | MongoDB + Mongoose | Mongo 7, Mongoose 8.x |
| **Sesiones** | express-session + connect-mongo | — |
| **Tiempo real** | WebSocket (`ws`) | 8.x |
| **Carga de archivos** | Multer | 2.x |
| **Cifrado de archivos** | AES-256-GCM, HKDF-SHA256 (Node Crypto) | — |
| **Correo electrónico** | Nodemailer | 10.x |
| **Hash de contraseñas** | bcryptjs | 2.x (12 rondas) |
| **Hash de claves API** | SHA-256 (Node Crypto) | — |
| **Limitación de tasa** | express-rate-limit | 8.x |
| **Importación XBackBone** | sql.js | 1.x |
| **Framework frontend** | React 18 | 18.3.x |
| **Enrutamiento (frontend)** | React Router v6 | 6.x |
| **Herramienta de compilación** | Vite | 6.x |
| **Estilos** | Tailwind CSS + Radix UI | 3.x |
| **Componentes UI** | shadcn/ui (Radix primitives) | — |
| **Iconos** | FontAwesome | 6.x |
| **i18n** | i18next + react-i18next | — |
| **Resaltado de sintaxis** | highlight.js | 11.x |
| **Contenedores** | Docker + Docker Compose | — |
| **Pruebas** | Playwright (E2E) | 1.60.x |

---

## 4. Estructura de directorios

```
sharely/
├── app.js                          # Punto de entrada Express, secuencia de inicio
├── package.json
├── .env.example                    # Plantilla para todas las variables de entorno
├── Dockerfile
├── docker-compose.yml
│
├── src/
│   ├── config/
│   │   └── db.js                   # Conexión MongoDB (Mongoose)
│   ├── middleware/
│   │   ├── auth.js                 # requireLogin / requireAdmin / requireApiKey / establishSession
│   │   ├── lookupLimiter.js        # Límite de tasa común para búsquedas de ID fallidas
│   │   └── upload.js               # Configuración Multer, lista de bloqueo
│   ├── models/
│   │   ├── AuditLog.js             # Eventos de auditoría (TTL 90 días)
│   │   ├── Collection.js           # Colecciones de archivos
│   │   ├── File.js                 # Metadatos de archivos
│   │   ├── Paste.js                # Pastes de texto
│   │   ├── ShareLink.js            # Enlaces de compartición por archivo
│   │   ├── SiteSettings.js         # Singleton: configuración del operador
│   │   └── User.js                 # Cuentas de usuario + claves API
│   ├── routes/
│   │   ├── api.js                  # API principal (carga, galería, admin, ...)
│   │   ├── auth.js                 # Login / Registro / Restablecimiento de contraseña
│   │   ├── docs.js                 # Página pública de documentación (/docs)
│   │   ├── files.js                # Servicio de archivos, embeds OG, solicitudes de rango
│   │   ├── import.js               # Migración XBackBone
│   │   ├── install.js              # Endpoint de instalación inicial (token de instalación)
│   │   ├── pastes.js               # API de pastes
│   │   └── shares.js               # Servicio de archivos por enlace de compartición
│   ├── jobs/
│   │   └── retentionCleanup.js     # Eliminación diaria de archivos expirados y restos de cargas
│   ├── migrations/
│   │   ├── migrateApiKeyHashes.js  # Única vez: textos en claro → hashes SHA-256
│   │   └── migrateUserFolders.js   # Única vez: mover archivos a carpetas de usuario
│   ├── utils/
│   │   ├── asyncRouter.js          # Router Express que pasa los errores async al manejador de errores
│   │   ├── audit.js                # Función auxiliar logAudit()
│   │   ├── deleteUserData.js       # Eliminación completa de todos los datos de una cuenta
│   │   ├── fileCrypto.js           # Cifrado de archivos almacenados (AES-256-GCM)
│   │   ├── generateThumbnail.js    # Integración ffmpeg / ghostscript
│   │   ├── mailer.js               # Wrapper Nodemailer + plantillas de email i18n
│   │   ├── mime.js                 # Normalización MIME, lista blanca para entrega en línea
│   │   ├── sanitizeFilename.js     # Saneamiento de nombre de archivo
│   │   ├── setupToken.js           # Token de instalación inicial
│   │   ├── storeUpload.js          # Cifrar carga, miniatura desde copia en claro
│   │   └── uploadPath.js           # Resolución de rutas con protección contra path traversal
│   └── ws.js                       # Servidor WebSocket + despachador de acciones
│
├── client/                         # Frontend React
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx                # Punto de entrada React
│       ├── App.jsx                 # Configuración del enrutador
│       ├── index.css               # Estilos globales
│       ├── context/
│       │   └── AuthContext.jsx     # Estado de autenticación global
│       ├── hooks/
│       │   ├── use-toast.js        # Hook de notificaciones toast
│       │   └── useWebSocket.js     # Conexión WS + manejadores de eventos
│       ├── components/
│       │   ├── Layout.jsx          # Shell de la aplicación (barra de navegación, sidebar)
│       │   ├── ProtectedRoute.jsx  # Guardia de autenticación
│       │   ├── ShareLinkDialog.jsx # Diálogo de creación de enlace de compartición
│       │   ├── AddToCollectionDialog.jsx
│       │   ├── CookieBanner.jsx
│       │   ├── LanguageSelector.jsx
│       │   ├── RequireEmailDialog.jsx
│       │   ├── UserAvatar.jsx
│       │   └── ui/                 # Componentes base shadcn/ui
│       ├── pages/
│       │   ├── Upload.jsx          # Página de carga
│       │   ├── Gallery.jsx         # Galería de archivos
│       │   ├── FileView.jsx        # Vista detallada de archivo
│       │   ├── Collections.jsx     # Vista general de colecciones
│       │   ├── CollectionView.jsx  # Colección individual
│       │   ├── ShareView.jsx       # Página pública de enlace de compartición
│       │   ├── Settings.jsx        # Configuración de usuario
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   ├── ForgotPassword.jsx
│       │   ├── ResetPassword.jsx
│       │   ├── Install.jsx         # Instalación inicial
│       │   ├── PrivacyPolicy.jsx
│       │   ├── TermsOfService.jsx
│       │   └── admin/
│       │       ├── Dashboard.jsx   # Página de inicio admin
│       │       ├── Users.jsx       # Gestión de usuarios
│       │       ├── Files.jsx       # Gestión de archivos
│       │       ├── AuditLog.jsx    # Vista del registro de auditoría
│       │       ├── SiteSettings.jsx# Configuración del operador
│       │       └── Import.jsx      # Importación XBackBone
│       ├── i18n/
│       │   ├── index.js            # Configuración i18next
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
│           └── utils.js            # Utilidad Tailwind (cn())
│
├── scripts/
│   ├── setup-db.js
│   ├── mongo-init.js               # Script de inicialización MongoDB
│   ├── migrate-uploads-to-user-folders.js
│   ├── generate-missing-thumbnails.js
│   └── encrypt-existing-files.js   # Cifrar posteriormente archivos existentes
│
├── e2e/                            # Pruebas Playwright
│   ├── admin.spec.js
│   ├── bulk-actions-fixes.spec.js
│   ├── gallery.spec.js
│   ├── sharelink.spec.js
│   ├── tags.spec.js
│   ├── upload.spec.js
│   ├── helpers.js
│   └── global-setup.js
│
├── uploads/                        # Archivos subidos (runtime)
│   ├── .thumbnails/
│   ├── .avatars/
│   └── .chunks/                    # Fragmentos temporales
│
└── docs/assets/                    # Capturas de pantalla y logotipo
```

---

## 5. Configuración y variables de entorno

Todas las variables se cargan desde `.env` (mediante `dotenv`). El archivo `.env.example` contiene la plantilla completa.

### Campos obligatorios

| Variable | Descripción |
|---|---|
| `SESSION_SECRET` | Secreto para el cifrado de sesiones — cadena aleatoria larga, p. ej. `openssl rand -hex 32` |
| `MONGO_ROOT_PASSWORD` | Contraseña root de MongoDB (requerida solo para Docker Compose) |
| `MONGO_APP_PASSWORD` | Contraseña del usuario de aplicación de MongoDB |

### Todas las variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto TCP del servidor HTTP |
| `BIND_ADDRESS` | `127.0.0.1` | Dirección del host donde Docker publica el puerto. Detrás de un proxy inverso, mantener loopback; `0.0.0.0` solo tras un firewall externo o sin proxy (ver «Cloudflare Tunnel / proxy en un contenedor») |
| `TRUST_PROXY` | `1` | Número de saltos de proxy de confianza (p. ej. `2` para Cloudflare → nginx); debe coincidir con tu configuración o las IP de cliente y los límites de tasa serán incorrectos |
| `ENCRYPTION_KEY` | — | Clave de 32 bytes (`openssl rand -base64 32`). Si se define, los nuevos archivos y miniaturas se guardan cifrados (ver «Cifrado en reposo»). **Si se pierde, los archivos cifrados son ilegibles** |
| `INSTALL_TOKEN` | _(aleatorio, se escribe en el registro)_ | Token necesario para completar la instalación inicial |
| `MONGODB_URI` | _(construida desde Docker Compose)_ | URI de conexión MongoDB completa |
| `MONGO_ROOT_PASSWORD` | — | Contraseña root de MongoDB |
| `MONGO_APP_USER` | `appuser` | Nombre de usuario de aplicación MongoDB |
| `MONGO_APP_PASSWORD` | — | Contraseña del usuario de aplicación MongoDB |
| `MONGO_DB_NAME` | `sharely` | Nombre de la base de datos MongoDB |
| `SESSION_SECRET` | — | **Obligatorio** — secreto de cifrado de sesiones |
| `BASE_URL` | `http://localhost:3000` | URL base pública para los enlaces de compartición generados (sin `/` final) |
| `SITE_NAME` | `sharely` | Nombre del sitio en los embeds Open Graph |
| `MAX_FILE_SIZE_MB` | `100` | Tamaño máximo de archivo para cargas estándar en MB (cargas por partes hasta 2 GB independientemente) |
| `ALLOW_REGISTRATION` | `true` | `false` desactiva el registro público |
| `SMTP_HOST` | — | Nombre de host del servidor SMTP; dejar vacío para desactivar las funciones de email |
| `SMTP_PORT` | `587` | Puerto SMTP |
| `SMTP_SECURE` | `false` | `true` para TLS implícito (puerto 465), `false` para STARTTLS |
| `SMTP_USER` | — | Nombre de usuario SMTP |
| `SMTP_PASS` | — | Contraseña SMTP |
| `SMTP_FROM` | _(SMTP_USER)_ | Dirección de remitente en los correos salientes |
| `UPLOAD_DIR` | `./uploads` | Ruta absoluta al directorio de carga |
| `NODE_ENV` | — | Opcional. Las cookies seguras no dependen de ella: se establecen automáticamente en cuanto la solicitud llega por HTTPS (`X-Forwarded-Proto` del proxy) |
| `UPDATE_ENABLED` | `false` | Activa la autoactualización con un clic en el panel de administración |
| `UPDATE_CHANNEL` | `release` | Detección de actualizaciones: `release` (última etiqueta de release de GitHub) o `branch` (nuevos commits en `UPDATE_BRANCH`) |
| `UPDATE_BRANCH` | `main` | Rama que descarga el actualizador — y que se usa como referencia en el modo `branch` |
| `UPDATE_REPO` | `Christianoooooo/sharely` | Repositorio de GitHub en el que se buscan nuevas releases |
| `COMPOSE_PROJECT_NAME` | `sharely` | Nombre del proyecto Compose; debe ser idéntico en el host y en el actualizador |

### Actualizaciones automáticas

El panel de administración (**Admin → Configuración del sitio → Versión y actualizaciones**) muestra siempre la versión instalada y si hay una actualización disponible.

**En qué se basa «actualización disponible»** lo controla `UPDATE_CHANNEL`:

- `release` (predeterminado) — la versión instalada se compara con la última **etiqueta de release de GitHub**. Adecuado si se crea una release por cada versión.
- `branch` — el **commit** instalado se compara con la punta de `UPDATE_BRANCH`. Hay una actualización disponible en cuanto hay commits nuevos en la rama, sin necesidad de una release. La versión/commit instalado lo informa el contenedor del actualizador, por lo que este modo requiere que el actualizador esté en ejecución.

Opcionalmente, una actualización se puede instalar con un clic. De ello se encarga un contenedor propio `updater` — el **único** componente con acceso al socket de Docker. La aplicación web nunca toca el socket: solo deja un archivo de solicitud en un volumen compartido y el actualizador ejecuta entonces `git pull` + `docker compose build app thumbnailer` + `docker compose up -d app thumbnailer`.

> ⚠️ **Nota de seguridad:** El actualizador monta el socket de Docker, lo que equivale a permisos de root en el host. Actívalo solo si aceptas conscientemente este compromiso. Una aplicación web comprometida puede, como mucho, provocar una reconstrucción desde la rama configurada — no comandos arbitrarios en el host. Para ello, el directorio de control compartido pertenece a `root` y tiene el sticky bit (`1777`): la aplicación solo puede crear `update.request` y escribir `update.state`, pero no puede sustituir archivos del actualizador ni cambiarlos por enlaces simbólicos.

Requisitos: despliegue desde un **checkout de Git**, `UPDATE_ENABLED=true` en el `.env`, `COMPOSE_PROJECT_NAME` sin cambios e inicio incluyendo el actualizador mediante `docker compose --profile updater up -d --build`. El actualizador está detrás del perfil de Compose `updater`, así que un `docker compose up` normal nunca inicia el contenedor privilegiado. Al instalar una actualización, el contenedor de la aplicación se reconstruye y deja de estar disponible brevemente; la página muestra el progreso y se reconecta automáticamente. Con `UPDATE_ENABLED=false` (y sin el perfil) el panel solo notifica.

El actualizador reconstruye con `--no-deps` únicamente los contenedores de la aplicación y de miniaturas — la base de datos nunca se recrea con ellos. Sin embargo, **no se actualiza a sí mismo**: tras cambios en `updater/` es necesario ejecutar una vez `docker compose --profile updater up -d --build updater`.

---

## 6. Modelos de datos

### User (`src/models/User.js`)

```
{
  username:                    String (3–32, único, alfanumérico + _-)
  password:                    String (bcrypt, 12 rondas)
  role:                        'admin' | 'user'
  apiKey:                      String (legado, vacío tras migración)
  apiKeyHash:                  String (SHA-256, único, sparse)
  apiKeyPrefix:                String (primeros 8 caracteres del texto en claro)
  folderName:                  String (único, sparse, máx. 64)
  avatarExt:                   String | null (.jpg/.png/.gif/.webp)
  embedMode:                   'embed' | 'raw'
  isActive:                    Boolean
  sessionVersion:              Number (se incrementa al cambiar/restablecer la contraseña, invalida las demás sesiones)
  email:                       String (minúsculas, único, sparse)
  emailVerified:               Boolean
  emailVerificationToken:      String | null (hash SHA-256 del texto en claro)
  emailVerificationExpires:    Date | null
  passwordResetToken:          String | null (hash SHA-256)
  passwordResetExpires:        Date | null
  language:                    'en'|'de'|'fr'|'es'|'it'|'pt'|'ja'|'zh'
  predefinedTags:              [String] (máx. 100 etiquetas × 50 caracteres)
  createdAt:                   Date
}
```

**Métodos importantes:**
- `user.comparePassword(candidate)` — comparación bcrypt
- `user.regenerateApiKey()` — genera nuevo texto en claro, almacena el hash, devuelve el texto en claro (visible solo una vez)
- `User.findByApiKey(plaintext)` — búsqueda por hash SHA-256, solo usuarios activos

### File (`src/models/File.js`)

```
{
  shortId:       String (24 caracteres hexadecimales aleatorios, único)
  deleteToken:   String (32 caracteres hexadecimales, único; select: false, nunca en respuestas de la API)
  originalName:  String (saneado)
  storedName:    String (ruta relativa: "folderName/8hex.ext")
  mimeType:      String (normalizado a exactamente un "tipo/subtipo")
  encrypted:     Boolean (el archivo está en el formato de src/utils/fileCrypto.js)
  size:          Number (bytes, tamaño en claro)
  uploader:      ObjectId → User
  views:         Number
  expiresAt:     Date | null (autodestrucción tras una fecha)
  maxDownloads:  Number | null (autodestrucción tras N descargas)
  downloadCount: Number
  tags:          [String] (máx. 20 × 50 caracteres)
  description:   String (máx. 1000)
  createdAt:     Date
}
```

**Propiedades calculadas:**
- `sizeHuman` — tamaño legible (B / KB / MB / GB)
- `displayType` — clasificación: `image|video|audio|pdf|code|text|file`

**Algoritmo Short ID:**
```
shortId = randomBytes(12).hex()   // 24 hex chars; older IDs keep their 8-char format
```

### Collection (`src/models/Collection.js`)

```
{
  shortId:     String (24 Hex, único)
  name:        String (máx. 100)
  description: String (máx. 500)
  owner:       ObjectId → User
  files:       [ObjectId → File]
  password:    String | null (bcrypt)
  expiresAt:   Date | null
  createdAt:   Date
}
```

> Las colecciones expiradas son eliminadas automáticamente por el índice TTL de MongoDB 7 días después de su expiración.

### ShareLink (`src/models/ShareLink.js`)

```
{
  token:         String (32 Hex, único)
  file:          ObjectId → File
  createdBy:     ObjectId → User
  label:         String (máx. 100)
  password:      String | null (bcrypt)
  expiresAt:     Date | null
  downloadLimit: Number (-1 = ilimitado)
  downloadCount: Number
  createdAt:     Date
}
```

> Como las colecciones: período de gracia de 7 días después de la expiración mediante índice TTL.

### SiteSettings (`src/models/SiteSettings.js`)

Documento singleton (`_id: 'singleton'`):

```
{
  operatorName:        String
  operatorAddress:     String
  operatorEmail:       String
  cloudflareAnalytics: Boolean
  fileRetentionDays:   Number (0 = desactivado)
  encryptionAtRest:    Boolean
  sessionDurationDays: Number (por defecto: 7)
  allowRegistration:   Boolean
}
```

### AuditLog (`src/models/AuditLog.js`)

```
{
  timestamp: Date (índice TTL: 90 días)
  userId:    ObjectId → User | null
  username:  String | null
  action:    String
  ip:        String | null
  meta:      Mixed (metadatos específicos de la acción)
}
```

---

## 7. API REST

### URL base: `/api`

Todos los endpoints JSON devuelven `Content-Type: application/json`. Errores: `{ "error": "mensaje" }`.

---

### Instalación (`/api/install`)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/status` | — | `{ installed: Boolean }` (si ya existen usuarios) |
| `POST` | `/setup` | Token de instalación | Crear la cuenta de administrador y la configuración del operador; solo mientras no exista ningún usuario |

El token de instalación aparece en el registro al iniciar (`[install] Not installed yet. Setup token: …`) o se define mediante `INSTALL_TOKEN`. Sin un `setupToken` correcto en el cuerpo, `/setup` responde con `403`.

---

### Autenticación (`/api/auth`)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/me` | Sesión | Usuario actualmente conectado |
| `POST` | `/login` | — | Iniciar sesión (limitado: 10/15min; asigna un nuevo ID de sesión) |
| `POST` | `/register` | — | Registrarse (limitado; el primer admin solo se crea en la instalación) |
| `POST` | `/logout` | — | Cerrar sesión |
| `GET` | `/smtp-enabled` | — | Comprobar si SMTP está configurado |
| `GET` | `/verify-email?token=` | — | Verificar dirección de email |
| `GET` | `/verify-reset-token?token=` | — | Validar token de restablecimiento |
| `POST` | `/forgot-password` | — | Enviar email de restablecimiento de contraseña (limitado: 5/h) |
| `POST` | `/reset-password` | — | Establecer nueva contraseña (cierra todas las sesiones existentes) |

**Petición de inicio de sesión:**
```json
POST /api/auth/login
{ "username": "max", "password": "meinPasswort123" }
```

**Respuesta de inicio de sesión:**
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

### Carga de archivos

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/upload` | Clave API | Carga ShareX (endpoint legado en `app.js`) |
| `POST` | `/api/upload` | Clave API | Carga ShareX/API (campo: `file`) |
| `POST` | `/api/web-upload` | Sesión | Carga web (campo: `files[]`, máx. 500) |
| `POST` | `/api/chunk/init` | Sesión | Inicializar carga por partes |
| `POST` | `/api/chunk/:uploadId` | Sesión | Subir un fragmento (campo: `chunk`) |
| `POST` | `/api/chunk/:uploadId/complete` | Sesión | Ensamblar fragmentos |
| `DELETE` | `/api/chunk/:uploadId` | Sesión | Cancelar carga y limpiar |

**Respuesta de carga por API:**
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

#### Flujo de carga por partes

1. `POST /api/chunk/init` → `{ uploadId: "32hex" }`  
   Comprobación de cuota contra `totalSize` más los tamaños anunciados de todas las cargas por partes abiertas del usuario
2. `POST /api/chunk/:uploadId` (Cuerpo: `chunkIndex=N`, Archivo: `chunk`) → `{ received: N }`  
   En paralelo con 3–5 fragmentos simultáneos; `413` en cuanto los bytes recibidos superan `totalSize`
3. `POST /api/chunk/:uploadId/complete` → `{ files: [fileObject] }`  
   `400` si el archivo ensamblado no mide exactamente `totalSize`

---

### Gestión de archivos

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/gallery` | Sesión | Archivos propios (admin: todos), paginado (24/página), filtros: `q`, `type`, `tag`, `page` |
| `GET` | `/api/file/:shortId` | — | Metadatos del archivo sin `deleteToken` (incrementa el contador de vistas) |
| `PATCH` | `/api/file/:shortId` | Sesión | Actualizar etiquetas/nombre |
| `DELETE` | `/api/file/:shortId` | Sesión | Eliminar archivo |
| `DELETE` | `/api/delete/:shortId` | Clave API | Eliminar archivo (autenticación por clave API) |
| `POST` | `/api/files/bulk` | Sesión | Acciones en masa: `delete`, `tag`, `removeTag`, `addToCollection`, `moveToCollection` |
| `GET` | `/api/tags` | Sesión | Todas las sugerencias de etiquetas del usuario |

**Parámetros de consulta de la galería:**
- `q` — búsqueda en el nombre de archivo (seguro para regex)
- `type` — `all|image|video|audio|pdf|code`
- `tag` — filtro de etiqueta exacto
- `page` — número de página (por defecto: 1)

---

### Configuración de usuario

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/my-key` | Sesión | Mostrar prefijo de clave API |
| `POST` | `/api/regen-key` | Sesión | Regenerar clave API |
| `GET` | `/api/sharex-config` | Sesión | Descargar ShareX `.sxcu` (regenera la clave) |
| `PATCH` | `/api/user/username` | Sesión | Cambiar nombre de usuario (contraseña requerida) |
| `PATCH` | `/api/user/password` | Sesión | Cambiar contraseña |
| `PATCH` | `/api/user/email` | Sesión | Cambiar email (envía email de verificación) |
| `PATCH` | `/api/user/language` | Sesión | Establecer idioma de la interfaz |
| `PATCH` | `/api/user/embed-mode` | Sesión | Establecer modo de incrustación (`embed`/`raw`) |
| `POST` | `/api/user/resend-verification` | Sesión | Reenviar email de verificación |
| `GET` | `/api/user/export` | Sesión | Exportación de datos (RGPD Art. 20) como JSON |
| `DELETE` | `/api/user/account` | Sesión | Eliminar cuenta (RGPD Art. 17, contraseña requerida) |
| `GET` | `/api/user/predefined-tags` | Sesión | Obtener etiquetas predefinidas |
| `PATCH` | `/api/user/predefined-tags` | Sesión | Actualizar etiquetas predefinidas |
| `POST` | `/api/user/avatar` | Sesión | Subir avatar (máx. 2 MB, JPEG/PNG/GIF/WebP) |
| `DELETE` | `/api/user/avatar` | Sesión | Eliminar avatar |
| `GET` | `/api/user/avatar/:userId` | — | Servir avatar |

Nombre de usuario, contraseña, email, email de verificación y eliminación de cuenta están limitados a 10 intentos en 15 minutos por usuario (contra la adivinación de contraseñas con una sesión robada y el spam de correo). Un cambio de contraseña cierra todas las demás sesiones del usuario; la actual permanece conectada.

---

### Enlaces de compartición

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/file/:shortId/share-links` | Sesión (Propietario/Admin) | Todos los enlaces de compartición de un archivo |
| `POST` | `/api/file/:shortId/share-links` | Sesión (Propietario/Admin) | Crear enlace de compartición |
| `DELETE` | `/api/share-links/:token` | Sesión (Propietario/Creador/Admin) | Eliminar enlace de compartición |
| `GET` | `/api/share-links/:token` | — | Metadatos del enlace de compartición (público; sin el `shortId` del archivo, para que la contraseña, la expiración y el límite no puedan eludirse mediante `/f/`) |
| `POST` | `/api/share-links/:token/verify` | — | Verificar contraseña del enlace de compartición (máx. 10 intentos fallidos por IP en 15 minutos) |

**Crear enlace de compartición:**
```json
POST /api/file/a1b2c3d4/share-links
{
  "label": "Para colegas",
  "password": "secreto",
  "expiresAt": "2025-12-31T23:59:59Z",
  "downloadLimit": 10
}
```

---

### Colecciones

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/collections` | Sesión | Colecciones propias (admin: todas) |
| `POST` | `/api/collections` | Sesión | Crear colección |
| `GET` | `/api/collections/:id` | — | Ver colección (pública, contraseña si está definida) |
| `PATCH` | `/api/collections/:id` | Sesión (Propietario/Admin) | Actualizar colección |
| `DELETE` | `/api/collections/:id` | Sesión (Propietario/Admin) | Eliminar colección |
| `POST` | `/api/collections/:id/files` | Sesión (Propietario/Admin) | Añadir archivo a la colección |
| `DELETE` | `/api/collections/:id/files/:fileShortId` | Sesión (Propietario/Admin) | Eliminar archivo de la colección |
| `POST` | `/api/collections/:id/verify` | — | Verificar contraseña de la colección (máx. 10 intentos fallidos por IP en 15 minutos) |

---

### Endpoints de administración

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/admin/stats` | Admin | Estadísticas del panel de control |
| `GET` | `/api/admin/users` | Admin | Todos los usuarios (con número de archivos) |
| `POST` | `/api/admin/users` | Admin | Crear usuario |
| `PATCH` | `/api/admin/users/:id/toggle` | Admin | Activar/desactivar usuario |
| `PATCH` | `/api/admin/users/:id/role` | Admin | Cambiar rol de usuario (efecto inmediato, también en sesiones abiertas) |
| `DELETE` | `/api/admin/users/:id` | Admin | Eliminar usuario y todos sus datos |
| `POST` | `/api/admin/users/:id/regen-key` | Admin | Regenerar clave API |
| `PATCH` | `/api/admin/users/:id/password` | Admin | Establecer contraseña (cierra todas las sesiones del usuario) |
| `PATCH` | `/api/admin/users/:id/folder` | Admin | Cambiar nombre de carpeta (mueve archivos) |
| `GET` | `/api/admin/files` | Admin | Todos los archivos, paginado (30/página) |
| `GET` | `/api/admin/site-settings` | Admin | Leer configuración del operador |
| `PATCH` | `/api/admin/site-settings` | Admin | Actualizar configuración del operador |
| `GET` | `/api/admin/audit-log` | Admin | Registro de auditoría paginado (50/página) |
| `GET` | `/api/admin/audit-log/export` | Admin | Descargar registro de auditoría como CSV |
| `GET` | `/api/site-settings` | — | Información pública del operador (para la página de privacidad) |

---

### Configuración del sitio (pública)

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

**Conexión:** `wss://example.com/ws` (solo para usuarios con sesión iniciada, se requiere cookie de sesión)

### Protección

- **Comprobación de origen:** El handshake se rechaza con `403` si la cabecera `Origin` no coincide con `Host` (misma regla que `requireSameOrigin` para la API HTTP). El proxy debe reenviar el `Host` original.
- **Comprobación continua de permisos:** La sesión, el estado activo, el rol y `sessionVersion` se vuelven a comprobar en cada mensaje y, además, cada 30 segundos para todas las conexiones. Tras cierre de sesión, desactivación, eliminación, cambio de contraseña o degradación, la conexión se cierra o pierde los permisos de admin y las difusiones de admin.
- **Heartbeat:** Ping cada 30 segundos; las conexiones sin pong se desconectan.
- **Límites:** máximo 64 KiB por mensaje (los mayores cierran la conexión con el código `1009`), hasta 30 mensajes seguidos y después 5 por segundo por conexión (si no, respuesta con `status: 429`), máximo 20 conexiones simultáneas por IP de cliente. Las acciones que comprueban la contraseña o envían emails están limitadas a 10 en 15 minutos por usuario.

### Protocolo

**Cliente → Servidor (Solicitud):**
```json
{ "id": "req-abc123", "action": "file:list", "payload": { "type": "image", "page": 1 } }
```

**Servidor → Cliente (Respuesta):**
```json
{ "id": "req-abc123", "data": { ... } }
```

**Servidor → Cliente (Error):**
```json
{ "id": "req-abc123", "error": "Forbidden", "status": 403 }
```

**Servidor → Cliente (Difusión):**
```json
{ "event": "file:uploaded", "data": { "shortId": "a1b2c3d4", "uploaderId": "..." } }
```

### Acciones disponibles

| Acción | Auth | Descripción |
|---|---|---|
| `site-settings:get` | — | Configuración pública del sitio |
| `auth:me` | Usuario | Datos del usuario conectado |
| `file:get` | Usuario | Detalles del archivo (incrementa vistas) |
| `file:list` | Usuario | Lista de archivos con filtro/paginación |
| `file:delete` | Usuario | Eliminar archivo |
| `user:get-key` | Usuario | Prefijo de clave API |
| `user:regen-key` | Usuario | Regenerar clave API |
| `user:change-password` | Usuario | Cambiar contraseña |
| `user:change-username` | Usuario | Cambiar nombre de usuario |
| `user:change-email` | Usuario | Cambiar email |
| `user:change-language` | Usuario | Establecer idioma |
| `user:change-embed-mode` | Usuario | Establecer modo de incrustación |
| `user:resend-verification` | Usuario | Reenviar email de verificación |
| `user:export` | Usuario | Exportación de datos |
| `user:delete-account` | Usuario | Eliminar cuenta |
| `admin:stats` | Admin | Estadísticas del panel |
| `admin:settings:get` | Admin | Leer configuración del sitio |
| `admin:settings:update` | Admin | Actualizar configuración del sitio |
| `admin:users:list` | Admin | Todos los usuarios |
| `admin:users:create` | Admin | Crear usuario |
| `admin:users:toggle` | Admin | Activar/desactivar usuario |
| `admin:users:role` | Admin | Cambiar rol de usuario |
| `admin:users:delete` | Admin | Eliminar usuario |
| `admin:users:regen-key` | Admin | Regenerar clave API |
| `admin:users:password` | Admin | Establecer contraseña |
| `admin:users:folder` | Admin | Cambiar nombre de carpeta |
| `admin:files:list` | Admin | Todos los archivos |
| `admin:audit-log:list` | Admin | Registro de auditoría paginado |

### Eventos de difusión

| Evento | Destinatarios | Carga útil |
|---|---|---|
| `file:uploaded` | Cargador | `{ shortId, uploaderId }` |
| `file:deleted` | Propietario del archivo | `{ shortId, uploaderId }` |
| `file:view` | Propietario del archivo + admins | `{ shortId, views }` |
| `user:created` | Admins | `{ id, username, role, ... }` |
| `user:deleted` | Admins | `{ id }` |
| `user:updated` | Admins | `{ id, ...campos modificados }` |
| `audit:log` | Admins | Objeto AuditLog completo |
| `settings:updated` | Admins | Objeto SiteSettings actualizado |
| `stats:invalidate` | Admins | `{}` (activa la actualización de estadísticas) |

---

## 9. Rutas de servicio de archivos

### `/f/:shortId` — Visor de archivos

- **Solicitud de navegador:** Redirige a la React SPA (`index.html`) — la SPA renderiza el visor.
- **Bot de red social** (Discord, Telegram, Twitter, etc.): Devuelve una página HTML mínima con metaetiquetas Open Graph / Twitter Card.
  - `embedMode = 'embed'`: HTML OG con redirección
  - `embedMode = 'raw'` + imagen/vídeo/audio: HTTP 302 → `/f/:shortId/raw`

### `/f/:shortId/raw` — Acceso directo

Sirve el archivo como respuesta HTTP con soporte de solicitudes de rango (206 Partial Content, también rangos de sufijo como `bytes=-500`). Los archivos cifrados se descifran al vuelo.

Qué archivos se muestran directamente en el navegador lo decide una lista blanca (`src/utils/mime.js`) basada en el tipo MIME normalizado:

| Caso | `Content-Type` | `Content-Disposition` | Adicional |
|---|---|---|---|
| Imágenes (PNG, JPEG, GIF, WebP, AVIF, BMP, ICO), formatos de vídeo/audio habituales, PDF | tipo real | `inline` | — |
| Texto y código (según `displayType`) | `text/plain; charset=utf-8` | `inline` | `CSP: sandbox` |
| HTML, SVG, XML y todo lo demás | `application/octet-stream` | `attachment` | `CSP: sandbox` |

Así, un archivo subido no puede renderizarse como página en el origen de la aplicación ni incluirse como script.

Si el archivo tiene un límite de descargas (`maxDownloads`), `/raw` solo cuenta las descargas completas (sin `Range` o desde el byte 0), y una vez por sesión de visitante: la vista previa y la posterior descarga del mismo visitante consumen juntas una descarga. Los accesos del propietario y de los admins nunca cuentan. Si se alcanza el límite, la ruta responde con `410`.

### `/f/:shortId/download` — Descarga forzada

Como `/raw`, pero siempre `Content-Disposition: attachment` y `application/octet-stream`. Cada nuevo visitante cuenta contra `maxDownloads`.

### `/f/:shortId/thumb` — Miniatura

Devuelve la miniatura JPEG (para vídeos y PDFs), descifrada si el cifrado está activado. `Cache-Control: public, max-age=86400`. El ID debe consistir en `[A-Za-z0-9_-]` (protección contra path traversal mediante `%2F`).

### `/f/:shortId/delete/:token` — Eliminación ShareX

Elimina el archivo sin sesión mediante un token de eliminación único. El token solo se devuelve en la carga y no aparece en ninguna otra respuesta de la API.

### `/s/:token` — Servicio de archivos por enlace de compartición (`src/routes/shares.js`)

Verifica la contraseña (mediante flag de sesión), la fecha de expiración y el límite de descargas, y luego sirve el archivo.

### Protección contra la prueba sistemática de IDs

Todos los accesos públicos por ID o token (`/f/*`, `/s/*`, `/api/file/:shortId`, `/api/share-links/:token`, `/api/collections/:id`, pastes) comparten un límite de tasa: máximo 100 accesos fallidos (404/410/401 …) por IP en 15 minutos. Los accesos correctos no cuentan. Los IDs de archivo antiguos de 8 caracteres siguen siendo válidos, pero son más cortos y por tanto más fáciles de adivinar que los nuevos.

---

## 10. Autenticación y seguridad

### Autenticación por sesión

- Sesión Express con almacenamiento MongoDB (`connect-mongo`)
- Cookie de sesión: `httpOnly: true`, `sameSite: 'strict'`, `secure: 'auto'` (se establece en cuanto la solicitud llega por HTTPS; detrás de un proxy mediante `X-Forwarded-Proto` y `TRUST_PROXY`)
- Duración de sesión: configurable mediante `SiteSettings.sessionDurationDays` (por defecto: 7 días), con caché en vivo de 60 segundos
- El inicio de sesión, el registro y la instalación asignan un nuevo ID de sesión (`establishSession`, protección contra la fijación de sesión)
- En cada solicitud se leen de la base de datos el rol, el estado activo y la `sessionVersion` del usuario: las cuentas eliminadas o desactivadas y las sesiones anteriores a un cambio de contraseña pierden su autenticación de inmediato, y los cambios de rol se aplican al instante

### Autenticación por clave API

- Las claves API se almacenan como hashes SHA-256, nunca en texto en claro
- Los primeros 8 caracteres se almacenan como `apiKeyPrefix` (para visualización)
- Búsqueda: `User.findByApiKey(plaintext)` calcula el hash y busca en `apiKeyHash`
- Al descargar la configuración de ShareX, la clave se regenera — el texto en claro solo es visible en ese momento

### Cadena de middleware (`src/middleware/auth.js`)

```
requireLogin    → verifica req.session.user → 401 si no está conectado
requireAdmin    → como requireLogin, además role === 'admin' → 403
requireApiKey   → verifica Authorization: Bearer, X-API-Key, ?api_key= o req.body.token
```

Todos los routers se crean mediante `asyncRouter()`: los errores en manejadores `async` llegan al manejador de errores central (`500`) en lugar de dejar la solicitud colgada. Una `uncaughtException` termina el proceso y Docker lo reinicia (`restart: unless-stopped`).

### Protección CSRF

`requireSameOrigin()` en `app.js` compara la cabecera `Origin` con la cabecera `Host` para todas las rutas API. Complementa las cookies `sameSite: 'strict'`.

### Política de seguridad de contenido

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

### Cabeceras de seguridad

- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (solo en solicitudes HTTPS)
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin` (las URLs de archivos, pastes y enlaces de compartición no llegan a sitios externos mediante Referer)
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`

### Limitación de tasa

| Endpoint | Límite | Ventana | Clave |
|---|---|---|---|
| Carga (`/upload`, `/api/upload`, `/api/web-upload`) | 60 solicitudes | 15 minutos | IP |
| Auth (`/api/auth/login`, `/register`, etc.) | 10 solicitudes | 15 minutos | IP |
| Restablecimiento de contraseña | 5 solicitudes | 1 hora | IP |
| Verificación de contraseña de enlaces de compartición, colecciones, pastes | 10 intentos fallidos | 15 minutos | IP |
| Acciones de cuenta (nombre, contraseña, email, email de verificación, eliminación) | 10 solicitudes | 15 minutos | Usuario |
| Accesos fallidos por ID/token (ver capítulo 9) | 100 solicitudes | 15 minutos | IP |
| WebSocket | ver capítulo 8 | — | Conexión / IP / usuario |

La IP del cliente depende de `TRUST_PROXY`; por eso el puerto de la aplicación solo debe ser accesible a través del proxy inverso (`BIND_ADDRESS`), de lo contrario `X-Forwarded-For` puede falsificarse.

### Registro (logging)

El registro de accesos (stdout → registro de Docker) contiene direcciones IP truncadas (IPv4 a `/24`, IPv6 a `/48`). Las claves API (`api_key=`), los tokens en parámetros de consulta (`token=`), los tokens de eliminación y los tokens de compartición se ocultan. El registro de auditoría guarda la IP completa y se elimina automáticamente a los 90 días.

### Lista de bloqueo de archivos

Los siguientes tipos MIME y extensiones son rechazados en la carga:

**Tipos MIME bloqueados:** `application/x-executable`, `application/x-sh`, `application/x-csh`, `application/x-bat`

**Extensiones bloqueadas:** `.bat`, `.cmd`, `.com`, `.ps1`, `.psm1`, `.psd1`, `.sh`, `.bash`, `.csh`, `.zsh`, `.fish`, `.vbs`, `.vbe`, `.jse`, `.scr`, `.pif`, `.application`, `.gadget`, `.hta`, `.php`, `.php3–5`, `.phtml`, `.asp`, `.aspx`, `.jsp`, `.jspx`, `.cfm`

### Protección contra path traversal

Todos los accesos a archivos mediante `resolveUploadPath()` verifican que la ruta resuelta se encuentre dentro de `UPLOAD_DIR`. Los IDs de miniatura se comprueban además contra `[A-Za-z0-9_-]`.

---

## 11. Sistema de carga

### Carga estándar (Multer)

- **Almacenamiento:** `multer.diskStorage` → `uploads/{folderName}/{8hex}{.ext}`
- **Nombre de archivo:** `crypto.randomBytes(4).hex() + extensión-original`
- **Límite:** `MAX_FILE_SIZE_MB` (por defecto: 100 MB)
- **Ubicación:** Carpeta específica del usuario (`user.folderName`)
- **Tipo MIME:** se reduce con `normalizeMime()` a exactamente un `tipo/subtipo` (los parámetros y los tipos adicionales separados por comas se descartan; los valores no válidos pasan a ser `application/octet-stream`)
- **Cifrado:** con `ENCRYPTION_KEY`, `sealUpload()` cifra el archivo en su sitio; una copia en claro (`<archivo>.plain-<hex>`) solo existe hasta que se genera la miniatura
- **Endpoint ShareX `/upload`:** Multer escribe el archivo antes de comprobar la clave API; si la solicitud se rechaza, se elimina de inmediato

### Carga por partes (>250 MB)

El cliente frontend cambia automáticamente al modo de fragmentos para archivos grandes.

**Estructura de directorios en el servidor:**
```
uploads/.chunks/{uploadId}/
  meta.json          { filename, mimeType, totalSize, totalChunks, userId, createdAt }
  chunk-0
  chunk-1
  ...
  chunk-N
```

**Tamaño de fragmento:** 10–20 MB (máx. 51 MB aceptado para compatibilidad con versiones anteriores)  
**Paralelismo:** 3–5 cargas de fragmentos simultáneas  
**Ensamblado:** Basado en streams (sin carga completa en RAM)  
**Comprobación de tamaño:** los bytes recibidos no pueden superar `totalSize`; el archivo final debe medir exactamente `totalSize`  
**Limpieza:** los directorios de cargas no completadas se eliminan tras 24 horas mediante la tarea de retención

### Carga de avatar

- **Almacenamiento:** `multer.memoryStorage()` (sin búfer de disco)
- **Ubicación:** `uploads/.avatars/{userId}{.ext}`
- **Límite:** 2 MB
- **Formatos:** JPEG, PNG, GIF, WebP

---

## 12. Generación de miniaturas

Las miniaturas se generan de forma asíncrona después de la carga (`startThumbnail()` — los errores se ignoran silenciosamente). Con Docker Compose, ffmpeg y Ghostscript no se ejecutan en el contenedor de la aplicación, sino en un contenedor propio `thumbnailer`: sin red, sin secretos, como usuario `nobody`, con sistema de archivos de solo lectura y sin acceso a `uploads/`. La aplicación copia cada archivo de origen al volumen compartido `thumbjobs` (`in/`), el worker (`src/thumbnailWorker.js`) deja el resultado en `out/` y la aplicación solo lo acepta como archivo regular de hasta 2 MB (sin enlaces simbólicos). Si el contenedor no está en ejecución, las miniaturas se omiten y la aplicación registra una advertencia una sola vez. Sin `THUMBNAIL_WORKER_DIR` (desarrollo local) las herramientas se ejecutan directamente en la aplicación, con un entorno vacío (solo `PATH`).

Si `ENCRYPTION_KEY` está definida, la miniatura se genera a partir de la copia en claro, después se cifra y la copia se elimina. Si la generación falla, se elimina cualquier miniatura escrita a medias.

### Miniaturas de vídeo (ffmpeg)

```bash
ffmpeg -y -i <file> -ss 00:00:01 -vframes 1 \
  -vf "scale=320:320:force_original_aspect_ratio=increase,crop=320:320" \
  -q:v 3 uploads/.thumbnails/<shortId>.jpg
```

### Miniaturas de PDF (Ghostscript)

```bash
gs -dNOPAUSE -dBATCH -dSAFER \
  -sDEVICE=jpeg -dFirstPage=1 -dLastPage=1 \
  -r72 -dJPEGQ=85 \
  -sOutputFile=uploads/.thumbnails/<shortId>.jpg \
  <file>
```

**Tiempo de espera:** 30 segundos por generación de miniatura  
**Alternativa:** Si ffmpeg/ghostscript no está disponible, la generación se omite silenciosamente.

### Script de relleno

```bash
npm run migrate:thumbnails
# o en el contenedor:
docker exec -it <container> npm run migrate:thumbnails
```

Para los archivos cifrados, el script descifra brevemente el origen en un archivo temporal y cifra la miniatura generada.

---

## 13. Correo electrónico y SMTP

### Configuración

SMTP se activa cuando se establece `SMTP_HOST`. `mailer.isConfigured()` verifica este valor.

### Plantillas de correo electrónico

Todos los correos se envían en el idioma del usuario (8 idiomas). Las plantillas están integradas en `src/utils/mailer.js`.

**Tipos de correos enviados:**

| Tipo | Disparador | Validez del token |
|---|---|---|
| Verificación de email | Registro, cambio de email | 24 horas |
| Restablecimiento de contraseña | `POST /api/auth/forgot-password` | 1 hora |

### Seguridad de los tokens

- Tokens: `crypto.randomBytes(32).hex()` (64 caracteres hexadecimales)
- Almacenados: hash SHA-256 del token
- El correo contiene el token en texto en claro como parámetro URL
- Verificación: hash del token entrante comparado con el hash almacenado

---

## 14. Internacionalización

**Biblioteca:** i18next + react-i18next + i18next-browser-languagedetector

**Idiomas admitidos:**

| Código | Idioma |
|---|---|
| `en` | English |
| `de` | Deutsch |
| `fr` | Français |
| `es` | Español |
| `it` | Italiano |
| `pt` | Português |
| `ja` | 日本語 |
| `zh` | 中文 |

**Selección de idioma:**
1. Detección del idioma del navegador (automática)
2. Preferencia del usuario en la base de datos (`user.language`)
3. Persistencia mediante `PATCH /api/user/language`

Archivos de traducción: `client/src/i18n/locales/{code}.json`

---

## 15. Frontend (React SPA)

### Configuración del enrutador (`client/src/App.jsx`)

| Ruta | Componente | Auth |
|---|---|---|
| `/` | Redirección → `/gallery` | No |
| `/auth/login` | Login.jsx | No |
| `/auth/register` | Register.jsx | No |
| `/auth/forgot-password` | ForgotPassword.jsx | No |
| `/auth/reset-password` | ResetPassword.jsx | No |
| `/install` | Install.jsx | No |
| `/upload` | Upload.jsx | **Sí** |
| `/gallery` | Gallery.jsx | **Sí** |
| `/f/:shortId` | FileView.jsx | **Sí** |
| `/collections` | Collections.jsx | **Sí** |
| `/c/:id` | CollectionView.jsx | No (público) |
| `/s/:token` | ShareView.jsx | No (público) |
| `/settings` | Settings.jsx | **Sí** |
| `/admin` | Dashboard.jsx | **Admin** |
| `/admin/users` | Users.jsx | **Admin** |
| `/admin/files` | Files.jsx | **Admin** |
| `/admin/audit-log` | AuditLog.jsx | **Admin** |
| `/admin/site-settings` | SiteSettings.jsx | **Admin** |
| `/admin/import` | Import.jsx | **Admin** |
| `/privacy` | PrivacyPolicy.jsx | No |
| `/terms` | TermsOfService.jsx | No |

### Contexto de autenticación (`client/src/context/AuthContext.jsx`)

Estado global para el usuario con sesión iniciada. Inicializado al inicio de la aplicación mediante `GET /api/auth/me`.

### Hook WebSocket (`client/src/hooks/useWebSocket.js`)

Gestiona la conexión WS persistente. Proporciona `sendMessage()` y registro de manejadores de eventos. Lógica de reconexión en caso de desconexión.

### Componentes UI

Basado en **shadcn/ui** (Radix UI Primitives + Tailwind CSS):

- `Dialog`, `AlertDialog`, `DropdownMenu`, `ContextMenu`, `Popover`
- `Select`, `Checkbox`, `Input`, `Textarea`, `Label`
- `Card`, `Badge`, `Button`, `Separator`, `Tabs`, `Table`
- `Toast` / `Toaster` para notificaciones
- `Calendar` / `DateTimePicker` para la selección de fecha de expiración
- `Pagination` para listas paginadas
- `ScrollArea`, `Tooltip`

---

## 16. Panel de administración

El panel de administración (`/admin/*`) es accesible únicamente para usuarios con `role: 'admin'`.

### Panel de control (`/admin`)

- Número total de usuarios, archivos, uso de almacenamiento
- Los 10 archivos subidos más recientemente
- Actualizaciones en vivo mediante WebSocket (`stats:invalidate`)

### Gestión de usuarios (`/admin/users`)

- Todos los usuarios con número de archivos y uso de almacenamiento
- Crear usuarios, activar/desactivar, cambiar rol (la desactivación y la degradación tienen efecto inmediato, también en sesiones abiertas y conexiones WebSocket)
- Restablecer contraseña (cierra la sesión del usuario en todas partes), regenerar clave API
- Cambiar nombre de carpeta (los archivos físicos se mueven en el servidor)
- Eliminar usuario (todos los datos, como en la autoeliminación, ver capítulo 17)

### Gestión de archivos (`/admin/files`)

- Todos los archivos de todos los usuarios, paginado
- Búsqueda por nombre de archivo
- Eliminar archivo

### Registro de auditoría (`/admin/audit-log`)

- Registro paginado de todas las acciones (50/página)
- Filtrar por nombre de usuario y acción
- Exportación CSV para fines regulatorios

### Configuración del sitio (`/admin/site-settings`)

- Información del operador (nombre, dirección, email)
- Activar Cloudflare Analytics
- Período de retención de archivos
- Duración de sesiones
- Activar/desactivar registro de usuarios

### Importación XBackBone (`/admin/import`)

- Vista previa e importación desde base de datos SQLite de XBackBone
- Los usuarios se emparejan por nombre de usuario
- Idempotente (los archivos ya importados se omiten)

---

## 17. RGPD / Privacidad

| Funcionalidad | Artículo RGPD |
|---|---|
| Política de privacidad (configurable) | Art. 13/14 – Transparencia |
| Página de términos de servicio (configurable) | Art. 13/14 – Transparencia |
| Exportación de datos (JSON con URLs) | Art. 20 – Portabilidad de datos |
| Eliminación de cuenta (archivos, pastes, colecciones, enlaces de compartición, avatar) | Art. 17 – Derecho de supresión |
| Registro de auditoría (TTL 90 días vía MongoDB) | Art. 5(2) – Responsabilidad |
| Exportación CSV del registro de auditoría | Art. 5(2) – Responsabilidad |
| Retención de archivos configurable | Art. 5(1)(e) – Limitación del plazo de conservación |
| Claves API como hash SHA-256 | Art. 32 – Seguridad |
| Contraseñas como bcrypt (12 rondas) | Art. 32 – Seguridad |
| Consentimiento de cookies para Cloudflare Analytics | Art. 13 – Transparencia |
| Anonimización al eliminar la cuenta | Art. 17 – Derecho de supresión |
| Cifrado opcional de los archivos almacenados (`ENCRYPTION_KEY`) | Art. 32 – Seguridad |
| Direcciones IP truncadas y tokens ocultos en el registro de accesos | Art. 5(1)(c) – Minimización de datos |

### Flujo de eliminación RGPD

Al eliminar la cuenta (`user:delete-account` / `DELETE /api/user/account`) y cuando la elimina un admin (`admin:users:delete` / `DELETE /api/admin/users/:id`) se ejecuta el mismo proceso (`src/utils/deleteUserData.js`):
1. Todos los archivos del usuario se eliminan del disco
2. Las miniaturas se eliminan
3. Se eliminan los enlaces de compartición del usuario y los que apuntan a sus archivos
4. Se eliminan los pastes y las colecciones del usuario; sus archivos también se quitan de las colecciones de otros usuarios
5. El avatar se elimina
6. Las entradas del registro de auditoría se anonimizan (`username: '[deleted]'`, `ip: null`, `userId: null`)
7. El documento de usuario se elimina
8. En la autoeliminación: la sesión se destruye; las sesiones abiertas y las conexiones WebSocket pierden su autenticación en la siguiente solicitud

La entrada de auditoría de la propia eliminación se conserva como prueba y se elimina automáticamente a los 90 días.

---

## 18. Tareas en segundo plano

### Limpieza por retención (`src/jobs/retentionCleanup.js`)

- **Ejecución:** Al inicio y luego diariamente (`setInterval(runRetentionCleanup, 24h)`)
- **Acción:** Si `SiteSettings.fileRetentionDays > 0`, se eliminan los archivos más antiguos que este valor; además, los archivos autodestructivos tras `expiresAt` o al alcanzar `maxDownloads`
- Elimina: archivo en disco, miniatura, documento MongoDB
- Limpia: cargas por partes no completadas con más de 24 horas y copias en claro olvidadas de cargas cifradas (`*.plain-*`) con más de 1 hora
- Difunde `stats:invalidate` a los admins

### Índices TTL de MongoDB (automáticos)

| Colección | TTL | Disparador |
|---|---|---|
| `AuditLog` | 90 días | `timestamp` |
| `Collection` | 7 días después de `expiresAt` | `expiresAt` |
| `ShareLink` | 7 días después de `expiresAt` | `expiresAt` |

---

## 19. Despliegue

### Docker (recomendado)

```bash
git clone https://github.com/Christianoooooo/sharely.git
cd sharely
cp .env.example .env
# Editar .env (SESSION_SECRET, contraseñas MONGO, BASE_URL)
docker compose up -d
```

**Servicios:**
- `app` — Aplicación Node.js (puerto 3000, publicado por defecto solo en `127.0.0.1`, ver `BIND_ADDRESS`)
- `mongo` — MongoDB 7 (puerto 127.0.0.1:27017, no accesible externamente)
- `updater` — actualizador automático opcional (solo con el perfil `updater`)

**Volúmenes:**
- `uploads` — almacenamiento persistente de archivos
- `mongo_data` — datos MongoDB
- `control` — intercambio entre la aplicación y el actualizador

**Comprobaciones de salud:** La aplicación verifica HTTP 200 en `/`, MongoDB verifica `db.adminCommand('ping')`.

### Proxy inverso Nginx

```nginx
server {
    listen 443 ssl;
    server_name files.example.com;

    client_max_body_size 2100M;  # Al menos tan grande como el fragmento más grande + buffer

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Soporte WebSocket
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

> `BASE_URL` en `.env` debe coincidir con el dominio público.

### Cloudflare Tunnel / proxy en un contenedor

Por defecto, Docker publica el puerto de la aplicación solo en `127.0.0.1` (`BIND_ADDRESS`). Un proxy que se ejecuta directamente en el host, como el ejemplo de nginx anterior, puede alcanzarlo. Un proxy o `cloudflared` en su propio contenedor no, y responde con **502 Bad Gateway**.

- **Recomendado:** conectar el contenedor del proxy a la red Docker de sharely (`<proyecto>_default`, por defecto `sharely_default`) y apuntarlo a `http://app:3000`. Así no hace falta publicar ningún puerto:
  ```bash
  docker network connect sharely_default <cloudflared-or-proxy-container>
  ```
  Para que se mantenga tras reinicios, declara la red como `external` en el archivo compose del proxy.
- **Con un firewall externo** que bloquee el puerto 3000 desde Internet (p. ej. Hetzner Cloud Firewall): establece `BIND_ADDRESS=0.0.0.0` en `.env`. No lo hagas sin dicho firewall: Docker omite firewalls del host como `ufw`, y quien alcance el puerto directamente evita TLS y puede falsificar `X-Forwarded-For`, anulando los límites de tasa.

El proxy debe reenviar la cabecera `Host` original (las conexiones WebSocket se rechazan si `Origin` y `Host` no coinciden) y `X-Forwarded-Proto` (necesaria para cookies seguras y HSTS). Cloudflare Tunnel y el ejemplo de nginx lo hacen por defecto; no configures `httpHostHeader` en el túnel. Tras la configuración, comprueba que el registro de auditoría muestre IP reales de los clientes; si no, ajusta `TRUST_PROXY`.

> **Nota de actualización:** Las versiones anteriores publicaban el puerto 3000 en todas las interfaces. Si tu proxy se ejecuta en un contenedor, establece `BIND_ADDRESS` o conecta la red como se describe arriba antes de actualizar.

### Cifrado en reposo

Con `ENCRYPTION_KEY` definido, sharely cifra cada nueva subida y su miniatura con AES-256-GCM antes de guardarlas (una clave por archivo, derivada de la clave maestra). Los archivos se descifran al vuelo al servirlos, incluidas las peticiones Range y las descargas ZIP.

- Genera la clave una vez con `openssl rand -base64 32`, ponla en `.env` y **guárdala por separado**: sin ella, los archivos cifrados no se pueden recuperar. No se admite cambiar ni eliminar la clave después.
- Los archivos existentes siguen sin cifrar hasta que ejecutes la migración (haz antes una copia del volumen `uploads`): `docker compose exec app npm run migrate:encrypt`
- No cubre: pastes, nombres de archivo y otros metadatos en MongoDB, avatares ni la memoria del servidor en ejecución. Mientras se procesa una subida (unión de fragmentos, eliminación de metadatos, generación de miniaturas) existe brevemente sin cifrar en el disco.
- El ajuste de administración sobre cifrado de disco/volumen solo declara el cifrado del volumen en la política de privacidad y es independiente de esto.

### Primer inicio

En el primer inicio sin usuarios, sharely escribe un token de instalación en el registro (`docker compose logs app`), o usa `INSTALL_TOKEN` si está definido. La página de instalación pide este token y crea la cuenta de administrador; el registro normal nunca crea un administrador.

---

## 20. Entorno de desarrollo

### Requisitos previos

- Node.js ≥ 22
- MongoDB (local o mediante Docker)
- Opcional: ffmpeg, ghostscript (para miniaturas)

### Configuración

```bash
# Backend
npm install
cp .env.example .env
# Editar .env

# Frontend
cd client
npm install
```

### Inicio

```bash
# Backend (puerto 3000, con nodemon)
npm run dev

# Frontend (puerto 5173, terminal separada)
cd client
npm run dev
```

El servidor de desarrollo Vite redirecciona automáticamente las solicitudes API a `localhost:3000`.

### Compilación

```bash
npm run build   # Compila client/dist/, el backend permanece sin cambios
npm start       # Inicia el servidor Express de producción
```

---

## 21. Migraciones y scripts

### Migraciones automáticas (en cada inicio)

Estas migraciones se ejecutan al iniciar la aplicación en `app.js` y son idempotentes:

| Migración | Archivo | Función |
|---|---|---|
| Migración de carpetas de usuario | `src/migrations/migrateUserFolders.js` | Mueve archivos de `uploads/` a `uploads/{folderName}/` |
| Migración de hashes de claves API | `src/migrations/migrateApiKeyHashes.js` | Convierte claves API en texto en claro a hashes SHA-256 |

### Scripts manuales

```bash
# Generar miniaturas para archivos existentes
npm run migrate:thumbnails
# o:
node scripts/generate-missing-thumbnails.js

# Mover cargas a carpetas de usuario (manual)
npm run migrate:user-folders
# o:
node scripts/migrate-uploads-to-user-folders.js

# Cifrar archivos y miniaturas existentes (requiere ENCRYPTION_KEY, haz antes una copia de seguridad)
npm run migrate:encrypt
# o en el contenedor:
docker compose exec app npm run migrate:encrypt
```

`migrate:encrypt` escribe cada archivo cifrado en `<storedName>.enc`, después actualiza el registro y solo entonces elimina el texto en claro. Una ejecución interrumpida puede repetirse sin riesgo.

### Inicialización de la base de datos (Docker)

`scripts/mongo-init.js` se ejecuta en el primer inicio del contenedor MongoDB y crea el usuario de aplicación con los permisos correctos.

---

## 22. Pruebas end-to-end

**Framework:** Playwright (`@playwright/test`)

### Archivos de prueba

| Archivo | Suite de pruebas |
|---|---|
| `e2e/upload.spec.js` | Flujos de carga |
| `e2e/gallery.spec.js` | Galería y gestión de archivos |
| `e2e/admin.spec.js` | Panel de administración |
| `e2e/sharelink.spec.js` | Creación y uso de enlaces de compartición |
| `e2e/tags.spec.js` | Gestión de etiquetas |
| `e2e/bulk-actions-fixes.spec.js` | Acciones en masa |

### Ejecución

```bash
# Todas las pruebas
npm run test:e2e

# Con interfaz gráfica
npm run test:e2e:ui
```

**Configuración Playwright:** `playwright.config.js` (inicia el servidor con `INSTALL_TOKEN`, por defecto `e2e-install-token`)  
**Configuración global:** `e2e/global-setup.js` (ejecuta la instalación con este token, crea usuarios de prueba, admin, etc.)  
**Utilidades:** `e2e/helpers.js` (funciones auxiliares compartidas)

### Pruebas unitarias

```bash
npm test
```

Se ejecutan sin base de datos: `src/utils/validateEmail.test.js`, `src/utils/stripMetadata.test.js` y `src/utils/fileCrypto.test.js` (cifrado: ida y vuelta, rangos de bytes, detección de manipulación).

---

## Apéndice: Acciones del registro de auditoría

| Acción | Disparador |
|---|---|
| `login` | Inicio de sesión exitoso |
| `logout` | Cierre de sesión |
| `register` | Registro |
| `upload` | Carga de archivo |
| `delete_file` | Archivo eliminado |
| `delete_account` | Cuenta eliminada |
| `change_password` | Contraseña cambiada |
| `change_username` | Nombre de usuario cambiado |
| `change_email` | Email cambiado |
| `verify_email` | Email verificado |
| `forgot_password` | Restablecimiento de contraseña solicitado |
| `reset_password` | Contraseña restablecida |
| `regen_api_key` | Clave API regenerada |
| `sharex_config` | Configuración ShareX descargada |
| `export_data` | Exportación de datos |
| `admin_create_user` | Admin: usuario creado |
| `admin_delete_user` | Admin: usuario eliminado |
| `admin_toggle_user` | Admin: usuario activado/desactivado |
| `admin_change_role` | Admin: rol de usuario cambiado |
| `admin_change_password` | Admin: contraseña establecida |
| `admin_regen_key` | Admin: clave API regenerada |

---

*Documentación generada a partir del código fuente de sharely v1.0.0*
