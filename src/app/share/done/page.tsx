import { Page } from '@/components/shell/Page';
import { Btn } from '@/components/ui/Btn';
import { Card } from '@/components/ui/Card';
import * as api from '@/lib/api';

const PROBLEMS: Record<string, string> = {
  empty: 'Nothing to capture: the share had no title, text or link.',
  busy: 'Too many captures in the last minute — share again in a moment.',
};

/** After a share (POST /share): one line saying what landed in the inbox, then back to work. */
export default async function SharedPage({ searchParams }: PageProps<'/share/done'>) {
  const { item: id, error } = await searchParams;
  const item = typeof id === 'string' ? api.getItem(id) : undefined;
  const url = item?.reference?.url;
  return (
    <Page title="Shared" meta="into the inbox" phone={{ meta: null }}>
      <Card className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-3.5 max-lg:m-4">
        {item ? (
          <p role="status" className="m-0 flex flex-col gap-0.5">
            <span>
              Captured to inbox: <span className="font-medium">{item.text}</span>
            </span>
            {url && <span className="font-mono text-meta text-muted break-all">{api.referenceHost(url)}</span>}
          </p>
        ) : (
          <p role="alert" className="m-0 text-warn">
            {PROBLEMS[typeof error === 'string' ? error : ''] ?? 'That share is no longer in the inbox.'}
          </p>
        )}
        <div className="flex gap-2">
          {item?.status === 'inbox' && (
            <Btn variant="primary" href={`/clarify?item=${encodeURIComponent(item.id)}`}>
              Clarify now
            </Btn>
          )}
          <Btn href="/inbox">Done</Btn>
        </div>
      </Card>
    </Page>
  );
}
