// Tools that act on items (spec §5.4–5.6). Array tools check every id first, then change all
// of them in one write, so a refusal never leaves half of them done.
import * as z from 'zod';
import * as api from '../api';
import { store } from '../store';
import { tool } from './define';
import { context, energy, id, ids, isoDate, priority, projectChoice, slot, time } from './schemas';
import { itemOut } from './shape';

const all = <T>(list: string[], checkOne: (id: string) => void, each: (id: string) => T): T[] => {
  list.forEach(checkOne);
  let out: T[] = [];
  store.update(() => {
    out = list.map(each);
  });
  return out;
};
const statusIs = (scope: string, ok: (i: ReturnType<typeof api.getItem>) => boolean, what: string) => (itemId: string) => {
  if (!ok(api.getItem(itemId))) throw new Error(`${scope}: item ${itemId} ${what}`);
};

export const DO_TOOLS = [
  tool({
    name: 'complete',
    description: 'Mark next actions (or calendar items) done. All ids are checked first; nothing changes if one is refused.',
    capability: 'write',
    input: z.strictObject({ ids }),
    run: ({ ids: list }) => {
      all(list, statusIs('complete', (i) => i?.status === 'next' || i?.status === 'calendar', 'cannot be completed'), (x) => api.complete(x));
      return list.map((x) => itemOut(api.getItem(x)!));
    },
  }),
  tool({
    name: 'reopen',
    description: 'Put a done item back on Next Actions.',
    capability: 'write',
    input: z.strictObject({ id }),
    run: ({ id: x }) => (api.reopen(x), itemOut(api.getItem(x)!)),
  }),
  tool({
    name: 'set_focus',
    description: 'Star next actions for today ("my three for today"), or remove the star. Sets the state; calling twice does not toggle it back.',
    capability: 'write',
    input: z.strictObject({ ids, on: z.boolean() }),
    run: ({ ids: list, on }) =>
      all(list, statusIs('set_focus', (i) => i?.status === 'next', 'is not a next action'), (x) => {
        if (api.isFocused(api.getItem(x)!) !== on) api.toggleFocus(x);
        return x;
      }),
  }),
  tool({
    name: 'edit_next_action',
    description: 'Change a next action: text, context, priority, time, energy, deadline (null removes it), project (null = single action, or { new: title }).',
    capability: 'write',
    input: z.strictObject({ id, text: z.string().min(1).optional(), context: context.optional(), priority: priority.optional(), time: time.optional(), energy: energy.optional(), deadline: isoDate.nullable().optional(), project: projectChoice.nullable().optional() }),
    run: ({ id: x, project, ...edit }) => {
      api.editNext(x, { ...edit, ...(project !== undefined && { project: project === null ? null : 'id' in project ? { id: project.id } : { newTitle: project.new } }) });
      return itemOut(api.getItem(x)!);
    },
  }),
  tool({
    name: 'time_block',
    description: 'Give a next action or calendar item a time slot (yyyy-mm-ddThh:mm). Without end it lasts the action\'s time estimate. A block today stars a next action for today.',
    capability: 'write',
    input: z.strictObject({ id, start: slot, end: slot.optional() }),
    run: ({ id: x, start, end }) => (api.setTimeSlot(x, start, end), itemOut(api.getItem(x)!)),
  }),
  tool({
    name: 'clear_time_block',
    description: 'Remove an item\'s time slot (a calendar item stays on its day; stars are not touched).',
    capability: 'write',
    input: z.strictObject({ id }),
    run: ({ id: x }) => (api.clearTimeSlot(x), itemOut(api.getItem(x)!)),
  }),
  tool({
    name: 'trash',
    description: 'Move open items to the trash (kept 30 days, undoable).',
    capability: 'write',
    input: z.strictObject({ ids }),
    run: ({ ids: list }) => {
      list.forEach(statusIs('trash', (i) => !!i && i.status !== 'trash' && i.status !== 'done', 'is not an open item'));
      return api.trash(list);
    },
  }),
  tool({
    name: 'follow_up',
    description: 'For a waiting-for: create the chase action ("Follow up with <who>: <what>") and move the follow-up date a week on — as the f key does.',
    capability: 'write',
    input: z.strictObject({ id }),
    run: ({ id: x }) => itemOut(api.followUp(x)),
  }),
  tool({
    name: 'received',
    description: 'A waiting-for came in: close it. Answers whether its project is now without a next action.',
    capability: 'write',
    input: z.strictObject({ id }),
    run: ({ id: x }) => {
      const r = api.received(x);
      return { item: itemOut(api.getItem(x)!), ...(r.askNextFor && { project_needs_next_action: r.askNextFor }) };
    },
  }),
  tool({
    name: 'edit_waiting',
    description: 'Change who a waiting-for waits on, or its follow-up date ("she said next week"); follow_up null or "" removes the date.',
    capability: 'write',
    input: z.strictObject({ id, who: z.string().min(1).optional(), follow_up: isoDate.or(z.literal('')).nullable().optional() }),
    run: ({ id: x, who, follow_up }) => (api.editWaiting(x, { ...(who !== undefined && { who }), ...(follow_up !== undefined && { followUp: follow_up }) }), itemOut(api.getItem(x)!)),
  }),
];

