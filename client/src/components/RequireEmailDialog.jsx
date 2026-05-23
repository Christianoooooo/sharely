import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';

export function RequireEmailDialog() {
  const { user, smtpEnabled, refreshUser } = useAuth();
  const { t } = useTranslation();
  const [step, setStep] = useState('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const needsEmail = smtpEnabled && user && (!user.email || !user.emailVerified);

  const checkVerified = useCallback(async () => {
    await refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    if (!needsEmail || step !== 'waiting') return;
    const interval = setInterval(checkVerified, 5000);
    return () => clearInterval(interval);
  }, [needsEmail, step, checkVerified]);

  useEffect(() => {
    if (step === 'waiting' && user?.emailVerified) {
      setStep('verified');
      setTimeout(() => {}, 2000);
    }
  }, [user?.emailVerified, step]);

  if (!needsEmail) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await fetch('/api/user/email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Failed to save email');
      await refreshUser();
      setStep('waiting');
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    try {
      await fetch('/api/user/resend-verification', { method: 'POST' });
    } finally {
      setResending(false);
    }
  }

  return (
    <Dialog open modal>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideCloseButton
      >
        {step === 'verified' ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('requireEmailDialog.verifiedTitle')}</DialogTitle>
              <DialogDescription>{t('requireEmailDialog.verifiedDescription')}</DialogDescription>
            </DialogHeader>
          </>
        ) : step === 'waiting' ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('requireEmailDialog.waitingTitle')}</DialogTitle>
              <DialogDescription>
                {t('requireEmailDialog.waitingDescription', { email: user?.email || email })}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 pt-2">
              <Button
                variant="outline"
                onClick={handleResend}
                disabled={resending}
              >
                {resending ? t('requireEmailDialog.resending') : t('requireEmailDialog.resend')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setStep('form'); setError(''); }}
              >
                {t('requireEmailDialog.changeEmail')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('requireEmailDialog.title')}</DialogTitle>
              <DialogDescription>{t('requireEmailDialog.description')}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="req-email">{t('requireEmailDialog.emailLabel')}</Label>
                <Input
                  id="req-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="req-password">{t('requireEmailDialog.passwordLabel')}</Label>
                <Input
                  id="req-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? t('requireEmailDialog.submitting') : t('requireEmailDialog.submit')}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
