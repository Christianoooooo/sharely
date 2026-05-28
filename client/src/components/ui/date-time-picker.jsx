import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Two-input date+time picker that returns a UTC ISO string via onChange(isoString | null).
 * Splitting avoids the browser inconsistencies of datetime-local.
 */
export function DateTimePicker({ value, onChange, className }) {
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');

  // Sync outward when either input changes
  useEffect(() => {
    if (!date || !time) {
      onChange(null);
      return;
    }
    const d = new Date(`${date}T${time}`);
    if (isNaN(d.getTime())) {
      onChange(null);
      return;
    }
    onChange(d.toISOString());
  }, [date, time]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn('flex gap-2', className)}>
      <Input
        type="date"
        min={today}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="flex-1"
      />
      <Input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="w-32"
        disabled={!date}
      />
    </div>
  );
}
