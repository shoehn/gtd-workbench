// Display formats from the mockups: `sat 26.09`, `03.10`. Input is an ISO date or datetime.

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parts(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { date: new Date(y, m - 1, d), dd: String(d).padStart(2, '0'), mm: String(m).padStart(2, '0') };
}

/** `03.10` */
export function fmtDate(iso: string): string {
  const { dd, mm } = parts(iso);
  return `${dd}.${mm}`;
}

/** `sat 26.09` */
export function fmtDay(iso: string): string {
  const { date, dd, mm } = parts(iso);
  return `${WEEKDAYS[date.getDay()]} ${dd}.${mm}`;
}

/** `sat 09:12` */
export function fmtWeekdayTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${WEEKDAYS[d.getDay()]} ${hh}:${mi}`;
}

/** `2 h` below a day, `1 d` from there. */
export function fmtAge(hours: number): string {
  return hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
}

/** Time bucket in minutes → `15 min`, `1 h`, `2 h+`. */
export function fmtTime(minutes: number): string {
  if (minutes >= 120) return '2 h+';
  return minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`;
}

/** Row time: `15m`, `1h`, `2h+`. */
export function fmtMins(minutes: number): string {
  if (minutes >= 120) return '2h+';
  return minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`;
}

/** Sum of times: `35 min`, `2 h`, `2 h 45`. */
export function fmtTotal(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest}` : ''}`;
}

/** Whole days from `from` to `to`, both ISO dates (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parts(to).date.getTime() - parts(from).date.getTime()) / 86_400_000);
}

/** A date near `today` (within 6 days either way) as its weekday, `fri`; otherwise `03.10`. */
export function fmtNear(iso: string, today: string): string {
  const d = daysBetween(today, iso);
  return Math.abs(d) <= 6 ? WEEKDAYS[parts(iso).date.getDay()] : fmtDate(iso);
}

/** `today`, `1 d ago`, `21 d ago`. */
export function fmtDaysAgo(days: number): string {
  return days <= 0 ? 'today' : `${days} d ago`;
}
