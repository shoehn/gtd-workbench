import Link from 'next/link';
import { ActivityList } from '@/components/activity/ActivityList';
import { ActorFilter } from '@/components/activity/ActorFilter';
import { Page } from '@/components/shell/Page';
import * as api from '@/lib/api';
import { fmtDate, fmtWeekdayTime } from '@/lib/format';

/** Every change, by anyone (MCP design §3.2), newest first; undo while nothing changed since. */
export default async function ActivityPage({ searchParams }: PageProps<'/activity'>) {
  const { actor, subject } = await searchParams;
  const a = typeof actor === 'string' ? actor : undefined;
  const s = typeof subject === 'string' ? subject : undefined;
  const actors = api.listActivityActors();
  const rows = api.listActivity({ actor: a, subject: s, limit: 200 }).map((e) => ({
    id: e.id,
    when: `${fmtWeekdayTime(e.at, api.timeZone())} · ${fmtDate(e.at.slice(0, 10))}`,
    actor: e.actorLabel,
    summary: e.summary,
    blocker: e.blocker,
    undo: !!e.undoOf,
  }));
  const named = s && (api.getItem(s)?.text ?? api.getProject(s)?.title);
  return (
    <Page
      title="Activity"
      meta={named ? `history of “${named}”` : 'every change, by anyone · undo while nothing changed since'}
      toolbar={<ActorFilter actors={actors} value={a} subject={s} />}
      phone={{ meta: null }}
    >
      {s && (
        <p className="m-0 mb-3 font-mono text-meta text-muted">
          <Link href="/activity" className="text-accent">
            ← all activity
          </Link>
        </p>
      )}
      <ActivityList rows={rows} />
    </Page>
  );
}
