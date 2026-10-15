/* LivingTheatre — ruler.
   Three stacked bands over one horizontal span:
     top     presentation order, aligned with the matrix columns
     middle  connectors — where each scene sits on the story-time axis
             versus where it is presented, so non-linearity is a shape
     bottom  the story-time axis itself, proportional and ticked
   The ruler is the last element inside the matrix canvas and sticks to the
   bottom of the scroll stage. */
(function (LT) {
  'use strict';

  var model = LT.model;

  LT.components = LT.components || {};

  var BAND_ORDER = 26;
  var BAND_MAP = 34;
  var BAND_STORY = 30;

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var HOUR = 3600000, DAY = 86400000;

  function scaleOf(kind) {
    return kind === 'date' ? 1 : 1000;
  }

  function timeValue(t) {
    if (!t) return null;
    return t.kind === 'date' ? t.major : t.major * 1000 + t.minor;
  }

  var NUM_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000,
                   2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
  var DATE_STEPS = [
    { ms: HOUR, label: 'hour' }, { ms: 6 * HOUR, label: 'hour' },
    { ms: DAY, label: 'day' }, { ms: 2 * DAY, label: 'day' },
    { ms: 7 * DAY, label: 'week' }, { ms: 14 * DAY, label: 'week' },
    { ms: 30 * DAY, label: 'month' }, { ms: 90 * DAY, label: 'month' },
    { ms: 365 * DAY, label: 'year' }, { ms: 5 * 365 * DAY, label: 'year' }
  ];

  function niceStep(rough, kind) {
    if (kind === 'date') {
      for (var i = 0; i < DATE_STEPS.length; i++) {
        if (DATE_STEPS[i].ms >= rough) return DATE_STEPS[i].ms;
      }
      return DATE_STEPS[DATE_STEPS.length - 1].ms;
    }
    for (var j = 0; j < NUM_STEPS.length; j++) {
      if (NUM_STEPS[j] >= rough) return NUM_STEPS[j];
    }
    return NUM_STEPS[NUM_STEPS.length - 1];
  }

  function formatValue(v, step, kind) {
    if (kind === 'date') {
      var d = new Date(v);
      if (step >= 365 * DAY) return String(d.getUTCFullYear());
      if (step >= 28 * DAY) return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
      if (step >= DAY) return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
      var h = d.getUTCHours();
      return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + (h < 10 ? '0' + h : h) + ':00';
    }
    /* compound: value = major * 1000 + beat; a whole major prints bare */
    var major = Math.floor(v / 1000);
    var minor = Math.round(v - major * 1000);
    return minor === 0 ? String(major) : major + '.' + minor;
  }

  LT.components.Ruler = {
    name: 'LtRuler',
    props: {
      scenes: Array,
      zoom: Number,
      railW: Number,
      selection: Object
    },
    emits: ['select-scene'],

    template: `
<div class="ruler" :style="{ width: railW + scenes.length * zoom + 'px' }">

  <div class="ruler-band band-order" :style="{ height: BAND_ORDER + 'px' }">
    <div class="ruler-rail-label">order</div>
      <div v-for="s in scenes" :key="s.id"
         class="ruler-scene"
         :class="{ selected: selection.sceneId === s.id, flash: s.mode !== 'linear', hidden: s.hidden }"
         :style="tickStyle(s)"
         :title="'scene ' + (s.order + 1) + (s.title ? ': ' + s.title : '') + (s.hidden ? '\\n(hidden event — not shown to the reader)' : '')"
         @click="$emit('select-scene', s.id)">
      <span v-if="zoom >= 26">{{ s.order + 1 }}</span>
    </div>
  </div>

  <div class="ruler-band band-map" :style="{ height: BAND_MAP + 'px' }">
    <div class="ruler-rail-label">story</div>
    <svg v-if="hasTime" class="ruler-svg"
         :width="spanW" :height="BAND_MAP"
         :style="{ left: railW + 'px' }">
      <line v-for="(c, i) in connectors" :key="'c' + i"
            :x1="c.x1" :y1="0" :x2="c.x2" :y2="BAND_MAP"
            :class="{ back: c.back }"></line>
      <polyline v-if="curvePoints" :points="curvePoints" class="ruler-curve"></polyline>
      <circle v-for="(p, i) in markers" :key="'m' + i"
              :cx="p.x" :cy="p.y" r="2.6"
              :class="{ selected: p.selected, hidden: p.hidden }"></circle>
    </svg>
    <div v-else class="ruler-note">no story time set</div>
  </div>

  <div class="ruler-band band-story" :style="{ height: BAND_STORY + 'px' }">
    <div class="ruler-rail-label">when</div>
    <div v-for="(t, i) in ticks" :key="'t' + i"
         class="ruler-axistick"
         :style="{ left: railW + t.x * spanW + 'px' }">
      <i></i><span>{{ t.label }}</span>
    </div>
  </div>
</div>`,

    setup: function (props) {
      var BAND_MAP_H = BAND_MAP;

      var spanW = Vue.computed(function () {
        return Math.max(1, props.scenes.length * props.zoom);
      });

      var times = Vue.computed(function () {
        return props.scenes.map(function (s) {
          return model.parseStoryTime(s.storyStart);
        });
      });

      var domain = Vue.computed(function () {
        var vals = times.value.map(timeValue).filter(function (v) { return v !== null; });
        if (!vals.length) return null;
        var min = vals[0], max = vals[0];
        vals.forEach(function (v) {
          if (v < min) min = v;
          if (v > max) max = v;
        });
        var kind = 'compound';
        for (var i = 0; i < times.value.length; i++) {
          if (times.value[i]) { kind = times.value[i].kind; break; }
        }
        return { min: min, max: max, span: max - min, kind: kind };
      });

      var hasTime = Vue.computed(function () { return domain.value !== null; });

      function relOf(value) {
        var d = domain.value;
        if (!d) return 0.5;
        if (d.span <= 0) return 0.5;
        return (value - d.min) / d.span;
      }

      function tickStyle(s) {
        return {
          left: props.railW + s.order * props.zoom + 'px',
          width: props.zoom + 'px'
        };
      }

      var rels = Vue.computed(function () {
        return times.value.map(function (t) {
          var v = timeValue(t);
          return v === null ? null : relOf(v);
        });
      });

      var markers = Vue.computed(function () {
        var out = [];
        props.scenes.forEach(function (s, i) {
          var r = rels.value[i];
          if (r === null) return;
          out.push({
            x: r * spanW.value,
            y: BAND_MAP_H - 4 - r * (BAND_MAP_H - 8),
            selected: props.selection.sceneId === s.id,
            hidden: !!s.hidden
          });
        });
        return out;
      });

      var connectors = Vue.computed(function () {
        var out = [];
        props.scenes.forEach(function (s, i) {
          var r = rels.value[i];
          if (r === null) return;
          out.push({
            x1: s.order * props.zoom + props.zoom / 2,
            x2: r * spanW.value,
            back: i > 0 && rels.value[i - 1] !== null && r < rels.value[i - 1]
          });
        });
        return out;
      });

      var curvePoints = Vue.computed(function () {
        var pts = markers.value;
        if (pts.length < 2) return '';
        return pts.map(function (p) {
          return p.x.toFixed(1) + ',' + p.y.toFixed(1);
        }).join(' ');
      });

      var ticks = Vue.computed(function () {
        var d = domain.value;
        if (!d) return [];
        var target = Math.max(2, Math.min(14, Math.floor(spanW.value / 110)));
        var out = [];

        if (d.kind === 'date') {
          if (d.span <= 0) {
            out.push({ x: 0.5, label: formatValue(d.min, d.span || DAY, d.kind) });
            return out;
          }
          var roughMs = d.span / target;
          var stepMs = niceStep(roughMs, 'date');
          for (var v = Math.ceil(d.min / stepMs) * stepMs; v <= d.max + stepMs * 0.001; v += stepMs) {
            out.push({ x: (v - d.min) / d.span, label: formatValue(v, stepMs, d.kind) });
          }
          return out;
        }

        /* Compound / numeric story time ("1.4", "2.1") is a chapter.major
           plus a beat number, so the meaningful grid is every major value,
           with the range endpoints always labelled. Within a single major
           the axis subdivides by whole beats instead. */
        var pushTick = function (v) {
          for (var i = 0; i < out.length; i++) {
            if (Math.abs(out[i].x - (v - d.min) / d.span) < 0.002) return;
          }
          out.push({ x: (v - d.min) / d.span, label: formatValue(v, d.kind === 'date' ? 1 : 1000, d.kind) });
        };

        if (d.span >= 1000) {
          var firstMajor = Math.ceil(d.min / 1000) * 1000;
          var lastMajor = Math.floor(d.max / 1000) * 1000;
          var majors = [];
          for (var m = firstMajor; m <= lastMajor; m += 1000) majors.push(m);
          var stride = Math.max(1, Math.ceil(majors.length / target));
          for (var k = 0; k < majors.length; k += stride) pushTick(majors[k]);
        } else if (d.span > 0) {
          var rough = d.span / target;
          var step = niceStep(rough, 'compound');
          for (var b = Math.ceil(d.min / step) * step; b <= d.max + step * 0.001; b += step) {
            pushTick(b);
          }
        }
        pushTick(d.min);
        pushTick(d.max);
        out.sort(function (a, b) { return a.x - b.x; });
        return out;
      });

      return {
        BAND_ORDER: BAND_ORDER,
        BAND_MAP: BAND_MAP,
        BAND_STORY: BAND_STORY,
        spanW: spanW,
        hasTime: hasTime,
        ticks: ticks,
        markers: markers,
        connectors: connectors,
        curvePoints: curvePoints,
        tickStyle: tickStyle
      };
    }
  };
})(window.LT = window.LT || {});
