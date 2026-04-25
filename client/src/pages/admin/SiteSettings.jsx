import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShield, faCloud, faClock, faLock } from '@fortawesome/free-solid-svg-icons';

export default function AdminSiteSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [form, setForm] = useState({
    operatorName: '',
    operatorAddress: '',
    operatorEmail: '',
    cloudflareAnalytics: false,
    fileRetentionDays: 0,
    encryptionAtRest: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/site-settings')
      .then((r) => r.json())
      .then((data) => {
        setForm({
          operatorName: data.operatorName ?? '',
          operatorAddress: data.operatorAddress ?? '',
          operatorEmail: data.operatorEmail ?? '',
          cloudflareAnalytics: data.cloudflareAnalytics ?? false,
          fileRetentionDays: data.fileRetentionDays ?? 0,
          encryptionAtRest: data.encryptionAtRest ?? false,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch('/api/admin/site-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          fileRetentionDays: Number(form.fileRetentionDays) || 0,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast({ title: t('adminSiteSettings.saved') });
    } catch (err) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-muted-foreground text-sm animate-pulse py-12 text-center">{t('adminSiteSettings.loading')}</div>;
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">{t('adminSiteSettings.title')}</h1>

      {/* Privacy Policy Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faShield} className="h-4 w-4" />
            {t('adminSiteSettings.privacySection')}
          </CardTitle>
          <CardDescription>{t('adminSiteSettings.privacyDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="operatorName">{t('adminSiteSettings.operatorName')}</Label>
              <Input
                id="operatorName"
                value={form.operatorName}
                onChange={(e) => setForm((p) => ({ ...p, operatorName: e.target.value }))}
                placeholder={t('adminSiteSettings.placeholderName')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="operatorAddress">{t('adminSiteSettings.operatorAddress')}</Label>
              <Input
                id="operatorAddress"
                value={form.operatorAddress}
                onChange={(e) => setForm((p) => ({ ...p, operatorAddress: e.target.value }))}
                placeholder={t('adminSiteSettings.placeholderAddress')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="operatorEmail">{t('adminSiteSettings.operatorEmail')}</Label>
              <Input
                id="operatorEmail"
                type="email"
                value={form.operatorEmail}
                onChange={(e) => setForm((p) => ({ ...p, operatorEmail: e.target.value }))}
                placeholder={t('adminSiteSettings.placeholderEmail')}
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? t('adminSiteSettings.saving') : t('adminSiteSettings.save')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Retention */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faClock} className="h-4 w-4" />
            {t('adminSiteSettings.retentionSection')}
          </CardTitle>
          <CardDescription>{t('adminSiteSettings.retentionDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fileRetentionDays">{t('adminSiteSettings.retentionLabel')}</Label>
            <Input
              id="fileRetentionDays"
              type="number"
              min="0"
              step="1"
              value={form.fileRetentionDays}
              onChange={(e) => setForm((p) => ({ ...p, fileRetentionDays: e.target.value }))}
              placeholder="0"
              className="w-36"
            />
            <p className="text-xs text-muted-foreground">{t('adminSiteSettings.retentionHint')}</p>
          </div>
          <Button disabled={saving} onClick={handleSubmit}>
            {saving ? t('adminSiteSettings.saving') : t('adminSiteSettings.save')}
          </Button>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faLock} className="h-4 w-4" />
            {t('adminSiteSettings.securitySection')}
          </CardTitle>
          <CardDescription>{t('adminSiteSettings.securityDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
              checked={form.encryptionAtRest}
              onChange={(e) => setForm((p) => ({ ...p, encryptionAtRest: e.target.checked }))}
            />
            <span className="text-sm">{t('adminSiteSettings.encryptionLabel')}</span>
          </label>
          <p className="text-xs text-muted-foreground">{t('adminSiteSettings.encryptionHint')}</p>
          <Button disabled={saving} onClick={handleSubmit}>
            {saving ? t('adminSiteSettings.saving') : t('adminSiteSettings.save')}
          </Button>
        </CardContent>
      </Card>

      {/* Analytics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faCloud} className="h-4 w-4" />
            {t('adminSiteSettings.analyticsSection')}
          </CardTitle>
          <CardDescription>{t('adminSiteSettings.analyticsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
              checked={form.cloudflareAnalytics}
              onChange={(e) => setForm((p) => ({ ...p, cloudflareAnalytics: e.target.checked }))}
            />
            <span className="text-sm">{t('adminSiteSettings.analyticsLabel')}</span>
          </label>
          <p className="text-xs text-muted-foreground">{t('adminSiteSettings.analyticsHint')}</p>
          <Button disabled={saving} onClick={handleSubmit}>
            {saving ? t('adminSiteSettings.saving') : t('adminSiteSettings.save')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
