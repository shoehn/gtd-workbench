// A tool of the MCP (design §5): one intent, a strict input schema, the capability a client's
// preset must allow, and a run function over the api. Tools never touch the store directly.
import type * as z from 'zod';
import type { Capability, ClientIdentity } from '../clients';

export type ToolCapability = Capability | 'any';

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  capability: ToolCapability;
  input: S;
  run(args: z.output<S>, ctx: { client: ClientIdentity }): unknown;
}

/** Keeps the args typed by the schema inside `run`, and erases it for the registry. */
export function tool<S extends z.ZodType>(def: ToolDef<S>): ToolDef {
  return def as unknown as ToolDef;
}
