'use server';

import { revalidatePath } from 'next/cache';
import * as api from './api';
import type { Item } from './model';

export async function captureAction(line: string): Promise<void> {
  api.capture(line);
  revalidatePath('/', 'layout');
}

export async function trashAction(ids: string[]): Promise<{ id: string; status: Item['status'] }[]> {
  const moved = api.trash(ids);
  revalidatePath('/', 'layout');
  return moved;
}

export async function untrashAction(entries: { id: string; status: Item['status'] }[]): Promise<void> {
  api.untrash(entries);
  revalidatePath('/', 'layout');
}

export async function clarifyAction(itemId: string, decision: api.Decision): Promise<api.ClarifyResult> {
  const result = api.clarify(itemId, decision);
  revalidatePath('/', 'layout');
  return result;
}

export async function completeAction(id: string): Promise<api.Completed> {
  const done = api.complete(id);
  revalidatePath('/', 'layout');
  return done;
}

export async function uncompleteAction(done: api.Completed): Promise<void> {
  api.uncomplete(done);
  revalidatePath('/', 'layout');
}

export async function reopenAction(id: string): Promise<void> {
  api.reopen(id);
  revalidatePath('/', 'layout');
}

export async function toggleFocusAction(id: string): Promise<boolean> {
  const on = api.toggleFocus(id);
  revalidatePath('/', 'layout');
  return on;
}

export async function editNextAction(id: string, edit: api.NextEdit): Promise<void> {
  api.editNext(id, edit);
  revalidatePath('/', 'layout');
}
