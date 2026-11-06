import * as THREE from 'three';
import { lam } from './post.js';

// Seeded RNG so the procedural store looks the same on every load.
let seed = 1337;
export const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

function finish(texture) {
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  draw(g, w, h);
  return finish(new THREE.CanvasTexture(canvas));
}

function grain(g, w, h, amount) {
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

const flat = (color, amount, size = 32) => canvasTexture(size, size, (g, w, h) => {
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  grain(g, w, h, amount);
});

// 1 texture repeat == 1 metre (geometry UVs are scaled to world units).
export const floorTex = () => canvasTexture(32, 32, (g, w, h) => {
  g.fillStyle = '#8a857a';
  g.fillRect(0, 0, w, h);
  [['#d2cdc0', 0, 0], ['#c8c3b5', 16, 0], ['#c8c3b5', 0, 16], ['#d2cdc0', 16, 16]].forEach(([c, x, y]) => {
    g.fillStyle = c;
    g.fillRect(x + 1, y + 1, 15, 15);
  });
  grain(g, w, h, 14);
});

export const wallTex = () => flat('#d6d3c8', 10);
export const metalTex = () => flat('#8b9096', 12, 16);
export const asphaltTex = () => flat('#2b2b2e', 26);
export const concreteTex = () => canvasTexture(32, 32, (g, w, h) => {
  g.fillStyle = '#6d6b66';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#55534f';
  g.fillRect(0, 0, w, 1);
  g.fillRect(0, 0, 1, h);
  grain(g, w, h, 22);
});

export const ceilingTex = () => canvasTexture(32, 32, (g, w, h) => {
  g.fillStyle = '#bab8af';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#8d8b84';
  g.fillRect(0, 0, w, 1);
  g.fillRect(0, 0, 1, h);
  g.fillStyle = '#a19f97';
  for (let i = 0; i < 40; i++) g.fillRect(Math.floor(rand() * w), Math.floor(rand() * h), 1, 1);
  grain(g, w, h, 8);
});

export const woodTex = () => canvasTexture(32, 32, (g, w, h) => {
  g.fillStyle = '#6b4f36';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#5a4230';
  for (let y = 0; y < h; y += 4) g.fillRect(0, y + Math.floor(rand() * 2), w, 1);
  grain(g, w, h, 14);
});

export const cardboardTex = () => canvasTexture(32, 32, (g, w, h) => {
  g.fillStyle = '#a27b4b';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#c7a46c';
  g.fillRect(0, 14, w, 4);
  g.fillStyle = '#5b4026';
  g.fillRect(4, 4, 10, 6);
  grain(g, w, h, 18);
});

export const counterTex = () => canvasTexture(32, 32, (g, w, h) => {
  g.fillStyle = '#e6e4dc';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1d8a86';
  g.fillRect(0, 8, w, 4);
  g.fillStyle = '#e8792b';
  g.fillRect(0, 12, w, 2);
  grain(g, w, h, 10);
});

function shelfRows(g, w, palette, density) {
  g.fillStyle = '#26282c';
  g.fillRect(0, 0, w, 96);
  for (let row = 0; row < 4; row++) {
    const base = (row + 1) * 24 - 3;
    g.fillStyle = '#a3a8ae';
    g.fillRect(0, base, w, 3);
    g.fillStyle = '#f2e14a';
    for (let x = 4; x < w; x += 16) g.fillRect(x, base + 1, 4, 2);
    let x = 1;
    while (x < w - 3) {
      const iw = 3 + Math.floor(rand() * 6), ih = 9 + Math.floor(rand() * 10);
      if (rand() < density) {
        g.fillStyle = pick(palette);
        g.fillRect(x, base - ih, iw, ih);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(x, base - ih + 2, iw, 2);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(x + iw - 1, base - ih, 1, ih);
      }
      x += iw + (rand() < 0.15 ? 2 : 0);
    }
  }
}

// Covers 1m wide x 1.5m tall of shelving.
export const productsTex = (palette) => canvasTexture(64, 96, (g, w, h) => {
  shelfRows(g, w, palette, 1);
  grain(g, w, h, 10);
});

export const emptyShelfTex = () => canvasTexture(64, 96, (g, w, h) => {
  shelfRows(g, w, ['#777', '#555'], 0.06);
  grain(g, w, h, 10);
});

// Covers 1m wide x 2m tall of drink cooler.
export const fridgeTex = () => canvasTexture(64, 128, (g, w, h) => {
  g.fillStyle = '#16181b';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#d6ecff';
  g.fillRect(2, 2, w - 4, 4);
  g.fillStyle = '#0e1b22';
  g.fillRect(3, 7, w - 6, h - 10);
  const drinks = ['#e33', '#3a5', '#fd4', '#39f', '#f80', '#eee', '#7c3', '#c4f'];
  for (let r = 0; r < 5; r++) {
    const base = 7 + (r + 1) * 23;
    g.fillStyle = '#5a6c75';
    g.fillRect(3, base, w - 6, 2);
    const c = pick(drinks);
    for (let x = 4; x < w - 6; x += 6) {
      const bh = 12 + Math.floor(rand() * 5);
      g.fillStyle = rand() < 0.7 ? c : pick(drinks);
      g.fillRect(x, base - bh, 5, bh);
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(x, base - bh, 5, 2);
    }
  }
  g.fillStyle = '#9aa3ad';
  g.fillRect(w - 6, 50, 2, 30);
  g.fillStyle = '#2a2d31';
  g.fillRect(0, 0, 2, h);
  grain(g, w, h, 8);
});

export const vendingTex = () => canvasTexture(32, 48, (g, w, h) => {
  g.fillStyle = '#e8eef2';
  g.fillRect(0, 0, w, h);
  const cans = ['#d22', '#26c', '#2a4', '#fa0', '#333', '#f6c'];
  for (let r = 0; r < 4; r++) {
    for (let x = 2; x < w - 2; x += 5) {
      g.fillStyle = pick(cans);
      g.fillRect(x, 3 + r * 8, 4, 6);
      g.fillStyle = '#4f4';
      g.fillRect(x + 1, 10 + r * 8, 2, 1);
    }
  }
  g.fillStyle = '#222';
  g.fillRect(4, 38, 24, 7);
  grain(g, w, h, 8);
});

export const signTex = (text, bg, fg, w = 128, h = 32) => canvasTexture(w, h, (g) => {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `bold ${Math.floor(h * 0.55)}px monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 1);
});

export const storeSignTex = () => canvasTexture(256, 48, (g, w, h) => {
  g.fillStyle = '#f4f2ea';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1d8a86';
  g.fillRect(0, 0, w, 7);
  g.fillStyle = '#e8792b';
  g.fillRect(0, h - 7, w, 7);
  g.font = 'bold 26px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#1d6f6b';
  g.fillText('NIGHTMART', w / 2 - 22, h / 2);
  g.fillStyle = '#e8792b';
  g.fillText('24', w / 2 + 92, h / 2);
});

// --- Central de Abasto -------------------------------------------------------

export const paintedWallTex = (base = '#d9d2bf', band = '#3c7a4a') => canvasTexture(32, 32, (g, w, h) => {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  g.fillStyle = band;
  g.fillRect(0, 26, w, 6);
  g.fillStyle = 'rgba(40,30,20,0.25)';
  for (let i = 0; i < 6; i++) g.fillRect(Math.floor(rand() * w), 20 + Math.floor(rand() * 6), 1 + Math.floor(rand() * 3), 6);
  grain(g, w, h, 16);
});

// Roll-up metal shutter ("cortina"), 1 repeat per metre.
export const cortinaTex = (tint = '#8d9298', tag = false) => canvasTexture(32, 32, (g, w, h) => {
  g.fillStyle = tint;
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 4) {
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(0, y, w, 1);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, y + 3, w, 1);
  }
  g.fillStyle = 'rgba(110,60,30,0.5)';
  for (let i = 0; i < 5; i++) g.fillRect(Math.floor(rand() * w), Math.floor(rand() * h), 2, 1 + Math.floor(rand() * 3));
  if (tag) {
    g.strokeStyle = pick(['#e4007c', '#111', '#1e6fd9', '#e33']);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(3, 20);
    for (let x = 6; x < 30; x += 4) g.lineTo(x, 12 + rand() * 10);
    g.stroke();
  }
  grain(g, w, h, 12);
});

// Lit interior of an open bodega: stacked sacks, boxes and dried chiles.
export const bodegaInteriorTex = (kind) => canvasTexture(96, 80, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#2a2018');
  grad.addColorStop(0.5, '#4a3a28');
  grad.addColorStop(1, '#2e241a');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#6a5640';
  g.fillRect(0, 64, w, 16);
  // Hanging bulb.
  g.fillStyle = '#111';
  g.fillRect(47, 0, 1, 6);
  g.fillStyle = '#fff2c4';
  g.fillRect(45, 6, 4, 3);
  const fills = {
    sacks: ['#d8c49a', '#cdb88a', '#e2d3ab', '#bfa878'],
    boxes: ['#b98a52', '#e4007c', '#f4d03f', '#2e86c1', '#a0522d', '#c8a06a'],
    chiles: ['#8b1a1a', '#b22222', '#5c0f0f', '#d8c49a', '#6b3e1f', '#e25822'],
    abarrotes: ['#d8c49a', '#c8a06a', '#e9c46a', '#a0522d', '#f4f1de', '#b5179e'],
    vinos: ['#5a1f28', '#7a2a3a', '#d8c49a', '#3a1a2a', '#e0b060', '#2b3f6e'],
    tortilla: ['#f2f0d8', '#e9e2c0', '#d8c49a', '#c8b890', '#faf6e6', '#bfa878'],
  }[kind];
  // Back shelving with goods, then a front pile on the floor.
  for (const shelfY of [24, 42]) {
    g.fillStyle = '#5b4026';
    g.fillRect(4, shelfY, w - 8, 2);
    for (let x = 6; x < w - 10; x += 5) {
      const ih = 6 + Math.floor(rand() * 6);
      g.fillStyle = pick(fills);
      g.fillRect(x, shelfY - ih, 4, ih);
      g.fillStyle = 'rgba(255,255,255,0.2)';
      g.fillRect(x, shelfY - ih, 4, 1);
    }
  }
  for (let col = 0; col < 11; col++) {
    const x = 4 + col * 8;
    const stack = 1 + Math.floor(rand() * 3);
    for (let r = 0; r < stack; r++) {
      const y = 68 - (r + 1) * 6;
      g.fillStyle = pick(fills);
      g.fillRect(x, y, 7, 6);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x + 1, y, 5, 1);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x, y + 5, 7, 1);
    }
  }
  g.fillStyle = '#1e1710';
  g.fillRect(0, 0, 3, h);
  g.fillRect(w - 3, 0, 3, h);
  grain(g, w, h, 12);
});

const SIGN_COLORS = [['#f4d03f', '#7a1f1f'], ['#1e6fd9', '#ffffff'], ['#e4007c', '#ffffff'], ['#2bb673', '#ffffff'], ['#ffffff', '#c0392b'], ['#ff7a00', '#1b1b1b']];

export const bodegaSignTex = (name, id) => canvasTexture(128, 28, (g, w, h) => {
  const [bg, fg] = pick(SIGN_COLORS);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 11px monospace';
  g.fillText(name, w / 2, 10, w - 6);
  g.font = 'bold 9px monospace';
  g.fillText(`BOD. ${id}`, w / 2, 22);
  grain(g, w, h, 18);
});

export const pasilloSignTex = (text) => signTex(text, '#1f4fa3', '#ffffff', 128, 24);

/*
 * One texture for every sign in the market (bodega fronts, pasillo ends, andén markers), so the
 * whole set shares a single material and merges into one draw call. Cells are drawn by the caller.
 */
export function signAtlas(cells, { cellW = 128, cellH = 28, cols = 6 } = {}) {
  const rows = Math.max(1, Math.ceil(cells.length / cols));
  const canvas = document.createElement('canvas');
  canvas.width = cellW * cols;
  canvas.height = cellH * rows;
  const g = canvas.getContext('2d');
  g.fillStyle = '#14161b';
  g.fillRect(0, 0, canvas.width, canvas.height);
  cells.forEach((cell, i) => {
    g.save();
    g.translate((i % cols) * cellW, Math.floor(i / cols) * cellH);
    g.beginPath();
    g.rect(0, 0, cellW, cellH);
    g.clip();
    cell(g, cellW, cellH);
    g.restore();
  });
  const texture = finish(new THREE.CanvasTexture(canvas));
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  const uv = (i) => {
    const c = i % cols, r = Math.floor(i / cols);
    return [c / cols, 1 - (r + 1) / rows, (c + 1) / cols, 1 - r / rows];
  };
  return { texture, material: lam({ map: texture }), uv };
}

// Map a plane's 0..1 UVs into one atlas cell.
export function setUV(geometry, [u0, v0, u1, v1]) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return geometry;
}

export const bodegaSignCell = (name, id, bg, fg) => (g, w, h) => {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 11px monospace';
  g.fillText(name, w / 2, 10, w - 6);
  g.font = 'bold 9px monospace';
  g.fillText(`BOD. ${id}`, w / 2, 22);
  g.fillStyle = 'rgba(0,0,0,0.14)';
  for (let i = 0; i < 14; i++) g.fillRect(Math.floor(rand() * w), Math.floor(rand() * h), 1, 1);
};

export const signCell = (text, bg, fg, size = 12) => (g, w, h) => {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `bold ${size}px monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 1, w - 4);
};

// Hand-painted Central de Abasto price board ("pancarta de precios").
export const pancartaTex = () => canvasTexture(128, 80, (g, w, h) => {
  g.fillStyle = '#f7f1dc';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1e6fd9';
  g.fillRect(0, 0, w, 5);
  g.fillStyle = '#e4007c';
  g.fillRect(0, h - 5, w, 5);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#c0392b';
  g.font = 'bold 13px monospace';
  g.fillText('ABARROTES LA ESPERANZA', w / 2, 15, w - 8);
  g.fillStyle = '#1b1b1b';
  g.font = 'bold 10px monospace';
  g.fillText('PRECIOS DEL DÍA', w / 2, 29);
  g.fillStyle = '#e4007c';
  g.font = 'bold 12px monospace';
  g.fillText('FRIJOL $64', w / 2, 43);
  g.fillStyle = '#1e6fd9';
  g.fillText('ARROZ $38', w / 2, 56);
  g.fillStyle = '#2bb673';
  g.fillText('CHILE $120', w / 2, 69);
  grain(g, w, h, 10);
});

export const letterTex = (letter) => canvasTexture(32, 32, (g) => {
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(16, 16, 15, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3d6fc4';
  g.beginPath();
  g.arc(16, 16, 12, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = 'bold 18px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 16, 17);
});

export const lonaTex = (color) => canvasTexture(16, 16, (g, w, h) => {
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.15)';
  for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
  grain(g, w, h, 16);
});

export const produceTex = () => canvasTexture(32, 32, (g, w, h) => {
  g.fillStyle = '#6b4a2b';
  g.fillRect(0, 0, w, h);
  for (let cx = 0; cx < 4; cx++) {
    for (let cy = 0; cy < 2; cy++) {
      const c = pick(['#d32f2f', '#f57c00', '#7cb342', '#fbc02d', '#8d6e63', '#c62828', '#eceff1']);
      for (let i = 0; i < 14; i++) {
        g.fillStyle = c;
        g.fillRect(cx * 8 + 1 + Math.floor(rand() * 6), cy * 16 + 1 + Math.floor(rand() * 13), 2, 2);
      }
    }
  }
  grain(g, w, h, 14);
});

export const sackTex = () => canvasTexture(16, 16, (g, w, h) => {
  g.fillStyle = '#cdb88a';
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(90,70,40,0.35)';
  for (let i = 0; i < w; i += 2) {
    g.fillRect(i, 0, 1, h);
    g.fillRect(0, i, w, 1);
  }
  g.fillStyle = '#7a1f1f';
  g.fillRect(4, 6, 8, 3);
  grain(g, w, h, 14);
});

export const hazardTex = () => canvasTexture(16, 4, (g, w, h) => {
  for (let x = -4; x < w + 4; x += 4) {
    g.fillStyle = (x / 4) % 2 ? '#f2c230' : '#1b1b1b';
    g.beginPath();
    g.moveTo(x, h);
    g.lineTo(x + 2, 0);
    g.lineTo(x + 4, 0);
    g.lineTo(x + 2, h);
    g.fill();
  }
});

// --- CDMX showcase ---------------------------------------------------------
// 128–256 px painted textures: the showcase renders at 480p and frames them close, so the
// 32 px store tiles would read as noise.

const blotches = (g, w, h, n, color, size = 18) => {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    g.beginPath();
    g.ellipse(rand() * w, rand() * h, size * (0.4 + rand()), size * (0.3 + rand()), rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
};

export const cobbleTex = (base = '#6a6280') => canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#3a3448';
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const v = 0.75 + rand() * 0.45;
      g.fillStyle = base;
      g.globalAlpha = 0.55 + rand() * 0.45;
      g.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
      g.globalAlpha = v * 0.3;
      g.fillStyle = '#b0a6c8';
      g.fillRect(x * 16 + 2, y * 16 + 2, 12, 4);
      g.globalAlpha = 1;
    }
  }
  blotches(g, w, h, 10, 'rgba(20,16,28,0.2)', 22);
  grain(g, w, h, 16);
});

