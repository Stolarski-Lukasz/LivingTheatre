/* LivingTheatre — modals.
   The projects library and the keyboard/mouse reference. */
(function (LT) {
  'use strict';

  LT.components = LT.components || {};

  LT.components.LibraryModal = {
    name: 'LtLibraryModal',
    props: {
      library: Array,
      currentId: String
    },
    emits: ['close', 'new-project', 'load-demo', 'load-project', 'delete-project',
            'import-json', 'import-sheet', 'load-sample'],

    template: `
<div class="modal-backdrop" @click.self="$emit('close')">
  <div class="modal">
    <div class="modal-head">
      <span>Projects</span>
      <span class="spacer"></span>
      <button class="btn ghost icon" title="Close" @click="$emit('close')">✕</button>
    </div>
    <div class="modal-body">
      <div class="proj-list">
        <div v-for="p in library" :key="p.id"
             class="proj-item"
             :class="{ current: p.id === currentId }"
             @click="$emit('load-project', p.id)">
          <div class="pi-main">
            <div class="pi-title">{{ p.title || 'Untitled' }}</div>
            <div class="pi-meta">
              {{ p.sceneCount }} scenes · {{ p.characterCount }} characters ·
              {{ formatWhen(p.modified) }}
            </div>
          </div>
          <button class="btn ghost danger icon" title="Delete"
                  @click.stop="$emit('delete-project', p.id)">🗑</button>
        </div>
        <div v-if="!library.length" class="empty-note">No saved projects yet.</div>
      </div>

      <div class="drop-zone" @click="$emit('import-sheet')">
        <div class="dz-title">Import a plot sheet</div>
        <div>CSV, ODS or XLSX — one column per scene, rows for chapter, scene, story
             time, place, perspective, then one row per character.</div>
      </div>
      <div class="drop-zone ghost" @click="$emit('load-sample')">
        <div class="dz-title">Load the Fabuła sample</div>
        <div>The crime novel the import format was designed for, embedded — no file needed.</div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" @click="$emit('import-json')">Import JSON…</button>
      <button class="btn" @click="$emit('load-demo')">Load demo</button>
      <button class="btn primary" @click="$emit('new-project')">New project</button>
    </div>
  </div>
</div>`,

    setup: function () {
      function formatWhen(iso) {
        if (!iso) return '—';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return { formatWhen: formatWhen };
    }
  };

  LT.components.HelpModal = {
    name: 'LtHelpModal',
    props: {},
    emits: ['close'],

    template: `
<div class="modal-backdrop" @click.self="$emit('close')">
  <div class="modal narrow">
    <div class="modal-head">
      <span>Mouse &amp; keyboard</span>
      <span class="spacer"></span>
      <button class="btn ghost icon" title="Close" @click="$emit('close')">✕</button>
    </div>
    <div class="modal-body">
      <table class="help-table">
        <tbody>
          <tr><td>click cell / scene header</td><td>select</td></tr>
          <tr><td>double-click cell</td><td>write what the character does</td></tr>
          <tr><td>double-click strip cell</td><td>edit perspective / place / story time</td></tr>
          <tr><td>alt+click cell</td><td>cycle presence · absent → idle → active</td></tr>
          <tr><td>drag scene header</td><td>reorder the presentation</td></tr>
          <tr><td>click track</td><td>character options</td></tr>
          <tr><td>double-click track name</td><td>rename a character</td></tr>
          <tr><td>ctrl+B</td><td>show / hide the sidebar</td></tr>
          <tr><td>ctrl+I</td><td>show / hide the inspector</td></tr>
          <tr><td>ctrl+wheel / pinch</td><td>zoom anchored at the pointer</td></tr>
          <tr><td>← →</td><td>previous / next scene</td></tr>
          <tr><td>↑ ↓</td><td>previous / next character</td></tr>
          <tr><td>+ / −</td><td>zoom in / out</td></tr>
          <tr><td>0</td><td>reset zoom</td></tr>
          <tr><td>ctrl+Z / ctrl+shift+Z</td><td>undo / redo</td></tr>
          <tr><td>ctrl+S</td><td>save now</td></tr>
          <tr><td>ctrl+E</td><td>export JSON</td></tr>
          <tr><td>esc</td><td>clear selection / close dialog</td></tr>
        </tbody>
      </table>
      <p class="help-note">
        The bottom ruler reads: <b>order</b> — presentation order, aligned with the
        columns; <b>story</b> — connectors showing where each scene falls on the
        story-time axis; <b>when</b> — the story-time axis itself, proportionally
        ticked. A connector that jumps backwards is a flashback.
      </p>
    </div>
  </div>
</div>`
  };
})(window.LT = window.LT || {});
