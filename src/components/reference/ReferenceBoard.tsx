'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { editReferenceAction, toSomedayAction, trashAction, untrashAction } from '@/lib/actions';
import type { Item, Reference } from '@/lib/model';
import { isTyping } from '../inbox/keys';
import { setPaletteTarget } from '../palette/target';
import { Card } from '../ui/Card';
import { cx } from '../ui/cx';
import { Kbd } from '../ui/Kbd';
import { PhoneChip } from '../ui/PhoneChip';
import { PhoneToast } from '../ui/PhoneToast';
import { ProjectEdit } from '../ui/ProjectEdit';
import type { PickerProject } from '../ui/ProjectPicker';
import { Tag } from '../ui/Tag';

/** One reference entry, formatted on the server. */
export interface ReferenceRow {
  id: string;
  text: string;
  reference: Reference;
  /** The second line: host, note start, file name. */
  line: string;
  project?: { id: string; title: string };
  tags: string[];
  /** Lower-case text the search runs over (text, body, URL, host, tags, project). */
  hay: string;
}

type Kind = Reference['kind'];
type Trashed = { id: string; status: Item['status'] }[];

const KINDS: Kind[] = ['note', 'link', 'file'];
const UNDO_MS = 5000;
const mono = 'font-mono text-meta text-muted';
const smallBtn =
  'relative h-6 shrink-0 rounded border border-control bg-panel px-1.5 font-mono text-meta text-muted hover:border-muted hover:text-ink max-lg:h-9 max-lg:px-2.5';
const field = 'h-(--wb-hit-phone) min-w-0 rounded border border-control bg-panel px-2 text-ink outline-none focus:border-accent focus:shadow-ring lg:h-7';

/** Read and write `?q=`, `?kind=`, `?scope=` without a round trip (history.replaceState). */
function useFilter() {
  const params = useSearchParams();
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('highlight');
    const qs = next.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  };
  return {
    q: params.get('q') ?? '',
    kind: KINDS.find((k) => k === params.get('kind')),
    scope: params.get('scope') === 'project' || params.get('scope') === 'loose' ? params.get('scope') : null,
    set,
  };
}

/** The search field for the top bar / phone header: filters as you type. */
export function ReferenceSearch() {
  const { q, set } = useFilter();
  return (
    <form role="search" onSubmit={(e) => e.preventDefault()} className="flex min-w-0 grow lg:w-72 lg:grow-0">
      <label htmlFor="reference-search" className="sr-only">
        Search reference
      </label>
      <input
        id="reference-search"
        type="search"
        value={q}
        placeholder="Search text, notes, links, tags…"
        autoComplete="off"
        onChange={(e) => set('q', e.target.value || null)}
        className={cx(field, 'w-full')}
      />
    </form>
  );
}

