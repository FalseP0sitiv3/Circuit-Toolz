import { test } from 'node:test';
import assert from 'node:assert/strict';
import { songFamily, arrange, songTimeline, songNotes, slotEvents, usedSlots, songToMidi, songRoadmap, STRATEGY_IDS, SONG_TRACKS, SONG_RANGES } from '../src/core/song.js';
import { SCALES, DRUM_NOTES, readMidiNotes } from '../src/core/patterns.js';

test('Canción: 8 patrones por pista, deterministas y en la escala', () => {
  const a = songFamily({ seed: 4, style: 'rumble', root: 2, scale: 'phrygian' }), b = songFamily({ seed: 4, style: 'rumble', root: 2, scale: 'phrygian' });
  assert.deepEqual(a, b);
  assert.equal(a.tracks.length, 8);
  for (const [t, slots] of a.tracks.entries()) {
    assert.equal(slots.length, 8);
    assert.equal(slots[7].notes.length, 0, 'el patrón 8 es silencio');
    assert.ok(slots[1].notes.length > 0 || SONG_TRACKS[t].kind === 'drum', `${SONG_TRACKS[t].label}: groove A vacío`);
    for (const p of slots) for (const e of p.notes) {
      assert.ok(e.t >= 0 && e.t < 16, 'dentro del patrón');
      if (SONG_TRACKS[t].kind === 'synth') assert.ok(SCALES.phrygian.iv.includes((((e.n - 2) % 12) + 12) % 12), `${SONG_TRACKS[t].label}: ${e.n} fuera de escala`);
      else assert.equal(e.lane, SONG_TRACKS[t].lane);
    }
  }
  assert.notDeepEqual(songFamily({ seed: 5 }).tracks[0], songFamily({ seed: 6 }).tracks[0]);
  const locked = songFamily({ seed: 9, locked: new Set([0, 4]), prev: a.tracks });
  assert.deepEqual(locked.tracks[0], a.tracks[0]); assert.deepEqual(locked.tracks[4], a.tracks[4]);
});
test('Plan de escenas: lo que se oye aquí es lo que tocará el Circuit (≤ 16 escenas, cada una suena una vez)', () => {
  for (const id of STRATEGY_IDS) for (const steps of [16, 32]) for (const rs of [0, 1, 2]) for (const off of [new Set([3]), new Set([2, 3]), new Set()]) {
    const tl = songTimeline(arrange(id, 3, { reshuffle: rs }), { off, steps });
    assert.ok(tl.scenes.length <= 16 && tl.scenes.length > 0, `${id}/${steps}: ${tl.scenes.length} escenas`);
    let bar = 0;
    for (const sc of tl.scenes) {
      // regla del Circuit: una escena dura su cadena más larga (las pistas apagadas no cuentan salvo la de reloj)
      const chainBars = sc.tracks.filter((t) => t.key !== 'off').map((t) => (t.key === 'timer' ? t.to - t.from + 1 : ((t.to - t.from + 1) * steps) / 16));
      assert.equal(sc.bars, Math.max(...chainBars), `${id}/${steps}: la escena ${sc.n} no dura su cadena más larga`);
      assert.equal(sc.start, bar); bar += sc.bars;
      for (const t of sc.tracks) assert.ok(t.from <= t.to && t.to <= 7);
    }
    assert.equal(bar, tl.bars);
    if (rs === 0 && off.has(3) && steps === 16) assert.deepEqual(tl.changed, [], `${id}: la estrategia de serie cabe sin recortes`);
  }
  const tl = songTimeline(arrange('dj', 1), { off: new Set([2, 3]), steps: 16 });
  assert.equal(tl.timer, 3); assert.ok(tl.scenes.some((x) => x.of > 1), 'las secciones largas son escenas copiadas');
  assert.ok(tl.sections.every((s) => s.tracks[2].key === 'off' && s.tracks[3].key === 'timer'));
});
test('Canción: notas, patrones para grabar, hoja de ruta y .mid de tipo 1', () => {
  const fam = songFamily({ seed: 2, steps: 16 }), tl = songTimeline(arrange('peak', 2), { off: new Set([3]) });
  const notes = songNotes(fam, tl);
  assert.ok(notes.length > 500 && notes.every((e) => e.t < tl.bars * 16 && e.track !== 3));
  const slots = usedSlots(tl); assert.ok(!slots.includes(7) && slots.includes(1));
  const ev = slotEvents(fam, 1, { channels: [0, 1, 2, 3], drumChannel: 9, off: new Set([2, 3]) });
  assert.ok(ev.some((e) => e.ch === 9 && DRUM_NOTES.includes(e.n)) && ev.some((e) => e.ch === 0) && !ev.some((e) => e.ch === 2));
  const rm = songRoadmap(fam, tl, 128); assert.equal(rm.length, tl.scenes.length); assert.equal(rm[0].chains.length, 8); assert.ok(rm.some((r) => r.same) && rm.every((r) => r.chains[3].endsWith('⏱')));
  const mid = songToMidi(fam, tl, { tempo: 128, off: new Set([3]) });
  assert.equal(String.fromCharCode(...mid.slice(0, 4)), 'MThd'); assert.equal(mid[9], 1); assert.equal(mid[11], 8, 'tempo + 7 pistas');
  // simulación independiente: cada escena una vez, cada pista da vueltas a su cadena desde el principio de la escena
  const ref = []; for (const sc of tl.scenes) sc.tracks.forEach((tr, t) => { if (tr.key === 'off' || tr.key === 'timer') return; const ch = []; for (let k = tr.from; k <= tr.to; k++) ch.push(fam.tracks[t][k]); for (let st = 0; st < sc.bars * 16; st++) { const p = ch[Math.floor(st / 16) % ch.length]; for (const e of p.notes) if (e.t === st % 16) ref.push(`${sc.start * 16 + st}:${t}:${e.n}`); } });
  assert.deepEqual(notes.map((e) => `${e.t}:${e.track}:${e.n}`).sort(), ref.sort());
  const drum = songToMidi(fam, tl, { drumMap: 'gm', off: new Set([0, 1, 2, 3, 5, 6, 7]) });
  const r = readMidiNotes(drum); assert.ok(r.notes.length > 0 && r.notes.every((e) => e.n === 36), 'Drum 1 en la nota 36 del Drum Rack');
});

