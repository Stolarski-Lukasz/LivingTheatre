/* LivingTheatre — browser verification.
   Opens the app in headless Chromium, loads the sample sheet through the UI,
   exercises scroll/zoom/drag, checks layout invariants that need real layout
   (sticky headers, ruler position, alignment), and writes screenshots.
   Run: node tools/test-browser.mjs                                          */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  ({ chromium } = require(path.join(process.env.LT_TOOLS || '/tmp/opencode/twtool', 'node_modules', 'playwright-core')));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'tools', 'shots');
fs.mkdirSync(shots, { recursive: true });

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

/* A system Chromium can be used by pointing LT_CHROMIUM at it, e.g.
   LT_CHROMIUM=/usr/bin/google-chrome */
const browser = await chromium.launch(
  process.env.LT_CHROMIUM ? { executablePath: process.env.LT_CHROMIUM } : {}
);
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(m.type() + ': ' + m.text());
});
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForSelector('.shell', { timeout: 5000 });

console.log('\n== load sample through the UI ==');
await page.click('.topbar .btn:has-text("Projects")');
await page.waitForSelector('.modal-backdrop');
await page.click('.modal-backdrop .drop-zone.ghost');
await page.waitForTimeout(300);

const stats = await page.evaluate(() => ({
  scenes: window.LT.store.state.project.scenes.length,
  chars: window.LT.store.state.project.entities.characters.length,
  colheads: document.querySelectorAll('.m-colhead').length,
  rows: document.querySelectorAll('.m-rowhead').length,
  activeCells: document.querySelectorAll('.m-cell.p-active').length,
  title: window.LT.store.state.project.meta.title
}));
check('sample imported via modal', stats.scenes === 23, JSON.stringify(stats));
check('column headers rendered', stats.colheads === 23);
check('character rows rendered', stats.rows === 13, 'rows=' + stats.rows);
check('presence cells colored', stats.activeCells > 20, 'active=' + stats.activeCells);

await page.screenshot({ path: path.join(shots, '01-loaded.png') });

console.log('\n== layout invariants ==');
const layout = await page.evaluate(() => {
  const stage = document.querySelector('.scroll-stage');
  const corner = document.querySelector('.m-corner');
  const head = document.querySelector('.m-colhead');
  const rowhead = document.querySelector('.m-rowhead');
  const ruler = document.querySelector('.ruler');
  const canvas = document.querySelector('.m-canvas');
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom }; };
  return {
    stage: r(stage), corner: r(corner), head: r(head), rowhead: r(rowhead),
    ruler: r(ruler), canvasW: canvas.getBoundingClientRect().width,
    canvasH: canvas.getBoundingClientRect().height,
    stageH: stage.clientHeight, stageW: stage.clientWidth,
    scrollW: stage.scrollWidth, scrollH: stage.scrollHeight,
    railVar: getComputedStyle(document.documentElement).getPropertyValue('--rail-w').trim()
  };
});
check('canvas wider than stage (h-scroll)', layout.scrollW > layout.stageW, layout.scrollW + ' vs ' + layout.stageW);
check('canvas fills stage at least', layout.scrollH >= layout.stageH, layout.scrollH + ' vs ' + layout.stageH);
check('corner is rail-wide', Math.abs(layout.corner.w - 232) < 2, 'w=' + layout.corner.w);
check('colhead width = zoom (56)', Math.abs(layout.head.w - 56) < 2, 'w=' + layout.head.w);
check('rowhead width = rail', Math.abs(layout.rowhead.w - 232) < 2, 'w=' + layout.rowhead.w);
check('ruler at stage bottom', Math.abs(layout.ruler.bottom - layout.stage.bottom) < 2,
  'ruler.bottom=' + Math.round(layout.ruler.bottom) + ' stage.bottom=' + Math.round(layout.stage.bottom));
check('ruler spans canvas width', Math.abs(layout.ruler.w - layout.canvasW) < 2,
  'ruler=' + Math.round(layout.ruler.w) + ' canvas=' + Math.round(layout.canvasW));
check('rowheads vertically aligned with canvas rows', layout.rowhead.y > layout.head.bottom - 1);

