import { useState, useEffect } from 'react';
import { format, isValid } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendar, faClock, faXmark } from '@fortawesome/free-solid-svg-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

export function DateTimePicker({ onChange, className }) {
  const { i18n } = useTranslation();
  const [date, setDate] = useState(null);
  const [time, setTime] = useState('00:00');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!date) { onChange(null); return; }
    const [h, m] = time.split(':').map(Number);
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    if (!isValid(d)) { onChange(null); return; }
    onChange(d.toISOString());
  }, [date, time]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDaySelect(day) {
    setDate(day ?? null);
    if (day) setOpen(false);
  }

  function handleClear(e) {
    e.stopPropagation();
    setDate(null);
    setTime('00:00');
  }

  const locale = i18n.language?.startsWith('de') ? undefined : undefined;
  const label = date
    ? `${format(date, 'PP', { locale })} ${time}`
    : null;

  return (
    <div className={cn('flex gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn('flex-1 justify-start text-left font-normal', !date && 'text-muted-foreground')}
          >
            <FontAwesomeIcon icon={faCalendar} className="mr-2 h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{label ?? 'Pick a date…'}</span>
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
            initialFocus
          />
        </PopoverContent>
      </Popover>

      <div className="relative w-32">
        <FontAwesomeIcon icon={faClock} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={!date}
          className="pl-8"
        />
      </div>
    </div>
  );
}
