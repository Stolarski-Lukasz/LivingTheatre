/* LivingTheatre — data model, ids, factories, migrations.
   This file defines the project contract. Django will serve the exact same
   shape later, so nothing here should depend on browser-only APIs. */
(function (LT) {
  'use strict';

  var SCHEMA_VERSION = 1;

  /* ---------- ids ---------- */
  var idCounter = 0;
  function uid(prefix) {
    idCounter += 1;
    var rand = Math.random().toString(36).slice(2, 8);
    return (prefix || 'id') + '_' + idCounter.toString(36) + rand;
  }

  /* ---------- story time ----------
     A story time is a label plus a sortable key. "1.5" and "1.10" must sort
     numerically, not lexically, so the label is parsed into major/minor.
     A real ISO date collapses to a single major (epoch ms). Swapping in a
     fantasy calendar later means changing only parseStoryTime. */
  var TIME_RE = /^\s*(\d+)\s*[.:]\s*(\d+)\s*$/;
  var ISO_RE = /^\s*(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;

  function parseStoryTime(label) {
    if (label === null || label === undefined) return null;
    var s = String(label).trim();
    if (s === '' || s === '-') return null;

    var m = TIME_RE.exec(s);
    if (m) {
      return {
        label: m[1] + '.' + m[2],
        major: parseInt(m[1], 10),
        minor: parseInt(m[2], 10),
        kind: 'compound'
      };
    }

    var d = ISO_RE.exec(s);
    if (d) {
      var ms = Date.UTC(
        +d[1], +d[2] - 1, +d[3],
        d[4] ? +d[4] : 0,
        d[5] ? +d[5] : 0,
        d[6] ? +d[6] : 0
      );
      return { label: s, major: ms, minor: 0, kind: 'date' };
    }

    var n = Number(s);
    if (!isNaN(n) && isFinite(n)) {
      return { label: s, major: n, minor: 0, kind: 'number' };
    }
    return null;
  }

  function compareStoryTime(a, b) {
    var ta = typeof a === 'string' ? parseStoryTime(a) : a;
    var tb = typeof b === 'string' ? parseStoryTime(b) : b;
    if (!ta && !tb) return 0;
    if (!ta) return -1;
    if (!tb) return 1;
    if (ta.major !== tb.major) return ta.major - tb.major;
    return ta.minor - tb.minor;
  }

  function timeLabel(t) {
    if (!t) return '';
    return typeof t === 'string' ? t : t.label;
  }

  /* ---------- enumerations ---------- */
  var PRESENCE = {
    ABSENT: 'absent',
    IDLE: 'idle',
    ACTIVE: 'active'
  };

  var PRESENCE_ORDER = [PRESENCE.ABSENT, PRESENCE.IDLE, PRESENCE.ACTIVE];

  var SCENE_MODES = [
    { id: 'linear', label: 'Linear' },
    { id: 'flashback', label: 'Flashback' },
    { id: 'flashforward', label: 'Flash-forward' },
    { id: 'dream', label: 'Dream' },
    { id: 'vision', label: 'Vision' }
  ];

  var LINK_TYPES = [
    { id: 'setup', label: 'Setup', inverse: 'payoff' },
    { id: 'payoff', label: 'Payoff', inverse: 'setup' },
    { id: 'cause', label: 'Cause', inverse: 'effect' },
    { id: 'effect', label: 'Effect', inverse: 'cause' },
    { id: 'reference', label: 'Reference', inverse: 'reference' }
  ];

  var ZOOM_LEVELS = [
    { id: 0, label: 'Chapters', hint: 'One block per chapter' },
    { id: 1, label: 'Scenes', hint: 'The working grid' },
    { id: 2, label: 'Scenes + text', hint: 'Inline cell text' },
    { id: 3, label: 'Beats', hint: 'Sub-scene units' }
  ];

  var THREAD_KINDS = [
    { id: 'setup', label: 'Setup' },
    { id: 'advance', label: 'Advance' },
    { id: 'payoff', label: 'Payoff' },
    { id: 'resolve', label: 'Resolve' }
  ];

  /* ---------- palette ----------
     Characters and threads need stable, distinguishable hues. */
  var PALETTE = [
    '#e05263', '#3d7dd8', '#2fa06a', '#c78a1e', '#8256c4',
    '#0f9aa8', '#c4573a', '#5b6b7a', '#b23a8c', '#6b8f2a',
    '#d07d1f', '#3a5fa8'
  ];
  function colorForIndex(i) { return PALETTE[i % PALETTE.length]; }

  /* ---------- factories ---------- */
  function createProject(overrides) {
    var p = {
      meta: {
        id: uid('prj'),
        title: 'Untitled story',
        author: '',
        unitLabel: DEFAULT_UNIT_LABEL,
        schemaVersion: SCHEMA_VERSION,
        created: nowISO(),
        modified: nowISO()
      },
      entities: { characters: [], places: [], threads: [] },
      chapters: [],
      scenes: [],
      cells: [],
      threadCells: [],
      links: []
    };
    return Object.assign(p, overrides || {});
  }

  function nowISO() { return new Date().toISOString(); }

  function createCharacter(props) {
    props = props || {};
    return {
      id: props.id || uid('chr'),
      name: props.name || 'New character',
      color: props.color || colorForIndex(Math.floor(Math.random() * PALETTE.length)),
      summary: props.summary || '',
      role: props.role || '',
      status: props.status || 'active',
      want: props.want || '',
      fear: props.fear || '',
      arc: props.arc || '',
      voice: props.voice || '',
      secrets: props.secrets || '',
      notes: props.notes || ''
    };
  }

  function createPlace(props) {
    props = props || {};
    return {
      id: props.id || uid('plc'),
      name: props.name || 'New place',
      parentId: props.parentId || null,
      summary: props.summary || ''
    };
  }

  function createThread(props) {
    props = props || {};
    return {
      id: props.id || uid('thr'),
      name: props.name || 'New thread',
      color: props.color || colorForIndex(Math.floor(Math.random() * PALETTE.length)),
      summary: props.summary || ''
    };
  }

  function createChapter(props) {
    props = props || {};
    return {
      id: props.id || uid('chp'),
      title: props.title || '',
      order: props.order === undefined ? 0 : props.order,
      summary: props.summary || ''
    };
  }

  function createScene(props) {
    props = props || {};
    return {
      id: props.id || uid('scn'),
      chapterId: props.chapterId || null,
      order: props.order === undefined ? 0 : props.order,
      title: props.title || 'New scene',
      storyStart: props.storyStart === undefined ? null : props.storyStart,
      storyEnd: props.storyEnd === undefined ? null : props.storyEnd,
      mode: props.mode || 'linear',
      sourceSceneId: props.sourceSceneId || null,
      pov: props.pov === undefined ? null : props.pov,
      povIsNarrator: props.povIsNarrator === undefined ? true : props.povIsNarrator,
      placeId: props.placeId || null,
      placeLabel: props.placeLabel || '',
      hidden: props.hidden || false,
      summary: props.summary || '',
      tags: props.tags || []
    };
  }

  function createCell(props) {
    props = props || {};
    return {
      id: props.id || uid('cel'),
      sceneId: props.sceneId,
      entityId: props.entityId,
      presence: props.presence || PRESENCE.IDLE,
      text: props.text || '',
      note: props.note || ''
    };
  }

  function createThreadCell(props) {
    props = props || {};
    return {
      id: props.id || uid('tcl'),
      sceneId: props.sceneId,
      threadId: props.threadId,
      kind: props.kind || 'advance',
      text: props.text || '',
      note: props.note || ''
    };
  }

  function createLink(props) {
    props = props || {};
    return {
      id: props.id || uid('lnk'),
      type: props.type || 'setup',
      fromSceneId: props.fromSceneId,
      toSceneId: props.toSceneId,
      label: props.label || ''
    };
  }

  /* ---------- the unit above a scene ----------
     "Chapter" is only the default name for the unit that groups scenes:
     the same work may be written in Acts, Parts, Books or Episodes. The
     label is stored per project and every auto-generated title, section
     head, tab and band reads it, so the whole interface follows the work
     instead of lecturing it. An empty label falls back to 'Chapter'. */
  var DEFAULT_UNIT_LABEL = 'Chapter';

  function unitLabel(project) {
    var l = project && project.meta && project.meta.unitLabel;
    l = typeof l === 'string' ? l.trim() : '';
    return l ? l.slice(0, 24) : DEFAULT_UNIT_LABEL;
  }

  function unitTitle(project, index) {
    return unitLabel(project) + ' ' + (index + 1);
  }

  /* Chapters carry an order field, but the presentation order of the scenes
     is the authority: a chapter's number is where its scenes first appear.
     This keeps drag-and-drop honest — moving scenes can never leave the
     chapter list disagreeing with the matrix. Chapters that own no scenes
     keep their relative order at the end. */
  function chapterSequence(project) {
    var list = ((project && project.chapters) || []).filter(function (c) { return !!c; });
    var seen = Object.create(null);
    var unique = [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (!list[i].id || seen[list[i].id]) continue;
      seen[list[i].id] = true;
      unique.push(list[i]);
    }
    var byIdc = Object.create(null);
    unique.forEach(function (c) { byIdc[c.id] = c; });

    /* Walk the scenes in presentation order; a chapter takes its place the
       first time one of its scenes shows up. */
    var scenes = (project && project.scenes) || [];
    var sorted = scenes.every(function (s) { return typeof s.order === 'number'; })
      ? scenes.slice().sort(function (a, b) { return a.order - b.order; })
      : scenes;
    var used = Object.create(null);
    var out = [];
    for (i = 0; i < sorted.length; i++) {
      var id = sorted[i] && sorted[i].chapterId;
      if (!id || used[id]) continue;
      var ch = byIdc[id];
      if (!ch) continue;
      used[id] = true;
      out.push(ch);
    }
    var rest = unique.filter(function (c) { return !used[c.id]; });
    return out.concat(rest);
  }

  /* ---------- lookup helpers ---------- */
  function byId(list, id) {
    if (!id) return null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function indexById(list) {
    var map = Object.create(null);
    for (var i = 0; i < list.length; i++) map[list[i].id] = list[i];
    return map;
  }

  function sceneTime(scene) {
    if (!scene) return null;
    var t = parseStoryTime(scene.storyStart);
    if (!t) return null;
    if (scene.storyEnd) {
      var e = parseStoryTime(scene.storyEnd);
      if (e) return { start: t, end: e, span: compareStoryTime(e, t) >= 0 };
    }
    return { start: t, end: null, span: true };
  }

  /* ---------- normalisation ----------
     Defensive: a project may arrive from a user-supplied JSON file, an
     import, or (later) Django. Missing fields are filled, orderings sorted,
     and dangling references cleared. */
  function normalize(project) {
    if (!project || typeof project !== 'object') return createProject();

    var p = project;
    p.meta = Object.assign({
      id: uid('prj'),
      title: 'Untitled story',
      author: '',
      unitLabel: DEFAULT_UNIT_LABEL,
      created: nowISO(),
      modified: nowISO()
    }, p.meta || {});

    p.entities = p.entities || {};
    p.entities.characters = (p.entities.characters || []).map(function (c, i) {
      c.id = c.id || uid('chr');
      c.name = c.name || ('Character ' + (i + 1));
      c.color = c.color || colorForIndex(i);
      c.summary = c.summary || '';
      c.role = c.role || '';
      c.status = c.status || 'active';
      /* arc replaces the unused arcs array; flatten it if an old file has one */
      if (typeof c.arc !== 'string') {
        c.arc = Array.isArray(c.arcs) ? c.arcs.join(' ') : (c.arcs || '');
      }
      delete c.arcs;
      c.want = c.want || '';
      c.fear = c.fear || '';
      c.voice = c.voice || '';
      c.secrets = c.secrets || '';
      c.notes = c.notes || '';
      return c;
    });
    p.entities.places = (p.entities.places || []).map(function (x) {
      x.id = x.id || uid('plc');
      x.name = x.name || 'New place';
      x.parentId = x.parentId || null;
      x.summary = x.summary || '';
      return x;
    });
    p.entities.threads = (p.entities.threads || []).map(function (t, i) {
      t.id = t.id || uid('thr');
      t.name = t.name || ('Thread ' + (i + 1));
      t.color = t.color || colorForIndex(i + 6);
      t.summary = t.summary || '';
      return t;
    });

    /* Titles are left empty here: a chapter is numbered and named only once
       its scenes' presentation order is known (see below). */
    p.chapters = (p.chapters || []).map(function (c, i) {
      c.id = c.id || uid('chp');
      c.title = typeof c.title === 'string' ? c.title.trim() : '';
      if (typeof c.order !== 'number') c.order = i;
      c.summary = c.summary || '';
      return c;
    });

    p.scenes = (p.scenes || []).map(function (s, i) {
      s.id = s.id || uid('scn');
      if (typeof s.order !== 'number') s.order = i;
      s.title = s.title || ('Scene ' + (i + 1));
      s.storyStart = s.storyStart === undefined ? null : s.storyStart;
      s.storyEnd = s.storyEnd === undefined ? null : s.storyEnd;
      s.mode = s.mode || 'linear';
      s.sourceSceneId = s.sourceSceneId || null;
      s.pov = s.pov || null;
      if (typeof s.povIsNarrator !== 'boolean') s.povIsNarrator = !s.pov;
      s.placeId = s.placeId || null;
      s.placeLabel = s.placeLabel || '';
      s.hidden = !!s.hidden;
      s.summary = s.summary || '';
      s.tags = s.tags || [];
      return s;
    }).sort(function (a, b) { return a.order - b.order; });

    /* The presentation order of the scenes decides the chapter order, so
       the two can never disagree. Chapters with no scenes keep their
       relative order at the end and are still numbered. */
    p.chapters = chapterSequence(p);
    p.chapters.forEach(function (c, i) {
      c.order = i;
      if (!c.title) c.title = unitTitle(p, i);
    });

    p.cells = (p.cells || []).map(function (c) {
      c.id = c.id || uid('cel');
      c.presence = PRESENCE_ORDER.indexOf(c.presence) === -1
        ? PRESENCE.IDLE : c.presence;
      c.text = c.text || '';
      c.note = c.note || '';
      return c;
    });
    p.threadCells = (p.threadCells || []).map(function (c) {
      c.id = c.id || uid('tcl');
      c.kind = c.kind || 'advance';
      c.text = c.text || '';
      c.note = c.note || '';
      return c;
    });
    p.links = (p.links || []).map(function (l) {
      l.id = l.id || uid('lnk');
      l.type = l.type || 'setup';
      l.label = l.label || '';
      return l;
    });

    p.links = pruneDangling(p);
    p.meta.schemaVersion = SCHEMA_VERSION;
    return p;
  }

  function pruneDangling(p) {
    var sceneIds = indexById(p.scenes);
    var charIds = indexById(p.entities.characters);
    var threadIds = indexById(p.entities.threads);
    var chapterIds = indexById(p.chapters);

    p.cells = p.cells.filter(function (c) {
      return sceneIds[c.sceneId] && charIds[c.entityId];
    });
    p.threadCells = p.threadCells.filter(function (c) {
      return sceneIds[c.sceneId] && threadIds[c.threadId];
    });
    p.links = p.links.filter(function (l) {
      return sceneIds[l.fromSceneId] && sceneIds[l.toSceneId];
    });
    p.scenes.forEach(function (s) {
      if (s.pov && !charIds[s.pov]) { s.pov = null; s.povIsNarrator = true; }
      /* An ungrouped scene is a state the interface can show; a scene
         pointing at a chapter that does not exist is not. */
      if (s.chapterId && !chapterIds[s.chapterId]) s.chapterId = null;
    });
    return p.links;
  }

  /* ---------- migrations ----------
     One function per version step, applied in sequence on load. */
  var MIGRATIONS = {
    // 0 -> 1: the initial documented shape. Older hand-written files are
    // filled in by normalize() rather than migrated structurally.
  };

  function migrate(project) {
    var p = project || createProject();
    var from = (p.meta && p.meta.schemaVersion) || 0;
    for (var v = from; v < SCHEMA_VERSION; v++) {
      if (MIGRATIONS[v]) p = MIGRATIONS[v](p) || p;
    }
    p.meta.schemaVersion = SCHEMA_VERSION;
    return normalize(p);
  }

  /* ---------- validation ---------- */
  function validate(project) {
    var errors = [];
    var warnings = [];
    if (!project || typeof project !== 'object') {
      errors.push('Not a project object.');
      return { ok: false, errors: errors, warnings: warnings };
    }
    if (!project.meta) errors.push('Missing meta.');
    if (!project.scenes) errors.push('Missing scenes.');
    if (project.scenes && !project.scenes.length) {
      warnings.push('Project has no scenes.');
    }
    if (project.scenes && project.chapters &&
        project.scenes.some(function (s) { return !s.chapterId; })) {
      warnings.push('Some scenes belong to no ' + unitLabel(project).toLowerCase() + '.');
    }
    if (project.meta && project.meta.schemaVersion > SCHEMA_VERSION) {
      errors.push(
        'Project uses schema version ' + project.meta.schemaVersion +
        ', this build understands ' + SCHEMA_VERSION + '.'
      );
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  /* ---------- export ---------- */
  LT.model = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    PRESENCE: PRESENCE,
    PRESENCE_ORDER: PRESENCE_ORDER,
    SCENE_MODES: SCENE_MODES,
    LINK_TYPES: LINK_TYPES,
    THREAD_KINDS: THREAD_KINDS,
    ZOOM_LEVELS: ZOOM_LEVELS,
    PALETTE: PALETTE,

    uid: uid,
    colorForIndex: colorForIndex,
    parseStoryTime: parseStoryTime,
    compareStoryTime: compareStoryTime,
    timeLabel: timeLabel,
    sceneTime: sceneTime,
    unitLabel: unitLabel,
    unitTitle: unitTitle,
    chapterSequence: chapterSequence,

    createProject: createProject,
    createCharacter: createCharacter,
    createPlace: createPlace,
    createThread: createThread,
    createChapter: createChapter,
    createScene: createScene,
    createCell: createCell,
    createThreadCell: createThreadCell,
    createLink: createLink,

    byId: byId,
    indexById: indexById,
    normalize: normalize,
    migrate: migrate,
    validate: validate
  };
})(window.LT = window.LT || {});
