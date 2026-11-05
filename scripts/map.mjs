// Generates docs/ceda-map.svg from the level constants, so the README map can never drift from the
// game. The market is drawn in two columns (naves A–N and O–Z) so it fits a README.
// Render it to PNG with scripts/render-map.mjs (needs the Playwright image).
//   node scripts/map.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  LETTERS, NAVES, AISLE, DEPTH, STREET, PASILLOS, PASILLO_W, UNIT_W, SEGMENTS,
  ROWS, ROW_FACE, aisleZ, streetZ, NORTH_Z, SOUTH_Z, BRIDGE, SPAWN, SHRINE_SPOTS, FIRE_SPOT, unitAt,
} from '../src/levels/ceda/world.js';

const S = 3; // px per metre
const SPLIT = streetZ(7) - STREET / 2; // north edge of the O–P street: A–N | O–Z
const COLS = [
  { z0: NORTH_Z, z1: SPLIT, title: 'NORTE · NAVES A–N' },
  { z0: SPLIT, z1: SOUTH_Z, title: 'SUR · NAVES O–Z' },
];
const MIN_X = -78, MAX_X = 78;
const COL_W = (MAX_X - MIN_X) * S;
const GAP = 54;
const M = { left: 96, top: 128, right: 36, bottom: 292 };
const W = M.left + COL_W * 2 + GAP + M.right;
const H = M.top + (SPLIT - NORTH_Z) * S + M.bottom;
const X = (x, c) => M.left + c * (COL_W + GAP) + (x - MIN_X) * S;
const Z = (z, c) => M.top + (z - COLS[c].z0) * S;
const rect = (c, x0, z0, x1, z1, fill, extra = '') =>
  `<rect x="${X(x0, c).toFixed(1)}" y="${Z(z0, c).toFixed(1)}" width="${((x1 - x0) * S).toFixed(1)}" height="${((z1 - z0) * S).toFixed(1)}" fill="${fill}" ${extra}/>`;
const text = (c, x, z, s, { size = 11, fill = '#f0ead6', anchor = 'start', weight = 'normal', dx = 0, dy = 0, rot = 0 } = {}) =>
  `<text x="${(X(x, c) + dx).toFixed(1)}" y="${(Z(z, c) + dy).toFixed(1)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}"${rot ? ` transform="rotate(${rot} ${(X(x, c) + dx).toFixed(1)} ${(Z(z, c) + dy).toFixed(1)})"` : ''}>${s}</text>`;
const absText = (x, y, s, { size = 11, fill = '#f0ead6', anchor = 'start', weight = 'normal' } = {}) =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${s}</text>`;

const C = {
  bg: '#080a0f', frame: '#12151c', street: '#1a1d25', bay: '#262b35', andador: '#2c303a',
  bodega: '#3f3b33', bodegaEdge: '#6d6455', store: '#c9bfa6', pasillo: '#233042', pasilloEdge: '#3d6fc4',
  bridge: '#f2c230', gate: '#e4007c', boundary: '#8a3324', dim: '#8f8a7a', ink: '#f0ead6',
  spawn: '#2bb673', pickup: '#f4d03f', truck: '#7fb2e5', rotulista: '#ff7a00', drop: '#e4007c', fire: '#ff8a3a', shrine: '#ffffff',
};

const parts = [];
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Courier New', monospace">`);
parts.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);

// Title block.
parts.push(absText(M.left, 44, 'CENTRAL DE ABASTO · IZTAPALAPA', { size: 24, fill: C.ink, weight: 'bold' }));
parts.push(absText(M.left, 70, 'ABARROTES Y VÍVERES · LADO A — MAPA DEL NIVEL (A–Z)', { size: 12, fill: C.dim }));
parts.push(absText(W - M.right, 44, '144 × 376 m', { size: 12, fill: C.dim, anchor: 'end' }));
parts.push(absText(W - M.right, 66, '26 filas · 13 naves · 5 pasillos', { size: 11, fill: C.dim, anchor: 'end' }));

