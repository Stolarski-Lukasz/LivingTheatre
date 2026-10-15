/* LivingTheatre — analytics.
   Pure functions over a project document. No store access, no side effects:
   these are the queries that later become MCP tools and LangGraph nodes, so
   they stay pure and independently testable. */
(function (LT) {
  'use strict';

  var model = LT.model;

  function sceneLabel(scene, project) {
    if (!scene) return '(missing)';
    var n = scene.order + 1;
    return 'Scene ' + n + (scene.title ? ' · ' + scene.title : '');
  }

  function characterName(id, project) {
    var c = model.byId(project.entities.characters, id);
    return c ? c.name : '(unknown)';
  }

  function placeLabel(scene, project) {
    if (scene.placeLabel) return scene.placeLabel;
    var p = model.byId(project.entities.places, scene.placeId);
    if (!p) return '';
    var parent = p.parentId ? model.byId(project.entities.places, p.parentId) : null;
    return parent ? parent.name + ' – ' + p.name : p.name;
  }

  /* ---------- thread analytics ---------- */

  /* A thread is "dead" when its last appearance sits well before the end of
     the story. Threads that open and never recur at all are the strongest
     signal of a dropped plotline. */
  function deadThreads(project, options) {
    options = options || {};
    var tailRatio = options.tailRatio === undefined ? 0.2 : options.tailRatio;
    var total = project.scenes.length;
    if (!total) return [];
    var cutoff = total * (1 - tailRatio);
    var out = [];

    project.entities.threads.forEach(function (thread) {
      var appearances = [];
      project.threadCells.forEach(function (c) {
        if (c.threadId !== thread.id) return;
        var scene = model.byId(project.scenes, c.sceneId);
        if (scene) appearances.push({ scene: scene, cell: c });
      });
      if (!appearances.length) return;
      appearances.sort(function (a, b) { return a.scene.order - b.scene.order; });
      var last = appearances[appearances.length - 1].scene.order;
      if (last < cutoff) {
        out.push({
          threadId: thread.id,
          name: thread.name,
          count: appearances.length,
          firstOrder: appearances[0].scene.order,
          lastOrder: last,
          scenesSince: total - 1 - last,
          kind: appearances.length === 1 ? 'single' : 'dormant'
        });
      }
    });
    return out.sort(function (a, b) {
      if (a.scenesSince !== b.scenesSince) return b.scenesSince - a.scenesSince;
      return a.count - b.count;
    });
  }

  /* Unpaid setups: a setup with no matching payoff anywhere. */
  function unpaidSetups(project) {
    var byFrom = Object.create(null);
    project.links.forEach(function (l) { byFrom[l.fromSceneId] = true; });
    return project.links.filter(function (l) {
      if (l.type !== 'setup') return false;
      return !byFrom[l.toSceneId];
    }).map(function (l) {
      return {
        link: l,
        from: model.byId(project.scenes, l.fromSceneId),
        to: model.byId(project.scenes, l.toSceneId)
      };
    });
  }

  function openThreads(project) {
    return project.entities.threads.filter(function (t) {
      var cells = project.threadCells.filter(function (c) { return c.threadId === t.id; });
      if (!cells.length) return false;
      return !cells.some(function (c) { return c.kind === 'resolve'; });
    }).map(function (t) {
      return { thread: t, cells: project.threadCells.filter(function (c) { return c.threadId === t.id; }) };
    });
  }

  /* ---------- presence analytics ---------- */

  function presenceMatrix(project) {
    var map = Object.create(null);
    project.entities.characters.forEach(function (c) { map[c.id] = Object.create(null); });
    project.cells.forEach(function (cell) {
      if (!map[cell.entityId]) return;
      map[cell.entityId][cell.sceneId] = cell.presence;
    });
    return map;
  }

  function characterCoverage(project) {
    var matrix = presenceMatrix(project);
    var total = project.scenes.length;
    return project.entities.characters.map(function (c) {
      var active = 0, idle = 0;
      project.scenes.forEach(function (s) {
        var p = matrix[c.id] && matrix[c.id][s.id];
        if (p === 'active') active++;
        else if (p === 'idle') idle++;
      });
      var first = null, last = null;
      project.scenes.forEach(function (s) {
        var p = matrix[c.id] && matrix[c.id][s.id];
        if (p === 'active' || p === 'idle') {
          if (first === null) first = s.order;
          last = s.order;
        }
      });
      return {
        character: c,
        active: active,
        idle: idle,
        absent: total - active - idle,
        total: total,
        ratio: total ? (active + idle) / total : 0,
        firstOrder: first,
        lastOrder: last,
        vanished: last !== null && total - 1 - last > Math.max(2, total * 0.3)
      };
    }).sort(function (a, b) { return b.ratio - a.ratio; });
  }

  /* ---------- contradiction detection ----------
     Mechanically detectable only. Candidates are handed to the LLM later
     for resolution; this function never guesses a fix itself. */

  function overlaps(a, b) {
    var ta = model.sceneTime(a);
    var tb = model.sceneTime(b);
    if (!ta || !tb) return false;
    if (model.compareStoryTime(ta.start, tb.start) > 0) {
      var tmp = ta; ta = tb; tb = tmp;
    }
    if (!tb.end) return model.compareStoryTime(ta.start, tb.start) === 0;
    return model.compareStoryTime(ta.start, tb.end) < 0;
  }

  function contradictions(project, options) {
    options = options || {};
    /* With a coarse time axis ("2.1" is a beat, not an instant) many scenes
       legitimately share a stamp. Only a character who is active in two
       overlapping scenes set in *different* places is a hard conflict;
       place-vs-place on a shared stamp is the writer's prerogative, so it is
       reported only in strict mode. */
    var strict = !!options.strict;
    var out = [];
    var scenes = project.scenes;
    var activeByScene = {};
    scenes.forEach(function (s) {
      activeByScene[s.id] = activeCharacters(project, s.id);
    });

    for (var i = 0; i < scenes.length; i++) {
      for (var j = i + 1; j < scenes.length; j++) {
        var a = scenes[i], b = scenes[j];
        if (a.hidden || b.hidden) continue;
        if (!overlaps(a, b)) continue;

        var sameStamp = sameStoryTime(a, b);
        var differentPlace = !!(a.placeId && b.placeId && a.placeId !== b.placeId);

        if (differentPlace && !sameStamp) {
          out.push({
            kind: 'place',
            severity: 'warn',
            message: 'These scenes overlap in story time but are set in ' +
              'different places: "' + a.title + '" (' + placeLabel(a, project) +
              ') and "' + b.title + '" (' + placeLabel(b, project) + ').',
            sceneIds: [a.id, b.id]
          });
        }

        var ca = activeByScene[a.id];
        var cb = activeByScene[b.id];
        var shared = ca.filter(function (id) { return cb.indexOf(id) !== -1; });
        shared.forEach(function (id) {
          if (!differentPlace && !(strict && sameStamp)) return;
          out.push({
            kind: 'character',
            severity: 'warn',
            message: characterName(id, project) + ' is active in two scenes that ' +
              'overlap in story time' +
              (differentPlace ? ' and are set in different places' : '') + ': "' +
              a.title + '" (' + placeLabel(a, project) + ') and "' +
              b.title + '" (' + placeLabel(b, project) + ').',
            sceneIds: [a.id, b.id],
            entityId: id
          });
        });
      }
    }
    return out;
  }

  function sameStoryTime(a, b) {
    var ta = model.parseStoryTime(a.storyStart);
    var tb = model.parseStoryTime(b.storyStart);
    if (!ta || !tb) return false;
    return ta.major === tb.major && ta.minor === tb.minor;
  }

  function activeCharacters(project, sceneId) {
    return project.cells.filter(function (c) {
      return c.sceneId === sceneId && c.presence === model.PRESENCE.ACTIVE;
    }).map(function (c) { return c.entityId; });
  }

  /* A flashback should point at something. */
  function danglingTemporalModes(project) {
    return project.scenes.filter(function (s) {
      return (s.mode === 'flashback' || s.mode === 'flashforward') && !s.sourceSceneId;
    }).map(function (s) {
      return {
        kind: 'mode',
        severity: 'info',
        message: '"' + s.title + '" is a ' + s.mode + ' but does not point at its anchor scene.',
        sceneIds: [s.id]
      };
    });
  }

  function fullReport(project, options) {
    return {
      deadThreads: deadThreads(project),
      unpaidSetups: unpaidSetups(project),
      openThreads: openThreads(project),
      coverage: characterCoverage(project),
      contradictions: contradictions(project, options)
        .concat(danglingTemporalModes(project))
    };
  }

  /* ---------- context pack ----------
     The retrieval payload the LLM will eventually consume. Assembling it is
     plain data-shaping, so it belongs here rather than in the AI layer. */
  function contextForScene(project, sceneId) {
    var scene = model.byId(project.scenes, sceneId);
    if (!scene) return null;

    var cells = project.cells.filter(function (c) { return c.sceneId === sceneId; });
    var present = cells.map(function (c) {
      var ch = model.byId(project.entities.characters, c.entityId);
      return {
        id: c.entityId,
        name: ch ? ch.name : '(unknown)',
        role: ch ? ch.role : '',
        summary: ch ? ch.summary : '',
        want: ch ? ch.want : '',
        fear: ch ? ch.fear : '',
        arc: ch ? ch.arc : '',
        voice: ch ? ch.voice : '',
        secrets: ch ? ch.secrets : '',
        presence: c.presence,
        text: c.text,
        note: c.note
      };
    });

    var chapter = model.byId(project.chapters, scene.chapterId);
    var time = model.sceneTime(scene);

    var previousScenes = project.scenes
      .filter(function (s) { return s.order < scene.order; })
      .slice(-3);
    var nextScenes = project.scenes
      .filter(function (s) { return s.order > scene.order; })
      .slice(0, 2);

    var openThreadList = openThreads(project).map(function (o) {
      return {
        name: o.thread.name,
        summary: o.thread.summary,
        appearances: o.cells.map(function (c) {
          var s = model.byId(project.scenes, c.sceneId);
          return { order: s ? s.order : -1, kind: c.kind, text: c.text };
        })
      };
    });

    return {
      projectTitle: project.meta.title,
      chapter: chapter ? chapter.title : null,
      scene: {
        order: scene.order,
        title: scene.title,
        summary: scene.summary,
        mode: scene.mode,
        povIsNarrator: scene.povIsNarrator,
        povName: scene.povIsNarrator ? 'narrator' : characterName(scene.pov, project),
        place: placeLabel(scene, project),
        storyStart: model.timeLabel(time ? time.start : null),
        tags: scene.tags
      },
      present: present,
      recentScenes: previousScenes.map(function (s) { return { order: s.order, title: s.title }; }),
      upcomingScenes: nextScenes.map(function (s) { return { order: s.order, title: s.title }; }),
      openThreads: openThreadList,
      unpaidSetups: unpaidSetups(project).map(function (u) {
        return { from: u.from ? u.from.title : '?', to: u.to ? u.to.title : '?' };
      }),
      chronology: {
        nonLinear: project.scenes.some(function (s, i) {
          if (i === 0) return false;
          var prev = model.sceneTime(project.scenes[i - 1]);
          var cur = model.sceneTime(s);
          if (!prev || !cur) return false;
          return model.compareStoryTime(cur.start, prev.start) < 0;
        }),
        storySpan: model.timeLabel(model.parseStoryTime(project.scenes[0] && project.scenes[0].storyStart)) +
          ' → ' + model.timeLabel(model.parseStoryTime(project.scenes.length ? project.scenes[project.scenes.length - 1].storyStart : null))
      }
    };
  }

  LT.analytics = {
    deadThreads: deadThreads,
    unpaidSetups: unpaidSetups,
    openThreads: openThreads,
    presenceMatrix: presenceMatrix,
    characterCoverage: characterCoverage,
    contradictions: contradictions,
    danglingTemporalModes: danglingTemporalModes,
    fullReport: fullReport,
    contextForScene: contextForScene,
    overlaps: overlaps
  };
})(window.LT = window.LT || {});
