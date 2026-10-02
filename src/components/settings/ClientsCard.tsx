'use client';

import { useState, useTransition } from 'react';
import { createClientAction, revokeClientAction } from '@/lib/actions';
import type { Preset } from '@/lib/clients';
import { Btn } from '../ui/Btn';
import { Card } from '../ui/Card';
import { Tag } from '../ui/Tag';

export interface ClientsCardRow {
  id: string;
  name: string;
  preset: Preset;
  /** `wed 09:14`, or absent. */
  lastUsed?: string;
  revoked: boolean;
  builtIn: boolean;
}

const mono = 'font-mono text-meta text-muted';
const PRESET_HINT: Record<Preset, string> = {
  capture: 'inbox and tickler notes only',
  'read-only': 'reads everything, changes nothing',
  assistant: 'reads, captures, drafts and acts — logged',
};

/** API clients (MCP, scripts): name + preset; the token is shown once. */
export function ClientsCard({ rows }: { rows: ClientsCardRow[] }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<Preset>('assistant');
  const [shown, setShown] = useState<{ name: string; token: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function create() {
    startTransition(async () => {
      const r = await createClientAction(name, preset);
      if (r.error) return setError(r.error);
      setError(null);
      setShown({ name: name.trim(), token: r.token! });
      setName('');
    });
  }

  return (
    <Card aria-labelledby="clients-head" className="flex flex-col">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-line px-3 py-2.5">
        <h2 id="clients-head" className="m-0 text-body font-semibold">Clients</h2>
        <span className={mono}>agents and scripts with their own token · everything they change is in Activity</span>
      </div>
      <ul className="m-0 list-none p-0">
        {rows.map((c) => (
          <li key={c.id} className="flex min-h-9 flex-wrap items-center gap-x-2.5 border-b border-line-soft px-3 py-1.5">
            <span className={c.revoked ? 'grow text-muted line-through' : 'grow'}>{c.name}</span>
            <Tag>{c.preset}</Tag>
            <span className={mono}>{c.builtIn ? 'CAPTURE_TOKEN' : c.revoked ? 'revoked' : c.lastUsed ? `used ${c.lastUsed}` : 'never used'}</span>
            {!c.builtIn && !c.revoked && (
              <Btn size="sm" disabled={pending} onClick={() => startTransition(() => revokeClientAction(c.id))} aria-label={`Revoke ${c.name}`}>
                Revoke
              </Btn>
            )}
          </li>
        ))}
      </ul>
      {shown && (
        <div role="status" className="flex flex-col gap-1 border-b border-line-soft bg-warn-tint px-3 py-2">
          <span className="text-sm">
            Token for <b>{shown.name}</b> — copy it now, it is not shown again:
          </span>
          <code className="font-mono text-meta break-all select-all">{shown.token}</code>
          <button type="button" className="w-fit text-xs text-accent" onClick={() => setShown(null)}>
            Done, I copied it
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5 px-3 py-2">
        <input
          aria-label="New client name"
          placeholder="+ client, e.g. Claude Desktop"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()}
          className="h-(--wb-hit-phone) min-w-0 grow rounded border border-control bg-panel px-2 text-ink lg:h-7"
        />
        <select
          aria-label="Preset"
          value={preset}
          onChange={(e) => setPreset(e.target.value as Preset)}
          className="h-(--wb-hit-phone) rounded border border-control bg-panel px-1.5 font-mono text-meta text-ink lg:h-7"
        >
          {(Object.keys(PRESET_HINT) as Preset[]).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <Btn size="sm" disabled={pending || !name.trim()} onClick={create}>
          Create
        </Btn>
        <span className={`${mono} basis-full`}>{PRESET_HINT[preset]}</span>
        {error && <span className="basis-full text-xs text-warn">{error}</span>}
      </div>
    </Card>
  );
}
