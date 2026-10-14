/* LivingTheatre — left rail.
   Characters, scenes and the contradiction report. Rail rows never own state;
   they only drive selection in the store. */
(function (LT) {
  'use strict';

  var model = LT.model;

  LT.components = LT.components || {};

  LT.components.Rail = {
    name: 'LtRail',
    props: {
      characters: Array,
      scenes: Array,
      selection: Object,
      report: Object
    },
    emits: ['select-entity', 'select-scene', 'add-character', 'rename-character',
            'remove-character', 'cycle-color', 'jump-report'],

    template: `
<aside class="rail">
  <div class="rail-section">
    <div class="rail-head">
      <span>Characters</span>
      <span class="spacer"></span>
      <button class="btn ghost icon" title="Add character" @click="$emit('add-character')">+</button>
    </div>
    <div v-if="!characters.length" class="rail-empty">
      Import a sheet or add a character.
    </div>
    <div v-for="c in characters" :key="c.id"
         class="track-row"
         :class="{ selected: selection.entityId === c.id, offstage: c.status === 'mentioned' }"
         @click="$emit('select-entity', c.id)">
      <span class="swatch" :style="{ background: c.color }"></span>
      <input class="track-name" :value="c.name" :title="c.summary || c.name"
             @click.stop
             @change="$emit('rename-character', c.id, $event.target.value)">
      <button class="icon-btn" title="Next colour" @click.stop="$emit('cycle-color', c.id)">◐</button>
      <button class="icon-btn" title="Remove character" @click.stop="$emit('remove-character', c.id)">✕</button>
    </div>
  </div>

  <div class="rail-section">
    <div class="rail-head">
      <span>Scenes</span>
      <span class="spacer"></span>
      <span class="track-sub">{{ scenes.length }}</span>
    </div>
    <div class="track-row" :class="{ selected: !selection.sceneId }"
         @click="$emit('select-scene', null)">
      <span class="swatch ghost"></span>
      <span class="track-name dim">All scenes</span>
    </div>
    <div v-for="s in scenes" :key="s.id"
         class="track-row"
         :class="{ selected: selection.sceneId === s.id }"
         @click="$emit('select-scene', s.id)">
      <span class="swatch" :style="{ background: selection.sceneId === s.id ? 'var(--c-accent)' : 'transparent' }"></span>
      <span class="scene-no">{{ s.order + 1 }}</span>
      <span class="track-name" :class="{ dim: s.hidden }">{{ s.title }}</span>
      <span v-if="s.mode !== 'linear'" class="mini-flag" :title="s.mode">{{ modeFlag(s.mode) }}</span>
      <span v-if="s.hidden" class="mini-flag hidden" title="hidden event">H</span>
    </div>
  </div>

  <div class="rail-section">
    <div class="rail-head"><span>Report</span></div>
    <div v-if="!report.contradictions.length" class="rail-empty">Nothing flagged.</div>
    <div v-for="(c, i) in report.contradictions" :key="'c' + i"
         class="report-item"
         :class="c.severity === 'warn' ? 'warn' : 'info'"
         @click="$emit('jump-report', c.sceneIds[0])">
      <div class="ri-title">{{ c.kind }}</div>
      <div class="ri-meta">{{ c.message }}</div>
    </div>
  </div>
</aside>`,

    setup: function () {
      var FLAGS = { flashback: '◀', flashforward: '▶', dream: '☾', vision: '◈' };
      function modeFlag(mode) {
        return FLAGS[mode] || '◆';
      }
      return { modeFlag: modeFlag };
    }
  };
})(window.LT = window.LT || {});
