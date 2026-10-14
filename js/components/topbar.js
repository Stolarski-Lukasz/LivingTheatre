/* LivingTheatre — top bar.
   Project actions, view toggles, the continuous zoom control and filters. */
(function (LT) {
  'use strict';

  LT.components = LT.components || {};

  LT.components.TopBar = {
    name: 'LtTopBar',
    props: {
      title: String,
      canUndo: Boolean,
      canRedo: Boolean,
      zoom: Number,
      zoomMin: Number,
      zoomMax: Number,
      showPov: Boolean,
      showPlaces: Boolean,
      showTime: Boolean,
      filterText: String,
      inspectorOpen: Boolean,
      theme: String
    },
    emits: ['rename-project', 'open-library', 'import-sheet', 'export-json', 'undo', 'redo',
            'toggle-strip', 'zoom', 'filter', 'add-scene', 'toggle-inspector',
            'toggle-theme', 'open-help'],

    template: `
<header class="topbar">
  <span class="brand"><span class="dot"></span>LivingTheatre</span>
  <div class="divider-v"></div>

  <input class="project-name" :value="title" placeholder="Untitled story"
         @change="$emit('rename-project', $event.target.value)"
         title="Project title">

  <button class="btn ghost" title="Open / manage projects" @click="$emit('open-library')">Projects</button>
  <button class="btn" title="Import a CSV / ODS / XLSX plot sheet" @click="$emit('import-sheet')">Import sheet</button>
  <button class="btn ghost" title="Export project JSON (Ctrl+E)" @click="$emit('export-json')">Export</button>

  <div class="divider-v"></div>
  <button class="btn ghost icon" title="Undo (Ctrl+Z)" :disabled="!canUndo" @click="$emit('undo')">↶</button>
  <button class="btn ghost icon" title="Redo (Ctrl+Shift+Z)" :disabled="!canRedo" @click="$emit('redo')">↷</button>

  <span class="spacer"></span>

  <label class="switch" title="Show the perspective strip">
    <input type="checkbox" :checked="showPov" @change="$emit('toggle-strip', 'showPov')"> POV
  </label>
  <label class="switch" title="Show the place strip">
    <input type="checkbox" :checked="showPlaces" @change="$emit('toggle-strip', 'showPlaces')"> place
  </label>
  <label class="switch" title="Show the story-time strip">
    <input type="checkbox" :checked="showTime" @change="$emit('toggle-strip', 'showTime')"> time
  </label>

  <div class="divider-v"></div>

  <div class="zoom-ctl" title="Zoom (ctrl+wheel, or + / -)">
    <button class="btn ghost icon" @click="$emit('zoom', zoomMin)">−</button>
    <input class="zoom-slider" type="range"
           :min="zoomMin" :max="zoomMax" :value="zoom"
           @input="$emit('zoom', +$event.target.value)">
    <button class="btn ghost icon" @click="$emit('zoom', zoomMax)">+</button>
    <span class="zoom-label">{{ zoom }}px</span>
  </div>

  <input class="field filter-field" :value="filterText" placeholder="filter cells…"
         @input="$emit('filter', $event.target.value)" title="Filter cells by text">

  <button class="btn" title="Add a scene at the end" @click="$emit('add-scene')">+ Scene</button>

  <div class="divider-v"></div>
  <button class="btn ghost icon" title="Keyboard & mouse help" @click="$emit('open-help')">?</button>
  <button class="btn ghost icon" :title="theme === 'dark' ? 'Switch to light' : 'Switch to dark'"
          @click="$emit('toggle-theme')">◐</button>
  <button class="btn ghost icon" :title="inspectorOpen ? 'Hide inspector' : 'Show inspector'"
          @click="$emit('toggle-inspector')">{{ inspectorOpen ? '›' : '‹' }}</button>
</header>`
  };
})(window.LT = window.LT || {});
