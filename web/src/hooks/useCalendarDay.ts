import { useEffect, useState } from 'react';
import { calendarDayKey } from '../board/ausstehendStatus';

/** Aktualisiert sich um Mitternacht und beim Tab-Fokus — für „Heute“-Filter. */
export function useCalendarDay(): string {
  const [day, setDay] = useState(() => calendarDayKey());

  useEffect(() => {
    let timeoutId = 0;

    const sync = () => setDay(calendarDayKey());

    const scheduleMidnight = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timeoutId = window.setTimeout(() => {
        sync();
        scheduleMidnight();
      }, next.getTime() - now.getTime() + 500);
    };

    sync();
    scheduleMidnight();

    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return day;
}
