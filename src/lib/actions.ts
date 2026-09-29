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
