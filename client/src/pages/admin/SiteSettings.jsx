import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShield } from '@fortawesome/free-solid-svg-icons';

export default function AdminSiteSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [form, setForm] = useState({ operatorName: '', operatorAddress: '', operatorEmail: '' });
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
        body: JSON.stringify(form),
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
    </div>
  );
}
