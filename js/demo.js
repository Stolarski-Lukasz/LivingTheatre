/* LivingTheatre — demo project.
   The Fabuła sheet exercises characters, places, POV and story time, but it
   has no threads, no flashbacks and no setup/payoff links, so those features
   are invisible on first run. This miniature story is built to show them. */
(function (LT) {
  'use strict';

  var model = LT.model;

  function build() {
    var p = model.createProject({
      meta: {
        title: 'Demo — the alibi',
        author: 'LivingTheatre'
      }
    });

    var ch1 = model.createChapter({ title: 'Chapter 1', order: 0 });
    var ch2 = model.createChapter({ title: 'Chapter 2', order: 1 });
    var ch3 = model.createChapter({ title: 'Chapter 3', order: 2 });
    p.chapters = [ch1, ch2, ch3];

    var ida = model.createCharacter({ name: 'Ida', color: '#e05263', role: 'detective', summary: 'Works from what people do, not what they say.' });
    var jan = model.createCharacter({ name: 'Jan', color: '#3d7dd8', role: 'suspect', summary: 'Loud, defensive, hides a debt.' });
    var ewa = model.createCharacter({ name: 'Ewa', color: '#2fa06a', role: 'witness', summary: 'Saw more than she admits.' });
    var old  = model.createCharacter({ name: 'The broker', color: '#8256c4', role: 'offstage', summary: 'Never appears in person.', status: 'mentioned' });
    p.entities.characters = [ida, jan, ewa, old];

    var house = model.createPlace({ name: 'Warehouse' });
    var office = model.createPlace({ name: 'Back office' });
    var street = model.createPlace({ name: 'Quay' });
    var flat = model.createPlace({ name: "Ida's flat" });
    p.entities.places = [house, office, street, flat];

    var debt = model.createThread({ name: "Jan's debt", color: '#d29922',
      summary: 'Set up early, paid off late.' });
    var mirror = model.createThread({ name: 'The broken mirror', color: '#0f9aa8',
      summary: 'A physical clue that changes meaning twice.' });
    p.entities.threads = [debt, mirror];

    var scenes = [
      { ch: ch1, title: 'Warehouse, morning', time: '1.1', pov: ida, narrator: false, place: house,
        summary: 'Ida surveys the room after the theft.' },
      { ch: ch1, title: 'The broken mirror', time: '1.2', pov: ida, narrator: false, place: house,
        summary: 'A mirror lies on the floor, cracked outward.' },
      { ch: ch1, title: 'Jan argues with the broker', time: '1.3', pov: jan, narrator: false, place: office,
        summary: 'Not shown directly, only overheard.' },
      { ch: ch1, title: 'Ewa waits by the quay', time: '1.4', pov: ewa, narrator: false, place: street,
        summary: 'She is waiting for someone who does not arrive.' },

      { ch: ch2, title: 'Ida interviews Jan', time: '2.1', pov: ida, narrator: false, place: office,
        summary: 'Jan gives an alibi he has not checked.' },
      { ch: ch2, title: 'What the mirror proves', time: '1.2', pov: 'flashback', narrator: true, place: house,
        mode: 'flashback', anchor: 1,
        summary: 'A rewind: the crack ran outward, so the impact came from inside.' },
      { ch: ch2, title: 'Ewa changes her story', time: '2.2', pov: ewa, narrator: false, place: street,
        summary: 'She names the broker.' },

      { ch: ch2, title: 'The hidden removal', time: '2.3', hidden: true, narrator: true, place: office,
        summary: 'The ledger page is burned. The reader never sees this.' },

      { ch: ch3, title: 'Confrontation', time: '3.1', pov: jan, narrator: false, place: office,
        summary: 'Jan admits the debt, denies the theft.' },
      { ch: ch3, title: 'Ida at home', time: '3.2', pov: ida, narrator: false, place: flat,
        summary: 'She realises Ewa was protecting someone.' }
    ];

    p.scenes = scenes.map(function (s, i) {
      var anchor = s.anchor !== undefined ? p.scenes[s.anchor] : null;
      return model.createScene({
        chapterId: s.ch.id,
        order: i,
        title: s.title,
        storyStart: s.time,
        mode: s.mode || 'linear',
        sourceSceneId: anchor ? anchor.id : null,
        povIsNarrator: s.narrator !== false,
        pov: s.pov && s.pov !== 'flashback' && p.entities.characters.indexOf(s.pov) !== -1
          ? s.pov.id : null,
        placeId: s.place ? s.place.id : null,
        placeLabel: s.place ? s.place.name : '',
        hidden: !!s.hidden,
        summary: s.summary || ''
      });
    });

    /* Reference the "flashback" pseudo-character properly: the scene above is
       narrator-perspective, and its anchor points at scene 2. */
    p.scenes[5].sourceSceneId = p.scenes[1].id;

    function cell(sceneIdx, character, presence, text) {
      p.cells.push(model.createCell({
        sceneId: p.scenes[sceneIdx].id,
        entityId: character.id,
        presence: presence,
        text: text || ''
      }));
    }

    cell(0, ida, 'active', 'Notes the forced lock, does not touch anything.');
    cell(0, jan, 'active', 'Present, silent, watching who Ida looks at.');
    cell(0, ewa, 'idle', 'Arrives late, out of breath.');
    cell(1, ida, 'active', 'Photographs the crack. Knows the direction matters.');
    cell(1, jan, 'absent', '');
    cell(2, jan, 'active', 'Asks for more time. The broker names a figure.');
    cell(2, ewa, 'absent', '');
    cell(2, old, 'active', 'Offstage presence — only a voice, never shown.');
    cell(3, ewa, 'active', 'Waits forty minutes, then leaves.');
    cell(4, ida, 'active', 'Offers the alibi back to him, gently.');
    cell(4, jan, 'active', 'Repeats the alibi word for word.');
    cell(5, ida, 'active', 'Reconstructs the impact direction from the photograph.');
    cell(6, ewa, 'active', 'Names the broker, then retracts the name.');
    cell(7, jan, 'active', 'Burns the ledger page while alone.');
    cell(8, jan, 'active', 'Admits the debt. Denies the theft.');
    cell(8, ida, 'active', 'Lets him admit the smaller crime only.');
    cell(9, ida, 'active', 'Realises Ewa was protecting Jan, not the broker.');

    p.threadCells.push(model.createThreadCell({
      sceneId: p.scenes[0].id, threadId: debt.id, kind: 'setup',
      text: 'Jan checks his phone twice and refuses to say why.'
    }));
    p.threadCells.push(model.createThreadCell({
      sceneId: p.scenes[2].id, threadId: debt.id, kind: 'advance',
      text: 'The figure named by the broker.'
    }));
    p.threadCells.push(model.createThreadCell({
      sceneId: p.scenes[4].id, threadId: debt.id, kind: 'advance',
      text: 'The alibi is about money, not time.'
    }));
    p.threadCells.push(model.createThreadCell({
      sceneId: p.scenes[8].id, threadId: debt.id, kind: 'payoff',
      text: 'He admits the debt.'
    }));
    p.threadCells.push(model.createThreadCell({
      sceneId: p.scenes[8].id, threadId: debt.id, kind: 'resolve',
      text: 'Closed.'
    }));

    p.threadCells.push(model.createThreadCell({
      sceneId: p.scenes[1].id, threadId: mirror.id, kind: 'setup',
      text: 'The crack runs outward.'
    }));
    p.threadCells.push(model.createThreadCell({
      sceneId: p.scenes[5].id, threadId: mirror.id, kind: 'advance',
      text: 'The flashback re-reads the same crack from the other side.'
    }));
    p.threadCells.push(model.createThreadCell({
      sceneId: p.scenes[9].id, threadId: mirror.id, kind: 'payoff',
      text: 'Ewa broke it herself, later, to hide something else.'
    }));

    p.links.push(model.createLink({
      type: 'setup',
      fromSceneId: p.scenes[1].id,
      toSceneId: p.scenes[5].id,
      label: 'the mirror is planted here and explained here'
    }));
    p.links.push(model.createLink({
      type: 'setup',
      fromSceneId: p.scenes[0].id,
      toSceneId: p.scenes[8].id,
      label: 'the debt thread'
    }));
    p.links.push(model.createLink({
      type: 'cause',
      fromSceneId: p.scenes[2].id,
      toSceneId: p.scenes[6].id,
      label: 'the broker names a figure, so Ewa names him too'
    }));

    return model.normalize(p);
  }

  LT.demo = { build: build };
})(window.LT = window.LT || {});
