const {
  app, BrowserWindow, Tray, Menu, ipcMain,
  dialog, nativeImage, clipboard, shell, Notification,
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const SETTINGS_PATH = () => path.join(app.getPath('userData'), 'settings.json');
const HISTORY_PATH  = () => path.join(app.getPath('userData'), 'history.json');

let mainWindow = null;
let tray = null;

// ── Settings ────────────────────────────────────────────────────────────────

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH())) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH(), 'utf8'));
    }
  } catch {}
  return { serverUrl: 'http://localhost:3000', apiToken: '' };
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH(), JSON.stringify(settings, null, 2));
}

// ── History ──────────────────────────────────────────────────────────────────

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_PATH())) {
      return JSON.parse(fs.readFileSync(HISTORY_PATH(), 'utf8'));
    }
  } catch {}
  return [];
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_PATH(), JSON.stringify(history.slice(0, 100), null, 2));
}

function addToHistory(entry) {
  const history = loadHistory();
  history.unshift({ ...entry, timestamp: Date.now() });
  saveHistory(history);
}

// ── Upload ───────────────────────────────────────────────────────────────────

function uploadFile(filePath) {
  const settings = loadSettings();
  if (!settings.apiToken) {
    return Promise.reject(new Error('API token not configured. Open Settings to add it.'));
  }

  const filename = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const boundary = `----SharelyBoundary${Date.now()}`;
  const safeFilename = filename.replace(/"/g, '\\"');

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${safeFilename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    ),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const url = new URL('/api/upload', settings.serverUrl);
  const proto = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = proto.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode === 200 || res.statusCode === 201) {
              resolve(json);
            } else {
              reject(new Error(json.error || `Upload failed (HTTP ${res.statusCode})`));
            }
          } catch {
            reject(new Error(`Unexpected server response (HTTP ${res.statusCode})`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  mainWindow = new BrowserWindow({
    width: 460,
    height: 580,
    resizable: false,
    title: 'Sharely',
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

// ── Tray ─────────────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const trayIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(trayIcon);
  tray.setToolTip('Sharely');

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Sharely', click: showWindow },
    { label: 'Upload File…',  click: uploadFromMenu },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => { app.isQuitting = true; app.quit(); },
    },
  ]));

  tray.on('click', showWindow);
}

async function uploadFromMenu() {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    title: 'Choose files to upload',
  });
  if (canceled || !filePaths.length) return;

  showWindow();
  await processUploads(filePaths);
}

// ── Upload flow (shared) ─────────────────────────────────────────────────────

async function processUploads(filePaths) {
  for (const filePath of filePaths) {
    mainWindow?.webContents.send('upload-started', path.basename(filePath));
    try {
      const result = await uploadFile(filePath);
      clipboard.writeText(result.url);
      addToHistory({ filename: path.basename(filePath), url: result.url, size: result.size });
      mainWindow?.webContents.send('upload-complete', result);

      if (Notification.isSupported()) {
        new Notification({
          title: 'Upload complete',
          body: `${path.basename(filePath)} – URL copied to clipboard`,
        }).show();
      }
    } catch (err) {
      mainWindow?.webContents.send('upload-error', err.message);
    }
  }
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (_e, settings) => { saveSettings(settings); });
ipcMain.handle('get-history',   () => loadHistory());
ipcMain.handle('clear-history', () => { saveHistory([]); });

ipcMain.handle('upload-files', async (_e, filePaths) => {
  await processUploads(filePaths);
});

ipcMain.handle('open-file-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Choose files to upload',
  });
  return canceled ? [] : filePaths;
});

ipcMain.handle('copy-to-clipboard', (_e, text) => { clipboard.writeText(text); });
ipcMain.handle('open-url',          (_e, url)  => { shell.openExternal(url); });

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createTray();
  createWindow();
  app.on('activate', showWindow);
});

app.on('window-all-closed', () => {
  // Stay alive in the tray on all platforms.
});
