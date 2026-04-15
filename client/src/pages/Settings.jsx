import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faKey, faUser, faTrash, faUpload, faGlobe } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function Settings() {
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();
  const { t, i18n } = useTranslation();

  // Password form
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);

  // Avatar
  const avatarInputRef = useRef(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      toast({ title: t('settings.passwordMismatch'), variant: 'destructive' });
      return;
    }
    if (form.newPassword.length < 6) {
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
                minLength={6}
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
                minLength={6}
                required
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? t('settings.saving') : t('settings.savePassword')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
