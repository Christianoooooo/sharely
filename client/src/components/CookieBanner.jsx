import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCloud } from '@fortawesome/free-solid-svg-icons';

const STORAGE_KEY = 'cookie-consent-cf';

export function CookieBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;

    fetch('/api/site-settings')
      .then((r) => r.ok ? r.json() : {})
      .then((data) => { if (data.cloudflareAnalytics) setVisible(true); })
      .catch(() => {});
  }, []);

  function accept() {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur-sm shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <FontAwesomeIcon icon={faCloud} className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 sm:mt-0" />
        <p className="text-sm text-muted-foreground flex-1">
          {t('cookieBanner.text')}{' '}
          <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
            {t('cookieBanner.privacyLink')}
          </Link>
          .
        </p>
        <Button size="sm" onClick={accept} className="shrink-0">
          {t('cookieBanner.accept')}
        </Button>
      </div>
    </div>
  );
}