export function ReferenceBoard({ rows: all, projects, highlight }: { rows: ReferenceRow[]; projects: PickerProject[]; highlight?: string }) {
  const [, startTransition] = useTransition();
  const { q, kind, scope, set } = useFilter();
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [cursorId, setCursorId] = useState<string | null>(highlight ?? null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set(highlight ? [highlight] : []));
  const [editing, setEditing] = useState<{ id: string; what: 'entry' | 'project' } | null>(null);
  const [undo, setUndo] = useState<{ entries: Trashed; text: string } | null>(null);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = all.filter(
    (r) =>
      !gone.has(r.id) &&
      (!kind || r.reference.kind === kind) &&
      (scope !== 'project' || r.project) &&
      (scope !== 'loose' || !r.project) &&
      words.every((w) => r.hay.includes(w)),
  );
  const at = rows.findIndex((r) => r.id === cursorId);
  const cursor = rows[at];

  useEffect(() => {
    setPaletteTarget(cursor ? { kind: 'reference', id: cursor.id, text: cursor.text } : null);
  });
  useEffect(() => () => setPaletteTarget(null), []);

  useEffect(() => {
    if (cursorId) document.getElementById(`ref-row-${cursorId}`)?.scrollIntoView({ block: 'nearest' });
  }, [cursorId]);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  function openRow(r: ReferenceRow) {
    if (r.reference.kind === 'link' && r.reference.url) window.open(r.reference.url, '_blank', 'noopener,noreferrer');
    else
      setOpen((prev) => {
        const next = new Set(prev);
        if (!next.delete(r.id)) next.add(r.id);
        return next;
      });
  }

  function trash(r: ReferenceRow) {
    setCursorId((rows[at + 1] ?? rows[at - 1])?.id ?? null);
    setGone((prev) => new Set([...prev, r.id]));
    startTransition(async () => setUndo({ entries: await trashAction([r.id]), text: r.text }));
  }

  function undoTrash() {
    if (!undo) return;
    const { entries } = undo;
    setUndo(null);
    setGone((prev) => new Set([...prev].filter((id) => !entries.some((e) => e.id === id))));
    startTransition(() => untrashAction(entries));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e) || editing) return;
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'z' && undo) {
          e.preventDefault();
          undoTrash();
        }
        return;
      }
      if (e.altKey) return;
      switch (e.key) {
        case 'j':
        case 'k': {
          const next = at < 0 ? rows[e.key === 'j' ? 0 : rows.length - 1] : rows[Math.min(rows.length - 1, Math.max(0, at + (e.key === 'j' ? 1 : -1)))];
          if (next) setCursorId(next.id);
          break;
        }
        case 'Enter':
          if (!cursor || (e.target as HTMLElement).closest('a, button')) return;
          openRow(cursor);
          break;
        case 'e':
          if (cursor) setEditing({ id: cursor.id, what: 'entry' });
          break;
        case 'p':
          if (cursor) setEditing({ id: cursor.id, what: 'project' });
          break;
        case 'Backspace':
        case 'Delete':
          if (cursor) trash(cursor);
          break;
        case 'u':
          undoTrash();
          break;
        case 'Escape':
          setCursorId(null);
          break;
        default:
          return;
      }
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const chip = (label: string, pressed: boolean, onClick: () => void) => (
    <PhoneChip key={label} small pressed={pressed} onClick={onClick}>
      {label}
    </PhoneChip>
  );

  return (
    <div className="flex min-h-full flex-col gap-3 max-lg:gap-0">
      <div role="group" aria-label="Filter reference" className="flex flex-wrap items-center gap-1.5 max-lg:bg-panel max-lg:px-4 max-lg:py-2.5">
        {KINDS.map((k) => chip(k, kind === k, () => set('kind', kind === k ? null : k)))}
        <span aria-hidden="true" className="mx-1 h-4.5 w-px bg-line" />
        {chip('with project', scope === 'project', () => set('scope', scope === 'project' ? null : 'project'))}
        {chip('loose', scope === 'loose', () => set('scope', scope === 'loose' ? null : 'loose'))}
        <span className={cx(mono, 'ml-auto')}>
          {rows.length === all.length - gone.size ? `${rows.length}` : `${rows.length} of ${all.length - gone.size}`}
        </span>
      </div>

      <Card aria-label="Reference" className="flex flex-col max-lg:rounded-none max-lg:border-x-0">
        {rows.map((r) => {
          const isOpen = open.has(r.id);
          return (
            <div
              key={r.id}
              id={`ref-row-${r.id}`}
              onClick={() => setCursorId(r.id)}
              className={cx('group flex flex-col gap-1 border-b border-line-soft px-3 py-2 last:border-b-0 max-lg:px-4 max-lg:py-3', r.id === cursorId && 'bg-accent-tint')}
            >
              {editing?.id === r.id && editing.what === 'entry' ? (
                <EntryEdit
                  row={r}
                  onSave={(edit) => {
                    setEditing(null);
                    startTransition(() => editReferenceAction(r.id, edit));
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex min-w-0 items-start gap-2.5 max-lg:flex-wrap">
                  <span className="flex min-w-0 grow flex-col gap-0.5">
                    <span className="flex min-w-0 items-baseline gap-2">
                      {r.reference.kind === 'link' && r.reference.url ? (
                        <a href={r.reference.url} target="_blank" rel="noopener noreferrer" className="min-w-0 text-ink no-underline hover:text-accent">
                          {r.text}
                        </a>
                      ) : (
                        <button type="button" onClick={() => openRow(r)} aria-expanded={isOpen} className="min-w-0 text-left text-ink hover:text-accent">
                          {r.text}
                        </button>
                      )}
                      <Tag>{r.reference.kind}</Tag>
                      {r.tags.map((t) => (
                        <span key={t} className={mono}>
                          #{t}
                        </span>
                      ))}
                    </span>
                    {!isOpen && r.line && <span className={cx(mono, 'truncate')}>{r.line}</span>}
                    {isOpen && r.reference.body && <span className="whitespace-pre-wrap text-sm text-ink">{r.reference.body}</span>}
                  </span>
                  {editing?.id === r.id && editing.what === 'project' ? (
                    <ProjectEdit
                      projects={projects}
                      current={r.project}
                      onSave={(project) => {
                        setEditing(null);
                        startTransition(() => editReferenceAction(r.id, { project }));
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  ) : r.project ? (
                    <Link href={`/projects?p=${encodeURIComponent(r.project.id)}`} className="max-w-56 truncate text-xs text-muted no-underline hover:text-ink">
                      {r.project.title}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted">loose</span>
                  )}
                  {/* Desktop: on hover, focus or the cursor row; the phone always shows them (no hover there). */}
                  <span
                    className={cx(
                      'flex shrink-0 gap-1.5',
                      r.id !== cursorId && 'lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100',
                    )}
                  >
                    <button type="button" className={smallBtn} onClick={() => setEditing({ id: r.id, what: 'entry' })} aria-label={`Edit “${r.text}”`}>
                      edit
                    </button>
                    <button type="button" className={smallBtn} onClick={() => setEditing({ id: r.id, what: 'project' })} aria-label={`Project of “${r.text}”`}>
                      project
                    </button>
                    <button type="button" className={smallBtn} onClick={() => startTransition(() => toSomedayAction(r.id))} aria-label={`Move “${r.text}” to Someday / Maybe`}>
                      → someday
                    </button>
                    <button type="button" className={cx(smallBtn, 'w-7 justify-center max-lg:w-9')} onClick={() => trash(r)} aria-label={`Trash “${r.text}”`}>
                      ×
                    </button>
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className={cx(mono, 'm-0 px-3 py-8 text-center')}>
            {all.length ? 'Nothing matches.' : 'No reference yet — “No → Reference” in Clarify files things here.'}
          </p>
        )}
      </Card>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-meta text-muted max-lg:hidden">
        <span>
          <Kbd>⏎</Kbd> open link / show note
        </span>
        <span>
          <Kbd>e</Kbd> edit
        </span>
        <span>
          <Kbd>p</Kbd> project
        </span>
        <span>
          <Kbd>⌫</Kbd> trash
        </span>
        <span>kept, not acted on — the documents themselves live where they are</span>
        {undo && (
          <span role="status" className="flex items-center gap-2">
            <span className="text-ink">Trashed: {undo.text}</span>
            <button type="button" onClick={undoTrash} className="rounded border border-control bg-panel px-1.5 text-accent hover:text-accent-hover">
              Undo <Kbd>u</Kbd>
            </button>
          </span>
        )}
      </div>
      {undo && <PhoneToast text={`Trashed: ${undo.text}`} onUndo={undoTrash} />}
    </div>
  );
}

/** Text, kind, and the URL / note / file name — ⏎ saves (⌘⏎ in the note), esc cancels. */
function EntryEdit({ row, onSave, onCancel }: { row: ReferenceRow; onSave(edit: { text: string; reference: Reference }): void; onCancel(): void }) {
  const [text, setText] = useState(row.text);
  const [kind, setKind] = useState<Kind>(row.reference.kind);
  const [url, setUrl] = useState(row.reference.url ?? '');
  const [body, setBody] = useState(row.reference.body ?? '');
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  const save = () => onSave({ text, reference: kind === 'link' ? { kind, url } : { kind, body } });
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel();
    else if (e.key === 'Enter' && (!(e.target instanceof HTMLTextAreaElement) || e.metaKey || e.ctrlKey)) save();
    else return;
    e.preventDefault();
  };
  return (
    <div className="flex flex-col gap-2" onKeyDown={keys}>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={first} aria-label="Text" value={text} onChange={(e) => setText(e.target.value)} className={cx(field, 'grow')} />
        <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={cx(field, 'font-mono text-meta')}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      {kind === 'link' && <input aria-label="URL" value={url} placeholder="https://… or obsidian://…" onChange={(e) => setUrl(e.target.value)} className={cx(field, 'font-mono text-xs')} />}
      {kind === 'file' && <input aria-label="Path or file name" value={body} placeholder="path or file name" onChange={(e) => setBody(e.target.value)} className={cx(field, 'font-mono text-xs')} />}
      {kind === 'note' && <textarea aria-label="Note" value={body} rows={3} onChange={(e) => setBody(e.target.value)} className="rounded border border-control bg-panel px-2 py-1.5 text-ink outline-none focus:border-accent focus:shadow-ring" />}
      <div className="flex gap-2">
        <button type="button" onClick={save} className="h-7 rounded bg-accent px-3 text-sm text-panel max-lg:h-11">
          Save
        </button>
        <button type="button" onClick={onCancel} className="h-7 rounded border border-control bg-panel px-3 text-sm max-lg:h-11">
          Cancel
        </button>
        <span className={cx(mono, 'self-center')}>⏎ save · esc cancel</span>
      </div>
    </div>
  );
}
