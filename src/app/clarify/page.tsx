import Link from 'next/link';
import { ClarifyForm } from '@/components/clarify/ClarifyForm';
import { PHONE_ICON_BTN } from '@/components/shell/PhoneHeader';
import { Page } from '@/components/shell/Page';
import { Btn } from '@/components/ui/Btn';
import { Kbd } from '@/components/ui/Kbd';
import { Meta } from '@/components/ui/Meta';
import * as api from '@/lib/api';
import { fmtWeekdayTime } from '@/lib/format';

const BACK = { href: '/inbox', label: 'Inbox' };

export default async function ClarifyPage({ searchParams }: PageProps<'/clarify'>) {
  const { item: param } = await searchParams;
  const queue = api.listInboxQueue();
  const requested = typeof param === 'string' ? param : undefined;
  const item = requested ? queue.find((i) => i.id === requested) : queue[0];

  if (!item) {
    const gone = requested && api.getItem(requested);
    return (
      <Page title="Clarify" back={BACK} actions={null} phone={{ actions: null }}>
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <Meta>
            {gone ? 'This item is no longer in the inbox.' : queue.length ? 'No such inbox item.' : 'Inbox is empty — nice.'}
          </Meta>
          <Btn href={queue.length ? '/clarify' : '/inbox'}>{queue.length ? 'Clarify the oldest item' : 'Back to Inbox'}</Btn>
        </div>
      </Page>
    );
  }

  const pos = queue.indexOf(item);
  // Skip wraps round the queue; filing moves on to the item after this one.
  const after = queue.slice(pos + 1).concat(queue.slice(0, pos)).map((i) => i.id);
  const projects = api.listPickerProjects();

  const meta = (
    <span className="inline-flex items-center gap-4">
      <span>
        item {pos + 1} of {queue.length}
      </span>
      <span className="inline-flex gap-0.75" aria-hidden="true">
        {queue.map((q, i) => (
          <span key={q.id} className={`h-1 w-4.5 rounded-sm ${i <= pos ? 'bg-accent' : 'bg-line'}`} />
        ))}
      </span>
    </span>
  );

  return (
    <Page
      title="Clarify"
      meta={meta}
      back={BACK}
      phone={{
        meta: `${pos + 1} / ${queue.length}`,
        actions: after.length ? (
          <Link href={`/clarify?item=${encodeURIComponent(after[0])}`} className={`${PHONE_ICON_BTN} w-auto px-3 text-sm`}>
            Skip
          </Link>
        ) : null,
        header: (
          <div className="flex gap-0.75" aria-hidden="true">
            {queue.map((q, i) => (
              <span key={q.id} className={`h-1 grow rounded-sm ${i <= pos ? 'bg-accent' : 'bg-line'}`} />
            ))}
          </div>
        ),
        tabBar: false,
      }}
      actions={
        after.length ? (
          <Btn href={`/clarify?item=${encodeURIComponent(after[0])}`}>Skip for now <Kbd>s</Kbd></Btn>
        ) : (
          <Btn disabled>Skip for now <Kbd>s</Kbd></Btn>
        )
      }
    >
      <ClarifyForm
        key={item.id}
        item={{
          id: item.id,
          text: item.text,
          captured: item.captured,
          source: item.source,
          when: fmtWeekdayTime(item.capturedAt, api.timeZone()),
          context: item.context,
          priority: item.priority,
          day: item.day,
          tags: item.tags,
          reference: item.reference,
          projectId: item.projectId,
        }}
        after={after}
        contexts={api.listContexts()}
        projects={projects}
        similar={api.similar(item.text, item.id)}
      />
    </Page>
  );
}