export const plasterTex = (base = '#5b4f66', shade = '#2e2740') => canvasTexture(128, 128, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, base);
  grad.addColorStop(0.7, base);
  grad.addColorStop(1, shade);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  blotches(g, w, h, 14, 'rgba(18,14,26,0.28)', 26);
  blotches(g, w, h, 8, 'rgba(150,130,170,0.10)', 20);
  g.fillStyle = 'rgba(10,8,14,0.35)';
  for (let i = 0; i < 14; i++) g.fillRect(rand() * w, 0, 1 + rand() * 2, h * (0.2 + rand() * 0.7));
  grain(g, w, h, 12);
});

// Lit office windows on a near-black slab. Used with basic() so it glows on its own.
export const facadeTex = (cols = 6, rows = 14, tint = '#9fd0ff') => canvasTexture(128, 256, (g, w, h) => {
  g.fillStyle = '#0b0d18';
  g.fillRect(0, 0, w, h);
  const cw = w / cols, ch = h / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const r = rand();
      if (r < 0.42) continue;
      const warm = rand() < 0.3;
      g.fillStyle = warm ? `rgba(255,206,140,${0.45 + rand() * 0.5})` : tint;
      g.globalAlpha = 0.35 + rand() * 0.6;
      g.fillRect(x * cw + cw * 0.18, y * ch + ch * 0.22, cw * 0.64, ch * 0.4);
    }
  }
  g.globalAlpha = 1;
  g.fillStyle = '#151a2c';
  for (let y = 0; y < rows; y++) g.fillRect(0, y * ch + ch * 0.78, w, 2);
});

