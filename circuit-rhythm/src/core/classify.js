// core/classify.js — clasificación explicable: nombre, carpeta y sonido son tres fuentes separadas.

// Teclas como en la herramienta de Tracks: B bass, P pad (Atmos), L lead (Synth)
export const CATS = [
  { id: 'kick', key: 'K', group: 'drums' },
  { id: 'snare', key: 'S', group: 'drums' },
  { id: 'clap', key: 'C', group: 'drums' },
  { id: 'hat', key: 'H', group: 'drums' },
  { id: 'ohat', key: 'O', group: 'drums' },
  { id: 'cymbal', key: 'Y', group: 'drums' },
  { id: 'tom', key: 'T', group: 'drums' },
  { id: 'perc', key: 'E', group: 'drums' },
  { id: 'bass', key: 'B', group: 'tonal' },
  { id: 'synth', key: 'L', group: 'tonal' },
  { id: 'atmos', key: 'P', group: 'texture' },
  { id: 'fx', key: 'X', group: 'texture' },
  { id: 'vox', key: 'V', group: 'texture' },
  { id: 'dloop', key: 'D', group: 'loops' },
  { id: 'mloop', key: 'M', group: 'loops' },
];
export const CAT_IDS = CATS.map((c) => c.id);
export const catByKey = (k) => CATS.find((c) => c.key === k.toUpperCase());

// Parecidos que no cuentan como contradicción
const COMPAT = [
  ['hat', 'ohat', 'cymbal'], ['snare', 'clap', 'perc'], ['kick', 'tom', 'bass'], ['bass', 'synth'],
  ['atmos', 'fx', 'synth'], ['dloop', 'mloop'],
  // un loop de bajo suena a bajo; un loop de batería, a sus golpes (solo por pares con el loop)
  ...['bass', 'synth', 'atmos'].map((c) => ['mloop', c]), ...['kick', 'perc', 'hat', 'snare', 'clap'].map((c) => ['dloop', c]), ['perc', 'tom', 'hat'], ['fx', 'perc'], ['vox', 'fx', 'atmos', 'synth'],
];
export const compatible = (a, b) => a === b || COMPAT.some((g) => g.includes(a) && g.includes(b));

// ---------- léxico ----------
const LEX = {
  kick: ['kick', 'kik', 'kck', 'bd', 'bassdrum', 'kickdrum', 'bombo', 'kicks', 'bdrum'],
  snare: ['snare', 'snr', 'sd', 'sn', 'caja', 'snares', 'snaredrum'],
  clap: ['clap', 'clp', 'cp', 'claps', 'palmas', 'handclap', 'clapping'],
  hat: ['hihat', 'hh', 'ch', 'chh', 'closedhat', 'chat', 'hats', 'hat', 'closed', 'hatclosed', 'hhc'],
  ohat: ['oh', 'ohh', 'openhat', 'hatopen', 'ophat', 'hho', 'open'],
  cymbal: ['crash', 'ride', 'cym', 'cymbal', 'cymbals', 'splash', 'china', 'plato', 'platillo', 'rd'],
  tom: ['tom', 'toms', 'lt', 'mt', 'ht', 'floortom', 'tomlo', 'tomhi'],
  perc: ['perc', 'prc', 'percussion', 'percs', 'rim', 'rimshot', 'rs', 'shaker', 'shk', 'conga', 'bongo', 'cowbell', 'cb',
    'tamb', 'tambourine', 'clave', 'claves', 'woodblock', 'block', 'click', 'tick', 'snap', 'fingersnap', 'metal', 'triangle', 'guiro', 'cabasa', 'maraca', 'maracas'],
  bass: ['bass', 'bs', 'sub', 'subbass', 'reese', 'acid', '303', 'tb303', 'bassline', 'bajo', 'wobble', 'wooble', 'subs', 'basses'],
  synth: ['synth', 'stab', 'stabs', 'chord', 'chords', 'pluck', 'plucks', 'lead', 'leads', 'key', 'keys', 'piano', 'organ', 'bell', 'bells',
    'arp', 'note', 'acorde', 'acordes', 'brass', 'strings', 'string', 'hit', 'hits', 'synths', 'mallet', 'marimba', 'rhodes'],
  atmos: ['pad', 'pads', 'drone', 'drones', 'atmo', 'atmos', 'atmosphere', 'ambience', 'ambient', 'texture', 'textures', 'textura', 'soundscape', 'fieldrec'],
  fx: ['fx', 'sfx', 'riser', 'rise', 'uplifter', 'downlifter', 'downer', 'sweep', 'sweeps', 'impact', 'impacts', 'boom', 'whoosh', 'noise',
    'glitch', 'zap', 'laser', 'siren', 'transition', 'sweeper', 'swell', 'reverse', 'rev', 'crashfx', 'noisefx', 'effect', 'effects'],
  vox: ['vox', 'vocal', 'vocals', 'voice', 'voices', 'voz', 'spoken', 'phrase', 'chant', 'acapella', 'shout', 'adlib', 'speech', 'vocoder'],
  dloop: ['break', 'breaks', 'breakbeat', 'brk', 'top', 'tops', 'groove', 'grv', 'beat', 'beats', 'drumloop', 'fill', 'fills', 'percloop', 'hatloop', 'toploop'],
  mloop: ['melody', 'melodic', 'melodia', 'arploop', 'chordloop', 'bassloop', 'synthloop', 'musicloop'],
};
// pesos: los ambiguos valen menos
const WEAK = new Set(['hat', 'hats', 'open', 'closed', 'hit', 'hits', 'note', 'key', 'room', 'tone', 'dark', 'field', 'rev', 'reverse', 'noise',
  'metal', 'block', 'click', 'tick', 'beat', 'beats', 'top', 'tops', 'sub', 'acid', 'sn', 'sd', 'bs', 'rd', 'oh', 'lt', 'mt', 'ht', 'cb', 'rs', 'fill', 'fills', 'string', 'strings', 'snap', 'boom', 'effect', 'effects', 'swell']);
