export function parseDatumDe(s?: string): number {
  if (!s) return Number.MAX_SAFE_INTEGER;
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
}

/** dd.MM.yyyy aus beliebigem Text (z. B. „Montag, 08.06.2026 13:00“). */
export function extractDeDatum(s?: string): string | null {
  if (!s?.trim()) return null;
  const m = s.trim().match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  return `${day}.${month}.${m[3]}`;
}

/** dd.MM.yyyy → lokales Datum Mitternacht, sonst null */
export function parseDatumDeToDate(s?: string): Date | null {
  const norm = extractDeDatum(s);
  if (!norm) return null;
  const m = norm.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dayKeyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Kalendertag 1–31 aus yyyy-MM-dd. */
export function dayOfMonthFromDayKey(dayKey: string): number {
  return Number(dayKey.split('-')[2]);
}

export function dayKeyFromDeDatum(datum?: string): string | null {
  const d = parseDatumDeToDate(datum);
  return d ? dayKeyFromDate(d) : null;
}

/** Uhrzeit aus separatem Feld oder aus kombiniertem Datumstext (z. B. „08.06.2026 14:00“). */
export function extractZeitDe(datum?: string, zeit?: string): string | undefined {
  const fromZeit = formatZeitDe(zeit);
  if (fromZeit) return fromZeit;
  if (!datum?.trim()) return undefined;
  const m = datum.trim().match(/\d{4}[\s,.-]+(\d{1,2})[.:](\d{2})/);
  if (!m) return undefined;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function parseDatumZeitDe(
  datum?: string,
  zeit?: string,
  endOfDayIfNoTime = false
): number | null {
  const d = parseDatumDeToDate(datum);
  if (!d) return null;

  let h = endOfDayIfNoTime ? 23 : 0;
  let min = endOfDayIfNoTime ? 59 : 0;
  let sec = endOfDayIfNoTime ? 59 : 0;
  let ms = endOfDayIfNoTime ? 999 : 0;

  const zeitNorm = extractZeitDe(datum, zeit);
  if (zeitNorm) {
    const tm = zeitNorm.match(/(\d{1,2}):(\d{2})/);
    if (tm) {
      h = +tm[1];
      min = +tm[2];
      sec = 0;
      ms = 0;
    }
  }

  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min, sec, ms).getTime();
}

export function formatZeitDe(zeit?: string): string {
  if (!zeit?.trim()) return '';
  const tm = zeit.trim().match(/(\d{1,2})[.:](\d{2})/);
  return tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : '';
}

export function formatDayLabelDe(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('de-AT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Montag der Woche, die das Datum enthält (Mo–So). */
export function startOfWeekMonday(d: Date): Date {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysSinceMonday = (local.getDay() + 6) % 7;
  return addDays(local, -daysSinceMonday);
}

export function isNextCalendarDay(aKey: string, bKey: string): boolean {
  const [ay, am, ad] = aKey.split('-').map(Number);
  const next = new Date(ay, am - 1, ad + 1);
  return dayKeyFromDate(next) === bKey;
}
