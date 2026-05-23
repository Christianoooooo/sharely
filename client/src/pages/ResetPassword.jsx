import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '@/components/LanguageSelector';

function ResetPasswordForm({ className, ...props }) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [tokenValid, setTokenValid] = useState(null);
  const [step, setStep] = useState('checking');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      setTokenValid(false);
      setStep('invalid');
      return;
    }
    fetch(`/api/auth/verify-reset-token?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setTokenValid(true);
          setStep('form');
        } else {
          setTokenValid(false);
          setStep('invalid');
        }
      })
      .catch(() => {
        setTokenValid(false);
        setStep('invalid');
      });
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.target);
    const newPassword = fd.get('newPassword');
    const confirmPassword = fd.get('confirmPassword');
    if (newPassword.length < 12) {
      setError(t('resetPassword.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('resetPassword.passwordMismatch'));
      return;
    }
    setLoading(true);
    try {
      const r = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Reset failed');
      setStep('success');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (step === 'checking') {
    return (
      <div className={cn('flex flex-col gap-6', className)} {...props}>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center animate-pulse">
              {t('resetPassword.checking')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'invalid') {
    return (
      <div className={cn('flex flex-col gap-6', className)} {...props}>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{t('resetPassword.invalidToken')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mt-2 text-center text-sm">
              <Link to="/auth/forgot-password" className="underline underline-offset-4">
                {t('resetPassword.requestNew')}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className={cn('flex flex-col gap-6', className)} {...props}>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{t('resetPassword.successTitle')}</CardTitle>
            <CardDescription>{t('resetPassword.successDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mt-2 text-center text-sm">
              <Link to="/auth/login" className="underline underline-offset-4">
                {t('resetPassword.backToLogin')}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{t('resetPassword.title')}</CardTitle>
          <CardDescription>{t('resetPassword.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="newPassword">{t('resetPassword.newPassword')}</Label>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">{t('resetPassword.confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('resetPassword.submitting') : t('resetPassword.submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPassword() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-4">
          <LanguageSelector />
        </div>
        <ResetPasswordForm />
      </div>
    </div>
  );
}
