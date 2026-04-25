import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { LanguageSelector } from '@/components/LanguageSelector';

export default function TermsOfService() {
  const { t } = useTranslation();
  const [ops, setOps] = useState(null);

  useEffect(() => {
    fetch('/api/site-settings')
      .then((r) => r.ok ? r.json() : {})
      .then(setOps)
      .catch(() => setOps({}));
  }, []);

  function val(key) {
    if (!ops) return '…';
    return ops[key] || t('terms.notConfigured');
  }

  const isIncomplete = ops && (!ops.operatorName || !ops.operatorAddress || !ops.operatorEmail);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
            {t('terms.backHome')}
          </Link>
          <LanguageSelector />
        </div>

        <h1 className="text-3xl font-bold">{t('terms.title')}</h1>

        {isIncomplete && (
          <div className="flex gap-3 rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-200">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>{t('terms.incompleteTitle')}</strong>{' '}
              {t('terms.incompleteBody')}
            </div>
          </div>
        )}

        <Section title={t('terms.s1Title')}>
          <p>{t('terms.s1Body')}</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>{t('terms.s1Operator')}</strong> <span className="font-mono text-xs bg-muted px-1 rounded">{val('operatorName')}</span></li>
            <li><strong>{t('terms.s1Address')}</strong> <span className="font-mono text-xs bg-muted px-1 rounded">{val('operatorAddress')}</span></li>
            <li><strong>{t('terms.s1Email')}</strong> <span className="font-mono text-xs bg-muted px-1 rounded">{val('operatorEmail')}</span></li>
          </ul>
        </Section>

        <Section title={t('terms.s2Title')}>
          <p>{t('terms.s2Body')}</p>
        </Section>

        <Section title={t('terms.s3Title')}>
          <p>{t('terms.s3Body')}</p>
        </Section>

        <Section title={t('terms.s4Title')}>
          <p>{t('terms.s4Intro')}</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>{t('terms.s4Item1')}</li>
            <li>{t('terms.s4Item2')}</li>
            <li>{t('terms.s4Item3')}</li>
            <li>{t('terms.s4Item4')}</li>
            <li>{t('terms.s4Item5')}</li>
          </ul>
        </Section>

        <Section title={t('terms.s5Title')}>
          <p>{t('terms.s5Body')}</p>
        </Section>

        <Section title={t('terms.s6Title')}>
          <p>{t('terms.s6Body')}</p>
        </Section>

        <Section title={t('terms.s7Title')}>
          <p>{t('terms.s7Body')}</p>
        </Section>

        <Section title={t('terms.s8Title')}>
          <p>{t('terms.s8Body')}</p>
          <p className="mt-2 text-sm">
            {t('terms.s8Contact')}{' '}
            <span className="font-mono text-xs bg-muted px-1 rounded">{val('operatorEmail')}</span>.
          </p>
        </Section>

        <div className="border-t pt-4 text-xs text-muted-foreground">
          {t('terms.version')}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="text-sm text-foreground/80 space-y-2">{children}</div>
    </section>
  );
}
