# LivingTheatre

Plot planning for novels, films and series. A BandLab-style matrix where every
scene is a column and every character, place or perspective is a track, plus a
bottom ruler that reads in *story* time rather than *presentation* time, so
non-linear structure is visible instead of hidden.

## Running it

Open `index.html` in a browser. There is no build step, no server and no
install — it works from a local file, offline.

```
xdg-open index.html        # or just double-click it
```

Chromium, Firefox and Safari are fine. No network calls are made: Vue and
SheetJS are vendored, the stylesheet is pre-generated, and the sample sheet is
embedded as a string.

## First run

1. **Projects → Load the Fabuła sample** loads the real crime-novel sheet the
   import format was designed for (23 scenes, 9 characters, 7 chapters), with
   no file picking.
2. **Import sheet** reads your own CSV, TSV, XLSX or ODS locally — you can also
   drag a file anywhere onto the window. Nothing is uploaded.
3. Or **New project** and build from scratch.

## The import format

One sheet, transposed: **each column is a scene**, and the first column is a
set of label rows. Both Polish and English labels are accepted.

| Label | Meaning |
| --- | --- |
| `Rozdział` / `Chapter` | chapter title, may be merged across columns |
| `Scena` / `Scene` | scene title |
| `Czas akcji` / `Story time` | position in the story's own timeline |
| `Miejsce` / `Place` | location |
| `Perspektywa` / `POV` | point of view, or `narrator` |
| anything else | a character; cells below it are their presence |

Details that matter in practice:

- **Sparse rows are forward-filled.** A place or POV written once in a merged
  cell applies to the following columns until it changes.
- **`x` means "present but idle"; prose means "present and acting on the story".**
  A blank cell means absent. The three states are what the colours encode.
- **`(Name)` marks someone mentioned but never on stage** — they get a track
  with no active presence, which is different from someone who is simply
  described. A comma in `Dom – kuchnia` splits place and room.
- **`[Title]` hides the scene.** Used for author-only events the reader never
  sees; they stay in the matrix and in analytics.
- **Labels are matched loosely**, so a typo like `Perspekrywa` still resolves.

## The interface

- **Zoom is continuous** — a slider, `ctrl+wheel` (anchored at the pointer),
  `+` / `-`, and `0` to reset. Columns scale from 18px (dots only) to 420px
  (full inline prose); cell text, note dots and truncation all follow.
- **One scroll container.** The scene headers stick to the top, the track
  labels stick to the left, and the ruler sticks to the bottom — no scroll
  sync, no drift.
- **Cells** — click selects, alt+click cycles presence
  (absent → idle → active), double-click writes what the character does
  (`ctrl+enter` or blur to commit, `esc` to cancel).
- **Reorder** by dragging a scene header; a drop line shows the landing gap.
- **Tracks** — one row per character, above them a `+ character` row to add
  more. Double-click a track name to rename, and hover a track for its colour
  and remove buttons. Characters are deliberately **not** duplicated in the
  sidebar; the matrix is where they live. The sidebar width is remembered
  between sessions.
- **Sidebar** — collapsible (the chevron at the left of the toolbar or
  `ctrl+B`) and resizable (drag its right edge, double-click to reset). It
  lists scenes and the report, and scrolls. The inspector on the right works
  the same way (its chevron or `ctrl+I`, drag its left edge to resize). Both
  widths are remembered between sessions. The toolbar's sun/moon icon
  switches between the dark and light themes.
- **Ruler** — three bands: *order* (presentation, aligned with the columns),
  *story* (connectors from each column to its position on the story-time axis),
  and *when* (the story-time axis itself, proportionally ticked at chapter
  boundaries and range ends). A connector that jumps backwards is a flashback;
  the dashed ones are exactly that.
- **Strips** — the perspective, place and story-time rows under the character
  tracks. Toggle them from the toolbar. A text filter dims non-matching cells.
- **Inspector** — two tabs, *Scene* and *Cell*, both always reachable: the
  scene tab holds title, story time, mode + anchor, chapter, perspective,
  place, hidden flag and summary; the cell tab holds presence, diegetic prose
  and author note.
- **Minimap** — under the matrix, with a window showing the visible span.
- **Report** — the sidebar flags characters active in two scenes that
  overlap in story time but sit in different places, and non-linear scenes
  with no anchor. Click an item to jump.
