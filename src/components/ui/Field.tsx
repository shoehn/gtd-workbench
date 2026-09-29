import { useId, type ComponentProps, type ReactNode } from 'react';
import { cx } from './cx';

interface FieldProps extends ComponentProps<'input'> {
  label: ReactNode;
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean;
}

/** Labelled text input: 30 px on desktop, 44 px below 1024 px. */
export function Field({ label, hideLabel, className, id, ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label
        htmlFor={inputId}
        className={cx('font-mono text-label uppercase tracking-[0.1em] text-muted', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <input
        id={inputId}
        className="h-(--wb-hit-phone) rounded border border-control bg-panel px-2.5 text-(length:--wb-text-body-phone) text-ink outline-none focus:border-accent focus:shadow-ring lg:h-(--wb-hit-input) lg:text-body"
        {...rest}
      />
    </div>
  );
}
