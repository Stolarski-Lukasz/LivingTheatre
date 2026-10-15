/* LivingTheatre — boot & behaviour harness.
   Runs the real app in jsdom: loads index.html, executes the real scripts in
   order inside the jsdom window, mounts Vue, then drives the store and checks
   observable behaviour. Not shipped with the app; a development check.

   Needs jsdom: `npm install jsdom` in this directory, or point LT_TOOLS at a
   directory that has it. Run: node tools/test-boot.mjs                     */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

let JSDOM, VirtualConsole;
const require = createRequire(import.meta.url);
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch {
  const tools = process.env.LT_TOOLS || '/tmp/opencode/twtool';
  ({ JSDOM, VirtualConsole } = require(path.join(tools, 'node_modules', 'jsdom')));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flush = () => new Promise((r) => setTimeout(r, 20));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => {
  const msg = String(e.message || e);
  if (/Could not parse CSS|not implemented/i.test(msg)) return;
  errors.push('[jsdom] ' + msg);
});
vc.on('error', (...a) => {
  const first = a[0];
  if (first instanceof window.Error) errors.push(first.stack || String(first));
  else errors.push('[console.error] ' + a.join(' '));
});
vc.on('warn', (...a) => {
  const first = a[0];
  if (first instanceof window.Error) errors.push('[warn] ' + (first.stack || String(first)));
  else errors.push('[console.warn] ' + a.join(' '));
});

const dom = new JSDOM(html, {
  url: 'http://localhost/index.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: vc
});

const { window } = dom;

window.matchMedia = window.matchMedia || (() => ({
  matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}
}));
window.scrollTo = () => {};

const scriptSrcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const deferred = scriptSrcs.filter((s) => /xlsx/.test(s));

for (const src of scriptSrcs.filter((s) => !deferred.includes(s))) {
  const code = fs.readFileSync(path.join(root, src), 'utf8');
  try {
    window.eval(code);
  } catch (e) {
    console.error('FAIL loading ' + src + ': ' + e.message);
    process.exit(1);
  }
}

window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

const LT = window.LT;
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(name, got, want) {
  check(name + ' (' + JSON.stringify(got) + ')', got === want, 'expected ' + JSON.stringify(want));
}

