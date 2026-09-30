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

export async function demoteAction(id: string): Promise<void> {
  api.demote(id);
  revalidatePath('/', 'layout');
}

export async function promoteAction(id: string, fields: api.NextFields): Promise<void> {
  api.promote(id, fields);
  revalidatePath('/', 'layout');
}

export async function addActionAction(projectId: string, text: string, fields: api.NextFields): Promise<void> {
  api.addAction(projectId, text, fields);
  revalidatePath('/', 'layout');
}

export async function addStepAction(projectId: string, text: string): Promise<void> {
  api.addStep(projectId, text);
  revalidatePath('/', 'layout');
}

export async function completeProjectAction(id: string): Promise<void> {
  api.completeProject(id);
  revalidatePath('/', 'layout');
}

export async function moveProjectToSomedayAction(id: string): Promise<void> {
  api.moveProjectToSomeday(id);
  revalidatePath('/', 'layout');
}

export async function activateProjectAction(id: string): Promise<void> {
  api.activateProject(id);
  revalidatePath('/', 'layout');
}

export async function updateProjectAction(id: string, patch: api.ProjectPatch): Promise<void> {
  api.updateProject(id, patch);
  revalidatePath('/', 'layout');
}

export async function followUpAction(id: string): Promise<void> {
  api.followUp(id);
  revalidatePath('/', 'layout');
}

export async function receivedAction(id: string): Promise<ReturnType<typeof api.received>> {
  const done = api.received(id);
  revalidatePath('/', 'layout');
  return done;
}

export async function activateAction(id: string): Promise<void> {
  api.activate(id);
  revalidatePath('/', 'layout');
}

export async function dropAction(id: string): Promise<{ id: string; status: Item['status'] }[]> {
  const moved = api.drop(id);
  revalidatePath('/', 'layout');
  return moved;
}

export async function setBucketAction(id: string, bucket: string): Promise<void> {
  api.setBucket(id, bucket);
  revalidatePath('/', 'layout');
}

export async function dropProjectAction(id: string): Promise<void> {
  api.dropProject(id);
  revalidatePath('/', 'layout');
}

export async function undropProjectAction(id: string): Promise<void> {
  api.undropProject(id);
  revalidatePath('/', 'layout');
}

export async function setTimeSlotAction(id: string, start: string, end?: string): Promise<void> {
  api.setTimeSlot(id, start, end);
  revalidatePath('/', 'layout');
}

export async function clearTimeSlotAction(id: string): Promise<void> {
  api.clearTimeSlot(id);
  revalidatePath('/', 'layout');
}

export async function setDayAction(id: string, day: string): Promise<void> {
  api.setDay(id, day);
  revalidatePath('/', 'layout');
}

export async function addTicklerAction(day: string, text: string): Promise<void> {
  api.addTickler(day, text);
  revalidatePath('/', 'layout');
}

export async function updateTicklerAction(id: string, text: string): Promise<void> {
  api.updateTickler(id, text);
  revalidatePath('/', 'layout');
}

export async function deleteTicklerAction(id: string): Promise<void> {
  api.deleteTickler(id);
  revalidatePath('/', 'layout');
}

export async function startReviewAction(): Promise<void> {
  api.startReview();
  revalidatePath('/', 'layout');
}

export async function openStepAction(stepId: string): Promise<void> {
  api.openStep(stepId);
  revalidatePath('/', 'layout');
}

export async function tickStepAction(stepId: string): Promise<void> {
  api.tickStep(stepId);
  revalidatePath('/', 'layout');
}

export async function untickStepAction(stepId: string): Promise<void> {
  api.untickStep(stepId);
  revalidatePath('/', 'layout');
}

export async function pauseReviewAction(): Promise<void> {
  api.pauseReview();
  revalidatePath('/', 'layout');
}

export async function resumeReviewAction(): Promise<void> {
  api.resumeReview();
  revalidatePath('/', 'layout');
}

export async function setReviewNotesAction(notes: string): Promise<void> {
  api.setReviewNotes(notes);
  revalidatePath('/', 'layout');
}

export async function finishReviewAction(): Promise<void> {
  api.finishReview();
  revalidatePath('/', 'layout');
}

/** Settings changes answer with the refusal instead of throwing: it is shown next to the row. */
export type SettingsResult = { error?: string };

async function settle(run: () => void): Promise<SettingsResult> {
  try {
    run();
  } catch (e) {
    return { error: (e instanceof Error ? e.message : String(e)).replace(/^settings: /, '') };
  }
  revalidatePath('/', 'layout');
  return {};
}

export async function addListEntryAction(list: api.SettingsList, name: string, at?: number): Promise<SettingsResult> {
  return settle(() => api.addListEntry(list, name, at));
}

export async function renameListEntryAction(list: api.SettingsList, from: string, to: string): Promise<SettingsResult> {
  return settle(() => api.renameListEntry(list, from, to));
}

export async function deleteListEntryAction(list: api.SettingsList, name: string): Promise<SettingsResult> {
  return settle(() => api.deleteListEntry(list, name));
}

export async function moveListEntryAction(list: api.SettingsList, name: string, to: number): Promise<SettingsResult> {
  return settle(() => api.moveListEntry(list, name, to));
}

export async function updateSettingsAction(patch: Parameters<typeof api.updateSettings>[0]): Promise<SettingsResult> {
  return settle(() => api.updateSettings(patch));
}

export async function resetTemplateAction(): Promise<SettingsResult> {
  return settle(() => api.resetTemplate());
}
