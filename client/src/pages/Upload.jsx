import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { fmtSize } from '@/lib/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload, faXmark, faDownload, faRotate } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';

const MB = 1024 * 1024;

// Returns { chunkSize, parallelism } for files that need chunking, null otherwise.
function getChunkConfig(size) {
  if (size <  100 * MB) return null;                           // < 100 MB  → single request
  if (size <  250 * MB) return { chunkSize: 10 * MB, parallelism: 3 }; // 100–250 MB
  if (size < 1000 * MB) return { chunkSize: 15 * MB, parallelism: 4 }; // 250 MB–1 GB
  return                       { chunkSize: 20 * MB, parallelism: 5 }; // 1–2 GB
}

async function uploadBatch(items, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    items.forEach((item) => fd.append('files', item.file));

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      // When lengthComputable is false the bar stays at 0 (pre-initialised),
      // which still informs the user that upload is in progress.
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error('Invalid response from server')); }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error || 'Upload failed'));
        } catch { reject(new Error(`Upload failed (${xhr.status})`)); }
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.open('POST', '/api/web-upload');
    xhr.send(fd);
  });
}

async function uploadChunked(file, onProgress) {
  const { chunkSize, parallelism } = getChunkConfig(file.size);
  const totalChunks = Math.ceil(file.size / chunkSize);

  // 1. Init session
  const initRes = await fetch('/api/chunk/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      totalSize: file.size,
      totalChunks,
    }),
  });
  const initData = await initRes.json();
  if (!initRes.ok) throw new Error(initData.error || 'Failed to init upload');
  const { uploadId } = initData;

  // 2. Upload chunks in parallel batches
  let completed = 0;

  async function sendChunk(i) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const fd = new FormData();
    fd.append('chunk', file.slice(start, end));
    fd.append('chunkIndex', i);
    fd.append('totalChunks', totalChunks);

    const r = await fetch(`/api/chunk/${uploadId}`, { method: 'POST', body: fd });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `Failed to upload chunk ${i}`);
    }
    completed++;
    onProgress(Math.round((completed / totalChunks) * 100));
  }

  try {
    for (let i = 0; i < totalChunks; i += parallelism) {
      const batch = [];
      for (let j = i; j < Math.min(i + parallelism, totalChunks); j++) {
        batch.push(sendChunk(j));
      }
      await Promise.all(batch);
    }

    // 3. Assemble
    const completeRes = await fetch(`/api/chunk/${uploadId}/complete`, { method: 'POST' });
    const completeData = await completeRes.json();
    if (!completeRes.ok) throw new Error(completeData.error || 'Failed to complete upload');
    return completeData;
  } catch (err) {
    // Best-effort cleanup
    fetch(`/api/chunk/${uploadId}`, { method: 'DELETE' }).catch(() => {});
    throw err;
  }
}

// Reads all entries from a directory entry (handles the 100-entry readEntries() limit).
async function readAllDirEntries(dirEntry) {
  const reader = dirEntry.createReader();
  const all = [];
  await new Promise((resolve) => {
    function readBatch() {
      reader.readEntries((batch) => {
        if (!batch.length) { resolve(); return; }
        all.push(...batch);
        readBatch();
      }, resolve);
    }
    readBatch();
  });
  return all;
}

// Recursively collects { file, path } objects from a FileSystemEntry.
async function collectFilesFromEntry(entry, prefix = '') {
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file((file) => {
        const relPath = prefix ? `${prefix}/${file.name}` : file.name;
        resolve([{ file, path: relPath }]);
      });
    });
  }
  if (entry.isDirectory) {
    const entries = await readAllDirEntries(entry);
    const dirPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    const nested = await Promise.all(entries.map((e) => collectFilesFromEntry(e, dirPrefix)));
    return nested.flat();
  }
  return [];
}

