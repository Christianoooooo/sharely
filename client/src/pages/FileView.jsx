import { useState, useEffect, useRef } from 'react';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import php from 'highlight.js/lib/languages/php';
import bash from 'highlight.js/lib/languages/bash';
import yaml from 'highlight.js/lib/languages/yaml';
import toml from 'highlight.js/lib/languages/ini';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import markdown from 'highlight.js/lib/languages/markdown';
import sql from 'highlight.js/lib/languages/sql';
import kotlin from 'highlight.js/lib/languages/kotlin';
import swift from 'highlight.js/lib/languages/swift';
import lua from 'highlight.js/lib/languages/lua';
import 'highlight.js/styles/github-dark.min.css';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('java', java);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('php', php);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('toml', toml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('scss', scss);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('lua', lua);
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
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faTrash, faCopy, faArrowUpRightFromSquare, faEye, faCalendar, faUser } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';

function CodeViewer({ shortId, lang }) {
  const [code, setCode] = useState('');
  const codeRef = useRef(null);

  useEffect(() => {
    fetch(`/f/${shortId}/raw`)
      .then((r) => r.text())
      .then((text) => setCode(text));
  }, [shortId]);

  useEffect(() => {
    if (code && codeRef.current) {
      codeRef.current.removeAttribute('data-highlighted');
      hljs.highlightElement(codeRef.current);
    }
  }, [code]);

  return (
    <ScrollArea className="h-[70vh] w-full">
      <pre className="p-4 text-sm leading-relaxed">
        <code ref={codeRef} className={`language-${lang || 'plaintext'}`}>{code}</code>
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
      <div className="flex items-center justify-center p-4 min-h-[60vh]">
        <img
          src={`/f/${shortId}/raw`}
          alt={file.originalName}
          className="max-w-full max-h-[90vh] object-contain rounded cursor-zoom-in"
          onDoubleClick={() => window.open(`/f/${shortId}/raw`, '_blank')}
        />
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
      <FontAwesomeIcon icon={faDownload} className="h-16 w-16 opacity-20" />
      <p className="text-lg font-medium">{file.originalName}</p>
      <p className="text-sm">{fmtSize(file.size)}</p>
      <Button asChild>
        <a href={`/f/${shortId}/download`}><FontAwesomeIcon icon={faDownload} className="h-4 w-4 mr-2" />Download</a>
      </Button>
    </div>
  );
}

function FileViewInner() {
  const { shortId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/file/${shortId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => setFile(data.file))
      .catch((code) => setError(code === 404 ? t('fileView.fileNotFound') : t('fileView.loadFailed')));
  }, [shortId, t]);

  async function handleDelete() {
    const r = await fetch(`/api/file/${shortId}`, { method: 'DELETE' });
    if (r.ok) {
      toast({ title: t('fileView.fileDeleted') });
      navigate('/gallery');
    } else {
      toast({ title: t('fileView.deleteFailed'), variant: 'destructive' });
    }
  }

  function copyUrl() {
    const url = `${window.location.origin}/f/${shortId}`;
    navigator.clipboard.writeText(url);
    toast({ title: t('fileView.urlCopied') });
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-xl font-semibold">{error}</p>
        <Button asChild variant="outline"><Link to="/gallery">{t('fileView.backToGallery')}</Link></Button>
      </div>
    );
  }

  if (!file) {
    return <div className="flex justify-center py-24 text-muted-foreground text-sm animate-pulse">{t('fileView.loading')}</div>;
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
                <span className="flex items-center gap-1"><FontAwesomeIcon icon={faEye} className="h-3.5 w-3.5" />{file.views}</span>
                {file.uploader && <span className="flex items-center gap-1"><FontAwesomeIcon icon={faUser} className="h-3.5 w-3.5" />{file.uploader.username}</span>}
                <span className="flex items-center gap-1"><FontAwesomeIcon icon={faCalendar} className="h-3.5 w-3.5" />{fmtDate(file.createdAt)}</span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap">
              <Button variant="outline" size="sm" onClick={copyUrl} className="gap-1.5">
                <FontAwesomeIcon icon={faCopy} className="h-3.5 w-3.5" />{t('fileView.copyUrl')}
              </Button>
              <Button variant="outline" size="sm" asChild className="gap-1.5">
                <a href={`/f/${shortId}/download`}><FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5" />{t('fileView.download')}</a>
              </Button>
              <Button variant="outline" size="sm" asChild className="gap-1.5">
                <a href={`/f/${shortId}/raw`} target="_blank" rel="noreferrer">
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3.5 w-3.5" />{t('fileView.raw')}
                </a>
              </Button>
              {canDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="gap-1.5">
                      <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />{t('fileView.delete')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('fileView.deleteTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('fileView.deleteDescription', { name: file.originalName })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('fileView.cancel')}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        {t('fileView.confirmDelete')}
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
