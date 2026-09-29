# GTD Workbench

A responsive Getting-Things-Done web app, built incrementally by a coding agent
from the hand-off bundle in `docs/handoff/`. The bundle is the *brief*, not
generated code.

```
AGENTS.md               project conventions for any coding agent (source of truth)
CLAUDE.md               `@AGENTS.md` — Claude Code reads the same conventions
docs/handoff/
├─ SPEC.md              product spec: screens, workflow decisions, domain model
├─ design/
│  ├─ tokens.css        the visual system as CSS variables (+ Tailwind v4 @theme mapping)
│  └─ mockups/          the 14 artboards as plain HTML (open in a browser)
├─ data/
│  └─ seed.json         the sample data all mockups use, typed like the model
└─ prompts/             one prompt per iteration, in order (00 → 09)
src/                    the app (Next.js app router)
```

## Workflow

1. Open your coding agent (Claude Code or any `AGENTS.md`-aware tool) in the repo.
   Work through `docs/handoff/prompts/` in order. Each prompt is self-contained: paste
   it as the first message of a fresh session (or `/clear` between them). Each ends with
   a definition of done; don't start the next until it holds
   (`pnpm lint && pnpm typecheck && pnpm build`).
2. After each iteration: look at the screen next to its mockup, comment on the canvas or here,
   and we adjust the mockup or the prompt before the next step. Mockups are the reference,
   not the source of truth — SPEC.md is.
3. Project conventions live in `AGENTS.md` only; `CLAUDE.md` just imports it. Keep the
   `nextjs-agent-rules` block at the top of `AGENTS.md` as is — `next dev` rewrites it.

## Order of iterations

| # | Prompt | Result |
|---|--------|--------|
| 00 | scaffold | tokens, fonts, shell (sidebar / top bar / phone tab bar), primitives, seed store |
| 01 | inbox | Rapid log + inbox list, capture shorthand parser |
| 02 | clarify | the 4-step Clarify form, all branches, keyboard |
| 03 | next-actions | context/time/energy filters, groups, focus star, Today panel |
| 04 | projects | list + detail, next/later, stalled detection |
| 05 | waiting-someday | Waiting For with follow-up, Someday/Maybe with activate |
| 06 | calendar | week view, five item kinds, deadline mirroring |
| 07 | weekly-review | checklist template, timer, measured step notes |
| 08 | phone | responsive pass: tab bar, phone layouts for all screens |
| 09 | persistence | swap the in-memory store for SQLite (Prisma or Drizzle), keep the API |

Prompts 01–07 each build one route on top of the shell from 00 and are independent of
each other, so the order can change after 02 (Clarify creates the data the others show).

## Conventions that hold everywhere

- Route = screen = one mockup. Desktop layout first, phone layout in 08.
- No UI library. Primitives from 00 only; add one when two screens need it.
- Sample data comes from `docs/handoff/data/seed.json`; screens never hard-code copy that is data.
- The "one control per decision" rule from `docs/handoff/SPEC.md` §4 is a review criterion for every PR.