const TOKEN2CAT = new Map();
for (const [cat, words] of Object.entries(LEX)) for (const w of words) if (!TOKEN2CAT.has(w)) TOKEN2CAT.set(w, cat);

const BIGRAMS = {
  'bass drum': 'bassdrum', 'kick drum': 'kickdrum', 'snare drum': 'snaredrum', 'hi hat': 'hihat', 'high hat': 'hihat',
  'open hat': 'openhat', 'hat open': 'hatopen', 'closed hat': 'closedhat', 'hat closed': 'hatclosed', 'sub bass': 'subbass',
  'drum loop': 'drumloop', 'perc loop': 'percloop', 'hat loop': 'hatloop', 'top loop': 'toploop', 'arp loop': 'arploop',
  'chord loop': 'chordloop', 'bass loop': 'bassloop', 'synth loop': 'synthloop', 'music loop': 'musicloop', 'floor tom': 'floortom',
  'finger snap': 'fingersnap', 'hand clap': 'handclap', 'wood block': 'woodblock', 'white noise': 'noisefx', 'crash fx': 'crashfx',
  'one shot': 'oneshot', 'tb 303': 'tb303', 'break beat': 'breakbeat',
};
const LOOP_WORDS = new Set(['loop', 'loops', 'lp', 'lps', 'bucle']);
const ONESHOT_WORDS = new Set(['oneshot', 'oneshots', 'shot', 'shots', 'one']);
const MELODIC_HINT = new Set(['bass', 'bs', 'synth', 'chord', 'chords', 'arp', 'lead', 'pad', 'melody', 'melodic', 'key', 'keys', 'piano', 'stab', 'pluck', 'acid', 'reese', 'organ', 'bell', 'strings', 'vox', 'vocal', 'acorde']);

export function translit(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
}

// Tokens normalizados: separa CamelCase, letras/dígitos y separadores; fusiona compuestos.
export function tokenize(s) {
  const raw = translit(s)
    .replace(/\.(wav|aiff?|mp3|flac|ogg)$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9#]+/)
    .filter(Boolean);
  // "303" junto a letras o "bpm"
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const bi = raw[i] + ' ' + (raw[i + 1] || '');
    if (BIGRAMS[bi]) { out.push(BIGRAMS[bi]); i++; continue; }
    out.push(raw[i]);
  }
  return out;
}