const column = (c) => {
  const { z0, z1 } = COLS[c];
  parts.push(absText(X(-76, c), M.top - 30, COLS[c].title, { size: 12, fill: '#cfe0ff', weight: 'bold' }));
  parts.push(rect(c, -76, z0, 76, z1, C.frame, `stroke="${C.boundary}" stroke-width="1.5"`));

  // Andenes.
  for (let s = 0; s <= 13; s++) {
    const z = streetZ(s);
    if (z + STREET / 2 <= z0 || z - STREET / 2 >= z1) continue;
    parts.push(rect(c, -72, z - STREET / 2, 72, z + STREET / 2, C.street));
    for (let x = -68; x < 72; x += 7) {
      for (const zz of [z - STREET / 2 + 0.9, z + STREET / 2 - 0.9]) {
        parts.push(`<line x1="${X(x, c).toFixed(1)}" y1="${Z(zz, c).toFixed(1)}" x2="${X(x + 2.4, c).toFixed(1)}" y2="${Z(zz + 2.6, c).toFixed(1)}" stroke="${C.bay}" stroke-width="1"/>`);
      }
    }
  }

  // Andadores and bodega rows for the naves in this column.
  NAVES.forEach(([north, south], i) => {
    const za = aisleZ(i);
    if (za < z0 || za > z1) return;
    parts.push(rect(c, -72, za - AISLE / 2, 72, za + AISLE / 2, C.andador));
    parts.push(text(c, -48.5, za + 0.4, `NAVE ${north}–${south}`, { size: 8.5, fill: C.dim, dy: 3 }));
    for (const letter of [north, south]) {
      const front = ROWS[letter], face = ROW_FACE[letter];
      const rz0 = face === 1 ? front - DEPTH : front;
      const rz1 = face === 1 ? front : front + DEPTH;
      for (const [x0, x1] of SEGMENTS) {
        parts.push(rect(c, x0, rz0, x1, rz1, C.bodega, `stroke="${C.bodegaEdge}" stroke-width="0.8"`));
        const zs = face === 1 ? rz1 : rz0;
        parts.push(`<line x1="${X(x0, c).toFixed(1)}" y1="${Z(zs, c).toFixed(1)}" x2="${X(x1, c).toFixed(1)}" y2="${Z(zs, c).toFixed(1)}" stroke="${C.store}" stroke-width="1.6"/>`);
      }
      parts.push(`<line x1="${X(-76, c).toFixed(1)}" y1="${Z(front, c).toFixed(1)}" x2="${X(-72, c).toFixed(1)}" y2="${Z(front, c).toFixed(1)}" stroke="${C.dim}" stroke-width="0.7"/>`);
      parts.push(text(c, -77.4, front, letter, { size: 13, fill: C.ink, weight: 'bold', anchor: 'end', dy: 4 }));
    }
  });

  // Pasillos run through both columns.
  PASILLOS.forEach((px, i) => {
    const w = PASILLO_W[i];
    parts.push(rect(c, px - w / 2, Math.max(NORTH_Z, z0), px + w / 2, Math.min(SOUTH_Z, z1), C.pasillo, `opacity="0.88" stroke="${C.pasilloEdge}" stroke-width="1.2"`));
    for (const z of [Math.max(NORTH_Z, z0) + 14, Math.min(SOUTH_Z, z1) - 16]) {
      parts.push(text(c, px, z, `PASILLO ${i + 1}`, { size: 10, fill: '#cfe0ff', anchor: 'middle', weight: 'bold', rot: -90 }));
    }
  });

  // Perimeter, gate and exits.
  const zA = Math.max(NORTH_Z, z0), zB = Math.min(SOUTH_Z, z1);
  if (z0 <= NORTH_Z) {
    parts.push(`<line x1="${X(-72, c).toFixed(1)}" y1="${Z(NORTH_Z, c).toFixed(1)}" x2="${X(-31, c).toFixed(1)}" y2="${Z(NORTH_Z, c).toFixed(1)}" stroke="${C.boundary}" stroke-width="3"/>`);
    parts.push(`<line x1="${X(-21, c).toFixed(1)}" y1="${Z(NORTH_Z, c).toFixed(1)}" x2="${X(72, c).toFixed(1)}" y2="${Z(NORTH_Z, c).toFixed(1)}" stroke="${C.boundary}" stroke-width="3"/>`);
    parts.push(rect(c, -31, NORTH_Z - 0.5, -21, NORTH_Z + 0.5, C.gate, 'opacity="0.9"'));
    parts.push(text(c, -26, NORTH_Z, '↑  EJE 5 SUR · SALIDA', { size: 10, fill: C.gate, anchor: 'middle', weight: 'bold', dy: -6 }));
  }
  if (z1 >= SOUTH_Z) {
    parts.push(`<line x1="${X(-72, c).toFixed(1)}" y1="${Z(SOUTH_Z, c).toFixed(1)}" x2="${X(72, c).toFixed(1)}" y2="${Z(SOUTH_Z, c).toFixed(1)}" stroke="${C.boundary}" stroke-width="3"/>`);
    parts.push(text(c, 0, SOUTH_Z, 'EJE 6 SUR', { size: 10, fill: C.dim, anchor: 'middle', dy: 16 }));
  }
  parts.push(`<line x1="${X(-72, c).toFixed(1)}" y1="${Z(zA, c).toFixed(1)}" x2="${X(-72, c).toFixed(1)}" y2="${Z(zB, c).toFixed(1)}" stroke="${C.boundary}" stroke-width="2"/>`);
  parts.push(`<line x1="${X(72, c).toFixed(1)}" y1="${Z(zA, c).toFixed(1)}" x2="${X(72, c).toFixed(1)}" y2="${Z(zB, c).toFixed(1)}" stroke="${C.boundary}" stroke-width="2"/>`);

  // The pasillo 2 bridge.
  if (BRIDGE.z > z0 && BRIDGE.z < z1) {
    parts.push(rect(c, BRIDGE.x - BRIDGE.hx, BRIDGE.z - BRIDGE.hz, BRIDGE.x + BRIDGE.hx, BRIDGE.z + BRIDGE.hz, C.bridge, 'opacity="0.85" stroke="#1b1b1b" stroke-width="1.2"'));
    parts.push(text(c, BRIDGE.x, BRIDGE.z, 'PUENTE', { size: 8, fill: '#1b1b1b', anchor: 'middle', weight: 'bold', dy: 3 }));
  }

  // North arrow.
  const nx = X(72, c) - 22, ny = M.top + 24;
  parts.push(`<path d="M ${nx} ${ny - 14} l -6 16 l 6 -4 l 6 4 z" fill="${C.ink}"/>`);
  parts.push(absText(nx, ny + 16, 'N', { size: 11, fill: C.ink, anchor: 'middle', weight: 'bold' }));
};

