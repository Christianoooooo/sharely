import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDownload, faLock, faHourglass, faCircleXmark, faEye,
} from '@fortawesome/free-solid-svg-icons';
import { fmtSize, fmtDate } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Layout } from '@/components/Layout';

function ShareViewInner() {
  const { token } = useParams();
  const { t } = useTranslation();
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | password | ready | error
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    fetch(`/api/share-links/${token}`)
      .then(async (r) => {
        if (r.status === 410) { setStatus('error'); setErrorMsg(t('shareView.expired')); return; }
        if (r.status === 403) { setStatus('error'); setErrorMsg(t('shareView.limitReached')); return; }
        if (!r.ok) { setStatus('error'); setErrorMsg(t('shareView.notFound')); return; }
        const data = await r.json();
        setMeta(data);
        setStatus(data.hasPassword ? 'password' : 'ready');
      })
      .catch(() => { setStatus('error'); setErrorMsg(t('shareView.loadFailed')); });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleVerify(e) {
    e.preventDefault();
    setVerifying(true);
    setPwError('');
    try {
      const r = await fetch(`/api/share-links/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (r.ok) {
        setStatus('ready');
      } else {
        setPwError(t('shareView.wrongPassword'));
      }
    } finally {
      setVerifying(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-24 text-muted-foreground text-sm animate-pulse">
        {t('shareView.loading')}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <FontAwesomeIcon icon={faCircleXmark} className="h-12 w-12 text-destructive opacity-60" />
        <p className="text-xl font-semibold">{errorMsg}</p>
        <Button asChild variant="outline"><Link to="/auth/login">{t('shareView.goToLogin')}</Link></Button>
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
              <span className="font-medium">{t('shareView.passwordRequired')}</span>
            </div>
            <p className="text-sm text-muted-foreground">{meta?.file?.originalName}</p>
            <form onSubmit={handleVerify} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="pw">{t('shareView.passwordLabel')}</Label>
                <Input
                  id="pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
                {pwError && <p className="text-sm text-destructive">{pwError}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={verifying || !password}>
                {verifying ? t('shareView.verifying') : t('shareView.unlock')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const file = meta?.file;
  const isInline = file && /^(image|video|audio)\//.test(file.mimeType);
  const isPdf = file?.mimeType === 'application/pdf';

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <h1 className="font-semibold text-lg truncate" title={file?.originalName}>
                {file?.originalName}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                {file?.size != null && <span>{fmtSize(file.size)}</span>}
                {meta?.expiresAt && (
                  <span className="flex items-center gap-1">
                    <FontAwesomeIcon icon={faHourglass} className="h-3.5 w-3.5" />
                    {t('shareView.expiresAt', { date: fmtDate(meta.expiresAt) })}
                  </span>
                )}
                {meta?.downloadLimit !== -1 && (
                  <Badge variant="secondary">
                    {t('shareView.downloads', { count: meta.downloadCount, limit: meta.downloadLimit })}
                  </Badge>
                )}
                {meta?.label && <Badge variant="outline">{meta.label}</Badge>}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap w-full sm:w-auto">
              {(isInline || isPdf) && (
                <Button variant="outline" size="sm" asChild className="gap-1.5">
                  <a href={`/s/${token}/raw`} target="_blank" rel="noreferrer">
                    <FontAwesomeIcon icon={faEye} className="h-3.5 w-3.5" />
                    {t('shareView.view')}
                  </a>
                </Button>
              )}
              <Button size="sm" asChild className="gap-1.5">
                <a href={`/s/${token}/download`}>
                  <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5" />
                  {t('shareView.download')}
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inline preview */}
      {isInline && (
        <Card className="overflow-hidden">
          {/^image\//.test(file.mimeType) && (
            <div className="flex items-center justify-center p-4 min-h-[40vh]">
              <img
                src={`/s/${token}/raw`}
                alt={file.originalName}
                className="max-w-full max-h-[80vh] object-contain rounded"
              />
            </div>
          )}
          {/^video\//.test(file.mimeType) && (
            <video controls className="w-full max-h-[70vh] bg-black" preload="metadata">
              <source src={`/s/${token}/raw`} type={file.mimeType} />
            </video>
          )}
          {/^audio\//.test(file.mimeType) && (
            <div className="flex items-center justify-center p-12">
              <audio controls className="w-full max-w-lg">
                <source src={`/s/${token}/raw`} type={file.mimeType} />
              </audio>
            </div>
          )}
        </Card>
      )}
      {isPdf && (
        <Card className="overflow-hidden">
          <iframe src={`/s/${token}/raw`} className="w-full h-[80vh] border-0" title={file.originalName} />
        </Card>
      )}
    </div>
  );
}

export default function ShareView() {
  const { user } = useAuth();
  if (user) {
    return <Layout><ShareViewInner /></Layout>;
  }
  return (
    <div className="min-h-screen flex flex-col">
      <div className="max-w-3xl mx-auto w-full px-4 py-6 flex-1">
        <ShareViewInner />
      </div>
    </div>
  );
}
