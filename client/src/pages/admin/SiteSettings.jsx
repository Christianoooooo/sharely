import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useWebSocket } from '@/hooks/useWebSocket';
import { faShield, faCloud, faClock, faLock, faHourglass, faCodeBranch, faRotate, faCircleCheck, faCircleUp, faArrowUpRightFromSquare, faTriangleExclamation, faDownload, faDatabase } from '@fortawesome/free-solid-svg-icons';
import { Badge } from '@/components/ui/badge';
import { fmtDate } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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
    sessionDurationDays: 7,
    defaultStorageQuota: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [update, setUpdate] = useState(null);
  const [checking, setChecking] = useState(false);
  const [apply, setApply] = useState({ state: 'idle', log: '', ready: false });

  async function loadUpdate(force) {
    setChecking(true);
    try {
      const r = await fetch(`/api/admin/update-check${force ? '?refresh=1' : ''}`);
      if (r.ok) setUpdate(await r.json());
    } finally {
      setChecking(false);
    }
  }

  async function pollApplyStatus() {
    try {
      const r = await fetch('/api/admin/update-status');
      if (r.ok) {
        const d = await r.json();
        setApply({ state: d.state, log: d.log || '', ready: !!d.ready });
      }
    } catch {
      // The app container is restarting as part of the update; keep polling.
      setApply((p) => ({ ...p, state: 'restarting' }));
    }
  }

  async function startUpdate() {
    setApply((p) => ({ ...p, state: 'queued', log: '' }));
    try {
      const r = await fetch('/api/admin/update-apply', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
    } catch (err) {
      setApply((p) => ({ ...p, state: 'error', log: err.message || '' }));
      toast({ title: err.message || t('adminSiteSettings.updateStartFailed'), variant: 'destructive' });
    }
  }

  useEffect(() => { loadUpdate(false); }, []);

  // Resume any in-progress update after a page reload.
  useEffect(() => { pollApplyStatus(); }, []);

  // Poll while an update is queued/running/restarting; stop on a terminal state.
  const applyInProgress = ['queued', 'running', 'restarting'].includes(apply.state);
  useEffect(() => {
    if (!applyInProgress) return undefined;
    const id = setInterval(pollApplyStatus, 3000);
    return () => clearInterval(id);
  }, [applyInProgress]);

  // Surface the terminal outcome once, on transition into it.
  const notifiedState = useRef(apply.state);
  useEffect(() => {
    if (notifiedState.current !== apply.state) {
      if (apply.state === 'success' || apply.state === 'error') {
        toast(apply.state === 'success'
          ? { title: t('adminSiteSettings.updateDone') }
          : { title: t('adminSiteSettings.updateFailed'), variant: 'destructive' });
        // Clear the terminal state server-side so it does not stick on reload.
        fetch('/api/admin/update-ack', { method: 'POST' }).catch(() => {});
      }
      notifiedState.current = apply.state;
    }
  }, [apply.state]); // eslint-disable-line react-hooks/exhaustive-deps

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
          sessionDurationDays: data.sessionDurationDays ?? 7,
          defaultStorageQuota: Math.round((data.defaultStorageQuota ?? 0) / (1024 * 1024)),
        });
      })
      .finally(() => setLoading(false));
  }, []);

  useWebSocket((event, data) => {
    if (event === 'settings:updated') {
      // defaultStorageQuota is stored in bytes server-side but edited in MB here.
      setForm((prev) => ({
        ...prev,
        ...data,
        defaultStorageQuota: data.defaultStorageQuota != null
          ? Math.round(data.defaultStorageQuota / (1024 * 1024))
          : prev.defaultStorageQuota,
      }));
    }
  });

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
          sessionDurationDays: Number(form.sessionDurationDays) || 7,
          defaultStorageQuota: Math.max(0, Math.round((Number(form.defaultStorageQuota) || 0) * 1024 * 1024)),
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

      {/* Version & Updates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faCodeBranch} className="h-4 w-4" />
            {t('adminSiteSettings.updateSection')}
          </CardTitle>
          <CardDescription>{t('adminSiteSettings.updateDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm">
              <span className="text-muted-foreground">{t('adminSiteSettings.currentVersion')}: </span>
              <span className="font-medium">{update?.currentVersion ?? '—'}</span>
            </div>
            {update?.error ? (
              <Badge variant="secondary" className="gap-1.5">
                <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                {t('adminSiteSettings.updateCheckFailed')}
              </Badge>
            ) : update?.updateAvailable ? (
              <Badge className="gap-1.5">
                <FontAwesomeIcon icon={faCircleUp} className="h-3 w-3" />
                {t('adminSiteSettings.updateAvailable', { version: update.latestVersion })}
              </Badge>
            ) : update ? (
              <Badge variant="secondary" className="gap-1.5">
                <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3 text-green-600" />
                {t('adminSiteSettings.upToDate')}
              </Badge>
            ) : null}
          </div>

          {update?.updateAvailable && update?.releaseUrl && (
            <a
              href={update.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              {t('adminSiteSettings.viewRelease', { name: update.releaseName || update.latestVersion })}
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" />
            </a>
          )}

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => loadUpdate(true)} disabled={checking}>
              <FontAwesomeIcon icon={faRotate} className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
              {checking ? t('adminSiteSettings.checking') : t('adminSiteSettings.checkNow')}
            </Button>
            {update?.checkedAt && (
              <span className="text-xs text-muted-foreground">
                {t('adminSiteSettings.lastChecked', { time: fmtDate(update.checkedAt) })}
              </span>
            )}
          </div>

          {update?.selfUpdate && (applyInProgress || apply.state === 'success' || apply.state === 'error' || update?.updateAvailable) && (
            <div className="border-t pt-4 space-y-3">
              {applyInProgress ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FontAwesomeIcon icon={faRotate} className="h-4 w-4 animate-spin" />
                  {t(apply.state === 'restarting' ? 'adminSiteSettings.updateRestarting' : 'adminSiteSettings.updateRunning')}
                </div>
              ) : apply.state === 'success' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <FontAwesomeIcon icon={faCircleCheck} className="h-4 w-4" />
                    {t('adminSiteSettings.updateDone')}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                    {t('adminSiteSettings.reload')}
                  </Button>
                </div>
              ) : apply.ready ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button>
                      <FontAwesomeIcon icon={faDownload} className="h-4 w-4 mr-2" />
                      {t('adminSiteSettings.applyUpdate')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('adminSiteSettings.applyUpdate')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('adminSiteSettings.applyConfirm', { version: update.latestVersion })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('adminSiteSettings.cancel')}</AlertDialogCancel>
                      <AlertDialogAction onClick={startUpdate}>{t('adminSiteSettings.applyUpdate')}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" />
                  {t('adminSiteSettings.updaterOffline')}
                </p>
              )}

              {apply.state === 'error' && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" />
                  {t('adminSiteSettings.updateFailed')}
                </div>
              )}

              {apply.log && (apply.state === 'error' || applyInProgress) && (
                <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                  {apply.log}
                </pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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

      {/* Session Duration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faHourglass} className="h-4 w-4" />
            {t('adminSiteSettings.sessionSection')}
          </CardTitle>
          <CardDescription>{t('adminSiteSettings.sessionDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sessionDurationDays">{t('adminSiteSettings.sessionLabel')}</Label>
            <Input
              id="sessionDurationDays"
              type="number"
              min="1"
              step="1"
              value={form.sessionDurationDays}
              onChange={(e) => setForm((p) => ({ ...p, sessionDurationDays: e.target.value }))}
              placeholder="7"
              className="w-36"
            />
            <p className="text-xs text-muted-foreground">{t('adminSiteSettings.sessionHint')}</p>
          </div>
          <Button disabled={saving} onClick={handleSubmit}>
            {saving ? t('adminSiteSettings.saving') : t('adminSiteSettings.save')}
          </Button>
        </CardContent>
      </Card>

      {/* Default storage quota */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faDatabase} className="h-4 w-4" />
            {t('adminSiteSettings.storageSection')}
          </CardTitle>
          <CardDescription>{t('adminSiteSettings.storageDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="defaultStorageQuota">{t('adminSiteSettings.storageLabel')}</Label>
            <Input
              id="defaultStorageQuota"
              type="number"
              min="0"
              step="1"
              value={form.defaultStorageQuota}
              onChange={(e) => setForm((p) => ({ ...p, defaultStorageQuota: e.target.value }))}
              placeholder="0"
              className="w-36"
            />
            <p className="text-xs text-muted-foreground">{t('adminSiteSettings.storageHint')}</p>
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
