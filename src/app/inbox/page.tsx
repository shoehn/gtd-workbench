import { InboxList, type InboxRow } from '@/components/inbox/InboxList';
import { PhoneInbox, PhoneRapidLog } from '@/components/inbox/PhoneInbox';
import { RapidLog } from '@/components/inbox/RapidLog';
import Link from 'next/link';
import { Page } from '@/components/shell/Page';
import { Btn } from '@/components/ui/Btn';
import * as api from '@/lib/api';
import { fmtAge, fmtDay, fmtWeekdayTime } from '@/lib/format';

export default async function InboxPage({ searchParams }: PageProps<'/inbox'>) {
  const params = await searchParams;
  const items = api.listInbox();
  const rows: InboxRow[] = items.map((i) => ({
    id: i.id,
    text: i.text,
    source: i.source,
    captured: fmtWeekdayTime(i.capturedAt),
    age: fmtAge(api.ageHours(i)),
    aging: api.ageDays(i) >= 3,
    context: i.context,
    priority: i.priority,
    day: i.day && fmtDay(i.day),
    tags: i.tags,
  }));
  const oldest = items.at(-1);
  const meta = oldest ? `${items.length} open · oldest ${fmtAge(api.ageHours(oldest))}` : '0 open';
  const hotkey = <span className="font-mono text-meta opacity-80">c</span>;
  const clarifyCls =
    'relative inline-flex h-9 items-center rounded bg-accent px-3 text-sm font-medium text-panel no-underline after:absolute after:-inset-1';

  return (
    <Page
      title="Inbox"
      meta={meta}
      actions={
        items.length ? (
          <Btn variant="primary" href="/clarify">Clarify inbox{hotkey}</Btn>
        ) : (
          <Btn variant="primary" disabled>Clarify inbox{hotkey}</Btn>
        )
      }
      phone={{
        meta: oldest ? `${items.length} · oldest ${fmtAge(api.ageHours(oldest))}` : '0',
        actions: items.length ? (
          <Link href="/clarify" className={clarifyCls}>
            Clarify
          </Link>
        ) : null,
        header: <PhoneRapidLog focus={params.capture === '1'} />,
      }}
    >
      <PhoneInbox rows={rows} />
      <div className="flex h-full flex-col gap-4 max-lg:hidden">
        <RapidLog />
        <InboxList rows={rows} />
      </div>
    </Page>
  );
}
