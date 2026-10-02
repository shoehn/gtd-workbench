// The registry: every tool, what a client may see and call, and how a call runs.
import * as z from 'zod';
import { can, type ClientIdentity } from '../clients';
import type { ToolDef } from './define';
import { REVIEW_TOOLS } from './review';

export const TOOLS: ToolDef[] = [...REVIEW_TOOLS];

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