column(0);
column(1);

// Landmarks: numbered markers, listed in the legend so nothing overlaps.
const marks = [];
const mark = (x, z, color, label, shape = 'square') => marks.push({ x, z, color, label, shape });
mark(SPAWN[0], SPAWN[1], C.spawn, 'Spawn (Eje 5 Sur)', 'circle');
mark(SPAWN[0] + 4, SPAWN[1] + 4, C.drop, 'Diablito');
for (const id of ['A-3', 'C-9', 'B-11']) {
  const { x, z, face } = unitAt(id);
  mark(x + 0.9, z + face * 0.8, C.pickup, `Carga ${id}`);
}
mark(-44.5, -14, C.truck, 'Camioneta D1 (roja)');
mark(44, 14, C.truck, 'Camioneta D2 (azul)');
mark(59.25, 14, C.truck, 'Camioneta D3 (blanca)');
mark(-35.5, 14, C.truck, 'Camioneta del seller');
mark(2.2, aisleZ(6), C.rotulista, 'Rotulista · Pasillo 3, local 3');
mark(-35.5, 1.55, C.drop, 'B-4 · entrega de la pancarta');
mark(FIRE_SPOT[0], FIRE_SPOT[1], C.fire, 'Fuego / escena de la cerveza');
for (const [x, z] of SHRINE_SPOTS) marks.push({ x, z, color: C.shrine, shrine: true });

