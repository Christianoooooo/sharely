import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFolder, faPlus, faTrash, faCopy, faLock, faHourglass, faPen,
  faArrowUpRightFromSquare,
} from '@fortawesome/free-solid-svg-icons';
import { fmtDate } from '@/lib/utils';
import { DateTimePicker } from '@/components/ui/date-time-picker';

function CreateCollectionDialog({ onCreated }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), description: description.trim() };
      if (password) body.password = password;
      if (expiresAt) body.expiresAt = expiresAt;

      const r = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const d = await r.json();
        toast({ title: d.error || t('collections.createFailed'), variant: 'destructive' });
        return;
      }

      const coll = await r.json();
      toast({ title: t('collections.created') });
      onCreated(coll);
      setOpen(false);
      setName(''); setDescription(''); setPassword(''); setExpiresAt('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
          {t('collections.new')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('collections.newTitle')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="coll-name">{t('collections.name')}</Label>
            <Input id="coll-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1">
            <Label htmlFor="coll-desc">{t('collections.description')} <span className="text-muted-foreground">({t('shareLink.optional')})</span></Label>
            <Textarea id="coll-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="resize-none" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="coll-pw">
              <FontAwesomeIcon icon={faLock} className="h-3 w-3 mr-1" />
              {t('collections.password')} <span className="text-muted-foreground">({t('shareLink.optional')})</span>
            </Label>
            <Input id="coll-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('shareLink.noPassword')} />
          </div>
          <div className="space-y-1">
            <Label>
              <FontAwesomeIcon icon={faHourglass} className="h-3 w-3 mr-1" />
              {t('shareLink.expiresAt')} <span className="text-muted-foreground">({t('shareLink.optional')})</span>
            </Label>
            <DateTimePicker onChange={setExpiresAt} />
          </div>
          <Button type="submit" className="w-full" disabled={saving || !name.trim()}>
            {saving ? t('collections.creating') : t('collections.createBtn')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditCollectionDialog({ coll, onUpdated }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const [expiresAt, setExpiresAt] = useState(null);
  const [dialogKey, setDialogKey] = useState(0);
  const [saving, setSaving] = useState(false);

  function handleOpen(val) {
    if (val) {
      setName(coll.name);
      setDescription(coll.description || '');
      setPassword('');
      setClearPassword(false);
      setExpiresAt(coll.expiresAt ?? null);
      setDialogKey((k) => k + 1);
    }
    setOpen(val);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), description: description.trim(), clearPassword };
      if (password) body.password = password;
      if (coll.expiresAt && !expiresAt) body.clearExpiry = true;
      else if (expiresAt) body.expiresAt = expiresAt;

      const r = await fetch(`/api/collections/${coll.shortId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json();
        toast({ title: d.error || t('collections.saveFailed'), variant: 'destructive' });
        return;
      }
      const updated = await r.json();
      toast({ title: t('collections.saved') });
      onUpdated(updated);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7" title={t('collections.edit')}>
          <FontAwesomeIcon icon={faPen} className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('collections.editTitle')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="edit-name">{t('collections.name')}</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-desc">{t('collections.description')} <span className="text-muted-foreground">({t('shareLink.optional')})</span></Label>
            <Textarea id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="resize-none" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-pw">
              <FontAwesomeIcon icon={faLock} className="h-3 w-3 mr-1" />
              {t('collections.password')} <span className="text-muted-foreground">({t('shareLink.optional')})</span>
            </Label>
            <Input id="edit-pw" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setClearPassword(false); }} placeholder={coll.hasPassword ? '••••••••' : t('shareLink.noPassword')} />
            {coll.hasPassword && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={clearPassword}
                  onCheckedChange={(v) => { setClearPassword(!!v); if (v) setPassword(''); }}
                />
                {t('collections.clearPassword')}
              </label>
            )}
          </div>
          <div className="space-y-1">
            <Label>
              <FontAwesomeIcon icon={faHourglass} className="h-3 w-3 mr-1" />
              {t('shareLink.expiresAt')} <span className="text-muted-foreground">({t('shareLink.optional')})</span>
            </Label>
            <DateTimePicker key={dialogKey} defaultValue={coll.expiresAt} onChange={setExpiresAt} />
          </div>
          <Button type="submit" className="w-full" disabled={saving || !name.trim()}>
            {saving ? t('collections.saving') : t('collections.saveBtn')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CollectionCard({ coll, onDelete, onUpdate }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const base = window.location.origin;
  const url = `${base}/c/${coll.shortId}`;

  function copyUrl() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: t('collections.urlCopied') });
  }

  async function handleDelete() {
    const r = await fetch(`/api/collections/${coll.shortId}`, { method: 'DELETE' });
    if (r.ok) {
      toast({ title: t('collections.deleted') });
      onDelete(coll.shortId);
    } else {
      toast({ title: t('collections.deleteFailed'), variant: 'destructive' });
    }
  }

  return (
    <Card className={coll.expired ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faFolder} className="h-4 w-4 text-muted-foreground shrink-0" />
              <Link to={`/c/${coll.shortId}`} className="font-medium hover:underline truncate">
                {coll.name}
              </Link>
            </div>
            {coll.description && (
              <p className="text-sm text-muted-foreground truncate pl-6">{coll.description}</p>
            )}
            <div className="flex flex-wrap gap-1.5 text-xs pl-6">
              <Badge variant="secondary">{t('collections.fileCount', { count: coll.fileCount })}</Badge>
              {coll.hasPassword && (
                <Badge variant="outline" className="gap-1">
                  <FontAwesomeIcon icon={faLock} className="h-2.5 w-2.5" />
                  {t('shareLink.passwordSet')}
                </Badge>
              )}
              {coll.expiresAt && (
                <Badge variant={coll.expired ? 'destructive' : 'outline'} className="gap-1">
                  <FontAwesomeIcon icon={faHourglass} className="h-2.5 w-2.5" />
                  {coll.expired ? t('shareLink.expired') : fmtDate(coll.expiresAt)}
                </Badge>
              )}
              <span className="text-muted-foreground">{fmtDate(coll.createdAt)}</span>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copyUrl} title={t('collections.copyUrl')}>
              <FontAwesomeIcon icon={copied ? faFolder : faCopy} className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" asChild title={t('collections.open')}>
              <Link to={`/c/${coll.shortId}`}>
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <EditCollectionDialog coll={coll} onUpdated={onUpdate} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" title={t('collections.delete')}>
                  <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('collections.deleteTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('collections.deleteDesc', { name: coll.name })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('fileView.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {t('collections.confirmDelete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Collections() {
  const { t } = useTranslation();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/collections')
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => setCollections(d.collections))
      .catch(() => setCollections([]))
      .finally(() => setLoading(false));
  }, []);

  function handleCreated(coll) {
    setCollections((prev) => [coll, ...prev]);
  }

  function handleDeleted(shortId) {
    setCollections((prev) => prev.filter((c) => c.shortId !== shortId));
  }

  function handleUpdated(updated) {
    setCollections((prev) => prev.map((c) => c.shortId === updated.shortId ? { ...c, ...updated } : c));
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('collections.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('collections.subtitle')}</p>
        </div>
        <CreateCollectionDialog onCreated={handleCreated} />
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground animate-pulse py-8 text-center">
          {t('collections.loading')}
        </p>
      )}

      {!loading && collections.length === 0 && (
        <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
          <FontAwesomeIcon icon={faFolder} className="h-12 w-12 opacity-20" />
          <p className="font-medium">{t('collections.empty')}</p>
          <p className="text-sm">{t('collections.emptyHint')}</p>
        </div>
      )}

      {!loading && collections.length > 0 && (
        <div className="space-y-3">
          {collections.map((coll) => (
            <CollectionCard key={coll.shortId} coll={coll} onDelete={handleDeleted} onUpdate={handleUpdated} />
          ))}
        </div>
      )}
    </div>
  );
}
