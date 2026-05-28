import { useState, useEffect, useMemo } from 'react';
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

function Spinner({ value, max, onChange }) {
  function clamp(v) {
    if (v < 0) return max;
    if (v > max) return 0;
    return v;
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <button type="button" tabIndex={-1} onClick={() => onChange(clamp(value + 1))}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent">
        <FontAwesomeIcon icon={faChevronUp} className="h-3 w-3" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        className="w-9 rounded border text-center text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring bg-background py-1"
        value={String(value).padStart(2, '0')}
        onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) onChange(clamp(n)); }}
        onBlur={(e) => { const n = parseInt(e.target.value, 10); onChange(isNaN(n) ? 0 : clamp(n)); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp(value + 1)); }
          if (e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp(value - 1)); }
        }}
      />
      <button type="button" tabIndex={-1} onClick={() => onChange(clamp(value - 1))}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-accent">
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
  const [calOpen, setCalOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

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
    if (day) setCalOpen(false);
  }

  function handleClear(e) {
    e.stopPropagation();
    setDate(null);
    setHours(0);
    setMinutes(0);
  }

  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const dateLabel = date ? format(date, 'PP', { locale }) : null;

  return (
    <div className={cn('flex gap-2', className)}>
      {/* Date picker */}
      <Popover open={calOpen} onOpenChange={setCalOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn('h-10 flex-1 justify-start text-left font-normal', !date && 'text-muted-foreground')}>
            <FontAwesomeIcon icon={faCalendar} className="mr-2 h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{dateLabel ?? t('dateTimePicker.pickDate')}</span>
            {date && (
              <span onClick={handleClear} className="ml-auto flex items-center opacity-50 hover:opacity-100">
                <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
              </span>
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

      {/* Time picker */}
      <Popover open={timeOpen} onOpenChange={setTimeOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn('h-10 w-28 font-mono', !date && 'opacity-50 pointer-events-none')}>
            <FontAwesomeIcon icon={faClock} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {timeStr}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <div className="flex items-center gap-2">
            <Spinner value={hours} max={23} onChange={setHours} />
            <span className="text-lg font-mono text-muted-foreground select-none mb-0.5">:</span>
            <Spinner value={minutes} max={59} onChange={setMinutes} />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
