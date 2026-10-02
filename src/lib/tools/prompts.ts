// The guided workflows (spec §6): how the agent leads; the tools do the work. Decisions are
// recorded as they are made, so an interrupted workflow loses nothing. Tool names in backticks
// are checked by prompts.test.ts.
export interface Prompt {
  name: string;
  title: string;
  description: string;
  text: string;
}

const RULES = `Rules: the user decides; you prepare, ask one thing at a time and record what they decided right away. Use the contexts and buckets from \`get_settings\`. Never invent ids — read them from the tools. Answer briefly.`;

export const PROMPTS: Prompt[] = [
  {
    name: 'weekly_review',
    title: 'Weekly review with me',
    description: 'Lead the weekly review step by step and record each decision.',
    text: `Lead my weekly review. Call \`prepare_weekly_review\`, then \`start_review\` (it returns the run in progress if there is one; \`get_review_state\` tells you where we are). Go through the steps in order. For each: show the findings in two or three lines, ask me one question at a time (e.g. "Glaze tests has no next action — what is the next physical step, or park it?"), record each answer at once (\`add_action\`, \`promote\`, \`move_project\`, \`edit_waiting\`, \`follow_up\`, \`set_bucket\`, \`drop\`, \`clarify\` …), add a short line with \`set_review_notes\`, and \`tick_step\` when I say next. At the end \`finish_review\` and summarise what changed. ${RULES}`,
  },
  {
    name: 'inbox_drafts',
    title: 'Work through my inbox',
    description: 'Draft a clarify decision for every inbox item; the user files them in Clarify.',
    text: `Prepare my inbox for Clarify. For every item from \`list_inbox\` without a draft: \`get_item\` for its context, \`search\` its key words for related projects and items, then write a \`draft_clarification\`: the outcome rewritten by the GTD rules (verb first, concrete, done-when), whether it is a project (kind project with project.new) or belongs to an existing one, and context, priority, time and energy for an action — with a one-line reason. Never \`clarify\` here. End with "n drafts ready — open Clarify". ${RULES}`,
  },
  {
    name: 'plan_my_day',
    title: 'Plan my day',
    description: 'Focus picks and time blocks that fit the day.',
    text: `Plan my day. Read \`get_overview\`, \`get_calendar\` for today and \`find_free_time\` for today. Propose in chat up to three focus actions and time blocks that fit the free time and my energy (from \`list_next_actions\`); deadlines first. When I agree, \`set_focus\` and \`time_block\`. ${RULES}`,
  },
  {
    name: 'what_now',
    title: 'What should I do now?',
    description: 'One to three next actions for where I am, the time I have and my energy.',
    text: `Ask (unless I said it) where I am, how much time I have and my energy. Then \`list_next_actions\` with that context, max_minutes and energy, focus items first, and suggest one to three with a one-line reason each. When I pick one and finish it, \`complete\` it. ${RULES}`,
  },
  {
    name: 'who_owes_me',
    title: 'Who owes me what',
    description: 'Overdue waiting-fors, nudges, follow-ups.',
    text: `Show my overdue waiting-fors (\`list_waiting\` with overdue_only), one line each with who and since when. For each, ask: nudge now (draft the message in my mail tool — not here), move the date (\`edit_waiting\`), it came in (\`received\`), or chase it as an action (\`follow_up\`). ${RULES}`,
  },
  {
    name: 'stalled_projects',
    title: 'Stalled projects',
    description: 'Give every stalled project a next action, park it, or finish it.',
    text: `Go through my stalled projects (\`list_projects\` with stalled_only; \`get_project\` for the details). For each ask: what is the next physical step (\`add_action\`, or \`promote\` a later step), park it (\`move_project\` to someday), or is it done (\`move_project\` to completed)? Record each answer. ${RULES}`,
  },
  {
    name: 'meeting_notes',
    title: 'Meeting notes → inbox',
    description: 'Split notes into single captures; file the obvious ones with the user.',
    text: `Split the meeting notes I give you into single, self-contained lines and \`capture\` them in one call (shorthand allowed). Then, for the obvious ones — things I said I will do or am waiting for — ask me and \`file\` them directly; the rest stays in the inbox for Clarify. Check \`search\` first to avoid duplicates. ${RULES}`,
  },
];
