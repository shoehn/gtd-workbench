// Primitive gallery — every variant once, for checking tokens and themes in development.
// Not part of the app: a 404 in production.
import { notFound } from 'next/navigation';
import { Page } from '@/components/shell/Page';
import { Btn } from '@/components/ui/Btn';
import { Card } from '@/components/ui/Card';
import { ContextChip } from '@/components/ui/ContextChip';
import { Field } from '@/components/ui/Field';
import { Kbd } from '@/components/ui/Kbd';
import { Meta } from '@/components/ui/Meta';
import { PrioChip } from '@/components/ui/PrioChip';
import { Row } from '@/components/ui/Row';
import { SectionHead } from '@/components/ui/SectionHead';
import { Tag } from '@/components/ui/Tag';

const COLS = '32px minmax(0, 1fr) 96px 72px';

export default function DevUiPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <Page title="UI primitives" meta="dev only">
      <div className="flex flex-col gap-(--wb-panel-gap)">
        <SectionHead>SectionHead</SectionHead>

        <Card>
          <Row cols={COLS} className="border-line font-mono text-label tracking-[0.1em] text-muted">
            <span /><span>ITEM</span><span>SOURCE</span><span className="text-right">AGE</span>
          </Row>
          <Row cols={COLS}>
            <input type="checkbox" aria-label="Select item" className="size-4" />
            <span>Row inside a Card</span><Meta>typed</Meta><Meta className="text-right">2 h</Meta>
          </Row>
          <Row cols={COLS} className="bg-accent-tint">
            <input type="checkbox" aria-label="Select item" className="size-4" defaultChecked />
            <span>Selected row</span><Meta>voice</Meta><Meta className="text-right text-warn">3 d</Meta>
          </Row>
        </Card>

        <Card className="flex flex-wrap items-center gap-3 p-3">
          <Tag>muted</Tag><Tag variant="warn">warn</Tag><Tag variant="ok">ok</Tag><Tag variant="accent">today</Tag>
          <PrioChip priority="A" no={1} /><PrioChip priority="B" no={3} /><PrioChip priority="C" />
          <ContextChip>@calls</ContextChip><ContextChip pressed>@computer</ContextChip>
          <Kbd>j/k</Kbd><Meta>sat 26.09</Meta>
        </Card>

        <Card className="flex flex-wrap items-center gap-3 p-3">
          <Btn variant="primary" size="sm">Primary 26</Btn>
          <Btn variant="primary">Primary 30</Btn>
          <Btn variant="primary" size="lg">Primary 44</Btn>
          <Btn>Outline 30</Btn>
          <Btn variant="ghost">Ghost 30</Btn>
          <Btn variant="primary" href="/clarify">Link <Kbd className="text-panel/80">c</Kbd></Btn>
          <Btn disabled>Disabled</Btn>
        </Card>

        <Card className="grid max-w-md gap-3 p-3">
          <Field label="Outcome" placeholder="What does done look like?" />
          <Field label="Hidden label" hideLabel placeholder="Label for screen readers only" />
        </Card>
      </div>
    </Page>
  );
}
