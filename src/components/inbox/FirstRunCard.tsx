import Link from 'next/link';

/** Shown once on a new database, until the first capture. No wizard, no tour. */
export function FirstRunCard() {
  return (
    <section aria-label="New here" className="rounded border border-accent bg-accent-tint px-4 py-3 max-lg:m-3">
      <p className="m-0">
        <span className="font-semibold">New here.</span> Capture the first thing on your mind; the lists fill themselves.
        Contexts and the review checklist are in{' '}
        <Link href="/settings" className="text-accent hover:text-accent-hover">
          settings
        </Link>
        .
      </p>
    </section>
  );
}
