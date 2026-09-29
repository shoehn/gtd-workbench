'use server';

import { revalidatePath } from 'next/cache';
import * as api from './api';

export async function captureAction(line: string): Promise<void> {
  api.capture(line);
  revalidatePath('/', 'layout');
}
