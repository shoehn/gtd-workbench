// Weekly review, activity and trust tools (spec §5.7, §5.8).
import * as z from 'zod';
import { tool } from './define';
import { listToolsFor } from './index';

export const whoami = tool({
  name: 'whoami',
  description: 'Who this client is, its preset, and the tools it may call. Call once at the start to know what you may do.',
  capability: 'any',
  input: z.strictObject({}),
  run: (_args, { client }) => ({ name: client.name, preset: client.preset, tools: listToolsFor(client).map((t) => t.name) }),
});

export const REVIEW_TOOLS = [whoami];
