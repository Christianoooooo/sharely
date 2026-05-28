import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faLink, faPlus, faTrash, faCopy, faLock, faHourglass,
  faDownload, faCircleCheck, faCircleXmark,
} from '@fortawesome/free-solid-svg-icons';
import { fmtDate } from '@/lib/utils';
import { DateTimePicker } from '@/components/ui/date-time-picker';

function CreateLinkForm({ shortId, onCreated }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [label, setLabel] = useState('');
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [downloadLimit, setDownloadLimit] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { label };
      if (password) body.password = password;
      if (expiresAt) body.expiresAt = expiresAt;
      if (downloadLimit) body.downloadLimit = parseInt(downloadLimit, 10);

      const r = await fetch(`/api/file/${shortId}/share-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const d = await r.json();
        toast({ title: d.error || t('shareLink.createFailed'), variant: 'destructive' });
        return;
      }

      const link = await r.json();
      toast({ title: t('shareLink.created') });
      setLabel(''); setPassword(''); setExpiresAt(''); setDownloadLimit('');
      onCreated(link);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-1">
      <p className="text-sm font-medium text-muted-foreground">{t('shareLink.newLink')}</p>

      <div className="space-y-1">
        <Label htmlFor="sl-label">{t('shareLink.label')} <span className="text-muted-foreground">({t('shareLink.optional')})</span></Label>
        <Input id="sl-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('shareLink.labelPlaceholder')} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="sl-pw">
            <FontAwesomeIcon icon={faLock} className="h-3 w-3 mr-1" />
            {t('shareLink.password')} <span className="text-muted-foreground">({t('shareLink.optional')})</span>
          </Label>
          <Input id="sl-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('shareLink.noPassword')} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sl-dl">
            <FontAwesomeIcon icon={faDownload} className="h-3 w-3 mr-1" />
            {t('shareLink.downloadLimit')} <span className="text-muted-foreground">({t('shareLink.optional')})</span>
          </Label>
          <Input id="sl-dl" type="number" min="1" value={downloadLimit} onChange={(e) => setDownloadLimit(e.target.value)} placeholder={t('shareLink.unlimited')} />
        </div>
      </div>

      <div className="space-y-1">
        <Label>
          <FontAwesomeIcon icon={faHourglass} className="h-3 w-3 mr-1" />
          {t('shareLink.expiresAt')} <span className="text-muted-foreground">({t('shareLink.optional')})</span>
        </Label>
        <DateTimePicker onChange={setExpiresAt} />
      </div>

      <Button type="submit" size="sm" disabled={saving} className="w-full gap-1.5">
        <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
        {saving ? t('shareLink.creating') : t('shareLink.create')}
      </Button>
    </form>
  );
}

function LinkRow({ link, onDelete }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyUrl() {
    navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const r = await fetch(`/api/share-links/${link.token}`, { method: 'DELETE' });
      if (r.ok) {
        toast({ title: t('shareLink.deleted') });
        onDelete(link.token);
      } else {
        toast({ title: t('shareLink.deleteFailed'), variant: 'destructive' });
      }
    } finally {
      setDeleting(false);
    }
  }

  const isExpired = link.expired;
  const isLimitReached = link.limitReached;
  const inactive = isExpired || isLimitReached;

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${inactive ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          {link.label && <p className="text-sm font-medium">{link.label}</p>}
          <p className="text-xs text-muted-foreground font-mono truncate">{link.url}</p>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {link.hasPassword && (
              <Badge variant="outline" className="gap-1">
                <FontAwesomeIcon icon={faLock} className="h-2.5 w-2.5" />
                {t('shareLink.passwordSet')}
              </Badge>
            )}
            {link.expiresAt && (
              <Badge variant={isExpired ? 'destructive' : 'outline'} className="gap-1">
                <FontAwesomeIcon icon={faHourglass} className="h-2.5 w-2.5" />
                {isExpired ? t('shareLink.expired') : fmtDate(link.expiresAt)}
              </Badge>
            )}
            {link.downloadLimit !== -1 && (
              <Badge variant={isLimitReached ? 'destructive' : 'secondary'} className="gap-1">
                <FontAwesomeIcon icon={faDownload} className="h-2.5 w-2.5" />
                {link.downloadCount}/{link.downloadLimit}
              </Badge>
            )}
            {!inactive && (
              <Badge variant="secondary" className="gap-1 text-green-600">
                <FontAwesomeIcon icon={faCircleCheck} className="h-2.5 w-2.5" />
                {t('shareLink.active')}
              </Badge>
            )}
            {inactive && (
              <Badge variant="secondary" className="gap-1 text-destructive">
                <FontAwesomeIcon icon={faCircleXmark} className="h-2.5 w-2.5" />
                {isExpired ? t('shareLink.expired') : t('shareLink.limitReached')}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copyUrl} title={t('shareLink.copyUrl')}>
            <FontAwesomeIcon icon={copied ? faCircleCheck : faCopy} className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={handleDelete} disabled={deleting} title={t('shareLink.delete')}>
            <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ShareLinkDialog({ shortId, children }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);

  useWebSocket(useCallback((event, data) => {
    if (event === 'sharelink:download') {
      setLinks((prev) => prev.map((l) =>
        l.token === data.token
          ? { ...l, downloadCount: data.downloadCount, limitReached: data.limitReached }
          : l,
      ));
    }
  }, []));

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/file/${shortId}/share-links`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => setLinks(d.links))
      .catch(() => setLinks([]))
      .finally(() => setLoading(false));
  }, [open, shortId]);

  function handleCreated(link) {
    setLinks((prev) => [link, ...prev]);
  }

  function handleDeleted(token) {
    setLinks((prev) => prev.filter((l) => l.token !== token));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FontAwesomeIcon icon={faLink} className="h-4 w-4" />
            {t('shareLink.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-4 p-0.5">
          <CreateLinkForm shortId={shortId} onCreated={handleCreated} />

          {(links.length > 0 || loading) && <Separator />}

          {loading && (
            <p className="text-sm text-muted-foreground animate-pulse">{t('shareLink.loading')}</p>
          )}

          {!loading && links.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">{t('shareLink.existing')}</p>
              {links.map((link) => (
                <LinkRow key={link.token} link={link} onDelete={handleDeleted} />
              ))}
            </div>
          )}

          {!loading && links.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">{t('shareLink.none')}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
