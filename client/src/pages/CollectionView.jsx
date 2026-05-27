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
  faDownload, faLock, faHourglass, faCircleXmark, faFolder,
  faArrowUpRightFromSquare,
} from '@fortawesome/free-solid-svg-icons';
import { fmtSize, fmtDate } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Layout } from '@/components/Layout';

function FileCard({ file }) {
  const hasThumbnail = file.hasThumbnail;
  const isImage = file.mimeType?.startsWith('image/');
  const showThumbnail = hasThumbnail || isImage;
  const thumbSrc = hasThumbnail
    ? `/f/${file.shortId}/thumb`
    : isImage
      ? `/f/${file.shortId}/raw`
      : null;

  return (
    <div className="group relative bg-card border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      <Link to={`/f/${file.shortId}`} className="block">
        <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
          {showThumbnail && thumbSrc ? (
            <img
              src={thumbSrc}
              alt={file.originalName}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <FontAwesomeIcon
              icon={faFolder}
              className="h-10 w-10 text-muted-foreground opacity-30"
            />
          )}
        </div>
        <div className="p-2">
          <p className="text-xs font-medium truncate" title={file.originalName}>
            {file.originalName}
          </p>
          <p className="text-xs text-muted-foreground">{fmtSize(file.size)}</p>
        </div>
      </Link>
      <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="icon" variant="secondary" className="h-6 w-6" asChild>
          <a href={`/f/${file.shortId}/download`} title="Download" onClick={(e) => e.stopPropagation()}>
            <FontAwesomeIcon icon={faDownload} className="h-3 w-3" />
          </a>
        </Button>
        <Button size="icon" variant="secondary" className="h-6 w-6" asChild>
          <a href={`/f/${file.shortId}/raw`} target="_blank" rel="noreferrer" title="View raw" onClick={(e) => e.stopPropagation()}>
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" />
          </a>
        </Button>
      </div>
    </div>
  );
}

function CollectionViewInner() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [coll, setColl] = useState(null);
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [pwError, setPwError] = useState('');

  async function load() {
    try {
      const r = await fetch(`/api/collections/${id}`);
      if (r.status === 410) { setStatus('error'); setErrorMsg(t('collectionView.expired')); return; }
      if (!r.ok) { setStatus('error'); setErrorMsg(t('collectionView.notFound')); return; }
      const data = await r.json();
      setColl(data);
      setStatus(data.needsPassword ? 'password' : 'ready');
    } catch {
      setStatus('error'); setErrorMsg(t('collectionView.loadFailed'));
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleVerify(e) {
    e.preventDefault();
    setVerifying(true);
    setPwError('');
    try {
      const r = await fetch(`/api/collections/${id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (r.ok) {
        await load();
      } else {
        setPwError(t('collectionView.wrongPassword'));
      }
    } finally {
      setVerifying(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-24 text-muted-foreground text-sm animate-pulse">
        {t('collectionView.loading')}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <FontAwesomeIcon icon={faCircleXmark} className="h-12 w-12 text-destructive opacity-60" />
        <p className="text-xl font-semibold">{errorMsg}</p>
        <Button asChild variant="outline"><Link to="/">{t('collectionView.goHome')}</Link></Button>
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
              <span className="font-medium">{t('collectionView.passwordRequired')}</span>
            </div>
            <p className="text-sm font-medium">{coll?.name}</p>
            {coll?.description && <p className="text-sm text-muted-foreground">{coll.description}</p>}
            <form onSubmit={handleVerify} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="pw">{t('collectionView.passwordLabel')}</Label>
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
                {verifying ? t('collectionView.verifying') : t('collectionView.unlock')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <FontAwesomeIcon icon={faFolder} className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div className="min-w-0 flex-1">
              <h1 className="font-semibold text-lg">{coll.name}</h1>
              {coll.description && (
                <p className="text-sm text-muted-foreground mt-1">{coll.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                <span>{t('collectionView.by', { owner: coll.owner })}</span>
                <Badge variant="secondary">
                  {t('collectionView.fileCount', { count: coll.files.length })}
                </Badge>
                {coll.expiresAt && (
                  <span className="flex items-center gap-1">
                    <FontAwesomeIcon icon={faHourglass} className="h-3.5 w-3.5" />
                    {t('collectionView.expiresAt', { date: fmtDate(coll.expiresAt) })}
                  </span>
                )}
                {coll.hasPassword && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <FontAwesomeIcon icon={faLock} className="h-3.5 w-3.5" />
                    {t('collectionView.protected')}
                  </span>
                )}
                <span className="text-xs">{fmtDate(coll.createdAt)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {coll.files.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground gap-2">
          <FontAwesomeIcon icon={faFolder} className="h-12 w-12 opacity-20" />
          <p>{t('collectionView.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {coll.files.map((file) => <FileCard key={file.shortId} file={file} />)}
        </div>
      )}
    </div>
  );
}

export default function CollectionView() {
  const { user } = useAuth();
  if (user) {
    return <Layout><CollectionViewInner /></Layout>;
  }
  return (
    <div className="min-h-screen flex flex-col">
      <div className="max-w-5xl mx-auto w-full px-4 py-6 flex-1">
        <CollectionViewInner />
      </div>
    </div>
  );
}