console.log('\n== scroll behaviour ==');
const scrolled = await page.evaluate(async () => {
  const stage = document.querySelector('.scroll-stage');
  stage.scrollLeft = 600;
  stage.scrollTop = 200;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const corner = document.querySelector('.m-corner').getBoundingClientRect();
  const head = document.querySelector('.m-colhead').getBoundingClientRect();
  const rowhead = document.querySelector('.m-rowhead').getBoundingClientRect();
  const ruler = document.querySelector('.ruler').getBoundingClientRect();
  const stageR = stage.getBoundingClientRect();
  const tick = document.querySelector('.ruler-scene').getBoundingClientRect();
  return {
    cornerLeft: corner.x, stageLeft: stageR.x,
    headTop: head.y, stageTop: stageR.y,
    rowheadLeft: rowhead.x,
    rulerBottom: ruler.bottom, stageBottom: stageR.bottom,
    tickLeft: tick.x, scrollLeft: stage.scrollLeft,
    viewport: window.LT.store.state.zoom
  };
});
check('corner stays pinned left while scrolling right', Math.abs(scrolled.cornerLeft - scrolled.stageLeft) < 2,
  'corner=' + Math.round(scrolled.cornerLeft) + ' stage=' + Math.round(scrolled.stageLeft));
check('rowhead stays pinned left', Math.abs(scrolled.rowheadLeft - scrolled.stageLeft) < 2);
check('colhead stays pinned below the chapter band',
  Math.abs(scrolled.headTop - scrolled.stageTop - 22) < 2,
  'head=' + Math.round(scrolled.headTop) + ' stage=' + Math.round(scrolled.stageTop));
check('ruler stays pinned bottom', Math.abs(scrolled.rulerBottom - scrolled.stageBottom) < 2,
  'ruler=' + Math.round(scrolled.rulerBottom) + ' stage=' + Math.round(scrolled.stageBottom));
check('ruler ticks moved with content', scrolled.scrollLeft === 600);

await page.screenshot({ path: path.join(shots, '02-scrolled.png') });

console.log('\n== zoom ==');
const zoomed = await page.evaluate(async () => {
  const before = window.LT.store.state.zoom;
  window.LT.store.actions.setZoom(180);
  await new Promise((r) => setTimeout(r, 100));
  const head = document.querySelector('.m-colhead').getBoundingClientRect();
  const cell = document.querySelector('.m-cell');
  const cellText = document.querySelector('.cell-text');
  return {
    before,
    after: window.LT.store.state.zoom,
    headW: head.width,
    hasCellText: !!cellText,
    cellTextShown: cellText ? cellText.getBoundingClientRect().height > 0 : false
  };
});
check('zoom changes column width', Math.abs(zoomed.headW - 180) < 2, 'headW=' + zoomed.headW);
check('text appears at high zoom', zoomed.cellTextShown === true);

await page.screenshot({ path: path.join(shots, '03-zoom-text.png') });

window_done: {
  const zoomedOut = await page.evaluate(async () => {
    window.LT.store.actions.setZoom(20);
    await new Promise((r) => setTimeout(r, 100));
    const hasText = !!document.querySelector('.cell-text');
    const cell = document.querySelector('.m-cell').getBoundingClientRect();
    return { hasText, cellW: cell.width };
  });
  check('text hidden when zoomed out', zoomedOut.hasText === false);
  check('narrow columns when zoomed out', Math.abs(zoomedOut.cellW - 20) < 2);
  await page.screenshot({ path: path.join(shots, '04-zoom-out.png') });
}

console.log('\n== interactions in browser ==');
await page.evaluate(() => window.LT.store.actions.setZoom(56));
await page.waitForTimeout(100);

const clicked = await page.evaluate(async () => {
  const charRows = [...document.querySelectorAll('.m-row')].filter((r) => r.querySelector('.m-cell'));
  const cell = charRows[0].querySelectorAll('.m-cell')[2];
  cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  const sel = window.LT.store.state.selection;
  const selectedEl = document.querySelector('.m-cell.selected');
  return { hasScene: !!sel.sceneId, hasEntity: !!sel.entityId, selectedRendered: !!selectedEl };
});
check('click selects', clicked.hasScene && clicked.hasEntity && clicked.selectedRendered);

