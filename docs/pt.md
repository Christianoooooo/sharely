# Sharely — Documentação Técnica

> **Versão:** 1.0.0 · **Licença:** MIT · **Node.js:** ≥ 22

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
       → normalizeMime(): MIME-Typ auf genau einen "typ/subtyp" reduzieren
       → stripIfEnabled(): Bild-Metadaten entfernen (falls aktiviert)
       → sealUpload(): mit ENCRYPTION_KEY verschlüsseln (sonst unverändert)
       → File.createUnique() → MongoDB
       → startThumbnail() (async, non-blocking; danach Klartext-Kopie löschen)
       → logAudit()
       → broadcast('file:uploaded') via WebSocket
       ← JSON: { files: [...] }
```

### Fluxo de dados: Upload ShareX

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

| Camada | Tecnologia | Versão |
|---|---|---|
| **Runtime** | Node.js | ≥ 22 |
| **Framework backend** | Express.js | 4.x |
| **Banco de dados** | MongoDB + Mongoose | Mongo 7, Mongoose 8.x |
| **Sessões** | express-session + connect-mongo | — |
| **Tempo real** | WebSocket (`ws`) | 8.x |
| **Upload de arquivos** | Multer | 2.x |
| **Criptografia de arquivos** | AES-256-GCM, HKDF-SHA256 (Node Crypto) | — |
| **E-mail** | Nodemailer | 10.x |
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
│   │   ├── auth.js                 # requireLogin / requireAdmin / requireApiKey / establishSession
│   │   ├── lookupLimiter.js        # Limite de taxa compartilhado para buscas de ID malsucedidas
│   │   └── upload.js               # Configuração Multer, lista de bloqueio
│   ├── models/
│   │   ├── AuditLog.js             # Eventos de auditoria (TTL 90 dias)
│   │   ├── Collection.js           # Coleções de arquivos
│   │   ├── File.js                 # Metadados de arquivos
│   │   ├── Paste.js                # Pastes de texto
│   │   ├── ShareLink.js            # Links de compartilhamento por arquivo
│   │   ├── SiteSettings.js         # Singleton: configurações do operador
│   │   └── User.js                 # Contas de usuário + chaves API
│   ├── routes/
│   │   ├── api.js                  # API principal (upload, galeria, admin, ...)
│   │   ├── auth.js                 # Login / Registro / Redefinição de senha
│   │   ├── docs.js                 # Página pública de documentação (/docs)
│   │   ├── files.js                # Serviço de arquivos, embeds OG, requisições de intervalo
│   │   ├── import.js               # Migração XBackBone
│   │   ├── install.js              # Endpoint de instalação inicial (token de instalação)
│   │   ├── pastes.js               # API de pastes
│   │   └── shares.js               # Serviço de arquivos via link de compartilhamento
│   ├── jobs/
│   │   └── retentionCleanup.js     # Exclusão diária de arquivos expirados e restos de upload
│   ├── migrations/
│   │   ├── migrateApiKeyHashes.js  # Única vez: textos simples → hashes SHA-256
│   │   └── migrateUserFolders.js   # Única vez: mover arquivos para pastas de usuário
│   ├── utils/
│   │   ├── asyncRouter.js          # Router Express que repassa erros async ao manipulador de erros
│   │   ├── audit.js                # Função auxiliar logAudit()
│   │   ├── deleteUserData.js       # Exclusão completa de todos os dados de uma conta
│   │   ├── fileCrypto.js           # Criptografia dos arquivos armazenados (AES-256-GCM)
│   │   ├── generateThumbnail.js    # Integração ffmpeg / ghostscript
│   │   ├── mailer.js               # Wrapper Nodemailer + templates de e-mail i18n
│   │   ├── mime.js                 # Normalização MIME, whitelist para entrega inline
│   │   ├── sanitizeFilename.js     # Sanitização do nome de arquivo
│   │   ├── setupToken.js           # Token de instalação da instalação inicial
│   │   ├── storeUpload.js          # Criptografar upload, miniatura a partir da cópia em texto simples
│   │   └── uploadPath.js           # Resolução de caminhos com proteção contra path traversal
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
│   ├── generate-missing-thumbnails.js
│   └── encrypt-existing-files.js   # Criptografar posteriormente arquivos existentes
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
| `BIND_ADDRESS` | `127.0.0.1` | Endereço do host onde o Docker publica a porta. Atrás de um proxy reverso, manter loopback; `0.0.0.0` apenas atrás de um firewall externo ou sem proxy (veja "Cloudflare Tunnel / proxy em um contêiner") |
| `TRUST_PROXY` | `1` | Número de saltos de proxy confiáveis (ex.: `2` para Cloudflare → nginx); deve corresponder à sua configuração, senão IPs de cliente e limites de taxa ficam errados |
| `ENCRYPTION_KEY` | — | Chave de 32 bytes (`openssl rand -base64 32`). Se definida, novos uploads e miniaturas são armazenados criptografados (veja "Criptografia em repouso"). **Perdê-la torna os arquivos criptografados ilegíveis** |
| `INSTALL_TOKEN` | _(aleatório, escrito no log)_ | Token necessário para concluir a instalação inicial |
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
| `NODE_ENV` | — | Opcional. Os cookies seguros não dependem dele: são definidos automaticamente assim que a requisição chega via HTTPS (`X-Forwarded-Proto` do proxy) |
| `UPDATE_ENABLED` | `false` | Ativa a atualização com um clique no painel de administração |
| `UPDATE_CHANNEL` | `release` | Detecção de atualizações: `release` (tag de release mais recente do GitHub) ou `branch` (novos commits em `UPDATE_BRANCH`) |
| `UPDATE_BRANCH` | `main` | Branch que o atualizador obtém — e usa como referência no modo `branch` |
| `UPDATE_REPO` | `Christianoooooo/sharely` | Repositório GitHub verificado quanto a novas releases |
| `COMPOSE_PROJECT_NAME` | `sharely` | Nome do projeto Compose; precisa ser idêntico no host e no atualizador |

### Atualizações automáticas

O painel de administração (**Admin → Definições do site → Versão e atualizações**) mostra sempre a versão instalada e se há uma atualização disponível.

**Em que se baseia «atualização disponível»** é controlado por `UPDATE_CHANNEL`:

- `release` (padrão) — a versão instalada é comparada com a **tag de release do GitHub** mais recente. Adequado quando se cria uma release para cada versão.
- `branch` — o **commit** instalado é comparado com a ponta de `UPDATE_BRANCH`. Há uma atualização disponível assim que existem novos commits no branch — sem necessidade de release. A versão/commit instalado é comunicado pelo contêiner do atualizador, por isso este modo requer que o atualizador esteja em execução.

Opcionalmente, uma atualização pode ser instalada com um clique. Isso fica a cargo de um contêiner próprio `updater` — o **único** componente com acesso ao socket do Docker. A aplicação web nunca toca no socket: apenas coloca um arquivo de solicitação em um volume compartilhado, e o atualizador executa então `git pull` + `docker compose build app thumbnailer` + `docker compose up -d app thumbnailer`.

> ⚠️ **Nota de segurança:** O atualizador monta o socket do Docker, o que equivale a permissões de root no host. Ative-o somente se aceitar conscientemente este compromisso. Uma aplicação web comprometida pode, no máximo, desencadear uma reconstrução a partir do branch configurado — nenhum comando arbitrário no host. Para isso, o diretório de controle compartilhado pertence a `root` e tem o sticky bit (`1777`): a aplicação só pode criar `update.request` e escrever `update.state`, mas não pode substituir arquivos do atualizador nem trocá-los por links simbólicos.

Requisitos: deploy a partir de um **checkout Git**, `UPDATE_ENABLED=true` no `.env`, `COMPOSE_PROJECT_NAME` inalterado e inicialização incluindo o atualizador via `docker compose --profile updater up -d --build`. O atualizador está atrás do perfil Compose `updater` — um `docker compose up` normal nunca inicia, portanto, o contêiner privilegiado. Durante a instalação, o contêiner da aplicação é reconstruído e fica brevemente indisponível; a página mostra o progresso e se reconecta automaticamente. Com `UPDATE_ENABLED=false` (e sem o perfil) o painel limita-se a notificar.

O atualizador reconstrói com `--no-deps` apenas os contêineres da aplicação e das miniaturas — o banco de dados nunca é recriado junto com eles. No entanto, **não atualiza a si mesmo**: após alterações em `updater/` é necessário executar uma vez `docker compose --profile updater up -d --build updater`.

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
  sessionVersion:              Number (incrementado ao alterar/redefinir a senha, invalida as outras sessões)
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
  shortId:       String (24 caracteres hexadecimais aleatórios, único)
  deleteToken:   String (32 caracteres hexadecimais, único; select: false, nunca nas respostas da API)
  originalName:  String (sanitizado)
  storedName:    String (caminho relativo: "folderName/8hex.ext")
  mimeType:      String (normalizado para exatamente um "tipo/subtipo")
  encrypted:     Boolean (arquivo armazenado no formato de src/utils/fileCrypto.js)
  size:          Number (bytes, tamanho em texto simples)
  uploader:      ObjectId → User
  views:         Number
  expiresAt:     Date | null (autodestruição após uma data)
  maxDownloads:  Number | null (autodestruição após N downloads)
  downloadCount: Number
  tags:          [String] (máx. 20 × 50 caracteres)
  description:   String (máx. 1000)
  createdAt:     Date
}
```

