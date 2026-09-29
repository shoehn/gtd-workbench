import { Page } from '@/components/shell/Page';
import { WaitingBoard, type WaitingRow } from '@/components/waiting/WaitingBoard';
import * as api from '@/lib/api';
import { daysBetween, fmtDate, fmtDay } from '@/lib/format';

/** Follow-up dates within a week show their weekday (`tue 29.09`), later ones only the date. */
const WEEKDAY_WITHIN = 7;

export default async function WaitingPage({ searchParams }: PageProps<'/waiting'>) {
  const params = await searchParams;
  const overdueOnly = params.filter === 'overdue';
  const today = api.today();
  const all = api.listWaiting();
  const overdue = all.filter((i) => api.isOverdue(i, today));

  const waiting: WaitingRow[] = (overdueOnly ? overdue : all).map((i) => {
    const w = i.waiting!;
    const project = i.projectId ? api.getProject(i.projectId) : undefined;
    const due = w.followUp ? daysBetween(today, w.followUp) : 0;
    return {
      id: i.id,
      text: i.text,
      who: w.who,
      project: project && { id: project.id, title: project.title },
      since: `${Math.max(0, daysBetween(w.since, today))} d`,
      followUp: !w.followUp
        ? 'no date'
        : due < 0
          ? `overdue ${-due} d`
          : due < WEEKDAY_WITHIN
            ? fmtDay(w.followUp)
            : fmtDate(w.followUp),
      overdue: api.isOverdue(i, today),
    };
  });

  const someday = api.listSomeday();
  const onHold = api.listProjects('someday').map((p) => ({
    id: p.id,
    title: p.title,
    later: api.projectItems(p.id).filter((i) => i.status === 'later').length,
  }));

  return (
    <Page title="Waiting For & Someday / Maybe" meta="the two lists that keep the others honest">
      <WaitingBoard
        waiting={waiting}
        waitingTotal={all.length}
        overdueCount={overdue.length}
        overdueOnly={overdueOnly}
        onHold={onHold}
        someday={someday.map((g) => ({ bucket: g.bucket, items: g.items.map((i) => ({ id: i.id, text: i.text })) }))}
        somedayTotal={someday.reduce((n, g) => n + g.items.length, 0)}
        buckets={api.listBuckets()}
        contexts={api.listContexts()}
        initialPane={params.tab === 'someday' ? 'someday' : 'waiting'}
      />
    </Page>
  );
}
