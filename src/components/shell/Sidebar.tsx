import * as api from '@/lib/api';
import { fmtDay } from '@/lib/format';
import { NavLink } from './NavLink';

function Group({ label }: { label: string }) {
  return (
    <div className="px-2.5 pt-2.5 pb-0.5 font-mono text-label tracking-[0.1em] text-muted first-of-type:pt-1.5">
      {label}
    </div>
  );
}

export function Sidebar() {
  const c = api.navCounts();
  const review = api.reviewBadge();
  return (
    <nav
      aria-label="Lists"
      className="flex w-(--wb-sidebar-w) shrink-0 flex-col gap-1 border-r border-line bg-rail px-2.5 py-3.5"
    >
      <div className="flex items-baseline justify-between px-2.5 pt-0.5 pb-3">
        <span className="font-mono font-medium tracking-[0.08em]">GTD/WB</span>
        <span className="font-mono text-meta text-muted">{fmtDay(api.today())}</span>
      </div>
      <Group label="COLLECT" />
      <NavLink href="/inbox" badge={c.inbox} badgeWarn={c.inboxAging}>Inbox</NavLink>
      <Group label="DO" />
      <NavLink href="/next" badge={c.next}>Next Actions</NavLink>
      <NavLink href="/calendar" badge={c.calendar}>Calendar</NavLink>
      <NavLink href="/waiting" badge={c.waiting}>Waiting For</NavLink>
      <Group label="HORIZONS" />
      <NavLink href="/projects" badge={c.projects}>Projects</NavLink>
      <NavLink href="/waiting?tab=someday" badge={c.someday} noCurrent>Someday / Maybe</NavLink>
      <NavLink href="/projects" badge="—" noCurrent>Reference</NavLink>
      <div className="grow" />
      <NavLink href="/review" badge={typeof review === 'string' ? review : fmtDay(review.finishedAt)} badgeWarn={typeof review === 'string'} boxed>
        Weekly Review
      </NavLink>
    </nav>
  );
}
