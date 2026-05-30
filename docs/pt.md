# Sharely — Documentação Técnica

> **Versão:** 1.0.0 · **Licença:** MIT · **Node.js:** ≥ 18

---

## Índice

1. [Visão geral do projeto](#1-visão-geral-do-projeto)
2. [Arquitetura](#2-arquitetura)
3. [Stack tecnológico](#3-stack-tecnológico)
4. [Estrutura de diretórios](#4-estrutura-de-diretórios)
5. [Configuração e variáveis de ambiente](#5-configuração-e-variáveis-de-ambiente)
6. [Modelos de dados](#6-modelos-de-dados)
7. [API REST](#7-api-rest)
8. [API WebSocket](#8-api-websocket)
9. [Rotas de serviço de arquivos](#9-rotas-de-serviço-de-arquivos)
10. [Autenticação e segurança](#10-autenticação-e-segurança)
11. [Sistema de upload](#11-sistema-de-upload)
12. [Geração de miniaturas](#12-geração-de-miniaturas)
13. [E-mail e SMTP](#13-e-mail-e-smtp)
14. [Internacionalização](#14-internacionalização)
15. [Frontend (React SPA)](#15-frontend-react-spa)
16. [Painel de administração](#16-painel-de-administração)
17. [LGPD / Privacidade](#17-lgpd--privacidade)
18. [Jobs em segundo plano](#18-jobs-em-segundo-plano)
19. [Implantação](#19-implantação)
20. [Ambiente de desenvolvimento](#20-ambiente-de-desenvolvimento)
21. [Migrações e scripts](#21-migrações-e-scripts)
22. [Testes end-to-end](#22-testes-end-to-end)

---

## 1. Visão geral do projeto

Sharely é uma **plataforma de compartilhamento de arquivos auto-hospedada** com uma interface web limpa, integração com ShareX e acesso via API. Os usuários fazem upload de capturas de tela, arquivos e mídias e os compartilham instantaneamente por meio de links curtos.

### Funcionalidades principais

| Funcionalidade | Descrição |
|---|---|
| Upload web | Arrastar e soltar, até 500 arquivos simultaneamente |
| Upload em partes | Arquivos de até 2 GB via upload multi-part paralelo |
| Integração ShareX | Arquivo de configuração `.sxcu` disponível para download com um clique |
| Upload via API | Autenticação por token Bearer, compatível com curl/wget |
| Visualizador de arquivos | Zoom em imagens, streaming de vídeo/áudio (HTTP Range), PDFs inline, código com destaque de sintaxe |
| Modos de incorporação | *embed* (HTML OG/Twitter Card) ou *raw* (redirecionamento direto) |
| Miniaturas | Pré-visualizações JPEG automáticas para vídeos (ffmpeg) e PDFs (ghostscript) |
| Coleções | Agrupamentos de arquivos com senha e data de expiração opcionais |
| Links de compartilhamento | Links por arquivo com senha, expiração e limite de downloads |
| Interface em tempo real | Atualizações ao vivo via WebSocket (upload, exclusão, contador de visualizações, estatísticas admin) |
| Multilíngue | 8 idiomas: EN, DE, FR, ES, IT, PT, JA, ZH |
| Painel admin | Estatísticas, gerenciamento de usuários, gerenciamento de arquivos, log de auditoria (exportação CSV) |
| Conformidade LGPD/GDPR | Funcionalidades de privacidade em conformidade com o GDPR da UE (Art. 17, 20, 32, etc.) |
| Importação XBackBone | Migração de instalações XBackBone existentes |
| Pronto para Docker | `docker compose up -d` inicia o ambiente completo |

---

## 2. Arquitetura

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

### Fluxo de dados: Upload padrão

```
Browser → POST /api/web-upload (multipart/form-data)
       → multer: Datei in uploads/{folderName}/
       → File.createUnique() → MongoDB
       → generateThumbnail() (async, non-blocking)
       → logAudit()
       → broadcast('file:uploaded') via WebSocket
       ← JSON: { files: [...] }
```

### Fluxo de dados: Upload ShareX

```
ShareX → POST /upload (token im Formular-Body)
       → multer: Datei temporär in uploads/
       → requireApiKey: Token-Lookup → User
       → fs.renameSync → uploads/{folderName}/
       → File.create() → MongoDB
       ← JSON: { url, delete_url }
```

---

## 3. Stack tecnológico

| Camada | Tecnologia | Versão |
|---|---|---|
| **Runtime** | Node.js | ≥ 18 |
| **Framework backend** | Express.js | 4.x |
| **Banco de dados** | MongoDB + Mongoose | Mongo 7, Mongoose 8.x |
| **Sessões** | express-session + connect-mongo | — |
| **Tempo real** | WebSocket (`ws`) | 8.x |
| **Upload de arquivos** | Multer | 1.x |
| **E-mail** | Nodemailer | 8.x |
| **Hash de senhas** | bcryptjs | 2.x (12 rounds) |
| **Hash de chaves API** | SHA-256 (Node Crypto) | — |
| **Limitação de taxa** | express-rate-limit | 8.x |
| **Importação XBackBone** | sql.js | 1.x |
| **Framework frontend** | React 18 | 18.3.x |
| **Roteamento (frontend)** | React Router v6 | 6.x |
| **Ferramenta de build** | Vite | 6.x |
| **Estilização** | Tailwind CSS + Radix UI | 3.x |
| **Componentes UI** | shadcn/ui (Radix primitives) | — |
| **Ícones** | FontAwesome | 6.x |
| **i18n** | i18next + react-i18next | — |
| **Destaque de sintaxe** | highlight.js | 11.x |
| **Contêineres** | Docker + Docker Compose | — |
| **Testes** | Playwright (E2E) | 1.60.x |

---

## 4. Estrutura de diretórios

```
sharely/
├── app.js                          # Ponto de entrada Express, sequência de inicialização
├── package.json
├── .env.example                    # Modelo para todas as variáveis de ambiente
├── Dockerfile
├── docker-compose.yml
│
├── src/
│   ├── config/
│   │   └── db.js                   # Conexão MongoDB (Mongoose)
│   ├── middleware/
│   │   ├── auth.js                 # requireLogin / requireAdmin / requireApiKey
│   │   └── upload.js               # Configuração Multer, lista de bloqueio
│   ├── models/
│   │   ├── AuditLog.js             # Eventos de auditoria (TTL 90 dias)
│   │   ├── Collection.js           # Coleções de arquivos
│   │   ├── File.js                 # Metadados de arquivos
│   │   ├── ShareLink.js            # Links de compartilhamento por arquivo
│   │   ├── SiteSettings.js         # Singleton: configurações do operador
│   │   └── User.js                 # Contas de usuário + chaves API
│   ├── routes/
│   │   ├── api.js                  # API principal (upload, galeria, admin, ...)
│   │   ├── auth.js                 # Login / Registro / Redefinição de senha
│   │   ├── files.js                # Serviço de arquivos, embeds OG, requisições de intervalo
│   │   ├── import.js               # Migração XBackBone
│   │   ├── install.js              # Endpoint de instalação inicial
│   │   └── shares.js               # Serviço de arquivos via link de compartilhamento
│   ├── jobs/
│   │   └── retentionCleanup.js     # Exclusão diária de arquivos expirados
│   ├── migrations/
│   │   ├── migrateApiKeyHashes.js  # Única vez: textos simples → hashes SHA-256
│   │   └── migrateUserFolders.js   # Única vez: mover arquivos para pastas de usuário
│   ├── utils/
│   │   ├── audit.js                # Função auxiliar logAudit()
│   │   ├── generateThumbnail.js    # Integração ffmpeg / ghostscript
│   │   ├── mailer.js               # Wrapper Nodemailer + templates de e-mail i18n
│   │   └── sanitizeFilename.js     # Sanitização do nome de arquivo
│   └── ws.js                       # Servidor WebSocket + despachador de ações
│
├── client/                         # Frontend React
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx                # Ponto de entrada React
│       ├── App.jsx                 # Configuração do roteador
│       ├── index.css               # Estilos globais
│       ├── context/
│       │   └── AuthContext.jsx     # Estado de autenticação global
│       ├── hooks/
│       │   ├── use-toast.js        # Hook de notificações toast
│       │   └── useWebSocket.js     # Conexão WS + manipuladores de eventos
│       ├── components/
│       │   ├── Layout.jsx          # Shell do app (barra de navegação, sidebar)
│       │   ├── ProtectedRoute.jsx  # Guarda de autenticação
│       │   ├── ShareLinkDialog.jsx # Diálogo de criação de link de compartilhamento
│       │   ├── AddToCollectionDialog.jsx
│       │   ├── CookieBanner.jsx
│       │   ├── LanguageSelector.jsx
│       │   ├── RequireEmailDialog.jsx
│       │   ├── UserAvatar.jsx
│       │   └── ui/                 # Componentes base shadcn/ui
│       ├── pages/
│       │   ├── Upload.jsx          # Página de upload
│       │   ├── Gallery.jsx         # Galeria de arquivos
│       │   ├── FileView.jsx        # Visualização detalhada de arquivo
│       │   ├── Collections.jsx     # Visão geral de coleções
│       │   ├── CollectionView.jsx  # Coleção individual
│       │   ├── ShareView.jsx       # Página pública do link de compartilhamento
│       │   ├── Settings.jsx        # Configurações do usuário
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   ├── ForgotPassword.jsx
│       │   ├── ResetPassword.jsx
│       │   ├── Install.jsx         # Instalação inicial
│       │   ├── PrivacyPolicy.jsx
│       │   ├── TermsOfService.jsx
│       │   └── admin/
│       │       ├── Dashboard.jsx   # Página inicial do admin
│       │       ├── Users.jsx       # Gerenciamento de usuários
│       │       ├── Files.jsx       # Gerenciamento de arquivos
│       │       ├── AuditLog.jsx    # Visualização do log de auditoria
│       │       ├── SiteSettings.jsx# Configurações do operador
│       │       └── Import.jsx      # Importação XBackBone
│       ├── i18n/
│       │   ├── index.js            # Configuração i18next
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
│           └── utils.js            # Utilitário Tailwind (cn())
│
├── scripts/
│   ├── setup-db.js
│   ├── mongo-init.js               # Script de inicialização MongoDB
│   ├── migrate-uploads-to-user-folders.js
│   └── generate-missing-thumbnails.js
│
├── e2e/                            # Testes Playwright
│   ├── admin.spec.js
│   ├── bulk-actions-fixes.spec.js
│   ├── gallery.spec.js
│   ├── sharelink.spec.js
│   ├── tags.spec.js
│   ├── upload.spec.js
│   ├── helpers.js
│   └── global-setup.js
│
├── uploads/                        # Arquivos enviados (runtime)
│   ├── .thumbnails/
│   ├── .avatars/
│   └── .chunks/                    # Partes temporárias
│
└── docs/assets/                    # Capturas de tela e logotipo
```

---

## 5. Configuração e variáveis de ambiente

Todas as variáveis são carregadas de `.env` (via `dotenv`). O arquivo `.env.example` contém o modelo completo.

### Campos obrigatórios

| Variável | Descrição |
|---|---|
| `SESSION_SECRET` | Segredo para criptografia de sessões — string aleatória longa, ex. `openssl rand -hex 32` |
| `MONGO_ROOT_PASSWORD` | Senha root do MongoDB (necessária apenas para Docker Compose) |
| `MONGO_APP_PASSWORD` | Senha do usuário de aplicação do MongoDB |

### Todas as variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta TCP do servidor HTTP |
| `MONGODB_URI` | _(construída pelo Docker Compose)_ | URI de conexão MongoDB completa |
| `MONGO_ROOT_PASSWORD` | — | Senha root do MongoDB |
| `MONGO_APP_USER` | `appuser` | Nome de usuário de aplicação MongoDB |
| `MONGO_APP_PASSWORD` | — | Senha do usuário de aplicação MongoDB |
| `MONGO_DB_NAME` | `sharely` | Nome do banco de dados MongoDB |
| `SESSION_SECRET` | — | **Obrigatório** — segredo de criptografia de sessões |
| `BASE_URL` | `http://localhost:3000` | URL base pública para os links de compartilhamento gerados (sem `/` final) |
| `SITE_NAME` | `sharely` | Nome do site nos embeds Open Graph |
| `MAX_FILE_SIZE_MB` | `100` | Tamanho máximo de arquivo para uploads padrão em MB (uploads em partes até 2 GB independentemente) |
| `ALLOW_REGISTRATION` | `true` | `false` desativa o registro público |
| `SMTP_HOST` | — | Hostname do servidor SMTP; deixar vazio para desativar as funcionalidades de e-mail |
| `SMTP_PORT` | `587` | Porta SMTP |
| `SMTP_SECURE` | `false` | `true` para TLS implícito (porta 465), `false` para STARTTLS |
| `SMTP_USER` | — | Nome de usuário SMTP |
| `SMTP_PASS` | — | Senha SMTP |
| `SMTP_FROM` | _(SMTP_USER)_ | Endereço do remetente nos e-mails enviados |
| `UPLOAD_DIR` | `./uploads` | Caminho absoluto para o diretório de upload |
| `NODE_ENV` | — | `production` ativa os cookies seguros |

---

## 6. Modelos de dados

### User (`src/models/User.js`)

```
{
  username:                    String (3–32, único, alfanumérico + _-)
  password:                    String (bcrypt, 12 rounds)
  role:                        'admin' | 'user'
  apiKey:                      String (legado, vazio após migração)
  apiKeyHash:                  String (SHA-256, único, sparse)
  apiKeyPrefix:                String (primeiros 8 caracteres do texto simples)
  folderName:                  String (único, sparse, máx. 64)
  avatarExt:                   String | null (.jpg/.png/.gif/.webp)
  embedMode:                   'embed' | 'raw'
  isActive:                    Boolean
  email:                       String (minúsculas, único, sparse)
  emailVerified:               Boolean
  emailVerificationToken:      String | null (hash SHA-256 do texto simples)
  emailVerificationExpires:    Date | null
  passwordResetToken:          String | null (hash SHA-256)
  passwordResetExpires:        Date | null
  language:                    'en'|'de'|'fr'|'es'|'it'|'pt'|'ja'|'zh'
  predefinedTags:              [String] (máx. 100 tags × 50 caracteres)
  createdAt:                   Date
}
```

**Métodos importantes:**
- `user.comparePassword(candidate)` — comparação bcrypt
- `user.regenerateApiKey()` — gera novo texto simples, armazena o hash, retorna o texto simples (visível apenas uma vez)
- `User.findByApiKey(plaintext)` — busca por hash SHA-256, somente usuários ativos

### File (`src/models/File.js`)

```
{
  shortId:      String (8 caracteres hexadecimais: 6 timestamp + 2 aleatórios, único)
  deleteToken:  String (32 caracteres hexadecimais, único)
  originalName: String (sanitizado)
  storedName:   String (caminho relativo: "folderName/8hex.ext")
  mimeType:     String
  size:         Number (bytes)
  uploader:     ObjectId → User
  views:        Number
  tags:         [String] (máx. 20 × 50 caracteres)
  createdAt:    Date
}
```

**Propriedades virtuais:**
- `sizeHuman` — tamanho legível (B / KB / MB / GB)
- `displayType` — classificação: `image|video|audio|pdf|code|text|file`

**Algoritmo Short ID:**
```
shortId = hex(seconds_since_2024-01-01, 6 chars) + randomBytes(2).hex()
```

### Collection (`src/models/Collection.js`)

```
{
  shortId:     String (8 Hex, único)
  name:        String (máx. 100)
  description: String (máx. 500)
  owner:       ObjectId → User
  files:       [ObjectId → File]
  password:    String | null (bcrypt)
  expiresAt:   Date | null
  createdAt:   Date
}
```

> As coleções expiradas são excluídas automaticamente pelo índice TTL do MongoDB 7 dias após a expiração.

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

> Como as coleções: período de carência de 7 dias após expiração via índice TTL.

### SiteSettings (`src/models/SiteSettings.js`)

Documento singleton (`_id: 'singleton'`):

```
{
  operatorName:        String
  operatorAddress:     String
  operatorEmail:       String
  cloudflareAnalytics: Boolean
  fileRetentionDays:   Number (0 = desativado)
  encryptionAtRest:    Boolean
  sessionDurationDays: Number (padrão: 7)
  allowRegistration:   Boolean
}
```

### AuditLog (`src/models/AuditLog.js`)

```
{
  timestamp: Date (índice TTL: 90 dias)
  userId:    ObjectId → User | null
  username:  String | null
  action:    String
  ip:        String | null
  meta:      Mixed (metadados específicos da ação)
}
```

---

## 7. API REST

### URL base: `/api`

Todos os endpoints JSON retornam `Content-Type: application/json`. Erros: `{ "error": "mensagem" }`.

---

### Autenticação (`/api/auth`)

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/me` | Sessão | Usuário atualmente conectado |
| `POST` | `/login` | — | Fazer login (limitado: 10/15min) |
| `POST` | `/register` | — | Registrar-se (limitado, primeiro usuário torna-se admin) |
| `POST` | `/logout` | — | Fazer logout |
| `GET` | `/smtp-enabled` | — | Verificar se SMTP está configurado |
| `GET` | `/verify-email?token=` | — | Verificar endereço de e-mail |
| `GET` | `/verify-reset-token?token=` | — | Validar token de redefinição |
| `POST` | `/forgot-password` | — | Enviar e-mail de redefinição de senha (limitado: 5/h) |
| `POST` | `/reset-password` | — | Definir nova senha |

**Requisição de login:**
```json
POST /api/auth/login
{ "username": "max", "password": "meinPasswort123" }
```

**Resposta de login:**
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

### Upload de arquivos

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `POST` | `/upload` | Chave API | Upload ShareX (endpoint legado em `app.js`) |
| `POST` | `/api/upload` | Chave API | Upload ShareX/API (campo: `file`) |
| `POST` | `/api/web-upload` | Sessão | Upload web (campo: `files[]`, máx. 500) |
| `POST` | `/api/chunk/init` | Sessão | Inicializar upload em partes |
| `POST` | `/api/chunk/:uploadId` | Sessão | Enviar uma parte (campo: `chunk`) |
| `POST` | `/api/chunk/:uploadId/complete` | Sessão | Montar as partes |
| `DELETE` | `/api/chunk/:uploadId` | Sessão | Cancelar upload e limpar |

**Resposta de upload via API:**
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

#### Fluxo de upload em partes

1. `POST /api/chunk/init` → `{ uploadId: "32hex" }`
2. `POST /api/chunk/:uploadId` (Body: `chunkIndex=N`, Arquivo: `chunk`) → `{ received: N }`  
   Em paralelo com 3–5 partes simultâneas
3. `POST /api/chunk/:uploadId/complete` → `{ files: [fileObject] }`

---

### Gerenciamento de arquivos

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/gallery` | Sessão | Arquivos próprios (admin: todos), paginado (24/página), filtros: `q`, `type`, `tag`, `page` |
| `GET` | `/api/file/:shortId` | — | Metadados do arquivo (incrementa o contador de visualizações) |
| `PATCH` | `/api/file/:shortId` | Sessão | Atualizar tags/nome |
| `DELETE` | `/api/file/:shortId` | Sessão | Excluir arquivo |
| `DELETE` | `/api/delete/:shortId` | Chave API | Excluir arquivo (autenticação por chave API) |
| `POST` | `/api/files/bulk` | Sessão | Ações em lote: `delete`, `tag`, `removeTag`, `addToCollection`, `moveToCollection` |
| `GET` | `/api/tags` | Sessão | Todas as sugestões de tags do usuário |

**Parâmetros de consulta da galeria:**
- `q` — busca no nome do arquivo (seguro para regex)
- `type` — `all|image|video|audio|pdf|code`
- `tag` — filtro de tag exato
- `page` — número da página (padrão: 1)

---

### Configurações do usuário

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/my-key` | Sessão | Exibir prefixo da chave API |
| `POST` | `/api/regen-key` | Sessão | Regenerar chave API |
| `GET` | `/api/sharex-config` | Sessão | Baixar ShareX `.sxcu` (regenera a chave) |
| `PATCH` | `/api/user/username` | Sessão | Alterar nome de usuário (senha obrigatória) |
| `PATCH` | `/api/user/password` | Sessão | Alterar senha |
| `PATCH` | `/api/user/email` | Sessão | Alterar e-mail (envia e-mail de verificação) |
| `PATCH` | `/api/user/language` | Sessão | Definir idioma da interface |
| `PATCH` | `/api/user/embed-mode` | Sessão | Definir modo de incorporação (`embed`/`raw`) |
| `POST` | `/api/user/resend-verification` | Sessão | Reenviar e-mail de verificação |
| `GET` | `/api/user/export` | Sessão | Exportação de dados (LGPD/GDPR Art. 20) como JSON |
| `DELETE` | `/api/user/account` | Sessão | Excluir conta (LGPD/GDPR Art. 17, senha obrigatória) |
| `GET` | `/api/user/predefined-tags` | Sessão | Recuperar tags predefinidas |
| `PATCH` | `/api/user/predefined-tags` | Sessão | Atualizar tags predefinidas |
| `POST` | `/api/user/avatar` | Sessão | Fazer upload de avatar (máx. 2 MB, JPEG/PNG/GIF/WebP) |
| `DELETE` | `/api/user/avatar` | Sessão | Excluir avatar |
| `GET` | `/api/user/avatar/:userId` | — | Servir avatar |

---

### Links de compartilhamento

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/file/:shortId/share-links` | Sessão (Proprietário/Admin) | Todos os links de compartilhamento de um arquivo |
| `POST` | `/api/file/:shortId/share-links` | Sessão (Proprietário/Admin) | Criar link de compartilhamento |
| `DELETE` | `/api/share-links/:token` | Sessão (Proprietário/Criador/Admin) | Excluir link de compartilhamento |
| `GET` | `/api/share-links/:token` | — | Metadados do link de compartilhamento (público) |
| `POST` | `/api/share-links/:token/verify` | — | Verificar senha do link de compartilhamento |

**Criar link de compartilhamento:**
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

### Coleções

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/collections` | Sessão | Coleções próprias (admin: todas) |
| `POST` | `/api/collections` | Sessão | Criar coleção |
| `GET` | `/api/collections/:id` | — | Visualizar coleção (pública, senha se definida) |
| `PATCH` | `/api/collections/:id` | Sessão (Proprietário/Admin) | Atualizar coleção |
| `DELETE` | `/api/collections/:id` | Sessão (Proprietário/Admin) | Excluir coleção |
| `POST` | `/api/collections/:id/files` | Sessão (Proprietário/Admin) | Adicionar arquivo à coleção |
| `DELETE` | `/api/collections/:id/files/:fileShortId` | Sessão (Proprietário/Admin) | Remover arquivo da coleção |
| `POST` | `/api/collections/:id/verify` | — | Verificar senha da coleção |

---

### Endpoints de administração

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/admin/stats` | Admin | Estatísticas do painel |
| `GET` | `/api/admin/users` | Admin | Todos os usuários (com contagem de arquivos) |
| `POST` | `/api/admin/users` | Admin | Criar usuário |
| `PATCH` | `/api/admin/users/:id/toggle` | Admin | Ativar/desativar usuário |
| `PATCH` | `/api/admin/users/:id/role` | Admin | Alterar papel do usuário |
| `DELETE` | `/api/admin/users/:id` | Admin | Excluir usuário |
| `POST` | `/api/admin/users/:id/regen-key` | Admin | Regenerar chave API |
| `PATCH` | `/api/admin/users/:id/password` | Admin | Definir senha |
| `PATCH` | `/api/admin/users/:id/folder` | Admin | Alterar nome da pasta (move arquivos) |
| `GET` | `/api/admin/files` | Admin | Todos os arquivos, paginado (30/página) |
| `GET` | `/api/admin/site-settings` | Admin | Ler configurações do operador |
| `PATCH` | `/api/admin/site-settings` | Admin | Atualizar configurações do operador |
| `GET` | `/api/admin/audit-log` | Admin | Log de auditoria paginado (50/página) |
| `GET` | `/api/admin/audit-log/export` | Admin | Baixar log de auditoria como CSV |
| `GET` | `/api/site-settings` | — | Informações públicas do operador (para a página de privacidade) |

---

### Configurações do site (públicas)

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

**Conexão:** `wss://example.com/ws` (somente para usuários conectados, cookie de sessão obrigatório)

### Protocolo

**Cliente → Servidor (Requisição):**
```json
{ "id": "req-abc123", "action": "file:list", "payload": { "type": "image", "page": 1 } }
```

**Servidor → Cliente (Resposta):**
```json
{ "id": "req-abc123", "data": { ... } }
```

**Servidor → Cliente (Erro):**
```json
{ "id": "req-abc123", "error": "Forbidden", "status": 403 }
```

**Servidor → Cliente (Broadcast):**
```json
{ "event": "file:uploaded", "data": { "shortId": "a1b2c3d4", "uploaderId": "..." } }
```

### Ações disponíveis

| Ação | Auth | Descrição |
|---|---|---|
| `site-settings:get` | — | Configurações públicas do site |
| `auth:me` | Usuário | Dados do usuário conectado |
| `file:get` | Usuário | Detalhes do arquivo (incrementa visualizações) |
| `file:list` | Usuário | Lista de arquivos com filtro/paginação |
| `file:delete` | Usuário | Excluir arquivo |
| `user:get-key` | Usuário | Prefixo da chave API |
| `user:regen-key` | Usuário | Regenerar chave API |
| `user:change-password` | Usuário | Alterar senha |
| `user:change-username` | Usuário | Alterar nome de usuário |
| `user:change-email` | Usuário | Alterar e-mail |
| `user:change-language` | Usuário | Definir idioma |
| `user:change-embed-mode` | Usuário | Definir modo de incorporação |
| `user:resend-verification` | Usuário | Reenviar e-mail de verificação |
| `user:export` | Usuário | Exportação de dados |
| `user:delete-account` | Usuário | Excluir conta |
| `admin:stats` | Admin | Estatísticas do painel |
| `admin:settings:get` | Admin | Ler configurações do site |
| `admin:settings:update` | Admin | Atualizar configurações do site |
| `admin:users:list` | Admin | Todos os usuários |
| `admin:users:create` | Admin | Criar usuário |
| `admin:users:toggle` | Admin | Ativar/desativar usuário |
| `admin:users:role` | Admin | Alterar papel do usuário |
| `admin:users:delete` | Admin | Excluir usuário |
| `admin:users:regen-key` | Admin | Regenerar chave API |
| `admin:users:password` | Admin | Definir senha |
| `admin:users:folder` | Admin | Alterar nome da pasta |
| `admin:files:list` | Admin | Todos os arquivos |
| `admin:audit-log:list` | Admin | Log de auditoria paginado |

### Eventos de broadcast

| Evento | Destinatários | Payload |
|---|---|---|
| `file:uploaded` | Quem fez o upload | `{ shortId, uploaderId }` |
| `file:deleted` | Proprietário do arquivo | `{ shortId, uploaderId }` |
| `file:view` | Todos | `{ shortId, views }` |
| `user:created` | Admins | `{ id, username, role, ... }` |
| `user:deleted` | Admins | `{ id }` |
| `user:updated` | Admins | `{ id, ...campos alterados }` |
| `audit:log` | Admins | Objeto AuditLog completo |
| `settings:updated` | Admins | Objeto SiteSettings atualizado |
| `stats:invalidate` | Admins | `{}` (aciona atualização de estatísticas) |

---

## 9. Rotas de serviço de arquivos

### `/f/:shortId` — Visualizador de arquivos

- **Requisição do navegador:** Passa para a React SPA (`index.html`) — a SPA renderiza o visualizador.
- **Bot de redes sociais** (Discord, Telegram, Twitter, etc.): Retorna uma página HTML mínima com meta tags Open Graph / Twitter Card.
  - `embedMode = 'embed'`: HTML OG com redirecionamento
  - `embedMode = 'raw'` + imagem/vídeo/áudio: HTTP 302 → `/f/:shortId/raw`

### `/f/:shortId/raw` — Acesso direto

Serve o arquivo como resposta HTTP com suporte a requisições de intervalo (206 Partial Content). Imagens/vídeos/áudio: `Content-Disposition: inline`, outros: `attachment`.

### `/f/:shortId/download` — Download forçado

Como `/raw`, mas sempre `Content-Disposition: attachment`.

### `/f/:shortId/thumb` — Miniatura

Retorna a miniatura JPEG (para vídeos e PDFs). `Cache-Control: public, max-age=86400`.

### `/f/:shortId/delete/:token` — Exclusão ShareX

Exclui o arquivo sem sessão usando um token de exclusão único.

### `/s/:token` — Serviço de arquivos via link de compartilhamento (`src/routes/shares.js`)

Verifica a senha (via flag de sessão), a data de expiração e o limite de downloads, e então serve o arquivo.

---

## 10. Autenticação e segurança

### Autenticação por sessão

- Sessão Express com armazenamento MongoDB (`connect-mongo`)
- Cookie de sessão: `httpOnly: true`, `sameSite: 'strict'`, `secure: true` em produção
- Duração da sessão: configurável via `SiteSettings.sessionDurationDays` (padrão: 7 dias), com cache ao vivo de 60 segundos

### Autenticação por chave API

- As chaves API são armazenadas como hashes SHA-256, nunca em texto simples
- Os primeiros 8 caracteres são armazenados como `apiKeyPrefix` (para exibição)
- Busca: `User.findByApiKey(plaintext)` calcula o hash e busca em `apiKeyHash`
- Ao baixar a configuração do ShareX, a chave é regenerada — o texto simples fica visível apenas naquele momento

### Cadeia de middleware (`src/middleware/auth.js`)

```
requireLogin    → verifica req.session.user → 401 se não conectado
requireAdmin    → como requireLogin, adicionalmente role === 'admin' → 403
requireApiKey   → verifica o cabeçalho Authorization ou req.body.token
```

### Proteção CSRF

`requireSameOrigin()` em `app.js` compara o cabeçalho `Origin` com o cabeçalho `Host` para todas as rotas da API. Complementa os cookies `sameSite: 'strict'`.

### Política de Segurança de Conteúdo

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
media-src 'self' blob:;
connect-src 'self' https://cloudflareinsights.com;
frame-ancestors 'self';
```

### Cabeçalhos de segurança

- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`

### Limitação de taxa

| Endpoint | Limite | Janela |
|---|---|---|
| Upload (`/upload`, `/api/upload`, `/api/web-upload`) | 60 requisições | 15 minutos |
| Auth (`/api/auth/login`, `/register`, etc.) | 10 requisições | 15 minutos |
| Redefinição de senha | 5 requisições | 1 hora |

### Lista de bloqueio de arquivos

Os seguintes tipos MIME e extensões são rejeitados no upload:

**Tipos MIME bloqueados:** `application/x-executable`, `application/x-sh`, `application/x-csh`, `application/x-bat`

**Extensões bloqueadas:** `.bat`, `.cmd`, `.com`, `.ps1`, `.psm1`, `.psd1`, `.sh`, `.bash`, `.csh`, `.zsh`, `.fish`, `.vbs`, `.vbe`, `.jse`, `.scr`, `.pif`, `.application`, `.gadget`, `.hta`, `.php`, `.php3–5`, `.phtml`, `.asp`, `.aspx`, `.jsp`, `.jspx`, `.cfm`

### Proteção contra path traversal

Todos os acessos a arquivos via `resolveUploadPath()` verificam se o caminho resolvido está dentro de `UPLOAD_DIR`.

---

## 11. Sistema de upload

### Upload padrão (Multer)

- **Armazenamento:** `multer.diskStorage` → `uploads/{folderName}/{8hex}{.ext}`
- **Nome do arquivo:** `crypto.randomBytes(4).hex() + extensão-original`
- **Limite:** `MAX_FILE_SIZE_MB` (padrão: 100 MB)
- **Localização:** Pasta específica do usuário (`user.folderName`)

### Upload em partes (>250 MB)

O cliente frontend muda automaticamente para o modo de partes para arquivos grandes.

**Estrutura de diretórios no servidor:**
```
uploads/.chunks/{uploadId}/
  meta.json          { filename, mimeType, totalSize, totalChunks, userId, createdAt }
  chunk-0
  chunk-1
  ...
  chunk-N
```

**Tamanho da parte:** 10–20 MB (máx. 51 MB aceito para compatibilidade com versões anteriores)  
**Paralelismo:** 3–5 uploads de partes simultâneos  
**Montagem:** Baseada em streams (sem carregamento completo na RAM)

### Upload de avatar

- **Armazenamento:** `multer.memoryStorage()` (sem buffer em disco)
- **Localização:** `uploads/.avatars/{userId}{.ext}`
- **Limite:** 2 MB
- **Formatos:** JPEG, PNG, GIF, WebP

---

## 12. Geração de miniaturas

As miniaturas são geradas de forma assíncrona após o upload (`.catch(() => {})` — erros são ignorados silenciosamente).

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

**Tempo limite:** 30 segundos por geração de miniatura  
**Fallback:** Se ffmpeg/ghostscript não estiver disponível, a geração é ignorada silenciosamente.

### Script de preenchimento retroativo

```bash
npm run migrate:thumbnails
# ou no contêiner:
docker exec -it <container> npm run migrate:thumbnails
```

---

## 13. E-mail e SMTP

### Configuração

O SMTP é ativado quando `SMTP_HOST` está definido. `mailer.isConfigured()` verifica esse valor.

### Templates de e-mail

Todos os e-mails são enviados no idioma do usuário (8 idiomas). Os templates estão incorporados em `src/utils/mailer.js`.

**Tipos de e-mails enviados:**

| Tipo | Gatilho | Validade do token |
|---|---|---|
| Verificação de e-mail | Registro, alteração de e-mail | 24 horas |
| Redefinição de senha | `POST /api/auth/forgot-password` | 1 hora |

### Segurança dos tokens

- Tokens: `crypto.randomBytes(32).hex()` (64 caracteres hexadecimais)
- Armazenados: hash SHA-256 do token
- O e-mail contém o token em texto simples como parâmetro de URL
- Verificação: hash do token recebido comparado com o hash armazenado

---

## 14. Internacionalização

**Biblioteca:** i18next + react-i18next + i18next-browser-languagedetector

**Idiomas suportados:**

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

**Seleção de idioma:**
1. Detecção do idioma do navegador (automática)
2. Preferência do usuário no banco de dados (`user.language`)
3. Persistência via `PATCH /api/user/language`

Arquivos de tradução: `client/src/i18n/locales/{code}.json`

---

## 15. Frontend (React SPA)

### Configuração do roteador (`client/src/App.jsx`)

| Rota | Componente | Auth |
|---|---|---|
| `/` | Redirecionamento → `/gallery` | Não |
| `/auth/login` | Login.jsx | Não |
| `/auth/register` | Register.jsx | Não |
| `/auth/forgot-password` | ForgotPassword.jsx | Não |
| `/auth/reset-password` | ResetPassword.jsx | Não |
| `/install` | Install.jsx | Não |
| `/upload` | Upload.jsx | **Sim** |
| `/gallery` | Gallery.jsx | **Sim** |
| `/f/:shortId` | FileView.jsx | **Sim** |
| `/collections` | Collections.jsx | **Sim** |
| `/c/:id` | CollectionView.jsx | Não (público) |
| `/s/:token` | ShareView.jsx | Não (público) |
| `/settings` | Settings.jsx | **Sim** |
| `/admin` | Dashboard.jsx | **Admin** |
| `/admin/users` | Users.jsx | **Admin** |
| `/admin/files` | Files.jsx | **Admin** |
| `/admin/audit-log` | AuditLog.jsx | **Admin** |
| `/admin/site-settings` | SiteSettings.jsx | **Admin** |
| `/admin/import` | Import.jsx | **Admin** |
| `/privacy` | PrivacyPolicy.jsx | Não |
| `/terms` | TermsOfService.jsx | Não |

### Contexto de autenticação (`client/src/context/AuthContext.jsx`)

Estado global para o usuário conectado. Inicializado na inicialização do app via `GET /api/auth/me`.

### Hook WebSocket (`client/src/hooks/useWebSocket.js`)

Gerencia a conexão WS persistente. Fornece `sendMessage()` e registro de manipuladores de eventos. Lógica de reconexão em caso de queda da conexão.

### Componentes UI

Baseado em **shadcn/ui** (Radix UI Primitives + Tailwind CSS):

- `Dialog`, `AlertDialog`, `DropdownMenu`, `ContextMenu`, `Popover`
- `Select`, `Checkbox`, `Input`, `Textarea`, `Label`
- `Card`, `Badge`, `Button`, `Separator`, `Tabs`, `Table`
- `Toast` / `Toaster` para notificações
- `Calendar` / `DateTimePicker` para seleção de data de expiração
- `Pagination` para listas paginadas
- `ScrollArea`, `Tooltip`

---

## 16. Painel de administração

O painel de administração (`/admin/*`) é acessível apenas para usuários com `role: 'admin'`.

### Painel de controle (`/admin`)

- Número total de usuários, arquivos, uso de armazenamento
- 10 arquivos carregados mais recentemente
- Atualizações ao vivo via WebSocket (`stats:invalidate`)

### Gerenciamento de usuários (`/admin/users`)

- Todos os usuários com contagem de arquivos e uso de armazenamento
- Criar usuários, ativar/desativar, alterar papel
- Redefinir senha, regenerar chave API
- Alterar nome da pasta (arquivos físicos são movidos no servidor)
- Excluir usuário (todos os arquivos são excluídos)

### Gerenciamento de arquivos (`/admin/files`)

- Todos os arquivos de todos os usuários, paginado
- Busca por nome de arquivo
- Excluir arquivo

### Log de auditoria (`/admin/audit-log`)

- Log paginado de todas as ações (50/página)
- Filtrar por nome de usuário e ação
- Exportação CSV para fins regulatórios

### Configurações do site (`/admin/site-settings`)

- Informações do operador (nome, endereço, e-mail)
- Ativar Cloudflare Analytics
- Período de retenção de arquivos
- Duração das sessões
- Ativar/desativar registro de usuários

### Importação XBackBone (`/admin/import`)

- Pré-visualização e importação do banco de dados SQLite do XBackBone
- Usuários são correspondidos pelo nome de usuário
- Idempotente (arquivos já importados são ignorados)

---

## 17. LGPD / Privacidade

| Funcionalidade | Artigo GDPR/LGPD |
|---|---|
| Política de privacidade (configurável) | Art. 13/14 – Transparência |
| Página de termos de serviço (configurável) | Art. 13/14 – Transparência |
| Exportação de dados (JSON com URLs) | Art. 20 – Portabilidade de dados |
| Autoexclusão de conta (arquivos + dados) | Art. 17 – Direito ao apagamento |
| Log de auditoria (TTL 90 dias via MongoDB) | Art. 5(2) – Responsabilidade |
| Exportação CSV do log de auditoria | Art. 5(2) – Responsabilidade |
| Retenção de arquivos configurável | Art. 5(1)(e) – Limitação da conservação |
| Chaves API como hash SHA-256 | Art. 32 – Segurança |
| Senhas como bcrypt (12 rounds) | Art. 32 – Segurança |
| Consentimento de cookies para Cloudflare Analytics | Art. 13 – Transparência |
| Anonimização na exclusão de conta | Art. 17 – Direito ao apagamento |

### Fluxo de exclusão LGPD/GDPR

Na exclusão da conta (`user:delete-account` / `DELETE /api/user/account`):
1. Todos os arquivos do usuário são excluídos do disco
2. As miniaturas são excluídas
3. O avatar é excluído
4. As entradas do log de auditoria são anonimizadas (`username: '[deleted]'`, `ip: null`, `userId: null`)
5. O documento de usuário é excluído
6. A sessão é destruída

---

## 18. Jobs em segundo plano

### Limpeza por retenção (`src/jobs/retentionCleanup.js`)

- **Execução:** Na inicialização e depois diariamente (`setInterval(runRetentionCleanup, 24h)`)
- **Ação:** Se `SiteSettings.fileRetentionDays > 0`, os arquivos mais antigos que esse valor são excluídos
- Exclui: arquivo em disco, miniatura, documento MongoDB
- Transmite `stats:invalidate` para os admins

### Índices TTL do MongoDB (automáticos)

| Coleção | TTL | Gatilho |
|---|---|---|
| `AuditLog` | 90 dias | `timestamp` |
| `Collection` | 7 dias após `expiresAt` | `expiresAt` |
| `ShareLink` | 7 dias após `expiresAt` | `expiresAt` |

---

## 19. Implantação

### Docker (recomendado)

```bash
git clone https://github.com/Christianoooooo/sharely.git
cd sharely
cp .env.example .env
# Editar .env (SESSION_SECRET, senhas MONGO, BASE_URL)
docker compose up -d
```

**Serviços:**
- `app` — Aplicação Node.js (porta 3000)
- `mongo` — MongoDB 7 (porta 127.0.0.1:27017, não acessível externamente)

**Volumes:**
- `uploads` — armazenamento persistente de arquivos
- `mongo_data` — dados MongoDB

**Verificações de saúde:** O app verifica HTTP 200 em `/`, o MongoDB verifica `db.adminCommand('ping')`.

### Proxy reverso Nginx

```nginx
server {
    listen 443 ssl;
    server_name files.example.com;

    client_max_body_size 2100M;  # Pelo menos tão grande quanto a maior parte + buffer

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Suporte WebSocket
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

> `BASE_URL` em `.env` deve corresponder ao domínio público.

### Primeira inicialização

O primeiro usuário registrado recebe automaticamente o papel `admin` (`User.countDocuments() === 0`).

---

## 20. Ambiente de desenvolvimento

### Pré-requisitos

- Node.js ≥ 18
- MongoDB (local ou via Docker)
- Opcional: ffmpeg, ghostscript (para miniaturas)

### Configuração

```bash
# Backend
npm install
cp .env.example .env
# Editar .env

# Frontend
cd client
npm install
```

### Inicialização

```bash
# Backend (porta 3000, com nodemon)
npm run dev

# Frontend (porta 5173, terminal separado)
cd client
npm run dev
```

O servidor de desenvolvimento Vite faz proxy das requisições da API para `localhost:3000` automaticamente.

### Build

```bash
npm run build   # Compila client/dist/, o backend permanece inalterado
npm start       # Inicia o servidor Express de produção
```

---

## 21. Migrações e scripts

### Migrações automáticas (a cada inicialização)

Essas migrações são executadas na inicialização do app em `app.js` e são idempotentes:

| Migração | Arquivo | Função |
|---|---|---|
| Migração de pastas de usuário | `src/migrations/migrateUserFolders.js` | Move arquivos de `uploads/` para `uploads/{folderName}/` |
| Migração de hashes de chaves API | `src/migrations/migrateApiKeyHashes.js` | Converte chaves API em texto simples para hashes SHA-256 |

### Scripts manuais

```bash
# Gerar miniaturas para arquivos já existentes
npm run migrate:thumbnails
# ou:
node scripts/generate-missing-thumbnails.js

# Mover uploads para pastas de usuário (manual)
npm run migrate:user-folders
# ou:
node scripts/migrate-uploads-to-user-folders.js
```

### Inicialização do banco de dados (Docker)

`scripts/mongo-init.js` é executado na primeira inicialização do contêiner MongoDB e cria o usuário de aplicação com as permissões corretas.

---

## 22. Testes end-to-end

**Framework:** Playwright (`@playwright/test`)

### Arquivos de teste

| Arquivo | Suite de testes |
|---|---|
| `e2e/upload.spec.js` | Fluxos de upload |
| `e2e/gallery.spec.js` | Galeria e gerenciamento de arquivos |
| `e2e/admin.spec.js` | Painel de administração |
| `e2e/sharelink.spec.js` | Criação e uso de links de compartilhamento |
| `e2e/tags.spec.js` | Gerenciamento de tags |
| `e2e/bulk-actions-fixes.spec.js` | Ações em lote |

### Execução

```bash
# Todos os testes
npm run test:e2e

# Com interface gráfica
npm run test:e2e:ui
```

**Configuração Playwright:** `playwright.config.js`  
**Configuração global:** `e2e/global-setup.js` (cria usuários de teste, admin, etc.)  
**Utilitários:** `e2e/helpers.js` (funções auxiliares compartilhadas)

---

## Apêndice: Ações do log de auditoria

| Ação | Gatilho |
|---|---|
| `login` | Login bem-sucedido |
| `logout` | Logout |
| `register` | Registro |
| `upload` | Upload de arquivo |
| `delete_file` | Arquivo excluído |
| `delete_account` | Conta excluída |
| `change_password` | Senha alterada |
| `change_username` | Nome de usuário alterado |
| `change_email` | E-mail alterado |
| `verify_email` | E-mail verificado |
| `forgot_password` | Redefinição de senha solicitada |
| `reset_password` | Senha redefinida |
| `regen_api_key` | Chave API regenerada |
| `sharex_config` | Configuração ShareX baixada |
| `export_data` | Exportação de dados |
| `admin_create_user` | Admin: usuário criado |
| `admin_delete_user` | Admin: usuário excluído |
| `admin_toggle_user` | Admin: usuário ativado/desativado |
| `admin_change_role` | Admin: papel do usuário alterado |
| `admin_change_password` | Admin: senha definida |
| `admin_regen_key` | Admin: chave API regenerada |

---

*Documentação gerada a partir do código-fonte de sharely v1.0.0*
