/* LivingTheatre — minimap.
   An overview strip under the matrix: every scene as a tick, the visible
   window of the matrix drawn over it, click to jump. */
(function (LT) {
  'use strict';

  var model = LT.model;

  LT.components = LT.components || {};

  LT.components.Minimap = {
    name: 'LtMinimap',
    props: {
      scenes: Array,
      selection: Object,
      viewport: Object,
      cellMap: Object
    },
    emits: ['jump'],

    template: `
<div class="minimap" @click="onClick">
  <div v-for="s in scenes" :key="s.id"
       class="mm-tick"
       :class="{ current: selection.sceneId === s.id, act: isActive(s.id), flash: s.mode !== 'linear' }"
       :title="'scene ' + (s.order + 1) + ': ' + s.title"></div>
  <div v-if="!scenes.length" class="rail-empty">no scenes</div>
  <div v-if="hasWindow" class="mm-window" :style="windowStyle"></div>
</div>`,

    setup: function (props, ctx) {
      var emit = ctx.emit;

      function isActive(sceneId) {
        var id = props.selection.entityId;
        if (!id) return false;
        var c = props.cellMap[sceneId + '|' + id];
        return !!c && c.presence === model.PRESENCE.ACTIVE;
      }

      function onClick(e) {
        if (!props.scenes.length) return;
        var rect = e.currentTarget.getBoundingClientRect();
        var ratio = (e.clientX - rect.left) / rect.width;
        var idx = Math.max(0, Math.min(props.scenes.length - 1, Math.floor(ratio * props.scenes.length)));
        emit('jump', props.scenes[idx].id);
      }

      var hasWindow = Vue.computed(function () {
        var v = props.viewport;
        return !!v && v.end > v.start;
      });

      var windowStyle = Vue.computed(function () {
        var v = props.viewport || { start: 0, end: 1 };
        return {
          left: (v.start * 100) + '%',
          width: Math.max(2, (v.end - v.start) * 100) + '%'
        };
      });

      return { isActive: isActive, onClick: onClick, hasWindow: hasWindow, windowStyle: windowStyle };
    }
  };
})(window.LT = window.LT || {});
