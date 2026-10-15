/* LivingTheatre — import.
   Reads a spreadsheet (CSV / ODS / XLSX) shaped like the plot-analysis
   workbook: label rows for chapter, scene, story time, place and POV,
   followed by one row per character. Produces a project document.

   Robustness notes: attribute rows are found by label rather than by fixed
   position, merged chapter spans are resolved by forward-fill, and sparse
   place/POV rows are forward-filled from the previous scene. */
(function (LT) {
  'use strict';

  var model = LT.model;

  var LABELS = {
    chapter: ['rozdział', 'rozdzial', 'chapter', 'dział', 'część', 'czesc'],
    scene:   ['scena', 'scene', 'sceny'],
    time:    ['czas akcji', 'czas', 'story time', 'time', 'oś czasu', 'os czasu'],
    place:   ['miejsce', 'place', 'lokalizacja', 'location'],
    pov:     ['perspektywa', 'perspective', 'pov', 'punkt widzenia']
  };

  function norm(s) {
    return String(s === null || s === undefined ? '' : s)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  /* Real workbooks contain typos ("Perspekrywa"). Label rows are structural,
     so a near miss is far more costly than a loose match. */
  function editDistance(a, b) {
    if (a === b) return 0;
    var prev = new Array(b.length + 1);
    var curr = new Array(b.length + 1);
    for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (var k = 1; k <= b.length; k++) {
        var cost = a[i - 1] === b[k - 1] ? 0 : 1;
        curr[k] = Math.min(prev[k] + 1, curr[k - 1] + 1, prev[k - 1] + cost);
      }
      var swap = prev; prev = curr; curr = swap;
    }
    return prev[b.length];
  }

  function tolerance(s) {
    return s.length <= 4 ? 0 : s.length <= 8 ? 1 : 2;
  }

  function matchLabel(value, key) {
    var v = norm(value);
    if (!v) return false;
    var names = LABELS[key];
    for (var i = 0; i < names.length; i++) {
      if (v === names[i]) return true;
      if (v.indexOf(names[i]) === 0) return true;
      if (editDistance(v, names[i]) <= tolerance(names[i])) return true;
    }
    return false;
  }

  function isLabelRow(row) {
    var first = norm(row[0]);
    if (!first) return false;
    var keys = Object.keys(LABELS);
    for (var i = 0; i < keys.length; i++) {
      if (matchLabel(first, keys[i])) return true;
    }
    return false;
  }

  /* ---------- table reading ---------- */
  function parseDelimited(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var delimiter = sniffDelimiter(text);

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field); field = '';
      } else if (ch === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else if (ch === '\r') {
        /* skip; the \n branch flushes */
      } else {
        field += ch;
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.map(rtrim).filter(function (r) {
      return r.some(function (c) { return norm(c) !== ''; });
    });
  }

  function rtrim(row) {
    var out = row.slice();
    while (out.length && norm(out[out.length - 1]) === '') out.pop();
    return out;
  }

  function sniffDelimiter(text) {
    var firstLine = text.split(/\r?\n/)[0] || '';
    var counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
    var inQuotes = false;
    for (var i = 0; i < firstLine.length; i++) {
      var ch = firstLine[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && counts[ch] !== undefined) counts[ch]++;
    }
    var best = ',', bestCount = -1;
    Object.keys(counts).forEach(function (k) {
      if (counts[k] > bestCount) { best = k; bestCount = counts[k]; }
    });
    return bestCount > 0 ? best : ',';
  }

  function readFile(file, done, fail) {
    var name = (file.name || '').toLowerCase();
    var ext = name.slice(name.lastIndexOf('.') + 1);

    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          done(parseDelimited(String(reader.result)));
        } catch (e) { fail(e); }
      };
      reader.onerror = function () { fail(new Error('Could not read file.')); };
      reader.readAsText(file, 'utf-8');
      return;
    }

    if (ext === 'ods' || ext === 'xlsx' || ext === 'xls') {
      var fr = new FileReader();
      fr.onload = function () {
        try {
          if (!window.XLSX) throw new Error('Spreadsheet library not loaded.');
          var wb = XLSX.read(new Uint8Array(fr.result), { type: 'array' });
          var sheetName = pickSheet(wb);
          var sheet = wb.Sheets[sheetName];
          var rows = XLSX.utils.sheet_to_json(sheet, {
            header: 1, defval: '', raw: false, blankrows: false
          });
          done(rows.map(function (r) {
            return r.map(function (c) { return c === null || c === undefined ? '' : String(c); });
          }).filter(function (r) {
            return r.some(function (c) { return norm(c) !== ''; });
          }));
        } catch (e) { fail(e); }
      };
      fr.onerror = function () { fail(new Error('Could not read file.')); };
      fr.readAsArrayBuffer(file);
      return;
    }

    fail(new Error('Unsupported file type: .' + ext));
  }

  function pickSheet(wb) {
    var names = wb.SheetNames || [];
    for (var i = 0; i < names.length; i++) {
      if (matchLabel(names[i], 'scene')) return names[i];
    }
    return names[0];
  }

  /* ---------- presence detection ---------- */
  function classify(raw) {
    var v = norm(raw);
    if (v === '') return { presence: model.PRESENCE.ABSENT, text: '' };
    if (v === 'x' || v === '-' || v === '—') {
      return { presence: model.PRESENCE.IDLE, text: '' };
    }
    return { presence: model.PRESENCE.ACTIVE, text: String(raw).trim() };
  }

  var MENTION_RE = /^\(\s*(.+?)\s*\)$/;

  /* ---------- main conversion ---------- */
  function tableToProject(rows, options) {
    options = options || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('The file is empty. Expected a spreadsheet where each column is a scene.');
    }
    var project = model.createProject({
      meta: {
        title: options.title || 'Imported story',
        author: options.author || ''
      }
    });

    var header = {};
    var dataRows = [];
    var warningList = [];
    var matchedLabels = 0;

    /* ---- pass 1: split label rows from character rows ---- */
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (!row || !row.length) continue;

      var key = null;
      Object.keys(LABELS).forEach(function (k) {
        if (!key && matchLabel(row[0], k)) key = k;
      });

      if (key) {
        header[key] = row.slice(1);
        matchedLabels++;
        continue;
      }

      if (norm(row[0]) === '') continue;   /* separator row */
      dataRows.push(row);
    }

    /* If no scene row was labelled, synthesise one from the widest row. */
    if (!header.scene) {
      var width = 0;
      dataRows.forEach(function (row) { if (row.length > width) width = row.length; });
      for (var w = 1; w < width; w++) (header.scene = header.scene || []).push('');
    }
    if (!header.scene || header.scene.length === 0) {
      throw new Error('No scenes found. The sheet needs at least one character row with two or more columns.');
    }
    if (matchedLabels === 0) {
      throw new Error(
        'No recognised column labels. Expected rows such as "Scena", "Czas akcji", ' +
        '"Miejsce", "Perspektywa" or "Rozdział" in the first column.'
      );
    }
    var sceneCount = header.scene.length;

    /* ---- pass 2: character names and raw values ---- */
    var characters = [];
    var characterOffstage = [];
    dataRows.forEach(function (row) {
      var rawName = String(row[0]).trim();
      var mentionMatch = MENTION_RE.exec(rawName);
      var displayName = mentionMatch ? mentionMatch[1] : rawName;
      var values = [];
      for (var s = 1; s <= sceneCount; s++) {
        values.push(row[s] === undefined ? '' : String(row[s]));
      }
      characters.push({ name: displayName, offstage: !!mentionMatch, values: values });
    });

    /* ---- chapters (forward-fill merged spans) ----
       A sheet with no chapter row at all says nothing about how the work is
       divided, so its scenes stay ungrouped rather than being dropped into
       an invented chapter. A row that is present but blank at the start is
       different: that is an untitled span, and it is kept. */
    var chapters = [];
    var current = null;
    var chapterCol = header.chapter || [];
    var sceneRefs = [];
    var hasChapterRow = !!header.chapter && chapterCol.some(function (v) {
      return String(v === undefined ? '' : v).trim() !== '';
    });
    for (var i = 0; i < sceneCount; i++) {
      var raw = String(chapterCol[i] === undefined ? '' : chapterCol[i]).trim();
      if (raw) {
        current = model.createChapter({ title: raw, order: chapters.length });
        chapters.push(current);
      } else if (!current && hasChapterRow) {
        current = model.createChapter({ title: 'Untitled', order: 0 });
        chapters.push(current);
      }
      sceneRefs.push({ chapter: current, index: i });
    }

    /* ---- forward-filled attribute columns ---- */
    var times = forwardFill(header.time || [], sceneCount);
    var places = forwardFill(header.place || [], sceneCount);
    var povs = forwardFill(header.pov || [], sceneCount);

    project.chapters = chapters;

    /* ---- characters ---- */
    var narratorNames = ['narrator', 'narracja', 'nieokreślony', 'trzecia osoba'];
    project.entities.characters = characters.map(function (c, idx) {
      return model.createCharacter({
        name: c.name,
        color: model.colorForIndex(idx),
        status: c.offstage ? 'mentioned' : 'active'
      });
    });

    function characterByName(name) {
      for (var i = 0; i < project.entities.characters.length; i++) {
        if (norm(project.entities.characters[i].name) === norm(name)) {
          return project.entities.characters[i];
        }
      }
      return null;
    }

    /* ---- places: split "Dom – pokój Karola" into parent/child ---- */
    var placeIndex = Object.create(null);
    function placeFor(label) {
      var key = norm(label);
      if (!key) return null;
      if (placeIndex[key]) return placeIndex[key];
      var parts = String(label).split(/\s+[–—-]\s+/);
      var made = null;
      if (parts.length > 1) {
        var parent = null;
        var pk = norm(parts[0]);
        if (placeIndex[pk]) {
          parent = placeIndex[pk];
        } else {
          parent = model.createPlace({ name: parts[0].trim() });
          project.entities.places.push(parent);
          placeIndex[pk] = parent;
        }
        made = model.createPlace({ name: parts[1].trim(), parentId: parent.id });
        project.entities.places.push(made);
        placeIndex[key] = made;
      } else {
        made = model.createPlace({ name: String(label).trim() });
        project.entities.places.push(made);
        placeIndex[key] = made;
      }
      return made;
    }

    /* ---- scenes ---- */
    project.scenes = sceneRefs.map(function (ref, i) {
      var sceneTitle = (header.scene[i] || '').trim();
      var povLabel = norm(povs[i]);
      var isNarrator = narratorNames.indexOf(povLabel) !== -1 || !povLabel;
      var povChar = null;
      if (!isNarrator) {
        povChar = characterByName(povs[i]);
        if (!povChar) {
          povChar = model.createCharacter({
            name: povs[i].trim(),
            color: model.colorForIndex(project.entities.characters.length)
          });
          project.entities.characters.push(povChar);
          characters.push({ name: povChar.name, offstage: false, values: [] });
          warningList.push('POV "' + povChar.name + '" had no character row; one was created.');
        }
      }
      var place = placeFor(places[i]);
      var title = sceneTitle || ('Scene ' + (i + 1));
      var hidden = /^\[.+\]$/.test(title.trim());
      if (hidden) title = title.trim().slice(1, -1).trim();

      return model.createScene({
        chapterId: ref.chapter ? ref.chapter.id : null,
        order: i,
        title: title,
        storyStart: times[i] || null,
        storyEnd: null,
        mode: 'linear',
        pov: povChar ? povChar.id : null,
        povIsNarrator: isNarrator,
        placeId: place ? place.id : null,
        placeLabel: places[i] || '',
        hidden: hidden
      });
    });

    /* ---- cells ---- */
    characters.forEach(function (c, ci) {
      var character = project.entities.characters[ci];
      if (!character) return;
      c.values.forEach(function (raw, si) {
        if (raw === undefined || norm(raw) === '') return;
        var info = classify(raw);
        project.cells.push(model.createCell({
          sceneId: project.scenes[si].id,
          entityId: character.id,
          presence: info.presence,
          text: info.text
        }));
      });
    });

    project = model.normalize(project);

    return {
      project: project,
      warnings: warningList
    };
  }

  function forwardFill(row, width) {
    var out = [];
    var last = '';
    for (var i = 0; i < width; i++) {
      var v = (row[i] === undefined ? '' : String(row[i])).trim();
      if (v) last = v;
      out.push(last);
    }
    return out;
  }

  function importFile(file, done, fail) {
    readFile(file, function (rows) {
      try {
        var result = tableToProject(rows, { title: stripExt(file.name) });
        done(result.project, result.warnings);
      } catch (e) {
        fail(e);
      }
    }, fail);
  }

  function stripExt(name) {
    return String(name || 'Imported story').replace(/\.[^.]+$/, '');
  }

  function importTable(rows, options) {
    return tableToProject(rows, options || {});
  }

  LT.importer = {
    importFile: importFile,
    importTable: importTable,
    parseDelimited: parseDelimited,
    classify: classify
  };
})(window.LT = window.LT || {});