// BPM y tonalidad declarados en el nombre
export function nameInfo(s) {
  const t = translit(s);
  const info = {};
  const m = t.match(/(\d{2,3}(?:[.,]\d+)?)\s*-?\s*bpm/i) || t.match(/bpm\s*-?\s*(\d{2,3})/i);
  if (m) info.bpm = parseFloat(m[1].replace(',', '.'));
  else {
    const toks = tokenize(s);
    if (toks.some((x) => LOOP_WORDS.has(x) || TOKEN2CAT.get(x) === 'dloop')) {
      const n = toks.map(Number).find((v) => Number.isFinite(v) && v >= 70 && v <= 185);
      if (n) info.bpm = n;
    }
  }
  const k = t.match(/(?:^|[\s_\-()[\]])([A-G])(#|b|♯|♭)?\s?(m|min|minor|maj|major|dur|moll)?(?=$|[\s_\-()[\].])/);
  if (k && (k[2] || k[3])) {
    const minor = /^(m|min|minor|moll)$/i.test(k[3] || '');
    info.key = k[1].toUpperCase() + (k[2] ? (k[2] === 'b' || k[2] === '♭' ? 'b' : '#') : '') + (minor ? 'm' : '');
  }
  return info;
}

// Puntuación por texto. Devuelve {scores, hits:[{tok,cat,w}], loop, oneshot}
export function textScores(text, learned = null) {
  const toks = tokenize(text);
  const scores = {};
  const hits = [];
  const isLoop = toks.some((t) => LOOP_WORDS.has(t));
  const oneshot = toks.some((t) => ONESHOT_WORDS.has(t));
  const add = (cat, w, tok, why) => { scores[cat] = (scores[cat] || 0) + w; hits.push({ tok, cat, w, why }); };
  const seen = new Set();
  for (const t of toks) {
    if (seen.has(t)) continue; seen.add(t);
    let cat = TOKEN2CAT.get(t);
    if (cat) {
      let w = WEAK.has(t) ? 1 : 2;
      if (isLoop && !['dloop', 'mloop'].includes(cat)) {
        // "bass loop" → loop melódico; "kick loop" → loop de batería
        const mel = MELODIC_HINT.has(t);
        add(mel ? 'mloop' : 'dloop', 1.5, t, 'loop');
        w *= 0.4;
      }
      add(cat, w, t);
    }
    if (learned && learned[t]) {
      const counts = learned[t];
      const tot = Object.values(counts).reduce((a, b) => a + b, 0);
      const [bc, bn] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (tot >= 3 && bn / tot >= 0.8) add(bc, 1.5, t, 'learned');
    }
  }
  if (isLoop && !hits.some((h) => h.cat === 'dloop' || h.cat === 'mloop')) add('dloop', 1, 'loop', 'loop');
  // "hat" + "open"/"closed" deciden el tipo de hat
  const hatTok = toks.some((t) => ['hihat', 'hat', 'hats', 'hh'].includes(t));
  if (hatTok && toks.includes('open') && !isLoop) { add('ohat', 2.5, 'hat+open', 'combo'); scores.hat = Math.max(0, (scores.hat || 0) - 2); }
  else if (hatTok && toks.includes('closed')) add('hat', 1, 'hat+closed', 'combo');
  if (!hatTok && toks.includes('open') && !toks.some((t) => ['oh', 'ohh', 'openhat', 'hatopen'].includes(t))) {
    scores.ohat = Math.max(0, (scores.ohat || 0) - 1); // "open" solo no es un hat
  }
  return { scores, hits, loop: isLoop, oneshot };
}

// ---------- sonido ----------
export function soundScores(a) {
  const s = {}, why = [];
  if (!a || a.silent || !a.bands) return { scores: s, why, isLoop: false };
  const add = (c, w, r) => { s[c] = Math.max(s[c] || 0, w); why.push({ cat: c, w, r }); };
  const b = a.bands, d = a.activeDur;
  const low = b.sub + b.low, hi = b.high + b.air, body = b.low + b.lowmid;
  const noisy = a.flatness > 0.15;
  const tonal = (a.f0conf > 0.75 || a.chordLike) && a.flatness < 0.1;
  const percLoop = d >= 1.2 && a.onsets >= 4 && (a.onsetRegularity || 0) >= 0.45 && a.envDepthDb >= 9 && a.attackMs < 60;
  // loop legato (bajos, arpegios): ataques regulares y duración que encaja en tiempos enteros a ese tempo
  const legatoLoop = !percLoop && d >= 1.2 && a.onsets >= 4 && (a.onsetRegularity || 0) >= 0.8 && a.loopFit != null && a.loopFit < 0.02 && tonal;
  const isLoop = percLoop || legatoLoop;
  if (isLoop) {
    const melodic = legatoLoop || (a.f0conf > 0.8 && low < 0.5 && a.centroid > 250 && !noisy);
    add(melodic ? 'mloop' : 'dloop', 2.5, melodic ? 'loopTonal' : 'loopPerc');
    add(melodic ? 'dloop' : 'mloop', 0.8, 'loopAlt');
    return { scores: s, why, isLoop };
  }
  // graves
  if (low >= 0.6 && d < 1.6 && a.attackMs < 15 && (a.sustainDb < -8 || d < 0.35)) {
    add('kick', 2.5 + (a.brightTrend < -0.2 ? 0.3 : 0), 'kickLow');
  }
  const tonalMid = tonal && (a.chordLike || a.f0 >= 150 || low < 0.2);
  if (tonal && !tonalMid && a.f0 > 0 && a.f0 < 170 && low >= 0.3 && d >= 0.2 && a.sustainDb > -8) add('bass', 2.5, 'bassTonal');
  else if (low >= 0.6 && a.sustainDb > -8 && d >= 0.3) add('bass', 1.6, 'bassLow');
  // palmas (varias ráfagas de ruido)
  if (noisy && a.bursts >= 3 && d < 1.6 && low < 0.3) add('clap', 2.5, 'clapBursts');
  // caja: ruido con cuerpo
  if (noisy && d < 1.5 && low < 0.4 && (body >= 0.12 || b.mid >= 0.15) && a.centroid > 900 && a.attackMs < 25) {
    add('snare', a.bursts >= 3 ? 1 : 2.3, 'snareBody');
  }
  // metales
  if (hi >= 0.6 && a.centroid > 4500 && body < 0.12 && a.bursts < 3 && a.attackMs < 30) {
    const t20 = a.t20 == null ? d * 1000 : a.t20;
    if (d < 0.3 || t20 < 110) add('hat', 2.5, 'hatShort');
    else if (d < 1.3) { add('ohat', 2.2, 'hatOpen'); add('cymbal', 1, 'hatOpenAlt'); }
    else { add('cymbal', 2.3, 'cymLong'); add('ohat', 1, 'cymAlt'); }
  }
  // tom: grave con tono y corto, sin ser kick
  if (!s.kick && a.f0conf > 0.5 && a.f0 >= 60 && a.f0 <= 350 && d < 1.5 && a.attackMs < 15 && body >= 0.5 && low < 0.6 && a.sustainDb < -6) add('tom', 1.8, 'tomPitch');
  // notas
  if (tonalMid && d < 6) {
    if (a.attackMs > 120 && d > 2) add('atmos', 2.2, 'padSlow');
    else add('synth', 2.3, 'synthTonal');
  }
  // largos
  if (a.brightTrend >= 0.4 && d >= 1) add('fx', 2.5, 'riser');
  else if (a.brightTrend <= -0.5 && d >= 1 && noisy) add('fx', 2, 'downer');
  if (d >= 2 && (a.attackMs >= 150 || a.sustainDb > -8) && !s.cymbal) add('atmos', noisy ? 1.4 : 2.2, 'longSustain');
  if (noisy && a.flatness > 0.5 && d >= 1.5) add('fx', 1.5, 'noiseLong');
  // percusión genérica
  const strong = Object.values(s).some((v) => v >= 2);
  if (!strong && d < 0.6 && a.attackMs < 15) add('perc', 1.2, 'percShort');
  return { scores: s, why, isLoop };
}

export const CERT = ['user', 'confirmed', 'onehint', 'sound', 'doubt', 'none'];

// Clasificación final
// sample: { name, path, analysis, user:{cat} }
// v1.7: aunque decidas tú la categoría, se conserva lo que la herramienta leyó en el nombre, la carpeta
// y el sonido (reasons), y su propuesta queda en `auto`. Antes se perdía todo al decidir.
export function classify(sample, learned = null) {
  const a = autoClassify(sample, learned);
  if (sample.user && sample.user.cat) {
    return { cat: sample.user.cat, cert: 'user', basis: 'user', reasons: a.reasons, conflict: null,
      auto: { cat: a.cat, cert: a.cert, conflict: a.conflict, scores: a.scores }, isLoop: a.isLoop, textLoop: a.textLoop, oneshotHint: a.oneshotHint };
  }
  return a;
}
function autoClassify(sample, learned) {
  const nameT = textScores(sample.name || '', learned);
  const folders = String(sample.path || '').split('/').slice(0, -1).filter(Boolean);
  const folderScores = {};
  const folderHits = [];
  let folderLoop = false, folderOneshot = false;
  folders.reverse().forEach((f, i) => {
    const w = i === 0 ? 1 : i === 1 ? 0.7 : 0.5;
    const t = textScores(f, learned);
    if (t.loop) folderLoop = true;
    if (t.oneshot) folderOneshot = true;
    for (const [c, v] of Object.entries(t.scores)) folderScores[c] = (folderScores[c] || 0) + v * w;
    for (const h of t.hits) folderHits.push({ ...h, folder: f, w: h.w * w });
  });
  const snd = soundScores(sample.analysis);
  const S = snd.scores;
  // carpeta "loops" + sonido de loop, carpeta "one shots" quita loops
  if ((nameT.oneshot || folderOneshot) && !nameT.loop) { delete S.dloop; delete S.mloop; }
  const cats = new Set([...Object.keys(nameT.scores), ...Object.keys(folderScores), ...Object.keys(S)]);
  const textLoop = (nameT.loop || folderLoop) && !nameT.oneshot;
  const oneshotHint = (nameT.oneshot || folderOneshot) && !nameT.loop;
  if (!cats.size) return { cat: null, cert: 'none', basis: 'none', reasons: [], conflict: null, sound: snd, isLoop: snd.isLoop || textLoop, textLoop, oneshotHint };
  const tot = {};
  for (const c of cats) tot[c] = (nameT.scores[c] || 0) * 1.0 + (folderScores[c] || 0) * 0.8 + (S[c] || 0) * 0.9;
  const ranked = [...cats].sort((a, b) => tot[b] - tot[a]);
  let cat = ranked[0];
  const nameSup = (nameT.scores[cat] || 0) >= 1;
  const folderSup = (folderScores[cat] || 0) >= 0.9;
  const soundSup = (S[cat] || 0) >= 1.5;
  const soundTop = Object.entries(S).sort((a, b) => b[1] - a[1])[0];
  let conflict = null;
  // lo que dicen nombre + carpeta frente a lo que se oye (en cualquier orden de puntuación)
  const textTot = {};
  for (const c of cats) textTot[c] = (nameT.scores[c] || 0) + (folderScores[c] || 0) * 0.8;
  const textTop = Object.entries(textTot).filter(([, v]) => v >= 0.9).sort((a, b) => b[1] - a[1])[0];
  if (textTop && soundTop && soundTop[1] >= 2.2 && soundTop[0] !== textTop[0] && (S[textTop[0]] || 0) < 0.8 && !compatible(textTop[0], soundTop[0])) {
    conflict = { said: textTop[0], heard: soundTop[0] };
  }
  let cert, basis;
  const textSup = nameSup || folderSup;
  if (conflict) { cert = 'doubt'; basis = cat === conflict.heard ? 'sound' : nameSup ? 'name' : 'folder'; }
  else if (textSup && soundSup) { cert = 'confirmed'; basis = nameSup && folderSup ? 'namefoldersound' : nameSup ? 'namesound' : 'foldersound'; }
  else if (textSup) { cert = 'onehint'; basis = nameSup && folderSup ? 'namefolder' : nameSup ? 'name' : 'folder'; }
  else if (soundSup) {
    const second = ranked[1];
    if (second && tot[second] >= tot[cat] * 0.85 && !compatible(cat, second)) { cert = 'doubt'; basis = 'sound'; }
    else { cert = 'sound'; basis = 'sound'; }
  } else if (tot[cat] >= 1) { cert = 'doubt'; basis = 'weak'; }
  else { cert = 'none'; basis = 'none'; cat = null; }
  const reasons = [
    ...nameT.hits.map((h) => ({ src: 'name', ...h })),
    ...folderHits.map((h) => ({ src: 'folder', ...h })),
    ...snd.why.map((h) => ({ src: 'sound', tok: h.r, cat: h.cat, w: h.w })),
  ];
  return { cat, cert, basis, reasons, conflict, scores: tot, alt: ranked[1] || null, isLoop: snd.isLoop || nameT.loop || folderLoop, textLoop, oneshotHint, soundLoop: !!snd.isLoop };
}

// Aprende de tus decisiones: cuenta token → categoría (nombre y última carpeta)
export function learnFrom(learned, sample, cat) {
  const toks = new Set([...tokenize(sample.name || ''), ...tokenize(String(sample.path || '').split('/').slice(-2, -1)[0] || '')]);
  for (const t of toks) {
    if (t.length < 2 || /^\d+$/.test(t)) continue;
    learned[t] ||= {};
    learned[t][cat] = (learned[t][cat] || 0) + 1;
  }
  return learned;
}
