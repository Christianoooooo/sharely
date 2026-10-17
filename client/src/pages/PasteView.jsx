import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faLock, faHourglass, faCircleXmark, faFileLines, faCopy, faDownload,
  faArrowUpRightFromSquare, faEye, faEyeSlash,
} from '@fortawesome/free-solid-svg-icons';
import { fmtDate } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Layout } from '@/components/Layout';
import { useToast } from '@/hooks/use-toast';
import hljs from '@/lib/highlight';
import 'highlight.js/styles/github-dark.min.css';

function CodeViewer({ content, lang }) {
  const codeRef = useRef(null);

  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.removeAttribute('data-highlighted');
      hljs.highlightElement(codeRef.current);
    }
  }, [content, lang]);

  return (
    <ScrollArea className="h-[60vh] w-full rounded-md border bg-muted/30">
      <pre className="p-4 text-sm leading-relaxed">
        <code ref={codeRef} className={`language-${lang || 'plaintext'}`}>{content}</code>
      </pre>
    </ScrollArea>
  );
}

function PasteViewInner() {
  const { shortId } = useParams();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [paste, setPaste] = useState(null);
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [pwError, setPwError] = useState('');

  async function load() {
    try {
      const r = await fetch(`/api/pastes/${shortId}`);
      if (r.status === 410) { setStatus('error'); setErrorMsg(t('pasteView.expired')); return; }
      if (!r.ok) { setStatus('error'); setErrorMsg(t('pasteView.notFound')); return; }
      const data = await r.json();
      setPaste(data);
      setStatus(data.needsPassword ? 'password' : 'ready');
    } catch {
      setStatus('error'); setErrorMsg(t('pasteView.loadFailed'));
    }
  }

  useEffect(() => { load(); }, [shortId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleVerify(e) {
    e.preventDefault();
    setVerifying(true);
    setPwError('');
    try {
      const r = await fetch(`/api/pastes/${shortId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (r.ok) await load();
      else setPwError(t('pasteView.wrongPassword'));
    } finally {
      setVerifying(false);
    }
  }

  function copyContent() {
    navigator.clipboard.writeText(paste.content);
    toast({ title: t('pasteView.copied') });
  }

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-24 text-muted-foreground text-sm animate-pulse">
        {t('pasteView.loading')}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <FontAwesomeIcon icon={faCircleXmark} className="h-12 w-12 text-destructive opacity-60" />
        <p className="text-xl font-semibold">{errorMsg}</p>
        <Button asChild variant="outline"><Link to="/">{t('pasteView.goHome')}</Link></Button>
      </div>
    );
  }

  if (status === 'password') {
    return (
      <div className="flex justify-center py-16">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <FontAwesomeIcon icon={faLock} className="h-4 w-4" />
              <span className="font-medium">{t('pasteView.passwordRequired')}</span>
            </div>
            {paste?.title && <p className="text-sm font-medium">{paste.title}</p>}
            <form onSubmit={handleVerify} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="pw">{t('pasteView.passwordLabel')}</Label>
                <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
                {pwError && <p className="text-sm text-destructive">{pwError}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={verifying || !password}>
                {verifying ? t('pasteView.verifying') : t('pasteView.unlock')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rawUrl = `/api/pastes/${paste.shortId}/raw`;
  const downloadName = `${(paste.title || paste.shortId).replace(/[^\w.\- ]+/g, '_').slice(0, 60) || paste.shortId}.txt`;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <FontAwesomeIcon icon={faFileLines} className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="min-w-0 flex-1">
              <h1 className="font-semibold text-lg truncate">{paste.title || t('pastes.untitled')}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
                <span>{t('pasteView.by', { owner: paste.owner })}</span>
                <Badge variant="secondary">{paste.language}</Badge>
                <span className="flex items-center gap-1">
                  <FontAwesomeIcon icon={faEye} className="h-3.5 w-3.5" />{paste.views}
                </span>
                {paste.isPrivate && (
                  <span className="flex items-center gap-1">
                    <FontAwesomeIcon icon={faEyeSlash} className="h-3.5 w-3.5" />{t('pastes.private')}
                  </span>
                )}
                {paste.expiresAt && (
                  <span className="flex items-center gap-1">
                    <FontAwesomeIcon icon={faHourglass} className="h-3.5 w-3.5" />
                    {t('pasteView.expiresAt', { date: fmtDate(paste.expiresAt) })}
                  </span>
                )}
                <span>{fmtDate(paste.createdAt)}</span>
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={copyContent} title={t('pasteView.copy')}>
                <FontAwesomeIcon icon={faCopy} className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" asChild title={t('pasteView.raw')}>
                <a href={rawUrl} target="_blank" rel="noreferrer">
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-4 w-4" />
                </a>
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" asChild title={t('pasteView.download')}>
                <a href={rawUrl} download={downloadName}>
                  <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <CodeViewer content={paste.content} lang={paste.language} />

      {paste.isOwner && (
        <p className="text-sm text-muted-foreground text-center">
          <Link to="/pastes" className="underline">{t('pasteView.manage')}</Link>
        </p>
      )}
    </div>
  );
}

export default function PasteView() {
  const { user } = useAuth();
  if (user) return <Layout><PasteViewInner /></Layout>;
  return (
    <div className="min-h-screen flex flex-col">
      <div className="max-w-4xl mx-auto w-full px-4 py-6 flex-1">
        <PasteViewInner />
      </div>
    </div>
  );
}
