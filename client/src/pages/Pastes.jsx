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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  faFileLines, faPlus, faTrash, faCopy, faLock, faHourglass, faPen,
  faArrowUpRightFromSquare, faEyeSlash, faEye,
} from '@fortawesome/free-solid-svg-icons';
import { fmtDate } from '@/lib/utils';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { PASTE_LANGUAGES } from '@/lib/highlight';

function LanguageSelect({ value, onChange }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-72">
        {PASTE_LANGUAGES.map((l) => (
          <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PasteForm({ initial, onSubmit, saving, submitLabel }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title || '');
  const [language, setLanguage] = useState(initial?.language || 'plaintext');
  const [content, setContent] = useState(initial?.content || '');
  const [isPrivate, setIsPrivate] = useState(initial?.isPrivate || false);
  const [password, setPassword] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt ?? null);

  function submit(e) {
    e.preventDefault();
    if (!content.trim()) return;
    const body = { title: title.trim(), language, content, isPrivate };
    if (initial?.expiresAt && !expiresAt) body.expiresAt = null;
    else if (expiresAt) body.expiresAt = expiresAt;
    if (clearPassword) body.password = '';
    else if (password) body.password = password;
    onSubmit(body);
  }

  const hasPassword = !!initial?.hasPassword;

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="paste-title">{t('pastes.titleField')} <span className="text-muted-foreground">({t('shareLink.optional')})</span></Label>
        <Input id="paste-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={200} />
      </div>
      <div className="space-y-1">
        <Label>{t('pastes.language')}</Label>
        <LanguageSelect value={language} onChange={setLanguage} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="paste-content">{t('pastes.content')}</Label>
        <Textarea
          id="paste-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={12}
          className="font-mono text-sm"
          spellCheck={false}
        />
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Checkbox checked={isPrivate} onCheckedChange={(v) => setIsPrivate(!!v)} />
        <FontAwesomeIcon icon={faEyeSlash} className="h-3 w-3" />
        {t('pastes.private')}
      </label>
      <div className="space-y-1">
        <Label htmlFor="paste-pw">
          <FontAwesomeIcon icon={faLock} className="h-3 w-3 mr-1" />
          {t('collections.password')} <span className="text-muted-foreground">({t('shareLink.optional')})</span>
        </Label>
        <Input id="paste-pw" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setClearPassword(false); }} placeholder={hasPassword ? '••••••••' : t('shareLink.noPassword')} />
        {hasPassword && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox checked={clearPassword} onCheckedChange={(v) => { setClearPassword(!!v); if (v) setPassword(''); }} />
            {t('collections.clearPassword')}
          </label>
        )}
      </div>
      <div className="space-y-1">
        <Label>
          <FontAwesomeIcon icon={faHourglass} className="h-3 w-3 mr-1" />
          {t('shareLink.expiresAt')} <span className="text-muted-foreground">({t('shareLink.optional')})</span>
        </Label>
        <DateTimePicker defaultValue={initial?.expiresAt} onChange={setExpiresAt} />
      </div>
      <Button type="submit" className="w-full" disabled={saving || !content.trim()}>
        {saving ? t('pastes.saving') : submitLabel}
      </Button>
    </form>
  );
}

