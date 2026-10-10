import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faQrcode, faDownload } from '@fortawesome/free-solid-svg-icons';

// Renders a button that, when opened, shows a QR code for `url` plus a PNG
// download. The data URL is generated lazily on open so unopened rows stay cheap.
export function QrCodePopover({ url, filename = 'qr', trigger }) {
  const { t } = useTranslation();
  const [dataUrl, setDataUrl] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || !url) return undefined;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 220, margin: 1 })
      .then((d) => { if (!cancelled) setDataUrl(d); })
      .catch(() => { if (!cancelled) setDataUrl(''); });
    return () => { cancelled = true; };
  }, [open, url]);

  const safeName = String(filename).replace(/[^\w.\- ]+/g, '_').trim().slice(0, 60) || 'qr';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button size="icon" variant="ghost" className="h-7 w-7" title={t('qr.show')}>
            <FontAwesomeIcon icon={faQrcode} className="h-3.5 w-3.5" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3 flex flex-col items-center gap-2">
        {dataUrl ? (
          <>
            <img src={dataUrl} alt={t('qr.alt')} width={200} height={200} className="rounded bg-white p-1" />
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <a href={dataUrl} download={`${safeName}.png`}>
                <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5" />
                {t('qr.download')}
              </a>
            </Button>
          </>
        ) : (
          <div className="h-[200px] w-[200px] flex items-center justify-center text-sm text-muted-foreground animate-pulse">
            {t('qr.generating')}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
