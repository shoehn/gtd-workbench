// Collect and clarify tools (spec §5.2, §5.3).
import * as z from 'zod';
import * as api from '../api';
import { captureRequest } from '../capture-in';
import { store } from '../store';
import { tool } from './define';
import { context, decision, energy, id, isoDate, priority, projectChoice, time, type DecisionIn } from './schemas';
import { itemOut } from './shape';

type Choice = z.output<typeof projectChoice>;
const toChoice = (p: Choice): api.ProjectChoice => ('id' in p ? { id: p.id } : { newTitle: p.new });

/** The tool's decision (snake_case, `{ new }`) → the api's (`{ newTitle }`, camelCase). */
export function toDecision(d: DecisionIn): api.Decision {
  switch (d.kind) {
    case 'trash':
    case 'someday':
      return { kind: d.kind };
    case 'reference':
      return {
        kind: 'reference',
        ...(d.reference_kind && { reference: { kind: d.reference_kind, ...(d.url && { url: d.url }), ...(d.body && { body: d.body }) } }),
        ...(d.project && { project: toChoice(d.project) }),
      };
    case 'later':
      return { kind: 'later', text: d.text, project: toChoice(d.project) };
    case 'action': {
      const r = d.route;
      const route: api.Route =
        r.to === 'waiting' ? { to: 'waiting', who: r.who, ...(r.follow_up && { followUp: r.follow_up }) }
        : r.to === 'next' ? { to: 'next', context: r.context, priority: r.priority, time: r.time, energy: r.energy, ...(r.deadline && { deadline: r.deadline }) }
        : r.to === 'calendar' ? { to: 'calendar', day: r.day, ...(r.start && { start: r.start }), ...(r.end && { end: r.end }) }
        : { to: 'done' };
      return { kind: 'action', text: d.text, ...(d.project && { project: toChoice(d.project) }), route };
    }
  }
}

/** Clarify, plus the Someday bucket when one is named — one write, one log entry. */
function clarifyWithBucket(itemId: string, d: DecisionIn, file?: string): api.ClarifyResult {
  let result: api.ClarifyResult | undefined;
  if (d.kind === 'someday' && d.bucket && !api.listBuckets().includes(d.bucket)) throw new Error(`clarify: unknown bucket ${d.bucket}`);
  store.update(() => {
    result = file !== undefined ? api.file(file, toDecision(d)) : api.clarify(itemId, toDecision(d));
    if (d.kind === 'someday' && d.bucket) api.setBucket(result.itemId, d.bucket);
  });
  return result!;
}

const draftShape = z.strictObject({
  kind: z.enum(['action', 'project', 'someday', 'reference', 'trash']).describe('project = a project with this as its first action (project.new required)'),
  text: z.string().optional().describe('the outcome, rewritten by the GTD rules: verb first, concrete, done-when'),
  project: projectChoice.optional(),
  next: z.boolean().optional(),
  route: z.enum(['next', 'waiting', 'calendar', 'done']).optional(),
  context: context.optional(),
  priority: priority.optional(),
  time: time.optional(),
  energy: energy.optional(),
  deadline: isoDate.optional(),
  who: z.string().optional(),
  follow_up: isoDate.optional(),
  day: isoDate.optional(),
});

export const COLLECT_TOOLS = [
  tool({
    name: 'capture',
    description: 'Put one or more lines into the inbox (shorthand works: #tag @context !A ^fri). Each item may carry a url and a note as context. Capture never decides anything; the user clarifies later.',
    capability: 'capture',
    input: z.strictObject({
      items: z.array(z.strictObject({ text: z.string().min(1), source: z.enum(['typed', 'voice', 'email', 'share', 'scan']).optional(), url: z.string().optional(), note: z.string().optional() })).min(1).max(50),
    }),
    // All or nothing, one log entry: a refused item rolls back the ones before it.
    run: ({ items }) => {
      let out: ReturnType<typeof itemOut>[] = [];
      store.update(() => {
        out = items.map((it) => {
          const r = captureRequest(it);
          if ('error' in r) throw new Error(`capture: ${r.error}`);
          return itemOut(r.item);
        });
      });
      return out;
    },
  }),
  tool({
    name: 'add_tickler',
    description: 'A note on a day of the calendar — information, nothing to do ("Tiles are fired, check them"). For reminders on a day.',
    capability: 'capture',
    input: z.strictObject({ day: isoDate, text: z.string().min(1) }),
    run: ({ day, text }) => api.addTickler(day, text),
  }),
  tool({
    name: 'edit_tickler',
    description: 'Change the text of a tickler note.',
    capability: 'write',
    input: z.strictObject({ id, text: z.string().min(1) }),
    run: ({ id: t, text }) => api.updateTickler(t, text),
  }),
  tool({
    name: 'delete_tickler',
    description: 'Remove a tickler note.',
    capability: 'write',
    input: z.strictObject({ id }),
    run: ({ id: t }) => api.deleteTickler(t),
  }),
  tool({
    name: 'draft_clarification',
    description: 'Prepare the clarify decision of an inbox item for the user: a rewritten outcome, kind, project and fields, with a one-line reason. The user files it in Clarify with one key. Use this when you would be deciding yourself; use clarify only when the user told you the decision. draft: null removes a draft.',
    capability: 'write',
    input: z.strictObject({ item: id, draft: draftShape.nullable(), reason: z.string().min(1).max(280) }),
    run: ({ item, draft, reason }) => {
      if (!draft) return api.setDraft(item, null);
      const { follow_up, project, ...rest } = draft;
      api.setDraft(item, { ...rest, reason, ...(follow_up && { followUp: follow_up }), ...(project && { project: 'id' in project ? { id: project.id } : { newTitle: project.new } }) });
    },
  }),
  tool({
    name: 'clarify',
    description: 'File an inbox item with the decision the user stated (Clarify\'s four steps as one value). Projects are born here: project: { new: "outcome" }.',
    capability: 'write',
    input: z.strictObject({ item: id, decision }),
    run: ({ item, decision: d }) => clarifyWithBucket(item, d),
  }),
  tool({
    name: 'file',
    description: 'Capture and clarify in one step, for something the user already decided ("I am waiting on Alice for the video — add it"). One log entry.',
    capability: 'write',
    input: z.strictObject({ text: z.string().min(1), decision }),
    run: ({ text, decision: d }) => clarifyWithBucket('', d, text),
  }),
];
