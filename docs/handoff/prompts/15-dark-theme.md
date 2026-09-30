# 15 · Dark theme

Reference: `design/tokens.css` (the dark block is prepared but unused), SPEC §7.
This is a tokens exercise, not a redesign: no component may gain a dark-specific
class. If a component needs one, the token set is incomplete — fix the token.

## Do

1. **Switch**: `Settings.theme: 'system' | 'light' | 'dark'` (default system). The
   root `<html>` gets `data-theme` from settings; `system` sets nothing and lets the
   `prefers-color-scheme` block apply. Apply it in a tiny inline script in `<head>`
   before paint (read a cookie mirrored from settings) so there is no flash. Toggle
   from Settings and from the palette command "Toggle dark theme" (cycles
   system → dark → light).
2. **Token audit**: grep the codebase for raw hexes, `rgba(`, `white`, `black`,
   `bg-white`, `text-black` — every hit becomes a token. Then walk every screen at 1280
   and 390 in dark and fix contrast with the same ≥ 4.5:1 / ≥ 3:1 rule: muted on panel,
   warn on warn-tint, accent on accent-tint, the A-priority chip, the calendar block
   styles (grey appointment block, dashed tickler, orange deadline), the star's
   unstarred grey, the now-line, the focus ring. Adjust the dark values in
   `tokens.css` only; never the light ones.
3. **Assets**: inline SVG icons already use `currentColor`; verify. The phone tab bar
   and sidebar rail must read as rails in dark (slightly darker than ground, not lighter).
4. **Form controls**: `color-scheme: dark` on the root when dark, so native selects,
   checkboxes and date inputs follow.
5. **Test**: a vitest with jsdom that renders each primitive under both `data-theme`
   values and asserts computed color pairs meet the contrast ratios (a 20-line contrast
   helper in `lib/contrast.ts`; it doubles as a lint for future token edits).

## Don't

- No per-component dark classes, no third theme, no theme-dependent layout. No new
  colors: dark mode is the same palette re-tuned.

## Definition of done

- Every route in dark at 1280 and 390 passes the contrast test; the screenshots look
  like the same app after sunset, not a different app.
- No flash of light theme on reload with dark set; `system` follows the OS live.
- `rg '#[0-9a-f]{6}' src --glob '!**/tokens.css'` returns nothing.