const alted = await page.evaluate(async () => {
  const s = window.LT.store.state;
  const cr = [...document.querySelectorAll('.m-row')].filter((r) => r.querySelector('.m-cell'));
  const cell = cr[0].querySelectorAll('.m-cell')[5];
  const sceneId = s.project.scenes[5].id;
  const entityId = s.project.entities.characters[0].id;
  const before = window.LT.store.actions.getCell(sceneId, entityId);
  cell.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));
  await new Promise((r) => setTimeout(r, 50));
  const after = window.LT.store.actions.getCell(sceneId, entityId);
  return { before: before && before.presence, after: after && after.presence };
});
check('alt+click cycles presence', alted.before !== alted.after,
  before => before + ' -> ' + after);

const dbl = await page.evaluate(async () => {
  const s = window.LT.store.state;
  const cr6 = [...document.querySelectorAll('.m-row')].filter((r) => r.querySelector('.m-cell'));
  const cell = cr6[0].querySelectorAll('.m-cell')[6];
  cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 80));
  const ed = document.querySelector('.cell-input');
  if (!ed) return { opened: false };
  ed.value = 'browser test beat';
  ed.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  ed.dispatchEvent(new Event('blur'));
  await new Promise((r) => setTimeout(r, 80));
  const c = window.LT.store.actions.getCell(s.project.scenes[6].id, s.project.entities.characters[0].id);
  return { opened: true, committed: !!(c && c.text === 'browser test beat'), closed: !document.querySelector('.cell-input') };
});
check('dblclick edit commits', dbl.opened && dbl.committed && dbl.closed);

const dragged = await page.evaluate(async () => {
  const heads = document.querySelectorAll('.m-colhead');
  const before = window.LT.store.state.project.scenes.map((s) => s.id).join(',');
  heads[5].dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true, clientX: 400, pointerId: 7 }));
  window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 400 }));
  window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 700 }));
  await new Promise((r) => setTimeout(r, 50));
  const dropLine = !!document.querySelector('.m-dropline');
  window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 80));
  const after = window.LT.store.state.project.scenes.map((s) => s.id).join(',');
  return { dropLine, moved: before !== after, ordersOk: window.LT.store.state.project.scenes.every((s, i) => s.order === i) };
});
check('drag reorders', dragged.dropLine && dragged.moved && dragged.ordersOk);

await page.screenshot({ path: path.join(shots, '05-after-drag.png') });

console.log('\n== ruler contents ==');
const rulerInfo = await page.evaluate(() => {
  const ticks = document.querySelectorAll('.ruler-axistick').length;
  const scenes = document.querySelectorAll('.ruler-scene').length;
  const circles = document.querySelectorAll('.ruler-svg circle').length;
  const labels = [...document.querySelectorAll('.ruler-axistick span')].map((s) => s.textContent);
  const connectors = document.querySelectorAll('.ruler-svg line').length;
  const back = document.querySelectorAll('.ruler-svg line.back').length;
  return { ticks, scenes, circles, labels, connectors, back };
});
check('axis ticks present', rulerInfo.ticks >= 3, JSON.stringify(rulerInfo.labels));
check('presentation ticks = scenes', rulerInfo.scenes === 23);
check('story markers drawn', rulerInfo.circles === 23, 'circles=' + rulerInfo.circles);
check('connectors drawn', rulerInfo.connectors === 23);
console.log('    axis labels: ' + rulerInfo.labels.join(' | '));

console.log('\n== inspector tabs both reachable ==');
const tabs = await page.evaluate(async () => {
  const btns = [...document.querySelectorAll('.insp-tabs button')];
  btns[0].click();
  await new Promise((r) => setTimeout(r, 60));
  const sceneFields = document.querySelectorAll('.insp-section .insp-input').length;
  btns[3].click();
  await new Promise((r) => setTimeout(r, 60));
  const picker = !!document.querySelector('.presence-picker');
  btns[0].click();
  await new Promise((r) => setTimeout(r, 60));
  const sceneAgain = document.querySelectorAll('.insp-section .insp-input').length;
  return { sceneFields, picker, sceneAgain };
});
check('scene tab fields render', tabs.sceneFields > 3, 'fields=' + tabs.sceneFields);
check('cell tab picker renders', tabs.picker);
check('scene tab still reachable after cell', tabs.sceneAgain > 3);

