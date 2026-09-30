import Link from 'next/link';
import { ProjectDetail, type DetailData } from '@/components/projects/ProjectDetail';
import { ProjectList, type ProjectRow } from '@/components/projects/ProjectList';
import { Page } from '@/components/shell/Page';
import { PhoneChipLinks } from '@/components/ui/PhoneChip';
import { cx } from '@/components/ui/cx';
import * as api from '@/lib/api';
import { daysBetween, fmtDate, fmtDay, fmtDaysAgo, fmtMins, fmtNear } from '@/lib/format';
import type { Project } from '@/lib/model';
import { byPriority } from '@/lib/next-filter';
import { PROJECT_FILTERS, parseProjectFilter, projectsHref, type ProjectFilter } from '@/lib/project-filter';
import { compareStamps } from '@/lib/week';

const REVIEW_WARN_DAYS = 14;

function inFilter(p: Project, filter: ProjectFilter): boolean {
  if (filter === 'completed' || filter === 'someday') return p.status === filter;
  if (p.status !== 'active') return false;
  if (filter === 'stalled') return api.projectStalled(p);
  if (filter === 'work' || filter === 'home') return api.projectKind(p) === filter;
  return true;
}

/** "No next action — waiting on Marc only" or "… — define one in review". */
function stalledReason(projectId: string): string {
  const who = [...new Set(api.projectItems(projectId).filter((i) => i.status === 'waiting').map((i) => i.waiting!.who))];
  return `No next action — ${who.length ? `waiting on ${who.join(', ')} only` : 'define one in review'}`;
}

/** Second line for a parked project: what is waiting for it when it comes back. */
function laterCount(projectId: string): string {
  const n = api.projectItems(projectId).filter((i) => i.status === 'later').length;
  return `${n} later step${n === 1 ? '' : 's'} · → Active to resume`;
}

export default async function ProjectsPage({ searchParams }: PageProps<'/projects'>) {
  const params = await searchParams;
  const filter = parseProjectFilter(params.filter);
  const today = api.today();
  const all = api.listProjects('active').concat(api.listProjects('someday'), api.listProjects('completed'));
  const listed = all.filter((p) => inFilter(p, filter));
  const pParam = typeof params.p === 'string' ? params.p : undefined;
  // A project named in the URL stays selected even when the filter hides it (e.g. just parked).
  const selected = (pParam && api.getProject(pParam)) || listed[0];

  const rows: ProjectRow[] = listed.map((p) => {
    const next = api.listNext().filter((i) => i.projectId === p.id).sort(byPriority);
    const stalled = api.projectStalled(p);
    const state = p.status === 'active' ? (stalled ? 'stalled' : 'ok') : p.status;
    const reviewedDays = p.lastReviewedAt ? daysBetween(p.lastReviewedAt, today) : undefined;
    return {
      id: p.id,
      title: p.title,
      href: projectsHref(filter, p.id),
      state,
      dropped: p.dropped,
      line:
        p.status === 'someday'
          ? laterCount(p.id)
          : stalled
            ? stalledReason(p.id)
            : next[0] && `→ ${next[0].text}`,
      nextActions: next.length,
      reviewed: reviewedDays === undefined ? '—' : fmtDaysAgo(reviewedDays),
      reviewWarn: reviewedDays === undefined || reviewedDays > REVIEW_WARN_DAYS,
    };
  });
  // Phone rows add what the desktop columns show: waiting-for count and deadline.
  const phoneMeta = (id: string) => {
    const p = api.getProject(id)!;
    const n = api.nextActionCount(id);
    const waiting = api.projectItems(id).filter((i) => i.status === 'waiting').length;
    return [`${n} action${n === 1 ? '' : 's'}`, waiting && `${waiting} waiting`, p.deadline && `due ${fmtDate(p.deadline)}`]
      .filter(Boolean)
      .join(' · ');
  };

  const active = api.listProjects('active');
  const stalledCount = active.filter(api.projectStalled).length;
  const meta = (
    <>
      {active.length} active
      {stalledCount > 0 && (
        <>
          {' · '}
          <span className="text-warn">{stalledCount} without next action</span>
        </>
      )}
    </>
  );

  const dot = { ok: 'bg-ok', stalled: 'bg-warn', someday: 'bg-control', completed: 'bg-control' } as const;
  // Phone: the list without `?p=`, the detail with it (SPEC §2).
  const phoneDetail = !!pParam && !!selected;

  return (
    <Page
      title="Projects"
      meta={meta}
      flush
      phone={{
        meta: phoneDetail ? null : (
          <>
            {active.length}
            {stalledCount > 0 && <span className="text-warn"> · {stalledCount} stalled</span>}
          </>
        ),
        back: phoneDetail ? { href: projectsHref(filter), label: 'projects' } : undefined,
        header: phoneDetail ? undefined : (
          <PhoneChipLinks
            label="Filter projects"
            chips={[...PROJECT_FILTERS, 'completed' as const].map((f) => ({ label: f, href: projectsHref(f), pressed: filter === f }))}
          />
        ),
      }}
    >
      {!phoneDetail && (
        <ul className="m-0 list-none bg-panel p-0 lg:hidden">
          {rows.map((r) => (
            <li key={r.id} className="border-b border-line-soft">
              <Link
                href={r.href}
                className="grid grid-cols-[10px_minmax(0,1fr)_24px] items-start gap-2.5 px-4 py-3 text-ink no-underline"
              >
                <span aria-hidden="true" className={cx('mt-1.75 size-2 rounded-full', dot[r.state])} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{r.title}</span>
                  {r.line && <span className={cx('text-sm', r.state === 'stalled' ? 'text-warn' : 'text-muted')}>{r.line}</span>}
                  <span className="font-mono text-meta text-muted">{phoneMeta(r.id)}</span>
                </span>
                <span aria-hidden="true" className="mt-0.5 text-muted">›</span>
              </Link>
            </li>
          ))}
          {rows.length === 0 && <li className="px-4 py-8 text-center font-mono text-meta text-muted">No projects here.</li>}
        </ul>
      )}
      <div className="flex flex-col lg:grid lg:h-full lg:grid-cols-[420px_minmax(0,1fr)]">
        <ProjectList
          rows={rows}
          selectedId={selected?.id}
          filter={filter}
          completed={api.listProjects('completed').length}
        />
        {selected ? (
          <div className={cx('lg:contents', !phoneDetail && 'max-lg:hidden')}>
            <ProjectDetail key={selected.id} project={detail(selected, today)} contexts={api.listContexts()} />
          </div>
        ) : (
          <p className="m-0 p-8 text-center font-mono text-meta text-muted max-lg:hidden">No project selected.</p>
        )}
      </div>
    </Page>
  );
}