export default function Upload() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  // Each entry: { file: File, path: string }
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [keyCopied, setKeyCopied] = useState(false);
  const [progress, setProgress] = useState({}); // key: name+size → 0-100
  const fileInputRef = useRef(null);

  const addFiles = useCallback((incoming) => {
    // incoming: { file: File, path: string }[]
    setFiles((prev) => {
      const existing = new Set(prev.map((item) => item.path + item.file.size));
      const news = incoming.filter((item) => !existing.has(item.path + item.file.size));
      return [...prev, ...news];
    });
  }, []);

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onDrop(e) {
    e.preventDefault();
    setDragging(false);

    const items = Array.from(e.dataTransfer.items || []);
    if (items.length > 0 && items[0].webkitGetAsEntry) {
      const collected = [];
      for (const item of items) {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          const result = await collectFilesFromEntry(entry);
          collected.push(...result);
        }
      }
      addFiles(collected);
    } else {
      // Fallback for browsers without DataTransferItem API
      addFiles(Array.from(e.dataTransfer.files).map((f) => ({ file: f, path: f.name })));
    }
  }

  function handleFileSelect(e) {
    addFiles(Array.from(e.target.files).map((f) => ({ file: f, path: f.name })));
    e.target.value = '';
  }

  function handleFolderSelect(e) {
    addFiles(
      Array.from(e.target.files).map((f) => ({
        file: f,
        path: f.webkitRelativePath || f.name,
      }))
    );
    e.target.value = '';
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setUploading(true);
    setProgress({});

    const smallFiles = files.filter((item) => getChunkConfig(item.file.size) === null);
    const largeFiles = files.filter((item) => getChunkConfig(item.file.size) !== null);
    const allResults = [];

    try {
      // Upload small files in one batch with XHR progress tracking
      if (smallFiles.length > 0) {
        const initProg = {};
        smallFiles.forEach((item) => { initProg[item.path + item.file.size] = 0; });
        setProgress((prev) => ({ ...prev, ...initProg }));

        const data = await uploadBatch(smallFiles, (pct) => {
          setProgress((prev) => {
            const updated = { ...prev };
            smallFiles.forEach((item) => { updated[item.path + item.file.size] = pct; });
            return updated;
          });
        });
        if (!data.files) throw new Error(data.error || 'Upload failed');
        allResults.push(...data.files);
      }

      // Upload large files one by one via chunked API
      for (const item of largeFiles) {
        const key = item.path + item.file.size;
        setProgress((prev) => ({ ...prev, [key]: 0 }));

        const data = await uploadChunked(item.file, (pct) => {
          setProgress((prev) => ({ ...prev, [key]: pct }));
        });

        allResults.push(...data.files);
      }

      toast({ title: t('upload.uploadSuccess', { count: allResults.length }) });
      setFiles([]);
      setProgress({});

      if (allResults.length === 1) {
        navigate(`/f/${allResults[0].shortId}`);
      } else {
        navigate('/gallery');
      }
    } catch (err) {
      toast({ title: t('upload.uploadFailed'), description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }

  async function regenKey() {
    const r = await fetch('/api/regen-key', { method: 'POST' });
    const data = await r.json();
    setApiKey(data.apiKey);
    toast({ title: t('common.apiKeyRegenerated') });
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('upload.title')}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t('upload.subtitle')}</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`
          rounded-lg border-2 border-dashed transition-all p-10 text-center
          ${dragging ? 'border-primary bg-primary/5' : 'border-border'}
        `}
      >
        <FontAwesomeIcon icon={faUpload} className="h-10 w-10 mx-auto mb-4 text-muted-foreground/50" />
        <p className="font-medium">{t('upload.dropHint')}</p>
        <p className="text-sm text-muted-foreground mt-1">{t('upload.supportedTypes')}</p>

        <div className="mt-6">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <FontAwesomeIcon icon={faUpload} className="h-3.5 w-3.5" />
            {t('upload.selectFiles')}
          </Button>
          <p className="text-xs text-muted-foreground mt-3">{t('upload.folderDropHint')}</p>
        </div>

        <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileSelect} />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('upload.filesSelected', { count: files.length })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {files.map((item, i) => {
              const key = item.path + item.file.size;
              const pct = progress[key];
              const isUploading = uploading && pct !== undefined;

              return (
                <div key={i} className="border rounded-md px-3 py-2 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate max-w-[70%]">{item.path}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-muted-foreground">{fmtSize(item.file.size)}</span>
                      {!uploading && (
                        <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                          <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {isUploading && (
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-primary h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                  {isUploading && (
                    <p className="text-xs text-muted-foreground">{pct}%</p>
                  )}
                </div>
              );
            })}
            <Button className="w-full mt-2" onClick={handleUpload} disabled={uploading}>
              {uploading ? t('upload.uploading') : t('upload.uploadBtn', { count: files.length })}
            </Button>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* ShareX config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />{t('upload.sharex')}
          </CardTitle>
          <CardDescription>{t('upload.sharexDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <a href="/api/sharex-config" download>{t('upload.downloadSxcu')}</a>
          </Button>
        </CardContent>
      </Card>

      {/* API */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('upload.apiUpload')}</CardTitle>
          <CardDescription>{t('upload.apiDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="rounded-md bg-muted p-4 text-xs overflow-x-auto whitespace-pre-wrap break-all">
{`curl -X POST \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -F "file=@/path/to/file" \\
  /api/upload`}
          </pre>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={regenKey} className="gap-2 shrink-0">
              <FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />{t('upload.regenKey')}
            </Button>
            {apiKey && (
              <Tooltip open={keyCopied || undefined}>
                <TooltipTrigger asChild>
                  <code
                    className="text-xs bg-muted px-2 py-1 rounded truncate flex-1 cursor-pointer hover:bg-muted/70 transition-colors"
                    onClick={() => copyToClipboard(apiKey)}
                  >
                    {apiKey}
                  </code>
                </TooltipTrigger>
                <TooltipContent>
                  {keyCopied ? t('common.copiedToClipboard') : t('common.copyToClipboard')}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
