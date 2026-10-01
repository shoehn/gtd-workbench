# Next.js implementation review

Reviewed on 01.10.2026 against [the product specification](handoff/SPEC.md), the implementation, automated checks, and targeted API and browser reproductions.

The review found eleven actionable issues. The recurring-item undo bug should be fixed first because it can permanently delete unrelated data. P1 means fix first; P2 means should fix. These findings describe the implementation at review time; no fixes were made during the review.

1. **P1 — Undo can permanently delete unrelated calendar items.**

   Undo matches successors by title and date, deleting all matching recurring items. A reproduction confirmed that a separate checklist disappears. Track the actual successor ID instead of identifying it by content.

   Source: [src/lib/api.ts](../src/lib/api.ts), line 627.

2. **P2 — Keyboard shortcuts can target the wrong action after palette navigation.**

   Browser reproduction: navigate from action A to B through the palette; the URL changes to B, but the cursor stays on A. Pressing `x` then targets A. Synchronize cursor state with changes to `highlight`.

   Source: [src/components/next/NextBoard.tsx](../src/components/next/NextBoard.tsx), line 74. Similar initialization patterns exist in Reference and Waiting, but those cases were not reproduced in the browser.

3. **P2 — Unauthenticated requests can block legitimate captures.**

   Rate limiting happens before token validation and shares one quota with `/share`. After 60 requests without credentials, a valid capture returned 429. Separate failed-authentication throttling from the authenticated capture quota.

   Source: [src/app/api/capture/route.ts](../src/app/api/capture/route.ts), line 11.

4. **P2 — Request-size limits do not bound memory consumption.**

   Capture reads an entire chunked body before checking its size; Share has no equivalent body limit. A share containing a 1 MiB note was accepted and stored. Enforce limits while streaming, before parsing. The capture endpoint requires a valid token to reach body parsing, and Share relies on the deployment's authentication boundary.

   Sources: [src/lib/capture-in.ts](../src/lib/capture-in.ts), line 91; [src/app/share/route.ts](../src/app/share/route.ts), line 16.

5. **P2 — Calendar sync silently loses valid recurring events in two cases.**

   A daily series starting in 2020 produced zero events for the test window of 19.09.2026 through 25.10.2026 because expansion stops after 2,000 lifetime occurrences. Separately, moving one occurrence beyond the window prematurely stops expansion, hiding subsequent appointments that still fall inside the window. Both cases were reproduced. Make expansion window-aware and handle moved exceptions without prematurely terminating the series; add regression coverage for both cases.

   Source: [src/lib/calendar/ics.ts](../src/lib/calendar/ics.ts), line 102.

6. **P2 — Timed Calendar actions cannot be completed on the phone.**

   Adding a time turns an action into a `timeblock`, whose rendering has no completion control. The seeded Weekly review demonstrates this in the browser. Desktop requires removing its time block first; phone offers no workaround. Add a completion control for nonprojected time blocks belonging to Calendar actions.

   Sources: [src/components/calendar/Agenda.tsx](../src/components/calendar/Agenda.tsx), line 69; [src/components/calendar/WeekGrid.tsx](../src/components/calendar/WeekGrid.tsx), line 383.

7. **P2 — Parked projects can regain next actions without activation.**

   “↑ next” remains available for parked or dropped projects, and the API does not validate the parent's status. Clarify also accepts a parked project when creating a next action; this was reproduced through the API. Enforce the active-project requirement in the API and reflect it in the controls.

   Sources: [src/components/projects/ProjectDetail.tsx](../src/components/projects/ProjectDetail.tsx), line 241; [src/lib/api.ts](../src/lib/api.ts), line 801.

8. **P2 — Choosing “single action” can retain an old project.**

   Reproduction: project reference → Someday → Activate → Clarify with no project. The previous project remains because Clarify only assigns a supplied project; it never clears an existing one. Explicitly remove the old project association when filing a single action.

   Source: [src/lib/api.ts](../src/lib/api.ts), line 453.

9. **P2 — Several required editing controls are missing.**

   Priority, time estimate, energy, and item deadline cannot be edited after Clarify, contrary to SPEC §4. The edit API supports only text, context, and project. Standalone actions have no correction path for these fields. Extend the edit API and provide the corresponding item controls.

   Source: [src/lib/api.ts](../src/lib/api.ts), line 658.

10. **P2 — Filtering Next Actions hides valid Focus entries.**

    Browser reproduction: star an `@computer` action, then filter to `@calls`; Focus changes from “1 picked” to “0 picked”, although the star remains stored. Its optimistic state incorrectly derives from filtered rows. Initialize that state from the complete Focus collection.

    Source: [src/components/next/NextBoard.tsx](../src/components/next/NextBoard.tsx), line 223.

11. **Lower priority — Reference lacks its specified phone navigation command.**

    The palette's screen commands omit Reference, although SPEC identifies the palette as its phone entry point. Add a “Go to Reference” command so users can browse the screen without searching for a known reference item.

    Source: [src/components/palette/CommandPalette.tsx](../src/components/palette/CommandPalette.tsx), line 46.

Validation completed during the review:

- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test` passed: 454 tests across 40 files.
- `pnpm build` passed.
- `pnpm audit --prod --json` reported zero known advisories.
- Targeted API reproductions and isolated memory-mode browser checks confirmed the cases identified above as reproduced.

The security assessment assumes the documented authenticating reverse proxy. The deployed proxy and live mail/calendar services were not tested. No full accessibility audit or pixel-by-pixel mockup comparison was performed. Source references and line numbers describe the reviewed implementation and may change as fixes land.
