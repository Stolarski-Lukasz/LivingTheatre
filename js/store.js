/* LivingTheatre — reactive store.
   A single project document is the source of truth. Everything else is
   derived (indexes, story-time bounds) and recomputed on change. */
(function (LT) {
  'use strict';

  var model = LT.model;

  var STORAGE_KEY = 'livingtheatre.projects.v1';
  var ACTIVE_KEY = 'livingtheatre.active.v1';
  var THEME_KEY = 'livingtheatre.theme.v1';
  var UI_KEY = 'livingtheatre.ui.v1';
  var HISTORY_LIMIT = 80;
  var COALESCE_MS = 700;

  var RAIL_MIN = 180;
  var RAIL_MAX = 520;
  var INSPECTOR_MIN = 300;
  var INSPECTOR_MAX = 620;

  var state = Vue.reactive({
    project: model.createProject(),
    projectId: null,
    library: [],
    selection: { sceneId: null, entityId: null, kind: null },
    zoom: 56,
    railOpen: true,
    railW: 232,
    inspectorW: 344,
    showPov: true,
    showPlaces: true,
    showTime: true,
    filters: { text: '' },
    theme: readTheme(),
    past: [],
    future: [],
    dirty: false,
    notice: null
  });

  function readTheme() {
    try {
      var st = storage();
      var v = st && st.getItem(THEME_KEY);
      if (v === 'light' || v === 'dark') return v;
    } catch (e) { /* storage unavailable */ }
    return 'dark';
  }

  var derived = Vue.computed(function () {
    var p = state.project;
    var chars = p.entities.characters;
    var scenes = p.scenes;

    var charIndex = model.indexById(chars);
    var placeIndex = model.indexById(p.entities.places);
    var threadIndex = model.indexById(p.entities.threads);
    var chapterIndex = model.indexById(p.chapters);
    var sceneIndex = model.indexById(scenes);

    var cellMap = Object.create(null);
    p.cells.forEach(function (c) {
      cellMap[c.sceneId + '|' + c.entityId] = c;
    });

    var threadCellMap = Object.create(null);
    p.threadCells.forEach(function (c) {
      var key = c.sceneId + '|' + c.threadId;
      (threadCellMap[key] = threadCellMap[key] || []).push(c);
    });

    var scenesByChapter = Object.create(null);
    p.chapters.forEach(function (ch) { scenesByChapter[ch.id] = []; });
    scenes.forEach(function (s) {
      if (!scenesByChapter[s.chapterId]) scenesByChapter[s.chapterId] = [];
      scenesByChapter[s.chapterId].push(s);
    });

    var min = null, max = null;
    scenes.forEach(function (s) {
      var t = model.parseStoryTime(s.storyStart);
      if (!t) return;
      if (!min || model.compareStoryTime(t, min) < 0) min = t;
      if (!max || model.compareStoryTime(t, max) > 0) max = t;
    });

    return {
      charIndex: charIndex,
      placeIndex: placeIndex,
      threadIndex: threadIndex,
      chapterIndex: chapterIndex,
      sceneIndex: sceneIndex,
      cellMap: cellMap,
      threadCellMap: threadCellMap,
      scenesByChapter: scenesByChapter,
      storyMin: min,
      storyMax: max,
      chapters: p.chapters,
      scenes: scenes,
      characters: chars,
      places: p.entities.places,
      threads: p.entities.threads
    };
  });

  /* ---------- persistence ---------- */
  function storage() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  function readJSON(key, fallback) {
    var s = storage();
    if (!s) return fallback;
    try {
      var raw = s.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    var s = storage();
    if (!s) return false;
    try {
      s.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      notice('Could not save: storage full or unavailable.', 'error');
      return false;
    }
  }

  function refreshLibrary() {
    var entries = readJSON(STORAGE_KEY, []) || [];
    state.library = entries.map(function (e) {
      return {
        id: e.id,
        title: e.title,
        author: e.author,
        modified: e.modified,
        sceneCount: e.sceneCount,
        characterCount: e.characterCount
      };
    }).sort(function (a, b) {
      return String(b.modified).localeCompare(String(a.modified));
    });
  }

  function persist() {
    state.project.meta.modified = new Date().toISOString();
    writeJSON(ACTIVE_KEY, state.project);
    var p = state.project;
    var entries = readJSON(STORAGE_KEY, []) || [];
    var entry = {
      id: p.meta.id,
      title: p.meta.title,
      author: p.meta.author,
      modified: p.meta.modified,
      sceneCount: p.scenes.length,
      characterCount: p.entities.characters.length
    };
    var found = false;
    entries = entries.map(function (e) {
      if (e.id === p.meta.id) { found = true; return entry; }
      return e;
    });
    if (!found) entries.push(entry);
    writeJSON(STORAGE_KEY, entries);
    refreshLibrary();
    state.dirty = false;
  }

  var saveTimer = null;
  function schedulePersist() {
    state.dirty = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 600);
  }

  /* ---------- undo ---------- */
  function snapshot() {
    return JSON.stringify(state.project);
  }

  function pushHistory() {
    state.past.push(snapshot());
    if (state.past.length > HISTORY_LIMIT) state.past.shift();
    state.future.length = 0;
  }

  function restore(json) {
    state.project = model.migrate(JSON.parse(json));
  }

  function undo() {
    if (!state.past.length) return false;
    state.future.push(snapshot());
    restore(state.past.pop());
    persist();
    return true;
  }

  function redo() {
    if (!state.future.length) return false;
    state.past.push(snapshot());
    restore(state.future.pop());
    persist();
    return true;
  }

  /* Every mutation runs inside a transaction: the snapshot is taken once
     before the first write, so a compound operation is one undo step. */
  var txDepth = 0;
  var lastEditKey = null;
  var lastEditAt = 0;

  function transaction(fn) {
    if (txDepth === 0) {
      var now = Date.now();
      var coalesce = txKey !== null && txKey === lastEditKey && now - lastEditAt < COALESCE_MS;
      if (!coalesce) pushHistory();
      lastEditAt = now;
    }
    txDepth++;
    try {
      return fn();
    } finally {
      txDepth--;
      if (txDepth === 0) schedulePersist();
    }
  }

  var txKey = null;
  function keyed(key, fn) {
    var prevKey = txKey;
    txKey = key;
    try {
      return transaction(fn);
    } finally {
      txKey = prevKey;
    }
  }

  /* ---------- notices ---------- */
  var noticeTimer = null;
  function notice(message, kind) {
    state.notice = { message: message, kind: kind || 'info' };
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () { state.notice = null; }, 4000);
  }

  /* ---------- project lifecycle ---------- */
  function newProject(title) {
    pushHistory();
    state.project = model.createProject({ meta: { title: title || 'Untitled story' } });
    state.projectId = null;
    state.selection = { sceneId: null, entityId: null, kind: null };
    persist();
    return state.project;
  }

  function loadProject(id) {
    var all = readJSON(STORAGE_KEY, []) || [];
    var entry = all.filter(function (e) { return e.id === id; })[0];
    if (!entry) { notice('Project not found.', 'error'); return null; }
    pushHistory();
    state.project = model.migrate(entry);
    state.projectId = state.project.meta.id;
    state.selection = { sceneId: null, entityId: null, kind: null };
    persist();
    return state.project;
  }

  function deleteProject(id) {
    var entries = readJSON(STORAGE_KEY, []) || [];
    var target = id || (state.project && state.project.meta.id);
    writeJSON(STORAGE_KEY, entries.filter(function (e) { return e.id !== target; }));
    if (state.project && state.project.meta.id === target) {
      var s = storage();
      if (s) s.removeItem(ACTIVE_KEY);
    }
    refreshLibrary();
  }

  function importProject(json) {
    var parsed = typeof json === 'string' ? JSON.parse(json) : json;
    var check = model.validate(parsed);
    if (!check.ok) {
      notice('Import failed: ' + check.errors.join(' '), 'error');
      return null;
    }
    pushHistory();
    state.project = model.migrate(parsed);
    state.project.meta.id = model.uid('prj');
    state.projectId = state.project.meta.id;
    state.selection = { sceneId: null, entityId: null, kind: null };
    persist();
    notice('Imported "' + state.project.meta.title + '".', 'ok');
    return state.project;
  }

  function exportProject() {
    return JSON.stringify(state.project, null, 2);
  }

  function exportFileName() {
    var t = (state.project.meta.title || 'project')
      .replace(/[^\w\d\-. ]+/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
    return t || 'livingtheatre-project';
  }

  function restoreSession() {
    var active = readJSON(ACTIVE_KEY, null);
    if (active) {
      state.project = model.migrate(active);
      state.projectId = state.project.meta.id;
    }
    restoreUI();
    refreshLibrary();
    return state.project;
  }

  /* ---------- ui preferences ---------- */
  function restoreUI() {
    var ui = readJSON(UI_KEY, null);
    if (!ui) return;
    if (typeof ui.railOpen === 'boolean') state.railOpen = ui.railOpen;
    if (typeof ui.railW === 'number' && ui.railW >= RAIL_MIN && ui.railW <= RAIL_MAX) {
      state.railW = ui.railW;
    }
    if (typeof ui.inspectorW === 'number' && ui.inspectorW >= INSPECTOR_MIN && ui.inspectorW <= INSPECTOR_MAX) {
      state.inspectorW = ui.inspectorW;
    }
  }

  function persistUI() {
    writeJSON(UI_KEY, {
      railOpen: state.railOpen,
      railW: state.railW,
      inspectorW: state.inspectorW
    });
  }

  function setRailOpen(open) {
    state.railOpen = !!open;
    persistUI();
  }

  function toggleRail() {
    setRailOpen(!state.railOpen);
  }

  function setRailWidth(w) {
    state.railW = Math.max(RAIL_MIN, Math.min(RAIL_MAX, Math.round(w)));
    persistUI();
  }

  function setInspectorWidth(w) {
    state.inspectorW = Math.max(INSPECTOR_MIN, Math.min(INSPECTOR_MAX, Math.round(w)));
    persistUI();
  }

  function setTheme(theme) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    try {
      var s = storage();
      if (s) s.setItem(THEME_KEY, state.theme);
    } catch (e) { /* ignore */ }
  }

  /* ---------- entity operations ---------- */
  function addCharacter(props) {
    return transaction(function () {
      var c = model.createCharacter(props);
      c.color = props && props.color
        ? props.color
        : model.colorForIndex(state.project.entities.characters.length);
      state.project.entities.characters.push(c);
      return c;
    });
  }

  function updateCharacter(id, patch) {
    return keyed('char:' + id, function () {
      var c = model.byId(state.project.entities.characters, id);
      if (!c) return null;
      Object.assign(c, patch);
      return c;
    });
  }

  function removeCharacter(id) {
    return transaction(function () {
      var p = state.project;
      p.entities.characters = p.entities.characters.filter(function (c) { return c.id !== id; });
      p.cells = p.cells.filter(function (c) { return c.entityId !== id; });
      p.scenes.forEach(function (s) { if (s.pov === id) { s.pov = null; s.povIsNarrator = true; } });
      if (state.selection.entityId === id) {
        state.selection = { sceneId: state.selection.sceneId, entityId: null, kind: 'scene' };
      }
    });
  }

  function addPlace(props) {
    return transaction(function () {
      var pl = model.createPlace(props);
      state.project.entities.places.push(pl);
      return pl;
    });
  }

  function placeByLabel(label) {
    if (!label) return null;
    var list = state.project.entities.places;
    for (var i = 0; i < list.length; i++) if (list[i].name === label) return list[i];
    return addPlace({ name: label });
  }

  function characterByName(name) {
    if (!name) return null;
    var list = state.project.entities.characters;
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }

  /* ---------- scene operations ---------- */
  function addChapter(props) {
    return transaction(function () {
      var ch = model.createChapter(props);
      ch.order = state.project.chapters.length;
      state.project.chapters.push(ch);
      return ch;
    });
  }

  function updateChapter(id, patch) {
    return keyed('chapter:' + id, function () {
      var ch = model.byId(state.project.chapters, id);
      if (!ch) return null;
      Object.assign(ch, patch);
      return ch;
    });
  }

  function addScene(props) {
    return transaction(function () {
      var p = state.project;
      var s = model.createScene(props);
      s.order = p.scenes.length;
      if (!s.chapterId) {
        var last = p.chapters[p.chapters.length - 1];
        if (!last) {
          var ch = model.createChapter({ title: 'Chapter 1' });
          ch.order = 0;
          p.chapters.push(ch);
          last = ch;
        }
        s.chapterId = last.id;
      }
      if (s.placeLabel && !s.placeId) s.placeId = placeByLabel(s.placeLabel).id;
      if (s.povIsNarrator === false && s.pov) {
        if (!characterByName(s.pov)) addCharacter({ name: s.pov });
      }
      p.scenes.push(s);
      selectScene(s.id);
      return s;
    });
  }

  function updateScene(id, patch) {
    return keyed('scene:' + id, function () {
      var s = model.byId(state.project.scenes, id);
      if (!s) return null;
      Object.assign(s, patch);
      if (patch.placeLabel !== undefined && !patch.placeId) {
        s.placeId = patch.placeLabel ? placeByLabel(patch.placeLabel).id : null;
      }
      return s;
    });
  }

  function removeScene(id) {
    return transaction(function () {
      var p = state.project;
      p.scenes = p.scenes.filter(function (s) { return s.id !== id; });
      p.cells = p.cells.filter(function (c) { return c.sceneId !== id; });
      p.threadCells = p.threadCells.filter(function (c) { return c.sceneId !== id; });
      p.links = p.links.filter(function (l) {
        return l.fromSceneId !== id && l.toSceneId !== id;
      });
      reindexOrders();
      if (state.selection.sceneId === id) selectScene(null);
    });
  }

  function reindexOrders() {
    state.project.scenes.forEach(function (s, i) { s.order = i; });
    state.project.chapters.forEach(function (c, i) { c.order = i; });
  }

  function moveScene(id, delta) {
    var p = state.project;
    var idx = p.scenes.findIndex(function (s) { return s.id === id; });
    if (idx === -1) return false;
    return moveSceneTo(id, idx + delta);
  }

  /* Presentation order only. Story time is never touched here. */
  function moveSceneTo(id, index) {
    return keyed('move:' + id, function () {
      var p = state.project;
      var idx = p.scenes.findIndex(function (s) { return s.id === id; });
      if (idx === -1) return false;
      index = Math.max(0, Math.min(p.scenes.length - 1, index));
      if (index === idx) return false;
      var moved = p.scenes.splice(idx, 1)[0];
      p.scenes.splice(index, 0, moved);
      reindexOrders();
      return true;
    });
  }

  /* ---------- cell operations ---------- */
  function getCell(sceneId, entityId) {
    return derived.value.cellMap[sceneId + '|' + entityId] || null;
  }

  function ensureCell(sceneId, entityId, presence) {
    var p = state.project;
    var existing = derived.value.cellMap[sceneId + '|' + entityId];
    if (existing) {
      if (presence && existing.presence !== presence) existing.presence = presence;
      return existing;
    }
    var c = model.createCell({
      sceneId: sceneId,
      entityId: entityId,
      presence: presence || model.PRESENCE.IDLE
    });
    p.cells.push(c);
    return c;
  }

  function setCellText(sceneId, entityId, text) {
    return keyed('cell:' + sceneId + ':' + entityId, function () {
      var c = ensureCell(sceneId, entityId, text ? model.PRESENCE.ACTIVE : model.PRESENCE.IDLE);
      c.text = text || '';
      if (text && c.presence === model.PRESENCE.IDLE) c.presence = model.PRESENCE.ACTIVE;
      return c;
    });
  }

  function setCellNote(sceneId, entityId, note) {
    return keyed('note:' + sceneId + ':' + entityId, function () {
      var c = ensureCell(sceneId, entityId, null);
      c.note = note || '';
      return c;
    });
  }

  function setCellPresence(sceneId, entityId, presence) {
    return keyed('pres:' + sceneId + ':' + entityId, function () {
      return ensureCell(sceneId, entityId, presence);
    });
  }

  /* absent -> idle -> active -> absent. An absent cell is removed so the
     document stays sparse. */
  function cycleCellPresence(sceneId, entityId) {
    return transaction(function () {
      var c = getCell(sceneId, entityId);
      var next;
      if (!c) next = model.PRESENCE.IDLE;
      else {
        var i = model.PRESENCE_ORDER.indexOf(c.presence);
        next = model.PRESENCE_ORDER[(i + 1) % model.PRESENCE_ORDER.length];
      }
      if (next === model.PRESENCE.ABSENT) {
        state.project.cells = state.project.cells.filter(function (x) {
          return !(x.sceneId === sceneId && x.entityId === entityId);
        });
        return null;
      }
      return ensureCell(sceneId, entityId, next);
    });
  }

  function clearCell(sceneId, entityId) {
    return transaction(function () {
      state.project.cells = state.project.cells.filter(function (c) {
        return !(c.sceneId === sceneId && c.entityId === entityId);
      });
    });
  }

  /* ---------- thread cells ---------- */
  function setThreadCell(sceneId, threadId, patch) {
    return keyed('tcell:' + sceneId + ':' + threadId, function () {
      var p = state.project;
      var found = p.threadCells.filter(function (c) {
        return c.sceneId === sceneId && c.threadId === threadId;
      })[0];
      if (!found) {
        found = model.createThreadCell({
          sceneId: sceneId, threadId: threadId, kind: patch.kind || 'advance'
        });
        p.threadCells.push(found);
      }
      Object.assign(found, patch);
      return found;
    });
  }

  function clearThreadCell(sceneId, threadId) {
    return transaction(function () {
      state.project.threadCells = state.project.threadCells.filter(function (c) {
        return !(c.sceneId === sceneId && c.threadId === threadId);
      });
    });
  }

  /* ---------- selection & ui ---------- */
  /* kind records what was last clicked: 'cell' opens the inspector on the
     Cell tab, 'scene' on the Scene tab — a scene header or a strip cell
     must never inherit the Cell tab just because a character is still
     selected. */
  function select(sceneId, entityId) {
    state.selection = {
      sceneId: sceneId === undefined ? null : sceneId,
      entityId: entityId === undefined ? null : entityId,
      kind: entityId ? 'cell' : 'scene'
    };
  }

  function selectCell(sceneId, entityId) {
    state.selection = {
      sceneId: sceneId,
      entityId: entityId,
      kind: entityId ? 'cell' : 'scene'
    };
  }

  function selectScene(sceneId) {
    if (sceneId === null || sceneId === undefined) {
      state.selection = { sceneId: null, entityId: null, kind: 'scene' };
      return;
    }
    state.selection = {
      sceneId: sceneId,
      entityId: state.selection.entityId,
      kind: 'scene'
    };
  }

  /* Character options: the scene selection is kept so the Cell tab stays
     usable, only the inspector's default tab changes. */
  function selectCharacter(entityId) {
    state.selection = {
      sceneId: state.selection.sceneId,
      entityId: entityId,
      kind: 'character'
    };
  }

  function setZoom(level) {
    state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(level)));
  }

  var ZOOM_MIN = 18;
  var ZOOM_MAX = 420;

  function toggleStrip(key) {
    state[key] = !state[key];
  }

  /* ---------- export api ---------- */
  LT.store = {
    state: state,
    derived: derived,
    ZOOM_MIN: ZOOM_MIN,
    ZOOM_MAX: ZOOM_MAX,
    actions: {
      newProject: newProject,
      loadProject: loadProject,
      deleteProject: deleteProject,
      importProject: importProject,
      exportProject: exportProject,
      exportFileName: exportFileName,
      restoreSession: restoreSession,
      persist: persist,
      notice: notice,
      undo: undo,
      redo: redo,

      addCharacter: addCharacter,
      updateCharacter: updateCharacter,
      removeCharacter: removeCharacter,
      addPlace: addPlace,
      placeByLabel: placeByLabel,
      characterByName: characterByName,

      addChapter: addChapter,
      updateChapter: updateChapter,
      addScene: addScene,
      updateScene: updateScene,
      removeScene: removeScene,
      moveScene: moveScene,
      moveSceneTo: moveSceneTo,

      getCell: getCell,
      ensureCell: ensureCell,
      setCellText: setCellText,
      setCellNote: setCellNote,
      setCellPresence: setCellPresence,
      cycleCellPresence: cycleCellPresence,
      clearCell: clearCell,

      setThreadCell: setThreadCell,
      clearThreadCell: clearThreadCell,

      select: select,
      selectCell: selectCell,
      selectScene: selectScene,
      selectCharacter: selectCharacter,
      setZoom: setZoom,
      setRailOpen: setRailOpen,
      toggleRail: toggleRail,
      setRailWidth: setRailWidth,
      setInspectorWidth: setInspectorWidth,
      toggleStrip: toggleStrip,
      setTheme: setTheme
    }
  };
})(window.LT = window.LT || {});
