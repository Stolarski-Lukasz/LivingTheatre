/* LivingTheatre — inspector.
   Right-hand detail panel. Two tabs, Scene and Cell, both always reachable:
   the old layout hid scene attributes behind "no character selected", which
   stranded them the moment a cell was clicked. */
(function (LT) {
  'use strict';

  var model = LT.model;

  LT.components = LT.components || {};

  var PRESENCE_LABELS = {
    absent: 'Absent',
    idle: 'Present, idle',
    active: 'Active'
  };

  LT.components.Inspector = {
    name: 'LtInspector',
    props: {
      selection: Object,
      scene: Object,
      entity: Object,
      cell: Object,
      allScenes: Array,
      chapters: Array,
      characters: Array
    },
    emits: ['update-cell', 'update-note', 'set-presence', 'clear-cell',
            'update-scene', 'select-scene', 'move-scene', 'remove-scene', 'close'],

    template: `
<div class="inspector-inner">
  <div class="insp-tabs">
    <button :class="{ on: tab === 'scene' }" @click="tab = 'scene'"
            :disabled="!scene">Scene</button>
    <button :class="{ on: tab === 'cell' }" @click="tab = 'cell'"
            :disabled="!scene">Cell</button>
    <span class="spacer"></span>
    <button class="icon-btn" title="Close (Esc)" @click="$emit('close')">✕</button>
  </div>

  <div v-if="!scene" class="insp-empty">
    <p class="insp-empty-mark">◧</p>
    <p>Select a scene or a cell.</p>
    <p class="insp-hint">
      Click a cell to select · alt+click cycles presence ·
      double-click writes what a character does · drag a scene header to reorder.
    </p>
  </div>

  <template v-else>
    <!-- ============ scene tab ============ -->
    <div v-if="tab === 'scene'" class="insp-section">
      <div class="insp-title">
        <span>Scene {{ scene.order + 1 }}</span>
        <span class="spacer"></span>
        <button class="btn ghost icon" title="Move earlier" @click="$emit('move-scene', -1)">‹</button>
        <button class="btn ghost icon" title="Move later" @click="$emit('move-scene', 1)">›</button>
      </div>
      <input class="insp-input" :value="scene.title" placeholder="Scene title"
             @change="patchScene('title', $event.target.value)">
      <div class="field-label">Story time</div>
      <div class="insp-row">
        <input class="insp-input" :value="scene.storyStart || ''" placeholder="start, e.g. 1.4"
               @change="patchScene('storyStart', $event.target.value)">
        <input class="insp-input" :value="scene.storyEnd || ''" placeholder="end"
               @change="patchScene('storyEnd', $event.target.value)">
      </div>
      <div class="field-label">Mode</div>
      <select class="insp-input" :value="scene.mode" @change="patchScene('mode', $event.target.value)">
        <option v-for="m in modes" :key="m.id" :value="m.id">{{ m.label }}</option>
      </select>
      <div v-if="scene.mode !== 'linear'">
        <div class="field-label">Anchor scene</div>
        <select class="insp-input" :value="scene.sourceSceneId || ''"
                @change="patchScene('sourceSceneId', $event.target.value)">
          <option value="">— none —</option>
          <option v-for="s in otherScenes" :key="s.id" :value="s.id">
            Scene {{ s.order + 1 }} · {{ s.title }}
          </option>
        </select>
      </div>
      <div class="field-label">Chapter</div>
      <select class="insp-input" :value="scene.chapterId || ''"
              @change="patchScene('chapterId', $event.target.value)">
        <option v-for="ch in chapters" :key="ch.id" :value="ch.id">{{ ch.title }}</option>
      </select>
      <div class="field-label">Perspective</div>
      <select class="insp-input" :value="povValue" @change="patchPov($event.target.value)">
        <option value="narrator">Narrator</option>
        <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <div class="field-label">Place</div>
      <input class="insp-input" :value="scene.placeLabel || ''" placeholder="e.g. Dom – kuchnia"
             @change="patchScene('placeLabel', $event.target.value)">
      <label class="insp-check">
        <input type="checkbox" :checked="scene.hidden"
               @change="patchScene('hidden', $event.target.checked)">
        <span>hidden event (happens, but is not shown)</span>
      </label>
      <div class="field-label">Summary</div>
      <textarea class="insp-textarea" :value="scene.summary" placeholder="What happens in this scene?"
                @change="patchScene('summary', $event.target.value)"></textarea>
      <div class="insp-actions">
        <button class="btn danger" @click="removeScene">Delete scene</button>
      </div>
    </div>

    <!-- ============ cell tab ============ -->
    <div v-else class="insp-section">
      <template v-if="entity">
        <div class="insp-title">
          <span class="swatch" :style="{ background: entity.color }"></span>
          <span>{{ entity.name }}</span>
          <span class="spacer"></span>
          <span class="insp-sub">{{ entity.status === 'mentioned' ? 'offstage' : '' }}</span>
        </div>
        <div class="field-label">Presence</div>
        <div class="presence-picker">
          <button v-for="p in presenceOrder" :key="p"
                  :class="{ on: currentPresence === p }"
                  @click="$emit('set-presence', p)">
            <span class="pip" :data-p="p"></span>{{ presenceLabels[p] }}
          </button>
        </div>
        <div class="field-label">What they do</div>
        <textarea class="insp-textarea insp-tall" :value="cellValue"
                  placeholder="Diegetic fact: what actually happens."
                  @change="$emit('update-cell', $event.target.value)"></textarea>
        <div class="field-label">Author note</div>
        <textarea class="insp-textarea" :value="noteValue"
                  placeholder="Intent, questions to self, critique."
                  @change="$emit('update-note', $event.target.value)"></textarea>
        <div class="insp-actions">
          <button class="btn ghost" @click="$emit('clear-cell')">Clear cell</button>
        </div>
      </template>
      <div v-else class="insp-empty">
        <p>Select a character cell to edit what they do here.</p>
      </div>
    </div>
  </template>
</div>`,

    setup: function (props, ctx) {
      var emit = ctx.emit;
      var tab = Vue.ref('scene');

      /* The tab follows the selection kind: a character cell opens Cell,
         a scene header or a strip cell opens Scene — even when a character
         is still selected from before. */
      Vue.watch(function () {
        return (props.selection && props.selection.kind) + ':' + (props.scene && props.scene.id);
      }, function () {
        tab.value = (props.selection && props.selection.kind === 'cell' && props.entity)
          ? 'cell' : 'scene';
      });

      var modes = model.SCENE_MODES;
      var presenceOrder = model.PRESENCE_ORDER;
      var presenceLabels = PRESENCE_LABELS;

      var cellValue = Vue.computed(function () {
        return props.cell ? props.cell.text : '';
      });
      var noteValue = Vue.computed(function () {
        return props.cell ? props.cell.note : '';
      });
      var currentPresence = Vue.computed(function () {
        return props.cell ? props.cell.presence : model.PRESENCE.ABSENT;
      });
      var povValue = Vue.computed(function () {
        return props.scene.povIsNarrator ? 'narrator' : (props.scene.pov || 'narrator');
      });
      var otherScenes = Vue.computed(function () {
        return (props.allScenes || []).filter(function (s) {
          return !props.scene || s.id !== props.scene.id;
        });
      });

      function patchScene(key, value) {
        var patch = {};
        patch[key] = value;
        emit('update-scene', patch);
      }

      function patchPov(value) {
        if (value === 'narrator') {
          emit('update-scene', { pov: null, povIsNarrator: true });
        } else {
          emit('update-scene', { pov: value, povIsNarrator: false });
        }
      }

      function removeScene() {
        if (window.confirm('Delete this scene and everything in it?')) {
          emit('remove-scene');
        }
      }

      return {
        tab: tab,
        modes: modes,
        presenceOrder: presenceOrder,
        presenceLabels: presenceLabels,
        cellValue: cellValue,
        noteValue: noteValue,
        currentPresence: currentPresence,
        povValue: povValue,
        otherScenes: otherScenes,
        patchScene: patchScene,
        patchPov: patchPov,
        removeScene: removeScene
      };
    }
  };
})(window.LT = window.LT || {});
