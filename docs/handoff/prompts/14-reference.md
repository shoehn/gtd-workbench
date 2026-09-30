# 14 · Reference

Reference: SPEC §2 (Reference is a sidebar entry without a screen), §3.2 (Clarify's
"No → Reference"), the Reference box in `Projects.dc.html`. Keep it deliberately thin:
GTD reference material is *not actionable*; the screen exists so that "No → Reference"
has somewhere to go and so a project can list what it relies on. It is not a document
manager — you already have Paperless and Obsidian for that; this is the index.

## Do

1. **Model**: an item with `status: 'reference'` is a reference entry; add
   `Item.reference?: { kind: 'note' | 'link' | 'file'; url?: string; body?: string }`.
   `note` = short text kept here; `link` = URL (http, `obsidian://`, `paperless` doc
   URL — any scheme, opened in a new tab); `file` = a path or name only, no upload.
   A reference entry may have `projectId` and `tags`; no context, priority, dates.
2. **Route `/reference`**: top bar with a search field (filters as you type over text,
   body, url, tags), a filter chip row for kind and for "with project / loose", and a
   list of two-line rows: text + `kind` tag; second line = host of the url, or first 80
   chars of the body, or the file name; project link at the right when set. `⏎` opens
   the link or expands the note in place; `e` edits inline; `⌫` trashes with undo;
   `p` assigns a project (same picker).
3. **Clarify**: "No → Reference" now asks one optional thing inline before filing:
   kind (default from the text: a URL → link, else note) and a project (picker,
   optional). Everything else stays as it was.
4. **Projects**: the Reference box in the detail lists the project's reference entries
   (was a placeholder), each as a row opening the link / note, with "+ reference" that
   creates a note attached to the project.
5. **Sidebar**: Reference gets its count and its own route; the Someday/Reference links
   that pointed at Projects are fixed.
6. **Someday ↔ Reference**: a someday item can be moved to reference and back from
   either screen ("→ Reference" / "→ Someday" in the row's ⋯ or via the palette).

## Don't

- No file upload, no preview, no full-text of linked documents, no tags editor beyond
  free text. If it starts to look like a notes app, stop.

## Definition of done

- Clarify "No → Reference" on the seed item "Warranty card for the printer" files a
  note under Home maintenance 2026; it appears in `/reference` and in the project's
  Reference box.
- A link entry `obsidian://open?vault=…` opens in a new tab; search finds it by host.
- Sidebar count for Reference is live; SPEC §2 and §3 updated; §8 drops "Reference
  screen".
