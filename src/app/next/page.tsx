import { FilterBar } from '@/components/next/FilterBar';
import { HealthCard } from '@/components/next/HealthCard';
import { NextBoard, type NextGroup } from '@/components/next/NextBoard';
import { TodayCard } from '@/components/next/TodayCard';
import { CaptureField } from '@/components/shell/CaptureField';
import { Page } from '@/components/shell/Page';
import { Btn } from '@/components/ui/Btn';
import * as api from '@/lib/api';
import { daysBetween, fmtDate, fmtDay, fmtMins, fmtTotal } from '@/lib/format';
import { groupByContext, isFiltered, matches, parseFilter } from '@/lib/next-filter';

const DUE_SOON_DAYS = 7;

export default async function NextActionsPage({ searchParams }: PageProps<'/next'>) {
  const contexts = api.listContexts();
  const filter = parseFilter(await searchParams, contexts);
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
        energy: i.energy,
        due: i.deadline && fmtDate(i.deadline),
        dueSoon: !!i.deadline && daysBetween(today, i.deadline) <= DUE_SOON_DAYS,
        focused: api.isFocused(i),
      };
    }),
  }));

  return (
    <Page
      title="Next Actions"
      meta={isFiltered(filter) ? `${all.length} · ${shown.length} match filter` : `${all.length}`}
      actions={
        <>
          <CaptureField />
          <Btn className="hidden lg:inline-flex">Group: context ▾</Btn>
        </>
      }
      toolbar={<FilterBar contexts={contexts} filter={filter} />}
    >
      <NextBoard
        groups={groups}
        hiddenByFilter={all.length - shown.length}
        focus={api.focusToday().map((i) => ({ id: i.id, text: i.text, done: i.status === 'done' }))}
        contexts={contexts}
        projects={api.listPickerProjects()}
        today={<TodayCard day={fmtDay(today)} entries={api.todayLandscape()} />}
        health={<HealthCard health={api.health()} />}
      />
    </Page>
  );
}
