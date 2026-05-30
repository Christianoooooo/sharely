# Sharely — 技术文档

> **版本：** 1.0.0 · **许可证：** MIT · **Node.js：** ≥ 18

---

## 目录

1. [项目概述](#1-项目概述)
2. [架构](#2-架构)
3. [技术栈](#3-技术栈)
4. [目录结构](#4-目录结构)
5. [配置与环境变量](#5-配置与环境变量)
6. [数据模型](#6-数据模型)
7. [REST API](#7-rest-api)
8. [WebSocket API](#8-websocket-api)
9. [文件服务路由](#9-文件服务路由)
10. [身份验证与安全](#10-身份验证与安全)
11. [上传系统](#11-上传系统)
12. [缩略图生成](#12-缩略图生成)
13. [邮件与SMTP](#13-邮件与smtp)
14. [国际化](#14-国际化)
15. [前端（React SPA）](#15-前端react-spa)
16. [管理后台](#16-管理后台)
17. [GDPR / 隐私保护](#17-gdpr--隐私保护)
18. [后台任务](#18-后台任务)
19. [部署](#19-部署)
20. [开发环境](#20-开发环境)
21. [迁移与脚本](#21-迁移与脚本)
22. [端到端测试](#22-端到端测试)

---

## 1. 项目概述

Sharely 是一个**自托管文件共享平台**，提供简洁的 Web 界面、ShareX 集成和 API 访问。用户可上传截图、文件和媒体，并通过短链接即时分享。

### 核心功能

| 功能 | 描述 |
|---|---|
| Web 上传 | 拖放上传，单次最多支持 500 个文件 |
| 分块上传 | 通过并行多部分上传支持最大 2GB 的文件 |
| ShareX 集成 | 一键下载 `.sxcu` 配置文件 |
| API 上传 | Bearer Token 认证，兼容 curl/wget |
| 文件查看器 | 图片缩放、视频/音频流媒体（HTTP Range）、PDF 内联显示、代码语法高亮 |
| 嵌入模式 | *embed*（OG/Twitter Card HTML）或 *raw*（直接重定向） |
| 缩略图 | 自动为视频（ffmpeg）和 PDF（ghostscript）生成 JPEG 预览图 |
| 集合 | 支持可选密码和过期日期的文件分组 |
| 分享链接 | 带密码、过期时间和下载次数限制的文件专属链接 |
| 实时 UI | 基于 WebSocket 的实时更新（上传、删除、访问计数、管理统计） |
| 多语言支持 | 8 种语言：EN、DE、FR、ES、IT、PT、JA、ZH |
| 管理后台 | 统计信息、用户管理、文件管理、审计日志（CSV 导出） |
| GDPR 合规 | 符合欧盟 GDPR 的隐私功能（第 17、20、32 条等） |
| XBackBone 导入 | 支持从现有 XBackBone 安装迁移数据 |
| Docker 就绪 | `docker compose up -d` 即可启动完整环境 |

---

## 2. 架构

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

### 数据流：标准上传

```
Browser → POST /api/web-upload (multipart/form-data)
       → multer: Datei in uploads/{folderName}/
       → File.createUnique() → MongoDB
       → generateThumbnail() (async, non-blocking)
       → logAudit()
       → broadcast('file:uploaded') via WebSocket
       ← JSON: { files: [...] }
```

### 数据流：ShareX 上传

```
ShareX → POST /upload (token im Formular-Body)
       → multer: Datei temporär in uploads/
       → requireApiKey: Token-Lookup → User
       → fs.renameSync → uploads/{folderName}/
       → File.create() → MongoDB
       ← JSON: { url, delete_url }
```

---

## 3. 技术栈

| 层级 | 技术 | 版本 |
|---|---|---|
| **运行时** | Node.js | ≥ 18 |
| **后端框架** | Express.js | 4.x |
| **数据库** | MongoDB + Mongoose | Mongo 7, Mongoose 8.x |
| **会话管理** | express-session + connect-mongo | — |
| **实时通信** | WebSocket (`ws`) | 8.x |
| **文件上传** | Multer | 1.x |
| **邮件** | Nodemailer | 8.x |
| **密码哈希** | bcryptjs | 2.x（12 轮） |
| **API 密钥哈希** | SHA-256（Node Crypto） | — |
| **限流** | express-rate-limit | 8.x |
| **XBackBone 导入** | sql.js | 1.x |
| **前端框架** | React 18 | 18.3.x |
| **前端路由** | React Router v6 | 6.x |
| **构建工具** | Vite | 6.x |
| **样式** | Tailwind CSS + Radix UI | 3.x |
| **UI 组件** | shadcn/ui（Radix primitives） | — |
| **图标** | FontAwesome | 6.x |
| **i18n** | i18next + react-i18next | — |
| **语法高亮** | highlight.js | 11.x |
| **容器** | Docker + Docker Compose | — |
| **测试** | Playwright（E2E） | 1.60.x |

---

## 4. 目录结构

```
sharely/
├── app.js                          # Express 入口点，启动序列
├── package.json
├── .env.example                    # 所有环境变量的模板
├── Dockerfile
├── docker-compose.yml
│
├── src/
│   ├── config/
│   │   └── db.js                   # MongoDB 连接（Mongoose）
│   ├── middleware/
│   │   ├── auth.js                 # requireLogin / requireAdmin / requireApiKey
│   │   └── upload.js               # Multer 配置，黑名单
│   ├── models/
│   │   ├── AuditLog.js             # 审计事件（TTL 90 天）
│   │   ├── Collection.js           # 文件集合
│   │   ├── File.js                 # 文件元数据
│   │   ├── ShareLink.js            # 文件专属分享链接
│   │   ├── SiteSettings.js         # 单例：运营者设置
│   │   └── User.js                 # 用户账户 + API 密钥
│   ├── routes/
│   │   ├── api.js                  # 主 API（上传、相册、管理等）
│   │   ├── auth.js                 # 登录 / 注册 / 密码重置
│   │   ├── files.js                # 文件服务、OG 嵌入、Range 请求
│   │   ├── import.js               # XBackBone 迁移
│   │   ├── install.js              # 初始安装端点
│   │   └── shares.js               # 分享链接文件服务
│   ├── jobs/
│   │   └── retentionCleanup.js     # 每日删除过期文件
│   ├── migrations/
│   │   ├── migrateApiKeyHashes.js  # 一次性：明文 → SHA-256 哈希
│   │   └── migrateUserFolders.js   # 一次性：将文件移入用户文件夹
│   ├── utils/
│   │   ├── audit.js                # logAudit() 辅助函数
│   │   ├── generateThumbnail.js    # ffmpeg / ghostscript 集成
│   │   ├── mailer.js               # Nodemailer 封装 + i18n 邮件模板
│   │   └── sanitizeFilename.js     # 文件名净化
│   └── ws.js                       # WebSocket 服务器 + 动作调度器
│
├── client/                         # React 前端
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx                # React 入口点
│       ├── App.jsx                 # 路由配置
│       ├── index.css               # 全局样式
│       ├── context/
│       │   └── AuthContext.jsx     # 全局认证状态
│       ├── hooks/
│       │   ├── use-toast.js        # Toast 通知 Hook
│       │   └── useWebSocket.js     # WS 连接 + 事件处理器
│       ├── components/
│       │   ├── Layout.jsx          # 应用外壳（导航栏、侧边栏）
│       │   ├── ProtectedRoute.jsx  # 认证守卫
│       │   ├── ShareLinkDialog.jsx # 分享链接创建对话框
│       │   ├── AddToCollectionDialog.jsx
│       │   ├── CookieBanner.jsx
│       │   ├── LanguageSelector.jsx
│       │   ├── RequireEmailDialog.jsx
│       │   ├── UserAvatar.jsx
│       │   └── ui/                 # shadcn/ui 基础组件
│       ├── pages/
│       │   ├── Upload.jsx          # 上传页面
│       │   ├── Gallery.jsx         # 文件相册
│       │   ├── FileView.jsx        # 文件详情视图
│       │   ├── Collections.jsx     # 集合概览
│       │   ├── CollectionView.jsx  # 单个集合
│       │   ├── ShareView.jsx       # 公开分享链接页面
│       │   ├── Settings.jsx        # 用户设置
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   ├── ForgotPassword.jsx
│       │   ├── ResetPassword.jsx
│       │   ├── Install.jsx         # 初始安装
│       │   ├── PrivacyPolicy.jsx
│       │   ├── TermsOfService.jsx
│       │   └── admin/
│       │       ├── Dashboard.jsx   # 管理员首页
│       │       ├── Users.jsx       # 用户管理
│       │       ├── Files.jsx       # 文件管理
│       │       ├── AuditLog.jsx    # 审计日志视图
│       │       ├── SiteSettings.jsx# 运营者设置
│       │       └── Import.jsx      # XBackBone 导入
│       ├── i18n/
│       │   ├── index.js            # i18next 配置
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
│           └── utils.js            # Tailwind 工具函数（cn()）
│
├── scripts/
│   ├── setup-db.js
│   ├── mongo-init.js               # MongoDB 初始化脚本
│   ├── migrate-uploads-to-user-folders.js
│   └── generate-missing-thumbnails.js
│
├── e2e/                            # Playwright 测试
│   ├── admin.spec.js
│   ├── bulk-actions-fixes.spec.js
│   ├── gallery.spec.js
│   ├── sharelink.spec.js
│   ├── tags.spec.js
│   ├── upload.spec.js
│   ├── helpers.js
│   └── global-setup.js
│
├── uploads/                        # 文件上传（运行时）
│   ├── .thumbnails/
│   ├── .avatars/
│   └── .chunks/                    # 临时分块
│
└── docs/assets/                    # 截图和 Logo
```

---

## 5. 配置与环境变量

所有变量均从 `.env` 文件加载（通过 `dotenv`）。`.env.example` 文件包含完整模板。

### 必填字段

| 变量 | 描述 |
|---|---|
| `SESSION_SECRET` | 会话加密密钥 — 长随机字符串，例如 `openssl rand -hex 32` |
| `MONGO_ROOT_PASSWORD` | MongoDB root 密码（仅 Docker Compose 需要） |
| `MONGO_APP_PASSWORD` | MongoDB 应用用户密码 |

### 所有环境变量

| 变量 | 默认值 | 描述 |
|---|---|---|
| `PORT` | `3000` | HTTP 服务器的 TCP 端口 |
| `MONGODB_URI` | _（由 Docker Compose 构建）_ | 完整的 MongoDB 连接 URI |
| `MONGO_ROOT_PASSWORD` | — | MongoDB root 密码 |
| `MONGO_APP_USER` | `appuser` | MongoDB 应用用户名 |
| `MONGO_APP_PASSWORD` | — | MongoDB 应用用户密码 |
| `MONGO_DB_NAME` | `sharely` | MongoDB 数据库名称 |
| `SESSION_SECRET` | — | **必填** — 会话加密密钥 |
| `BASE_URL` | `http://localhost:3000` | 生成分享链接的公开基础 URL（末尾不含 `/`） |
| `SITE_NAME` | `sharely` | Open Graph 嵌入中的站点名称 |
| `MAX_FILE_SIZE_MB` | `100` | 标准上传的最大文件大小（MB）（分块上传独立支持最大 2GB） |
| `ALLOW_REGISTRATION` | `true` | `false` 禁用公开注册 |
| `SMTP_HOST` | — | SMTP 服务器主机名；留空则禁用邮件功能 |
| `SMTP_PORT` | `587` | SMTP 端口 |
| `SMTP_SECURE` | `false` | 隐式 TLS（端口 465）填 `true`，STARTTLS 填 `false` |
| `SMTP_USER` | — | SMTP 用户名 |
| `SMTP_PASS` | — | SMTP 密码 |
| `SMTP_FROM` | _（SMTP_USER）_ | 外发邮件的发件人地址 |
| `UPLOAD_DIR` | `./uploads` | 上传目录的绝对路径 |
| `NODE_ENV` | — | `production` 启用安全 Cookie |

---

## 6. 数据模型

### User（`src/models/User.js`）

```
{
  username:                    String（3–32，唯一，字母数字 + _-）
  password:                    String（bcrypt，12 轮）
  role:                        'admin' | 'user'
  apiKey:                      String（遗留，迁移后为空）
  apiKeyHash:                  String（SHA-256，唯一，sparse）
  apiKeyPrefix:                String（明文的前 8 个字符）
  folderName:                  String（唯一，sparse，最大 64）
  avatarExt:                   String | null（.jpg/.png/.gif/.webp）
  embedMode:                   'embed' | 'raw'
  isActive:                    Boolean
  email:                       String（小写，唯一，sparse）
  emailVerified:               Boolean
  emailVerificationToken:      String | null（明文的 SHA-256 哈希）
  emailVerificationExpires:    Date | null
  passwordResetToken:          String | null（SHA-256 哈希）
  passwordResetExpires:        Date | null
  language:                    'en'|'de'|'fr'|'es'|'it'|'pt'|'ja'|'zh'
  predefinedTags:              [String]（最多 100 个标签 × 50 个字符）
  createdAt:                   Date
}
```

**重要方法：**
- `user.comparePassword(candidate)` — bcrypt 比较
- `user.regenerateApiKey()` — 生成新明文，存储哈希，返回明文（仅显示一次）
- `User.findByApiKey(plaintext)` — 通过 SHA-256 哈希查找，仅限活跃用户

### File（`src/models/File.js`）

```
{
  shortId:      String（8 个十六进制字符：6 位时间戳 + 2 位随机，唯一）
  deleteToken:  String（32 个十六进制字符，唯一）
  originalName: String（已净化）
  storedName:   String（相对路径："folderName/8hex.ext"）
  mimeType:     String
  size:         Number（字节）
  uploader:     ObjectId → User
  views:        Number
  tags:         [String]（最多 20 × 50 个字符）
  createdAt:    Date
}
```

**虚拟属性：**
- `sizeHuman` — 人类可读的大小（B / KB / MB / GB）
- `displayType` — 分类：`image|video|audio|pdf|code|text|file`

**Short ID 算法：**
```
shortId = hex(seconds_since_2024-01-01, 6 chars) + randomBytes(2).hex()
```

### Collection（`src/models/Collection.js`）

```
{
  shortId:     String（8 位十六进制，唯一）
  name:        String（最大 100）
  description: String（最大 500）
  owner:       ObjectId → User
  files:       [ObjectId → File]
  password:    String | null（bcrypt）
  expiresAt:   Date | null
  createdAt:   Date
}
```

> 过期的集合将在到期后 7 天由 MongoDB TTL 索引自动删除。

### ShareLink（`src/models/ShareLink.js`）

```
{
  token:         String（32 位十六进制，唯一）
  file:          ObjectId → File
  createdBy:     ObjectId → User
  label:         String（最大 100）
  password:      String | null（bcrypt）
  expiresAt:     Date | null
  downloadLimit: Number（-1 = 无限制）
  downloadCount: Number
  createdAt:     Date
}
```

> 与集合相同：通过 TTL 索引在过期后享有 7 天宽限期。

### SiteSettings（`src/models/SiteSettings.js`）

单例文档（`_id: 'singleton'`）：

```
{
  operatorName:        String
  operatorAddress:     String
  operatorEmail:       String
  cloudflareAnalytics: Boolean
  fileRetentionDays:   Number（0 = 禁用）
  encryptionAtRest:    Boolean
  sessionDurationDays: Number（默认：7）
  allowRegistration:   Boolean
}
```

### AuditLog（`src/models/AuditLog.js`）

```
{
  timestamp: Date（TTL 索引：90 天）
  userId:    ObjectId → User | null
  username:  String | null
  action:    String
  ip:        String | null
  meta:      Mixed（特定于操作的元数据）
}
```

---

## 7. REST API

### 基础 URL：`/api`

所有 JSON 端点均返回 `Content-Type: application/json`。错误格式：`{ "error": "消息" }`。

---

### 认证（`/api/auth`）

| 方法 | 路径 | 认证 | 描述 |
|---|---|---|---|
| `GET` | `/me` | 会话 | 当前登录用户 |
| `POST` | `/login` | — | 登录（限流：10 次/15 分钟） |
| `POST` | `/register` | — | 注册（限流，第一个用户成为管理员） |
| `POST` | `/logout` | — | 退出登录 |
| `GET` | `/smtp-enabled` | — | 检查 SMTP 是否已配置 |
| `GET` | `/verify-email?token=` | — | 验证邮箱地址 |
| `GET` | `/verify-reset-token?token=` | — | 验证重置令牌 |
| `POST` | `/forgot-password` | — | 发送密码重置邮件（限流：5 次/小时） |
| `POST` | `/reset-password` | — | 设置新密码 |

**登录请求：**
```json
POST /api/auth/login
{ "username": "max", "password": "meinPasswort123" }
```

**登录响应：**
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

### 文件上传

| 方法 | 路径 | 认证 | 描述 |
|---|---|---|---|
| `POST` | `/upload` | API 密钥 | ShareX 上传（`app.js` 中的遗留端点） |
| `POST` | `/api/upload` | API 密钥 | ShareX/API 上传（字段：`file`） |
| `POST` | `/api/web-upload` | 会话 | Web 上传（字段：`files[]`，最多 500） |
| `POST` | `/api/chunk/init` | 会话 | 初始化分块上传 |
| `POST` | `/api/chunk/:uploadId` | 会话 | 上传单个分块（字段：`chunk`） |
| `POST` | `/api/chunk/:uploadId/complete` | 会话 | 合并分块 |
| `DELETE` | `/api/chunk/:uploadId` | 会话 | 取消上传并清理 |

**API 上传响应：**
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

#### 分块上传流程

1. `POST /api/chunk/init` → `{ uploadId: "32hex" }`
2. `POST /api/chunk/:uploadId`（Body：`chunkIndex=N`，文件：`chunk`）→ `{ received: N }`  
   并行上传 3–5 个分块
3. `POST /api/chunk/:uploadId/complete` → `{ files: [fileObject] }`

---

### 文件管理

| 方法 | 路径 | 认证 | 描述 |
|---|---|---|---|
| `GET` | `/api/gallery` | 会话 | 自己的文件（管理员：所有文件），分页（24 个/页），筛选：`q`、`type`、`tag`、`page` |
| `GET` | `/api/file/:shortId` | — | 文件元数据（递增访问计数） |
| `PATCH` | `/api/file/:shortId` | 会话 | 更新标签/名称 |
| `DELETE` | `/api/file/:shortId` | 会话 | 删除文件 |
| `DELETE` | `/api/delete/:shortId` | API 密钥 | 删除文件（API 密钥认证） |
| `POST` | `/api/files/bulk` | 会话 | 批量操作：`delete`、`tag`、`removeTag`、`addToCollection`、`moveToCollection` |
| `GET` | `/api/tags` | 会话 | 用户的所有标签建议 |

**相册查询参数：**
- `q` — 在文件名中搜索（正则表达式安全）
- `type` — `all|image|video|audio|pdf|code`
- `tag` — 精确标签筛选
- `page` — 页码（默认：1）

---

### 用户设置

| 方法 | 路径 | 认证 | 描述 |
|---|---|---|---|
| `GET` | `/api/my-key` | 会话 | 显示 API 密钥前缀 |
| `POST` | `/api/regen-key` | 会话 | 重新生成 API 密钥 |
| `GET` | `/api/sharex-config` | 会话 | 下载 ShareX `.sxcu`（重新生成密钥） |
| `PATCH` | `/api/user/username` | 会话 | 修改用户名（需要密码） |
| `PATCH` | `/api/user/password` | 会话 | 修改密码 |
| `PATCH` | `/api/user/email` | 会话 | 修改邮箱（发送验证邮件） |
| `PATCH` | `/api/user/language` | 会话 | 设置界面语言 |
| `PATCH` | `/api/user/embed-mode` | 会话 | 设置嵌入模式（`embed`/`raw`） |
| `POST` | `/api/user/resend-verification` | 会话 | 重新发送验证邮件 |
| `GET` | `/api/user/export` | 会话 | 数据导出（GDPR 第 20 条），JSON 格式 |
| `DELETE` | `/api/user/account` | 会话 | 删除账户（GDPR 第 17 条，需要密码） |
| `GET` | `/api/user/predefined-tags` | 会话 | 获取预定义标签 |
| `PATCH` | `/api/user/predefined-tags` | 会话 | 更新预定义标签 |
| `POST` | `/api/user/avatar` | 会话 | 上传头像（最大 2MB，JPEG/PNG/GIF/WebP） |
| `DELETE` | `/api/user/avatar` | 会话 | 删除头像 |
| `GET` | `/api/user/avatar/:userId` | — | 提供头像服务 |

---

### 分享链接

| 方法 | 路径 | 认证 | 描述 |
|---|---|---|---|
| `GET` | `/api/file/:shortId/share-links` | 会话（所有者/管理员） | 文件的所有分享链接 |
| `POST` | `/api/file/:shortId/share-links` | 会话（所有者/管理员） | 创建分享链接 |
| `DELETE` | `/api/share-links/:token` | 会话（所有者/创建者/管理员） | 删除分享链接 |
| `GET` | `/api/share-links/:token` | — | 分享链接元数据（公开） |
| `POST` | `/api/share-links/:token/verify` | — | 验证分享链接密码 |

**创建分享链接：**
```json
POST /api/file/a1b2c3d4/share-links
{
  "label": "给同事用",
  "password": "密码",
  "expiresAt": "2025-12-31T23:59:59Z",
  "downloadLimit": 10
}
```

---

### 集合

| 方法 | 路径 | 认证 | 描述 |
|---|---|---|---|
| `GET` | `/api/collections` | 会话 | 自己的集合（管理员：所有集合） |
| `POST` | `/api/collections` | 会话 | 创建集合 |
| `GET` | `/api/collections/:id` | — | 查看集合（公开，设置了密码则需要输入） |
| `PATCH` | `/api/collections/:id` | 会话（所有者/管理员） | 更新集合 |
| `DELETE` | `/api/collections/:id` | 会话（所有者/管理员） | 删除集合 |
| `POST` | `/api/collections/:id/files` | 会话（所有者/管理员） | 向集合添加文件 |
| `DELETE` | `/api/collections/:id/files/:fileShortId` | 会话（所有者/管理员） | 从集合中移除文件 |
| `POST` | `/api/collections/:id/verify` | — | 验证集合密码 |

---

### 管理员端点

| 方法 | 路径 | 认证 | 描述 |
|---|---|---|---|
| `GET` | `/api/admin/stats` | 管理员 | 仪表板统计信息 |
| `GET` | `/api/admin/users` | 管理员 | 所有用户（含文件数量） |
| `POST` | `/api/admin/users` | 管理员 | 创建用户 |
| `PATCH` | `/api/admin/users/:id/toggle` | 管理员 | 启用/禁用用户 |
| `PATCH` | `/api/admin/users/:id/role` | 管理员 | 修改用户角色 |
| `DELETE` | `/api/admin/users/:id` | 管理员 | 删除用户 |
| `POST` | `/api/admin/users/:id/regen-key` | 管理员 | 重新生成 API 密钥 |
| `PATCH` | `/api/admin/users/:id/password` | 管理员 | 设置密码 |
| `PATCH` | `/api/admin/users/:id/folder` | 管理员 | 修改文件夹名称（移动文件） |
| `GET` | `/api/admin/files` | 管理员 | 所有文件，分页（30 个/页） |
| `GET` | `/api/admin/site-settings` | 管理员 | 读取运营者设置 |
| `PATCH` | `/api/admin/site-settings` | 管理员 | 更新运营者设置 |
| `GET` | `/api/admin/audit-log` | 管理员 | 分页审计日志（50 条/页） |
| `GET` | `/api/admin/audit-log/export` | 管理员 | 下载审计日志 CSV |
| `GET` | `/api/site-settings` | — | 运营者公开信息（用于隐私政策页面） |

---

### 站点设置（公开）

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

**连接：** `wss://example.com/ws`（仅限已登录用户，需要会话 Cookie）

### 协议

**客户端 → 服务器（请求）：**
```json
{ "id": "req-abc123", "action": "file:list", "payload": { "type": "image", "page": 1 } }
```

**服务器 → 客户端（响应）：**
```json
{ "id": "req-abc123", "data": { ... } }
```

**服务器 → 客户端（错误）：**
```json
{ "id": "req-abc123", "error": "Forbidden", "status": 403 }
```

**服务器 → 客户端（广播）：**
```json
{ "event": "file:uploaded", "data": { "shortId": "a1b2c3d4", "uploaderId": "..." } }
```

### 可用操作

| 操作 | 认证 | 描述 |
|---|---|---|
| `site-settings:get` | — | 站点公开设置 |
| `auth:me` | 用户 | 当前用户数据 |
| `file:get` | 用户 | 文件详情（递增访问次数） |
| `file:list` | 用户 | 带筛选/分页的文件列表 |
| `file:delete` | 用户 | 删除文件 |
| `user:get-key` | 用户 | API 密钥前缀 |
| `user:regen-key` | 用户 | 重新生成 API 密钥 |
| `user:change-password` | 用户 | 修改密码 |
| `user:change-username` | 用户 | 修改用户名 |
| `user:change-email` | 用户 | 修改邮箱 |
| `user:change-language` | 用户 | 设置语言 |
| `user:change-embed-mode` | 用户 | 设置嵌入模式 |
| `user:resend-verification` | 用户 | 重新发送验证邮件 |
| `user:export` | 用户 | 数据导出 |
| `user:delete-account` | 用户 | 删除账户 |
| `admin:stats` | 管理员 | 仪表板统计信息 |
| `admin:settings:get` | 管理员 | 读取站点设置 |
| `admin:settings:update` | 管理员 | 更新站点设置 |
| `admin:users:list` | 管理员 | 所有用户 |
| `admin:users:create` | 管理员 | 创建用户 |
| `admin:users:toggle` | 管理员 | 启用/禁用用户 |
| `admin:users:role` | 管理员 | 修改用户角色 |
| `admin:users:delete` | 管理员 | 删除用户 |
| `admin:users:regen-key` | 管理员 | 重新生成 API 密钥 |
| `admin:users:password` | 管理员 | 设置密码 |
| `admin:users:folder` | 管理员 | 修改文件夹名称 |
| `admin:files:list` | 管理员 | 所有文件 |
| `admin:audit-log:list` | 管理员 | 分页审计日志 |

### 广播事件

| 事件 | 接收者 | 负载 |
|---|---|---|
| `file:uploaded` | 上传者 | `{ shortId, uploaderId }` |
| `file:deleted` | 文件所有者 | `{ shortId, uploaderId }` |
| `file:view` | 所有人 | `{ shortId, views }` |
| `user:created` | 管理员 | `{ id, username, role, ... }` |
| `user:deleted` | 管理员 | `{ id }` |
| `user:updated` | 管理员 | `{ id, ...已更改字段 }` |
| `audit:log` | 管理员 | 完整的 AuditLog 对象 |
| `settings:updated` | 管理员 | 更新后的 SiteSettings 对象 |
| `stats:invalidate` | 管理员 | `{}`（触发统计刷新） |

---

## 9. 文件服务路由

### `/f/:shortId` — 文件查看器

- **浏览器请求：** 转发到 React SPA（`index.html`）— SPA 渲染查看器。
- **社交媒体机器人**（Discord、Telegram、Twitter 等）：返回带有 Open Graph / Twitter Card 元标签的最小 HTML 页面。
  - `embedMode = 'embed'`：带重定向的 OG HTML
  - `embedMode = 'raw'` + 图片/视频/音频：HTTP 302 → `/f/:shortId/raw`

### `/f/:shortId/raw` — 直接访问

以 HTTP 响应的形式提供文件，支持 Range 请求（206 Partial Content）。图片/视频/音频：`Content-Disposition: inline`，其他：`attachment`。

### `/f/:shortId/download` — 强制下载

与 `/raw` 相同，但始终使用 `Content-Disposition: attachment`。

### `/f/:shortId/thumb` — 缩略图

返回 JPEG 缩略图（适用于视频和 PDF）。`Cache-Control: public, max-age=86400`。

### `/f/:shortId/delete/:token` — ShareX 删除

通过唯一删除令牌无需会话即可删除文件。

### `/s/:token` — 分享链接文件服务（`src/routes/shares.js`）

验证密码（通过会话标志）、过期日期和下载限制，然后提供文件。

---

## 10. 身份验证与安全

### 会话认证

- 带 MongoDB 存储的 Express 会话（`connect-mongo`）
- 会话 Cookie：`httpOnly: true`、`sameSite: 'strict'`，生产环境下 `secure: true`
- 会话时长：通过 `SiteSettings.sessionDurationDays` 配置（默认：7 天），实时缓存 60 秒

### API 密钥认证

- API 密钥以 SHA-256 哈希形式存储，从不以明文存储
- 前 8 个字符作为 `apiKeyPrefix` 存储（用于展示）
- 查找：`User.findByApiKey(plaintext)` 计算哈希并在 `apiKeyHash` 中搜索
- 下载 ShareX 配置时密钥会被重新生成 — 明文仅在那一刻可见

### 中间件链（`src/middleware/auth.js`）

```
requireLogin    → 检查 req.session.user → 未登录返回 401
requireAdmin    → 类似 requireLogin，额外要求 role === 'admin' → 403
requireApiKey   → 检查 Authorization 请求头或 req.body.token
```

### CSRF 防护

`app.js` 中的 `requireSameOrigin()` 对所有 API 路由比较 `Origin` 请求头与 `Host` 请求头。配合 `sameSite: 'strict'` Cookie 共同防护。

### 内容安全策略

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
media-src 'self' blob:;
connect-src 'self' https://cloudflareinsights.com;
frame-ancestors 'self';
```

### 安全响应头

- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`

### 限流

| 端点 | 限制 | 时间窗口 |
|---|---|---|
| 上传（`/upload`、`/api/upload`、`/api/web-upload`） | 60 次请求 | 15 分钟 |
| 认证（`/api/auth/login`、`/register` 等） | 10 次请求 | 15 分钟 |
| 密码重置 | 5 次请求 | 1 小时 |

### 文件黑名单

以下 MIME 类型和扩展名在上传时将被拒绝：

**被阻止的 MIME 类型：** `application/x-executable`、`application/x-sh`、`application/x-csh`、`application/x-bat`

**被阻止的扩展名：** `.bat`、`.cmd`、`.com`、`.ps1`、`.psm1`、`.psd1`、`.sh`、`.bash`、`.csh`、`.zsh`、`.fish`、`.vbs`、`.vbe`、`.jse`、`.scr`、`.pif`、`.application`、`.gadget`、`.hta`、`.php`、`.php3–5`、`.phtml`、`.asp`、`.aspx`、`.jsp`、`.jspx`、`.cfm`

### 路径遍历防护

所有通过 `resolveUploadPath()` 的文件访问都会验证解析路径是否位于 `UPLOAD_DIR` 内。

---

## 11. 上传系统

### 标准上传（Multer）

- **存储方式：** `multer.diskStorage` → `uploads/{folderName}/{8hex}{.ext}`
- **文件名：** `crypto.randomBytes(4).hex() + 原始扩展名`
- **限制：** `MAX_FILE_SIZE_MB`（默认：100 MB）
- **存储位置：** 用户专属文件夹（`user.folderName`）

### 分块上传（>250 MB）

前端客户端会自动为大文件切换到分块模式。

**服务器端目录结构：**
```
uploads/.chunks/{uploadId}/
  meta.json          { filename, mimeType, totalSize, totalChunks, userId, createdAt }
  chunk-0
  chunk-1
  ...
  chunk-N
```

**分块大小：** 10–20 MB（向后兼容最多接受 51 MB）  
**并发数：** 3–5 个分块同时上传  
**合并方式：** 基于流（不在 RAM 中完全加载）

### 头像上传

- **存储方式：** `multer.memoryStorage()`（无磁盘缓冲）
- **存储位置：** `uploads/.avatars/{userId}{.ext}`
- **限制：** 2 MB
- **格式：** JPEG、PNG、GIF、WebP

---

## 12. 缩略图生成

缩略图在上传后异步生成（`.catch(() => {})` — 错误会被静默忽略）。

### 视频缩略图（ffmpeg）

```bash
ffmpeg -y -i <file> -ss 00:00:01 -vframes 1 \
  -vf "scale=320:320:force_original_aspect_ratio=increase,crop=320:320" \
  -q:v 3 uploads/.thumbnails/<shortId>.jpg
```

### PDF 缩略图（Ghostscript）

```bash
gs -dNOPAUSE -dBATCH -dSAFER \
  -sDEVICE=jpeg -dFirstPage=1 -dLastPage=1 \
  -r72 -dJPEGQ=85 \
  -sOutputFile=uploads/.thumbnails/<shortId>.jpg \
  <file>
```

**超时：** 每次缩略图生成 30 秒  
**回退：** 如果 ffmpeg/ghostscript 不可用，生成将静默跳过。

### 补充生成脚本

```bash
npm run migrate:thumbnails
# 或在容器中：
docker exec -it <container> npm run migrate:thumbnails
```

---

## 13. 邮件与 SMTP

### 配置

设置 `SMTP_HOST` 后 SMTP 即被激活。`mailer.isConfigured()` 检查该值。

### 邮件模板

所有邮件均以用户的语言发送（8 种语言）。模板内嵌于 `src/utils/mailer.js`。

**发送的邮件类型：**

| 类型 | 触发器 | 令牌有效期 |
|---|---|---|
| 邮箱验证 | 注册、修改邮箱 | 24 小时 |
| 密码重置 | `POST /api/auth/forgot-password` | 1 小时 |

### 令牌安全

- 令牌：`crypto.randomBytes(32).hex()`（64 个十六进制字符）
- 存储形式：令牌的 SHA-256 哈希
- 邮件中包含明文令牌作为 URL 参数
- 验证方式：将收到令牌的哈希与存储的哈希进行比较

---

## 14. 国际化

**库：** i18next + react-i18next + i18next-browser-languagedetector

**支持的语言：**

| 代码 | 语言 |
|---|---|
| `en` | English |
| `de` | Deutsch |
| `fr` | Français |
| `es` | Español |
| `it` | Italiano |
| `pt` | Português |
| `ja` | 日本語 |
| `zh` | 中文 |

**语言选择：**
1. 浏览器语言检测（自动）
2. 数据库中的用户偏好（`user.language`）
3. 通过 `PATCH /api/user/language` 持久化

翻译文件：`client/src/i18n/locales/{code}.json`

---

## 15. 前端（React SPA）

### 路由配置（`client/src/App.jsx`）

| 路由 | 组件 | 认证 |
|---|---|---|
| `/` | 重定向 → `/gallery` | 否 |
| `/auth/login` | Login.jsx | 否 |
| `/auth/register` | Register.jsx | 否 |
| `/auth/forgot-password` | ForgotPassword.jsx | 否 |
| `/auth/reset-password` | ResetPassword.jsx | 否 |
| `/install` | Install.jsx | 否 |
| `/upload` | Upload.jsx | **是** |
| `/gallery` | Gallery.jsx | **是** |
| `/f/:shortId` | FileView.jsx | **是** |
| `/collections` | Collections.jsx | **是** |
| `/c/:id` | CollectionView.jsx | 否（公开） |
| `/s/:token` | ShareView.jsx | 否（公开） |
| `/settings` | Settings.jsx | **是** |
| `/admin` | Dashboard.jsx | **管理员** |
| `/admin/users` | Users.jsx | **管理员** |
| `/admin/files` | Files.jsx | **管理员** |
| `/admin/audit-log` | AuditLog.jsx | **管理员** |
| `/admin/site-settings` | SiteSettings.jsx | **管理员** |
| `/admin/import` | Import.jsx | **管理员** |
| `/privacy` | PrivacyPolicy.jsx | 否 |
| `/terms` | TermsOfService.jsx | 否 |

### 认证上下文（`client/src/context/AuthContext.jsx`）

已登录用户的全局状态。应用启动时通过 `GET /api/auth/me` 初始化。

### WebSocket Hook（`client/src/hooks/useWebSocket.js`）

管理持久化的 WS 连接。提供 `sendMessage()` 和事件处理器注册。连接断开时的重连逻辑。

### UI 组件

基于 **shadcn/ui**（Radix UI Primitives + Tailwind CSS）：

- `Dialog`、`AlertDialog`、`DropdownMenu`、`ContextMenu`、`Popover`
- `Select`、`Checkbox`、`Input`、`Textarea`、`Label`
- `Card`、`Badge`、`Button`、`Separator`、`Tabs`、`Table`
- `Toast` / `Toaster` 用于通知
- `Calendar` / `DateTimePicker` 用于选择过期日期
- `Pagination` 用于分页列表
- `ScrollArea`、`Tooltip`

---

## 16. 管理后台

管理后台（`/admin/*`）仅限 `role: 'admin'` 的用户访问。

### 仪表板（`/admin`）

- 用户总数、文件数、存储使用量
- 最近上传的 10 个文件
- 通过 WebSocket 实时更新（`stats:invalidate`）

### 用户管理（`/admin/users`）

- 所有用户及其文件数量和存储使用量
- 创建用户、启用/禁用、修改角色
- 重置密码、重新生成 API 密钥
- 修改文件夹名称（物理文件在服务器上移动）
- 删除用户（所有文件将被删除）

### 文件管理（`/admin/files`）

- 所有用户的所有文件，分页显示
- 按文件名搜索
- 删除文件

### 审计日志（`/admin/audit-log`）

- 所有操作的分页日志（50 条/页）
- 按用户名和操作类型筛选
- CSV 导出（用于合规目的）

### 站点设置（`/admin/site-settings`）

- 运营者信息（名称、地址、邮箱）
- 启用 Cloudflare Analytics
- 文件保留时长
- 会话时长
- 启用/禁用用户注册

### XBackBone 导入（`/admin/import`）

- 从 XBackBone SQLite 数据库预览并导入
- 按用户名匹配用户
- 幂等性（已导入的文件将被跳过）

---

## 17. GDPR / 隐私保护

| 功能 | GDPR 条款 |
|---|---|
| 隐私政策（可配置） | 第 13/14 条 – 透明度 |
| 服务条款页面（可配置） | 第 13/14 条 – 透明度 |
| 数据导出（含 URL 的 JSON） | 第 20 条 – 数据可携带性 |
| 账户自删除（文件+数据） | 第 17 条 – 删除权 |
| 审计日志（通过 MongoDB TTL 保留 90 天） | 第 5(2) 条 – 问责制 |
| 审计日志 CSV 导出 | 第 5(2) 条 – 问责制 |
| 可配置的文件保留期 | 第 5(1)(e) 条 – 存储限制 |
| API 密钥以 SHA-256 哈希形式存储 | 第 32 条 – 安全性 |
| 密码以 bcrypt（12 轮）形式存储 | 第 32 条 – 安全性 |
| Cloudflare Analytics 的 Cookie 同意 | 第 13 条 – 透明度 |
| 账户删除时匿名化 | 第 17 条 – 删除权 |

### GDPR 删除流程

删除账户时（`user:delete-account` / `DELETE /api/user/account`）：
1. 用户的所有文件从磁盘删除
2. 缩略图被删除
3. 头像被删除
4. 审计日志条目被匿名化（`username: '[deleted]'`、`ip: null`、`userId: null`）
5. 用户文档被删除
6. 会话被销毁

---

## 18. 后台任务

### 保留期清理（`src/jobs/retentionCleanup.js`）

- **执行时机：** 启动时以及之后每天执行（`setInterval(runRetentionCleanup, 24h)`）
- **操作：** 若 `SiteSettings.fileRetentionDays > 0`，则删除超过该天数的文件
- 删除内容：磁盘上的文件、缩略图、MongoDB 文档
- 向管理员广播 `stats:invalidate`

### MongoDB TTL 索引（自动）

| 集合 | TTL | 触发字段 |
|---|---|---|
| `AuditLog` | 90 天 | `timestamp` |
| `Collection` | `expiresAt` 后 7 天 | `expiresAt` |
| `ShareLink` | `expiresAt` 后 7 天 | `expiresAt` |

---

## 19. 部署

### Docker（推荐）

```bash
git clone https://github.com/Christianoooooo/sharely.git
cd sharely
cp .env.example .env
# 编辑 .env（SESSION_SECRET、MONGO 密码、BASE_URL）
docker compose up -d
```

**服务：**
- `app` — Node.js 应用（端口 3000）
- `mongo` — MongoDB 7（端口 127.0.0.1:27017，外部不可访问）

**数据卷：**
- `uploads` — 持久文件存储
- `mongo_data` — MongoDB 数据

**健康检查：** 应用检查 `/` 是否返回 HTTP 200，MongoDB 检查 `db.adminCommand('ping')`。

### Nginx 反向代理

```nginx
server {
    listen 443 ssl;
    server_name files.example.com;

    client_max_body_size 2100M;  # 至少要大于最大分块大小加缓冲

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

> `.env` 中的 `BASE_URL` 必须与公开域名一致。

### 首次启动

第一个注册的用户将自动获得 `admin` 角色（`User.countDocuments() === 0`）。

---

## 20. 开发环境

### 前提条件

- Node.js ≥ 18
- MongoDB（本地或通过 Docker）
- 可选：ffmpeg、ghostscript（用于缩略图）

### 搭建环境

```bash
# 后端
npm install
cp .env.example .env
# 编辑 .env

# 前端
cd client
npm install
```

### 启动

```bash
# 后端（端口 3000，使用 nodemon）
npm run dev

# 前端（端口 5173，另开终端）
cd client
npm run dev
```

Vite 开发服务器会自动将 API 请求代理到 `localhost:3000`。

### 构建

```bash
npm run build   # 构建 client/dist/，后端不变
npm start       # 启动生产环境 Express 服务器
```

---

## 21. 迁移与脚本

### 自动迁移（每次启动时）

这些迁移在 `app.js` 启动时运行，具有幂等性：

| 迁移 | 文件 | 功能 |
|---|---|---|
| 用户文件夹迁移 | `src/migrations/migrateUserFolders.js` | 将文件从 `uploads/` 移动到 `uploads/{folderName}/` |
| API 密钥哈希迁移 | `src/migrations/migrateApiKeyHashes.js` | 将明文 API 密钥转换为 SHA-256 哈希 |

### 手动脚本

```bash
# 为已有文件生成缩略图
npm run migrate:thumbnails
# 或：
node scripts/generate-missing-thumbnails.js

# 将上传文件移动到用户文件夹（手动）
npm run migrate:user-folders
# 或：
node scripts/migrate-uploads-to-user-folders.js
```

### 数据库初始化（Docker）

`scripts/mongo-init.js` 在 MongoDB 容器首次启动时执行，以正确权限创建应用用户。

---

## 22. 端到端测试

**框架：** Playwright（`@playwright/test`）

### 测试文件

| 文件 | 测试套件 |
|---|---|
| `e2e/upload.spec.js` | 上传流程 |
| `e2e/gallery.spec.js` | 相册与文件管理 |
| `e2e/admin.spec.js` | 管理后台 |
| `e2e/sharelink.spec.js` | 分享链接的创建与使用 |
| `e2e/tags.spec.js` | 标签管理 |
| `e2e/bulk-actions-fixes.spec.js` | 批量操作 |

### 运行测试

```bash
# 所有测试
npm run test:e2e

# 带 UI 界面
npm run test:e2e:ui
```

**Playwright 配置：** `playwright.config.js`  
**全局初始化：** `e2e/global-setup.js`（创建测试用户、管理员等）  
**辅助函数：** `e2e/helpers.js`（共享辅助函数）

---

## 附录：审计日志操作列表

| 操作 | 触发器 |
|---|---|
| `login` | 登录成功 |
| `logout` | 退出登录 |
| `register` | 注册 |
| `upload` | 文件上传 |
| `delete_file` | 文件已删除 |
| `delete_account` | 账户已删除 |
| `change_password` | 密码已修改 |
| `change_username` | 用户名已修改 |
| `change_email` | 邮箱已修改 |
| `verify_email` | 邮箱已验证 |
| `forgot_password` | 密码重置请求 |
| `reset_password` | 密码已重置 |
| `regen_api_key` | API 密钥已重新生成 |
| `sharex_config` | ShareX 配置已下载 |
| `export_data` | 数据导出 |
| `admin_create_user` | 管理员：用户已创建 |
| `admin_delete_user` | 管理员：用户已删除 |
| `admin_toggle_user` | 管理员：用户已启用/禁用 |
| `admin_change_role` | 管理员：用户角色已修改 |
| `admin_change_password` | 管理员：密码已设置 |
| `admin_regen_key` | 管理员：API 密钥已重新生成 |

---

*本文档由 sharely v1.0.0 源代码生成*
