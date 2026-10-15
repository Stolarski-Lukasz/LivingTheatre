/* LivingTheatre — left rail.
   The structure of the work: chapters and their scenes, then the report.
   Characters are not listed here — they live in the matrix as track rows,
   with their own hover tools; repeating them in a navigation pane was
   duplication.

   A chapter is a unit of the work, and its name is the work's business:
   the term is held per project (Chapter, Act, Part, Episode), so the head,
   the rows and every action follow it. Scenes nobody has grouped sit under
   "No chapter" rather than being quietly dropped somewhere. */
(function (LT) {
  'use strict';

  LT.components = LT.components || {};

  LT.components.Rail = {
    name: 'LtRail',
    props: {
      scenes: Array,
      groups: Array,
      unassigned: Array,
      unitLabel: String,
      selection: Object,
      report: Object
    },
    emits: ['select-scene', 'select-chapter', 'add-chapter', 'rename-chapter',
            'move-chapter', 'remove-chapter', 'add-scene', 'jump-report'],

    template: `
<aside class="rail">
  <div class="rail-section">
    <div class="rail-head">
      <span>Structure</span>
      <span class="spacer"></span>
      <span class="track-sub">{{ groups.length + (unassigned.length ? 1 : 0) }}</span>
      <button class="icon-btn always" title="New {{ unitLabel.toLowerCase() }}"
              @click.stop="$emit('add-chapter')">+</button>
    </div>

    <div class="track-row" :class="{ selected: !selection.sceneId && selection.kind !== 'chapter' }"
         @click="$emit('select-scene', null)">
      <span class="swatch ghost"></span>
      <span class="track-name dim">All scenes</span>
      <span class="track-sub">{{ scenes.length }}</span>
    </div>

    <template v-for="g in groups" :key="g.id">
      <div class="track-row chapter-row"
           :class="{ selected: selection.chapterId === g.id }"
           @click="$emit('select-chapter', g.id)">
        <button class="twisty" :class="{ open: !collapsed[g.id] }"
                :title="collapsed[g.id] ? 'Expand' : 'Collapse'"
                @click.stop="collapsed[g.id] = !collapsed[g.id]">▾</button>
        <span class="chapter-no">{{ g.unitNo }}</span>
        <input v-if="renaming.id === g.id" class="track-name" v-model="renaming.value"
               @click.stop
               @blur="commitRename"
               @keydown.enter.prevent="commitRename"
               @keydown.esc.prevent="cancelRename"
               @keydown.stop>
        <span v-else class="track-name" :title="g.title"
              @dblclick.stop="startRename(g)">{{ g.title }}</span>
        <span class="track-sub">{{ g.count }}</span>
        <span class="row-tools">
          <button class="icon-btn" title="Add a scene to this {{ unitLabel.toLowerCase() }}"
                  @click.stop="$emit('add-scene', g.id)">+</button>
          <button class="icon-btn" title="Move earlier"
                  :disabled="g.order === 0"
                  @click.stop="$emit('move-chapter', g.id, -1)">‹</button>
          <button class="icon-btn" title="Move later"
                  :disabled="g.order === groups.length - 1"
                  @click.stop="$emit('move-chapter', g.id, 1)">›</button>
          <button class="icon-btn danger" title="Delete this {{ unitLabel.toLowerCase() }} (its scenes are kept, ungrouped)"
                  @click.stop="$emit('remove-chapter', g.id)">🗑</button>
        </span>
      </div>

      <template v-if="!collapsed[g.id]">
        <div v-for="s in g.scenes" :key="s.id"
             class="track-row sub-row"
             :class="{ selected: selection.sceneId === s.id }"
             @click="$emit('select-scene', s.id)">
          <span class="swatch" :style="{ background: selection.sceneId === s.id ? 'var(--c-accent)' : 'transparent' }"></span>
          <span class="scene-no">{{ s.order + 1 }}</span>
          <span class="track-name" :class="{ dim: s.hidden }">{{ s.title }}</span>
          <span v-if="s.mode !== 'linear'" class="mini-flag" :title="s.mode">{{ modeFlag(s.mode) }}</span>
          <span v-if="s.hidden" class="mini-flag hidden" title="hidden event">H</span>
        </div>
        <div v-if="!g.count" class="sub-empty">
          no scenes yet — use + to add one
        </div>
      </template>
    </template>

    <div v-if="unassigned.length" class="track-row static">
      <span class="swatch ghost"></span>
      <span class="track-name dim">No {{ unitLabel.toLowerCase() }}</span>
      <span class="track-sub">{{ unassigned.length }}</span>
    </div>
    <template v-if="unassigned.length">
      <div v-for="s in unassigned" :key="'u' + s.id"
           class="track-row sub-row"
           :class="{ selected: selection.sceneId === s.id }"
           @click="$emit('select-scene', s.id)">
        <span class="swatch" :style="{ background: selection.sceneId === s.id ? 'var(--c-accent)' : 'transparent' }"></span>
        <span class="scene-no">{{ s.order + 1 }}</span>
        <span class="track-name" :class="{ dim: s.hidden }">{{ s.title }}</span>
        <span v-if="s.mode !== 'linear'" class="mini-flag" :title="s.mode">{{ modeFlag(s.mode) }}</span>
        <span v-if="s.hidden" class="mini-flag hidden" title="hidden event">H</span>
      </div>
    </template>

    <div v-if="!groups.length && !unassigned.length" class="rail-empty">
      No scenes yet. Add one, or import a plot sheet.
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

    setup: function (props, ctx) {
      var emit = ctx.emit;
      var FLAGS = { flashback: '◀', flashforward: '▶', dream: '☾', vision: '◈' };
      function modeFlag(mode) {
        return FLAGS[mode] || '◆';
      }
      var collapsed = Vue.reactive({});
      var renaming = Vue.reactive({ id: null, value: '' });
      function startRename(g) {
        renaming.id = g.id;
        renaming.value = g.title;
      }
      function commitRename() {
        var id = renaming.id;
        var title = String(renaming.value || '').trim();
        renaming.id = null;
        renaming.value = '';
        if (id && title) emit('rename-chapter', id, title);
      }
      function cancelRename() {
        renaming.id = null;
        renaming.value = '';
      }
      return {
        modeFlag: modeFlag,
        collapsed: collapsed,
        renaming: renaming,
        startRename: startRename,
        commitRename: commitRename,
        cancelRename: cancelRename
      };
    }
  };
})(window.LT = window.LT || {});
