import { useState, useEffect, useRef, useMemo } from 'react';
import { format, isValid } from 'date-fns';
import { de, fr, es, it, pt, ja, zhCN, enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendar, faClock, faXmark, faChevronUp, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

const LOCALE_MAP = { de, fr, es, it, pt, ja, zh: zhCN };

function getDateFnsLocale(lang) {
  return LOCALE_MAP[lang?.split('-')[0]] ?? enUS;
}

function TimeSpinner({ value, max, onChange }) {
  const inputRef = useRef(null);

  function clamp(v) {
    if (v < 0) return max;
    if (v > max) return 0;
    return v;
  }

  function handleKey(e) {
    if (e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp(value + 1)); }
    if (e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp(value - 1)); }
  }

  function handleChange(e) {
    const n = parseInt(e.target.value, 10);
    if (!isNaN(n)) onChange(clamp(n));
  }

  function handleBlur(e) {
    const n = parseInt(e.target.value, 10);
    onChange(isNaN(n) ? 0 : clamp(n));
  }

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        tabIndex={-1}
        className="p-0.5 text-muted-foreground hover:text-foreground"
        onClick={() => onChange(clamp(value + 1))}
      >
        <FontAwesomeIcon icon={faChevronUp} className="h-3 w-3" />
      </button>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        className="w-8 text-center text-sm font-mono bg-transparent focus:outline-none focus:ring-1 focus:ring-ring rounded"
        value={String(value).padStart(2, '0')}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKey}
        maxLength={2}
      />
      <button
        type="button"
        tabIndex={-1}
        className="p-0.5 text-muted-foreground hover:text-foreground"
        onClick={() => onChange(clamp(value - 1))}
      >
        <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3" />
      </button>
    </div>
  );
}

export function DateTimePicker({ onChange, className }) {
  const { t, i18n } = useTranslation();
  const [date, setDate] = useState(null);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [open, setOpen] = useState(false);

  const locale = useMemo(() => getDateFnsLocale(i18n.language), [i18n.language]);

  useEffect(() => {
    if (!date) { onChange(null); return; }
    const d = new Date(date);
    d.setHours(hours, minutes, 0, 0);
    if (!isValid(d)) { onChange(null); return; }
    onChange(d.toISOString());
  }, [date, hours, minutes]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDaySelect(day) {
    setDate(day ?? null);
    if (day) setOpen(false);
  }

  function handleClear(e) {
    e.stopPropagation();
    setDate(null);
    setHours(0);
    setMinutes(0);
  }

  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const label = date ? `${format(date, 'PP', { locale })} ${timeStr}` : null;

  return (
    <div className={cn('flex gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn('flex-1 justify-start text-left font-normal', !date && 'text-muted-foreground')}
          >
            <FontAwesomeIcon icon={faCalendar} className="mr-2 h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{label ?? t('dateTimePicker.pickDate')}</span>
            {date && (
              <FontAwesomeIcon
                icon={faXmark}
                className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50 hover:opacity-100"
                onClick={handleClear}
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDaySelect}
            disabled={{ before: new Date() }}
            locale={locale}
            initialFocus
          />
        </PopoverContent>
      </Popover>

      <div className={cn(
        'flex items-center gap-1 rounded-md border px-2 w-28',
        !date && 'opacity-50 pointer-events-none',
      )}>
        <FontAwesomeIcon icon={faClock} className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <TimeSpinner value={hours} max={23} onChange={setHours} />
        <span className="text-sm font-mono text-muted-foreground select-none">:</span>
        <TimeSpinner value={minutes} max={59} onChange={setMinutes} />
      </div>
    </div>
  );
}
