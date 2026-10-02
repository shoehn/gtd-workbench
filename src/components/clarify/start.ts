// What Clarify's form starts with (pure, so it can be tested): an agent's draft if the item has
// one (MCP §3.4), else the item itself — its carried project, its `^date`, its shorthand.
import type { Route } from '@/lib/api';
import type { Draft, Energy, Priority, TimeBucket } from '@/lib/model';
import type { Picked, PickerProject } from '../ui/ProjectPicker';

export type Answer = 'yes' | 'trash' | 'someday' | 'reference';

export interface StartItem {
  text: string;
  context?: string;
  priority?: Priority;
  day?: string;
  projectId?: string;
  draft?: Draft;
}

export interface ClarifyStart {
  answer: Answer | null;
  text: string;
  query: string;
  picked: Picked;
  asNext: boolean;
  routeTo: Route['to'] | null;
  context: string;
  priority: Priority;
  time: TimeBucket;
  energy: Energy;
  deadline: string;
  day: string;
  who: string;
  followUp: string;
}

const toPicked = (p: PickerProject): Picked => ({ id: p.id, title: p.title, nextActions: p.nextActions, active: p.active });

export function clarifyStart(item: StartItem, projects: PickerProject[], contexts: string[]): ClarifyStart {
  const d = item.draft;
  const carried = projects.find((p) => p.id === item.projectId);
  // A draft's project only if it can still be picked (it may have been completed since).
  const draftProject: Picked = !d?.project
    ? null
    : 'newTitle' in d.project
      ? { newTitle: d.project.newTitle }
      : (() => {
          const id = (d.project as { id: string }).id;
          const p = projects.find((x) => x.id === id);
          return p ? toPicked(p) : null;
        })();
  const picked: Picked = draftProject ?? (carried ? toPicked(carried) : null);
  return {
    answer: !d ? null : d.kind === 'action' || d.kind === 'project' ? 'yes' : d.kind,
    text: d?.text ?? item.text,
    // The field shows a starting pick by its title, as a pick made by hand does.
    query: picked ? ('id' in picked ? picked.title : picked.newTitle) : '',
    picked,
    // As pick() would set it for the starting project, unless the draft says — but a project
    // parked since the draft takes no next action (SPEC §3.4): then a later step, as by hand.
    asNext: picked && 'id' in picked && !picked.active ? false : (d?.next ?? (picked && 'id' in picked ? picked.nextActions === 0 : true)),
    // A day captured with `^date` is an offer for the calendar (SPEC §3.2).
    routeTo: d?.route ?? (item.day ? 'calendar' : null),
    context: d?.context && contexts.includes(d.context) ? d.context : (item.context ?? contexts[0]),
    priority: d?.priority ?? item.priority ?? 'B',
    time: d?.time ?? 30,
    energy: d?.energy ?? 'normal',
    deadline: d?.deadline ?? '',
    day: d?.day ?? item.day ?? '',
    who: d?.who ?? '',
    followUp: d?.followUp ?? '',
  };
}