// Abstract stone-and-tile mural: geometry only, no copied artwork.
export const mosaicTex = () => canvasTexture(256, 128, (g, w, h) => {
  g.fillStyle = '#3c3026';
  g.fillRect(0, 0, w, h);
  const palette = ['#c2703a', '#d8a24a', '#3f7f83', '#8a3a3a', '#d9cfae', '#5b4a7a', '#6b7f3f'];
  for (let i = 0; i < 260; i++) {
    g.fillStyle = palette[Math.floor(rand() * palette.length)];
    const x = rand() * w, y = rand() * h, s = 3 + rand() * 13;
    if (rand() < 0.5) {
      g.beginPath();
      g.arc(x, y, s * 0.5, 0, Math.PI * 2);
      g.fill();
    } else {
      g.save();
      g.translate(x, y);
      g.rotate(rand() * 3);
      g.fillRect(-s / 2, -s / 2, s, s * (0.4 + rand()));
      g.restore();
    }
  }
  // Grout lines and a darker stone course every 16 px: reads as tilework, not wallpaper.
  g.fillStyle = 'rgba(12,9,6,0.55)';
  for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 1, h);
  for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 1);
  g.fillStyle = 'rgba(10,7,5,0.7)';
  for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 3);
  grain(g, w, h, 18);
});

