// Shared pieces of the tool schemas. Descriptions end up in the JSON Schema the agent reads.
import * as z from 'zod';

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'yyyy-mm-dd');
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'hh:mm');
export const slot = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'yyyy-mm-ddThh:mm');
export const id = z.string().min(1);
export const ids = z.array(id).min(1).max(50);
export const priority = z.enum(['A', 'B', 'C']);
export const time = z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(120)]).describe('minutes: 15, 30, 60 or 120 (= 2 h or more)');
export const energy = z.enum(['focus', 'normal', 'low']);
export const context = z.string().regex(/^@/, 'a context starts with @').describe('one of the contexts from get_settings, e.g. @calls');
export const projectChoice = z
  .union([z.strictObject({ id }), z.strictObject({ new: z.string().min(1).describe('title of a new project — the outcome, e.g. "Studio shelves built"') })])
  .describe('an existing project by id, or { new: title } to create one');
export const nextFields = z.strictObject({ context, priority, time, energy });

const route = z.discriminatedUnion('to', [
  z.strictObject({ to: z.literal('done') }),
  z.strictObject({ to: z.literal('waiting'), who: z.string().min(1), follow_up: isoDate.optional() }),
  z.strictObject({ to: z.literal('next'), context, priority, time, energy, deadline: isoDate.optional() }),
  z.strictObject({ to: z.literal('calendar'), day: isoDate, start: hhmm.optional(), end: hhmm.optional() }),
]);

/** Clarify's four steps as one value (spec §5.3). */
export const decision = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('trash') }),
  z.strictObject({ kind: z.literal('someday'), bucket: z.string().optional() }),
  z.strictObject({ kind: z.literal('reference'), reference_kind: z.enum(['note', 'link', 'file']).optional(), url: z.string().optional(), body: z.string().optional(), project: projectChoice.optional() }),
  z.strictObject({ kind: z.literal('later'), text: z.string().min(1), project: projectChoice }),
  z.strictObject({ kind: z.literal('action'), text: z.string().min(1).describe('the outcome, verb first'), project: projectChoice.optional(), route }),
]);
export type DecisionIn = z.output<typeof decision>;
