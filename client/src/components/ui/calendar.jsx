import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';

export function Calendar({ className, classNames, showOutsideDays = true, ...props }) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'relative flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
        month: 'space-y-4',
        month_caption: 'flex justify-center pt-1 relative items-center h-7',
        caption_label: 'text-sm font-medium',
        nav: 'absolute top-1 inset-x-1 flex items-center justify-between z-10',
        button_previous: cn(buttonVariants({ variant: 'outline' }), 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100'),
        button_next: cn(buttonVariants({ variant: 'outline' }), 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100'),
        month_grid: 'w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
        week: 'flex w-full mt-2',
        day: 'h-9 w-9 text-center text-sm p-0 relative rounded-md focus-within:relative focus-within:z-20',
        day_button: cn(buttonVariants({ variant: 'ghost' }), 'h-9 w-9 p-0 font-normal aria-selected:opacity-100'),
        range_end: 'day-range-end',
        selected: '[&>button]:bg-primary [&>button]:text-primary-foreground hover:[&>button]:bg-primary hover:[&>button]:text-primary-foreground focus:[&>button]:bg-primary focus:[&>button]:text-primary-foreground',
        today: 'bg-accent text-accent-foreground',
        outside: 'day-outside text-muted-foreground opacity-50',
        disabled: 'text-muted-foreground opacity-50',
        range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => (
          <FontAwesomeIcon icon={orientation === 'left' ? faChevronLeft : faChevronRight} className="h-4 w-4" />
        ),
      }}
      {...props}
    />
  );
}
