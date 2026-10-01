import { ReferenceBoard, ReferenceSearch, type ReferenceRow } from '@/components/reference/ReferenceBoard';
import { Page } from '@/components/shell/Page';
import * as api from '@/lib/api';

export default async function ReferencePage({ searchParams }: PageProps<'/reference'>) {
  const params = await searchParams;
  const rows: ReferenceRow[] = api.listReference().map((i) => {
    const project = i.projectId ? api.getProject(i.projectId) : undefined;
    const r = i.reference ?? { kind: 'note' as const };
    return {
      id: i.id,
      text: i.text,
      reference: r,
      line: api.referenceLine(r),
      project: project && { id: project.id, title: project.title },
      tags: i.tags,
      hay: [i.text, r.body, r.url, r.url && api.referenceHost(r.url), i.tags.join(' '), project?.title].filter(Boolean).join(' ').toLowerCase(),
    };
  });
  return (
    <Page
      title="Reference"
      meta={`${rows.length} · kept, not acted on`}
      actions={<ReferenceSearch />}
      phone={{ meta: `${rows.length}`, header: <ReferenceSearch /> }}
    >
      <ReferenceBoard
        rows={rows}
        projects={api.listPickerProjects()}
        highlight={typeof params.highlight === 'string' ? params.highlight : undefined}
      />
    </Page>
  );
}
