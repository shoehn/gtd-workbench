'use client';

import { useRouter } from 'next/navigation';
import { ContextChip } from '../ui/ContextChip';

const label = 'mr-1.5 font-mono text-label tracking-[0.1em] text-muted';

/** all · you · each client · mail · share · the app — the actors seen in the log. Lives in the URL. */
export function ActorFilter({ actors, value, subject }: { actors: { key: string; label: string }[]; value?: string; subject?: string }) {
  const router = useRouter();
  const go = (actor?: string) => {
    const q = new URLSearchParams({ ...(actor && { actor }), ...(subject && { subject }) }).toString();
    router.replace(q ? `/activity?${q}` : '/activity', { scroll: false });
  };
  return (
    <div role="group" aria-label="Who" className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-panel px-4 py-2.5 lg:px-5">
      <span className={label}>WHO</span>
      <ContextChip pressed={!value} onClick={() => go()}>
        all
      </ContextChip>
      {actors.map((a) => (
        <ContextChip key={a.key} pressed={value === a.key} onClick={() => go(a.key)}>
          {a.label}
        </ContextChip>
      ))}
    </div>
  );
}