const colOf = (z) => (z < SPLIT ? 0 : 1);
for (const m of marks) {
  const c = colOf(m.z);
  if (m.shrine) {
    parts.push(`<path d="M ${(X(m.x, c) - 4).toFixed(1)} ${Z(m.z, c).toFixed(1)} h 8 M ${X(m.x, c).toFixed(1)} ${(Z(m.z, c) - 4).toFixed(1)} v 8" stroke="${C.shrine}" stroke-width="1.4" opacity="0.85"/>`);
  }
}
marks.filter((m) => !m.shrine).forEach((m, i) => {
  const c = colOf(m.z), n = i + 1;
  if (m.shape === 'circle') {
    parts.push(`<circle cx="${X(m.x, c).toFixed(1)}" cy="${Z(m.z, c).toFixed(1)}" r="6.5" fill="${m.color}" stroke="#000" stroke-width="1.2"/>`);
  } else {
    parts.push(`<rect x="${(X(m.x, c) - 5.5).toFixed(1)}" y="${(Z(m.z, c) - 5.5).toFixed(1)}" width="11" height="11" fill="${m.color}" stroke="#000" stroke-width="1.2"/>`);
  }
  parts.push(`<text x="${X(m.x, c).toFixed(1)}" y="${(Z(m.z, c) + 2.8).toFixed(1)}" font-size="8" fill="#0a0a0a" text-anchor="middle" font-weight="bold">${n}</text>`);
});

// Scale bar.
const sx = M.left, sy = H - 236;
parts.push(`<line x1="${sx}" y1="${sy}" x2="${sx + 50 * S}" y2="${sy}" stroke="${C.ink}" stroke-width="3"/>`);
for (const t of [0, 25, 50]) parts.push(`<line x1="${sx + t * S}" y1="${sy - 5}" x2="${sx + t * S}" y2="${sy + 5}" stroke="${C.ink}" stroke-width="2"/>`);
parts.push(absText(sx, sy - 10, '0', { size: 10, fill: C.ink }));
parts.push(absText(sx + 50 * S, sy - 10, '50 m', { size: 10, fill: C.ink, anchor: 'end' }));

// Colour legend.
const ly = H - 196;
const legend = [
  [C.andador, 'andador peatonal'], [C.street, 'calle de andenes'], [C.bodega, 'bodega'],
  [C.pasillo, 'pasillo 1–5'], [C.bridge, 'puente pasillo 2'], [C.gate, 'salida Eje 5 Sur'],
  [C.shrine, 'santuario (8)'], [C.store, 'frente de bodega'], [C.boundary, 'perímetro'],
];
legend.forEach(([color, s], i) => {
  const col = i % 3, row = Math.floor(i / 3);
  const lx = M.left + col * 310, yy = ly + row * 19;
  parts.push(`<rect x="${lx}" y="${yy - 9}" width="11" height="11" fill="${color}" stroke="#000" stroke-width="0.8"/>`);
  parts.push(absText(lx + 18, yy, s, { size: 10.5, fill: C.dim }));
});

// Numbered landmark legend.
const ny0 = H - 126;
marks.filter((m) => !m.shrine).forEach((m, i) => {
  const col = i % 3, row = Math.floor(i / 3);
  const lx = M.left + col * 310, yy = ny0 + row * 17;
  parts.push(`<rect x="${lx}" y="${yy - 9}" width="11" height="11" fill="${m.color}" stroke="#000" stroke-width="0.8"/>`);
  parts.push(absText(lx + 18, yy, `${i + 1}. ${m.label}`, { size: 10, fill: C.dim }));
});

parts.push(absText(W - M.right, H - 18, 'Bodegas numeradas 1 → 12 de poniente a oriente · +z es sur', { size: 10, fill: C.dim, anchor: 'end' }));

parts.push('</svg>');

mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/ceda-map.svg', import.meta.url), parts.join('\n'));
console.log(`docs/ceda-map.svg  ${W} x ${H} px`);