console.log('\n== minimap ==');
const mm = await page.evaluate(async () => {
  const ticks = document.querySelectorAll('.mm-tick').length;
  const win = document.querySelector('.mm-window');
  const before = win.style.left + '/' + win.style.width;
  document.querySelector('.scroll-stage').scrollLeft = 400;
  await new Promise((r) => setTimeout(r, 120));
  const after = document.querySelector('.mm-window').style.left + '/' + document.querySelector('.mm-window').style.width;
  return { ticks, before, after };
});
check('minimap ticks', mm.ticks === 23);
check('minimap viewport window tracks scroll', mm.before !== mm.after, mm.before + ' -> ' + mm.after);

console.log('\n== rail collapse & resize ==');
const railBefore = await page.evaluate(() => ({
  rail: !!document.querySelector('.rail-wrap'),
  railW: document.querySelector('.rail').getBoundingClientRect().width,
  stageW: document.querySelector('.stage').getBoundingClientRect().width,
  sceneRows: document.querySelectorAll('.rail .scene-no').length,
  chapterRows: document.querySelectorAll('.rail .chapter-row').length,
  subRows: document.querySelectorAll('.rail .sub-row').length,
  hasCharSection: [...document.querySelectorAll('.rail-head')].some((h) => /characters/i.test(h.textContent)),
  chapter: window.LT.store.state.project.chapters.length,
  addRow: !!document.querySelector('.m-rowhead.add-rowhead'),
  charRowheads: document.querySelectorAll('.m-rowhead:not(.stripe):not(.add-rowhead):not(.special)').length
}));
check('rail shows scenes only', railBefore.rail && railBefore.sceneRows === 23 && !railBefore.hasCharSection,
  JSON.stringify(railBefore));
check('rail groups scenes under chapters', railBefore.chapterRows === railBefore.chapter &&
  railBefore.subRows === 23, JSON.stringify(railBefore));
check('add-character row in matrix', railBefore.addRow);
check('character rows in matrix', railBefore.charRowheads === 9, 'rows=' + railBefore.charRowheads);

await page.click('.topbar [aria-label="Toggle sidebar"]');
await page.waitForTimeout(150);
const collapsed = await page.evaluate(() => ({
  rail: !!document.querySelector('.rail-wrap'),
  stageW: document.querySelector('.stage').getBoundingClientRect().width
}));
check('toggle collapses rail', !collapsed.rail);
check('stage widens when rail collapses', collapsed.stageW > railBefore.stageW + 180,
  railBefore.stageW + ' -> ' + collapsed.stageW);
await page.screenshot({ path: path.join(shots, '10-rail-collapsed.png') });

await page.click('.topbar [aria-label="Toggle sidebar"]');
await page.waitForTimeout(150);
const reopened = await page.evaluate(() => !!document.querySelector('.rail-wrap'));
check('toggle re-opens rail', reopened);

