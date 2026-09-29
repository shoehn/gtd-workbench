import { CalendarRail } from '@/components/calendar/CalendarRail';
import { WeekGrid } from '@/components/calendar/WeekGrid';
import { Page } from '@/components/shell/Page';
import { Btn } from '@/components/ui/Btn';
import * as api from '@/lib/api';
import { daysBetween, fmtDate, fmtDay } from '@/lib/format';
import { isoWeek, parseWeek, shiftWeek, weekDays } from '@/lib/week';

/** Deadlines this close show in orange, as on Next Actions. */
const DUE_SOON_DAYS = 7;

export default async function CalendarPage({ searchParams }: PageProps<'/calendar'>) {
  const params = await searchParams;
  const today = api.today();
  const week = parseWeek(params.week) ?? isoWeek(today);
  const days = weekDays(week);
  const now = api.now();

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
    <Page title="Calendar" meta={`week ${Number(week.slice(6))} · ${fmtDate(days[0])} – ${fmtDate(days[6])}`} tools={nav}>
      <div className="grid gap-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_260px]">
        <WeekGrid
          days={days.map((iso) => ({
            iso,
            weekday: fmtDay(iso).slice(0, 3).toUpperCase(),
            date: Number(iso.slice(8)),
            today: iso === today,
          }))}
          entries={api.weekLandscape(week)}
          nowMin={days.includes(today) ? now.getHours() * 60 + now.getMinutes() : undefined}
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
