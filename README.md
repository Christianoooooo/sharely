# Sharely
![Logo](docs/assets/logo.svg)
A self-hosted file sharing platform with a clean web interface, ShareX integration, and API access. Upload screenshots, files, and media — then instantly share them via short links.

![Gallery](docs/assets/gallery.png)

## Features

- **Web UI** — Drag-and-drop uploads, searchable gallery with type filters (images, video, audio, PDF, code)
- **ShareX integration** — One-click `.sxcu` config download for automatic screenshot uploads from Windows
- **API uploads** — Bearer token authentication, compatible with curl, wget, and any HTTP client
- **File viewing** — Images zoom inline, videos/audio stream, PDFs render in-browser, code files syntax-highlighted
- **Thumbnails** — Video and PDF files get auto-generated JPEG thumbnails (requires ffmpeg / ghostscript, bundled in the Docker image)
- **User management** — Role-based access control (admin/user), account activation, custom folder names
- **Admin dashboard** — Stats overview, manage all users and files
- **XBackBone migration** — Import your existing XBackBone installation including files and metadata
- **Short links** — Every file gets an 8-character short ID (e.g. `/f/a1b2c3d4`)
- **Docker-ready** — Single `docker compose up` gets you running

### Screenshots

| Gallery | File View |
|---|---|
| ![Gallery](docs/assets/gallery.png) | ![File View](docs/assets/fileview.png) |

| Upload | Admin Dashboard |
|---|---|
| ![Upload](docs/assets/upload.png) | ![Admin](docs/assets/admin.png) |

## Quick Start

### Docker (recommended)

**Requirements:** Docker and Docker Compose

```bash
git clone https://github.com/Christianoooooo/sharely.git
cd sharely
cp .env.example .env
```

Edit `.env` with your settings (see [Configuration](#configuration)), then:

```bash
docker compose up -d
```

The app is now running at `http://localhost:3000`. Register the first account — it will automatically be an admin.

### Local Development

**Requirements:** Node.js 18+, MongoDB

```bash
# Backend
npm install
npm run dev

# Frontend (separate terminal)
cd client
npm install
npm run dev
```

- Backend: `http://localhost:3000`
- Frontend dev server: `http://localhost:5173`

## Configuration

Copy `.env.example` to `.env` and adjust the values:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `MONGO_ROOT_PASSWORD` | — | MongoDB root password (required) |
| `MONGO_APP_USER` | `appuser` | MongoDB application user |
| `MONGO_APP_PASSWORD` | — | MongoDB application user password (required) |
| `SESSION_SECRET` | — | Secret for session encryption — use a long random string (required) |
| `BASE_URL` | `http://localhost:3000` | Public base URL for generated share links, no trailing slash |
| `SITE_NAME` | `sharely` | Site name shown in Open Graph embeds |
| `MAX_FILE_SIZE_MB` | `100` | Maximum upload file size in MB |
| `ALLOW_REGISTRATION` | `true` | Set to `false` to disable public sign-up (admin-only user creation) |

Generate a secure session secret:

```bash
openssl rand -hex 32
```

## API Usage

Get your API key from **Settings → API Key** in the web UI.

**Upload a file:**

```bash
curl -X POST https://your-domain.com/api/upload \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "sharex=@/path/to/file.png"
```

The response contains the URL to the uploaded file.

**Delete a file:**

```bash
curl -X DELETE https://your-domain.com/api/delete/SHORT_ID \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## ShareX Setup

1. Log in and go to **Upload**
2. Click **Download ShareX Config**
3. Open the downloaded `.sxcu` file — ShareX will import it automatically
4. Screenshots and uploads are now sent directly to your instance

## Reverse Proxy (Nginx example)

```nginx
server {
    listen 443 ssl;
    server_name files.example.com;

    client_max_body_size 200M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Make sure `BASE_URL` in `.env` matches your public domain.

## Thumbnails

Video and PDF files get a JPEG thumbnail automatically on upload. Thumbnails are stored in `uploads/.thumbnails/` and served at `/f/<shortId>/thumb`.

![Thumbnail Cards](docs/assets/thumbnails.png)

The Docker image includes `ffmpeg` (video) and `ghostscript` (PDF), so no extra setup is needed there. For local development, install the tools manually:

```bash
# Debian / Ubuntu
sudo apt install ffmpeg ghostscript

# macOS
brew install ffmpeg ghostscript
```

If the tools are unavailable, thumbnail generation is silently skipped and the gallery shows a styled colour-coded placeholder instead.

### Backfilling existing uploads

To generate thumbnails for files that were uploaded before this feature was introduced, run the migration script once inside the container:

```bash
docker exec -it <container-name> npm run migrate:thumbnails
```

Or locally:

```bash
npm run migrate:thumbnails
```

The script is idempotent — already-generated thumbnails are skipped.

## XBackBone Migration

If you're migrating from [XBackBone](https://github.com/SergiX44/XBackBone):

1. Log in as admin and go to **Admin → Import**
2. Provide the path to your XBackBone `database.db` file
3. Provide the path to your XBackBone `storage/` directory
4. Run a preview first, then confirm the import

Users are matched by username. Files without a matching user are assigned to a fallback user you specify. The import is idempotent — re-running it skips already-imported files.

## Project Structure

```
sharely/
├── app.js                  # Express entry point
├── src/
│   ├── config/db.js        # MongoDB connection
│   ├── models/             # Mongoose schemas (User, File)
│   ├── middleware/         # Auth, upload handling
│   ├── utils/
│   │   └── generateThumbnail.js  # ffmpeg/ghostscript thumbnail generation
│   └── routes/             # API routes (auth, files, admin, import)
├── client/                 # React frontend (Vite + Tailwind)
│   └── src/
│       ├── pages/          # Upload, Gallery, FileView, Admin pages
│       └── components/     # UI components
├── scripts/
│   ├── setup-db.js
│   ├── migrate-uploads-to-user-folders.js
│   └── generate-missing-thumbnails.js   # backfill thumbnails for old uploads
├── uploads/
│   └── .thumbnails/        # auto-generated JPEG thumbnails
├── docker-compose.yml
└── .env.example
```

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express |
| Database | MongoDB (Mongoose) |
| Frontend | React 18, React Router, Vite |
| Styling | Tailwind CSS, Radix UI |
| File uploads | Multer |
| Auth | express-session, bcrypt |
| Container | Docker, Docker Compose |

## License

MIT