const handle = await page.$('.rail-resizer');
const hb = await handle.boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + 300);
await page.mouse.down();
await page.mouse.move(420, hb.y + 300, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(150);
const resized = await page.evaluate(() => ({
  railW: window.LT.store.state.railW,
  railPx: document.querySelector('.rail').getBoundingClientRect().width
}));
check('drag resizes rail', Math.abs(resized.railW - 420) < 8 && Math.abs(resized.railPx - 420) < 8,
  JSON.stringify(resized));
await page.screenshot({ path: path.join(shots, '11-rail-resized.png') });

console.log('\n== chapters as units ==');
const chapterBand = await page.evaluate(async () => {
  const st = window.LT.store.state;
  const stage = document.querySelector('.scroll-stage');
  stage.scrollLeft = 0;
  stage.scrollTop = 0;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const blocks = [...document.querySelectorAll('.m-chapterblock')];
  const band = document.querySelector('.m-chapterrow');
  return {
    chapters: st.project.chapters.length,
    blocks: blocks.length,
    bandTop: Math.round(band.getBoundingClientRect().top),
    bandLeft: Math.round(band.getBoundingClientRect().left),
    headLeft: Math.round(document.querySelector('.m-bandhead').getBoundingClientRect().left),
    firstBlockLeft: Math.round(blocks[0].getBoundingClientRect().left),
    widths: blocks.map((b) => Math.round(b.getBoundingClientRect().width)),
    titles: blocks.map((b) => b.textContent.trim()),
    canvasWidth: Math.round(document.querySelector('.m-canvas').getBoundingClientRect().width),
    railW: Math.round(document.querySelector('.m-bandhead').getBoundingClientRect().width)
  };
});
check('one band block per chapter', chapterBand.blocks === chapterBand.chapters,
  chapterBand.blocks + ' of ' + chapterBand.chapters);
check('band blocks tile the canvas',
  chapterBand.widths.reduce((a, b) => a + b, 0) === 23 * 56,
  JSON.stringify(chapterBand.widths));
check('band blocks start after the corner',
  chapterBand.firstBlockLeft === chapterBand.headLeft + chapterBand.railW,
  'block=' + chapterBand.firstBlockLeft + ' corner=' + chapterBand.headLeft + '+' + chapterBand.railW);
check('band labels carry titles', chapterBand.titles.join(' ').length > 20,
  chapterBand.titles.join(' | '));
await page.screenshot({ path: path.join(shots, '12-chapter-band.png') });

const bandSticks = await page.evaluate(async () => {
  const stage = document.querySelector('.scroll-stage');
  stage.scrollTop = 120;
  await new Promise((r) => setTimeout(r, 120));
  const band = document.querySelector('.m-chapterrow').getBoundingClientRect();
  const head = document.querySelector('.m-headrow').getBoundingClientRect();
  const corner = document.querySelector('.m-bandhead').getBoundingClientRect();
  return {
    bandTop: Math.round(band.top),
    headTop: Math.round(head.top),
    cornerLeft: Math.round(corner.left),
    railLeft: Math.round(document.querySelector('.rail-wrap').getBoundingClientRect().right)
  };
});
check('band sticks above the headers', bandSticks.bandTop <= bandSticks.headTop,
  JSON.stringify(bandSticks));
check('band corner stays put while scrolling', Math.abs(bandSticks.cornerLeft - bandSticks.railLeft) < 2,
  JSON.stringify(bandSticks));
await page.screenshot({ path: path.join(shots, '13-band-sticky.png') });

const chapterTabInBrowser = await page.evaluate(async () => {
  const s = window.LT.store.state;
  s.selection = { sceneId: null, entityId: null, chapterId: s.project.chapters[1].id, kind: 'chapter' };
  await new Promise((r) => setTimeout(r, 150));
  const btns = [...document.querySelectorAll('.insp-tabs button')];
  const on = btns.find((b) => b.classList.contains('on'));
  const sec = document.querySelector('.insp-section');
  return {
    tab: on && on.textContent.trim(),
    meta: sec && sec.textContent.replace(/\s+/g, ' ').trim().slice(0, 60),
    hasAdd: !!sec && [...sec.querySelectorAll('.btn')].some((b) => /new scene here/.test(b.textContent)),
    unitField: sec && [...sec.querySelectorAll('.insp-input')].some((el) =>
      /Chapter, Act, Part/.test(el.getAttribute('title') || ''))
  };
});
check('chapter tab opens from the store', chapterTabInBrowser.tab === 'Chapter',
  JSON.stringify(chapterTabInBrowser));
check('chapter tab shows its scene count', /scenes/.test(chapterTabInBrowser.meta), chapterTabInBrowser.meta);
check('chapter tab offers a new scene', chapterTabInBrowser.hasAdd);
check('chapter tab holds the unit-name field', chapterTabInBrowser.unitField);

const railChapterClick = await page.evaluate(async () => {
  const s = window.LT.store.state;
  s.selection = { sceneId: null, entityId: null, chapterId: null, kind: null };
  await new Promise((r) => setTimeout(r, 120));
  const rows = [...document.querySelectorAll('.rail .chapter-row')];
  rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 150));
  return {
    rows: rows.length,
    kind: s.selection.kind,
    chapterId: s.selection.chapterId,
    expected: s.project.chapters[1].id,
    selectedRow: !!document.querySelector('.rail .chapter-row.selected')
  };
});
check('rail chapter row selects it', railChapterClick.kind === 'chapter' &&
  railChapterClick.chapterId === railChapterClick.expected && railChapterClick.selectedRow,
  JSON.stringify(railChapterClick));

