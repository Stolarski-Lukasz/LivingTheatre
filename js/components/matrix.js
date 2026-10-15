/* LivingTheatre — matrix.
   Rows are tracks (characters, then POV / place / story-time strips), columns
   are scenes in presentation order. One scroll container carries everything:
   the column headers stick to the top, the row labels stick to the left, the
   ruler sticks to the bottom — no JS scroll-syncing. */
(function (LT) {
  'use strict';

  var model = LT.model;

  LT.components = LT.components || {};

  LT.components.Matrix = {
    name: 'LtMatrix',
    props: {
      scenes: Array,
      chapters: Array,
      characters: Array,
      cellMap: Object,
      charIndex: Object,
      placeIndex: Object,
      chapterIndex: Object,
      zoom: Number,
      railW: Number,
      unitLabel: String,
      selection: Object,
      showPov: Boolean,
      showPlaces: Boolean,
      showTime: Boolean,
      filters: Object
    },
    emits: ['select-scene', 'select-chapter', 'select-cell', 'select-entity', 'cycle-cell', 'edit-cell',
            'add-character', 'rename-character', 'patch-scene', 'drop-scene', 'viewport'],

    components: {
      LtRuler: LT.components.Ruler
    },

    template: `
<div class="scroll-stage" ref="scroller" @scroll.passive="onScroll" @wheel="onWheel">
  <div class="m-canvas" :style="canvasStyle">

    <div class="m-chapterrow">
      <div class="m-bandhead">
        <span class="corner-title">{{ unitLabel }}</span>
        <span class="corner-count">{{ chapterRuns.length }}</span>
      </div>
      <div v-for="(r, i) in chapterRuns" :key="'run' + i"
           class="m-chapterblock"
           :class="{ selected: selection.chapterId === r.id, none: !r.id }"
           :style="{ width: r.count * zoom + 'px' }"
           :title="r.title"
           @click="r.id && $emit('select-chapter', r.id)">
        <span class="band-title">{{ r.title }}</span>
        <span class="band-count">{{ r.count }}</span>
      </div>
    </div>

    <div class="m-headrow">
      <div class="m-corner">
        <span class="corner-title">scenes</span>
        <span class="corner-count">{{ scenes.length }}</span>
      </div>
      <div v-for="s in scenes" :key="s.id"
           class="m-colhead"
           :class="{ selected: selection.sceneId === s.id, dragging: drag.sceneId === s.id, hiddencol: s.hidden }"
           :style="colStyle"
           :title="colTitle(s)"
           @pointerdown="onHeadDown($event, s)"
           @click="onHeadClick($event, s)">
        <div class="ch-line">
          <span class="ch-no">{{ s.order + 1 }}</span>
          <span v-if="isRunStart(s)" class="ch-chapter">{{ runOf(s).title }}</span>
          <span v-if="s.mode !== 'linear'" class="ch-flag" :title="'mode: ' + s.mode">{{ modeFlag(s) }}</span>
          <span v-if="s.hidden" class="ch-flag hidden" title="hidden event — the reader never sees this">H</span>
        </div>
        <div class="ch-title">{{ s.title }}</div>
        <div class="ch-line ch-foot">
          <span class="ch-time">{{ s.storyStart || '' }}</span>
        </div>
      </div>
      <div v-if="drag.active" class="m-dropline" :style="dropStyle"></div>
    </div>

    <div v-for="row in rows" :key="row.key" class="m-row" :style="rowStyle(row)">
      <div v-if="row.kind === 'add'" class="m-rowhead add-rowhead" title="Add a character"
           @click="$emit('add-character')">
        <span class="add-plus">+</span><span>character</span>
      </div>
      <div v-else class="m-rowhead" :class="[row.headClass, { selected: isEntitySelected(row) }]"
           @click="onRowheadClick(row)"
           @dblclick="onRowheadDblClick(row)">
        <span v-if="row.color" class="swatch" :style="{ background: row.color }"></span>
        <input v-if="renaming.key === row.key" class="rh-input" ref="rhEditor"
               v-model="renaming.value"
               @click.stop @blur="commitRename"
               @keydown.enter.prevent="commitRename"
               @keydown.esc.prevent="cancelRename"
               @keydown.stop>
        <template v-else>
          <span class="rh-name" :title="row.tip">{{ row.label }}</span>
          <span v-if="row.badge" class="rh-count">{{ row.badge }}</span>
        </template>
      </div>

      <template v-for="s in scenes" :key="s.id">
        <div v-if="row.kind === 'add'" class="m-addcell" :style="cellStyle"></div>

        <div v-else-if="row.kind === 'character'"
             class="m-cell"
             :class="cellClass(row, s)"
             :style="cellStyle"
             :title="cellTitle(row, s)"
             @click="onCellClick($event, row, s)"
             @dblclick="onCellDblClick(row, s)">
          <span v-if="zoom >= 96 && cellText(row, s)" class="cell-text">{{ cellText(row, s) }}</span>
          <span v-if="cellNote(row, s)" class="cell-dot"></span>
          <textarea v-if="editing.sceneId === s.id && editing.entityId === row.entity.id"
                    class="cell-input" ref="cellEditor"
                    v-model="editing.value"
                    @blur="commitEdit"
                    @keydown.esc.prevent="cancelEdit"
                    @keydown.ctrl.enter.prevent="commitEdit"
                    @keydown.stop></textarea>
        </div>

        <div v-else class="m-strip"
             :class="stripClass(row, s)"
             :style="[cellStyle, stripStyle(row, s)]"
             :title="stripTitle(row, s)"
             @click="$emit('select-scene', s.id)"
             @dblclick="onStripDblClick(row, s)">
          <template v-if="stripEdit.key === row.key + ':' + s.id">
            <select v-if="row.kind === 'pov'" class="strip-input"
                    v-model="stripEdit.value"
                    @change="commitStripEdit"
                    @blur="commitStripEdit"
                    @keydown.esc.prevent="cancelStripEdit"
                    @keydown.stop>
              <option value="narrator">narrator</option>
              <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <input v-else class="strip-input" ref="stripEditor"
                   v-model="stripEdit.value"
                   @blur="commitStripEdit"
                   @keydown.enter.prevent="commitStripEdit"
                   @keydown.esc.prevent="cancelStripEdit"
                   @keydown.stop>
          </template>
          <span v-else class="strip-text">{{ stripLabel(row, s) }}</span>
        </div>
      </template>
    </div>

    <lt-ruler
      :scenes="scenes"
      :zoom="zoom"
      :rail-w="railW"
      :selection="selection"
      @select-scene="onRulerSelect" />
  </div>
</div>`,

    setup: function (props, ctx) {
      var emit = ctx.emit;
      var scroller = Vue.ref(null);
      var editing = Vue.reactive({ sceneId: null, entityId: null, value: '' });
      var renaming = Vue.reactive({ key: null, entityId: null, value: '' });
      var stripEdit = Vue.reactive({ key: null, kind: null, sceneId: null, value: '' });
      var drag = Vue.reactive({
        active: false, sceneId: null, from: -1, to: -1, startX: 0, suppressClick: false
      });

      /* ---------- layout ---------- */
      var canvasW = Vue.computed(function () {
        return props.railW + props.scenes.length * props.zoom;
      });

      var canvasStyle = Vue.computed(function () {
        return { width: canvasW.value + 'px' };
      });

      var colStyle = Vue.computed(function () {
        return { width: props.zoom + 'px' };
      });

      var cellStyle = colStyle;

      var rowStyle = function (row) {
        return { '--c': row.color || 'var(--c-line-strong)' };
      };

      /* ---------- rows ----------
         Order: the scene-level strips sit directly under the scene headers,
         then the + character row, then one row per character. */
      var rows = Vue.computed(function () {
        var list = [];
        if (props.showPov) {
          list.push({ key: 'strip:pov', kind: 'pov', label: 'Perspective', headClass: 'stripe', tip: 'Perspective — double-click a cell to edit' });
        }
        if (props.showPlaces) {
          list.push({ key: 'strip:place', kind: 'place', label: 'Place', headClass: 'stripe', tip: 'Place — double-click a cell to edit' });
        }
        if (props.showTime) {
          list.push({ key: 'strip:time', kind: 'time', label: 'Story time', headClass: 'stripe', tip: 'Story time — double-click a cell to edit' });
        }
        list.push({ key: 'addchar', kind: 'add', label: 'character', headClass: 'add-head', tip: 'Add a character' });
        props.characters.forEach(function (c) {
          var active = 0;
          props.scenes.forEach(function (s) {
            var cell = props.cellMap[s.id + '|' + c.id];
            if (cell && cell.presence === model.PRESENCE.ACTIVE) active++;
          });
          list.push({
            key: 'char:' + c.id,
            kind: 'character',
            entity: c,
            label: c.name,
            tip: c.summary || c.name,
            color: c.color,
            badge: active || '',
            headClass: c.status === 'mentioned' ? 'offstage' : ''
          });
        });
        return list;
      });

      /* ---------- cell access ---------- */
      function cellOf(row, scene) {
        return props.cellMap[scene.id + '|' + row.entity.id] || null;
      }
      function cellText(row, scene) {
        var c = cellOf(row, scene);
        return c && c.text ? c.text : '';
      }
      function cellNote(row, scene) {
        var c = cellOf(row, scene);
        return c && c.note ? c.note : '';
      }

      function cellClass(row, scene) {
        var c = cellOf(row, scene);
        var cls = [];
        if (c) cls.push('p-' + c.presence);
        if (props.selection.sceneId === scene.id && props.selection.entityId === row.entity.id) {
          cls.push('selected');
        }
        if (!matchesFilter(row, scene)) cls.push('dimmed');
        return cls.join(' ');
      }

      function cellTitle(row, scene) {
        var c = cellOf(row, scene);
        var head = row.entity.name + ' · scene ' + (scene.order + 1) + ': ' + scene.title;
        if (!c) return head + '\n\nNot present. Alt+click to mark present.';
        var parts = [head, 'presence: ' + c.presence];
        if (c.text) parts.push('', c.text);
        if (c.note) parts.push('', 'note: ' + c.note);
        return parts.join('\n');
      }

      function matchesFilter(row, scene) {
        var f = props.filters || {};
        if (!f.text) return true;
        var c = cellOf(row, scene);
        var hay = ((c && c.text) || '') + ' ' + ((c && c.note) || '') + ' ' + row.entity.name;
        return hay.toLowerCase().indexOf(String(f.text).toLowerCase()) !== -1;
      }

      /* ---------- strips ---------- */
      function povName(s) {
        if (s.povIsNarrator || !s.pov) return 'narrator';
        var c = props.charIndex[s.pov];
        return c ? c.name : '?';
      }

      function placeName(s) {
        if (s.placeLabel) return s.placeLabel;
        var p = props.placeIndex[s.placeId];
        if (!p) return '';
        var parent = p.parentId ? props.placeIndex[p.parentId] : null;
        return parent ? parent.name + ' – ' + p.name : p.name;
      }

      function stripLabel(row, s) {
        if (row.kind === 'pov') return povName(s);
        if (row.kind === 'place') return placeName(s);
        return s.storyStart || '';
      }

      function stripTitle(row, s) {
        var label = row.kind === 'pov' ? 'Perspective'
          : row.kind === 'place' ? 'Place' : 'Story time';
        return label + ': ' + (stripLabel(row, s) || '—') +
          '\nscene ' + (s.order + 1) + ': ' + s.title;
      }

      function stripStyle(row, s) {
        if (row.kind !== 'pov') return {};
        if (s.povIsNarrator || !s.pov) return { color: 'var(--faint)' };
        var c = props.charIndex[s.pov];
        return c ? { color: c.color } : {};
      }

      function stripClass(row, s) {
        var cls = [];
        if (props.selection.sceneId === s.id) cls.push('selected');
        if (row.kind === 'time' && s.mode !== 'linear') cls.push('nonlinear');
        if (!stripLabel(row, s)) cls.push('empty');
        return cls.join(' ');
      }

      /* ---------- chapter band ----------
         One block per uninterrupted run of a chapter in the presentation,
         so the size of each unit is visible without reading the columns.
         Scenes nobody has grouped share a single "none" block. */
      var chapterRuns = Vue.computed(function () {
        var out = [];
        props.scenes.forEach(function (s, i) {
          var key = s.chapterId || '';
          var last = out[out.length - 1];
          if (last && last.key === key) {
            last.count++;
            last.last = s.order;
            return;
          }
          var ch = key ? props.chapterIndex[key] : null;
          out.push({
            key: key,
            id: key || null,
            count: 1,
            start: s.order,
            last: s.order,
            order: i,
            title: ch ? ch.title : '— no ' + props.unitLabel.toLowerCase() + ' —'
          });
        });
        return out;
      });

      function chapterOf(s) {
        return props.chapterIndex[s.chapterId] || null;
      }

      /* A column that opens a chapter carries its name, so the chapter of the
         columns on screen is never lost to a horizontal scroll. */
      var runByOrder = Vue.computed(function () {
        var map = Object.create(null);
        chapterRuns.value.forEach(function (r) { map[r.start] = r; });
        return map;
      });
      function runOf(s) {
        return runByOrder.value[s.order] || null;
      }
      function isRunStart(s) {
        return runOf(s) !== null;
      }

      function colTitle(s) {
        var parts = ['scene ' + (s.order + 1) + (s.title ? ': ' + s.title : '')];
        var ch = chapterOf(s);
        if (ch) parts.push((props.unitLabel || 'chapter').toLowerCase() + ': ' + ch.title);
        if (s.storyStart) parts.push('story time: ' + s.storyStart + (s.storyEnd ? ' → ' + s.storyEnd : ''));
        if (s.mode !== 'linear') parts.push('mode: ' + s.mode);
        if (s.hidden) parts.push('hidden event — not shown to the reader');
        return parts.join('\n');
      }

      function modeFlag(s) {
        return { flashback: '◀', flashforward: '▶', dream: '☾', vision: '◈' }[s.mode] || '◆';
      }

      /* ---------- drag to reorder ---------- */
      function onHeadDown(e, s) {
        if (e.button !== 0) return;
        drag.sceneId = s.id;
        drag.from = s.order;
        drag.to = s.order;
        drag.startX = e.clientX;
        drag.active = false;
        drag.suppressClick = false;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        window.addEventListener('pointermove', onHeadMove);
        window.addEventListener('pointerup', onHeadUp);
      }

      function onHeadMove(e) {
        if (drag.sceneId === null) return;
        if (!drag.active && Math.abs(e.clientX - drag.startX) < 7) return;
        drag.active = true;
        var origin = canvasOrigin();
        var idx = Math.floor((e.clientX - origin - props.railW) / props.zoom);
        idx = Math.max(0, Math.min(props.scenes.length - 1, idx));
        drag.to = idx;
      }

      function onHeadUp(e) {
        window.removeEventListener('pointermove', onHeadMove);
        window.removeEventListener('pointerup', onHeadUp);
        var wasDragging = drag.active;
        var sceneId = drag.sceneId;
        var to = drag.to;
        drag.active = false;
        drag.sceneId = null;
        if (!wasDragging || sceneId === null) return;
        drag.suppressClick = true;
        /* The column on the landing side decides which chapter the scene
           joins: dropping onto another chapter's run moves it into that
           chapter, so the groups stay contiguous. */
        var landingIdx = to > drag.from ? Math.min(props.scenes.length - 1, to + 1) : to;
        var landing = props.scenes[Math.max(0, landingIdx)];
        emit('drop-scene', {
          sceneId: sceneId,
          to: to,
          chapterId: landing ? landing.chapterId || null : null
        });
      }

      function onHeadClick(e, s) {
        if (drag.suppressClick) {
          drag.suppressClick = false;
          return;
        }
        emit('select-scene', s.id);
      }

      function canvasOrigin() {
        var el = scroller.value;
        if (!el) return 0;
        var rect = el.getBoundingClientRect();
        return rect.left - el.scrollLeft;
      }

      var dropStyle = Vue.computed(function () {
        var x = props.railW + (drag.to + 0.5) * props.zoom;
        return { left: x + 'px' };
      });

      /* ---------- zoom anchoring ---------- */
      function onWheel(e) {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        var el = scroller.value;
        if (!el) return;
        var rect = el.getBoundingClientRect();
        var anchor = e.clientX - rect.left + el.scrollLeft - props.railW;
        var before = props.zoom;
        var factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        var next = Math.max(LT.store.ZOOM_MIN, Math.min(LT.store.ZOOM_MAX, Math.round(before * factor)));
        if (next === before) return;
        LT.store.actions.setZoom(next);
        Vue.nextTick(function () {
          var ratio = next / before;
          el.scrollLeft = anchor * ratio - (e.clientX - rect.left);
        });
      }

      /* ---------- row headers ---------- */
      function isEntitySelected(row) {
        return row.kind === 'character' &&
          props.selection.entityId === row.entity.id;
      }

      function onRowheadClick(row) {
        if (renaming.key === row.key) return;
        if (row.kind === 'character') emit('select-entity', row.entity.id);
      }

      function onRowheadDblClick(row) {
        if (row.kind !== 'character') return;
        renaming.key = row.key;
        renaming.entityId = row.entity.id;
        renaming.value = row.entity.name;
        emit('select-entity', row.entity.id);
        Vue.nextTick(function () {
          var el = scroller.value && scroller.value.querySelector('.rh-input');
          if (el) { el.focus(); el.select(); }
        });
      }

      function commitRename() {
        var id = renaming.entityId;
        var name = String(renaming.value || '').trim();
        renaming.key = null;
        renaming.entityId = null;
        renaming.value = '';
        if (id && name) emit('rename-character', id, name);
      }

      function cancelRename() {
        renaming.key = null;
        renaming.entityId = null;
        renaming.value = '';
      }

      /* ---------- strip editing ---------- */
      /* Perspective, place and story time are scene attributes: editing them
         in the strip patches the scene, exactly like the inspector does. */
      function onStripDblClick(row, s) {
        stripEdit.key = row.key + ':' + s.id;
        stripEdit.kind = row.kind;
        stripEdit.sceneId = s.id;
        stripEdit.value = stripEditValue(row, s);
        emit('select-scene', s.id);
        Vue.nextTick(function () {
          var el = scroller.value && scroller.value.querySelector('.strip-input');
          if (el) {
            el.focus();
            if (el.select) el.select();
          }
        });
      }

      function stripEditValue(row, s) {
        if (row.kind === 'pov') {
          return s.povIsNarrator || !s.pov ? 'narrator' : s.pov;
        }
        if (row.kind === 'place') return placeName(s);
        return s.storyStart || '';
      }

      function commitStripEdit() {
        var kind = stripEdit.kind;
        var sceneId = stripEdit.sceneId;
        var value = String(stripEdit.value === undefined || stripEdit.value === null ? '' : stripEdit.value).trim();
        stripEdit.key = null;
        stripEdit.kind = null;
        stripEdit.sceneId = null;
        stripEdit.value = '';
        if (!sceneId) return;

        if (kind === 'pov') {
          emit('patch-scene', {
            sceneId: sceneId,
            patch: (!value || value === 'narrator')
              ? { pov: null, povIsNarrator: true }
              : { pov: value, povIsNarrator: false }
          });
        } else if (kind === 'place') {
          emit('patch-scene', { sceneId: sceneId, patch: { placeLabel: value } });
        } else if (kind === 'time') {
          emit('patch-scene', { sceneId: sceneId, patch: { storyStart: value } });
        }
      }

      function cancelStripEdit() {
        stripEdit.key = null;
        stripEdit.kind = null;
        stripEdit.sceneId = null;
        stripEdit.value = '';
      }

      /* ---------- cells ---------- */
      function onCellClick(e, row, s) {
        if (e.altKey) {
          emit('cycle-cell', { sceneId: s.id, entityId: row.entity.id });
          return;
        }
        emit('select-cell', { sceneId: s.id, entityId: row.entity.id });
      }

      function onCellDblClick(row, s) {
        editing.sceneId = s.id;
        editing.entityId = row.entity.id;
        editing.value = cellText(row, s);
        emit('select-cell', { sceneId: s.id, entityId: row.entity.id });
        Vue.nextTick(function () {
          var el = scroller.value && scroller.value.querySelector('.cell-input');
          if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
        });
      }

      function commitEdit() {
        if (editing.sceneId && editing.entityId) {
          emit('edit-cell', {
            sceneId: editing.sceneId,
            entityId: editing.entityId,
            text: editing.value
          });
        }
        cancelEdit();
      }

      function cancelEdit() {
        editing.sceneId = null;
        editing.entityId = null;
        editing.value = '';
      }

      /* ---------- scroll reporting ---------- */
      var rafId = 0;
      function onScroll() {
        if (rafId) return;
        rafId = requestAnimationFrame(function () {
          rafId = 0;
          var el = scroller.value;
          if (!el || !props.scenes.length) return;
          var total = props.scenes.length * props.zoom;
          var visible = el.clientWidth - props.railW;
          emit('viewport', {
            start: Math.max(0, Math.min(1, el.scrollLeft / total)),
            end: Math.max(0, Math.min(1, (el.scrollLeft + visible) / total))
          });
        });
      }

      function scrollSceneIntoView(sceneId) {
        var el = scroller.value;
        if (!el) return;
        var scene = null;
        for (var i = 0; i < props.scenes.length; i++) {
          if (props.scenes[i].id === sceneId) { scene = props.scenes[i]; break; }
        }
        if (!scene) return;
        var x = props.railW + scene.order * props.zoom;
        var left = el.scrollLeft;
        var right = left + el.clientWidth - props.railW;
        if (x < left || x + props.zoom > right) {
          el.scrollLeft = Math.max(0, x - (el.clientWidth - props.railW) / 2);
        }
      }

      return {
        scroller: scroller,
        editing: editing,
        renaming: renaming,
        stripEdit: stripEdit,
        onStripDblClick: onStripDblClick,
        commitStripEdit: commitStripEdit,
        cancelStripEdit: cancelStripEdit,
        drag: drag,
        canvasStyle: canvasStyle,
        colStyle: colStyle,
        cellStyle: cellStyle,
        dropStyle: dropStyle,
        rows: rows,
        rowStyle: rowStyle,
        isEntitySelected: isEntitySelected,
        onRowheadClick: onRowheadClick,
        onRowheadDblClick: onRowheadDblClick,
        commitRename: commitRename,
        cancelRename: cancelRename,
        cellOf: cellOf,
        cellText: cellText,
        cellNote: cellNote,
        cellClass: cellClass,
        cellTitle: cellTitle,
        stripLabel: stripLabel,
        stripStyle: stripStyle,
        stripTitle: stripTitle,
        stripClass: stripClass,
        chapterOf: chapterOf,
        chapterRuns: chapterRuns,
        runOf: runOf,
        isRunStart: isRunStart,
        colTitle: colTitle,
        modeFlag: modeFlag,
        onHeadDown: onHeadDown,
        onHeadClick: onHeadClick,
        onWheel: onWheel,
        onCellClick: onCellClick,
        onCellDblClick: onCellDblClick,
        commitEdit: commitEdit,
        cancelEdit: cancelEdit,
        onScroll: onScroll
      };
    }
  };
})(window.LT = window.LT || {});
