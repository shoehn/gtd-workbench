import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { PhoneTabBar } from './PhoneTabBar';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface PageProps {
  title: string;
  meta?: ReactNode;
  /** Top-bar right slot; defaults to the capture field. */
  actions?: ReactNode;
  back?: { href: string; label: string };
  children?: ReactNode;
}

/** App shell: sidebar + top bar from 1024 px, phone tab bar below that. */
export async function Page({ title, meta, actions, back, children }: PageProps) {
  await connection(); // the store is live state; never prerender it
  return (
    <div className="flex h-dvh">
      <div className="hidden lg:flex">
        <Sidebar />
      </div>
      <main className="flex min-w-0 grow flex-col">
        <TopBar title={title} meta={meta} right={actions} back={back} />
        <div className="min-h-0 grow overflow-auto p-(--wb-page-pad) pb-(--wb-tabbar-h) lg:pb-4">{children}</div>
      </main>
      <div className="lg:hidden">
        <PhoneTabBar />
      </div>
    </div>
  );
}