const unitRename = await page.evaluate(async () => {
  const s = window.LT.store.state;
  window.LT.store.actions.setUnitLabel('Part');
  await new Promise((r) => setTimeout(r, 120));
  const blocks = [...document.querySelectorAll('.m-chapterblock')];
  const head = document.querySelector('.m-bandhead').textContent.trim();
  window.LT.store.actions.setUnitLabel('Chapter');
  await new Promise((r) => setTimeout(r, 120));
  return { label: s.project.meta.unitLabel, headLabel: head, blocks: blocks.length };
});
check('renaming the unit relabels the interface', /^Part/.test(unitRename.headLabel),
  JSON.stringify(unitRename));
check('renaming the unit renumbers chapters',
  unitRename.label === 'Part' || unitRename.label === 'Chapter');
await page.screenshot({ path: path.join(shots, '14-chapter-tab.png') });

const noHoverTools = await page.evaluate(() => ({
  tools: document.querySelectorAll('.rh-tools').length,
  opts: document.querySelectorAll('.rh-opts').length
}));
check('rowheads carry no hover tools', noHoverTools.tools === 0 && noHoverTools.opts === 0,
  JSON.stringify(noHoverTools));

console.log('\n== inspector resize ==');
const inspBefore = await page.evaluate(() => ({
  wrap: !!document.querySelector('.inspector-wrap'),
  resizer: !!document.querySelector('.inspector-resizer'),
  w: document.querySelector('.inspector').getBoundingClientRect().width,
  stageW: document.querySelector('.stage').getBoundingClientRect().width
}));
check('inspector wrap + resizer present', inspBefore.wrap && inspBefore.resizer);
check('inspector default width', Math.abs(inspBefore.w - 344) < 2, 'w=' + inspBefore.w);

const ih = await page.$('.inspector-resizer');
const ib = await ih.boundingBox();
await page.mouse.move(ib.x + ib.width / 2, ib.y + 400);
await page.mouse.down();
await page.mouse.move(ib.x - 160, ib.y + 400, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(150);
const inspResized = await page.evaluate(() => ({
  w: window.LT.store.state.inspectorW,
  px: document.querySelector('.inspector').getBoundingClientRect().width,
  stageW: document.querySelector('.stage').getBoundingClientRect().width
}));
check('drag resizes inspector', Math.abs(inspResized.w - 504) < 8 && Math.abs(inspResized.px - 504) < 8,
  JSON.stringify(inspResized));
check('stage shrinks when inspector grows', inspResized.stageW < inspBefore.stageW - 150,
  inspBefore.stageW + ' -> ' + inspResized.stageW);
await page.screenshot({ path: path.join(shots, '13-inspector-resized.png') });

await page.keyboard.press('Control+i');
await page.waitForTimeout(150);
const inspHidden = await page.evaluate(() => ({
  wrap: !!document.querySelector('.inspector-wrap'),
  cols: document.querySelector('.shell').style.gridTemplateColumns
}));
check('ctrl+I hides inspector', !inspHidden.wrap && inspHidden.cols.endsWith('0px'), inspHidden.cols);
await page.keyboard.press('Control+i');
await page.waitForTimeout(150);
check('ctrl+I shows inspector', await page.evaluate(() => !!document.querySelector('.inspector-wrap')));

await page.evaluate(() => window.LT.store.actions.setInspectorWidth(344));
await page.waitForTimeout(100);
const uiSaved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('livingtheatre.ui.v1') || '{}'));
check('inspector width persisted', uiSaved.inspectorW === 344, JSON.stringify(uiSaved));

