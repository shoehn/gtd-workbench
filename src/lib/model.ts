// Domain model v1 — SPEC §5, verbatim. Derived values (stalled, age, counts) live in api.ts.

export type Priority = 'A' | 'B' | 'C';
export type Energy = 'focus' | 'normal' | 'low';
export type TimeBucket = 15 | 30 | 60 | 120;          // minutes, 120 = "2h+"
export type Source = 'typed' | 'voice' | 'email' | 'share' | 'scan';

export interface Item {
  id: string;
  text: string;               // the clarified text (step 2)
  captured: string;           // original capture text, never edited
  source: Source;
  capturedAt: string;         // ISO
  status: 'inbox' | 'next' | 'later' | 'waiting' | 'calendar' | 'someday' | 'reference' | 'done' | 'trash';
  projectId?: string;
  context?: string;           // '@computer'
  priority?: Priority;
  priorityNo?: number;        // running number inside priority
  time?: TimeBucket;
  energy?: Energy;
  deadline?: string;          // ISO date, hard deadlines only
  day?: string;               // calendar: day-specific action / info
  timeSlot?: { start: string; end: string };  // calendar: time block
  focusOn?: string;           // ISO date the focus star was set for
  waiting?: { who: string; since: string; followUp?: string };
  bucket?: string;            // someday/maybe grouping
  tags: string[];
  doneAt?: string;
}

export interface Project {
  id: string;
  title: string;              // outcome phrasing
  successfulWhen?: string;
  area?: string;              // 'Home & workshop'
  goal?: string;
  deadline?: string;
  status: 'active' | 'someday' | 'completed';
  notes: string;
  lastReviewedAt?: string;
  // derived: nextActions = items(status='next', projectId), stalled = active && nextActions.length===0
}

export interface ReviewTemplate { phases: { id: string; name: string; steps: { id: string; text: string; link?: string }[] }[] }
export interface ReviewRun {
  id: string; startedAt: string; finishedAt?: string; pausedMs: number;
  steps: { stepId: string; doneAt?: string; note?: string; openedAt?: string }[];
  notes: string;
  outcome?: 'finished' | 'abandoned';
}

export interface ExternalEvent { id: string; calendar: string; title: string; start: string; end: string; allDay: boolean }