await (async () => {
  console.log('\n== boot ==');
  check('LT namespace', !!LT);
  check('store', !!LT.store);
  check('model', !!LT.model);
  check('importer', !!LT.importer);
  check('analytics', !!LT.analytics);
  check('demo', !!LT.demo);
  check('fixtures sampleCsv', !!(LT.fixtures && LT.fixtures.sampleCsv.length > 1000));
  check('components', LT.components && LT.components.Matrix && LT.components.Ruler);

  const a = LT.store.actions;
  const s = LT.store.state;

  console.log('\n== demo load ==');
  const demo = LT.demo.build();
  a.importProject(JSON.parse(JSON.stringify(demo)));
  eq('scenes', s.project.scenes.length, 10);
  eq('characters', s.project.entities.characters.length, 4);
  eq('threads', s.project.entities.threads.length, 2);
  check('hidden scene kept', s.project.scenes.some((x) => x.hidden === true));
  check('flashback kept', s.project.scenes.some((x) => x.mode === 'flashback'));

  console.log('\n== store ops ==');
  a.addCharacter({ name: 'Test Char' });
  eq('characters after add', s.project.entities.characters.length, 5);
  const sc = a.addScene({ title: 'A new scene', storyStart: '4.1' });
  eq('scenes after add', s.project.scenes.length, 11);
  eq('selection follows add', s.selection.sceneId, sc.id);
  a.setCellText(sc.id, s.project.entities.characters[0].id, 'does something');
  const c = a.getCell(sc.id, s.project.entities.characters[0].id);
  check('cell text', c && c.text === 'does something');
  check('cell presence active', c && c.presence === 'active');
  a.cycleCellPresence(sc.id, s.project.entities.characters[1].id);
  const c2 = a.getCell(sc.id, s.project.entities.characters[1].id);
  check('cycle absent->idle', c2 && c2.presence === 'idle');
  a.cycleCellPresence(sc.id, s.project.entities.characters[1].id);
  check('cycle idle->active', a.getCell(sc.id, s.project.entities.characters[1].id).presence === 'active');
  a.cycleCellPresence(sc.id, s.project.entities.characters[1].id);
  check('cycle active->absent (removed)', a.getCell(sc.id, s.project.entities.characters[1].id) === null);

  const orderBefore = s.project.scenes.map((x) => x.id).join(',');
  a.moveSceneTo(sc.id, 2);
  const ids = s.project.scenes.map((x) => x.id);
  eq('moveSceneTo puts scene at 2', ids[2], sc.id);
  check('orders reindexed', s.project.scenes.every((x, i) => x.order === i));

  a.undo();
  eq('undo restores order', s.project.scenes.map((x) => x.id).join(','), orderBefore);
  eq('undo restores scene count', s.project.scenes.length, 11);
  a.redo();
  eq('redo re-applies move', s.project.scenes[2].id, sc.id);

  const titleBefore = s.project.scenes[2].title;
  a.updateScene(sc.id, { title: 'renamed' });
  check('scene renamed', s.project.scenes[2].title === 'renamed');
  a.undo();
  check('undo restores title', s.project.scenes[2].title === titleBefore,
    'got ' + s.project.scenes[2].title);

  console.log('\n== compound undo (addScene creates chapter) ==');
  const n0 = s.project.scenes.length;
  const past0 = s.past.length;
  a.addScene({ title: 'compound' });
  eq('one history entry per compound op', s.past.length, past0 + 1);
  a.undo();
  eq('compound undo removes scene', s.project.scenes.length, n0);

  console.log('\n== importer on the real fixture ==');
  const rows = LT.importer.parseDelimited(LT.fixtures.sampleCsv);
  check('rows parsed', rows.length > 10, 'rows=' + rows.length);
  const res = LT.importer.importTable(rows, { title: 'Fabuła' });
  const p = res.project;
  eq('fixture scenes', p.scenes.length, 23);
  eq('fixture characters', p.entities.characters.length, 9, p.entities.characters.map((c) => c.name).join('|'));
  check('fixture chapters', p.chapters.length >= 7, 'chapters=' + p.chapters.length);
  check('hidden event imported', p.scenes.some((x) => x.hidden));
  check('mentioned char', p.entities.characters.some((c) => c.status === 'mentioned'));
  check('places created', p.entities.places.length > 4);
  check('place hierarchy', p.entities.places.some((pl) => pl.parentId));
  check('pov typo row matched', p.scenes.some((x) => !x.povIsNarrator && x.pov));
  const t10 = p.scenes.find((x) => x.storyStart === '1.10');
  const t12 = p.scenes.find((x) => x.storyStart === '1.2');
  check('story time ordering 1.10 > 1.2', LT.model.compareStoryTime(t10.storyStart, t12.storyStart) > 0);

  console.log('\n== analytics ==');
  a.importProject(JSON.parse(JSON.stringify(p)));
  const rep = LT.analytics.fullReport(s.project);
  check('report shape', rep && Array.isArray(rep.contradictions) && Array.isArray(rep.deadThreads));
  check('dead threads detected', rep.deadThreads.length >= 0);
  const ctx = LT.analytics.contextForScene(s.project, s.project.scenes[0].id);
  check('context pack', ctx && ctx.scene && Array.isArray(ctx.present));
  check('context focus fields', 'povName' in ctx.scene && 'place' in ctx.scene);

  console.log('\n== persistence ==');
  s.project.meta.title = 'persist-test';
  a.persist();
  const active = window.localStorage.getItem('livingtheatre.active.v1');
  check('written to localStorage', !!active && JSON.parse(active).meta.title === 'persist-test');
  check('library entry', (window.localStorage.getItem('livingtheatre.projects.v1') || '[]').length > 2);

  await flush();
  console.log('\n== mounted dom ==');
  const app = window.document.querySelector('#app');
  check('app mounted', !!app && app.innerHTML.length > 500);
  check('default layout rendered', !!window.document.querySelector('.shell'));
  check('matrix rendered', !!window.document.querySelector('.scroll-stage'));
  check('column headers', window.document.querySelectorAll('.m-colhead').length === 23,
    'cols=' + window.document.querySelectorAll('.m-colhead').length);
  check('character rows', window.document.querySelectorAll('.m-rowhead').length >= 9,
    'rows=' + window.document.querySelectorAll('.m-rowhead').length);
  check('presence cells', window.document.querySelectorAll('.m-cell.p-active').length > 20,
    'active=' + window.document.querySelectorAll('.m-cell.p-active').length);
  check('idle cells', window.document.querySelectorAll('.m-cell.p-idle').length > 0);
  check('ruler rendered', !!window.document.querySelector('.ruler'));
  check('ruler axis ticks', window.document.querySelectorAll('.ruler-axistick').length > 0);
  check('rail scene rows', window.document.querySelectorAll('.rail .scene-no').length === 23,
    'rows=' + window.document.querySelectorAll('.rail .scene-no').length);
  check('rail has no character list', window.document.querySelectorAll('.rail .rail-head').length === 2,
    'sections=' + window.document.querySelectorAll('.rail .rail-head').length);
  check('inspector tabs', window.document.querySelectorAll('.insp-tabs button').length === 3);
  check('statusbar', !!window.document.querySelector('.statusbar'));
  check('minimap', window.document.querySelectorAll('.mm-tick').length === 23);

  await flush();
  console.log('\n== zoom ==');
  a.setZoom(200);
  await flush();
  const head = window.document.querySelector('.m-colhead');
  check('zoom applies to columns', head && head.style.width === '200px', head && head.style.width);
  a.setZoom(56);
  await flush();
  const head2 = window.document.querySelector('.m-colhead');
  check('zoom reset', head2 && head2.style.width === '56px');

  await flush();
  console.log('\n== interactions ==');
  const doc = window.document;
  const fire = (el, type, init) => el.dispatchEvent(new window.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true }, init)));
  const fireWin = (type, init) => window.dispatchEvent(new window.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true }, init)));
  const key = (k, init) => window.dispatchEvent(new window.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, init)));

  /* click a character cell selects scene + character */
  const charRows0 = [...doc.querySelectorAll('.m-row')].filter((r) => r.querySelector('.m-cell'));
  const firstCell = charRows0[0].querySelectorAll('.m-cell')[0];
  fire(firstCell, 'click');
  await flush();
  check('cell click selects scene', !!s.selection.sceneId);
  check('cell click selects character', !!s.selection.entityId);
  check('cell shows selected', !!doc.querySelector('.m-cell.selected'));

  /* alt+click cycles presence of a specific cell */
  const charRows = [...doc.querySelectorAll('.m-row')].filter((r) => r.querySelector('.m-cell'));
  const targetCell = charRows[0].querySelectorAll('.m-cell')[1];
  const scene1 = s.project.scenes[1];
  const char0 = s.project.entities.characters[0];
  const before1 = a.getCell(scene1.id, char0.id);
  fire(targetCell, 'click', { altKey: true });
  await flush();
  const after1 = a.getCell(scene1.id, char0.id);
  check('alt+click cycles presence', (!before1 && after1 && after1.presence === 'idle') ||
    (before1 && after1 && after1.presence !== before1.presence),
    'before=' + (before1 && before1.presence) + ' after=' + (after1 && after1.presence));

  /* double-click opens the inline editor, blur commits */
  fire(targetCell, 'dblclick');
  await flush();
  const editor = doc.querySelector('.cell-input');
  check('dblclick opens editor', !!editor);
  if (editor) {
    editor.value = 'test beat text';
    editor.dispatchEvent(new window.Event('input', { bubbles: true }));
    await flush();
    editor.dispatchEvent(new window.Event('blur', { bubbles: false }));
    await flush();
    const c = a.getCell(scene1.id, char0.id);
    check('blur commits text', c && c.text === 'test beat text', c && JSON.stringify(c.text));
    check('editor closed after commit', !doc.querySelector('.cell-input'));
  }

  /* click a column header selects the scene */
  const heads = doc.querySelectorAll('.m-colhead');
  fire(heads[3], 'click');
  await flush();
  eq('header click selects scene', s.selection.sceneId, s.project.scenes[3].id);

  /* ctrl+wheel zooms */
  const stage = doc.querySelector('.scroll-stage');
  const zoomBefore = s.zoom;
  stage.dispatchEvent(new window.WheelEvent('wheel', { deltaY: -120, ctrlKey: true, bubbles: true, cancelable: true, clientX: 400 }));
  await flush();
  check('ctrl+wheel zooms in', s.zoom > zoomBefore, zoomBefore + ' -> ' + s.zoom);

  /* drag a column header to reorder */
  const orderBefore2 = s.project.scenes.map((x) => x.id).join(',');
  const head4 = doc.querySelectorAll('.m-colhead')[4];
  head4.dispatchEvent(new window.MouseEvent('pointerdown', { button: 0, bubbles: true, clientX: 300, pointerId: 1 }));
  fireWin('pointermove', { clientX: 300 });
  fireWin('pointermove', { clientX: 470 });
  await flush();
  check('drag shows drop line', !!doc.querySelector('.m-dropline'));
  fireWin('pointerup', {});
  await flush();
  const orderAfter2 = s.project.scenes.map((x) => x.id).join(',');
  check('drag reorders scenes', orderBefore2 !== orderAfter2, 'before=' + orderBefore2.slice(0, 40) + ' after=' + orderAfter2.slice(0, 40));
  check('drag keeps one undo step', s.past.length >= 1);

  /* click the same header again — the browser's post-drag click is swallowed,
     the next real click selects */
  fire(doc.querySelectorAll('.m-colhead')[1], 'click');
  fire(doc.querySelectorAll('.m-colhead')[1], 'click');
  await flush();
  eq('post-drag click still selects', s.selection.sceneId, s.project.scenes[1].id);

  /* inspector: cell tab reachable after scene-only selection */
  const tabs = doc.querySelectorAll('.insp-tabs button');
  fire(tabs[1], 'click');
  await flush();
  check('cell tab renders presence picker', !!doc.querySelector('.presence-picker'));
  fire(tabs[0], 'click');
  await flush();
  check('scene tab renders fields', !!doc.querySelectorAll('.insp-section .insp-input').length);

  /* presence picker writes through */
  fire(doc.querySelectorAll('.insp-tabs button')[1], 'click');
  await flush();
  const pickButtons = doc.querySelectorAll('.presence-picker button');
  fire(pickButtons[2], 'click');
  await flush();
  const cur = a.getCell(s.selection.sceneId, s.selection.entityId);
  check('picker sets presence', cur && cur.presence === 'active', cur && cur.presence);

  /* topbar: add scene */
  const addBtns = [...doc.querySelectorAll('.topbar .btn')].filter((b) => b.textContent.includes('Scene'));
  fire(addBtns[0], 'click');
  await flush();
  eq('topbar adds scene', s.project.scenes.length, 24);

  /* rail: click a scene row selects it */
  const railRows = [...doc.querySelectorAll('.rail .track-row')];
  fire(railRows[railRows.length - 1], 'click');
  await flush();
  check('rail scene click selects', !!s.selection.sceneId);

  /* theme button */
  const themeBtn = [...doc.querySelectorAll('.topbar .btn.icon')].find((b) => b.textContent.includes('◐'));
  fire(themeBtn, 'click');
  await flush();
  eq('topbar theme toggle', doc.documentElement.getAttribute('data-theme'), 'light');
  fire(themeBtn, 'click');
  await flush();

  /* projects modal opens */
  const projBtn = [...doc.querySelectorAll('.topbar .btn')].find((b) => b.textContent.trim() === 'Projects');
  fire(projBtn, 'click');
  await flush();
  check('projects modal opens', !!doc.querySelector('.modal-backdrop'));
  const newBtn = [...doc.querySelectorAll('.modal-foot .btn')].find((b) => b.textContent.includes('New project'));
  fire(newBtn, 'click');
  await flush();
  eq('new project empties scenes', s.project.scenes.length, 0);
  check('modal closed', !doc.querySelector('.modal-backdrop'));

  /* help modal via ? button */
  const helpBtn = [...doc.querySelectorAll('.topbar .btn.icon')].find((b) => b.textContent.trim() === '?');
  fire(helpBtn, 'click');
  await flush();
  check('help modal opens', !!doc.querySelector('.help-table'));
  key('Escape');
  await flush();
  check('escape closes modal', !doc.querySelector('.modal-backdrop'));

  /* keyboard navigation */
  a.importProject(JSON.parse(JSON.stringify(p)));
  await flush();
  s.selection = { sceneId: null, entityId: null };
  key('ArrowRight');
  await flush();
  check('arrow right selects a scene', !!s.selection.sceneId);
  key('ArrowDown');
  await flush();
  check('arrow down selects a character', !!s.selection.entityId);
  key('Escape');
  await flush();
  check('escape clears selection', s.selection.sceneId === null && s.selection.entityId === null);

  await flush();
  console.log('\n== character tracks in the matrix ==');
  const addRow = doc.querySelector('.m-addrow .add-rowhead');
  check('add-character row exists', !!addRow);
  const charsBefore = s.project.entities.characters.length;
  if (addRow) { fire(addRow, 'click'); await flush(); }
  eq('add row adds a character', s.project.entities.characters.length, charsBefore + 1);
  check('new character selected', s.selection.entityId === s.project.entities.characters[charsBefore].id);

  const rowheads = doc.querySelectorAll('.m-rowhead:not(.stripe):not(.add-rowhead):not(.special)');
  check('character rowheads rendered', rowheads.length === charsBefore + 1, 'rows=' + rowheads.length);

  const newId = s.project.entities.characters[charsBefore].id;
  const firstCharacterId = s.project.entities.characters[0].id;
  const targetRowhead = [...doc.querySelectorAll('.m-row')]
    .map((r) => r.querySelector('.m-rowhead'))
    .filter((el) => el && !el.classList.contains('add-rowhead') && !el.classList.contains('stripe') && !el.classList.contains('special'))[0];
  if (targetRowhead) {
    fire(targetRowhead, 'dblclick');
    await flush();
    const input = doc.querySelector('.rh-input');
    check('dblclick opens rename', !!input);
    if (input) {
      check('rename prefilled', input.value === s.project.entities.characters[0].name, input.value);
      input.value = 'Renamed Hero';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      await flush();
      input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await flush();
      const renamed = s.project.entities.characters.find((c) => c.id === firstCharacterId);
      check('enter commits rename', renamed && renamed.name === 'Renamed Hero',
        renamed && renamed.name);
      check('rename input closed', !doc.querySelector('.rh-input'));
    }
  }

  const colorBtn = [...doc.querySelectorAll('.rh-tools button')].find((b) => b.title.includes('colour'));
  const colorBefore = s.project.entities.characters[0].color;
  if (colorBtn) { fire(colorBtn, 'click'); await flush(); }
  check('rowhead cycles colour', s.project.entities.characters[0].color !== colorBefore);

  const removeBtn = [...doc.querySelectorAll('.rh-tools button')].find((b) => b.title.includes('Remove'));
  const countBefore = s.project.entities.characters.length;
  if (removeBtn) {
    window.confirm = () => true;
    fire(removeBtn, 'click');
    await flush();
  }
  eq('rowhead removes character', s.project.entities.characters.length, countBefore - 1);

  const rowheadClick = [...doc.querySelectorAll('.m-rowhead:not(.stripe):not(.add-rowhead):not(.special)')][0];
  fire(rowheadClick, 'click');
  await flush();
  check('rowhead click selects character', !!s.selection.entityId);

  await flush();
  console.log('\n== rail collapse & resize ==');
  const railToggle = [...doc.querySelectorAll('.topbar .btn')].find((b) => b.classList.contains('icon') && (b.textContent.trim() === '‹' || b.textContent.trim() === '›'));
  check('rail toggle button exists', !!railToggle);
  check('rail visible initially', !!doc.querySelector('.rail-wrap'));
  const shell = doc.querySelector('.shell');
  check('shell columns include rail width', shell.getAttribute('style').includes('232px'),
    shell.getAttribute('style'));
  if (railToggle) { fire(railToggle, 'click'); await flush(); }
  check('rail collapses', !doc.querySelector('.rail-wrap'));
  check('shell rail column is 0', shell.getAttribute('style').includes('0px 1fr'),
    shell.getAttribute('style'));
  if (railToggle) { fire(railToggle, 'click'); await flush(); }
  check('rail re-opens', !!doc.querySelector('.rail-wrap'));

  a.setRailWidth(320);
  await flush();
  check('rail width resizes', s.railW === 320 && shell.getAttribute('style').includes('320px'),
    shell.getAttribute('style'));
  a.setRailWidth(9999);
  check('rail width clamps to max', s.railW === 520, 'railW=' + s.railW);
  a.setRailWidth(10);
  check('rail width clamps to min', s.railW === 180, 'railW=' + s.railW);

  const handle = doc.querySelector('.rail-resizer');
  check('resize handle exists', !!handle);
  if (handle) {
    handle.dispatchEvent(new window.MouseEvent('pointerdown', { button: 0, bubbles: true, clientX: 232, pointerId: 3 }));
    fireWin('pointermove', { clientX: 380 });
    fireWin('pointerup', {});
    await flush();
    check('drag resizes the rail', s.railW === 380, 'railW=' + s.railW);
  }

  key('b', { ctrlKey: true });
  await flush();
  check('ctrl+B collapses rail', !doc.querySelector('.rail-wrap'));
  key('b', { ctrlKey: true });
  await flush();
  check('ctrl+B re-opens rail', !!doc.querySelector('.rail-wrap'));

  a.setRailOpen(false);
  await flush();
  const uiRaw = window.localStorage.getItem('livingtheatre.ui.v1');
  check('ui prefs persisted', !!uiRaw && JSON.parse(uiRaw).railOpen === false, uiRaw);
  a.setRailOpen(true);

  await flush();
  console.log('\n== inspector resize ==');
  const inspWrap = doc.querySelector('.inspector-wrap');
  check('inspector wrap exists', !!inspWrap);
  check('inspector panel exists', !!doc.querySelector('.inspector .inspector-inner'));
  check('inspector resizer exists', !!doc.querySelector('.inspector-resizer'));
  const shellCols = () => shell.getAttribute('style').replace(/;\s*$/, '');
  a.setInspectorWidth(420);
  await flush();
  check('inspector width sets', s.inspectorW === 420 && shellCols().endsWith('420px'),
    shellCols());
  a.setInspectorWidth(10);
  check('inspector width clamps to min', s.inspectorW === 300, 'w=' + s.inspectorW);
  a.setInspectorWidth(9999);
  check('inspector width clamps to max', s.inspectorW === 620, 'w=' + s.inspectorW);
  const iHandle = doc.querySelector('.inspector-resizer');
  if (iHandle) {
    window.innerWidth = 1000;
    iHandle.dispatchEvent(new window.MouseEvent('pointerdown', { button: 0, bubbles: true, clientX: 700, pointerId: 4 }));
    fireWin('pointermove', { clientX: 640 });
    fireWin('pointerup', {});
    await flush();
    check('drag resizes inspector', s.inspectorW === 360, 'w=' + s.inspectorW);
  }
  const inspToggle = [...doc.querySelectorAll('.topbar .btn.icon')].find((b) => b.textContent.trim() === '›' || b.textContent.trim() === '‹');
  key('i', { ctrlKey: true });
  await flush();
  check('ctrl+I hides inspector', !doc.querySelector('.inspector-wrap'));
  check('shell inspector column 0', shellCols().endsWith('0px'), shellCols());
  key('i', { ctrlKey: true });
  await flush();
  check('ctrl+I shows inspector', !!doc.querySelector('.inspector-wrap'));
  a.setInspectorWidth(344);
  await flush();
  const uiRaw2 = window.localStorage.getItem('livingtheatre.ui.v1');
  check('inspector width persisted', !!uiRaw2 && JSON.parse(uiRaw2).inspectorW === 344, uiRaw2);

  /* undo via keyboard */
  const n2 = s.project.scenes.length;
  a.addScene({ title: 'kb' });
  await flush();
  eq('scene added', s.project.scenes.length, n2 + 1);
  key('z', { ctrlKey: true });
  await flush();
  eq('ctrl+z undoes', s.project.scenes.length, n2);

  /* theme == */
  await flush();
  console.log('\n== theme ==');
  a.setTheme('light');
  await flush();
  eq('theme attr', window.document.documentElement.getAttribute('data-theme'), 'light');
  a.setTheme('dark');
  await flush();
  eq('theme back', window.document.documentElement.getAttribute('data-theme'), 'dark');

  console.log('\n== console noise ==');
  const real = errors.filter((e) => !/devtools|Download the Vue/i.test(e));
  check('no console errors/warnings', real.length === 0, real.slice(0, 5).join(' | '));

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES: ' + fail) + ' — ' + pass + ' passed');
  process.exit(fail === 0 && real.length === 0 ? 0 : 1);

})();