function detail(p: Project, today: string): DetailData {
  const items = api.projectItems(p.id);
  const waiting = items.filter((i) => i.status === 'waiting' && i.waiting);
  const overdue = (followUp?: string) => !!followUp && followUp < today;
  const reviewedDays = p.lastReviewedAt ? daysBetween(p.lastReviewedAt, today) : undefined;
  const headline = [
    p.area,
    p.createdAt && `created ${fmtDay(p.createdAt)}`,
    p.createdFrom && `from ${p.createdFrom}`,
  ]
    .filter(Boolean)
    .join(' · ')
    .toUpperCase();
  return {
    id: p.id,
    title: p.title,
    status: p.status,
    dropped: p.dropped,
    headline,
    successfulWhen: p.successfulWhen,
    deadline: p.deadline && fmtDate(p.deadline),
    area: p.area,
    goal: p.goal,
    notes: p.notes,
    lastReviewed: reviewedDays === undefined ? 'never' : fmtDaysAgo(reviewedDays),
    open: api.openInProject(p.id),
    next: items
      .filter((i) => i.status === 'next')
      .sort(byPriority)
      .map((i) => ({
        id: i.id,
        text: i.text,
        priority: i.priority,
        priorityNo: i.priorityNo,
        context: i.context,
        time: i.time && fmtMins(i.time),
        today: api.isFocused(i),
      })),
    later: items.filter((i) => i.status === 'later').map((i) => ({ id: i.id, text: i.text })),
    done: items
      .filter((i) => i.status === 'done')
      .sort((a, b) => compareStamps(a.doneAt, b.doneAt))
      .map((i) => ({ id: i.id, text: i.text, context: i.context })),
    waiting: waiting.map((i) => ({
      id: i.id,
      text: i.text,
      who: i.waiting!.who,
      since: fmtNear(i.waiting!.since, today),
      followUp: i.waiting!.followUp && fmtNear(i.waiting!.followUp, today),
      overdue: overdue(i.waiting!.followUp),
    })),
    waitingHref: waiting.some((i) => overdue(i.waiting!.followUp)) ? '/waiting?filter=overdue' : '/waiting',
  };
}