**Propriedades virtuais:**
- `sizeHuman` — tamanho legível (B / KB / MB / GB)
- `displayType` — classificação: `image|video|audio|pdf|code|text|file`

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

### Instalação (`/api/install`)

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/status` | — | `{ installed: Boolean }` (se já existem usuários) |
| `POST` | `/setup` | Token de instalação | Criar a conta de administrador e as configurações do operador; somente enquanto não existir nenhum usuário |

O token de instalação aparece no log na inicialização (`[install] Not installed yet. Setup token: …`) ou é definido via `INSTALL_TOKEN`. Sem um `setupToken` correspondente no corpo, `/setup` responde com `403`.

---

### Autenticação (`/api/auth`)

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/me` | Sessão | Usuário atualmente conectado |
| `POST` | `/login` | — | Fazer login (limitado: 10/15min; atribui um novo ID de sessão) |
| `POST` | `/register` | — | Registrar-se (limitado; o primeiro admin é criado apenas na instalação) |
| `POST` | `/logout` | — | Fazer logout |
| `GET` | `/smtp-enabled` | — | Verificar se SMTP está configurado |
| `GET` | `/verify-email?token=` | — | Verificar endereço de e-mail |
| `GET` | `/verify-reset-token?token=` | — | Validar token de redefinição |
| `POST` | `/forgot-password` | — | Enviar e-mail de redefinição de senha (limitado: 5/h) |
| `POST` | `/reset-password` | — | Definir nova senha (encerra todas as sessões existentes) |

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
   Verificação de cota contra `totalSize` mais os tamanhos anunciados de todos os uploads em partes abertos do usuário
