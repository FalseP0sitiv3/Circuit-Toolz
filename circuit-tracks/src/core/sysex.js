// Lector, validador y constructor de mensajes SysEx de Circuit / Circuit Tracks.
import { PAYLOAD_LENGTH, MESSAGE_LENGTH } from './params.js';

export const NOVATION_ID = [0x00, 0x20, 0x29];
export const PRODUCTS = { 0x60: 'Circuit (original)', 0x64: 'Circuit Tracks' };
export const COMMANDS = { 0x00: 'Replace Current Patch', 0x01: 'Replace Patch', 0x40: 'Current Patch Dump Request' };

// Divide un archivo en mensajes SysEx y registra anomalías (bytes sueltos, mensajes truncados,
// bytes de estado inesperados). Los bytes MIDI de tiempo real (F8–FF) dentro de un SysEx son
// legales en un flujo MIDI; se descartan del mensaje y se anotan.
// Reparaciones observadas en colecciones reales (nunca alteran los 340 bytes del patch):
//  · «ubicación 0xFF»: algunos editores de terceros escriben 0xFF como número de patch. En un archivo
//    no es un byte de tiempo real: se conserva en su posición para no desplazar la carga.
//  · «sin F7»: el mismo origen sustituye el F7 final por 0x00. Solo se acepta si el mensaje tiene la
//    longitud exacta de un patch y empieza con la cabecera de Circuit/Circuit Tracks.
const isPatchPrefix = (buf) => buf[1] === 0 && buf[2] === 0x20 && buf[3] === 0x29 && buf[4] === 0x01 && (buf[5] === 0x60 || buf[5] === 0x64) && (buf[6] === 0x00 || buf[6] === 0x01);
export function splitMessages(bytes) {
  const messages = [], anomalies = [];
  let start = -1, buf = null, stray = 0, strayAt = 0, realtime = 0, repairs = [];
  const flushStray = () => { if (stray) { anomalies.push({ code: 'stray-bytes', text: `${stray} byte(s) fuera de mensajes SysEx (desde el byte ${strayAt})` }); stray = 0; } };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (start < 0) {
      if (b === 0xF0) { flushStray(); start = i; buf = [b]; repairs = []; }
      else { if (!stray) strayAt = i; stray++; }
      continue;
    }
    if (b >= 0xF8) {
      if (buf.length === 7 && isPatchPrefix(buf)) { buf.push(b); repairs.push('location'); anomalies.push({ code: 'bad-location', text: `Número de patch 0x${b.toString(16).toUpperCase()} (no válido en MIDI) escrito por otro editor; la carga del patch está intacta` }); continue; }
      realtime++; continue;
    }
    if (b === 0xF7) { buf.push(b); messages.push({ offset: start, bytes: Uint8Array.from(buf), repairs }); start = -1; buf = null; continue; }
    if (b === 0xF0) { anomalies.push({ code: 'truncated', text: `Mensaje en byte ${start} sin F7 antes de un nuevo F0 (byte ${i})` }); start = i; buf = [b]; repairs = []; continue; }
    if (b >= 0x80) { anomalies.push({ code: 'status-in-sysex', text: `Byte de estado 0x${b.toString(16)} dentro del SysEx iniciado en ${start}; mensaje descartado` }); start = -1; buf = null; continue; }
    buf.push(b);
  }
  if (start >= 0) {
    if (buf.length === MESSAGE_LENGTH && buf[MESSAGE_LENGTH - 1] === 0x00 && isPatchPrefix(buf)) {
      buf[MESSAGE_LENGTH - 1] = 0xF7; repairs.push('terminator');
      messages.push({ offset: start, bytes: Uint8Array.from(buf), repairs });
      anomalies.push({ code: 'missing-f7', text: 'Falta el F7 final (hay un 0x00 en su lugar, típico del mismo editor); la carga del patch está intacta' });
    } else anomalies.push({ code: 'truncated', text: `Mensaje en byte ${start} sin terminador F7` });
  }
  flushStray();
  if (realtime) anomalies.push({ code: 'realtime', text: `${realtime} byte(s) MIDI de tiempo real eliminados del interior de mensajes` });
  return { messages, anomalies };
}

