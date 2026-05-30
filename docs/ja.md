# Sharely — 技術ドキュメント

> **バージョン:** 1.0.0 · **ライセンス:** MIT · **Node.js:** ≥ 18

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [アーキテクチャ](#2-アーキテクチャ)
3. [技術スタック](#3-技術スタック)
4. [ディレクトリ構造](#4-ディレクトリ構造)
5. [設定と環境変数](#5-設定と環境変数)
6. [データモデル](#6-データモデル)
7. [REST API](#7-rest-api)
8. [WebSocket API](#8-websocket-api)
9. [ファイル配信ルート](#9-ファイル配信ルート)
10. [認証とセキュリティ](#10-認証とセキュリティ)
11. [アップロードシステム](#11-アップロードシステム)
12. [サムネイル生成](#12-サムネイル生成)
13. [メールとSMTP](#13-メールとsmtp)
14. [国際化](#14-国際化)
15. [フロントエンド（React SPA）](#15-フロントエンドreact-spa)
16. [管理ダッシュボード](#16-管理ダッシュボード)
17. [GDPR / プライバシー](#17-gdpr--プライバシー)
18. [バックグラウンドジョブ](#18-バックグラウンドジョブ)
19. [デプロイ](#19-デプロイ)
20. [開発環境](#20-開発環境)
21. [マイグレーションとスクリプト](#21-マイグレーションとスクリプト)
22. [エンドツーエンドテスト](#22-エンドツーエンドテスト)

---

## 1. プロジェクト概要

Sharelyは、クリーンなWebインターフェース、ShareX連携、APIアクセスを備えた**セルフホスト型ファイル共有プラットフォーム**です。ユーザーはスクリーンショット、ファイル、メディアをアップロードし、短縮リンクで即座に共有できます。

### 主要機能

| 機能 | 説明 |
|---|---|
| Webアップロード | ドラッグ＆ドロップ、最大500ファイルを同時にアップロード可能 |
| チャンクアップロード | 並列マルチパートアップロードで最大2GBのファイルに対応 |
| ShareX連携 | ワンクリックで`.sxcu`設定ファイルをダウンロード |
| APIアップロード | Bearerトークン認証、curl/wget互換 |
| ファイルビューア | 画像ズーム、動画・音声ストリーミング（HTTP Range）、PDFインライン表示、コードのシンタックスハイライト |
| 埋め込みモード | *embed*（OG/Twitter Card HTML）または*raw*（直接リダイレクト） |
| サムネイル | 動画（ffmpeg）とPDF（ghostscript）の自動JPEGプレビュー生成 |
| コレクション | パスワードと有効期限を設定可能なファイルグループ |
| 共有リンク | パスワード、有効期限、ダウンロード制限付きのファイル別リンク |
| リアルタイムUI | WebSocketベースのライブ更新（アップロード、削除、閲覧カウンター、管理統計） |
| 多言語対応 | 8言語：EN, DE, FR, ES, IT, PT, JA, ZH |
| 管理ダッシュボード | 統計、ユーザー管理、ファイル管理、監査ログ（CSVエクスポート） |
| GDPRコンプライアンス | EU GDPRに準拠したプライバシー機能（第17、20、32条など） |
| XBackBoneインポート | 既存のXBackBoneインストールの移行 |
| Docker対応 | `docker compose up -d`で完全な環境を起動 |

---

## 2. アーキテクチャ

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

### データフロー：標準アップロード

```
Browser → POST /api/web-upload (multipart/form-data)
       → multer: Datei in uploads/{folderName}/
       → File.createUnique() → MongoDB
       → generateThumbnail() (async, non-blocking)
       → logAudit()
       → broadcast('file:uploaded') via WebSocket
       ← JSON: { files: [...] }
```

### データフロー：ShareXアップロード

```
ShareX → POST /upload (token im Formular-Body)
       → multer: Datei temporär in uploads/
       → requireApiKey: Token-Lookup → User
       → fs.renameSync → uploads/{folderName}/
       → File.create() → MongoDB
       ← JSON: { url, delete_url }
```

---

## 3. 技術スタック

| レイヤー | 技術 | バージョン |
|---|---|---|
| **ランタイム** | Node.js | ≥ 18 |
| **バックエンドフレームワーク** | Express.js | 4.x |
| **データベース** | MongoDB + Mongoose | Mongo 7, Mongoose 8.x |
| **セッション** | express-session + connect-mongo | — |
| **リアルタイム** | WebSocket (`ws`) | 8.x |
| **ファイルアップロード** | Multer | 1.x |
| **メール** | Nodemailer | 8.x |
| **パスワードハッシュ** | bcryptjs | 2.x (12ラウンド) |
| **APIキーハッシュ** | SHA-256 (Node Crypto) | — |
| **レート制限** | express-rate-limit | 8.x |
| **XBackBoneインポート** | sql.js | 1.x |
| **フロントエンドフレームワーク** | React 18 | 18.3.x |
| **ルーティング（フロントエンド）** | React Router v6 | 6.x |
| **ビルドツール** | Vite | 6.x |
| **スタイリング** | Tailwind CSS + Radix UI | 3.x |
| **UIコンポーネント** | shadcn/ui (Radix primitives) | — |
| **アイコン** | FontAwesome | 6.x |
| **i18n** | i18next + react-i18next | — |
| **シンタックスハイライト** | highlight.js | 11.x |
| **コンテナ** | Docker + Docker Compose | — |
| **テスト** | Playwright (E2E) | 1.60.x |

---

## 4. ディレクトリ構造

```
sharely/
├── app.js                          # Expressエントリーポイント、起動シーケンス
├── package.json
├── .env.example                    # 全環境変数のテンプレート
├── Dockerfile
├── docker-compose.yml
│
├── src/
│   ├── config/
│   │   └── db.js                   # MongoDB接続（Mongoose）
│   ├── middleware/
│   │   ├── auth.js                 # requireLogin / requireAdmin / requireApiKey
│   │   └── upload.js               # Multer設定、ブロックリスト
│   ├── models/
│   │   ├── AuditLog.js             # 監査イベント（TTL 90日）
│   │   ├── Collection.js           # ファイルコレクション
│   │   ├── File.js                 # ファイルメタデータ
│   │   ├── ShareLink.js            # ファイル別共有リンク
│   │   ├── SiteSettings.js         # シングルトン：運営者設定
│   │   └── User.js                 # ユーザーアカウント + APIキー
│   ├── routes/
│   │   ├── api.js                  # メインAPI（アップロード、ギャラリー、管理者など）
│   │   ├── auth.js                 # ログイン / 登録 / パスワードリセット
│   │   ├── files.js                # ファイル配信、OG埋め込み、レンジリクエスト
│   │   ├── import.js               # XBackBone移行
│   │   ├── install.js              # 初期インストールエンドポイント
│   │   └── shares.js               # 共有リンクファイル配信
│   ├── jobs/
│   │   └── retentionCleanup.js     # 期限切れファイルの日次削除
│   ├── migrations/
│   │   ├── migrateApiKeyHashes.js  # 一回限り：平文 → SHA-256ハッシュ
│   │   └── migrateUserFolders.js   # 一回限り：ユーザーフォルダへのファイル移動
│   ├── utils/
│   │   ├── audit.js                # logAudit()ヘルパー関数
│   │   ├── generateThumbnail.js    # ffmpeg / ghostscript統合
│   │   ├── mailer.js               # Nodemailerラッパー + i18nメールテンプレート
│   │   └── sanitizeFilename.js     # ファイル名サニタイゼーション
│   └── ws.js                       # WebSocketサーバー + アクションディスパッチャー
│
├── client/                         # Reactフロントエンド
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx                # Reactエントリーポイント
│       ├── App.jsx                 # ルーター設定
│       ├── index.css               # グローバルスタイル
│       ├── context/
│       │   └── AuthContext.jsx     # グローバル認証状態
│       ├── hooks/
│       │   ├── use-toast.js        # トースト通知フック
│       │   └── useWebSocket.js     # WS接続 + イベントハンドラー
│       ├── components/
│       │   ├── Layout.jsx          # アプリシェル（ナビバー、サイドバー）
│       │   ├── ProtectedRoute.jsx  # 認証ガード
│       │   ├── ShareLinkDialog.jsx # 共有リンク作成ダイアログ
│       │   ├── AddToCollectionDialog.jsx
│       │   ├── CookieBanner.jsx
│       │   ├── LanguageSelector.jsx
│       │   ├── RequireEmailDialog.jsx
│       │   ├── UserAvatar.jsx
│       │   └── ui/                 # shadcn/ui基底コンポーネント
│       ├── pages/
│       │   ├── Upload.jsx          # アップロードページ
│       │   ├── Gallery.jsx         # ファイルギャラリー
│       │   ├── FileView.jsx        # ファイル詳細ビュー
│       │   ├── Collections.jsx     # コレクション一覧
│       │   ├── CollectionView.jsx  # 個別コレクション
│       │   ├── ShareView.jsx       # 公開共有リンクページ
│       │   ├── Settings.jsx        # ユーザー設定
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   ├── ForgotPassword.jsx
│       │   ├── ResetPassword.jsx
│       │   ├── Install.jsx         # 初期インストール
│       │   ├── PrivacyPolicy.jsx
│       │   ├── TermsOfService.jsx
│       │   └── admin/
│       │       ├── Dashboard.jsx   # 管理者ホームページ
│       │       ├── Users.jsx       # ユーザー管理
│       │       ├── Files.jsx       # ファイル管理
│       │       ├── AuditLog.jsx    # 監査ログビュー
│       │       ├── SiteSettings.jsx# 運営者設定
│       │       └── Import.jsx      # XBackBoneインポート
│       ├── i18n/
│       │   ├── index.js            # i18next設定
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
│           └── utils.js            # Tailwindヘルパー（cn()）
│
├── scripts/
│   ├── setup-db.js
│   ├── mongo-init.js               # MongoDB初期化スクリプト
│   ├── migrate-uploads-to-user-folders.js
│   └── generate-missing-thumbnails.js
│
├── e2e/                            # Playwrightテスト
│   ├── admin.spec.js
│   ├── bulk-actions-fixes.spec.js
│   ├── gallery.spec.js
│   ├── sharelink.spec.js
│   ├── tags.spec.js
│   ├── upload.spec.js
│   ├── helpers.js
│   └── global-setup.js
│
├── uploads/                        # ファイルアップロード（ランタイム）
│   ├── .thumbnails/
│   ├── .avatars/
│   └── .chunks/                    # 一時チャンク
│
└── docs/assets/                    # スクリーンショットとロゴ
```

---

## 5. 設定と環境変数

すべての変数は`.env`から（`dotenv`経由で）読み込まれます。`.env.example`ファイルには完全なテンプレートが含まれています。

### 必須フィールド

| 変数 | 説明 |
|---|---|
| `SESSION_SECRET` | セッション暗号化のシークレット — 長いランダム文字列、例：`openssl rand -hex 32` |
| `MONGO_ROOT_PASSWORD` | MongoDBルートパスワード（Docker Composeのみ必要） |
| `MONGO_APP_PASSWORD` | MongoDBアプリケーションユーザーパスワード |

### 全環境変数

| 変数 | デフォルト | 説明 |
|---|---|---|
| `PORT` | `3000` | HTTPサーバーのTCPポート |
| `MONGODB_URI` | _（Docker Composeから構築）_ | 完全なMongoDB接続URI |
| `MONGO_ROOT_PASSWORD` | — | MongoDBルートパスワード |
| `MONGO_APP_USER` | `appuser` | MongoDBアプリケーションユーザー名 |
| `MONGO_APP_PASSWORD` | — | MongoDBアプリケーションユーザーパスワード |
| `MONGO_DB_NAME` | `sharely` | MongoDBデータベース名 |
| `SESSION_SECRET` | — | **必須** — セッション暗号化シークレット |
| `BASE_URL` | `http://localhost:3000` | 生成される共有リンクの公開ベースURL（末尾の`/`なし） |
| `SITE_NAME` | `sharely` | Open Graph埋め込みのサイト名 |
| `MAX_FILE_SIZE_MB` | `100` | 標準アップロードの最大ファイルサイズ（MB）（チャンクアップロードは最大2GBまで独立して対応） |
| `ALLOW_REGISTRATION` | `true` | `false`で公開登録を無効化 |
| `SMTP_HOST` | — | SMTPサーバーのホスト名；空欄でメール機能を無効化 |
| `SMTP_PORT` | `587` | SMTPポート |
| `SMTP_SECURE` | `false` | 暗黙的TLS（ポート465）なら`true`、STARTTLSなら`false` |
| `SMTP_USER` | — | SMTPユーザー名 |
| `SMTP_PASS` | — | SMTPパスワード |
| `SMTP_FROM` | _（SMTP_USER）_ | 送信メールの差出人アドレス |
| `UPLOAD_DIR` | `./uploads` | アップロードディレクトリの絶対パス |
| `NODE_ENV` | — | `production`でセキュアCookieを有効化 |

---

## 6. データモデル

### User（`src/models/User.js`）

```
{
  username:                    String (3–32、ユニーク、英数字 + _-)
  password:                    String (bcrypt、12ラウンド)
  role:                        'admin' | 'user'
  apiKey:                      String (レガシー、移行後は空)
  apiKeyHash:                  String (SHA-256、ユニーク、sparse)
  apiKeyPrefix:                String (平文の最初の8文字)
  folderName:                  String (ユニーク、sparse、最大64)
  avatarExt:                   String | null (.jpg/.png/.gif/.webp)
  embedMode:                   'embed' | 'raw'
  isActive:                    Boolean
  email:                       String (小文字、ユニーク、sparse)
  emailVerified:               Boolean
  emailVerificationToken:      String | null (平文のSHA-256ハッシュ)
  emailVerificationExpires:    Date | null
  passwordResetToken:          String | null (SHA-256ハッシュ)
  passwordResetExpires:        Date | null
  language:                    'en'|'de'|'fr'|'es'|'it'|'pt'|'ja'|'zh'
  predefinedTags:              [String] (最大100タグ × 50文字)
  createdAt:                   Date
}
```

**重要なメソッド：**
- `user.comparePassword(candidate)` — bcrypt比較
- `user.regenerateApiKey()` — 新しい平文を生成し、ハッシュを保存し、平文を返す（一度のみ表示）
- `User.findByApiKey(plaintext)` — SHA-256ハッシュで検索、アクティブユーザーのみ

### File（`src/models/File.js`）

```
{
  shortId:      String (16進数8文字：タイムスタンプ6文字 + ランダム2文字、ユニーク)
  deleteToken:  String (16進数32文字、ユニーク)
  originalName: String (サニタイズ済み)
  storedName:   String (相対パス："folderName/8hex.ext")
  mimeType:     String
  size:         Number (バイト)
  uploader:     ObjectId → User
  views:        Number
  tags:         [String] (最大20 × 50文字)
  createdAt:    Date
}
```

**仮想プロパティ：**
- `sizeHuman` — 人間が読めるサイズ（B / KB / MB / GB）
- `displayType` — 分類：`image|video|audio|pdf|code|text|file`

**Short IDアルゴリズム：**
```
shortId = hex(seconds_since_2024-01-01, 6 chars) + randomBytes(2).hex()
```

### Collection（`src/models/Collection.js`）

```
{
  shortId:     String (16進数8文字、ユニーク)
  name:        String (最大100)
  description: String (最大500)
  owner:       ObjectId → User
  files:       [ObjectId → File]
  password:    String | null (bcrypt)
  expiresAt:   Date | null
  createdAt:   Date
}
```

> 期限切れのコレクションは、有効期限後7日でMongoDB TTLインデックスにより自動削除されます。

### ShareLink（`src/models/ShareLink.js`）

```
{
  token:         String (16進数32文字、ユニーク)
  file:          ObjectId → File
  createdBy:     ObjectId → User
  label:         String (最大100)
  password:      String | null (bcrypt)
  expiresAt:     Date | null
  downloadLimit: Number (-1 = 無制限)
  downloadCount: Number
  createdAt:     Date
}
```

> コレクションと同様：TTLインデックスによる有効期限後7日間の猶予期間。

### SiteSettings（`src/models/SiteSettings.js`）

シングルトンドキュメント（`_id: 'singleton'`）：

```
{
  operatorName:        String
  operatorAddress:     String
  operatorEmail:       String
  cloudflareAnalytics: Boolean
  fileRetentionDays:   Number (0 = 無効)
  encryptionAtRest:    Boolean
  sessionDurationDays: Number (デフォルト：7)
  allowRegistration:   Boolean
}
```

### AuditLog（`src/models/AuditLog.js`）

```
{
  timestamp: Date (TTLインデックス：90日)
  userId:    ObjectId → User | null
  username:  String | null
  action:    String
  ip:        String | null
  meta:      Mixed (アクション固有のメタデータ)
}
```

---

## 7. REST API

### ベースURL：`/api`

すべてのJSONエンドポイントは`Content-Type: application/json`を返します。エラー：`{ "error": "メッセージ" }`。

---

### 認証（`/api/auth`）

| メソッド | パス | 認証 | 説明 |
|---|---|---|---|
| `GET` | `/me` | セッション | 現在ログイン中のユーザー |
| `POST` | `/login` | — | ログイン（レート制限：10回/15分） |
| `POST` | `/register` | — | 登録（レート制限あり、最初のユーザーが管理者になる） |
| `POST` | `/logout` | — | ログアウト |
| `GET` | `/smtp-enabled` | — | SMTPが設定されているか確認 |
| `GET` | `/verify-email?token=` | — | メールアドレスを認証 |
| `GET` | `/verify-reset-token?token=` | — | リセットトークンを検証 |
| `POST` | `/forgot-password` | — | パスワードリセットメールを送信（レート制限：5回/時間） |
| `POST` | `/reset-password` | — | 新しいパスワードを設定 |

**ログインリクエスト：**
```json
POST /api/auth/login
{ "username": "max", "password": "meinPasswort123" }
```

**ログインレスポンス：**
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

### ファイルアップロード

| メソッド | パス | 認証 | 説明 |
|---|---|---|---|
| `POST` | `/upload` | APIキー | ShareXアップロード（`app.js`のレガシーエンドポイント） |
| `POST` | `/api/upload` | APIキー | ShareX/APIアップロード（フィールド：`file`） |
| `POST` | `/api/web-upload` | セッション | Webアップロード（フィールド：`files[]`、最大500） |
| `POST` | `/api/chunk/init` | セッション | チャンクアップロードの初期化 |
| `POST` | `/api/chunk/:uploadId` | セッション | チャンクのアップロード（フィールド：`chunk`） |
| `POST` | `/api/chunk/:uploadId/complete` | セッション | チャンクの結合 |
| `DELETE` | `/api/chunk/:uploadId` | セッション | アップロードのキャンセルとクリーンアップ |

**APIアップロードレスポンス：**
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

#### チャンクアップロードフロー

1. `POST /api/chunk/init` → `{ uploadId: "32hex" }`
2. `POST /api/chunk/:uploadId`（ボディ：`chunkIndex=N`、ファイル：`chunk`）→ `{ received: N }`  
   3〜5チャンクを並列で送信
3. `POST /api/chunk/:uploadId/complete` → `{ files: [fileObject] }`

---

### ファイル管理

| メソッド | パス | 認証 | 説明 |
|---|---|---|---|
| `GET` | `/api/gallery` | セッション | 自分のファイル（管理者：全ファイル）、ページネーション（24件/ページ）、フィルター：`q`、`type`、`tag`、`page` |
| `GET` | `/api/file/:shortId` | — | ファイルメタデータ（閲覧カウンターを増加） |
| `PATCH` | `/api/file/:shortId` | セッション | タグ/名前の更新 |
| `DELETE` | `/api/file/:shortId` | セッション | ファイルの削除 |
| `DELETE` | `/api/delete/:shortId` | APIキー | ファイルの削除（APIキー認証） |
| `POST` | `/api/files/bulk` | セッション | 一括操作：`delete`、`tag`、`removeTag`、`addToCollection`、`moveToCollection` |
| `GET` | `/api/tags` | セッション | ユーザーの全タグ候補 |

**ギャラリークエリパラメーター：**
- `q` — ファイル名検索（正規表現セーフ）
- `type` — `all|image|video|audio|pdf|code`
- `tag` — 完全一致タグフィルター
- `page` — ページ番号（デフォルト：1）

---

### ユーザー設定

| メソッド | パス | 認証 | 説明 |
|---|---|---|---|
| `GET` | `/api/my-key` | セッション | APIキープレフィックスを表示 |
| `POST` | `/api/regen-key` | セッション | APIキーを再生成 |
| `GET` | `/api/sharex-config` | セッション | ShareX `.sxcu`をダウンロード（キーを再生成） |
| `PATCH` | `/api/user/username` | セッション | ユーザー名を変更（パスワード必須） |
| `PATCH` | `/api/user/password` | セッション | パスワードを変更 |
| `PATCH` | `/api/user/email` | セッション | メールを変更（確認メールを送信） |
| `PATCH` | `/api/user/language` | セッション | UI言語を設定 |
| `PATCH` | `/api/user/embed-mode` | セッション | 埋め込みモードを設定（`embed`/`raw`） |
| `POST` | `/api/user/resend-verification` | セッション | 確認メールを再送信 |
| `GET` | `/api/user/export` | セッション | データエクスポート（GDPR第20条）JSONとして |
| `DELETE` | `/api/user/account` | セッション | アカウントを削除（GDPR第17条、パスワード必須） |
| `GET` | `/api/user/predefined-tags` | セッション | 定義済みタグを取得 |
| `PATCH` | `/api/user/predefined-tags` | セッション | 定義済みタグを更新 |
| `POST` | `/api/user/avatar` | セッション | アバターをアップロード（最大2MB、JPEG/PNG/GIF/WebP） |
| `DELETE` | `/api/user/avatar` | セッション | アバターを削除 |
| `GET` | `/api/user/avatar/:userId` | — | アバターを配信 |

---

### 共有リンク

| メソッド | パス | 認証 | 説明 |
|---|---|---|---|
| `GET` | `/api/file/:shortId/share-links` | セッション（オーナー/管理者） | ファイルの全共有リンク |
| `POST` | `/api/file/:shortId/share-links` | セッション（オーナー/管理者） | 共有リンクを作成 |
| `DELETE` | `/api/share-links/:token` | セッション（オーナー/作成者/管理者） | 共有リンクを削除 |
| `GET` | `/api/share-links/:token` | — | 共有リンクのメタデータ（公開） |
| `POST` | `/api/share-links/:token/verify` | — | 共有リンクのパスワードを確認 |

**共有リンクの作成：**
```json
POST /api/file/a1b2c3d4/share-links
{
  "label": "同僚向け",
  "password": "シークレット",
  "expiresAt": "2025-12-31T23:59:59Z",
  "downloadLimit": 10
}
```

---

### コレクション

| メソッド | パス | 認証 | 説明 |
|---|---|---|---|
| `GET` | `/api/collections` | セッション | 自分のコレクション（管理者：全コレクション） |
| `POST` | `/api/collections` | セッション | コレクションを作成 |
| `GET` | `/api/collections/:id` | — | コレクションを表示（公開、設定されている場合はパスワード） |
| `PATCH` | `/api/collections/:id` | セッション（オーナー/管理者） | コレクションを更新 |
| `DELETE` | `/api/collections/:id` | セッション（オーナー/管理者） | コレクションを削除 |
| `POST` | `/api/collections/:id/files` | セッション（オーナー/管理者） | コレクションにファイルを追加 |
| `DELETE` | `/api/collections/:id/files/:fileShortId` | セッション（オーナー/管理者） | コレクションからファイルを削除 |
| `POST` | `/api/collections/:id/verify` | — | コレクションのパスワードを確認 |

---

### 管理者エンドポイント

| メソッド | パス | 認証 | 説明 |
|---|---|---|---|
| `GET` | `/api/admin/stats` | 管理者 | ダッシュボード統計 |
| `GET` | `/api/admin/users` | 管理者 | 全ユーザー（ファイル数を含む） |
| `POST` | `/api/admin/users` | 管理者 | ユーザーを作成 |
| `PATCH` | `/api/admin/users/:id/toggle` | 管理者 | ユーザーを有効化/無効化 |
| `PATCH` | `/api/admin/users/:id/role` | 管理者 | ユーザーロールを変更 |
| `DELETE` | `/api/admin/users/:id` | 管理者 | ユーザーを削除 |
| `POST` | `/api/admin/users/:id/regen-key` | 管理者 | APIキーを再生成 |
| `PATCH` | `/api/admin/users/:id/password` | 管理者 | パスワードを設定 |
| `PATCH` | `/api/admin/users/:id/folder` | 管理者 | フォルダ名を変更（ファイルを移動） |
| `GET` | `/api/admin/files` | 管理者 | 全ファイル、ページネーション（30件/ページ） |
| `GET` | `/api/admin/site-settings` | 管理者 | 運営者設定を読み取り |
| `PATCH` | `/api/admin/site-settings` | 管理者 | 運営者設定を更新 |
| `GET` | `/api/admin/audit-log` | 管理者 | ページネーション付き監査ログ（50件/ページ） |
| `GET` | `/api/admin/audit-log/export` | 管理者 | 監査ログをCSVでダウンロード |
| `GET` | `/api/site-settings` | — | 運営者の公開情報（プライバシーページ用） |

---

### サイト設定（公開）

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

**接続：**`wss://example.com/ws`（ログイン済みユーザーのみ、セッションCookieが必要）

### プロトコル

**クライアント → サーバー（リクエスト）：**
```json
{ "id": "req-abc123", "action": "file:list", "payload": { "type": "image", "page": 1 } }
```

**サーバー → クライアント（レスポンス）：**
```json
{ "id": "req-abc123", "data": { ... } }
```

**サーバー → クライアント（エラー）：**
```json
{ "id": "req-abc123", "error": "Forbidden", "status": 403 }
```

**サーバー → クライアント（ブロードキャスト）：**
```json
{ "event": "file:uploaded", "data": { "shortId": "a1b2c3d4", "uploaderId": "..." } }
```

### 利用可能なアクション

| アクション | 認証 | 説明 |
|---|---|---|
| `site-settings:get` | — | サイトの公開設定 |
| `auth:me` | ユーザー | ログイン中のユーザーデータ |
| `file:get` | ユーザー | ファイルの詳細（閲覧数を増加） |
| `file:list` | ユーザー | フィルター/ページネーション付きファイルリスト |
| `file:delete` | ユーザー | ファイルを削除 |
| `user:get-key` | ユーザー | APIキープレフィックス |
| `user:regen-key` | ユーザー | APIキーを再生成 |
| `user:change-password` | ユーザー | パスワードを変更 |
| `user:change-username` | ユーザー | ユーザー名を変更 |
| `user:change-email` | ユーザー | メールを変更 |
| `user:change-language` | ユーザー | 言語を設定 |
| `user:change-embed-mode` | ユーザー | 埋め込みモードを設定 |
| `user:resend-verification` | ユーザー | 確認メールを再送信 |
| `user:export` | ユーザー | データエクスポート |
| `user:delete-account` | ユーザー | アカウントを削除 |
| `admin:stats` | 管理者 | ダッシュボード統計 |
| `admin:settings:get` | 管理者 | サイト設定を読み取り |
| `admin:settings:update` | 管理者 | サイト設定を更新 |
| `admin:users:list` | 管理者 | 全ユーザー |
| `admin:users:create` | 管理者 | ユーザーを作成 |
| `admin:users:toggle` | 管理者 | ユーザーを有効化/無効化 |
| `admin:users:role` | 管理者 | ユーザーロールを変更 |
| `admin:users:delete` | 管理者 | ユーザーを削除 |
| `admin:users:regen-key` | 管理者 | APIキーを再生成 |
| `admin:users:password` | 管理者 | パスワードを設定 |
| `admin:users:folder` | 管理者 | フォルダ名を変更 |
| `admin:files:list` | 管理者 | 全ファイル |
| `admin:audit-log:list` | 管理者 | ページネーション付き監査ログ |

### ブロードキャストイベント

| イベント | 受信者 | ペイロード |
|---|---|---|
| `file:uploaded` | アップロードしたユーザー | `{ shortId, uploaderId }` |
| `file:deleted` | ファイルオーナー | `{ shortId, uploaderId }` |
| `file:view` | 全員 | `{ shortId, views }` |
| `user:created` | 管理者 | `{ id, username, role, ... }` |
| `user:deleted` | 管理者 | `{ id }` |
| `user:updated` | 管理者 | `{ id, ...変更されたフィールド }` |
| `audit:log` | 管理者 | 完全なAuditLogオブジェクト |
| `settings:updated` | 管理者 | 更新されたSiteSettingsオブジェクト |
| `stats:invalidate` | 管理者 | `{}`（統計の更新をトリガー） |

---

## 9. ファイル配信ルート

### `/f/:shortId` — ファイルビューア

- **ブラウザリクエスト：** React SPA（`index.html`）にパスを通す — SPAがビューアをレンダリング。
- **ソーシャルメディアボット**（Discord、Telegram、Twitterなど）：Open Graph / Twitter Cardメタタグを含む最小限のHTMLページを返す。
  - `embedMode = 'embed'`：リダイレクト付きOG HTML
  - `embedMode = 'raw'` + 画像/動画/音声：HTTP 302 → `/f/:shortId/raw`

### `/f/:shortId/raw` — 直接アクセス

レンジリクエスト対応（206 Partial Content）でファイルをHTTPレスポンスとして配信。画像/動画/音声：`Content-Disposition: inline`、その他：`attachment`。

### `/f/:shortId/download` — 強制ダウンロード

`/raw`と同様ですが、常に`Content-Disposition: attachment`。

### `/f/:shortId/thumb` — サムネイル

JPEGサムネイルを返す（動画とPDF用）。`Cache-Control: public, max-age=86400`。

### `/f/:shortId/delete/:token` — ShareX削除

一意の削除トークンを使用して、セッションなしでファイルを削除。

### `/s/:token` — 共有リンクファイル配信（`src/routes/shares.js`）

パスワード（セッションフラグ経由）、有効期限、ダウンロード制限を確認してからファイルを配信。

---

## 10. 認証とセキュリティ

### セッション認証

- MongoDBストア付きExpressセッション（`connect-mongo`）
- セッションCookie：`httpOnly: true`、`sameSite: 'strict'`、本番環境では`secure: true`
- セッション期間：`SiteSettings.sessionDurationDays`で設定可能（デフォルト：7日）、60秒間ライブキャッシュ

### APIキー認証

- APIキーはSHA-256ハッシュとして保存され、平文では保存されない
- 最初の8文字が`apiKeyPrefix`として保存される（表示目的）
- 検索：`User.findByApiKey(plaintext)`でハッシュを計算し`apiKeyHash`を検索
- ShareX設定をダウンロードするとキーが再生成される — 平文はその瞬間のみ表示される

### ミドルウェアチェーン（`src/middleware/auth.js`）

```
requireLogin    → req.session.userを確認 → 未ログインなら401
requireAdmin    → requireLoginと同様、さらにrole === 'admin' → 403
requireApiKey   → Authorizationヘッダーまたはreqbody.tokenを確認
```

### CSRF対策

`app.js`の`requireSameOrigin()`は、すべてのAPIルートで`Origin`ヘッダーを`Host`ヘッダーと比較。`sameSite: 'strict'` Cookieを補完。

### コンテンツセキュリティポリシー

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
media-src 'self' blob:;
connect-src 'self' https://cloudflareinsights.com;
frame-ancestors 'self';
```

### セキュリティヘッダー

- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`

### レート制限

| エンドポイント | 制限 | ウィンドウ |
|---|---|---|
| アップロード（`/upload`、`/api/upload`、`/api/web-upload`） | 60リクエスト | 15分 |
| 認証（`/api/auth/login`、`/register`など） | 10リクエスト | 15分 |
| パスワードリセット | 5リクエスト | 1時間 |

### ファイルブロックリスト

以下のMIMEタイプと拡張子はアップロード時に拒否されます：

**ブロックされるMIMEタイプ：** `application/x-executable`、`application/x-sh`、`application/x-csh`、`application/x-bat`

**ブロックされる拡張子：** `.bat`、`.cmd`、`.com`、`.ps1`、`.psm1`、`.psd1`、`.sh`、`.bash`、`.csh`、`.zsh`、`.fish`、`.vbs`、`.vbe`、`.jse`、`.scr`、`.pif`、`.application`、`.gadget`、`.hta`、`.php`、`.php3–5`、`.phtml`、`.asp`、`.aspx`、`.jsp`、`.jspx`、`.cfm`

### パストラバーサル対策

`resolveUploadPath()`経由のすべてのファイルアクセスは、解決されたパスが`UPLOAD_DIR`内にあることを確認します。

---

## 11. アップロードシステム

### 標準アップロード（Multer）

- **ストレージ：** `multer.diskStorage` → `uploads/{folderName}/{8hex}{.ext}`
- **ファイル名：** `crypto.randomBytes(4).hex() + 元の拡張子`
- **制限：** `MAX_FILE_SIZE_MB`（デフォルト：100MB）
- **保存場所：** ユーザー固有のフォルダ（`user.folderName`）

### チャンクアップロード（>250MB）

フロントエンドクライアントは大きなファイルのために自動的にチャンクモードに切り替えます。

**サーバー側のディレクトリ構造：**
```
uploads/.chunks/{uploadId}/
  meta.json          { filename, mimeType, totalSize, totalChunks, userId, createdAt }
  chunk-0
  chunk-1
  ...
  chunk-N
```

**チャンクサイズ：** 10〜20MB（後方互換性のため最大51MBを受け入れ）  
**並列数：** 3〜5チャンクの同時アップロード  
**結合：** ストリームベース（RAMへの完全読み込みなし）

### アバターアップロード

- **ストレージ：** `multer.memoryStorage()`（ディスクバッファなし）
- **保存場所：** `uploads/.avatars/{userId}{.ext}`
- **制限：** 2MB
- **フォーマット：** JPEG、PNG、GIF、WebP

---

## 12. サムネイル生成

サムネイルはアップロード後に非同期で生成されます（`.catch(() => {})` — エラーは無視されます）。

### 動画サムネイル（ffmpeg）

```bash
ffmpeg -y -i <file> -ss 00:00:01 -vframes 1 \
  -vf "scale=320:320:force_original_aspect_ratio=increase,crop=320:320" \
  -q:v 3 uploads/.thumbnails/<shortId>.jpg
```

### PDFサムネイル（Ghostscript）

```bash
gs -dNOPAUSE -dBATCH -dSAFER \
  -sDEVICE=jpeg -dFirstPage=1 -dLastPage=1 \
  -r72 -dJPEGQ=85 \
  -sOutputFile=uploads/.thumbnails/<shortId>.jpg \
  <file>
```

**タイムアウト：** サムネイル生成ごとに30秒  
**フォールバック：** ffmpeg/ghostscriptが利用できない場合、生成はサイレントにスキップされます。

### バックフィルスクリプト

```bash
npm run migrate:thumbnails
# またはコンテナ内：
docker exec -it <container> npm run migrate:thumbnails
```

---

## 13. メールとSMTP

### 設定

`SMTP_HOST`が設定されている場合にSMTPが有効になります。`mailer.isConfigured()`でこの値を確認します。

### メールテンプレート

すべてのメールはユーザーの言語（8言語）で送信されます。テンプレートは`src/utils/mailer.js`に組み込まれています。

**送信されるメールの種類：**

| 種類 | トリガー | トークン有効期限 |
|---|---|---|
| メール認証 | 登録、メール変更 | 24時間 |
| パスワードリセット | `POST /api/auth/forgot-password` | 1時間 |

### トークンセキュリティ

- トークン：`crypto.randomBytes(32).hex()`（16進数64文字）
- 保存形式：トークンのSHA-256ハッシュ
- メールにはURLパラメーターとして平文トークンが含まれる
- 検証：受信したトークンのハッシュを保存されたハッシュと比較

---

## 14. 国際化

**ライブラリ：** i18next + react-i18next + i18next-browser-languagedetector

**対応言語：**

| コード | 言語 |
|---|---|
| `en` | English |
| `de` | Deutsch |
| `fr` | Français |
| `es` | Español |
| `it` | Italiano |
| `pt` | Português |
| `ja` | 日本語 |
| `zh` | 中文 |

**言語選択：**
1. ブラウザ言語検出（自動）
2. データベースのユーザー設定（`user.language`）
3. `PATCH /api/user/language`で永続化

翻訳ファイル：`client/src/i18n/locales/{code}.json`

---

## 15. フロントエンド（React SPA）

### ルーター設定（`client/src/App.jsx`）

| ルート | コンポーネント | 認証 |
|---|---|---|
| `/` | リダイレクト → `/gallery` | 不要 |
| `/auth/login` | Login.jsx | 不要 |
| `/auth/register` | Register.jsx | 不要 |
| `/auth/forgot-password` | ForgotPassword.jsx | 不要 |
| `/auth/reset-password` | ResetPassword.jsx | 不要 |
| `/install` | Install.jsx | 不要 |
| `/upload` | Upload.jsx | **必要** |
| `/gallery` | Gallery.jsx | **必要** |
| `/f/:shortId` | FileView.jsx | **必要** |
| `/collections` | Collections.jsx | **必要** |
| `/c/:id` | CollectionView.jsx | 不要（公開） |
| `/s/:token` | ShareView.jsx | 不要（公開） |
| `/settings` | Settings.jsx | **必要** |
| `/admin` | Dashboard.jsx | **管理者** |
| `/admin/users` | Users.jsx | **管理者** |
| `/admin/files` | Files.jsx | **管理者** |
| `/admin/audit-log` | AuditLog.jsx | **管理者** |
| `/admin/site-settings` | SiteSettings.jsx | **管理者** |
| `/admin/import` | Import.jsx | **管理者** |
| `/privacy` | PrivacyPolicy.jsx | 不要 |
| `/terms` | TermsOfService.jsx | 不要 |

### 認証コンテキスト（`client/src/context/AuthContext.jsx`）

ログイン中のユーザーのグローバル状態。アプリ起動時に`GET /api/auth/me`で初期化。

### WebSocketフック（`client/src/hooks/useWebSocket.js`）

永続的なWS接続を管理。`sendMessage()`とイベントハンドラー登録を提供。接続切断時の再接続ロジック付き。

### UIコンポーネント

**shadcn/ui**（Radix UI Primitives + Tailwind CSS）ベース：

- `Dialog`、`AlertDialog`、`DropdownMenu`、`ContextMenu`、`Popover`
- `Select`、`Checkbox`、`Input`、`Textarea`、`Label`
- `Card`、`Badge`、`Button`、`Separator`、`Tabs`、`Table`
- 通知用の`Toast` / `Toaster`
- 有効期限選択用の`Calendar` / `DateTimePicker`
- ページネーションリスト用の`Pagination`
- `ScrollArea`、`Tooltip`

---

## 16. 管理ダッシュボード

管理ダッシュボード（`/admin/*`）は`role: 'admin'`のユーザーのみアクセス可能です。

### ダッシュボード（`/admin`）

- ユーザー、ファイル、ストレージ使用量の合計
- 最近アップロードされた10件のファイル
- WebSocket経由のライブ更新（`stats:invalidate`）

### ユーザー管理（`/admin/users`）

- ファイル数とストレージ使用量付きの全ユーザー
- ユーザーの作成、有効化/無効化、ロール変更
- パスワードリセット、APIキー再生成
- フォルダ名の変更（物理ファイルはサーバー上で移動）
- ユーザーの削除（全ファイルが削除される）

### ファイル管理（`/admin/files`）

- 全ユーザーの全ファイル、ページネーション付き
- ファイル名で検索
- ファイルを削除

### 監査ログ（`/admin/audit-log`）

- 全アクションのページネーション付きログ（50件/ページ）
- ユーザー名とアクションでフィルター
- 規制目的のCSVエクスポート

### サイト設定（`/admin/site-settings`）

- 運営者情報（名前、住所、メール）
- Cloudflare Analyticsの有効化
- ファイル保持期間
- セッション期間
- 登録の有効化/無効化

### XBackBoneインポート（`/admin/import`）

- XBackBone SQLiteデータベースからのプレビューとインポート
- ユーザー名でユーザーをマッチング
- 冪等性あり（既にインポートされたファイルはスキップ）

---

## 17. GDPR / プライバシー

| 機能 | GDPR条項 |
|---|---|
| プライバシーポリシー（設定可能） | 第13/14条 – 透明性 |
| 利用規約ページ（設定可能） | 第13/14条 – 透明性 |
| データエクスポート（URLを含むJSON） | 第20条 – データポータビリティ |
| アカウント自己削除（ファイル+データ） | 第17条 – 削除権 |
| 監査ログ（MongoDB経由90日TTL） | 第5条(2) – 説明責任 |
| 監査ログCSVエクスポート | 第5条(2) – 説明責任 |
| 設定可能なファイル保持 | 第5条(1)(e) – 保存制限 |
| SHA-256ハッシュとしてのAPIキー | 第32条 – セキュリティ |
| bcrypt（12ラウンド）としてのパスワード | 第32条 – セキュリティ |
| Cloudflare Analytics用Cookieの同意 | 第13条 – 透明性 |
| アカウント削除時の匿名化 | 第17条 – 削除権 |

### GDPR削除フロー

アカウント削除時（`user:delete-account` / `DELETE /api/user/account`）：
1. ユーザーの全ファイルがディスクから削除される
2. サムネイルが削除される
3. アバターが削除される
4. 監査ログエントリが匿名化される（`username: '[deleted]'`、`ip: null`、`userId: null`）
5. ユーザードキュメントが削除される
6. セッションが破棄される

---

## 18. バックグラウンドジョブ

### 保持クリーンアップ（`src/jobs/retentionCleanup.js`）

- **実行タイミング：** 起動時と以降は毎日（`setInterval(runRetentionCleanup, 24h)`）
- **処理内容：** `SiteSettings.fileRetentionDays > 0`の場合、この値より古いファイルを削除
- 削除対象：ディスク上のファイル、サムネイル、MongoDBドキュメント
- 管理者に`stats:invalidate`をブロードキャスト

### MongoDB TTLインデックス（自動）

| コレクション | TTL | トリガー |
|---|---|---|
| `AuditLog` | 90日 | `timestamp` |
| `Collection` | `expiresAt`の7日後 | `expiresAt` |
| `ShareLink` | `expiresAt`の7日後 | `expiresAt` |

---

## 19. デプロイ

### Docker（推奨）

```bash
git clone https://github.com/Christianoooooo/sharely.git
cd sharely
cp .env.example .env
# .envを編集（SESSION_SECRET、MONGOパスワード、BASE_URL）
docker compose up -d
```

**サービス：**
- `app` — Node.jsアプリ（ポート3000）
- `mongo` — MongoDB 7（ポート127.0.0.1:27017、外部からアクセス不可）

**ボリューム：**
- `uploads` — 永続的なファイルストレージ
- `mongo_data` — MongoDBデータ

**ヘルスチェック：** アプリは`/`でHTTP 200を確認、MongoDBは`db.adminCommand('ping')`を確認。

### Nginxリバースプロキシ

```nginx
server {
    listen 443 ssl;
    server_name files.example.com;

    client_max_body_size 2100M;  # 最大チャンクサイズ+バッファ以上に設定

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocketサポート
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

> `.env`の`BASE_URL`は公開ドメインと一致する必要があります。

### 初回起動

最初に登録したユーザーは自動的に`admin`ロールを付与されます（`User.countDocuments() === 0`）。

---

## 20. 開発環境

### 前提条件

- Node.js ≥ 18
- MongoDB（ローカルまたはDocker経由）
- オプション：ffmpeg、ghostscript（サムネイル用）

### セットアップ

```bash
# バックエンド
npm install
cp .env.example .env
# .envを編集

# フロントエンド
cd client
npm install
```

### 起動

```bash
# バックエンド（ポート3000、nodemonあり）
npm run dev

# フロントエンド（ポート5173、別ターミナル）
cd client
npm run dev
```

Vite開発サーバーはAPIリクエストを自動的に`localhost:3000`にプロキシします。

### ビルド

```bash
npm run build   # client/dist/をビルド、バックエンドは変更なし
npm start       # 本番Expressサーバーを起動
```

---

## 21. マイグレーションとスクリプト

### 自動マイグレーション（毎起動時）

これらのマイグレーションは`app.js`の起動時に実行され、冪等性があります：

| マイグレーション | ファイル | 機能 |
|---|---|---|
| ユーザーフォルダマイグレーション | `src/migrations/migrateUserFolders.js` | `uploads/`から`uploads/{folderName}/`にファイルを移動 |
| APIキーハッシュマイグレーション | `src/migrations/migrateApiKeyHashes.js` | 平文APIキーをSHA-256ハッシュに変換 |

### 手動スクリプト

```bash
# 既存ファイルのサムネイルを生成
npm run migrate:thumbnails
# または：
node scripts/generate-missing-thumbnails.js

# アップロードをユーザーフォルダに移動（手動）
npm run migrate:user-folders
# または：
node scripts/migrate-uploads-to-user-folders.js
```

### データベース初期化（Docker）

`scripts/mongo-init.js`はMongoDBコンテナの初回起動時に実行され、適切な権限でアプリユーザーを作成します。

---

## 22. エンドツーエンドテスト

**フレームワーク：** Playwright（`@playwright/test`）

### テストファイル

| ファイル | テストスイート |
|---|---|
| `e2e/upload.spec.js` | アップロードフロー |
| `e2e/gallery.spec.js` | ギャラリーとファイル管理 |
| `e2e/admin.spec.js` | 管理ダッシュボード |
| `e2e/sharelink.spec.js` | 共有リンクの作成と利用 |
| `e2e/tags.spec.js` | タグ管理 |
| `e2e/bulk-actions-fixes.spec.js` | 一括操作 |

### 実行

```bash
# 全テスト
npm run test:e2e

# UIあり
npm run test:e2e:ui
```

**Playwright設定：** `playwright.config.js`  
**グローバルセットアップ：** `e2e/global-setup.js`（テストユーザー、管理者などを作成）  
**ヘルパー：** `e2e/helpers.js`（共有ヘルパー関数）

---

## 付録：監査ログアクション

| アクション | トリガー |
|---|---|
| `login` | ログイン成功 |
| `logout` | ログアウト |
| `register` | 登録 |
| `upload` | ファイルアップロード |
| `delete_file` | ファイル削除 |
| `delete_account` | アカウント削除 |
| `change_password` | パスワード変更 |
| `change_username` | ユーザー名変更 |
| `change_email` | メール変更 |
| `verify_email` | メール認証 |
| `forgot_password` | パスワードリセットリクエスト |
| `reset_password` | パスワードリセット |
| `regen_api_key` | APIキー再生成 |
| `sharex_config` | ShareX設定ダウンロード |
| `export_data` | データエクスポート |
| `admin_create_user` | 管理者：ユーザー作成 |
| `admin_delete_user` | 管理者：ユーザー削除 |
| `admin_toggle_user` | 管理者：ユーザー有効化/無効化 |
| `admin_change_role` | 管理者：ユーザーロール変更 |
| `admin_change_password` | 管理者：パスワード設定 |
| `admin_regen_key` | 管理者：APIキー再生成 |

---

*sharely v1.0.0のソースコードから生成されたドキュメント*
