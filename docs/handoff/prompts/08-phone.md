# 08 · Phone layouts

Reference: `docs/handoff/design/mockups/M-*.dc.html` (seven boards, 390×844); SPEC §2.
Same routes, same api, same components where they fit; different composition below the
`lg` breakpoint (1024 px). The phone is for capture, ticking and reading — planning stays
on the desktop.

## Do

1. **Shell**: below `lg`, `Page` renders a phone header (58 px top padding for the status
   bar — leave it empty, never draw a fake status bar — then h1 20 px, meta, right-hand
   36 px actions) and the `PhoneTabBar` (Inbox · Next · Projects · Waiting · Review). The
   capture `›` button in the header of every screen except Inbox links to `/inbox` with
   the field focused.
2. **Inbox** (`M-Inbox`): 48 px rapid log with a mic button (disabled, `aria-label`
   "Voice capture", placeholder for later), the list as stacked two-line rows (text +
   "source · ddd HH:MM · age"), swipe right → clarify, swipe left → trash with undo
   (pointer events; no library), the hint line "swipe → clarify · swipe ← trash".
3. **Clarify** (`M-Clarify`): the same four steps, but completed steps 1–2 collapse to
   one-line rows with a green check and "Edit"; the current step expands. Bottom action
   bar: trash + "File it and next" 48 px. Step 4 on phone shows Context and Priority as
   selects and the rest as a one-line "time 30 min · energy focus · deadline 03.10 — tap
   to change" that expands on tap.
4. **Next** (`M-Next`): horizontally scrolling context chips, a second chip row for time
   and energy, the tappable "Today" strip (links to `/calendar`), groups as labelled
   sections with 44 px rows (checkbox 20 px, `PrioChip`, text + meta line). The focus star
   is a long-press/swipe action on the row (no star column on phone).
5. **Projects** (`M-Projects`): list only, rows with dot + title + "→ next action" +
   meta; tapping opens the desktop detail rendered single-column under `lg` (verify it
   reads well; if it does not, stack the cards and hide Reference).
6. **Waiting / Someday** (`M-Waiting`): two tabs in the header (`?tab=`), rows with
   "Follow up" button only on overdue rows, swipe → received, swipe ← follow up.
7. **Calendar** (`M-Calendar`): agenda view — week strip of 7 day buttons, then sections
   per day that has entries (today first), rows "time | block" using the same five block
   styles. Reached from the Today strip on Next; back arrow returns.
8. **Review** (`M-Review`): progress bar + "5 / 12 · last 8 d ago" under the title, the
   steps as one list with phase labels, current step tinted, Pause / Finish bar above the
   tab bar.
9. **Touch targets** ≥ 44 px everywhere on phone; body text 15 px; no hover-only
   affordances (anything on hover on desktop gets a visible control on phone).

## Definition of done

- Every route at 390×844 matches its M-board in structure; no horizontal scroll; the
  tab bar's active tab is right on every route (Clarify highlights Inbox, Calendar
  highlights Next).
- Lighthouse mobile accessibility ≥ 95 on /inbox and /next.
- Desktop layouts are pixel-unchanged (compare before/after screenshots at 1280).