// Reconoce mensajes de Novation que no son patches de Circuit, para explicarlos en vez de darlos por erróneos.
export const FOREIGN = {
  components: 'Transferencia de Novation Components (samples, sesiones o pack del Circuit original). El formato no está publicado: no contiene patches legibles',
  mininova: 'Patch de MiniNova / UltraNova: es otro sintetizador y su formato no es compatible con Circuit',
  controller: 'Plantilla de un controlador Novation (Launch Control, Remote SL…): no es un patch',
  midiTemplate: 'Plantilla MIDI de Circuit Tracks (para las pistas MIDI): no es un patch de synth',
  emptySlot: 'Posición vacía de un pack (sin patch)'
};
export function foreignKind(msg) {
  if (msg.length < 8 || msg[1] !== 0 || msg[2] !== 0x20 || msg[3] !== 0x29) return null;
  if (msg[4] === 0x00 && msg[5] >= 0x70) return 'components';
  if (msg[4] === 0x03 && msg[5] === 0x01) return 'mininova';
  if (msg[4] === 0x02) return 'controller';
  if (msg[4] === 0x01 && (msg[5] === 0x64 || msg[5] === 0x60) && msg[6] === 0x07) return 'midiTemplate';
  if (msg[4] === 0x01 && (msg[5] === 0x64 || msg[5] === 0x60) && msg[6] === 0x01 && msg[7] === 0x7F && msg[8] === 0x7F && msg.length === 12) return 'emptySlot';
  return null;
}
export function mininovaName(msg) {
  let s = ''; for (let i = 15; i < 31 && i < msg.length; i++) s += msg[i] >= 32 && msg[i] < 127 ? String.fromCharCode(msg[i]) : ' ';
  return s.trim();
}

// Interpreta un mensaje. Nunca lanza excepción: devuelve problemas.
// Formatos de patch aceptados:
//  · 350 bytes, Replace Current (0x00) o Replace Patch (0x01): documentado por Novation.
//  · 352 bytes, 0x01 7F 7F <posición> 00 <340> F7: el que usa Components dentro de .circuittrackspack
//    (observado en packs reales; no aparece en la guía de programador).
export function parseMessage(msg, repairs = []) {
  const r = { kind: 'unknown', product: null, productName: null, command: null, commandName: null, location: null, problems: [], payload: null, format: null, repairs };
  const n = msg.length;
  if (msg[0] !== 0xF0 || msg[n - 1] !== 0xF7) { r.problems.push('Delimitadores F0/F7 ausentes'); return r; }
  if (n < 8 || msg[1] !== 0 || msg[2] !== 0x20 || msg[3] !== 0x29) { r.problems.push('No es un mensaje de Novation'); return r; }
  const fk = foreignKind(msg);
  if (fk) { r.kind = 'foreign'; r.foreign = fk; r.problems.push(FOREIGN[fk]); if (fk === 'mininova') r.name = mininovaName(msg); return r; }
  if (msg[4] !== 0x01) { r.problems.push(`Tipo de producto 0x${msg[4].toString(16)} distinto de Synth (0x01)`); return r; }
  r.product = msg[5]; r.productName = PRODUCTS[msg[5]] || null;
  if (!r.productName) { r.problems.push(`Producto 0x${msg[5].toString(16)} no reconocido`); return r; }
  r.command = msg[6]; r.commandName = COMMANDS[msg[6]] || null;
  if (r.command === 0x40) {
    r.kind = 'dump-request'; r.location = msg[7];
    if (n !== 9) r.problems.push(`Dump request de ${n} bytes; se esperaban 9`);
    return r;
  }
  if (r.command !== 0x00 && r.command !== 0x01) { r.problems.push(`Comando 0x${msg[6].toString(16)} no documentado`); return r; }
  if (r.command === 0x01 && msg[7] === 0x7F && msg[8] === 0x7F && n === MESSAGE_LENGTH + 2) {
    r.kind = 'patch'; r.format = 'pack'; r.location = msg[9];
    if (msg[10] !== 0) r.problems.push('Byte reservado de cabecera distinto de 0');
    for (let i = 1; i < n - 1; i++) if (msg[i] > 0x7F) { r.problems.push(`Byte de datos ≥ 0x80 en la posición ${i}`); break; }
    r.payload = msg.slice(11, 351);
    return r;
  }
  r.kind = 'patch'; r.location = msg[7]; r.format = 'single';
  const badLoc = repairs.includes('location');
  if (n !== MESSAGE_LENGTH) r.problems.push(`Longitud ${n}; un mensaje de patch debe tener ${MESSAGE_LENGTH} bytes`);
  if (!badLoc) {
    if (r.command === 0x00 && r.location > 1) r.problems.push(`Ubicación ${r.location} fuera de Synth 1/2 (0–1)`);
    if (r.command === 0x01 && r.location > 63) r.problems.push(`Número de patch ${r.location} fuera del rango documentado 0–63`);
  }
  if (msg[8] !== 0) r.problems.push('Byte reservado de cabecera distinto de 0');
  for (let i = 1; i < n - 1; i++) if (msg[i] > 0x7F && !(badLoc && i === 7)) { r.problems.push(`Byte de datos ≥ 0x80 en la posición ${i}`); break; }
  if (n === MESSAGE_LENGTH) r.payload = msg.slice(9, 349);
  if (r.payload && r.payload.some((x) => x > 0x7F)) { r.problems.push('La carga contiene bytes de 8 bits: no se importa'); r.payload = null; }
  return r;
}

