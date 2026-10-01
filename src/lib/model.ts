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
  reference?: Reference;      // status 'reference': what it is and where it lives
  tags: string[];
  doneAt?: string;
  trashedAt?: string;         // ISO; trash is purged by the weekly review or after 30 d
}

/** A reference entry (SPEC §3.11): kept, not acted on. The app is the index, not the archive. */
export interface Reference {
  kind: 'note' | 'link' | 'file';
  url?: string;               // link: any scheme (https, obsidian://, a document system's URL)
  body?: string;              // note: the text kept here; file: the path or file name
}

export interface Project {
  id: string;
  title: string;              // outcome phrasing
  successfulWhen?: string;
  area?: string;              // 'Home & garden'
  goal?: string;
  deadline?: string;
  status: 'active' | 'someday' | 'completed';
  notes: string;
  lastReviewedAt?: string;
  createdAt?: string;         // ISO
  createdFrom?: 'inbox' | 'projects';  // Clarify step 3, or "+ Project" (later)
  dropped?: boolean;          // completed by Drop on Someday/Maybe, not by finishing it
  completedAt?: string;       // ISO; set when it is completed or dropped
  // derived: nextActions = items(status='next', projectId), stalled = active && nextActions.length===0
}

export interface ReviewTemplate { phases: { id: string; name: string; steps: { id: string; text: string; link?: string }[] }[] }
/** Counters a review step snapshots when it becomes current; its note is the delta to tick time. */
export interface ReviewCounters { inbox: number; someday: number; waitingOverdue: number; stalled: number }
export interface ReviewRun {
  id: string; startedAt: string; finishedAt?: string; pausedMs: number;
  template?: ReviewTemplate;  // the checklist as it was when the run started; later edits leave it alone
  pausedAt?: string;          // ISO; set while paused
  steps: { stepId: string; doneAt?: string; note?: string; openedAt?: string; snapshot?: ReviewCounters }[];
  notes: string;
  outcome?: 'finished' | 'abandoned';
}

/** User settings, one per installation (edited on /settings). */
export interface Settings {
  contexts: string[];         // '@computer', in display order
  followUpContext: string;    // where `f` on a waiting-for files the chase (default '@calls')
  buckets: string[];          // Someday/Maybe buckets, in display order
  reviewTemplate: ReviewTemplate;
  weekStart: 'mon';
  timezone: string;           // IANA, e.g. 'Europe/Zurich'
  theme: Theme;               // 'system' follows the OS
}

export type Theme = 'system' | 'light' | 'dark';

export interface ExternalEvent {
  id: string; calendar: string; title: string;
  start: string; end: string;   // timed: ISO with offset, in the app's zone; all day: yyyy-mm-dd, end exclusive
  allDay: boolean;
  location?: string;
  sourceId?: string;            // the synced source it came from; absent = demo data
}
