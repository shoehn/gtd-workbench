// The registry: every tool, what a client may see and call, and how a call runs.
import * as z from 'zod';
import { runAs } from '../activity';
import { actorOf, can, type ClientIdentity } from '../clients';
import { log } from '../log';
import { store } from '../store';
import type { ToolDef } from './define';
import { COLLECT_TOOLS } from './collect';
import { READ_TOOLS } from './read';
import { REVIEW_TOOLS } from './review';

export const TOOLS: ToolDef[] = [...READ_TOOLS, ...COLLECT_TOOLS, ...REVIEW_TOOLS];

export function toolNamed(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function mayCall(client: ClientIdentity, t: ToolDef): boolean {
  return t.capability === 'any' || can(client, t.capability);
}

/** What a client sees in tools/list: name, description, JSON Schema of the input. */
export function listToolsFor(client: ClientIdentity): { name: string; description: string; inputSchema: object }[] {
  return TOOLS.filter((t) => mayCall(client, t)).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: z.toJSONSchema(t.input, { target: 'draft-2020-12' }) as object,
  }));
}

export type ToolOutcome =
  | { status: 200; body: { result: unknown; activity: string[] } }
  | { status: 400 | 403 | 404 | 422 | 500; body: { error: string } };

/** Errors the api throws on purpose carry their scope: "complete: item x cannot be completed". */
const REFUSAL = /^[a-zA-Z_]+: /;

export function runTool(client: ClientIdentity, name: string, rawArgs: unknown): ToolOutcome {
  const t = toolNamed(name);
  if (!t) return { status: 404, body: { error: `no tool named ${name}` } };
  if (!mayCall(client, t)) return { status: 403, body: { error: `client "${client.name}" may not call ${name}` } };
  const parsed = t.input.safeParse(rawArgs ?? {});
  if (!parsed.success) return { status: 400, body: { error: z.prettifyError(parsed.error) } };
  const before = store.getState().activity.at(-1)?.id;
  try {
    const result = runAs(actorOf(client), () => t.run(parsed.data, { client }));
    const log_ = store.getState().activity;
    const from = before === undefined ? 0 : log_.findLastIndex((e) => e.id === before) + 1;
    return { status: 200, body: { result: result ?? null, activity: log_.slice(from).map((e) => e.id) } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof Error && e.constructor === Error && REFUSAL.test(message)) return { status: 422, body: { error: message } };
    log.error(`tool ${name}: ${e instanceof Error ? (e.stack ?? message) : message}`);
    return { status: 500, body: { error: 'internal error' } };
  }
}
