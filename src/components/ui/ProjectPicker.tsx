'use client';

import { useId, useState, type Ref } from 'react';
import { sameTitle } from '@/lib/titles';
import { cx } from './cx';

export interface PickerProject {
  id: string;
  title: string;
  active: boolean;
  nextActions: number;
}

/** What step 3 has settled on; `null` = single action. */
export type Picked = { id: string; title: string; nextActions: number; active: boolean } | { newTitle: string } | null;

type Result = { kind: 'new'; title: string } | { kind: 'project'; project: PickerProject };

const MAX_RESULTS = 6;

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * "+ New project" first, then matches with active projects first. When the text already names
 * a project, there is no "+ New" (no duplicate titles) and that project leads instead.
 */
function results(projects: PickerProject[], query: string): Result[] {
  const q = query.trim();
  if (!q) return [];
  const twin = projects.find((p) => sameTitle(p.title, q));
  const matches = projects
    .filter((p) => p !== twin && p.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.active) - Number(a.active))
    .slice(0, MAX_RESULTS - 1)
    .map((project) => ({ kind: 'project' as const, project }));
  const first: Result = twin ? { kind: 'project', project: twin } : { kind: 'new', title: capitalise(q) };
  return [first, ...matches];
}

interface ProjectPickerProps {
  projects: PickerProject[];
  query: string;
  picked: Picked;
  onQuery(query: string): void;
  onPick(picked: Picked): void;
  inputRef: Ref<HTMLInputElement>;
}

/** Step 3 combobox: the first result creates a new project from the typed text, unless it exists. */
export function ProjectPicker({ projects, query, picked, onQuery, onPick, inputRef }: ProjectPickerProps) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const list = picked ? [] : results(projects, query);
  const open = focused && list.length > 0;
  const active = Math.min(highlight, list.length - 1);

  /** Picking leaves the field so step keys (`a`, `2 w n k`, `⏎`) work at once. */
  function pick(r: Result) {
    (document.activeElement as HTMLElement | null)?.blur();
    if (r.kind === 'new') {
      onQuery(r.title);
      onPick({ newTitle: r.title });
    } else {
      onQuery(r.project.title);
      onPick({ id: r.project.id, title: r.project.title, nextActions: r.project.nextActions, active: r.project.active });
    }
  }

  return (
    <div
      className={cx(
        'flex flex-col rounded border bg-panel',
        focused ? 'border-accent shadow-ring' : 'border-control',
      )}
    >
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label="Project"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="Search projects or name a new one"
        value={query}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          onQuery(e.target.value);
          onPick(null);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setHighlight((active + step + list.length) % Math.max(1, list.length));
          } else if (e.key === 'Enter' && open) {
            e.preventDefault(); // pick, don't file
            pick(list[active]);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            if (query || picked) {
              onQuery('');
              onPick(null);
            } else {
              e.currentTarget.blur();
            }
          }
        }}
        className="h-(--wb-hit-phone) border-0 bg-transparent px-2.5 text-ink outline-none placeholder:text-muted lg:h-8"
      />
      <ul id={listId} role="listbox" aria-label="Projects" className={cx('m-0 list-none border-t border-line-soft p-1', !open && 'hidden')}>
        {list.map((r, i) => (
          <li
            key={r.kind === 'new' ? '+new' : r.project.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => e.preventDefault()} // keep focus in the field
            onMouseEnter={() => setHighlight(i)}
            onClick={() => pick(r)}
            className={cx(
              'flex h-7.5 cursor-pointer items-center justify-between gap-2 rounded px-2',
              i === active && 'bg-accent-tint',
            )}
          >
            {r.kind === 'new' ? (
              <span className="truncate">
                + New project: <span className="font-medium">{r.title}</span>
              </span>
            ) : (
              <span className="truncate">{r.project.title}</span>
            )}
            <span
              className={cx(
                'shrink-0 font-mono text-meta',
                r.kind === 'project' && r.project.active && !r.project.nextActions ? 'text-warn' : 'text-muted',
              )}
            >
              {r.kind === 'new'
                ? i === active && '⏎'
                : !r.project.active
                  ? 'someday'
                  : r.project.nextActions
                    ? `${r.project.nextActions} action${r.project.nextActions === 1 ? '' : 's'}`
                    : 'no next action'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
