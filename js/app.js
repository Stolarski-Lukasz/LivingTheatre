/* LivingTheatre — application root.
   Owns selection routing, the toolbar wiring, modals, keyboard handling and
   persistence triggers. All state lives in LT.store; this file only routes. */
(function (LT) {
  'use strict';

  var model = LT.model;
  var store = LT.store;
  var a = store.actions;

  var App = {
    name: 'LivingTheatre',
    components: {
      LtTopBar: LT.components.TopBar,
      LtRail: LT.components.Rail,
      LtMatrix: LT.components.Matrix,
      LtRuler: LT.components.Ruler,
      LtInspector: LT.components.Inspector,
      LtMinimap: LT.components.Minimap,
      LtLibraryModal: LT.components.LibraryModal,
      LtHelpModal: LT.components.HelpModal
    },

    setup: function () {
      var s = store.state;
      var d = store.derived;

      var modal = Vue.reactive({ kind: null });
      var fileInput = Vue.ref(null);
      var jsonInput = Vue.ref(null);
      var railW = Vue.ref(232);
      var inspectorOpen = Vue.ref(true);
      var viewport = Vue.ref({ start: 0, end: 1 });
      var resizing = Vue.ref(false);
      var narrow = Vue.ref(false);

      a.restoreSession();

      /* ---------- selection ---------- */
      var selectedScene = Vue.computed(function () {
        return s.selection.sceneId ? d.value.sceneIndex[s.selection.sceneId] || null : null;
      });

      var selectedEntity = Vue.computed(function () {
        return s.selection.entityId ? d.value.charIndex[s.selection.entityId] || null : null;
      });

      var selectedCell = Vue.computed(function () {
        if (!s.selection.sceneId || !s.selection.entityId) return null;
        return d.value.cellMap[s.selection.sceneId + '|' + s.selection.entityId] || null;
      });

      var report = Vue.computed(function () {
        return LT.analytics.fullReport(s.project);
      });

      /* The rail yields to the inspector on narrow screens instead of
         squeezing both into the middle. */
      var mql = typeof window.matchMedia === 'function'
        ? window.matchMedia('(max-width: 1180px)') : null;
      function applyNarrow() { narrow.value = !!(mql && mql.matches); }
      var railVisible = Vue.computed(function () {
        return s.railOpen && !(narrow.value && inspectorOpen.value);
      });
      var shellStyle = Vue.computed(function () {
        return {
          gridTemplateColumns: (railVisible.value ? s.railW + 'px' : '0px') +
            ' 1fr ' + (inspectorOpen.value ? s.inspectorW + 'px' : '0px')
        };
      });

      var totals = Vue.computed(function () {
        var active = 0;
        s.project.cells.forEach(function (c) {
          if (c.presence === model.PRESENCE.ACTIVE) active++;
        });
        return {
          scenes: s.project.scenes.length,
          chars: s.project.entities.characters.length,
          active: active
        };
      });

      /* ---------- navigation ---------- */
      function scrollSceneIntoView(sceneId) {
        var el = document.querySelector('.scroll-stage');
        if (!el) return;
        var scene = null;
        var scenes = s.project.scenes;
        for (var i = 0; i < scenes.length; i++) {
          if (scenes[i].id === sceneId) { scene = scenes[i]; break; }
        }
        if (!scene) return;
        var rail = railW.value;
        var x = rail + scene.order * s.zoom;
        var left = el.scrollLeft;
        var right = left + el.clientWidth - rail;
        if (x < left || x + s.zoom > right) {
          el.scrollLeft = Math.max(0, x - (el.clientWidth - rail) / 2);
        }
      }

      function onSelectScene(sceneId) {
        s.selection.sceneId = sceneId;
        if (sceneId) scrollSceneIntoView(sceneId);
      }

      function onSelectCell(payload) {
        store.actions.selectCell(payload.sceneId, payload.entityId);
      }

      function onSelectEntity(entityId) {
        s.selection.entityId = entityId;
      }

      function onCycleCell(payload) {
        a.cycleCellPresence(payload.sceneId, payload.entityId);
      }

      function onEditCell(payload) {
        a.setCellText(payload.sceneId, payload.entityId, payload.text);
      }

      function onDropScene(payload) {
        if (a.moveSceneTo(payload.sceneId, payload.to)) {
          scrollSceneIntoView(payload.sceneId);
        }
      }

      function onMinimapJump(sceneId) {
        s.selection.sceneId = sceneId;
        scrollSceneIntoView(sceneId);
      }

      function onViewport(v) {
        viewport.value = v;
      }

      function onJumpReport(sceneId) {
        if (!sceneId) return;
        s.selection.sceneId = sceneId;
        scrollSceneIntoView(sceneId);
      }

      function moveScene(delta) {
        if (!s.selection.sceneId) return;
        if (a.moveScene(s.selection.sceneId, delta)) {
          scrollSceneIntoView(s.selection.sceneId);
        }
      }

      function stepScene(delta) {
        var scenes = s.project.scenes;
        if (!scenes.length) return;
        var i = 0;
        for (var k = 0; k < scenes.length; k++) {
          if (scenes[k].id === s.selection.sceneId) { i = k; break; }
        }
        var next = Math.max(0, Math.min(scenes.length - 1, i + delta));
        s.selection.sceneId = scenes[next].id;
        scrollSceneIntoView(scenes[next].id);
      }

      function stepCharacter(delta) {
        var chars = s.project.entities.characters;
        if (!chars.length) return;
        var i = -1;
        for (var k = 0; k < chars.length; k++) {
          if (chars[k].id === s.selection.entityId) { i = k; break; }
        }
        var next = Math.max(0, Math.min(chars.length - 1, i + delta));
        s.selection.entityId = chars[next].id;
      }

      /* ---------- inspector actions ---------- */
      function updateCell(text) {
        if (s.selection.sceneId && s.selection.entityId) {
          a.setCellText(s.selection.sceneId, s.selection.entityId, text);
        }
      }
      function updateNote(note) {
        if (s.selection.sceneId && s.selection.entityId) {
          a.setCellNote(s.selection.sceneId, s.selection.entityId, note);
        }
      }
      function setPresence(p) {
        if (s.selection.sceneId && s.selection.entityId) {
          a.setCellPresence(s.selection.sceneId, s.selection.entityId, p);
        }
      }
      function clearCell() {
        if (s.selection.sceneId && s.selection.entityId) {
          a.clearCell(s.selection.sceneId, s.selection.entityId);
        }
      }
      function updateScene(patch) {
        if (!s.selection.sceneId) return;
        a.updateScene(s.selection.sceneId, patch);
      }
      function removeScene() {
        if (s.selection.sceneId) a.removeScene(s.selection.sceneId);
      }

      /* ---------- entities & scenes ---------- */
      function addCharacter() {
        var c = a.addCharacter({ name: 'New character' });
        s.selection.entityId = c.id;
        a.notice('Added "' + c.name + '". Rename it in the rail.', 'ok');
      }

      function renameCharacter(id, name) {
        var next = String(name || '').trim();
        if (next) a.updateCharacter(id, { name: next });
      }

      function removeCharacter(id) {
        if (window.confirm('Remove this character and all of their cells?')) {
          a.removeCharacter(id);
        }
      }

      function cycleColor(id) {
        var c = model.byId(s.project.entities.characters, id);
        if (!c) return;
        var i = model.PALETTE.indexOf(c.color);
        a.updateCharacter(id, { color: model.PALETTE[(i + 1) % model.PALETTE.length] });
      }

      function addScene() {
        var sc = a.addScene({ title: 'New scene' });
        Vue.nextTick(function () { scrollSceneIntoView(sc.id); });
        a.notice('Scene added at the end. Drag its header to move it.', 'ok');
      }

      /* ---------- project io ---------- */
      function pickFile() {
        if (fileInput.value) fileInput.value.click();
      }

      function onFileChosen(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        importSheetFile(file);
        e.target.value = '';
      }

      function importSheetFile(file) {
        LT.importer.importFile(file, function (project, warnings) {
          a.importProject(JSON.parse(JSON.stringify(project)));
          if (warnings && warnings.length) a.notice(warnings[0], 'error');
          else a.notice('Imported "' + project.meta.title + '".', 'ok');
        }, function (err) {
          a.notice('Import failed: ' + err.message, 'error');
        });
      }

      function exportJSON() {
        var blob = new Blob([a.exportProject()], { type: 'application/json' });
        downloadBlob(blob, a.exportFileName() + '.json');
        a.notice('Exported project JSON.', 'ok');
      }

      function downloadBlob(blob, name) {
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }

      function importJSON() {
        if (jsonInput.value) jsonInput.value.click();
      }

      function onJSONChosen(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            a.importProject(String(reader.result));
          } catch (err) {
            a.notice('Not a valid project file.', 'error');
          }
        };
        reader.readAsText(file);
        e.target.value = '';
      }

      function loadSample() {
        var rows = LT.importer.parseDelimited(LT.fixtures.sampleCsv);
        try {
          var result = LT.importer.importTable(rows, { title: 'Fabuła – bez uwag' });
          a.importProject(JSON.parse(JSON.stringify(result.project)));
          if (result.warnings && result.warnings.length) a.notice(result.warnings[0], 'error');
          else a.notice('Sample loaded.', 'ok');
        } catch (err) {
          a.notice('Could not load sample: ' + err.message, 'error');
        }
        modal.kind = null;
      }

      function loadDemo() {
        a.importProject(JSON.parse(JSON.stringify(LT.demo.build())));
        modal.kind = null;
        a.notice('Demo loaded — note the flashback, the hidden event and the threads.', 'ok');
      }

      function newProject() {
        a.newProject('Untitled story');
        modal.kind = null;
        a.notice('New project created.', 'ok');
      }

      function loadProject(id) {
        a.loadProject(id);
        modal.kind = null;
      }

      function deleteProject(id) {
        if (window.confirm('Delete this project permanently?')) a.deleteProject(id);
      }

      function renameProject(title) {
        s.project.meta.title = title;
        a.persist();
      }

      /* ---------- rail ---------- */
      function toggleRail() { a.toggleRail(); }

      function startRailResize(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        resizing.value = true;
        document.body.classList.add('col-resizing');
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        window.addEventListener('pointermove', onRailResize);
        window.addEventListener('pointerup', endRailResize);
      }

      function onRailResize(e) {
        if (!resizing.value) return;
        a.setRailWidth(e.clientX);
      }

      function endRailResize() {
        resizing.value = false;
        document.body.classList.remove('col-resizing');
        window.removeEventListener('pointermove', onRailResize);
        window.removeEventListener('pointerup', endRailResize);
      }

      function resetRailWidth() { a.setRailWidth(232); }

      function startInspectorResize(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        resizing.value = true;
        document.body.classList.add('col-resizing');
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        window.addEventListener('pointermove', onInspectorResize);
        window.addEventListener('pointerup', endInspectorResize);
      }

      function onInspectorResize(e) {
        if (!resizing.value) return;
        a.setInspectorWidth(window.innerWidth - e.clientX);
      }

      function endInspectorResize() {
        resizing.value = false;
        document.body.classList.remove('col-resizing');
        window.removeEventListener('pointermove', onInspectorResize);
        window.removeEventListener('pointerup', endInspectorResize);
      }

      function resetInspectorWidth() { a.setInspectorWidth(344); }

      /* ---------- view ---------- */
      function setZoom(v) { a.setZoom(v); }
      function setFilter(v) { s.filters.text = v; }
      function toggleStrip(key) { a.toggleStrip(key); }
      function toggleTheme() {
        a.setTheme(s.theme === 'dark' ? 'light' : 'dark');
      }
      function toggleInspector() { inspectorOpen.value = !inspectorOpen.value; }
      function openModal(kind) { modal.kind = kind; }
      function closeModal() { modal.kind = null; }

      /* ---------- keyboard ---------- */
      function onKeydown(e) {
        var tag = (e.target.tagName || '').toLowerCase();
        var typing = tag === 'input' || tag === 'textarea' || tag === 'select';

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) a.redo(); else a.undo();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
          e.preventDefault();
          a.redo();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          a.persist();
          a.notice('Saved to this browser.', 'ok');
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
          e.preventDefault();
          exportJSON();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
          e.preventDefault();
          toggleRail();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
          e.preventDefault();
          toggleInspector();
          return;
        }
        if (typing) return;

        if (e.key === 'Escape') {
          if (modal.kind) { modal.kind = null; return; }
          a.select(null, null);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          stepScene(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          stepScene(-1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          stepCharacter(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          stepCharacter(-1);
        } else if (e.key === '+' || e.key === '=') {
          setZoom(Math.min(store.ZOOM_MAX, Math.round(s.zoom * 1.25)));
        } else if (e.key === '-' || e.key === '_') {
          setZoom(Math.max(store.ZOOM_MIN, Math.round(s.zoom / 1.25)));
        } else if (e.key === '0') {
          setZoom(56);
        }
      }

      /* ---------- window-level file drop ---------- */
      var dragDepth = 0;
      function onDragOver(e) {
        e.preventDefault();
      }
      function onDragEnter(e) {
        if (!e.dataTransfer || !e.dataTransfer.types || e.dataTransfer.types.indexOf('Files') === -1) return;
        dragDepth++;
        document.body.classList.add('file-over');
      }
      function onDragLeave(e) {
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) document.body.classList.remove('file-over');
      }
      function onDrop(e) {
        e.preventDefault();
        dragDepth = 0;
        document.body.classList.remove('file-over');
        var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) importSheetFile(file);
      }

      /* ---------- lifecycle ---------- */
      Vue.watch(function () { return s.theme; }, function (t) {
        document.documentElement.setAttribute('data-theme', t);
      }, { immediate: true });

      Vue.onMounted(function () {
        document.documentElement.setAttribute('data-theme', s.theme);
        var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rail-w'));
        if (!isNaN(v) && v > 0) railW.value = v;

        applyNarrow();
        if (mql && mql.addEventListener) mql.addEventListener('change', applyNarrow);
        else if (mql && mql.addListener) mql.addListener(applyNarrow);

        window.addEventListener('keydown', onKeydown);
        window.addEventListener('dragover', onDragOver);
        window.addEventListener('dragenter', onDragEnter);
        window.addEventListener('dragleave', onDragLeave);
        window.addEventListener('drop', onDrop);
        window.addEventListener('beforeunload', function (e) {
          if (s.dirty) { e.preventDefault(); e.returnValue = ''; }
        });
      });

      Vue.onUnmounted(function () {
        if (mql && mql.removeEventListener) mql.removeEventListener('change', applyNarrow);
        else if (mql && mql.removeListener) mql.removeListener(applyNarrow);
        window.removeEventListener('keydown', onKeydown);
        window.removeEventListener('dragover', onDragOver);
        window.removeEventListener('dragenter', onDragEnter);
        window.removeEventListener('dragleave', onDragLeave);
        window.removeEventListener('drop', onDrop);
      });

      return {
        s: s, d: d, a: a, model: model,
        report: report,
        totals: totals,
        modal: modal,
        fileInput: fileInput,
        jsonInput: jsonInput,
        railW: railW,
        inspectorOpen: inspectorOpen,
        viewport: viewport,
        shellStyle: shellStyle,
        railVisible: railVisible,
        resizing: resizing,
        zoomMin: store.ZOOM_MIN,
        zoomMax: store.ZOOM_MAX,
        selectedScene: selectedScene,
        selectedEntity: selectedEntity,
        selectedCell: selectedCell,

        onSelectScene: onSelectScene,
        onSelectCell: onSelectCell,
        onSelectEntity: onSelectEntity,
        onCycleCell: onCycleCell,
        onEditCell: onEditCell,
        onDropScene: onDropScene,
        onMinimapJump: onMinimapJump,
        onViewport: onViewport,
        onJumpReport: onJumpReport,
        updateCell: updateCell,
        updateNote: updateNote,
        setPresence: setPresence,
        clearCell: clearCell,
        updateScene: updateScene,
        moveScene: moveScene,
        removeScene: removeScene,

        addCharacter: addCharacter,
        renameCharacter: renameCharacter,
        removeCharacter: removeCharacter,
        cycleColor: cycleColor,
        addScene: addScene,

        pickFile: pickFile,
        onFileChosen: onFileChosen,
        exportJSON: exportJSON,
        importJSON: importJSON,
        onJSONChosen: onJSONChosen,
        loadSample: loadSample,
        loadDemo: loadDemo,
        newProject: newProject,
        loadProject: loadProject,
        deleteProject: deleteProject,
        renameProject: renameProject,

        setZoom: setZoom,
        setFilter: setFilter,
        toggleRail: toggleRail,
        startRailResize: startRailResize,
        resetRailWidth: resetRailWidth,
        startInspectorResize: startInspectorResize,
        resetInspectorWidth: resetInspectorWidth,
        toggleStrip: toggleStrip,
        toggleTheme: toggleTheme,
        toggleInspector: toggleInspector,
        openModal: openModal,
        closeModal: closeModal
      };
    },

    template: `
<div class="shell" :style="shellStyle">

  <lt-top-bar
    :title="s.project.meta.title"
    :can-undo="s.past.length > 0"
    :can-redo="s.future.length > 0"
    :zoom="s.zoom"
    :zoom-min="zoomMin"
    :zoom-max="zoomMax"
    :rail-open="railVisible"
    :show-pov="s.showPov"
    :show-places="s.showPlaces"
    :show-time="s.showTime"
    :filter-text="s.filters.text"
    :inspector-open="inspectorOpen"
    :theme="s.theme"
    @rename-project="renameProject"
    @open-library="openModal('library')"
    @import-sheet="pickFile"
    @export-json="exportJSON"
    @undo="a.undo()"
    @redo="a.redo()"
    @toggle-strip="toggleStrip"
    @toggle-rail="toggleRail"
    @zoom="setZoom"
    @filter="setFilter"
    @add-scene="addScene"
    @toggle-inspector="toggleInspector"
    @toggle-theme="toggleTheme"
    @open-help="openModal('help')" />

  <div v-if="railVisible" class="rail-wrap">
    <lt-rail
      :scenes="s.project.scenes"
      :selection="s.selection"
      :report="report"
      @select-scene="onSelectScene"
      @jump-report="onJumpReport" />
    <div class="rail-resizer" :class="{ active: resizing }"
         title="Drag to resize · double-click to reset"
         @pointerdown="startRailResize"
         @dblclick="resetRailWidth"></div>
  </div>

  <main class="stage">
    <lt-matrix
      :scenes="s.project.scenes"
      :chapters="s.project.chapters"
      :characters="s.project.entities.characters"
      :cell-map="d.cellMap"
      :char-index="d.charIndex"
      :place-index="d.placeIndex"
      :chapter-index="d.chapterIndex"
      :zoom="s.zoom"
      :rail-w="railW"
      :selection="s.selection"
      :show-pov="s.showPov"
      :show-places="s.showPlaces"
      :show-time="s.showTime"
      :filters="s.filters"
      @select-scene="onSelectScene"
      @select-cell="onSelectCell"
      @select-entity="onSelectEntity"
      @cycle-cell="onCycleCell"
      @edit-cell="onEditCell"
      @add-character="addCharacter"
      @rename-character="renameCharacter"
      @remove-character="removeCharacter"
      @cycle-color="cycleColor"
      @drop-scene="onDropScene"
      @viewport="onViewport" />

    <lt-minimap
      :scenes="s.project.scenes"
      :selection="s.selection"
      :viewport="viewport"
      :cell-map="d.cellMap"
      @jump="onMinimapJump" />
  </main>

  <div v-if="inspectorOpen" class="inspector-wrap">
    <div class="inspector-resizer" :class="{ active: resizing }"
         title="Drag to resize · double-click to reset"
         @pointerdown="startInspectorResize"
         @dblclick="resetInspectorWidth"></div>
    <div class="inspector">
      <lt-inspector
        :selection="s.selection"
        :scene="selectedScene"
        :entity="selectedEntity"
        :cell="selectedCell"
        :all-scenes="s.project.scenes"
        :chapters="s.project.chapters"
        :characters="s.project.entities.characters"
        @update-cell="updateCell"
        @update-note="updateNote"
        @set-presence="setPresence"
        @clear-cell="clearCell"
        @update-scene="updateScene"
        @select-scene="onSelectScene"
        @move-scene="moveScene"
        @remove-scene="removeScene"
        @close="a.select(null, null)" />
    </div>
  </div>

  <footer class="statusbar">
    <span v-if="s.dirty" class="unsaved-dot" title="Unsaved changes"></span>
    <span>{{ s.project.meta.title || 'Untitled' }}</span>
    <span class="dot-sep"></span>
    <span>{{ totals.scenes }} scenes</span>
    <span class="dot-sep"></span>
    <span>{{ totals.chars }} characters</span>
    <span class="dot-sep"></span>
    <span>{{ report.contradictions.length }} flagged</span>
    <span class="spacer"></span>
    <span v-if="s.notice" class="status-msg" :class="s.notice.kind">{{ s.notice.message }}</span>
    <span v-else class="status-msg dim">saved locally in this browser</span>
  </footer>

  <input ref="fileInput" type="file" accept=".csv,.tsv,.txt,.ods,.xlsx,.xls" style="display:none"
         @change="onFileChosen">
  <input ref="jsonInput" type="file" accept=".json" style="display:none"
         @change="onJSONChosen">

  <lt-library-modal v-if="modal.kind === 'library'"
    :library="s.library" :current-id="s.project.meta.id"
    @close="closeModal" @new-project="newProject" @load-demo="loadDemo"
    @load-project="loadProject" @delete-project="deleteProject"
    @import-json="importJSON" @import-sheet="pickFile" @load-sample="loadSample" />

  <lt-help-modal v-if="modal.kind === 'help'" @close="closeModal" />
</div>`
  };

  window.addEventListener('DOMContentLoaded', function () {
    Vue.createApp(App).mount('#app');
  });
})(window.LT = window.LT || {});
