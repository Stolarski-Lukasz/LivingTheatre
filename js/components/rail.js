/* LivingTheatre — left rail.
   Scenes and the report. Characters are not listed here — they live in the
   matrix as track rows, with their own hover tools; repeating them in a
   navigation pane was duplication. */
(function (LT) {
  'use strict';

  var model = LT.model;

  LT.components = LT.components || {};

  LT.components.Rail = {
    name: 'LtRail',
    props: {
      scenes: Array,
      selection: Object,
      report: Object
    },
    emits: ['select-scene', 'jump-report'],

    template: `
<aside class="rail">
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
