import { connection } from 'next/server';
import type { ReactNode } from 'react';
import * as api from '@/lib/api';
import { CommandPalette } from '../palette/CommandPalette';
import { cx } from '../ui/cx';
import { CaptureLink, PhoneHeader } from './PhoneHeader';
import { PhoneTabBar } from './PhoneTabBar';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/** How the screen composes below `lg` (SPEC §2, phone). */
export interface PhoneLayout {
  /** Title on the phone when it differs from the desktop one. */
  title?: string;
  /** Meta after the title; defaults to the desktop meta. */
  meta?: ReactNode;
  /** Right-hand header actions; defaults to the "›" capture link, `null` for none. */
  actions?: ReactNode;
  /** Back arrow before the title; defaults to the desktop `back`. */
  back?: { href: string; label: string };
  /** Rows under the title inside the header: chips, tabs, the rapid log. */
  header?: ReactNode;
  /** A bar fixed above the tab bar (Weekly Review). */
  footer?: ReactNode;
  /** `false` hides the tab bar: a focused flow with its own bottom bar (Clarify). */
  tabBar?: boolean;
}

interface PageProps {
  title: string;
  meta?: ReactNode;
  /** Desktop controls right after the meta line in the top bar. */
  tools?: ReactNode;
  /** Top-bar right slot; defaults to the capture field. */
  actions?: ReactNode;
  back?: { href: string; label: string };
  /** Full-width strip under the top bar, e.g. a filter bar. Desktop only. */
  toolbar?: ReactNode;
  /** Children fill the content area edge to edge and scroll themselves (no page padding). */
  flush?: boolean;
  phone?: PhoneLayout;
  children?: ReactNode;
}

/** App shell: sidebar + top bar from 1024 px; phone header + tab bar below that. */
export async function Page({ title, meta, tools, actions, back, toolbar, flush, phone = {}, children }: PageProps) {
  await connection(); // the store is live state; never prerender it
  return (
    <div className="flex h-dvh max-lg:text-(length:--wb-text-body-phone)">
      <div className="hidden lg:flex">
        <Sidebar />
      </div>
      <main className="flex min-w-0 grow flex-col">
        <TopBar title={title} meta={meta} tools={tools} right={actions} back={back} />
        <PhoneHeader
          title={phone.title ?? title}
          meta={phone.meta === undefined ? meta : phone.meta}
          actions={phone.actions === undefined ? <CaptureLink /> : phone.actions}
          back={phone.back ?? back}
        >
          {phone.header}
        </PhoneHeader>
        {toolbar && <div className="max-lg:hidden lg:contents">{toolbar}</div>}
        <div
          className={cx(
            flush
              ? 'min-h-0 grow overflow-auto pb-(--wb-tabbar-h) lg:overflow-hidden lg:pb-0'
              : 'min-h-0 grow overflow-auto pb-(--wb-tabbar-h) lg:p-(--wb-page-pad) lg:pb-4',
            !!phone.footer && 'max-lg:pb-[calc(var(--wb-tabbar-h)+68px)]',
            phone.tabBar === false && 'max-lg:pb-0',
          )}
        >
          {children}
        </div>
        {phone.footer && (
          <div className="fixed inset-x-0 bottom-(--wb-tabbar-h) flex h-[68px] items-center gap-2.5 border-t border-line bg-panel px-4 lg:hidden">
            {phone.footer}
          </div>
        )}
      </main>
      <CommandPalette data={api.paletteData()} />
      {phone.tabBar !== false && (
        <div className="lg:hidden">
          <PhoneTabBar />
        </div>
      )}
    </div>
  );
}
