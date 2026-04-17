const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sharely', {
  // Settings
  getSettings:   ()  => ipcRenderer.invoke('get-settings'),
  saveSettings:  (s) => ipcRenderer.invoke('save-settings', s),

  // History
  getHistory:    ()  => ipcRenderer.invoke('get-history'),
  clearHistory:  ()  => ipcRenderer.invoke('clear-history'),

  // Uploads
  uploadFiles:    (paths) => ipcRenderer.invoke('upload-files', paths),
  openFileDialog: ()      => ipcRenderer.invoke('open-file-dialog'),

  // Utilities
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  openUrl:         (url)  => ipcRenderer.invoke('open-url', url),

  // Events from the main process
  onUploadStarted:  (cb) => ipcRenderer.on('upload-started',  (_e, name)   => cb(name)),
  onUploadComplete: (cb) => ipcRenderer.on('upload-complete', (_e, result) => cb(result)),
  onUploadError:    (cb) => ipcRenderer.on('upload-error',    (_e, msg)    => cb(msg)),
});