console.log('\n== hidden event columns ==');
const hid = await page.evaluate(() => {
  const scene = window.LT.store.state.project.scenes.find((x) => x.hidden);
  if (!scene) return { found: false };
  const idx = scene.order;
  const head = document.querySelectorAll('.m-colhead')[idx];
  const rows = [...document.querySelectorAll('.m-row')].filter((r) => r.querySelector('.m-cell'));
  const hiddenCells = rows.map((r) => r.querySelectorAll('.m-cell')[idx]);
  const filled = hiddenCells.find((c) => window.getComputedStyle(c).backgroundColor !== 'rgba(0, 0, 0, 0)');
  const cell = hiddenCells[0];
  const headHatch = window.getComputedStyle(head).backgroundImage;
  const cellHatch = window.getComputedStyle(cell, '::after').backgroundImage;
  const normalCell = rows[0].querySelectorAll('.m-cell')[0];
  const normalHatch = window.getComputedStyle(normalCell, '::after').backgroundImage;
  const tick = document.querySelectorAll('.ruler-scene')[idx];
  const tickDecor = window.getComputedStyle(tick.querySelector('span')).textDecorationLine;
  const hollow = [...document.querySelectorAll('.ruler-svg circle')].some((c) => c.classList.contains('hidden'));
  return {
    found: true,
    headClass: head.classList.contains('hiddencol'),
    cellClass: cell.classList.contains('hiddencol'),
    headHatch, cellHatch,
    filledFill: filled ? window.getComputedStyle(filled).backgroundColor : null,
    filledHatch: filled ? window.getComputedStyle(filled, '::after').backgroundImage : null,
    normalHatch: normalHatch,
    hollow,
    tickHidden: tick.classList.contains('hidden'),
    tickDecor
  };
});
check('fixture has a hidden scene', hid.found);
check('marker on the Scenes row only', hid.headClass && !hid.cellClass,
  'head=' + hid.headClass + ' cell=' + hid.cellClass);
check('header hatched', /repeating-linear-gradient/.test(hid.headHatch), hid.headHatch);
check('body cells carry no hatch', hid.cellHatch === 'none', hid.cellHatch);
check('normal cells not hatched', hid.normalHatch === 'none', hid.normalHatch);
check('presence fill survives in hidden column', !!hid.filledFill && hid.filledHatch === 'none',
  hid.filledFill + ' / ' + hid.filledHatch);
check('ruler tick struck through', hid.tickHidden && /line-through/.test(hid.tickDecor), hid.tickDecor);
check('story marker hollowed', hid.hollow);
await page.screenshot({ path: path.join(shots, '20-hidden-column.png') });

console.log('\n== character options tab ==');
  const charTab = await page.evaluate(async () => {
  const s = window.LT.store.state;
  const target = s.project.entities.characters[1];
  s.selection = { sceneId: null, entityId: target.id, kind: 'character' };
  await new Promise((r) => setTimeout(r, 120));
  const btns = [...document.querySelectorAll('.insp-tabs button')];
  const onIdx = btns.findIndex((b) => b.classList.contains('on'));
  const stats = document.querySelector('.char-stats');
  const areas = document.querySelectorAll('.insp-area');
  const swatches = document.querySelectorAll('.swatch-btn');
  const optBtnCount = document.querySelectorAll('.rh-opts').length;
  const nameInput = document.querySelector('.insp-section .insp-input');
  return {
    tabOn: btns[onIdx] && btns[onIdx].textContent.trim(),
    tabCount: btns.length,
    stats: !!stats && /scenes/.test(stats.textContent),
    fields: areas.length,
    swatches: swatches.length,
    optBtnCount: optBtnCount,
    wantPrefill: areas[1] ? areas[1].value : null,
    nameValue: nameInput ? nameInput.value : null,
    expectedName: target.name
  };
});
check('character tab opens without a scene', charTab.tabOn === 'Character', charTab.tabOn);
check('three tabs plus the unit tab and close', charTab.tabCount === 5, 'n=' + charTab.tabCount);
check('stats strip rendered', charTab.stats);
check('seven text fields', charTab.fields === 7, 'n=' + charTab.fields);
check('palette rendered', charTab.swatches === 12, 'n=' + charTab.swatches);
check('no options button on tracks', charTab.optBtnCount === 0, 'n=' + charTab.optBtnCount);
check('name prefilled from data', charTab.nameValue === charTab.expectedName,
  charTab.nameValue + ' vs ' + charTab.expectedName);

