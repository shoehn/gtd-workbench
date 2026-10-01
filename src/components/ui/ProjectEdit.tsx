'use client';

import { useEffect, useRef, useState } from 'react';
import { ProjectPicker, type PickerProject } from './ProjectPicker';

/** Inline project change on a row: the Clarify picker; ⏎ on an empty field = no project. */
export function ProjectEdit({
  projects,
  current,
  onSave,
  onCancel,
}: {
  projects: PickerProject[];
  current?: { id: string; title: string };
  onSave(project: { id: string } | { newTitle: string } | null): void;
  onCancel(): void;
}) {
  const [query, setQuery] = useState(current?.title ?? '');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <div
      className="relative z-10 min-w-0 self-start"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onCancel();
      }}
      // Esc cancels the edit outright (the picker alone would first clear its text).
      onKeyDownCapture={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !query.trim()) {
          e.preventDefault();
          onSave(null);
        }
      }}
    >
      <ProjectPicker
        projects={projects}
        query={query}
        picked={null}
        onQuery={setQuery}
        onPick={(p) => {
          if (!p) return;
          if ('newTitle' in p) onSave({ newTitle: p.newTitle });
          else if (p.id !== current?.id) onSave({ id: p.id });
          else onCancel();
        }}
        inputRef={input}
      />
    </div>
  );
}
