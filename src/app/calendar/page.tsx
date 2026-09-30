import Link from 'next/link';
import { Agenda, type AgendaDay } from '@/components/calendar/Agenda';
import { CalendarRail } from '@/components/calendar/CalendarRail';
import { WeekGrid } from '@/components/calendar/WeekGrid';
import { Page } from '@/components/shell/Page';
import { Btn } from '@/components/ui/Btn';
import * as api from '@/lib/api';
import { daysBetween, fmtDate, fmtDay } from '@/lib/format';
import { addDays, isoWeek, parseWeek, shiftWeek, weekDays } from '@/lib/week';

/** The phone agenda runs this many days from the chosen day. */
const AGENDA_DAYS = 14;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** `2 appointments · 1 deadline` */
function daySummary(entries: api.CalendarEntry[]): string {
  const n = (kind: api.CalendarEntry['kind']) => entries.filter((e) => e.kind === kind).length;
  const deadlines = n('deadline') + entries.filter((e) => e.kind === 'dayaction' && e.deadline).length;
  return [
    n('appointment') && plural(n('appointment'), 'appointment'),
    n('timeblock') && plural(n('timeblock'), 'time block'),
    // A day action due that day counts as its deadline only.
    entries.filter((e) => e.kind === 'dayaction' && !e.deadline).length &&
      plural(entries.filter((e) => e.kind === 'dayaction' && !e.deadline).length, 'day action'),
    n('info') && plural(n('info'), 'note'),
    deadlines && plural(deadlines, 'deadline'),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Deadlines this close show in orange, as on Next Actions. */
const DUE_SOON_DAYS = 7;

export default async function CalendarPage({ searchParams }: PageProps<'/calendar'>) {
  const params = await searchParams;
  const today = api.today();
  const week = parseWeek(params.week) ?? isoWeek(today);
  const days = weekDays(week);
  const now = api.now();
  // Phone: the agenda starts at the chosen day of the strip, else today (in this week), else Monday.
  const day = typeof params.day === 'string' && days.includes(params.day) ? params.day : days.includes(today) ? today : days[0];
  const agendaEntries = api.landscapeBetween(day, addDays(day, AGENDA_DAYS - 1));
  const agenda: AgendaDay[] = Array.from({ length: AGENDA_DAYS }, (_, n) => addDays(day, n))
    .map((iso) => {
      const entries = agendaEntries.filter((e) => e.day === iso);
      const weekday = WEEKDAY_NAMES[new Date(`${iso}T12:00:00`).getDay()];
      return {
        iso,
        title: `${weekday} ${fmtDate(iso)}${iso === today ? ' · today' : ''}`,
        summary: daySummary(entries),
        entries,
        ...(iso === today && { nowMin: api.minutesOfDay(now) }),
      };
    })
    .filter((d) => d.entries.length > 0);

  const nav = (
    <div className="ml-1 flex gap-0.5">
      <Btn href={`/calendar?week=${shiftWeek(week, -1)}`} size="sm" aria-label="Previous week" className="w-7 px-0">
        ‹
      </Btn>
      <Btn href="/calendar" size="sm">
        Today
      </Btn>
      <Btn href={`/calendar?week=${shiftWeek(week, 1)}`} size="sm" aria-label="Next week" className="w-7 px-0">
        ›
      </Btn>
    </div>
  );

  return (
    <Page
      title="Calendar"
      meta={`week ${Number(week.slice(6))} · ${fmtDate(days[0])} – ${fmtDate(days[6])}`}
      tools={nav}
      phone={{
        meta: `agenda · wk ${Number(week.slice(6))}`,
        back: { href: '/next', label: 'next actions' },
        header: (
          <nav aria-label="Days of the week" className="grid grid-cols-7 gap-1">
            {days.map((iso) => {
              const on = iso === day;
              return (
                <Link
                  key={iso}
                  href={`/calendar?week=${week}&day=${iso}`}
                  aria-current={on ? 'date' : undefined}
                  aria-label={fmtDay(iso)}
                  className={`flex h-11 flex-col items-center justify-center rounded border no-underline ${on ? 'border-accent bg-accent-tint text-accent' : 'border-transparent text-ink'}`}
                >
                  <span className={`font-mono text-label ${on ? '' : 'text-muted'}`}>{fmtDay(iso).slice(0, 2).toUpperCase()}</span>
                  <span className={`text-sm ${on ? 'font-semibold' : ''}`}>{Number(iso.slice(8))}</span>
                </Link>
              );
            })}
          </nav>
        ),
      }}
    >
      <Agenda days={agenda} />
      <div className="grid gap-4 max-lg:hidden lg:h-full lg:grid-cols-[minmax(0,1fr)_260px]">
        <WeekGrid
          days={days.map((iso) => ({
            iso,
            weekday: fmtDay(iso).slice(0, 3).toUpperCase(),
            date: Number(iso.slice(8)),
            today: iso === today,
          }))}
          entries={api.weekLandscape(week)}
          nowMin={days.includes(today) ? api.minutesOfDay(now) : undefined}
        />
        <CalendarRail
          deadlines={api.upcomingDeadlines().map((d) => ({
            id: d.id,
            date: fmtDate(d.day),
            soon: daysBetween(today, d.day) <= DUE_SOON_DAYS,
            text: d.text,
            href: d.href,
          }))}
          syncedAt={api.calendarSyncedAt()?.slice(11, 16)}
          calendars={api.listExternalCalendars()}
        />
      </div>
    </Page>
  );
}
