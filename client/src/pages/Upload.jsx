import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { fmtSize } from '@/lib/utils';
import { Upload as UploadIcon, X, Download, RefreshCw, Copy } from 'lucide-react';

const CHUNK_THRESHOLD = 100 * 1024 * 1024; // 100 MB
const CHUNK_SIZE = 10 * 1024 * 1024;       // 10 MB per chunk

async function uploadChunked(file, onProgress) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

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

  // 2. Upload chunks sequentially
  try {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const fd = new FormData();
      fd.append('chunk', chunk);
      fd.append('chunkIndex', i);
      fd.append('totalChunks', totalChunks);

      const r = await fetch(`/api/chunk/${uploadId}`, { method: 'POST', body: fd });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `Failed to upload chunk ${i}`);
      }

      onProgress(Math.round(((i + 1) / totalChunks) * 100));
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

export default function Upload() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [progress, setProgress] = useState({}); // key: name+size → 0-100
  const fileInputRef = useRef(null);

  const addFiles = useCallback((incoming) => {
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      const news = Array.from(incoming).filter((f) => !existing.has(f.name + f.size));
      return [...prev, ...news];
    });
  }, []);

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setUploading(true);
    setProgress({});

    const smallFiles = files.filter((f) => f.size < CHUNK_THRESHOLD);
    const largeFiles = files.filter((f) => f.size >= CHUNK_THRESHOLD);
    const allResults = [];

    try {
      // Upload small files in one batch (existing behaviour)
      if (smallFiles.length > 0) {
        const fd = new FormData();
        smallFiles.forEach((f) => fd.append('files', f));
        const r = await fetch('/api/web-upload', { method: 'POST', body: fd });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Upload failed');
        allResults.push(...data.files);
      }

      // Upload large files one by one via chunked API
      for (const file of largeFiles) {
        const key = file.name + file.size;
        setProgress((prev) => ({ ...prev, [key]: 0 }));

        const data = await uploadChunked(file, (pct) => {
          setProgress((prev) => ({ ...prev, [key]: pct }));
        });

        allResults.push(...data.files);
      }

      toast({ title: `Uploaded ${allResults.length} file${allResults.length !== 1 ? 's' : ''}` });
      setFiles([]);
      setProgress({});

      if (allResults.length === 1) {
        navigate(`/f/${allResults[0].shortId}`);
      } else {
        navigate('/gallery');
      }
    } catch (err) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }

  async function regenKey() {
    const r = await fetch('/api/regen-key', { method: 'POST' });
    const data = await r.json();
    setApiKey(data.apiKey);
    toast({ title: 'API key regenerated' });
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Upload</h1>
        <p className="text-muted-foreground text-sm mt-1">Drop files or browse to upload</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          rounded-lg border-2 border-dashed cursor-pointer transition-all p-12 text-center
          ${dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/20'}
        `}
      >
        <UploadIcon className="h-10 w-10 mx-auto mb-4 text-muted-foreground/50" />
        <p className="font-medium">Drop files here or click to browse</p>
        <p className="text-sm text-muted-foreground mt-1">Images, GIF, video, code, PDF and more</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{files.length} file{files.length !== 1 ? 's' : ''} selected</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {files.map((f, i) => {
              const key = f.name + f.size;
              const pct = progress[key];
              const isLarge = f.size >= CHUNK_THRESHOLD;
              const isUploading = uploading && isLarge && pct !== undefined;

              return (
                <div key={i} className="border rounded-md px-3 py-2 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate max-w-[70%]">{f.name}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-muted-foreground">{fmtSize(f.size)}</span>
                      {!uploading && (
                        <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-4 w-4" />
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
              {uploading ? 'Uploading…' : `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`}
            </Button>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* ShareX config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" />ShareX Integration
          </CardTitle>
          <CardDescription>Download the .sxcu config and import it into ShareX</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Button variant="outline" asChild>
            <a href="/api/sharex-config" download>Download .sxcu</a>
          </Button>
        </CardContent>
      </Card>

      {/* API */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Upload</CardTitle>
          <CardDescription>Use curl or any HTTP client</CardDescription>
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
              <RefreshCw className="h-3.5 w-3.5" />Regenerate key
            </Button>
            {apiKey && (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <code className="text-xs bg-muted px-2 py-1 rounded truncate flex-1">{apiKey}</code>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(apiKey)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
