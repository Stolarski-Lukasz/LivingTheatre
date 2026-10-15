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
      railOpen: Boolean,
      showPov: Boolean,
      showPlaces: Boolean,
      showTime: Boolean,
      filterText: String,
      inspectorOpen: Boolean,
      theme: String
    },
    emits: ['rename-project', 'open-library', 'import-sheet', 'export-json', 'undo', 'redo',
            'toggle-strip', 'toggle-rail', 'zoom', 'filter', 'add-scene', 'toggle-inspector',
            'toggle-theme', 'open-help'],

    template: `
<header class="topbar">
  <button class="btn ghost icon icon-lg" aria-label="Toggle sidebar"
          :title="railOpen ? 'Hide sidebar (Ctrl+B)' : 'Show sidebar (Ctrl+B)'"
          @click="$emit('toggle-rail')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round">
      <path :d="railOpen ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'"/>
    </svg>
  </button>
  <span class="brand"><span class="dot"></span>LivingTheatre</span>
  <div class="divider-v"></div>

  <input class="project-name" :value="title" placeholder="Untitled story"
         @change="$emit('rename-project', $event.target.value)"
         title="Project title">

  <button class="btn ghost" title="Open / manage projects" @click="$emit('open-library')">Projects</button>
  <button class="btn" title="Import a CSV / ODS / XLSX plot sheet" @click="$emit('import-sheet')">Import sheet</button>
  <button class="btn ghost" title="Export project JSON (Ctrl+E)" @click="$emit('export-json')">Export</button>

  <div class="divider-v"></div>
  <button class="btn ghost icon icon-lg" aria-label="Undo" title="Undo (Ctrl+Z)" :disabled="!canUndo"
          @click="$emit('undo')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 14 4 9l5-5"/>
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>
    </svg>
  </button>
  <button class="btn ghost icon icon-lg" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" :disabled="!canRedo"
          @click="$emit('redo')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round">
      <path d="m15 14 5-5-5-5"/>
      <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/>
    </svg>
  </button>

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
  <button class="btn ghost icon icon-lg" aria-label="Toggle help" title="Keyboard & mouse help"
          @click="$emit('open-help')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9.2"/>
      <path d="M9.2 9.2a2.8 2.8 0 1 1 3.6 2.7c-.8.3-1.2 1-1.2 1.9"/>
      <path d="M12 17h.01"/>
    </svg>
  </button>
  <button class="btn ghost icon icon-lg" aria-label="Toggle theme"
          :title="theme === 'dark' ? 'Switch to light' : 'Switch to dark'"
          @click="$emit('toggle-theme')">
    <svg v-if="theme === 'dark'" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3a6.4 6.4 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
    </svg>
    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2.5"/>
      <path d="M12 19.5V22"/>
      <path d="m4.93 4.93 1.77 1.77"/>
      <path d="m17.3 17.3 1.77 1.77"/>
      <path d="M2 12h2.5"/>
      <path d="M19.5 12H22"/>
      <path d="m6.7 17.3-1.77 1.77"/>
      <path d="m19.07 4.93-1.77 1.77"/>
    </svg>
  </button>
  <button class="btn ghost icon icon-lg" aria-label="Toggle inspector"
          :title="inspectorOpen ? 'Hide inspector (Ctrl+I)' : 'Show inspector (Ctrl+I)'"
          @click="$emit('toggle-inspector')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round">
      <path :d="inspectorOpen ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'"/>
    </svg>
  </button>
</header>`
  };
})(window.LT = window.LT || {});
