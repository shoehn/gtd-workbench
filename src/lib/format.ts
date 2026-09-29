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
