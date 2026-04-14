import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { fmtSize, fmtDate } from '@/lib/utils';
import { Download, Trash2, Copy, ExternalLink, Eye, Calendar, User } from 'lucide-react';

// Highlight.js loaded from CDN inside <head> for code files
function CodeViewer({ shortId, lang }) {
  const [code, setCode] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch(`/f/${shortId}/raw`)
      .then((r) => r.text())
      .then((text) => { setCode(text); setReady(true); });
  }, [shortId]);

  useEffect(() => {
    if (!ready) return;
    if (window.hljs) {
      document.querySelectorAll('pre code.hljs-target').forEach((el) => window.hljs.highlightElement(el));
    }
  }, [ready, code]);

  return (
    <ScrollArea className="h-[70vh] w-full">
      <pre className="p-4 text-sm leading-relaxed">
        <code className={`hljs-target language-${lang || 'plaintext'}`}>{code}</code>
      </pre>
    </ScrollArea>
  );
}

function FileViewer({ file }) {
  const { displayType, shortId, mimeType } = file;
  const ext = (file.originalName.split('.').pop() || '').toLowerCase();

  const hlExts = {
    js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    c: 'c', cpp: 'cpp', h: 'c', cs: 'csharp', php: 'php',
    sh: 'bash', bash: 'bash', zsh: 'bash',
    yml: 'yaml', yaml: 'yaml', toml: 'toml', json: 'json',
    xml: 'xml', html: 'html', css: 'css', scss: 'scss',
    md: 'markdown', sql: 'sql', kt: 'kotlin', swift: 'swift', lua: 'lua',
  };
  const lang = hlExts[ext] || 'plaintext';

  if (displayType === 'image') {
    return (
      <div className="flex items-center justify-center p-4 min-h-[40vh] bg-[repeating-conic-gradient(hsl(var(--muted))_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]">
        <img src={`/f/${shortId}/raw`} alt={file.originalName} className="max-w-full max-h-[80vh] object-contain rounded" />
      </div>
    );
  }

  if (displayType === 'video') {
    return (
      <video controls className="w-full max-h-[80vh] bg-black" preload="metadata">
        <source src={`/f/${shortId}/raw`} type={mimeType} />
      </video>
    );
  }

  if (displayType === 'audio') {
    return (
      <div className="flex items-center justify-center p-12">
        <audio controls className="w-full max-w-lg">
          <source src={`/f/${shortId}/raw`} type={mimeType} />
        </audio>
      </div>
    );
  }

  if (displayType === 'pdf') {
    return <iframe src={`/f/${shortId}/raw`} className="w-full h-[80vh] border-0" title={file.originalName} />;
  }

  if (displayType === 'code' || displayType === 'text') {
    return <CodeViewer shortId={shortId} lang={displayType === 'code' ? lang : 'plaintext'} />;
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
      <Download className="h-16 w-16 opacity-20" />
      <p className="text-lg font-medium">{file.originalName}</p>
      <p className="text-sm">{fmtSize(file.size)}</p>
      <Button asChild>
        <a href={`/f/${shortId}/download`}><Download className="h-4 w-4 mr-2" />Download</a>
      </Button>
    </div>
  );
}

function FileViewInner() {
  const { shortId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/file/${shortId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => setFile(data.file))
      .catch((code) => setError(code === 404 ? 'File not found' : 'Failed to load file'));
  }, [shortId]);

  // Load highlight.js from CDN when needed
  useEffect(() => {
    if (!file) return;
    if (file.displayType === 'code' || file.displayType === 'text') {
      if (!document.getElementById('hljs-css')) {
        const link = document.createElement('link');
        link.id = 'hljs-css';
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
        document.head.appendChild(link);
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js';
        document.head.appendChild(script);
      }
    }
  }, [file]);

  async function handleDelete() {
    const r = await fetch(`/api/file/${shortId}`, { method: 'DELETE' });
    if (r.ok) {
      toast({ title: 'File deleted' });
      navigate('/gallery');
    } else {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  }

  function copyUrl() {
    const url = `${window.location.origin}/f/${shortId}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'URL copied' });
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-xl font-semibold">{error}</p>
        <Button asChild variant="outline"><Link to="/gallery">Back to gallery</Link></Button>
      </div>
    );
  }

  if (!file) {
    return <div className="flex justify-center py-24 text-muted-foreground text-sm animate-pulse">Loading…</div>;
  }

  const canDelete = user && (user.id === file.uploader?._id || user.role === 'admin');

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Info bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <h1 className="font-semibold text-lg truncate" title={file.originalName}>
                {file.originalName}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                <Badge variant="secondary">{file.displayType}</Badge>
                <span>{fmtSize(file.size)}</span>
                <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{file.views}</span>
                {file.uploader && <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{file.uploader.username}</span>}
                <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{fmtDate(file.createdAt)}</span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap">
              <Button variant="outline" size="sm" onClick={copyUrl} className="gap-1.5">
                <Copy className="h-3.5 w-3.5" />Copy URL
              </Button>
              <Button variant="outline" size="sm" asChild className="gap-1.5">
                <a href={`/f/${shortId}/download`}><Download className="h-3.5 w-3.5" />Download</a>
              </Button>
              <Button variant="outline" size="sm" asChild className="gap-1.5">
                <a href={`/f/${shortId}/raw`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />Raw
                </a>
              </Button>
              {canDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="gap-1.5">
                      <Trash2 className="h-3.5 w-3.5" />Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete file?</AlertDialogTitle>
                      <AlertDialogDescription>
                        "{file.originalName}" will be permanently deleted. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Viewer */}
      <Card className="overflow-hidden">
        <FileViewer file={file} />
      </Card>
    </div>
  );
}

// FileView wraps itself in Layout + optional auth (file viewing is public, but layout needs user)
export default function FileView() {
  const { user } = useAuth();

  if (user) {
    return <Layout><FileViewInner /></Layout>;
  }
  // Public access — no layout navbar
  return (
    <div className="min-h-screen flex flex-col">
      <div className="max-w-5xl mx-auto w-full px-4 py-6 flex-1">
        <FileViewInner />
      </div>
    </div>
  );
}
