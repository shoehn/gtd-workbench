// Weekly review, activity and trust tools (spec §5.7, §5.8).
import * as z from 'zod';
import * as api from '../api';
import { tool } from './define';
import { listToolsFor } from './index';
import { id } from './schemas';

export const whoami = tool({
  name: 'whoami',
  description: 'Who this client is, its preset, and the tools it may call. Call once at the start to know what you may do.',
  capability: 'any',
  input: z.strictObject({}),
  run: (_args, { client }) => ({ name: client.name, preset: client.preset, tools: listToolsFor(client).map((t) => t.name) }),
});

const reviewTools = [
  tool({
    name: 'start_review',
    description: 'Start the weekly review (or get the one in progress). Then go through prepare_weekly_review step by step with the user.',
    capability: 'write',
    input: z.strictObject({}),
    run: () => api.openRun() ?? api.startReview(),
  }),
  tool({
    name: 'tick_step',
    description: 'Tick (on: true) or untick a step of the weekly review in progress — when the user says the step is done.',
    capability: 'write',
    input: z.strictObject({ step: id, on: z.boolean() }),
    run: ({ step, on }) => (on ? api.tickStep(step) : api.untickStep(step)),
  }),
  tool({
    name: 'set_review_notes',
    description: 'Add a line to the review\'s notes — a finding or decision worth keeping, optionally for a step.',
    capability: 'write',
    input: z.strictObject({ step: id.optional(), text: z.string().min(1).max(2000) }),
    run: ({ step, text }) => {
      const run = api.openRun();
      if (!run) throw new Error('set_review_notes: no review in progress');
      const label = step ? api.reviewSteps(run).find((s) => s.id === step)?.text : undefined;
      if (step && !label) throw new Error(`set_review_notes: unknown step ${step}`);
      const line = label ? `${label}: ${text}` : text;
      api.setReviewNotes(run.notes ? `${run.notes}\n${line}` : line);
    },
  }),
  tool({
    name: 'finish_review',
    description: 'Finish the weekly review in progress. The trash stays as it is (finishing on the screen empties it; agents never delete for good).',
    capability: 'write',
    input: z.strictObject({}),
    run: () => api.finishReview({ emptyTrash: false }),
  }),
  tool({
    name: 'undo',
    description: 'Undo a log entry (see get_activity) while nothing has touched its items since; refused with who changed them. An undo is itself an entry (undo it to redo).',
    capability: 'write',
    input: z.strictObject({ entry: id }),
    run: ({ entry }) => ({ undo_entry: api.undoActivity(entry) }),
  }),
];

export const REVIEW_TOOLS = [whoami, ...reviewTools];