2. `POST /api/chunk/:uploadId` (Body: `chunkIndex=N`, Arquivo: `chunk`) → `{ received: N }`  
   Em paralelo com 3–5 partes simultâneas; `413` assim que os bytes recebidos excederem `totalSize`
3. `POST /api/chunk/:uploadId/complete` → `{ files: [fileObject] }`  
   `400` se o arquivo montado não tiver exatamente o tamanho `totalSize`

---

### Gerenciamento de arquivos

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/gallery` | Sessão | Arquivos próprios (admin: todos), paginado (24/página), filtros: `q`, `type`, `tag`, `page` |
| `GET` | `/api/file/:shortId` | — | Metadados do arquivo sem `deleteToken` (incrementa o contador de visualizações) |
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

Nome de usuário, senha, e-mail, e-mail de verificação e exclusão de conta são limitados a 10 tentativas em 15 minutos por usuário (contra adivinhação de senha com uma sessão roubada e spam de e-mails). Uma alteração de senha encerra todas as outras sessões do usuário; a sessão atual permanece conectada.

---

### Links de compartilhamento

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/file/:shortId/share-links` | Sessão (Proprietário/Admin) | Todos os links de compartilhamento de um arquivo |
| `POST` | `/api/file/:shortId/share-links` | Sessão (Proprietário/Admin) | Criar link de compartilhamento |
| `DELETE` | `/api/share-links/:token` | Sessão (Proprietário/Criador/Admin) | Excluir link de compartilhamento |
| `GET` | `/api/share-links/:token` | — | Metadados do link de compartilhamento (público; sem o `shortId` do arquivo, para que senha, expiração e limite não possam ser contornados via `/f/`) |
| `POST` | `/api/share-links/:token/verify` | — | Verificar senha do link de compartilhamento (máx. 10 tentativas falhas por IP em 15 minutos) |

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
| `POST` | `/api/collections/:id/verify` | — | Verificar senha da coleção (máx. 10 tentativas falhas por IP em 15 minutos) |

