import { FilterBar, PhoneFilters } from '@/components/next/FilterBar';
import { HealthCard } from '@/components/next/HealthCard';
import { NextBoard, type NextGroup } from '@/components/next/NextBoard';
import { TodayCard } from '@/components/next/TodayCard';
import { Page } from '@/components/shell/Page';
import * as api from '@/lib/api';
import { daysBetween, fmtDate, fmtDay, fmtMins, fmtTotal } from '@/lib/format';
import { groupByContext, isFiltered, matches, parseFilter } from '@/lib/next-filter';

const DUE_SOON_DAYS = 7;

export default async function NextActionsPage({ searchParams }: PageProps<'/next'>) {
  const contexts = api.listContexts();
  const params = await searchParams;
  const filter = parseFilter(params, contexts);
  const today = api.today();
  const projects = new Map(api.listProjects('active').concat(api.listProjects('someday')).map((p) => [p.id, p]));
  const all = api.listNext();
  const shown = all.filter((i) => matches(i, filter));

  const groups: NextGroup[] = groupByContext(shown, contexts).map((g) => ({
    context: g.context,
    count: g.items.length,
    total: fmtTotal(g.items.reduce((sum, i) => sum + (i.time ?? 0), 0)),
    rows: g.items.map((i) => {
      const project = i.projectId ? projects.get(i.projectId) : undefined;
      return {
        id: i.id,
        text: i.text,
        context: i.context ?? '',
        priority: i.priority,
        priorityNo: i.priorityNo,
        project: project && { id: project.id, title: project.title },
        time: i.time && fmtMins(i.time),
        minutes: i.time,
        energy: i.energy,
        due: i.deadline && fmtDate(i.deadline),
        deadline: i.deadline,
        dueSoon: !!i.deadline && daysBetween(today, i.deadline) <= DUE_SOON_DAYS,
      };
    }),
  }));

  const landscape = api.todayLandscape();

  return (
    <Page
      title="Next Actions"
      meta={isFiltered(filter) ? `${all.length} · ${shown.length} match filter` : `${all.length}`}
      toolbar={<FilterBar contexts={contexts} filter={filter} />}
      phone={{
        meta: isFiltered(filter) ? `${shown.length} of ${all.length}` : `${all.length}`,
        header: <PhoneFilters contexts={contexts} filter={filter} />,
      }}
    >
      <NextBoard
        groups={groups}
        hiddenByFilter={all.length - shown.length}
        focus={api.focusToday().map((i) => ({ id: i.id, text: i.text, done: i.status === 'done' }))}
        contexts={contexts}
        projects={api.listPickerProjects().filter((p) => p.active)}
        highlight={typeof params.highlight === 'string' ? params.highlight : undefined}
        today={<TodayCard day={fmtDay(today)} entries={landscape} />}
        todayLine={landscape
          .map((e) => (e.kind === 'deadline' || e.deadline ? `${e.text} deadline` : [e.time, e.text].filter(Boolean).join(' ')))
          .join(' · ')}
        health={<HealthCard health={api.health()} />}
      />
    </Page>
  );
}