const fields = { context, priority, time, energy };

export const PROJECT_TOOLS = [
  tool({
    name: 'add_action',
    description: 'A new next action in an active project (a parked project takes none — activate it first).',
    capability: 'write',
    input: z.strictObject({ project: id, text: z.string().min(1), ...fields }),
    run: ({ project, text, ...f }) => itemOut(api.addAction(project, text, f)),
  }),
  tool({
    name: 'add_step',
    description: 'A later step in a project (not yet a next action).',
    capability: 'write',
    input: z.strictObject({ project: id, text: z.string().min(1) }),
    run: ({ project, text }) => itemOut(api.addStep(project, text)),
  }),
  tool({
    name: 'promote',
    description: 'Make a later step a next action, with its context, priority, time and energy.',
    capability: 'write',
    input: z.strictObject({ id, ...fields }),
    run: ({ id: x, ...f }) => (api.promote(x, f), itemOut(api.getItem(x)!)),
  }),
  tool({
    name: 'demote',
    description: 'Make a next action a later step again (drops its context, priority, time, energy, day, block, star).',
    capability: 'write',
    input: z.strictObject({ id }),
    run: ({ id: x }) => (api.demote(x), itemOut(api.getItem(x)!)),
  }),
  tool({
    name: 'update_project',
    description: 'Change a project\'s own fields: title (the outcome), successful_when, area, deadline, goal, notes. An empty string removes an optional field.',
    capability: 'write',
    input: z.strictObject({ id, title: z.string().min(1).optional(), successful_when: z.string().optional(), area: z.string().optional(), deadline: isoDate.or(z.literal('')).optional(), goal: z.string().optional(), notes: z.string().optional() }),
    run: ({ id: x, successful_when, ...rest }) => {
      api.updateProject(x, { ...rest, ...(successful_when !== undefined && { successfulWhen: successful_when }) });
      return api.getProject(x);
    },
  }),
  tool({
    name: 'move_project',
    description: 'Park a project on Someday / Maybe, make it active again, or complete it (refused while it has open next actions or later steps).',
    capability: 'write',
    input: z.strictObject({ id, to: z.enum(['someday', 'active', 'completed']) }),
    run: ({ id: x, to }) => {
      if (to === 'someday') api.moveProjectToSomeday(x);
      else if (to === 'active') api.activateProject(x);
      else api.completeProject(x);
      return api.getProject(x);
    },
  }),
  tool({
    name: 'activate',
    description: 'Take a Someday / Maybe item back into the inbox, to be clarified as something to do now.',
    capability: 'write',
    input: z.strictObject({ id }),
    run: ({ id: x }) => (api.activate(x), itemOut(api.getItem(x)!)),
  }),
  tool({
    name: 'drop',
    description: 'Drop a Someday / Maybe item (to the trash, undoable).',
    capability: 'write',
    input: z.strictObject({ id }),
    run: ({ id: x }) => api.drop(x),
  }),
  tool({
    name: 'set_bucket',
    description: 'Move a Someday / Maybe item to another bucket (see get_settings for the names).',
    capability: 'write',
    input: z.strictObject({ id, bucket: z.string().min(1) }),
    run: ({ id: x, bucket }) => (api.setBucket(x, bucket), itemOut(api.getItem(x)!)),
  }),
  tool({
    name: 'add_reference',
    description: 'File something to keep, not to do: a note (body), a link (url) or a file (its name or path), optionally on a project. The app is the index, not the archive.',
    capability: 'write',
    input: z.strictObject({ text: z.string().min(1), kind: z.enum(['note', 'link', 'file']), url: z.string().optional(), body: z.string().optional(), project: id.optional() }),
    run: ({ text, kind, url, body, project }) => itemOut(api.addReference(text, { kind, ...(url && { url }), ...(body && { body }) }, project)),
  }),
  tool({
    name: 'edit_reference',
    description: 'Change a reference entry: text, kind with url/body, or project (null = loose).',
    capability: 'write',
    input: z.strictObject({ id, text: z.string().min(1).optional(), kind: z.enum(['note', 'link', 'file']).optional(), url: z.string().optional(), body: z.string().optional(), project: id.nullable().optional() }),
    run: ({ id: x, text, kind, url, body, project }) => {
      api.editReference(x, {
        ...(text !== undefined && { text }),
        ...(kind && { reference: { kind, ...(url && { url }), ...(body && { body }) } }),
        ...(project !== undefined && { project: project === null ? null : { id: project } }),
      });
      return itemOut(api.getItem(x)!);
    },
  }),
];
