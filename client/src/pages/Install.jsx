import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '@/components/LanguageSelector';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faServer,
  faUser,
  faShield,
  faGear,
  faCircleCheck,
  faArrowRight,
  faArrowLeft,
} from '@fortawesome/free-solid-svg-icons';

const STEPS = ['welcome', 'admin', 'site', 'settings', 'done'];

function StepIndicator({ current }) {
  const { t } = useTranslation();
  const labels = [
    t('install.stepWelcome'),
    t('install.stepAdmin'),
    t('install.stepSite'),
    t('install.stepSettings'),
    t('install.stepDone'),
  ];
  const icons = [faServer, faUser, faShield, faGear, faCircleCheck];

  return (
    <div className="flex items-center justify-center mb-8 gap-0">
      {labels.map((label, i) => {
        const isCompleted = i < current;
        const isActive = i === current;
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'h-9 w-9 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                  isCompleted && 'bg-primary text-primary-foreground',
                  isActive && 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background',
                  !isCompleted && !isActive && 'bg-muted text-muted-foreground',
                )}
              >
                <FontAwesomeIcon icon={icons[i]} className="h-3.5 w-3.5" />
              </div>
              <span
                className={cn(
                  'text-xs hidden sm:block',
                  isActive ? 'text-foreground font-medium' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div
                className={cn(
                  'h-px w-8 sm:w-12 mx-1 mb-5 transition-colors',
                  i < current ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepWelcome({ onNext }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{t('install.welcomeTitle')}</CardTitle>
        <CardDescription>{t('install.welcomeDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
          {t('install.welcomeNote')}
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2.5">
            <FontAwesomeIcon icon={faUser} className="h-4 w-4 text-primary shrink-0" />
            <span>{t('install.welcomeStep1')}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <FontAwesomeIcon icon={faShield} className="h-4 w-4 text-primary shrink-0" />
            <span>{t('install.welcomeStep2')}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <FontAwesomeIcon icon={faGear} className="h-4 w-4 text-primary shrink-0" />
            <span>{t('install.welcomeStep3')}</span>
          </div>
        </div>
        <Button className="w-full" onClick={onNext}>
          {t('install.next')}
          <FontAwesomeIcon icon={faArrowRight} className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function StepAdmin({ data, onChange, onNext, onBack, error }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{t('install.adminTitle')}</CardTitle>
        <CardDescription>{t('install.adminDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="username">{t('install.username')}</Label>
            <Input
              id="username"
              value={data.username}
              onChange={(e) => onChange('username', e.target.value)}
              placeholder="admin"
              minLength={3}
              maxLength={32}
              autoComplete="username"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">{t('install.password')}</Label>
            <Input
              id="password"
              type="password"
              value={data.password}
              onChange={(e) => onChange('password', e.target.value)}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">{t('install.passwordHint')}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">{t('install.confirmPassword')}</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={data.confirmPassword}
              onChange={(e) => onChange('confirmPassword', e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onBack}>
              <FontAwesomeIcon icon={faArrowLeft} className="mr-2 h-4 w-4" />
              {t('install.back')}
            </Button>
            <Button className="flex-1" onClick={onNext}>
              {t('install.next')}
              <FontAwesomeIcon icon={faArrowRight} className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StepSite({ data, onChange, onNext, onBack }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{t('install.siteTitle')}</CardTitle>
        <CardDescription>{t('install.siteDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5">
          <div className="grid gap-2">
            <Label htmlFor="operatorName">{t('install.operatorName')}</Label>
            <Input
              id="operatorName"
              value={data.operatorName}
              onChange={(e) => onChange('operatorName', e.target.value)}
              placeholder={t('install.operatorNamePlaceholder')}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="operatorAddress">{t('install.operatorAddress')}</Label>
            <Input
              id="operatorAddress"
              value={data.operatorAddress}
              onChange={(e) => onChange('operatorAddress', e.target.value)}
              placeholder={t('install.operatorAddressPlaceholder')}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="operatorEmail">{t('install.operatorEmail')}</Label>
            <Input
              id="operatorEmail"
              type="email"
              value={data.operatorEmail}
              onChange={(e) => onChange('operatorEmail', e.target.value)}
              placeholder={t('install.operatorEmailPlaceholder')}
            />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onBack}>
              <FontAwesomeIcon icon={faArrowLeft} className="mr-2 h-4 w-4" />
              {t('install.back')}
            </Button>
            <Button className="flex-1" onClick={onNext}>
              {t('install.next')}
              <FontAwesomeIcon icon={faArrowRight} className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StepSettings({ data, onChange, onNext, onBack, loading, error }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{t('install.settingsTitle')}</CardTitle>
        <CardDescription>{t('install.settingsDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="sessionDurationDays">{t('install.sessionDuration')}</Label>
            <Input
              id="sessionDurationDays"
              type="number"
              min="1"
              step="1"
              value={data.sessionDurationDays}
              onChange={(e) => onChange('sessionDurationDays', e.target.value)}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">{t('install.sessionDurationHint')}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fileRetentionDays">{t('install.fileRetention')}</Label>
            <Input
              id="fileRetentionDays"
              type="number"
              min="0"
              step="1"
              value={data.fileRetentionDays}
              onChange={(e) => onChange('fileRetentionDays', e.target.value)}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">{t('install.fileRetentionHint')}</p>
          </div>

          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={data.allowRegistration}
                onChange={(e) => onChange('allowRegistration', e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary cursor-pointer"
              />
              <div>
                <span className="text-sm font-medium">{t('install.allowRegistration')}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{t('install.allowRegistrationHint')}</p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={data.encryptionAtRest}
                onChange={(e) => onChange('encryptionAtRest', e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary cursor-pointer"
              />
              <div>
                <span className="text-sm font-medium">{t('install.encryptionAtRest')}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{t('install.encryptionHint')}</p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={data.cloudflareAnalytics}
                onChange={(e) => onChange('cloudflareAnalytics', e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary cursor-pointer"
              />
              <div>
                <span className="text-sm font-medium">{t('install.cloudflareAnalytics')}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{t('install.analyticsHint')}</p>
              </div>
            </label>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onBack} disabled={loading}>
              <FontAwesomeIcon icon={faArrowLeft} className="mr-2 h-4 w-4" />
              {t('install.back')}
            </Button>
            <Button className="flex-1" onClick={onNext} disabled={loading}>
              {loading ? t('install.completing') : t('install.completeSetup')}
              {!loading && <FontAwesomeIcon icon={faArrowRight} className="ml-2 h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StepDone({ onGo }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-3">
          <FontAwesomeIcon icon={faCircleCheck} className="h-6 w-6 text-primary" />
          {t('install.doneTitle')}
        </CardTitle>
        <CardDescription>{t('install.doneDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button className="w-full" onClick={onGo}>
          {t('install.goToGallery')}
          <FontAwesomeIcon icon={faArrowRight} className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Install() {
  const { t } = useTranslation();
  const { completeInstall } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    operatorName: '',
    operatorAddress: '',
    operatorEmail: '',
    sessionDurationDays: 7,
    fileRetentionDays: 0,
    allowRegistration: true,
    encryptionAtRest: false,
    cloudflareAnalytics: false,
  });

  function handleChange(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateAdmin() {
    if (!form.username || form.username.length < 3) {
      setError(t('install.errorUsernameTooShort'));
      return false;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(form.username)) {
      setError(t('install.errorUsernameInvalid'));
      return false;
    }
    if (form.password.length < 12) {
      setError(t('install.errorPasswordTooShort'));
      return false;
    }
    if (form.password !== form.confirmPassword) {
      setError(t('install.errorPasswordMismatch'));
      return false;
    }
    setError('');
    return true;
  }

  function nextStep() {
    if (step === 1 && !validateAdmin()) return;
    setStep((s) => s + 1);
  }

  function prevStep() {
    setError('');
    setStep((s) => s - 1);
  }

  async function handleComplete() {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/install/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          sessionDurationDays: Number(form.sessionDurationDays) || 7,
          fileRetentionDays: Number(form.fileRetentionDays) || 0,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Setup failed');
      completeInstall(data.user);
      setStep(4);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <p className="text-sm text-muted-foreground font-medium">{t('install.title')}</p>
          <LanguageSelector />
        </div>

        <StepIndicator current={step} />

        {step === 0 && <StepWelcome onNext={nextStep} />}
        {step === 1 && (
          <StepAdmin
            data={form}
            onChange={handleChange}
            onNext={nextStep}
            onBack={prevStep}
            error={error}
          />
        )}
        {step === 2 && (
          <StepSite
            data={form}
            onChange={handleChange}
            onNext={nextStep}
            onBack={prevStep}
          />
        )}
        {step === 3 && (
          <StepSettings
            data={form}
            onChange={handleChange}
            onNext={handleComplete}
            onBack={prevStep}
            loading={loading}
            error={error}
          />
        )}

        {step === 4 && <StepDone onGo={() => navigate('/gallery')} />}
      </div>
    </div>
  );
}
