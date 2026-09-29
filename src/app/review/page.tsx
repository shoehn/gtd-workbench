import { ReviewBoard, type ReviewPhase } from '@/components/review/ReviewBoard';
import { ReviewControls } from '@/components/review/ReviewControls';
import { StartCard } from '@/components/review/StartCard';
import { Page } from '@/components/shell/Page';
import * as api from '@/lib/api';
import { daysBetween, fmtDay } from '@/lib/format';
import type { ReviewRun } from '@/lib/model';

/** `fri 18.09 · 8 d ago`, `yesterday`, `today`. */
function when(iso: string, today: string, withDay = true): string {
  const d = daysBetween(iso, today);
  const ago = d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} d ago`;
  return withDay ? `${fmtDay(iso)} · ${ago}` : ago;
}

export default async function WeeklyReviewPage() {
  const today = api.today();
  const steps = api.reviewSteps();
  const last = api.lastFinishedRun();
  const lastLine = last?.finishedAt ? `last: ${when(last.finishedAt, today)}` : 'no review yet';
  const run = api.openRun();

  if (!run) {
    const closed = api.lastClosedRun();
    const abandoned: ReviewRun | undefined = closed?.outcome === 'abandoned' ? closed : undefined;
    const usual = api.usualReviewMinutes();
    return (
      <Page title="Weekly Review" meta={lastLine}>
        <StartCard
          summary={[
            last?.finishedAt ? `Last review ${when(last.finishedAt, today)}` : 'No review yet',
            `${steps.length} steps`,
            ...(usual ? [`usually ~${usual} min`] : []),
          ].join(' · ')}
          abandoned={
            abandoned &&
            (api.ticked(abandoned)
              ? `Last run abandoned at step ${api.ticked(abandoned)} · ${when(abandoned.startedAt, today, false)}`
              : `Last run abandoned before the first step · ${when(abandoned.startedAt, today, false)}`)
          }
          phases={api.reviewTemplate().phases.map((p) => ({ name: p.name, steps: p.steps.length }))}
        />
      </Page>
    );
  }

  const current = api.currentStep(run);
  const phases: ReviewPhase[] = api.reviewTemplate().phases.map((ph, n) => {
    const rows = ph.steps.map((st) => {
      const entry = run.steps.find((s) => s.stepId === st.id);
      const minutes = api.stepMinutes(run, st.id);
      return {
        id: st.id,
        text: st.text,
        done: !!entry?.doneAt,
        note: entry?.doneAt ? entry.note : undefined,
        live: entry?.doneAt ? undefined : api.reviewLiveLine(st.id),
        took: minutes ? `${minutes} min` : '—',
      };
    });
    const done = rows.filter((r) => r.done).length;
    return {
      id: ph.id,
      no: n + 1,
      name: ph.name,
      done,
      total: rows.length,
      state: done === rows.length ? 'ok' : rows.some((r) => !r.done && r.live?.warn) ? 'warn' : 'plain',
      steps: rows,
    };
  });
  const stats = api.weekStats();

  return (
    <Page
      title="Weekly Review"
      meta={`${lastLine} · ${api.ticked(run)} of ${steps.length} steps done`}
      actions={<ReviewControls elapsedMs={api.reviewElapsedMs(run)} paused={!!run.pausedAt} />}
    >
      <ReviewBoard
        phases={phases}
        current={current}
        notes={run.notes}
        paused={!!run.pausedAt}
        stats={[
          { value: stats.done, label: 'done' },
          { value: stats.captured, label: 'captured' },
          { value: stats.completedProjects, label: stats.completedProjects === 1 ? 'completed project' : 'completed projects' },
          { value: stats.stalled, label: 'stalled', warn: stats.stalled > 0 },
        ]}
      />
    </Page>
  );
}