---

### Endpoints de administração

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/admin/stats` | Admin | Estatísticas do painel |
| `GET` | `/api/admin/users` | Admin | Todos os usuários (com contagem de arquivos) |
| `POST` | `/api/admin/users` | Admin | Criar usuário |
| `PATCH` | `/api/admin/users/:id/toggle` | Admin | Ativar/desativar usuário |
| `PATCH` | `/api/admin/users/:id/role` | Admin | Alterar papel do usuário (efeito imediato, também em sessões abertas) |
| `DELETE` | `/api/admin/users/:id` | Admin | Excluir usuário e todos os seus dados |
| `POST` | `/api/admin/users/:id/regen-key` | Admin | Regenerar chave API |
| `PATCH` | `/api/admin/users/:id/password` | Admin | Definir senha (encerra todas as sessões do usuário) |
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

### Proteção

- **Verificação de origem:** O handshake é rejeitado com `403` se o cabeçalho `Origin` não corresponder ao `Host` (mesma regra de `requireSameOrigin` para a API HTTP). O proxy deve repassar o `Host` original.
- **Verificação contínua de permissões:** Sessão, status ativo, papel e `sessionVersion` são verificados novamente a cada mensagem e, adicionalmente, a cada 30 segundos para todas as conexões. Após logout, desativação, exclusão, alteração de senha ou rebaixamento, a conexão é fechada ou perde os direitos de admin e os broadcasts de admin.
- **Heartbeat:** Ping a cada 30 segundos; conexões sem pong são desconectadas.
- **Limites:** no máximo 64 KiB por mensagem (mensagens maiores fecham a conexão com o código `1009`), até 30 mensagens seguidas e depois 5 por segundo por conexão (caso contrário, resposta com `status: 429`), no máximo 20 conexões simultâneas por IP de cliente. Ações que verificam a senha ou enviam e-mails são limitadas a 10 em 15 minutos por usuário.

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
| `file:view` | Proprietário do arquivo + admins | `{ shortId, views }` |
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

Serve o arquivo como resposta HTTP com suporte a requisições de intervalo (206 Partial Content, incluindo intervalos de sufixo como `bytes=-500`). Arquivos criptografados são descriptografados em tempo real.

Quais arquivos são exibidos diretamente no navegador é decidido por uma whitelist (`src/utils/mime.js`) com base no tipo MIME normalizado:

| Caso | `Content-Type` | `Content-Disposition` | Adicional |
|---|---|---|---|
| Imagens (PNG, JPEG, GIF, WebP, AVIF, BMP, ICO), formatos comuns de vídeo/áudio, PDF | tipo real | `inline` | — |
| Texto e código (conforme `displayType`) | `text/plain; charset=utf-8` | `inline` | `CSP: sandbox` |
| HTML, SVG, XML e todo o resto | `application/octet-stream` | `attachment` | `CSP: sandbox` |

Assim, um arquivo enviado não pode ser renderizado como página na origem do app nem incluído como script.

Se o arquivo tiver um limite de downloads (`maxDownloads`), `/raw` conta apenas acessos completos (sem `Range` ou a partir do byte 0), e uma vez por sessão de visitante: a pré-visualização e o download subsequente do mesmo visitante consomem juntos um download. Acessos do proprietário e de admins nunca contam. Quando o limite é atingido, a rota responde com `410`.

### `/f/:shortId/download` — Download forçado

Como `/raw`, mas sempre `Content-Disposition: attachment` e `application/octet-stream`. Cada novo visitante conta para `maxDownloads`.

### `/f/:shortId/thumb` — Miniatura

Retorna a miniatura JPEG (para vídeos e PDFs), descriptografada quando a criptografia está ativada. `Cache-Control: public, max-age=86400`. O ID deve consistir em `[A-Za-z0-9_-]` (proteção contra path traversal via `%2F`).

### `/f/:shortId/delete/:token` — Exclusão ShareX

Exclui o arquivo sem sessão usando um token de exclusão único. O token é retornado apenas no upload e não aparece em nenhuma outra resposta da API.

### `/s/:token` — Serviço de arquivos via link de compartilhamento (`src/routes/shares.js`)

Verifica a senha (via flag de sessão), a data de expiração e o limite de downloads, e então serve o arquivo.

### Proteção contra tentativa de adivinhação de IDs

Todos os acessos públicos por ID ou token (`/f/*`, `/s/*`, `/api/file/:shortId`, `/api/share-links/:token`, `/api/collections/:id`, pastes) compartilham um limite de taxa: no máximo 100 acessos malsucedidos (404/410/401 …) por IP em 15 minutos. Acessos bem-sucedidos não contam. IDs de arquivo antigos com 8 caracteres continuam válidos, mas são mais curtos e, portanto, mais fáceis de adivinhar do que os novos.

---

## 10. Autenticação e segurança

### Autenticação por sessão

- Sessão Express com armazenamento MongoDB (`connect-mongo`)
- Cookie de sessão: `httpOnly: true`, `sameSite: 'strict'`, `secure: 'auto'` (definido assim que a requisição chega via HTTPS; atrás de um proxy via `X-Forwarded-Proto` e `TRUST_PROXY`)
- Duração da sessão: configurável via `SiteSettings.sessionDurationDays` (padrão: 7 dias), com cache ao vivo de 60 segundos
- Login, registro e instalação atribuem um novo ID de sessão (`establishSession`, proteção contra fixação de sessão)
- A cada requisição, o papel, o status ativo e a `sessionVersion` do usuário são lidos do banco de dados: contas excluídas ou desativadas e sessões anteriores a uma alteração de senha perdem o login imediatamente, e alterações de papel têm efeito imediato

### Autenticação por chave API

- As chaves API são armazenadas como hashes SHA-256, nunca em texto simples
- Os primeiros 8 caracteres são armazenados como `apiKeyPrefix` (para exibição)
- Busca: `User.findByApiKey(plaintext)` calcula o hash e busca em `apiKeyHash`
- Ao baixar a configuração do ShareX, a chave é regenerada — o texto simples fica visível apenas naquele momento

### Cadeia de middleware (`src/middleware/auth.js`)

```
requireLogin    → verifica req.session.user → 401 se não conectado
requireAdmin    → como requireLogin, adicionalmente role === 'admin' → 403
requireApiKey   → verifica Authorization: Bearer, X-API-Key, ?api_key= ou req.body.token
```

Todos os routers são criados via `asyncRouter()`: erros em handlers `async` chegam ao manipulador de erros central (`500`), em vez de deixar a requisição pendurada. Uma `uncaughtException` encerra o processo, e o Docker o reinicia (`restart: unless-stopped`).

### Proteção CSRF

`requireSameOrigin()` em `app.js` compara o cabeçalho `Origin` com o cabeçalho `Host` para todas as rotas da API. Complementa os cookies `sameSite: 'strict'`.

### Política de Segurança de Conteúdo

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

### Cabeçalhos de segurança

- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (somente em requisições HTTPS)
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin` (URLs de arquivos, pastes e compartilhamentos não chegam a sites externos via Referer)
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`

### Limitação de taxa

| Endpoint | Limite | Janela | Chave |
|---|---|---|---|
| Upload (`/upload`, `/api/upload`, `/api/web-upload`) | 60 requisições | 15 minutos | IP |
| Auth (`/api/auth/login`, `/register`, etc.) | 10 requisições | 15 minutos | IP |
| Redefinição de senha | 5 requisições | 1 hora | IP |
| Verificação de senha de links de compartilhamento, coleções, pastes | 10 tentativas falhas | 15 minutos | IP |
| Ações de conta (nome, senha, e-mail, e-mail de verificação, exclusão) | 10 requisições | 15 minutos | Usuário |
| Acessos malsucedidos por ID/token (veja o capítulo 9) | 100 requisições | 15 minutos | IP |
| WebSocket | veja o capítulo 8 | — | Conexão / IP / Usuário |

O IP do cliente depende de `TRUST_PROXY`; por isso a porta do app deve ser acessível apenas através do proxy reverso (`BIND_ADDRESS`), caso contrário `X-Forwarded-For` pode ser falsificado.

### Logging

O log de acesso (stdout → log do Docker) contém endereços IP truncados (IPv4 para `/24`, IPv6 para `/48`). Chaves API (`api_key=`), tokens em parâmetros de consulta (`token=`), tokens de exclusão e tokens de compartilhamento são ocultados. O log de auditoria armazena o IP completo e é excluído automaticamente após 90 dias.

### Lista de bloqueio de arquivos

Os seguintes tipos MIME e extensões são rejeitados no upload:

**Tipos MIME bloqueados:** `application/x-executable`, `application/x-sh`, `application/x-csh`, `application/x-bat`

**Extensões bloqueadas:** `.bat`, `.cmd`, `.com`, `.ps1`, `.psm1`, `.psd1`, `.sh`, `.bash`, `.csh`, `.zsh`, `.fish`, `.vbs`, `.vbe`, `.jse`, `.scr`, `.pif`, `.application`, `.gadget`, `.hta`, `.php`, `.php3–5`, `.phtml`, `.asp`, `.aspx`, `.jsp`, `.jspx`, `.cfm`

### Proteção contra path traversal

Todos os acessos a arquivos via `resolveUploadPath()` verificam se o caminho resolvido está dentro de `UPLOAD_DIR`. Os IDs de miniaturas são adicionalmente verificados contra `[A-Za-z0-9_-]`.

---

## 11. Sistema de upload

### Upload padrão (Multer)

- **Armazenamento:** `multer.diskStorage` → `uploads/{folderName}/{8hex}{.ext}`
- **Nome do arquivo:** `crypto.randomBytes(4).hex() + extensão-original`
- **Limite:** `MAX_FILE_SIZE_MB` (padrão: 100 MB)
- **Localização:** Pasta específica do usuário (`user.folderName`)
- **Tipo MIME:** é reduzido com `normalizeMime()` a exatamente um `tipo/subtipo` (parâmetros e tipos adicionais separados por vírgula são descartados, valores inválidos tornam-se `application/octet-stream`)
- **Criptografia:** com `ENCRYPTION_KEY`, `sealUpload()` criptografa o arquivo no próprio local; uma cópia em texto simples (`<arquivo>.plain-<hex>`) permanece apenas até a geração da miniatura
- **Endpoint ShareX `/upload`:** o Multer grava o arquivo antes da verificação da chave API; se a requisição for rejeitada, ele é excluído imediatamente

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
**Verificação de tamanho:** os bytes recebidos não podem exceder `totalSize`; o arquivo final deve ter exatamente o tamanho `totalSize`  
**Limpeza:** diretórios de upload não concluídos são excluídos pelo job de retenção após 24 horas

### Upload de avatar

- **Armazenamento:** `multer.memoryStorage()` (sem buffer em disco)
- **Localização:** `uploads/.avatars/{userId}{.ext}`
- **Limite:** 2 MB
- **Formatos:** JPEG, PNG, GIF, WebP

---

## 12. Geração de miniaturas

As miniaturas são geradas de forma assíncrona após o upload (`startThumbnail()` — erros são ignorados silenciosamente). Com Docker Compose, ffmpeg e Ghostscript não rodam no contêiner do app, mas em um contêiner próprio `thumbnailer`: sem rede, sem segredos, como usuário `nobody`, com sistema de arquivos somente leitura e sem acesso a `uploads/`. O app copia cada arquivo de origem para o volume compartilhado `thumbjobs` (`in/`), o worker (`src/thumbnailWorker.js`) grava o resultado em `out/` e o app só o aceita como arquivo regular de até 2 MB (sem links simbólicos). Se o contêiner não estiver rodando, as miniaturas são ignoradas e o app registra um aviso uma única vez. Sem `THUMBNAIL_WORKER_DIR` (desenvolvimento local) as ferramentas rodam diretamente no app, com um ambiente vazio (apenas `PATH`).

Se `ENCRYPTION_KEY` estiver definida, a miniatura é gerada a partir da cópia em texto simples, depois criptografada, e a cópia é excluída. Se a geração falhar, uma miniatura eventualmente escrita pela metade é removida.

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

Para arquivos criptografados, o script descriptografa a origem temporariamente em um arquivo temporário e criptografa a miniatura gerada.

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
- Criar usuários, ativar/desativar, alterar papel (desativação e rebaixamento têm efeito imediato, também em sessões abertas e conexões WebSocket)
- Redefinir senha (desconecta o usuário em todos os lugares), regenerar chave API
- Alterar nome da pasta (arquivos físicos são movidos no servidor)
- Excluir usuário (todos os dados, como na autoexclusão, veja o capítulo 17)

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
| Exclusão de conta (arquivos, pastes, coleções, links de compartilhamento, avatar) | Art. 17 – Direito ao apagamento |
| Log de auditoria (TTL 90 dias via MongoDB) | Art. 5(2) – Responsabilidade |
| Exportação CSV do log de auditoria | Art. 5(2) – Responsabilidade |
| Retenção de arquivos configurável | Art. 5(1)(e) – Limitação da conservação |
| Chaves API como hash SHA-256 | Art. 32 – Segurança |
| Senhas como bcrypt (12 rounds) | Art. 32 – Segurança |
| Consentimento de cookies para Cloudflare Analytics | Art. 13 – Transparência |
| Anonimização na exclusão de conta | Art. 17 – Direito ao apagamento |
| Criptografia opcional dos arquivos armazenados (`ENCRYPTION_KEY`) | Art. 32 – Segurança |
| Endereços IP truncados e tokens ocultados no log de acesso | Art. 5(1)(c) – Minimização de dados |

### Fluxo de exclusão LGPD/GDPR

Na exclusão da conta (`user:delete-account` / `DELETE /api/user/account`) e na exclusão por um admin (`admin:users:delete` / `DELETE /api/admin/users/:id`), o mesmo fluxo é executado (`src/utils/deleteUserData.js`):
1. Todos os arquivos do usuário são excluídos do disco
2. As miniaturas são excluídas
3. Os links de compartilhamento do usuário e os que apontam para seus arquivos são excluídos
4. Os pastes e coleções do usuário são excluídos; seus arquivos também são removidos das coleções de outros usuários
5. O avatar é excluído
6. As entradas do log de auditoria são anonimizadas (`username: '[deleted]'`, `ip: null`, `userId: null`)
7. O documento de usuário é excluído
8. Na autoexclusão: a sessão é destruída; sessões abertas e conexões WebSocket perdem o login na próxima requisição

A entrada de auditoria da própria exclusão permanece como comprovante e é excluída automaticamente após 90 dias.

---

## 18. Jobs em segundo plano

### Limpeza por retenção (`src/jobs/retentionCleanup.js`)

- **Execução:** Na inicialização e depois diariamente (`setInterval(runRetentionCleanup, 24h)`)
- **Ação:** Se `SiteSettings.fileRetentionDays > 0`, os arquivos mais antigos que esse valor são excluídos; além disso, arquivos autodestrutivos após `expiresAt` ou ao atingir `maxDownloads`
- Exclui: arquivo em disco, miniatura, documento MongoDB
- Limpa: uploads em partes não concluídos com mais de 24 horas, bem como cópias em texto simples esquecidas de uploads criptografados (`*.plain-*`) com mais de 1 hora
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
- `app` — Aplicação Node.js (porta 3000, por padrão publicada apenas em `127.0.0.1`, veja `BIND_ADDRESS`)
- `mongo` — MongoDB 7 (porta 127.0.0.1:27017, não acessível externamente)
- `updater` — atualizador automático opcional (somente com o perfil `updater`)

**Volumes:**
- `uploads` — armazenamento persistente de arquivos
- `mongo_data` — dados MongoDB
- `control` — troca entre o app e o updater

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

### Cloudflare Tunnel / proxy em um contêiner

Por padrão, o Docker publica a porta do app apenas em `127.0.0.1` (`BIND_ADDRESS`). Um proxy executado diretamente no host, como o exemplo nginx acima, consegue alcançá-la. Um proxy ou `cloudflared` em seu próprio contêiner não, e responde com **502 Bad Gateway**.

- **Recomendado:** conectar o contêiner do proxy à rede Docker do sharely (`<projeto>_default`, por padrão `sharely_default`) e apontá-lo para `http://app:3000`. Assim nenhuma porta precisa ser publicada:
  ```bash
  docker network connect sharely_default <cloudflared-or-proxy-container>
  ```
  Para manter isso após reinícios, declare a rede como `external` no arquivo compose do proxy.
- **Com um firewall externo** que bloqueie a porta 3000 da Internet (ex.: Hetzner Cloud Firewall): defina `BIND_ADDRESS=0.0.0.0` no `.env`. Não faça isso sem tal firewall: o Docker contorna firewalls do host como o `ufw`, e quem alcança a porta diretamente contorna o TLS e pode falsificar `X-Forwarded-For`, anulando os limites de taxa.

O proxy deve repassar o cabeçalho `Host` original (conexões WebSocket são rejeitadas se `Origin` e `Host` forem diferentes) e `X-Forwarded-Proto` (necessário para cookies seguros e HSTS). O Cloudflare Tunnel e o exemplo nginx fazem isso por padrão; não defina `httpHostHeader` na configuração do túnel. Após a configuração, verifique se o log de auditoria mostra os IPs reais dos clientes; caso contrário, ajuste `TRUST_PROXY`.

> **Nota de atualização:** Versões anteriores publicavam a porta 3000 em todas as interfaces. Se o seu proxy roda em um contêiner, defina `BIND_ADDRESS` ou conecte a rede como descrito acima antes de atualizar.

### Criptografia em repouso

Com `ENCRYPTION_KEY` definida, o sharely criptografa cada novo upload e sua miniatura com AES-256-GCM antes de armazená-los (uma chave por arquivo, derivada da chave mestra). Os arquivos são descriptografados em tempo real ao serem servidos, incluindo requisições Range e downloads ZIP.

- Gere a chave uma vez com `openssl rand -base64 32`, coloque-a no `.env` e **faça backup separado**: sem ela, os arquivos criptografados não podem ser recuperados. Trocar ou remover a chave depois não é suportado.
- Arquivos existentes permanecem sem criptografia até você executar a migração (faça backup do volume `uploads` antes): `docker compose exec app npm run migrate:encrypt`
- Não coberto: pastes, nomes de arquivos e outros metadados no MongoDB, avatares e a memória do servidor em execução. Enquanto um upload é processado (montagem dos chunks, remoção de metadados, geração de miniatura), ele existe brevemente sem criptografia no disco.
- A configuração de administração sobre criptografia de disco/volume apenas declara a criptografia do volume na política de privacidade e é independente disto.

### Primeira inicialização

Na primeira inicialização sem usuários, o sharely escreve um token de instalação no log (`docker compose logs app`), ou usa `INSTALL_TOKEN` se definido. A página de instalação pede esse token e cria a conta de administrador; o registro normal nunca cria um administrador.

---

## 20. Ambiente de desenvolvimento

### Pré-requisitos

- Node.js ≥ 22
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

# Criptografar arquivos e miniaturas existentes (requer ENCRYPTION_KEY, faça backup antes)
npm run migrate:encrypt
# ou no contêiner:
docker compose exec app npm run migrate:encrypt
```

`migrate:encrypt` grava cada arquivo criptografado em `<storedName>.enc`, depois atualiza o registro e só então exclui o texto simples. Uma execução interrompida pode ser repetida com segurança.

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

**Configuração Playwright:** `playwright.config.js` (inicia o servidor com `INSTALL_TOKEN`, padrão `e2e-install-token`)  
**Configuração global:** `e2e/global-setup.js` (executa a instalação com esse token, cria usuários de teste, admin, etc.)  
**Utilitários:** `e2e/helpers.js` (funções auxiliares compartilhadas)

### Testes unitários

```bash
npm test
```

Executados sem banco de dados: `src/utils/validateEmail.test.js`, `src/utils/stripMetadata.test.js` e `src/utils/fileCrypto.test.js` (criptografia: roundtrip, intervalos de bytes, detecção de adulteração).

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