export const stationTex = () => canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#cfc7b4';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#a9a08d';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.strokeRect(x * 32 + 0.5, y * 32 + 0.5, 32, 32);
  blotches(g, w, h, 12, 'rgba(70,60,50,0.18)', 20);
  g.fillStyle = 'rgba(30,24,20,0.5)';
  g.fillRect(0, h - 6, w, 6);
  grain(g, w, h, 10);
});

export const metroSeatTex = () => canvasTexture(64, 64, (g, w, h) => {
  g.fillStyle = '#1f6f7a';
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(150,220,220,0.18)';
  for (let i = 0; i < 120; i++) g.fillRect(rand() * w, rand() * h, 1, 1);
  g.fillStyle = 'rgba(10,40,44,0.5)';
  for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 1);
  grain(g, w, h, 10);
});

export const cursiveSignTex = (text, bg = '#e9e0cc', fg = '#2b2320') => canvasTexture(256, 64, (g, w, h) => {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(90,70,50,0.15)';
  for (let i = 0; i < 40; i++) g.fillRect(rand() * w, rand() * h, 2, 1);
  g.fillStyle = fg;
  g.font = 'italic 34px "Brush Script MT", "Segoe Script", cursive';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  grain(g, w, h, 8);
});

// Night sky: gradient, stars, painterly violet clouds and a moon.
export const skyTex = () => canvasTexture(1024, 512, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#080a16');
  grad.addColorStop(0.45, '#1d1630');
  grad.addColorStop(0.72, '#3a2b4d');
  grad.addColorStop(1, '#241a33');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 420; i++) {
    const y = rand() * h * 0.75;
    g.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.7})`;
    g.fillRect(rand() * w, y, rand() < 0.1 ? 2 : 1, 1);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${120 + rand() * 40},${100 + rand() * 40},${160 + rand() * 50},${0.05 + rand() * 0.09})`;
    g.beginPath();
    g.ellipse(rand() * w, h * (0.35 + rand() * 0.5), 60 + rand() * 180, 10 + rand() * 26, 0, 0, Math.PI * 2);
    g.fill();
  }
  const mx = w * 0.63, my = h * 0.3;
  const halo = g.createRadialGradient(mx, my, 4, mx, my, 46);
  halo.addColorStop(0, 'rgba(255,244,206,0.95)');
  halo.addColorStop(0.45, 'rgba(255,232,170,0.35)');
  halo.addColorStop(1, 'rgba(255,232,170,0)');
  g.fillStyle = halo;
  g.fillRect(mx - 50, my - 50, 100, 100);
  g.fillStyle = '#f6ecc9';
  g.beginPath();
  g.arc(mx, my, 14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(200,190,160,0.5)';
  g.beginPath();
  g.arc(mx - 5, my - 3, 3, 0, Math.PI * 2);
  g.arc(mx + 6, my + 4, 2, 0, Math.PI * 2);
  g.fill();
});

export const moonTex = () => canvasTexture(64, 64, (g, w, h) => {
  const halo = g.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, 32);
  halo.addColorStop(0, 'rgba(255,246,214,1)');
  halo.addColorStop(0.42, 'rgba(255,238,190,0.9)');
  halo.addColorStop(0.62, 'rgba(255,232,170,0.28)');
  halo.addColorStop(1, 'rgba(255,232,170,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(210,198,160,0.45)';
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.arc(w / 2 + (rand() - 0.5) * 26, h / 2 + (rand() - 0.5) * 26, 1 + rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
});

export function staticScreen() {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 36;
  const g = canvas.getContext('2d');
  const texture = finish(new THREE.CanvasTexture(canvas));
  return {
    texture,
    update() {
      const img = g.createImageData(48, 36);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 30 + Math.random() * 110;
        img.data[i] = v * 0.6;
        img.data[i + 1] = v;
        img.data[i + 2] = v * 0.75;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      g.fillStyle = '#d8ffe6';
      g.font = '8px monospace';
      g.fillText('CAM2', 2, 8);
      texture.needsUpdate = true;
    },
  };
}
