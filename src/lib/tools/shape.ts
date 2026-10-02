// What tools answer with (spec §4): compact, with the list it is on and a link into the app.
import * as api from '../api';
import type { Draft, Item, Project, Reference } from '../model';

export interface ItemOut {
  id: string; text: string; list: string; status: Item['status']; source: Item['source']; capturedAt: string;
  context?: string; priority?: string; time?: number; energy?: string; deadline?: string; day?: string;
  timeSlot?: { start: string; end: string }; focus?: true; project?: { id: string; title: string };
  waiting?: { who: string; since: string; followUp?: string }; reference?: Reference;
  draft?: { by: string; reason: string; kind: Draft['kind'] }; href?: string;
}

export function itemOut(i: Item): ItemOut {
  const project = i.projectId ? api.getProject(i.projectId) : undefined;
  const href = api.itemHref(i);
  return {
    id: i.id,
    text: i.text,
    list: api.LIST_NAMES[i.status],
    status: i.status,
    source: i.source,
    capturedAt: i.capturedAt,
    ...(i.context && { context: i.context }),
    ...(i.priority && { priority: `${i.priority}${i.priorityNo ?? ''}` }),
    ...(i.time && { time: i.time }),
    ...(i.energy && { energy: i.energy }),
    ...(i.deadline && { deadline: i.deadline }),
    ...(i.day && { day: i.day }),
    ...(i.timeSlot && { timeSlot: i.timeSlot }),
    ...(api.isFocused(i) && { focus: true as const }),
    ...(project && { project: { id: project.id, title: project.title } }),
    ...(i.waiting && { waiting: i.waiting }),
    ...(i.reference && { reference: i.reference }),
    ...(i.draft && { draft: { by: i.draft.by, reason: i.draft.reason, kind: i.draft.kind } }),
    ...(href && { href }),
  };
}

export interface ProjectOut {
  id: string; title: string; status: Project['status']; area?: string; deadline?: string;
  successfulWhen?: string; nextActions: number; stalled: boolean; href: string;
}

export function projectOut(p: Project): ProjectOut {
  return {
    id: p.id,
    title: p.title,
    status: p.status,
    ...(p.area && { area: p.area }),
    ...(p.deadline && { deadline: p.deadline }),
    ...(p.successfulWhen && { successfulWhen: p.successfulWhen }),
    nextActions: api.nextActionCount(p.id),
    stalled: api.projectStalled(p),
    href: `/projects?${p.status === 'completed' ? 'filter=completed&' : ''}p=${encodeURIComponent(p.id)}`,
  };
}