function CreatePasteDialog({ onCreated }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleCreate(body) {
    setSaving(true);
    try {
      const r = await fetch('/api/pastes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast({ title: d.error || t('pastes.createFailed'), variant: 'destructive' });
        return;
      }
      toast({ title: t('pastes.created') });
      onCreated();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
          {t('pastes.new')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('pastes.newTitle')}</DialogTitle>
        </DialogHeader>
        <PasteForm onSubmit={handleCreate} saving={saving} submitLabel={t('pastes.createBtn')} />
      </DialogContent>
    </Dialog>
  );
}

function EditPasteDialog({ paste, onUpdated }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initial, setInitial] = useState(null);

  async function handleOpen(val) {
    setOpen(val);
    // Reset so the form always remounts with freshly fetched data, never stale
    // state from a previous edit.
    setInitial(null);
    if (val) {
      // The list carries only a preview; fetch the full content to edit.
      const r = await fetch(`/api/pastes/${paste.shortId}`);
      if (r.ok) {
        const d = await r.json();
        setInitial({ ...d, hasPassword: paste.hasPassword });
      }
    }
  }

  async function handleSave(body) {
    setSaving(true);
    try {
      const r = await fetch(`/api/pastes/${paste.shortId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast({ title: d.error || t('pastes.saveFailed'), variant: 'destructive' });
        return;
      }
      toast({ title: t('pastes.saved') });
      onUpdated();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7" title={t('pastes.edit')}>
          <FontAwesomeIcon icon={faPen} className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('pastes.editTitle')}</DialogTitle>
        </DialogHeader>
        {initial
          ? <PasteForm initial={initial} onSubmit={handleSave} saving={saving} submitLabel={t('pastes.saveBtn')} />
          : <p className="text-sm text-muted-foreground py-6 text-center animate-pulse">{t('pastes.loading')}</p>}
      </DialogContent>
    </Dialog>
  );
}

function PasteCard({ paste, onChanged }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const url = `${window.location.origin}/p/${paste.shortId}`;

  function copyUrl() {
    navigator.clipboard.writeText(url);
    toast({ title: t('pastes.urlCopied') });
  }

  async function handleDelete() {
    const r = await fetch(`/api/pastes/${paste.shortId}`, { method: 'DELETE' });
    if (r.ok) {
      toast({ title: t('pastes.deleted') });
      onChanged();
    } else {
      toast({ title: t('pastes.deleteFailed'), variant: 'destructive' });
    }
  }

  return (
    <Card className={paste.expired ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faFileLines} className="h-4 w-4 text-muted-foreground shrink-0" />
              <Link to={`/p/${paste.shortId}`} className="font-medium hover:underline truncate">
                {paste.title || t('pastes.untitled')}
              </Link>
            </div>
            {paste.preview && (
              <p className="text-xs text-muted-foreground font-mono truncate pl-6">{paste.preview}</p>
            )}
            <div className="flex flex-wrap gap-1.5 text-xs pl-6">
              <Badge variant="secondary">{paste.language}</Badge>
              <Badge variant="outline" className="gap-1">
                <FontAwesomeIcon icon={faEye} className="h-2.5 w-2.5" />{paste.views}
              </Badge>
              {paste.isPrivate && (
                <Badge variant="outline" className="gap-1">
                  <FontAwesomeIcon icon={faEyeSlash} className="h-2.5 w-2.5" />{t('pastes.private')}
                </Badge>
              )}
              {paste.hasPassword && (
                <Badge variant="outline" className="gap-1">
                  <FontAwesomeIcon icon={faLock} className="h-2.5 w-2.5" />{t('shareLink.passwordSet')}
                </Badge>
              )}
              {paste.expiresAt && (
                <Badge variant={paste.expired ? 'destructive' : 'outline'} className="gap-1">
                  <FontAwesomeIcon icon={faHourglass} className="h-2.5 w-2.5" />
                  {paste.expired ? t('shareLink.expired') : fmtDate(paste.expiresAt)}
                </Badge>
              )}
              <span className="text-muted-foreground">{fmtDate(paste.createdAt)}</span>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copyUrl} title={t('pastes.copyUrl')}>
              <FontAwesomeIcon icon={faCopy} className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" asChild title={t('pastes.open')}>
              <Link to={`/p/${paste.shortId}`}>
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <EditPasteDialog paste={paste} onUpdated={onChanged} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" title={t('pastes.delete')}>
                  <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('pastes.deleteTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>{t('pastes.deleteDesc')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('fileView.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {t('pastes.confirmDelete')}
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

export default function Pastes() {
  const { t } = useTranslation();
  const [pastes, setPastes] = useState([]);
  const [loading, setLoading] = useState(true);

  function load() {
    fetch('/api/pastes')
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => setPastes(d.pastes))
      .catch(() => setPastes([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('pastes.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('pastes.subtitle')}</p>
        </div>
        <CreatePasteDialog onCreated={load} />
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground animate-pulse py-8 text-center">{t('pastes.loading')}</p>
      )}

      {!loading && pastes.length === 0 && (
        <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
          <FontAwesomeIcon icon={faFileLines} className="h-12 w-12 opacity-20" />
          <p className="font-medium">{t('pastes.empty')}</p>
          <p className="text-sm">{t('pastes.emptyHint')}</p>
        </div>
      )}

      {!loading && pastes.length > 0 && (
        <div className="space-y-3">
          {pastes.map((p) => (
            <PasteCard key={p.shortId} paste={p} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}
