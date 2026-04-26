import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faKey, faUser, faTrash, faUpload, faGlobe, faShareNodes, faShield, faDownload, faPencil } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function Settings() {
  const { toast } = useToast();
  const { user, refreshUser, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  // Password form
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);

  // Username change
  const [usernameForm, setUsernameForm] = useState({ newUsername: '', password: '' });
  const [savingUsername, setSavingUsername] = useState(false);

  // Avatar
  const avatarInputRef = useRef(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Embed mode
  const [embedMode, setEmbedMode] = useState(user?.embedMode || 'embed');
  const [savingEmbed, setSavingEmbed] = useState(false);

  // GDPR: export
  const [exporting, setExporting] = useState(false);

  // GDPR: delete account
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // GDPR: objection
  const [operatorEmail, setOperatorEmail] = useState('');

  useEffect(() => {
    fetch('/api/site-settings')
      .then((r) => r.ok ? r.json() : {})
      .then((data) => {
        setOperatorEmail(data.operatorEmail || '');
      })
      .catch(() => {});
  }, []);

  async function handleEmbedModeChange(val) {
    setEmbedMode(val);
    setSavingEmbed(true);
    try {
      const r = await fetch('/api/user/embed-mode', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embedMode: val }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      await refreshUser();
      toast({ title: t('settings.embedModeSaved') });
    } catch (err) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setSavingEmbed(false);
    }
  }

  async function handleUsernameSubmit(e) {
    e.preventDefault();
    const trimmed = usernameForm.newUsername.trim();
    if (!trimmed || !usernameForm.password) return;
    setSavingUsername(true);
    try {
      const r = await fetch('/api/user/username', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newUsername: trimmed, password: usernameForm.password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      await refreshUser();
      toast({ title: t('settings.usernameChanged') });
      setUsernameForm({ newUsername: '', password: '' });
    } catch (err) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setSavingUsername(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      toast({ title: t('settings.passwordMismatch'), variant: 'destructive' });
      return;
    }
    if (form.newPassword.length < 12) {
      toast({ title: t('settings.passwordTooShort'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/user/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast({ title: t('settings.passwordChanged') });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const r = await fetch('/api/user/avatar', { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      await refreshUser();
      toast({ title: t('settings.profileUpdated') });
    } catch (err) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleAvatarRemove() {
    setUploadingAvatar(true);
    try {
      const r = await fetch('/api/user/avatar', { method: 'DELETE' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      await refreshUser();
      toast({ title: t('settings.profileRemoved') });
    } catch (err) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleExportData() {
    setExporting(true);
    try {
      const r = await fetch('/api/user/export');
      if (!r.ok) throw new Error('Export failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = r.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match ? match[1] : 'sharely-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    if (!deletePassword) return;
    setDeleting(true);
    try {
      const r = await fetch('/api/user/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await r.json();
      if (!r.ok) {
        throw new Error(
          r.status === 401 ? t('settings.deleteAccountWrongPassword') : data.error,
        );
      }
      toast({ title: t('settings.deleteAccountSuccess') });
      await logout();
      navigate('/auth/login');
    } catch (err) {
      toast({ title: err.message, variant: 'destructive' });
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      {/* Profile Picture */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faUser} className="h-4 w-4" />{t('settings.profilePicture')}
          </CardTitle>
          <CardDescription>{t('settings.profilePictureDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 border">
              {user?.avatarUrl ? (
                <img
                  src={`${user.avatarUrl}?t=${Date.now()}`}
                  alt="Profile picture"
                  className="h-full w-full object-cover"
                />
              ) : (
                <FontAwesomeIcon icon={faUser} className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleAvatarUpload}
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
              >
                <FontAwesomeIcon icon={faUpload} className="h-3.5 w-3.5" />
                {uploadingAvatar ? t('settings.uploading') : t('settings.uploadPicture')}
              </Button>
              {user?.avatarUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-destructive hover:text-destructive"
                  onClick={handleAvatarRemove}
                  disabled={uploadingAvatar}
                >
                  <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                  {t('settings.removePicture')}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">{t('settings.pictureHint')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faGlobe} className="h-4 w-4" />{t('settings.language')}
          </CardTitle>
          <CardDescription>{t('settings.languageDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={i18n.resolvedLanguage}
            onValueChange={(val) => i18n.changeLanguage(val)}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>{lang.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Embed Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faShareNodes} className="h-4 w-4" />{t('settings.embedMode')}
          </CardTitle>
          <CardDescription>{t('settings.embedModeDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={embedMode}
            onValueChange={handleEmbedModeChange}
            disabled={savingEmbed}
          >
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="embed">{t('settings.embedModeEmbed')}</SelectItem>
              <SelectItem value="raw">{t('settings.embedModeRaw')}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Change Username (GDPR Art. 16) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faPencil} className="h-4 w-4" />{t('settings.changeUsername')}
          </CardTitle>
          <CardDescription>{t('settings.changeUsernameDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUsernameSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('settings.currentUsername')}</Label>
              <p className="text-sm font-mono bg-muted px-2 py-1 rounded">{user?.username}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newUsername">{t('settings.newUsername')}</Label>
              <Input
                id="newUsername"
                type="text"
                value={usernameForm.newUsername}
                onChange={(e) => setUsernameForm((p) => ({ ...p, newUsername: e.target.value }))}
                minLength={3}
                maxLength={32}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="usernamePassword">{t('settings.currentPasswordConfirm')}</Label>
              <Input
                id="usernamePassword"
                type="password"
                value={usernameForm.password}
                onChange={(e) => setUsernameForm((p) => ({ ...p, password: e.target.value }))}
                required
              />
            </div>
            <Button type="submit" disabled={savingUsername}>
              {savingUsername ? t('settings.saving') : t('settings.saveUsername')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faKey} className="h-4 w-4" />{t('settings.changePassword')}
          </CardTitle>
          <CardDescription>{t('settings.changePasswordDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">{t('settings.currentPassword')}</Label>
              <Input
                id="currentPassword"
                type="password"
                value={form.currentPassword}
                onChange={(e) => setForm((p) => ({ ...p, currentPassword: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">{t('settings.newPassword')}</Label>
              <Input
                id="newPassword"
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm((p) => ({ ...p, newPassword: e.target.value }))}
                minLength={12}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">{t('settings.confirmPassword')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                minLength={12}
                required
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? t('settings.saving') : t('settings.savePassword')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* GDPR: Your Data */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faShield} className="h-4 w-4" />{t('settings.gdpr')}
          </CardTitle>
          <CardDescription>{t('settings.gdprDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Export */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t('settings.exportData')}</p>
            <p className="text-xs text-muted-foreground">{t('settings.exportDataDescription')}</p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 mt-2"
              onClick={handleExportData}
              disabled={exporting}
            >
              <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5" />
              {exporting ? t('settings.exporting') : t('settings.exportDataBtn')}
            </Button>
          </div>

          {/* Objection to processing (Art. 21) */}
          {operatorEmail && (
            <div className="border-t pt-4 space-y-1.5">
              <p className="text-sm font-medium">{t('settings.objection')}</p>
              <p className="text-xs text-muted-foreground">{t('settings.objectionDescription')}</p>
              <a
                href={`mailto:${operatorEmail}?subject=${encodeURIComponent(t('settings.objectionEmailSubject'))}&body=${encodeURIComponent(t('settings.objectionEmailBody', { username: user?.username }))}`}
                className="inline-block mt-2"
              >
                <Button variant="outline" size="sm">
                  {t('settings.objectionBtn')}
                </Button>
              </a>
              <p className="text-xs text-muted-foreground">
                {t('settings.objectionContact')}{' '}
                <span className="font-mono">{operatorEmail}</span>
              </p>
            </div>
          )}

          <div className="border-t pt-4 space-y-1.5">
            <p className="text-sm font-medium text-destructive">{t('settings.deleteAccount')}</p>
            <p className="text-xs text-muted-foreground">{t('settings.deleteAccountDescription')}</p>

            <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
              setDeleteDialogOpen(open);
              if (!open) setDeletePassword('');
            }}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2 mt-2">
                  <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                  {t('settings.deleteAccountBtn')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('settings.deleteAccountConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('settings.deleteAccountConfirmDesc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-1.5 py-2">
                  <Label htmlFor="deletePassword">{t('settings.deleteAccountPasswordLabel')}</Label>
                  <Input
                    id="deletePassword"
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    autoFocus
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>
                    {t('settings.deleteAccountCancel')}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      handleDeleteAccount();
                    }}
                    disabled={!deletePassword || deleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting ? t('settings.deleteAccountDeleting') : t('settings.deleteAccountConfirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
