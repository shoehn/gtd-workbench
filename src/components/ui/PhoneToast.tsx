'use client';

/** Undo toast above the phone tab bar. */
export function PhoneToast({ text, onUndo }: { text: string; onUndo(): void }) {
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(var(--wb-tabbar-h)+8px)] z-10 flex min-h-11 items-center gap-3 rounded bg-ink pl-3 text-panel lg:hidden"
    >
      <span className="min-w-0 grow truncate text-sm">{text}</span>
      <button type="button" onClick={onUndo} className="h-11 shrink-0 px-4 font-medium text-accent-tint">
        Undo
      </button>
    </div>
  );
}
