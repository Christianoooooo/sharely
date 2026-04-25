import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';

export default function PrivacyPolicy() {
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
    return ops[key] || t('privacy.notConfigured');
  }

  const isIncomplete = ops && (!ops.operatorName || !ops.operatorAddress || !ops.operatorEmail);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
            {t('privacy.backHome')}
          </Link>
        </div>

        <div>
          <h1 className="text-3xl font-bold">{t('privacy.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('privacy.lastUpdated')}</p>
        </div>

        {/* Incomplete warning – only shown when fields are missing */}
        {isIncomplete && (
          <div className="flex gap-3 rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-200">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>{t('privacy.incompleteTitle')}</strong>{' '}
              {t('privacy.incompleteBody')}
            </div>
          </div>
        )}

        <Section title={t('privacy.s1Title')}>
          <p>{t('privacy.s1Body')}</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>{t('privacy.s1Operator')}</strong> <span className="font-mono text-xs bg-muted px-1 rounded">{val('operatorName')}</span></li>
            <li><strong>{t('privacy.s1Address')}</strong> <span className="font-mono text-xs bg-muted px-1 rounded">{val('operatorAddress')}</span></li>
            <li><strong>{t('privacy.s1Email')}</strong> <span className="font-mono text-xs bg-muted px-1 rounded">{val('operatorEmail')}</span></li>
          </ul>
        </Section>

        <Section title={t('privacy.s2Title')}>
          <p>{t('privacy.s2Intro')}</p>
          <table className="w-full mt-3 text-sm border rounded-md overflow-hidden">
            <thead className="bg-muted">
              <tr>
                <Th>{t('privacy.tableData')}</Th>
                <Th>{t('privacy.tablePurpose')}</Th>
                <Th>{t('privacy.tableBasis')}</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <Td>{t('privacy.dataUsername')}</Td>
                <Td>{t('privacy.purposeAuth')}</Td>
                <Td>{t('privacy.basisContract')}</Td>
              </tr>
              <tr>
                <Td>{t('privacy.dataPassword')}</Td>
                <Td>{t('privacy.purposeAuth')}</Td>
                <Td>{t('privacy.basisContract')}</Td>
              </tr>
              <tr>
                <Td>{t('privacy.dataFiles')}</Td>
                <Td>{t('privacy.purposeService')}</Td>
                <Td>{t('privacy.basisContract')}</Td>
              </tr>
              <tr>
                <Td>{t('privacy.dataSession')}</Td>
                <Td>{t('privacy.purposeSession')}</Td>
                <Td>{t('privacy.basisLegitimate')}</Td>
              </tr>
              <tr>
                <Td>{t('privacy.dataAvatar')}</Td>
                <Td>{t('privacy.purposeProfile')}</Td>
                <Td>{t('privacy.basisConsent')}</Td>
              </tr>
            </tbody>
          </table>
          <p className="text-sm text-muted-foreground mt-3">{t('privacy.s2NoEmail')}</p>
        </Section>

        <Section title={t('privacy.s3Title')}>
          <p>{t('privacy.s3Body')}</p>
        </Section>

        <Section title={t('privacy.s4Title')}>
          <p>{t('privacy.s4Intro')}</p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong>{t('privacy.right15')}</strong> – {t('privacy.right15Desc')}</li>
            <li><strong>{t('privacy.right16')}</strong> – {t('privacy.right16Desc')}</li>
            <li><strong>{t('privacy.right17')}</strong> – {t('privacy.right17Desc')}</li>
            <li><strong>{t('privacy.right20')}</strong> – {t('privacy.right20Desc')}</li>
            <li><strong>{t('privacy.right21')}</strong> – {t('privacy.right21Desc')}</li>
          </ul>
          <p className="mt-3 text-sm">
            {t('privacy.rightsExercise')}{' '}
            <Link to="/settings" className="underline underline-offset-2 hover:text-foreground">
              {t('privacy.rightsSettingsLink')}
            </Link>
            {' '}{t('privacy.rightsOrContact')}{' '}
            <span className="font-mono text-xs bg-muted px-1 rounded">{val('operatorEmail')}</span>.
          </p>
          <p className="mt-2 text-sm">{t('privacy.rightsSupervisory')}</p>
        </Section>

        <Section title={t('privacy.s5Title')}>
          <p>{t('privacy.s5Session')}</p>
          <p className="mt-2">{t('privacy.s5NoTracking')}</p>
          <p className="mt-2">{t('privacy.s5Cloudflare')}</p>
        </Section>

        <Section title={t('privacy.s6Title')}>
          <p>{t('privacy.s6Body')}</p>
        </Section>

        <Section title={t('privacy.s7Title')}>
          <p>{t('privacy.s7Body')}</p>
        </Section>

        <div className="border-t pt-4 text-xs text-muted-foreground">
          {t('privacy.version')}
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

function Th({ children }) {
  return <th className="text-left px-3 py-2 font-medium text-xs">{children}</th>;
}

function Td({ children }) {
  return <td className="px-3 py-2 text-xs align-top">{children}</td>;
}
