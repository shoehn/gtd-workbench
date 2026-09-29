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
