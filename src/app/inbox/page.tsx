import { InboxList, type InboxRow } from '@/components/inbox/InboxList';
import { RapidLog } from '@/components/inbox/RapidLog';
import { Page } from '@/components/shell/Page';
import { Btn } from '@/components/ui/Btn';
import * as api from '@/lib/api';
import { fmtAge, fmtDay, fmtWeekdayTime } from '@/lib/format';

export default async function InboxPage() {
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

  return (
    <Page
      title="Inbox"
      meta={meta}
      actions={
        <>
          {items.length ? (
            <Btn variant="primary" href="/clarify">Clarify inbox{hotkey}</Btn>
          ) : (
            <Btn variant="primary" disabled>Clarify inbox{hotkey}</Btn>
          )}
          <Btn className="hidden lg:inline-flex">Sort ▾</Btn>
        </>
      }
    >
      <div className="flex h-full flex-col gap-4">
        <RapidLog />
        <InboxList rows={rows} />
      </div>
    </Page>
  );
}