// Identifica un archivo grande sin leerlo entero (cabecera de unos pocos bytes).
export function sniffHead(head, name = '') {
  if (head[0] !== 0xF0) return null;
  const fk = foreignKind(head.length >= 12 ? head : Uint8Array.from([...head, ...new Array(12).fill(0)]));
  return fk ? FOREIGN[fk] : null;
}

// Un archivo es "banco documentado" si contiene 64 Replace Patch con números 0..63 en orden.
export function detectBank(parsed) {
  const p = parsed.filter((x) => x.kind === 'patch');
  if (p.length !== 64) return false;
  return p.every((x, i) => x.command === 0x01 && x.location === i);
}

function checkPayload(payload) {
  if (!(payload instanceof Uint8Array) || payload.length !== PAYLOAD_LENGTH) throw new Error('La carga debe tener 340 bytes');
  for (const b of payload) if (b > 0x7F) throw new Error('La carga contiene bytes de 8 bits');
}
export function buildReplaceCurrent(payload, location = 0, product = 0x64) {
  checkPayload(payload);
  if (location !== 0 && location !== 1) throw new Error('Ubicación inválida');
  const out = new Uint8Array(MESSAGE_LENGTH);
  out.set([0xF0, 0, 0x20, 0x29, 0x01, product, 0x00, location, 0x00]); out.set(payload, 9); out[349] = 0xF7;
  return out;
}
export function buildReplacePatch(payload, number, product = 0x64) {
  checkPayload(payload);
  if (!(number >= 0 && number <= 63)) throw new Error('Número de patch fuera de 0–63 (rango documentado)');
  const out = buildReplaceCurrent(payload, 0, product); out[6] = 0x01; out[7] = number; return out;
}
export function buildDumpRequest(location = 0, product = 0x64) {
  return Uint8Array.from([0xF0, 0, 0x20, 0x29, 0x01, product, 0x40, location, 0xF7]);
}

// Nombre interno (bytes 0–15, ASCII). Se devuelve también si hay caracteres no imprimibles.
export function readName(payload) {
  let s = '', bad = 0;
  for (let i = 0; i < 16; i++) { const c = payload[i]; if (c >= 32 && c <= 126) s += String.fromCharCode(c); else { s += ' '; if (c !== 0) bad++; } }
  return { name: s.replace(/\s+$/, ''), nonPrintable: bad };
}
export function encodeName(name) {
  const out = new Uint8Array(16).fill(32);
  const clean = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '?').slice(0, 16);
  for (let i = 0; i < clean.length; i++) out[i] = clean.charCodeAt(i);
  return out;
}