// ---------- v3.4: más repetición dentro de cada parte ----------
test('Repetición: el groove es A A A\' fill; A\' solo remata el último tiempo de la batería', () => {
  for (const steps of [16, 32]) {
    const f = songFamily({ seed: 11, style: 'techno', steps });
    assert.deepEqual(SONG_RANGES.groove, [1, 4]); assert.deepEqual(SONG_RANGES.groove2, [1, 2]);
    for (let t = 0; t < 8; t++) assert.deepEqual(f.tracks[t][2], f.tracks[t][1], `${SONG_TRACKS[t].label}: patrones 2 y 3 iguales`);
    for (let t = 0; t < 4; t++) assert.deepEqual(f.tracks[t][3], f.tracks[t][1], `${SONG_TRACKS[t].label}: los synths no cambian en A'`);
    assert.deepEqual(f.tracks[4][3], f.tracks[4][1], 'el bombo no cambia en A\'');
    const key = (p) => p.notes.filter((e) => e.t < steps - 4).map((e) => `${e.t}:${e.n}:${e.v}`).sort().join();
    for (let t = 4; t < 8; t++) assert.equal(key(f.tracks[t][3]), key(f.tracks[t][1]), `${SONG_TRACKS[t].label}: A' solo cambia el último tiempo`);
    assert.ok([5, 6, 7].some((t) => JSON.stringify(f.tracks[t][3]) !== JSON.stringify(f.tracks[t][1])), 'A\' remata en caja, charles o percusión');
  }
});
test('Repetición: con pista reloj, las escenas del medio solo tocan A y la última remata; sin reloj, la cadena entera', () => {
  for (const steps of [16, 32]) {
    const secs = arrange('peak', 3);
    const tl = songTimeline(secs, { off: new Set([3]), steps });
    const drop = tl.scenes.filter((x) => x.id === 'drop');
    assert.ok(drop.length >= 2, `drop en ${drop.length} escenas`);
    const K = (x) => `${x.tracks[4].from}-${x.tracks[4].to}`;
    assert.ok(drop.slice(0, -1).every((x) => K(x) === '1-2') && K(drop[drop.length - 1]) === '1-4', drop.map(K).join(' '));
    assert.ok(drop.slice(1, -1).every((x) => x.same === drop[0].n) && drop[drop.length - 1].same == null && drop[drop.length - 1].end);
    const rm = songRoadmap(songFamily({ seed: 3, steps }), tl, 128);
    assert.ok(rm.some((r) => r.end) && rm.filter((r) => r.same).every((r) => tl.scenes[r.same - 1].id === tl.scenes[r.scene - 1].id), 'hoja de ruta: copias de la misma sección y escenas de remate');
    // sin pista libre no hay reloj: la escena dura la cadena, así que todas tocan A A A' fill
    const tl2 = songTimeline(secs, { off: new Set(), steps });
    assert.ok(tl2.scenes.filter((x) => x.id === 'drop').every((x) => K(x) === '1-4'));
  }
});