const charEdit = await page.evaluate(async () => {
  const s = window.LT.store.state;
  const areas = document.querySelectorAll('.insp-area');
  areas[1].value = 'browser-set want';
  areas[1].dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 100));
  return s.project.entities.characters[1].want;
});
check('character field commits in browser', charEdit === 'browser-set want', charEdit);

const trackClick = await page.evaluate(async () => {
  const s = window.LT.store.state;
  const rh = [...document.querySelectorAll('.m-rowhead')].find((el) =>
    el.querySelector('.rh-name') && !el.classList.contains('stripe') && !el.classList.contains('add-rowhead'));
  rh.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  const btns = [...document.querySelectorAll('.insp-tabs button')];
  return {
    kind: s.selection.kind,
    tabOn: btns.find((b) => b.classList.contains('on')).textContent.trim(),
    hasDelete: !![...document.querySelectorAll('.insp-actions .btn')].find((b) => /Delete character/.test(b.textContent))
  };
});
check('matrix track click opens Character tab', trackClick.kind === 'character' && trackClick.tabOn === 'Character',
  JSON.stringify(trackClick));
check('character tab offers delete', trackClick.hasDelete);

const trackDel = await page.evaluate(async () => {
  const s = window.LT.store.state;
  const before = s.project.entities.characters.length;
  const btn = [...document.querySelectorAll('.insp-actions .btn')].find((b) => /Delete character/.test(b.textContent));
  window.confirm = () => true;
  btn.click();
  await new Promise((r) => setTimeout(r, 150));
  return { before, after: s.project.entities.characters.length, sel: s.selection };
});
check('character delete from tab works', trackDel.after === trackDel.before - 1,
  trackDel.before + ' -> ' + trackDel.after);
check('selection falls back to scene', trackDel.sel.entityId === null && trackDel.sel.kind === 'scene',
  JSON.stringify(trackDel.sel));
await page.screenshot({ path: path.join(shots, '26-character-tab.png') });

console.log('\n== persistence & reload ==');
await page.evaluate(() => window.LT.store.actions.persist());
await page.reload();
await page.waitForSelector('.shell');
await page.waitForTimeout(400);
const afterReload = await page.evaluate(() => ({
  scenes: window.LT.store.state.project.scenes.length,
  colheads: document.querySelectorAll('.m-colhead').length,
  notice: !!window.LT.store.state.notice
}));
check('project restored after reload', afterReload.scenes === 23 && afterReload.colheads === 23, JSON.stringify(afterReload));
await page.screenshot({ path: path.join(shots, '06-after-reload.png') });

console.log('\n== theme ==');
const themed = await page.evaluate(async () => {
  window.LT.store.actions.setTheme('light');
  await new Promise((r) => setTimeout(r, 80));
  const attr = document.documentElement.getAttribute('data-theme');
  const bg = getComputedStyle(document.body).backgroundColor;
  return { attr, bg };
});
check('light theme applies', themed.attr === 'light' && themed.bg === 'rgb(247, 248, 250)', JSON.stringify(themed));
await page.screenshot({ path: path.join(shots, '07-light.png') });
await page.evaluate(() => window.LT.store.actions.setTheme('dark'));

console.log('\n== console ==');
const real = consoleErrors.filter((e) => !/DevTools|favicon/i.test(e));
check('no console errors/warnings', real.length === 0, real.slice(0, 6).join(' | '));

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES: ' + fail) + ' — ' + pass + ' passed');
await browser.close();
process.exit(fail === 0 ? 0 : 1);
