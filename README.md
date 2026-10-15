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
- **A sheet with no chapter row leaves its scenes ungrouped** — no chapter is
  invented for you. A row that *is* present but blank at the start is an
  untitled span and is kept.
- **`x` means "present but idle"; prose means "present and acting on the story".**
  A blank cell means absent. The three states are what the colours encode.
- **`(Name)` marks someone mentioned but never on stage** — they get a track
  with no active presence, which is different from someone who is simply
  described. A comma in `Dom – kuchnia` splits place and room.
- **`[Title]` hides the scene.** Used for author-only events the reader never
  sees; they stay in the matrix and in analytics. The marker sits on the
  *Scenes* row only: the column header is hatched with its title dimmed and
  italic, and an outlined `H` badge — deliberately not the flat fill used for
  "present, idle", because hidden is a different kind of absence. In the
  ruler, a hidden scene's tick number is struck through and its story-time
  marker is hollow. Body cells keep their clean presence colouring. Set or
  clear the flag from the inspector's *hidden event* checkbox.
- **Labels are matched loosely**, so a typo like `Perspekrywa` still resolves.

## The interface

- **Zoom is continuous** — a slider, `ctrl+wheel` (anchored at the pointer),
  `+` / `-`, and `0` to reset. Columns scale from 18px (dots only) to 420px
  (full inline prose); cell text, note dots and truncation all follow.
- **One scroll container.** The scene headers stick to the top (below the
  chapter band), the track labels stick to the left, and the ruler sticks to
  the bottom — no scroll sync, no drift.
- **Cells** — click selects, alt+click cycles presence
  (absent → idle → active), double-click writes what the character does
  (`ctrl+enter` or blur to commit, `esc` to cancel).
- **Reorder** by dragging a scene header; a drop line shows the landing gap.
- **Tracks** — one row per character, above them a `+ character` row to add
  more. **Click a track to open that character's options** in the inspector;
  double-click a track name to rename it inline. Adding a character opens
  their Character tab straight away. Colour, deletion and every other
  characteristic live in that tab — the row itself shows only the swatch,
  the name and the active-count badge. Characters are deliberately **not**
  duplicated in the sidebar; the matrix is where they live. The sidebar
  width is remembered between sessions.
- **Character options** — the inspector's *Character* tab holds the
  dramaturgy card: name, role, status (active / mentioned-offstage), colour
  from the palette, **summary, want, fear/flaw, arc, voice, secrets,
  notes**, and a delete button. A read-only strip above the fields shows the
  character's presence statistics — scenes, active/idle counts, first and
  last appearance, and a *dormant* warning when they have not appeared in a
  long time. All of it feeds `analytics.contextForScene()`, the retrieval
  pack the assistant will use later.
- **Sidebar** — collapsible (the chevron at the left of the toolbar or
  `ctrl+B`) and resizable (drag its right edge, double-click to reset). It
  lists the structure of the work and the report, and scrolls. The inspector
  on the right works the same way (its chevron or `ctrl+I`, drag its left edge
  to resize). Both widths are remembered between sessions. The toolbar's
  sun/moon icon switches between the dark and light themes.
- **Chapters are the unit above a scene**, and the name is the work's
  business: `meta.unitLabel` holds the word (*Chapter*, *Act*, *Part*,
  *Book*, *Episode*), editable in the inspector's chapter tab. Every heading,
  the sidebar, the matrix band and the auto-titled units follow it. `+` in the
  sidebar head adds one; the chapter's `‹ ›` move its whole block of scenes;
  deleting one keeps its scenes, ungrouped, under *No chapter*. A chapter's
  number is simply where its scenes first appear in the presentation, so
  dragging scenes around can never desynchronise the two.
- **The chapter band** above the column headers shows one block per
  uninterrupted run of a chapter — its title, its scene count, click to open
  the chapter. It sticks to the top while the columns scroll past.
- **Dragging a scene header** reorders the presentation; dropping it onto
  another chapter's run moves the scene into that chapter, so the groups stay
  contiguous.
- **Inspector** — four tabs, all always reachable: the scene tab holds title,
  story time, mode + anchor, chapter, perspective, place, hidden flag and
  summary; the chapter tab holds the unit's title, summary, position and
  scenes, plus the unit-name field for the whole work; the character tab holds
  the dramaturgy card; and the cell tab holds presence, diegetic prose and
  author note.
- **Ruler** — three bands: *order* (presentation, aligned with the columns),
  *story* (connectors from each column to its position on the story-time axis),
  and *when* (the story-time axis itself, proportionally ticked at chapter
  boundaries and range ends). A connector that jumps backwards is a flashback;
  the dashed ones are exactly that.
- **Strips first** — perspective, place and story time sit directly under
  the scene headers, above the character tracks. Double-click a strip cell
  to edit it in place: perspective opens a picker of characters plus
  *narrator*, place and story time are text fields. They are scene
  attributes, so committing one patches the scene — the same as the
  inspector's Scene tab.
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
| double-click strip cell | edit perspective / place / story time |
| drag scene header | reorder the presentation, or move it into another chapter |
| click a chapter row or a band block | select the chapter |
| double-click a chapter name | rename it |
| click a chapter's twisty | collapse / expand its scenes |
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
                               # clicks, drags, keyboard — 252 assertions
node tools/test-browser.mjs    # headless Chromium: real layout, sticky
                               # headers, chapter band, zoom, reload, screenshots
```

They resolve their dependencies from a local `node_modules` (run
`npm install jsdom playwright-core` inside the project, or point `LT_TOOLS` at
a directory that has them). `test-browser.mjs` uses the Chromium that ships
with Playwright, or the one named by `LT_CHROMIUM`
(`LT_CHROMIUM=/usr/bin/google-chrome`).

## Data format

One JSON document, normalised, with referential integrity enforced on import:

```
meta, entities: { characters, places, threads }, chapters, scenes,
cells:       { sceneId, entityId, presence, text, note }
threadCells: { sceneId, threadId, kind, text }
links:       { type: setup|payoff|cause|effect|reference, fromSceneId, toSceneId }
```

A character carries: `name, color, summary, role, status
(active|mentioned), want, fear, arc, voice, secrets, notes` — the card the
inspector's Character tab edits, and the card `contextForScene()` sends to
the assistant. (The unused `arcs: []` array from the first draft was
replaced by `arc`; `normalize()` flattens old files on load.)

A chapter carries: `id, title, order, summary`, and belongs to the work rather
than to a scene: `meta.unitLabel` is the word for it, default `Chapter`. A
scene's `chapterId` may be `null`, which means "ungrouped" — a state the
interface shows rather than repairs, because a sheet that says nothing about
chapters should not be second-guessed. `model.chapterSequence()` orders
chapters by where their scenes first appear; `normalize()` rewrites `order`
from it and clears a `chapterId` whose chapter no longer exists, so the two
orderings can never drift apart.

`model.normalize()` fills missing fields, sorts orderings and drops dangling
references, so a hand-edited or externally generated file cannot break the app.
Django will serve the same shape later.

## Known limits

- **One level of units.** Chapters group scenes; there is no *Book → Chapter*
  nesting, and one work has one unit term. `parentId` and a second label are
  the natural extension.
- **A chapter with no scenes has no position.** It sorts after the ones that
  own scenes, and its `‹ ›` stay disabled until it has scenes to move.

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