- Everything persists to `localStorage` as you type. Undo is `ctrl+Z`, redo
  `ctrl+shift+Z`, save `ctrl+S`, export JSON `ctrl+E`.

## Mouse & keyboard

| input | action |
| --- | --- |
| click cell / scene header | select |
| alt+click cell | cycle presence |
| double-click cell | edit what the character does |
| drag scene header | reorder the presentation |
| double-click track name | rename a character |
| ctrl+B | show / hide the sidebar |
| ctrl+I | show / hide the inspector |
| ctrl+wheel | zoom at the pointer |
| ← → | previous / next scene |
| ↑ ↓ | previous / next character |
| + / − | zoom in / out |
| 0 | reset zoom |
| ctrl+Z / ctrl+shift+Z | undo / redo |
| ctrl+S / ctrl+E | save / export JSON |
| esc | clear selection / close dialog |

## Project layout

```
index.html                classic script tags, on purpose: ES modules are
                          blocked over file://
css/main.css              Tailwind entry: theme bridge + sources
css/main.generated.css    generated output — the only stylesheet at runtime
css/tokens.css            design tokens, dark and light
css/app.css               the semantic layer: matrix, ruler, panels
js/model.js               schema, factories, validation, story-time parsing
js/store.js               reactive state, transactions, persistence, undo
js/importer.js            CSV/TSV/ODS/XLSX reading, label matching
js/analytics.js           contradictions, thread health, context packs
js/fixtures.js            the sample sheet, embedded as a string
js/demo.js                a miniature story exercising threads and flashbacks
js/components/            topbar, rail, matrix, ruler, inspector, minimap,
                          modals
tools/                    development harnesses (see below)
fixtures/                 the sample CSV on disk
```

## Styling

The page chrome is Tailwind; the matrix, ruler and track typography live in
`app.css` as semantic classes, because a dense sticky layout is not what
utilities are for. Theme colours are CSS variables in `tokens.css`, exposed to
Tailwind with `@theme inline`, so `bg-bg1` / `text-dim` / `bg-accent/20` all
follow the light/dark switch.

After changing classes in the templates, regenerate the stylesheet:

```
npx @tailwindcss/cli@4 -i css/main.css -o css/main.generated.css --minify
```

(`css/main.generated.css` is committed, so running the app never needs the
toolchain.)

## Development harnesses

`tools/` holds two checks that need Node but no browser setup beyond the
packages they name. Both exit non-zero on failure.

```
node tools/test-boot.mjs       # jsdom: boots the real app, drives the store,
                               # clicks, drags, keyboard — 93 assertions
node tools/test-browser.mjs    # headless Chromium: real layout, sticky
                               # headers, zoom, reload, screenshots
```

They resolve their dependencies from a local `node_modules` (run
`npm install jsdom playwright-core` inside the project, or point `LT_TOOLS` at
a directory that has them).

## Data format

One JSON document, normalised, with referential integrity enforced on import:

```
meta, entities: { characters, places, threads }, chapters, scenes,
cells:       { sceneId, entityId, presence, text, note }
threadCells: { sceneId, threadId, kind, text }
links:       { type: setup|payoff|cause|effect|reference, fromSceneId, toSceneId }
```

`model.normalize()` fills missing fields, sorts orderings and drops dangling
references, so a hand-edited or externally generated file cannot break the app.
Django will serve the same shape later.

## Known limits

- **Story-time granularity.** Compound stamps (`1.10`, `2.3`) are ordered as
  chapter-then-beat, and the ruler maps them proportionally. Chapter 1's twelve
  beats therefore share a sliver of the axis next to chapter 2 — the connectors
  keep it readable, but a real calendar (days, hours, custom fantasy scales)
  is the next step. `model.parseStoryTime` is the single seam for that.
- **No threads in the UI yet.** The data model, the demo project and
  `analytics.deadThreads` all support setup/advance/payoff/resolve threads;
  rendering them as tracks comes next.
- **No assistant yet.** `analytics.contextForScene()` assembles the retrieval
  pack (present characters with notes, recent and upcoming scenes, open
  threads, unpaid setups) — that is the payload the LLM seam will consume.
- Very large projects (200+ scenes) render every cell; windowing is the
  planned answer if you get there.
