import * as THREE from 'three';
import { lam } from './post.js';

// Seeded RNG so the procedural store looks the same on every load.
let seed = 1337;
export const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

function finish(texture) {
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
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
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  // Copy the noise across the tile edges so mipmaps don't draw a seam on every repeat.
  for (let y = 0; y < h; y++) {
    const a = (y * w + w - 1) * 4, b = y * w * 4;
    for (let c = 0; c < 3; c++) d[b + c] = d[a + c];
  }
  for (let x = 0; x < w; x++) {
    const a = ((h - 1) * w + x) * 4, b = x * 4;
    for (let c = 0; c < 3; c++) d[b + c] = d[a + c];
  }
  g.putImageData(img, 0, 0);
}

// Multiply a #rrggbb colour by f — per-tile value shifts without touching the hue.
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

/*
 * Low-frequency mottling: a few big soft blobs of `color` at `alpha` for dirt, damp and wear.
 * Blobs stay off the tile edges so the texture still wraps seamlessly under mipmaps.
 */
export function blotch(g, w, h, color, alpha = 1, n = 8, size = null) {
  const s = size ?? Math.min(w, h) * 0.2;
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const rx = s * (0.4 + rand() * 0.9), ry = s * (0.3 + rand() * 0.7);
    const m = Math.max(rx, ry) + 2;
    const cx = Math.min(w - m, m + rand() * Math.max(1, w - 2 * m));
    const cy = Math.min(h - m, m + rand() * Math.max(1, h - 2 * m));
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/*
 * Grime pass for masonry, plaster and asphalt: damp streaks, dirt collected at the edges,
 * hairline cracks, rubbed scratches and fine speckle. Everything stays off the tile edges.
 */
export function grime(g, w, h, { stain = 0.5, scratch = 0.4, edge = 0.4, crack = 0.5 } = {}) {
  const m = 3;
  for (let i = 0, n = Math.round(stain * w / 22); i < n; i++) {
    const wd = 3 + rand() * 12;
    const x = m + wd / 2 + rand() * Math.max(1, w - wd - 2 * m);
    const y0 = m + rand() * h * 0.3;
    const len = Math.min(h * (0.2 + rand() * 0.6), h - y0 - m);
    const gr = g.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(0, `rgba(26,22,17,${0.10 + rand() * 0.10})`);
    gr.addColorStop(1, 'rgba(26,22,17,0)');
    g.fillStyle = gr;
    g.fillRect(x - wd / 2, y0, wd, len);
  }
  if (edge > 0) {
    const a = 0.16 * edge, band = Math.min(w, h) * 0.14;
    const grad = (x0, y0, x1, y1) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, `rgba(12,10,8,${a})`);
      gr.addColorStop(1, 'rgba(12,10,8,0)');
      return gr;
    };
    g.fillStyle = grad(0, 0, 0, band); g.fillRect(0, 0, w, band);
    g.fillStyle = grad(0, h, 0, h - band); g.fillRect(0, h - band, w, band);
    g.fillStyle = grad(0, 0, band, 0); g.fillRect(0, 0, band, h);
    g.fillStyle = grad(w, 0, w - band, 0); g.fillRect(w - band, 0, band, h);
  }
  g.lineWidth = 1;
  for (let i = 0, n = Math.round(crack * 4); i < n; i++) {
    let x = m + rand() * (w - 2 * m), y = m + rand() * (h - 2 * m);
    g.strokeStyle = `rgba(15,12,9,${0.15 + rand() * 0.25})`;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x = Math.min(w - m, Math.max(m, x + (rand() - 0.5) * w * 0.15));
      y = Math.min(h - m, Math.max(m, y + rand() * h * 0.1));
      g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0, n = Math.round(scratch * w * h / 4096); i < n; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    g.fillRect(m + rand() * (w - 2 * m - 8), m + rand() * (h - 2 * m), 2 + rand() * 8, 1);
  }
  for (let i = 0, n = Math.round(w * h / 350); i < n; i++) {
    g.fillStyle = `rgba(18,14,10,${0.05 + rand() * 0.12})`;
    g.fillRect(m + rand() * (w - 2 * m), m + rand() * (h - 2 * m), 1 + rand() * 2, 1 + rand() * 2);
  }
}

// 1 texture repeat == 1 metre (geometry UVs are scaled to world units).
export const floorTex = () => canvasTexture(128, 128, (g, w, h) => {
  // 4x4 vinyl tiles per metre with dark grout showing between them.
  g.fillStyle = '#4c463c';
  g.fillRect(0, 0, w, h);
  const T = 32, palette = ['#d9d4c7', '#cfc9ba', '#d5cfc2', '#c8c2b4'];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = palette[Math.floor(rand() * palette.length)];
    g.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
    for (let i = 0; i < 7; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(60,55,45,0.06)';
      g.fillRect(x * T + 2 + rand() * (T - 13), y * T + 2 + rand() * (T - 13), 2 + rand() * 5, 1 + rand() * 3);
    }
    if (rand() < 0.3) {
      g.fillStyle = 'rgba(50,46,40,0.5)';
      g.fillRect(x * T + (rand() < 0.5 ? 0 : T - 3), y * T + (rand() < 0.5 ? 0 : T - 3), 3, 3);
    }
  }
  // Dirt caught in the interior grout channels.
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(30,26,20,${0.15 + rand() * 0.25})`;
    const line = [31, 32, 63, 64, 95, 96][Math.floor(rand() * 6)];
    if (rand() < 0.5) g.fillRect(4 + rand() * (w - 8), line + (rand() < 0.5 ? -1 : 0), 2, 1);
    else g.fillRect(line + (rand() < 0.5 ? -1 : 0), 4 + rand() * (h - 8), 1, 2);
  }
  blotch(g, w, h, '#4a443a', 0.10, 4, 34);
  grime(g, w, h, { stain: 0.35, edge: 0.2, crack: 0.15, scratch: 0.15 });
  grain(g, w, h, 10);
});

export const wallTex = () => canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#d6d3c8';
  g.fillRect(0, 0, w, h);
  blotch(g, w, h, '#b9b4a6', 0.45, 7, 30);
  blotch(g, w, h, '#e4e0d4', 0.4, 5, 24);
  // Faint roller streaks.
  for (let x = 0; x < w; x += 3) {
    g.fillStyle = `rgba(120,115,105,${0.02 + rand() * 0.03})`;
    g.fillRect(x, 0, 1, h);
  }
  // Scuffs and a couple of taped-over patches.
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `rgba(90,84,74,${0.08 + rand() * 0.1})`;
    g.fillRect(4 + rand() * (w - 16), h * (0.45 + rand() * 0.5), 4 + rand() * 10, 1 + rand() * 3);
  }
  for (let i = 0; i < 3; i++) {
    g.fillStyle = 'rgba(190,186,172,0.5)';
    const x = 6 + rand() * (w - 30), y = 6 + rand() * (h - 40);
    g.fillRect(x, y, 10 + rand() * 14, 8 + rand() * 10);
  }
  grime(g, w, h, { stain: 0.5, edge: 0.3, crack: 0.4, scratch: 0.35 });
  grain(g, w, h, 9);
});

export const metalTex = () => canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#8b9096';
  g.fillRect(0, 0, w, h);
  // Brushed grain and panel seams.
  for (let x = 0; x < w; x += 2) {
    g.fillStyle = `rgba(255,255,255,${rand() * 0.04})`;
    g.fillRect(x, 0, 1, h);
    g.fillStyle = `rgba(0,0,0,${rand() * 0.05})`;
    g.fillRect(x + 1, 0, 1, h);
  }
  g.fillStyle = 'rgba(40,42,46,0.5)';
  g.fillRect(0, 0, w, 1);
  g.fillRect(0, h - 1, w, 1);
  g.fillRect(0, 0, 1, h);
  g.fillRect(w - 1, 0, 1, h);
  // Rust weeping down from the top and a few corroded patches.
  for (let i = 0; i < 7; i++) {
    const x = 4 + rand() * (w - 12);
    const y0 = 2 + rand() * h * 0.4;
    const len = Math.min(h - y0 - 4, h * (0.15 + rand() * 0.45));
    const gr = g.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(0, `rgba(110,58,30,${0.25 + rand() * 0.2})`);
    gr.addColorStop(1, 'rgba(110,58,30,0)');
    g.fillStyle = gr;
    g.fillRect(x, y0, 2 + rand() * 3, len);
  }
  blotch(g, w, h, '#6e3a1e', 0.3, 4, 14);
  blotch(g, w, h, '#4e5158', 0.4, 5, 22);
  grime(g, w, h, { stain: 0.6, edge: 0.25, crack: 0.3, scratch: 0.6 });
  grain(g, w, h, 10);
});

export const asphaltTex = () => canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#26262b';
  g.fillRect(0, 0, w, h);
  // Aggregate speckle.
  for (let i = 0; i < 2400; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(200,200,210,0.10)' : 'rgba(0,0,0,0.16)';
    g.fillRect(3 + rand() * (w - 6), 3 + rand() * (h - 6), 1, 1);
  }
  // Oil stains and tar patches.
  blotch(g, w, h, '#101014', 0.5, 5, 26);
  blotch(g, w, h, '#1a1a20', 0.4, 4, 18);
  for (let i = 0; i < 3; i++) {
    const pw = 24 + rand() * 30, ph = 14 + rand() * 24;
    const x = 8 + rand() * (w - pw - 16), y = 8 + rand() * (h - ph - 16);
    g.fillStyle = 'rgba(255,255,255,0.03)';
    g.fillRect(x, y, pw, ph);
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.strokeRect(x, y, pw, ph);
  }
  grime(g, w, h, { stain: 0.5, edge: 0.15, crack: 0.9, scratch: 0.2 });
  grain(g, w, h, 18);
});

export const concreteTex = () => canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#6d6b66';
  g.fillRect(0, 0, w, h);
  blotch(g, w, h, '#5c5a55', 0.5, 7, 30);
  blotch(g, w, h, '#7d7b74', 0.4, 5, 24);
  // Expansion joints every half metre, centred on the tile boundaries so it wraps.
  g.fillStyle = 'rgba(38,36,33,0.8)';
  for (const B of [0, 64, 128]) {
    g.fillRect(B - 1, 0, 2, h);
    g.fillRect(0, B - 1, w, 2);
  }
  // Weathering and cracks.
  blotch(g, w, h, '#4e4c48', 0.4, 6, 26);
  grime(g, w, h, { stain: 0.7, edge: 0.2, crack: 0.7, scratch: 0.3 });
  grain(g, w, h, 16);
});

export const ceilingTex = () => canvasTexture(128, 128, (g, w, h) => {
  // 2x2 suspended acoustic tiles per repeat with a T-bar grid.
  g.fillStyle = '#8f8d85';
  g.fillRect(0, 0, w, h);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const x0 = tx * 64, y0 = ty * 64;
    g.fillStyle = shade('#b7b5ac', 0.9 + rand() * 0.14);
    g.fillRect(x0 + 2, y0 + 2, 62, 62);
    for (let i = 0; i < 170; i++) {
      g.fillStyle = `rgba(88,86,78,${0.15 + rand() * 0.2})`;
      g.fillRect(x0 + 3 + rand() * 60, y0 + 3 + rand() * 60, 1, 1);
    }
  }
  // T-bar grid centred on the 64px tile boundaries so the texture wraps.
  g.fillStyle = 'rgba(64,62,56,0.85)';
  for (const B of [0, 64, 128]) {
    g.fillRect(B - 3, 0, 6, h);
    g.fillRect(0, B - 3, w, 6);
  }
  blotch(g, w, h, '#8f8b80', 0.35, 4, 36);
  grime(g, w, h, { stain: 0.8, edge: 0.1, crack: 0.15, scratch: 0.1 });
  grain(g, w, h, 8);
});

export const woodTex = () => canvasTexture(128, 128, (g, w, h) => {
  // Four planks per repeat with grain, knots and butt joints.
  const planks = 4, ph = h / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    g.fillStyle = shade('#6b4f36', 0.85 + rand() * 0.3);
    g.fillRect(0, y0, w, ph);
    for (let i = 0; i < 14; i++) {
      const gy = y0 + 2 + rand() * (ph - 4);
      g.strokeStyle = `rgba(40,26,16,${0.08 + rand() * 0.12})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, gy);
      for (let x = 16; x < w; x += 16) g.lineTo(x, gy + (rand() - 0.5) * 3);
      g.lineTo(w, gy); // land back on the start height so the stroke wraps cleanly
      g.stroke();
    }
    if (rand() < 0.6) {
      const kx = 8 + rand() * (w - 16), ky = y0 + ph * (0.3 + rand() * 0.4);
      g.fillStyle = 'rgba(35,22,12,0.5)';
      g.beginPath();
      g.ellipse(kx, ky, 2 + rand() * 3, 1 + rand() * 2, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Plank gaps centred on the 32px boundaries so the texture wraps.
  g.fillStyle = 'rgba(20,14,10,0.7)';
  for (const B of [0, 32, 64, 96, 128]) g.fillRect(0, B - 1, w, 2);
  for (let p = 0; p < planks; p++) {
    if (rand() < 0.7) g.fillRect(4 + rand() * (w - 12), p * ph + 2, 1, ph - 4);
  }
  grime(g, w, h, { stain: 0.35, edge: 0.2, crack: 0.2, scratch: 0.5 });
  grain(g, w, h, 12);
});

export const cardboardTex = () => canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#a27b4b';
  g.fillRect(0, 0, w, h);
  // Corrugation hint and packing tape.
  for (let x = 0; x < w; x += 4) {
    g.fillStyle = 'rgba(60,40,20,0.08)';
    g.fillRect(x, 0, 1, h);
  }
  g.fillStyle = 'rgba(214,194,152,0.85)';
  g.fillRect(0, 28, w, 16);
  g.fillStyle = 'rgba(120,90,50,0.3)';
  g.fillRect(0, 28, w, 1);
  g.fillRect(0, 43, w, 1);
  // Printed shipping label.
  g.fillStyle = '#e8dcc0';
  g.fillRect(44, 78, 104, 60);
  g.fillStyle = '#5b4026';
  g.font = 'bold 18px monospace';
  g.textAlign = 'center';
  g.fillText('FRAGIL', 96, 102);
  g.font = '14px monospace';
  g.fillText('THIS SIDE UP', 96, 122);
  g.fillStyle = 'rgba(40,26,14,0.5)';
  g.fillRect(44, 78, 104, 3);
  blotch(g, w, h, '#7a5a34', 0.4, 5, 26);
  grime(g, w, h, { stain: 0.5, edge: 0.45, crack: 0.3, scratch: 0.4 });
  grain(g, w, h, 16);
});

export const counterTex = () => canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#e6e4dc';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1d8a86';
  g.fillRect(0, 32, w, 16);
  g.fillStyle = '#e8792b';
  g.fillRect(0, 48, w, 8);
  // Laminate speckle and worn edges.
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(120,110,95,${rand() * 0.08})`;
    g.fillRect(rand() * w, rand() * h, 1, 1);
  }
  blotch(g, w, h, '#c9c4b6', 0.4, 5, 30);
  grime(g, w, h, { stain: 0.5, edge: 0.4, crack: 0.15, scratch: 0.6 });
  grain(g, w, h, 8);
});

function shelfRows(g, w, h, palette, density) {
  const s = h / 96;
  g.fillStyle = '#26282c';
  g.fillRect(0, 0, w, h);
  for (let row = 0; row < 4; row++) {
    const base = ((row + 1) * 24 - 3) * s;
    g.fillStyle = '#a3a8ae';
    g.fillRect(0, base, w, 3 * s);
    g.fillStyle = '#f2e14a';
    for (let x = 4 * s; x < w; x += 16 * s) g.fillRect(x, base + s, 4 * s, 2 * s);
    let x = s;
    while (x < w - 3 * s) {
      const iw = (3 + Math.floor(rand() * 6)) * s, ih = (9 + Math.floor(rand() * 10)) * s;
      if (rand() < density) {
        g.fillStyle = pick(palette);
        g.fillRect(x, base - ih, iw, ih);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(x, base - ih + 2 * s, iw, 2 * s);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(x + iw - s, base - ih, s, ih);
      }
      x += iw + (rand() < 0.15 ? 2 * s : 0);
    }
  }
}

// Covers 1m wide x 1.5m tall of shelving.
export const productsTex = (palette) => canvasTexture(128, 192, (g, w, h) => {
  shelfRows(g, w, h, palette, 1);
  grain(g, w, h, 10);
});

export const emptyShelfTex = () => canvasTexture(128, 192, (g, w, h) => {
  shelfRows(g, w, h, ['#777', '#555'], 0.06);
  grain(g, w, h, 10);
});

// Covers 1m wide x 2m tall of drink cooler.
export const fridgeTex = () => canvasTexture(128, 256, (g, w, h) => {
  g.fillStyle = '#16181b';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#d6ecff';
  g.fillRect(4, 4, w - 8, 8);
  g.fillStyle = '#0e1b22';
  g.fillRect(6, 14, w - 12, h - 20);
  const drinks = ['#e33', '#3a5', '#fd4', '#39f', '#f80', '#eee', '#7c3', '#c4f'];
  for (let r = 0; r < 5; r++) {
    const base = 14 + (r + 1) * 46;
    g.fillStyle = '#5a6c75';
    g.fillRect(6, base, w - 12, 4);
    const c = pick(drinks);
    for (let x = 8; x < w - 12; x += 12) {
      const bh = 24 + Math.floor(rand() * 10);
      g.fillStyle = rand() < 0.7 ? c : pick(drinks);
      g.fillRect(x, base - bh, 10, bh);
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(x, base - bh, 10, 4);
    }
  }
  g.fillStyle = '#9aa3ad';
  g.fillRect(w - 12, 100, 4, 60);
  g.fillStyle = '#2a2d31';
  g.fillRect(0, 0, 4, h);
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(0, 0, w, 2);
  grain(g, w, h, 8);
});

export const vendingTex = () => canvasTexture(64, 96, (g, w, h) => {
  g.fillStyle = '#e8eef2';
  g.fillRect(0, 0, w, h);
  const cans = ['#d22', '#26c', '#2a4', '#fa0', '#333', '#f6c'];
  for (let r = 0; r < 4; r++) {
    for (let x = 4; x < w - 4; x += 10) {
      g.fillStyle = pick(cans);
      g.fillRect(x, 6 + r * 16, 8, 12);
      g.fillStyle = '#4f4';
      g.fillRect(x + 2, 20 + r * 16, 4, 2);
    }
  }
  g.fillStyle = '#222';
  g.fillRect(8, 76, 48, 14);
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

export const paintedWallTex = (base = '#d9d2bf', band = '#3c7a4a') => canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  g.fillStyle = band;
  g.fillRect(0, 104, w, 24);
  // Paint drips under the band and chips down to the undercoat.
  g.fillStyle = 'rgba(40,30,20,0.28)';
  for (let i = 0; i < 9; i++) g.fillRect(4 + rand() * (w - 8), 104, 1 + rand() * 3, 5 + rand() * 16);
  for (let i = 0; i < 12; i++) {
    g.fillStyle = `rgba(60,50,40,${0.3 + rand() * 0.3})`;
    g.fillRect(4 + rand() * (w - 12), 4 + rand() * (h - 16), 2 + rand() * 5, 1 + rand() * 4);
  }
  blotch(g, w, h, 'rgba(96,80,58,0.22)', 0.6, 6, 30);
  blotch(g, w, h, 'rgba(230,222,200,0.16)', 0.5, 4, 26);
  grime(g, w, h, { stain: 0.6, edge: 0.3, crack: 0.5, scratch: 0.3 });
  grain(g, w, h, 14);
});

// Roll-up metal shutter ("cortina"), 1 repeat per metre.
export const cortinaTex = (tint = '#8d9298', tag = false) => canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = tint;
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) {
    g.fillStyle = `rgba(0,0,0,${rand() * 0.08})`;
    g.fillRect(0, y + 1, w, 5);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(0, y, w, 1);
    g.fillStyle = 'rgba(0,0,0,0.32)';
    g.fillRect(0, y + 6, w, 2);
  }
  // Rust weeping down the slats.
  for (let i = 0; i < 7; i++) {
    const x = 4 + rand() * (w - 12);
    const y0 = 2 + rand() * h * 0.5;
    const len = Math.min(h - y0 - 4, h * (0.15 + rand() * 0.5));
    const gr = g.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(0, `rgba(110,58,30,${0.2 + rand() * 0.2})`);
    gr.addColorStop(1, 'rgba(110,58,30,0)');
    g.fillStyle = gr;
    g.fillRect(x, y0, 2 + rand() * 3, len);
  }
  // Dirt gathered along the bottom rail.
  blotch(g, w, h, 'rgba(60,45,30,0.3)', 0.6, 4, 22);
  if (tag) {
    g.strokeStyle = pick(['#e4007c', '#111', '#1e6fd9', '#e33']);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(6, 80);
    for (let x = 12; x < 120; x += 8) g.lineTo(x, 48 + rand() * 40);
    g.stroke();
  }
  grime(g, w, h, { stain: 0.7, edge: 0.15, crack: 0.2, scratch: 0.4 });
  grain(g, w, h, 12);
});

// Lit interior of an open bodega: stacked sacks, boxes and dried chiles.
export const bodegaInteriorTex = (kind) => canvasTexture(160, 128, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#241b13');
  grad.addColorStop(0.55, '#4a3a28');
  grad.addColorStop(1, '#2a2018');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // Hanging bulb and its warm pool of light.
  g.fillStyle = '#111';
  g.fillRect(w / 2 - 1, 0, 2, h * 0.05);
  const bulb = g.createRadialGradient(w / 2, h * 0.06, 2, w / 2, h * 0.06, w * 0.35);
  bulb.addColorStop(0, 'rgba(255,242,196,0.55)');
  bulb.addColorStop(1, 'rgba(255,242,196,0)');
  g.fillStyle = bulb;
  g.fillRect(0, 0, w, h * 0.55);
  g.fillStyle = '#fff2c4';
  g.fillRect(w / 2 - 3, h * 0.05, 6, h * 0.025);
  const fills = {
    sacks: ['#d8c49a', '#cdb88a', '#e2d3ab', '#bfa878'],
    boxes: ['#b98a52', '#e4007c', '#f4d03f', '#2e86c1', '#a0522d', '#c8a06a'],
    chiles: ['#8b1a1a', '#b22222', '#5c0f0f', '#d8c49a', '#6b3e1f', '#e25822'],
    abarrotes: ['#d8c49a', '#c8a06a', '#e9c46a', '#a0522d', '#f4f1de', '#b5179e'],
    vinos: ['#5a1f28', '#7a2a3a', '#d8c49a', '#3a1a2a', '#e0b060', '#2b3f6e'],
    tortilla: ['#f2f0d8', '#e9e2c0', '#d8c49a', '#c8b890', '#faf6e6', '#bfa878'],
  }[kind];
  const floorY = h * 0.8;
  g.fillStyle = '#5b4026';
  g.fillRect(w * 0.03, floorY, w * 0.94, h * 0.02);
  // Back shelving with goods, then a front pile on the floor.
  for (const sy of [0.28, 0.48]) {
    const shelfY = h * sy;
    g.fillStyle = '#5b4026';
    g.fillRect(w * 0.04, shelfY, w * 0.92, h * 0.018);
    for (let x = w * 0.045; x < w * 0.9; x += w * 0.03) {
      const ih = h * (0.05 + rand() * 0.05);
      g.fillStyle = pick(fills);
      g.fillRect(x, shelfY - ih, w * 0.024, ih);
      g.fillStyle = 'rgba(255,255,255,0.2)';
      g.fillRect(x, shelfY - ih, w * 0.024, h * 0.008);
    }
  }
  for (let col = 0; col < 18; col++) {
    const x = w * 0.03 + col * w * 0.052;
    const stack = 1 + Math.floor(rand() * 3);
    for (let r = 0; r < stack; r++) {
      const y = floorY - (r + 1) * h * 0.045;
      g.fillStyle = pick(fills);
      g.fillRect(x, y, w * 0.045, h * 0.045);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x + w * 0.006, y, w * 0.033, h * 0.008);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x, y + h * 0.038, w * 0.045, h * 0.007);
    }
  }
  g.fillStyle = '#1e1710';
  g.fillRect(0, 0, w * 0.02, h);
  g.fillRect(w * 0.98, 0, w * 0.02, h);
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
  // Atlas cells must not bleed into each other: linear minification, no mipmaps.
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
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
export const pancartaTex = () => canvasTexture(256, 160, (g, w, h) => {
  g.fillStyle = '#f7f1dc';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1e6fd9';
  g.fillRect(0, 0, w, 10);
  g.fillStyle = '#e4007c';
  g.fillRect(0, h - 10, w, 10);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#c0392b';
  g.font = 'bold 26px monospace';
  g.fillText('ABARROTES LA ESPERANZA', w / 2, 30, w - 16);
  g.fillStyle = '#1b1b1b';
  g.font = 'bold 20px monospace';
  g.fillText('PRECIOS DEL DÍA', w / 2, 58);
  g.fillStyle = '#e4007c';
  g.font = 'bold 24px monospace';
  g.fillText('FRIJOL $64', w / 2, 86);
  g.fillStyle = '#1e6fd9';
  g.fillText('ARROZ $38', w / 2, 112);
  g.fillStyle = '#2bb673';
  g.fillText('CHILE $120', w / 2, 138);
  // Paint wear and a coffee ring.
  blotch(g, w, h, 'rgba(120,90,50,0.2)', 0.7, 5, 30);
  g.strokeStyle = 'rgba(120,80,40,0.4)';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(w * 0.78, h * 0.62, 18, 0, Math.PI * 2);
  g.stroke();
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

export const lonaTex = (color) => canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  // Woven tarp: fine crosshatch plus sun-bleach and dirt (periods divide 128).
  for (let x = 0; x < w; x += 4) {
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(x, 0, 1, h);
  }
  for (let y = 0; y < h; y += 4) {
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(0, y, w, 1);
  }
  blotch(g, w, h, 'rgba(240,235,215,0.18)', 0.6, 5, 34);
  blotch(g, w, h, 'rgba(40,32,24,0.22)', 0.5, 5, 28);
  grime(g, w, h, { stain: 0.6, edge: 0.3, crack: 0.15, scratch: 0.3 });
  grain(g, w, h, 14);
});

export const produceTex = () => canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#6b4a2b';
  g.fillRect(0, 0, w, h);
  // Wooden crate slats centred on the cell boundaries so the texture wraps.
  g.fillStyle = 'rgba(40,26,14,0.6)';
  for (const B of [0, 32, 64, 96, 128]) g.fillRect(B - 1, 0, 2, h);
  for (const B of [0, 64, 128]) g.fillRect(0, B - 1, w, 2);
  for (let cx = 0; cx < 4; cx++) {
    for (let cy = 0; cy < 2; cy++) {
      const x0 = cx * 32 + 4, y0 = cy * 64 + 4;
      g.fillStyle = shade('#8a6238', 0.8 + rand() * 0.4);
      g.fillRect(x0, y0, 24, 56);
      const c = pick(['#d32f2f', '#f57c00', '#7cb342', '#fbc02d', '#8d6e63', '#c62828', '#eceff1']);
      for (let i = 0; i < 46; i++) {
        g.fillStyle = c;
        g.fillRect(x0 + 2 + rand() * 19, y0 + 2 + rand() * 51, 3, 3);
      }
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x0, y0 + 53, 24, 3);
    }
  }
  blotch(g, w, h, '#4e3419', 0.35, 4, 24);
  grain(g, w, h, 14);
});

export const sackTex = () => canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#cdb88a';
  g.fillRect(0, 0, w, h);
  // Burlap weave (periods divide 128 so the tile wraps).
  for (let i = 0; i < w; i += 4) {
    g.fillStyle = 'rgba(90,70,40,0.28)';
    g.fillRect(i, 0, 1, h);
    g.fillRect(0, i, w, 1);
  }
  for (let i = 0; i < w; i += 8) {
    g.fillStyle = 'rgba(255,250,230,0.12)';
    g.fillRect(i + 1, 0, 1, h);
    g.fillRect(0, i + 1, w, 1);
  }
  // Stitched label and a dirt rub.
  g.fillStyle = '#7a1f1f';
  g.fillRect(24, 46, 80, 24);
  g.fillStyle = 'rgba(240,230,200,0.6)';
  g.font = 'bold 12px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('25 KG', 64, 58);
  blotch(g, w, h, 'rgba(96,74,44,0.3)', 0.6, 5, 30);
  grime(g, w, h, { stain: 0.5, edge: 0.35, crack: 0.1, scratch: 0.3 });
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

// Diamond wire lattice for chain-link fencing, alpha-tested (transparent background).
export const chainlinkTex = () => canvasTexture(64, 64, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(196,204,216,0.95)';
  g.lineWidth = 1.4;
  for (let k = -64; k < 128; k += 8) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + 32, h);
    g.stroke();
    g.beginPath();
    g.moveTo(k + 32, 0);
    g.lineTo(k, h);
    g.stroke();
  }
});

// PET bottle wrap for the prop kit: pale plastic body, a coloured label band with a
// fictional mark, darker cap zone. `name` is printed on the label — keep it generic.
export const bottleTex = (label = '#2e6fd9', ink = '#f4f1de', name = 'AGUA') => canvasTexture(64, 64, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#d8e2ea');
  grad.addColorStop(0.5, '#bcccd8');
  grad.addColorStop(1, '#9fb4c2');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // Cap band at the top of the wrap (canvas top = bottle neck).
  g.fillStyle = '#7e8890';
  g.fillRect(0, 0, w, 9);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, 9);
  // Label band around the middle of the body.
  g.fillStyle = label;
  g.fillRect(0, 24, w, 20);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(0, 24, w, 3);
  g.fillStyle = ink;
  g.font = 'bold 9px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, w / 2, 35, w - 6);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 42, w, 2);
});

// --- CDMX showcase ---------------------------------------------------------
// 128–256 px painted textures: the showcase renders at 480p and frames them close, so the
// 32 px store tiles would read as noise.

export const cobbleTex = (base = '#6a6280') => canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#35304a';
  g.fillRect(0, 0, w, h);
  // 8x8 worn stones per repeat; each stone gets a lit crown and a dark foot.
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const v = 0.75 + rand() * 0.45;
      g.fillStyle = base;
      g.globalAlpha = 0.55 + rand() * 0.45;
      g.fillRect(x * 32 + 2, y * 32 + 2, 28, 28);
      g.globalAlpha = v * 0.35;
      g.fillStyle = '#b0a6c8';
      g.fillRect(x * 32 + 3, y * 32 + 3, 26, 9);
      g.globalAlpha = v * 0.3;
      g.fillStyle = '#1c1830';
      g.fillRect(x * 32 + 3, y * 32 + 24, 26, 6);
      g.globalAlpha = 1;
    }
  }
  // Dirt settled into the joints and a few cracked stones.
  blotch(g, w, h, '#14101e', 0.35, 8, 40);
  blotch(g, w, h, '#8f86b8', 0.12, 5, 30);
  g.strokeStyle = 'rgba(10,8,16,0.5)';
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    let x = 10 + rand() * (w - 80), y = 10 + rand() * (h - 60);
    g.moveTo(x, y);
    for (let s = 0; s < 2; s++) {
      x = Math.min(w - 10, Math.max(10, x + 10 + rand() * 24));
      y = Math.min(h - 10, Math.max(10, y + (rand() - 0.5) * 30));
      g.lineTo(x, y);
    }
    g.stroke();
  }
  grime(g, w, h, { stain: 0.4, edge: 0.15, crack: 0.5, scratch: 0.2 });
  grain(g, w, h, 14);
});

export const plasterTex = (base = '#5b4f66', shade = '#2e2740') => canvasTexture(256, 256, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, base);
  grad.addColorStop(0.7, base);
  grad.addColorStop(1, shade);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  blotch(g, w, h, '#12101c', 0.3, 14, 52);
  blotch(g, w, h, '#9682b8', 0.1, 8, 40);
  // Hairline cracks and weather streaks running down the wall.
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(10,8,14,${0.1 + rand() * 0.15})`;
    g.fillRect(6 + rand() * (w - 20), 0, 2 + rand() * 5, h * (0.2 + rand() * 0.7));
  }
  grime(g, w, h, { stain: 0.7, edge: 0.25, crack: 0.7, scratch: 0.3 });
  grain(g, w, h, 12);
});

// Lit office windows on a near-black slab. Used with basic() so it glows on its own.
export const facadeTex = (cols = 6, rows = 14, tint = '#9fd0ff') => canvasTexture(256, 512, (g, w, h) => {
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
  // Grime in the grout, gum spots and a darker kick plate along the bottom.
  blotch(g, w, h, '#463c32', 0.3, 8, 24);
  blotch(g, w, h, '#e8e0cc', 0.15, 5, 20);
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(60,50,40,${0.2 + rand() * 0.3})`;
    g.fillRect(4 + rand() * (w - 14), 4 + rand() * (h - 14), 2 + rand() * 3, 2 + rand() * 3);
  }
  g.fillStyle = 'rgba(30,24,20,0.5)';
  g.fillRect(0, h - 8, w, 8);
  grime(g, w, h, { stain: 0.5, edge: 0.2, crack: 0.4, scratch: 0.3 });
  grain(g, w, h, 10);
});

export const metroSeatTex = () => canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#1f6f7a';
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(150,220,220,0.18)';
  for (let i = 0; i < 480; i++) g.fillRect(rand() * w, rand() * h, 1, 1);
  // Worn fabric: seam lines and dirt ground into the weave.
  g.fillStyle = 'rgba(10,40,44,0.5)';
  for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 1);
  blotch(g, w, h, '#0e2a2e', 0.4, 6, 30);
  grime(g, w, h, { stain: 0.4, edge: 0.2, crack: 0.1, scratch: 0.3 });
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

// Night sky for the CDMX showcase: deep purple-violet gradient (#2a1f45 -> #4a3a66 at the
// horizon), a dense field of small stars and soft horizontal lavender cloud bands that the
// stars show through. No moon — the Torre shot carries its own.
export const skyTex = () => canvasTexture(1024, 512, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#120d28');
  grad.addColorStop(0.35, '#241b47');
  grad.addColorStop(0.62, '#2a1f45');
  grad.addColorStop(0.8, '#463763');
  grad.addColorStop(1, '#352a52');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // Stars first so the thin cloud veils draw over them and let them through.
  for (let i = 0; i < 1700; i++) {
    const x = rand() * w, y = rand() * h * 0.78;
    const roll = rand();
    const warm = roll < 0.2, cool = roll > 0.45 && roll < 0.75;
    const bright = roll > 0.965;
    const a = bright ? 0.95 : 0.18 + rand() * 0.6;
    g.fillStyle = warm ? `rgba(255,224,180,${a})` : cool ? `rgba(170,200,255,${a})` : `rgba(235,240,255,${a})`;
    const s = bright ? 2 : 1;
    g.fillRect(x, y, s, s);
    if (bright) {
      g.fillStyle = `rgba(255,255,255,${a * 0.45})`;
      g.fillRect(x - 2, y, 5, 1);
      g.fillRect(x, y - 2, 1, 5);
    }
  }
  // Wide smoky cloud bands: stacked soft ellipses in lavender-grey, drifting with the dome.
  for (let i = 0; i < 34; i++) {
    const cy = h * (0.3 + rand() * 0.5);
    const cx = rand() * w;
    const rx = 90 + rand() * 240, ry = 6 + rand() * 18;
    const base = 106 + rand() * 40, a = 0.05 + rand() * 0.09;
    for (let k = 0; k < 4; k++) {
      g.fillStyle = `rgba(${base + rand() * 30},${base * 0.86 + rand() * 20},${base * 1.25 + rand() * 30},${(a * (1 - k * 0.22)).toFixed(3)})`;
      g.beginPath();
      g.ellipse(cx + (rand() - 0.5) * rx * 0.7, cy + (rand() - 0.5) * ry * 1.6, rx * (0.75 + rand() * 0.5), ry * (0.7 + rand() * 0.6), 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // A few darker violet masses low on the horizon for depth.
  for (let i = 0; i < 10; i++) {
    g.fillStyle = `rgba(38,28,66,${0.08 + rand() * 0.1})`;
    g.beginPath();
    g.ellipse(rand() * w, h * (0.72 + rand() * 0.26), 120 + rand() * 200, 14 + rand() * 26, 0, 0, Math.PI * 2);
    g.fill();
  }
});

export const moonTex = () => canvasTexture(64, 64, (g, w, h) => {
  const halo = g.createRadialGradient(w / 2, h / 2, 5, w / 2, h / 2, 26);
  halo.addColorStop(0, 'rgba(238,242,255,1)');
  halo.addColorStop(0.4, 'rgba(226,234,255,0.55)');
  halo.addColorStop(0.62, 'rgba(214,226,255,0.16)');
  halo.addColorStop(1, 'rgba(214,226,255,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(186,202,240,0.35)';
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.arc(w / 2 + (rand() - 0.5) * 20, h / 2 + (rand() - 0.5) * 20, 1 + rand() * 2.2, 0, Math.PI * 2);
    g.fill();
  }
});

// Soft radial glow used by the light-halo quads in the level builder. One shared texture.
let _haloTex = null;
export const haloTex = () => {
  if (_haloTex) return _haloTex;
  _haloTex = canvasTexture(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    gr.addColorStop(0.65, 'rgba(255,255,255,0.12)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
  return _haloTex;
};

// Irregular dark mirror for wet-ground decals: near-black blue centre feathered to nothing,
// with a couple of paler flecks so the edge doesn't read as a perfect ellipse.
export const puddleTex = () => canvasTexture(128, 128, (g, w, h) => {
  const cx = w / 2, cy = h / 2;
  const gr = g.createRadialGradient(cx, cy, 4, cx, cy, w * 0.48);
  gr.addColorStop(0, 'rgba(9,12,24,0.92)');
  gr.addColorStop(0.55, 'rgba(11,15,30,0.72)');
  gr.addColorStop(0.82, 'rgba(13,17,34,0.34)');
  gr.addColorStop(1, 'rgba(13,17,34,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, r = w * (0.18 + rand() * 0.3);
    g.fillStyle = `rgba(30,40,70,${0.05 + rand() * 0.12})`;
    g.beginPath();
    g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2 + rand() * 7, 0, Math.PI * 2);
    g.fill();
  }
});

// Vertical smear for fake light reflections on wet asphalt. Bright at the top edge (the lamp
// side of the quad) and feathered on the long sides; the material tints it per light.
export const streakTex = () => canvasTexture(32, 128, (g, w, h) => {
  for (let y = 0; y < h; y++) {
    const a = Math.pow(1 - y / h, 1.7) * 0.9;
    g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    g.fillRect(0, y, w, 1);
  }
  const edge = g.createLinearGradient(0, 0, w, 0);
  edge.addColorStop(0, 'rgba(0,0,0,1)');
  edge.addColorStop(0.22, 'rgba(0,0,0,0)');
  edge.addColorStop(0.78, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
});

// --- CDMX building kit -------------------------------------------------------

// Deterministic per-key PRNG so facade pairs stay stable between loads.
const prng = (key) => {
  let s = 2166136261;
  for (const ch of key) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
};

// Window grid shared by the facade albedo and its emissive twin: same cells, same insets,
// so lit panes always land inside their dark recesses.
const winCells = (cols, rows) => {
  const cw = 256 / cols, ch = 512 / rows, cells = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    cells.push([x * cw + cw * 0.24, y * ch + ch * 0.26, cw * 0.52, ch * 0.46]);
  }
  return cells;
};

// Facade albedo: tinted plaster/concrete with floor lines, dark window recesses and grime
// streaks. The lit panes live in windowsTex (the emissive map), not here.
export const buildingTex = (base = '#5a5470', cols = 6, rows = 12, seedKey = 'b') => canvasTexture(256, 512, (g, w, h) => {
  const rnd = prng(`fac|${base}|${cols}|${rows}|${seedKey}`);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, shade(base, 1.07));
  grad.addColorStop(0.72, base);
  grad.addColorStop(1, shade(base, 0.78));
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // Floor slab shadow lines.
  g.fillStyle = 'rgba(8,6,14,0.4)';
  for (let y = 0; y <= rows; y++) g.fillRect(0, (y * h) / rows - 1, w, 2);
  // Window recesses with a faint sky reflection at the top of the glass.
  for (const [x, y, ww, hh] of winCells(cols, rows)) {
    g.fillStyle = '#0e1220';
    g.fillRect(x, y, ww, hh);
    g.fillStyle = 'rgba(150,175,220,0.10)';
    g.fillRect(x, y, ww, hh * 0.28);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(x - 1, y + hh, ww + 2, 2);
  }
  // Grime bleeding down from a few sills plus general weathering.
  g.fillStyle = 'rgba(8,6,12,0.28)';
  for (let i = 0; i < 12; i++) {
    const x = rnd() * w;
    g.fillRect(x, rnd() * h * 0.45, 2 + rnd() * 5, h * (0.18 + rnd() * 0.5));
  }
  blotch(g, w, h, '#0c0a14', 0.3, 10, 42);
  grain(g, w, h, 10);
});

// Emissive twin: black everywhere except lit panes — warm tungsten or cool fluorescent mixed
// per building, a few dead floors for variety. Feeds MeshLambertMaterial.emissiveMap.
export const windowsTex = (cols = 6, rows = 12, seedKey = 'b') => canvasTexture(256, 512, (g, w, h) => {
  const rnd = prng(`win|${cols}|${rows}|${seedKey}`);
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  const cells = winCells(cols, rows);
  const deadRows = new Set();
  for (let y = 0; y < rows; y++) if (rnd() < 0.16) deadRows.add(y);
  for (let i = 0; i < cells.length; i++) {
    const row = Math.floor(i / cols);
    if (deadRows.has(row) || rnd() > 0.46) continue;
    const [x, y, ww, hh] = cells[i];
    const warm = rnd() < 0.62;
    const a = 0.55 + rnd() * 0.45;
    g.fillStyle = warm ? `rgba(255,206,142,${a})` : `rgba(158,198,255,${a * 0.92})`;
    const litH = rnd() < 0.18 ? hh * 0.55 : hh; // half-lit pane
    g.fillRect(x, y + hh - litH, ww, litH);
    if (rnd() < 0.3) {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x + ww / 2 - 0.5, y, 1, hh);
    }
  }
});

// Striped shop awning with a scalloped valance.
export const awningTex = (c1 = '#b3322c', c2 = '#e8ddc4') => canvasTexture(128, 40, (g, w, h) => {
  for (let x = 0; x < w; x += 16) {
    g.fillStyle = (x / 16) % 2 ? c1 : c2;
    g.fillRect(x, 0, 16, h - 8);
  }
  for (let x = 0; x < w; x += 16) {
    g.fillStyle = (x / 16) % 2 ? c1 : c2;
    g.beginPath();
    g.arc(x + 8, h - 8, 8, 0, Math.PI);
    g.fill();
  }
  g.fillStyle = 'rgba(10,8,12,0.35)';
  g.fillRect(0, h - 10, w, 3);
  blotch(g, w, h, '#0c0a10', 0.3, 5, 14);
});

// Roller-shutter slats with side guides and rust streaks.
export const shutterTex = () => canvasTexture(128, 128, (g, w, h) => {
  g.fillStyle = '#7d8894';
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 8) {
    g.fillStyle = 'rgba(0,0,0,0.38)';
    g.fillRect(0, y, w, 2);
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(0, y + 3, w, 2);
  }
  g.fillStyle = 'rgba(18,22,28,0.65)';
  g.fillRect(0, 0, 3, h);
  g.fillRect(w - 3, 0, 3, h);
  g.fillStyle = 'rgba(122,72,40,0.3)';
  for (let i = 0; i < 6; i++) g.fillRect(8 + rand() * (w - 24), rand() * h * 0.5, 3 + rand() * 6, h * (0.3 + rand() * 0.5));
  blotch(g, w, h, '#14100e', 0.4, 8, 22);
  grain(g, w, h, 10);
});

// Patchy night grass for the football pitch: dark green base, straw flecks, worn mud.
export const grassTex = () => canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#1c2a19';
  g.fillRect(0, 0, w, h);
  blotch(g, w, h, '#26391f', 0.5, 14, 44);
  blotch(g, w, h, '#121b10', 0.5, 12, 48);
  blotch(g, w, h, '#3a3226', 0.25, 6, 30); // worn mud patches
  for (let i = 0; i < 1100; i++) {
    g.fillStyle = `rgba(${42 + rand() * 44},${74 + rand() * 52},${30 + rand() * 30},${0.22 + rand() * 0.42})`;
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 3);
  }
  grain(g, w, h, 12);
});

// Large abstract mural for blank concrete walls: bold colour fields and geometric shapes,
// fictional by construction — no lettering, no copied artwork.
export const muralTex = (seedKey = 'm') => canvasTexture(256, 128, (g, w, h) => {
  const rnd = prng(`mural|${seedKey}`);
  const bg = pick(['#3a2a4a', '#27364e', '#46302a', '#2e4034', '#40304e']);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  const palette = ['#d9822b', '#c94f6d', '#e8c95a', '#5aa8a0', '#e8e0cc', '#8a5ac8'];
  // Horizon band + big geometric forms.
  g.fillStyle = palette[Math.floor(rnd() * palette.length)];
  g.globalAlpha = 0.85;
  g.fillRect(0, h * (0.45 + rnd() * 0.2), w, h * 0.3);
  for (let i = 0; i < 7; i++) {
    g.fillStyle = palette[Math.floor(rnd() * palette.length)];
    g.globalAlpha = 0.5 + rnd() * 0.4;
    const x = rnd() * w, y = rnd() * h, s = 12 + rnd() * 42;
    if (rnd() < 0.5) {
      g.beginPath();
      g.arc(x, y, s * 0.5, 0, Math.PI * 2);
      g.fill();
    } else {
      g.save();
      g.translate(x, y);
      g.rotate(rnd() * 3);
      g.fillRect(-s / 2, -s * 0.3, s, s * 0.6);
      g.restore();
    }
  }
  g.globalAlpha = 1;
  // Cracks and weathering so it reads painted-on, not a screen.
  g.strokeStyle = 'rgba(10,8,14,0.5)';
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    let x = rnd() * w, y = rnd() * h;
    g.moveTo(x, y);
    for (let s = 0; s < 3; s++) {
      x += (rnd() - 0.5) * 40;
      y += rnd() * 26;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  blotch(g, w, h, '#0e0b12', 0.35, 8, 30);
  grain(g, w, h, 14);
});

// --- CDMX showcase, reference-matched sets ------------------------------------

// Hand-painted shop lettering: 'ABARROTES VINOS Y LICORES' in orange-red on the white wall.
// Letters are stamped one by one with tiny jitter so it reads brushed-on, not typeset.
export const shopFrontTex = () => canvasTexture(1024, 224, (g, w, h) => {
  g.fillStyle = '#ece5d4';
  g.fillRect(0, 0, w, h);
  blotch(g, w, h, '#d8cfba', 0.3, 6, 30);
  const paint = (text, y, size, color) => {
    g.fillStyle = color;
    g.font = `bold ${size}px "Arial Black", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const widths = [...text].map((ch) => g.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + (text.length - 1) * size * 0.06;
    let x = w / 2 - total / 2;
    [...text].forEach((ch, i) => {
      g.save();
      g.translate(x + widths[i] / 2, y + (rand() - 0.5) * size * 0.08);
      g.rotate((rand() - 0.5) * 0.05);
      g.fillText(ch, 0, 0);
      g.restore();
      x += widths[i] + size * 0.06;
    });
  };
  paint('ABARROTES', h * 0.34, 92, '#d8451a');
  paint('VINOS Y LICORES', h * 0.74, 62, '#c23a10');
  // Paint wear: a few drips and rubbed patches.
  g.fillStyle = 'rgba(120,60,30,0.25)';
  for (let i = 0; i < 8; i++) g.fillRect(rand() * w, h * 0.3 + rand() * h * 0.5, 2, 6 + rand() * 14);
  grime(g, w, h, { stain: 0.3, edge: 0.1, crack: 0.15, scratch: 0.2 });
  grain(g, w, h, 10);
});

// Blue fascia band with white lettering for under the shop awning.
export const awningSignTex = (text = 'TIENDA DE ABARROTES') => canvasTexture(1024, 96, (g, w, h) => {
  g.fillStyle = '#1d5aa8';
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.font = 'bold 52px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2, w - 40);
  g.fillStyle = 'rgba(10,20,40,0.4)';
  g.fillRect(0, h - 6, w, 6);
  blotch(g, w, h, '#0e2c58', 0.3, 5, 20);
  grain(g, w, h, 8);
});

// Lit interior seen through a metro train window: grey frame border, warm-white cabin,
// grab poles and seat hints. Used with basic() so the panes read as lit from outside.
export const metroWinTex = () => canvasTexture(128, 80, (g, w, h) => {
  // Frame: grey border with a darker gasket line.
  g.fillStyle = '#4a4e56';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#2c2f36';
  g.fillRect(0, 0, w, 5);
  g.fillRect(0, h - 5, w, 5);
  g.fillRect(0, 0, 5, h);
  g.fillRect(w - 5, 0, 5, h);
  g.fillStyle = '#6a7078';
  g.fillRect(5, 5, w - 10, 3);
  g.fillRect(5, h - 8, w - 10, 3);
  const ix = 8, iy = 9, iw = w - 16, ih = h - 18;
  const grad = g.createLinearGradient(0, iy, 0, iy + ih);
  grad.addColorStop(0, '#cfe0ee');
  grad.addColorStop(0.45, '#f2e8d4');
  grad.addColorStop(1, '#8a7a64');
  g.fillStyle = grad;
  g.fillRect(ix, iy, iw, ih);
  // Ceiling light strip glow at the top of the cabin.
  g.fillStyle = 'rgba(255,246,220,0.85)';
  g.fillRect(ix + iw * 0.2, iy + 2, iw * 0.6, 3);
  // Grab poles: two thin verticals with a slight lean.
  g.fillStyle = '#3a3f46';
  for (const px of [ix + iw * 0.3, ix + iw * 0.68]) {
    g.fillRect(px - 1.5, iy + 2, 3, ih * 0.72);
    g.fillStyle = '#565d66';
    g.fillRect(px - 1.5, iy + 2, 1.4, ih * 0.72);
    g.fillStyle = '#3a3f46';
  }
  // Seat backs along the bottom: teal bench silhouettes with headrest gaps.
  g.fillStyle = '#2e6f78';
  g.fillRect(ix, iy + ih * 0.66, iw, ih * 0.34);
  g.fillStyle = '#3f8a94';
  for (let x = ix + 4; x < ix + iw - 4; x += 22) g.fillRect(x, iy + ih * 0.68, 18, ih * 0.2);
  g.fillStyle = 'rgba(20,26,30,0.55)';
  for (let x = ix + 4; x < ix + iw - 4; x += 22) g.fillRect(x + 18, iy + ih * 0.68, 4, ih * 0.2);
  // Passenger shoulder hints.
  g.fillStyle = 'rgba(60,50,44,0.5)';
  for (const [px, pw] of [[ix + iw * 0.18, 14], [ix + iw * 0.5, 16], [ix + iw * 0.84, 13]]) {
    g.beginPath();
    g.ellipse(px, iy + ih * 0.62, pw, 7, 0, Math.PI, 0);
    g.fill();
  }
  grain(g, w, h, 8);
});

// Plug door: orange panel with a center seam, a small wired-glass slot near the top
// and warm light leaking around the edges.
export const metroDoorTex = () => canvasTexture(96, 160, (g, w, h) => {
  g.fillStyle = '#b34a14';
  g.fillRect(0, 0, w, h);
  // Panel seams and rivets.
  g.fillStyle = 'rgba(40,18,8,0.6)';
  g.fillRect(w / 2 - 1.5, 8, 3, h - 16);
  g.fillStyle = 'rgba(255,200,150,0.25)';
  g.fillRect(4, 8, 2, h - 16);
  g.fillRect(w - 6, 8, 2, h - 16);
  // Wired-glass slot.
  g.fillStyle = '#2c3038';
  g.fillRect(w * 0.18, h * 0.1, w * 0.64, h * 0.16);
  g.fillStyle = 'rgba(220,235,250,0.8)';
  for (let i = 0; i < 7; i++) g.fillRect(w * 0.2 + i * w * 0.09, h * 0.12, 3, h * 0.12);
  // Handle block.
  g.fillStyle = '#3a3f46';
  g.fillRect(w * 0.4, h * 0.62, w * 0.2, h * 0.09);
  // Warm light leak at the bottom edge (interior spill under the door).
  const leak = g.createLinearGradient(0, h - 26, 0, h);
  leak.addColorStop(0, 'rgba(255,210,150,0)');
  leak.addColorStop(1, 'rgba(255,214,160,0.85)');
  g.fillStyle = leak;
  g.fillRect(0, h - 26, w, 26);
  grain(g, w, h, 10);
});

// 'Español' textbook cover: yellow field, black title, subtitle and a simple llama panel.
export const bookTex = () => canvasTexture(400, 270, (g, w, h) => {
  g.fillStyle = '#f2c22a';
  g.fillRect(0, 0, w, h);
  const shadeG = g.createLinearGradient(0, h - 30, 0, h);
  shadeG.addColorStop(0, 'rgba(120,80,20,0)');
  shadeG.addColorStop(1, 'rgba(120,80,20,0.45)');
  g.fillStyle = shadeG;
  g.fillRect(0, h - 30, w, 30);
  g.fillStyle = '#16140f';
  g.font = 'bold 50px Arial, sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillText('Español', 16, 54);
  g.font = 'bold 13px Arial, sans-serif';
  g.fillText('Primer grado', 18, 76);
  g.fillStyle = '#c0392b';
  g.fillText('L E C T U R A S', 112, 76);
  // Illustration panel on the right: night-blue field, sun and a chunky llama (own drawing).
  const px = w * 0.42, py = 92, pw = w * 0.55, ph = h - 108;
  g.fillStyle = '#f7f1e3';
  g.fillRect(px, py, pw, ph);
  g.fillStyle = '#e0533a';
  g.beginPath();
  g.arc(px + pw * 0.82, py + ph * 0.22, 16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3f8f4a';
  g.fillRect(px, py + ph * 0.82, pw, ph * 0.18);
  const blob = (x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  blob(px + pw * 0.45, py + ph * 0.58, pw * 0.22, ph * 0.15, '#fbfaf5');            // body
  for (const [dx, dy, r] of [[-0.1, -0.02, 0.05], [0.05, 0.04, 0.06], [0.14, -0.04, 0.04], [-0.02, 0.08, 0.035]]) {
    blob(px + pw * (0.45 + dx), py + ph * (0.58 + dy), pw * r, pw * r * 0.8, '#151515');
  }
  blob(px + pw * 0.66, py + ph * 0.36, pw * 0.05, ph * 0.18, '#fbfaf5');            // neck
  blob(px + pw * 0.71, py + ph * 0.2, pw * 0.09, ph * 0.08, '#fbfaf5');             // head
  blob(px + pw * 0.75, py + ph * 0.19, 3, 3, '#151515');
  g.fillStyle = '#d4a017';
  g.fillRect(px + pw * 0.62, py + ph * 0.42, pw * 0.09, ph * 0.05);                 // scarf
  g.fillStyle = '#151515';
  for (const lx of [0.3, 0.4, 0.5, 0.58]) g.fillRect(px + pw * lx, py + ph * 0.68, pw * 0.035, ph * 0.16);
  g.strokeStyle = '#16140f';
  g.lineWidth = 4;
  g.strokeRect(px + 2, py + 2, pw - 4, ph - 4);
  grain(g, w, h, 6);
});

// Library shelf face: dark metal uprights, many rows of colourful spines and a few
// forward-facing covers. One texture tiles across whole shelf walls.
export const libShelfTex = () => canvasTexture(256, 512, (g, w, h) => {
  g.fillStyle = '#23262c';
  g.fillRect(0, 0, w, h);
  const spineCols = ['#c94f4f', '#4f7dc9', '#4fae7c', '#c9a44f', '#8a5ac8', '#d97fb0', '#5aa8a0', '#e8e0cc', '#7a4a8a', '#b5452e'];
  const rows = 12, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const y0 = r * rh;
    // Shelf board.
    g.fillStyle = '#3a3e46';
    g.fillRect(0, y0 + rh - 5, w, 5);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(0, y0 + rh - 7, w, 2);
    let x = 3;
    while (x < w - 4) {
      if (rand() < 0.12) {
        // Forward-facing cover: pale rectangle with title lines.
        const cw = 12 + rand() * 10, ch = rh * (0.62 + rand() * 0.2);
        g.fillStyle = pick(spineCols);
        g.fillRect(x, y0 + rh - 6 - ch, cw, ch);
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillRect(x + 2, y0 + rh - 6 - ch + 3, cw - 4, 2);
        g.fillRect(x + 2, y0 + rh - 6 - ch + 7, cw - 6, 1.5);
        g.fillRect(x + 2, y0 + rh - 6 - ch + 11, cw - 8, 1.5);
        x += cw + 2;
      } else {
        const sw = 3 + rand() * 6, sh = rh * (0.55 + rand() * 0.38);
        g.fillStyle = pick(spineCols);
        g.fillRect(x, y0 + rh - 6 - sh, sw, sh);
        g.fillStyle = 'rgba(255,255,255,0.28)';
        g.fillRect(x, y0 + rh - 6 - sh, sw, 1.5);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(x + sw - 1, y0 + rh - 6 - sh, 1, sh);
        x += sw + (rand() < 0.2 ? 3 : 0.6);
      }
    }
  }
  // Uprights.
  g.fillStyle = '#17191e';
  g.fillRect(0, 0, 5, h);
  g.fillRect(w - 5, 0, 5, h);
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(5, 0, 2, h);
  g.fillRect(w - 7, 0, 2, h);
  grain(g, w, h, 10);
});

// Concrete library pillar face with big '920' digits and a small red label.
export const libPillarTex = () => canvasTexture(128, 512, (g, w, h) => {
  g.fillStyle = '#8d8d94';
  g.fillRect(0, 0, w, h);
  blotch(g, w, h, '#6e6e76', 0.5, 8, 30);
  blotch(g, w, h, '#a8a8b0', 0.3, 5, 24);
  g.fillStyle = '#d8d8de';
  g.font = 'bold 150px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('920', w / 2, h * 0.3);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.font = 'bold 120px "Arial Black", Arial, sans-serif';
  g.fillText('920', w / 2 + 4, h * 0.3 + 5);
  // Red label plate below.
  g.fillStyle = '#a03028';
  g.fillRect(w * 0.18, h * 0.56, w * 0.64, h * 0.1);
  g.fillStyle = '#f2e8d8';
  g.font = 'bold 26px Arial, sans-serif';
  g.fillText('SALA', w / 2, h * 0.61);
  grime(g, w, h, { stain: 0.5, edge: 0.2, crack: 0.4, scratch: 0.3 });
  grain(g, w, h, 12);
});

// Torre Latinoamericana shaft: stacked floor bands, each a row of lit windows in a
// rotating warm/cool hue, separated by bright horizontal strip-light lines.
export const torreFacadeTex = () => canvasTexture(256, 1024, (g, w, h) => {
  g.fillStyle = '#141824';
  g.fillRect(0, 0, w, h);
  const hues = ['#ffb054', '#ff8a3a', '#54d8c8', '#5aa8ff', '#ffd88a', '#ff6a4a'];
  const floors = 26, fh = h / floors;
  for (let f = 0; f < floors; f++) {
    const y0 = f * fh;
    const hue = hues[f % hues.length];
    const lit = 0.7 + rand() * 0.3;
    // Window cells across the floor: near-continuous ribbon glazing.
    const cols = 14, cw = w / cols;
    for (let c = 0; c < cols; c++) {
      if (rand() < 0.08) continue;
      g.fillStyle = rand() < 0.15 ? hues[(f + 2) % hues.length] : hue;
      g.globalAlpha = lit * (0.7 + rand() * 0.3);
      g.fillRect(c * cw + cw * 0.08, y0 + fh * 0.18, cw * 0.84, fh * 0.58);
    }
    g.globalAlpha = 1;
    // Bright floor separator line — the strip-light glow between storeys.
    const gl = g.createLinearGradient(0, y0 + fh - 4, 0, y0 + fh + 4);
    gl.addColorStop(0, 'rgba(255,190,110,0)');
    gl.addColorStop(0.5, 'rgba(255,205,130,0.75)');
    gl.addColorStop(1, 'rgba(255,190,110,0)');
    g.fillStyle = gl;
    g.fillRect(0, y0 + fh - 4, w, 8);
  }
  // Vertical piers between window columns.
  g.fillStyle = 'rgba(8,10,16,0.55)';
  for (let c = 0; c <= 14; c++) g.fillRect(c * (w / 14) - 1, 0, 2, h);
});

// Illuminated name band: warm white field, big dark 'LATINOAMERICANA' letterspaced.
export const towerSignTex = (text = 'LATINOAMERICANA') => canvasTexture(1024, 96, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#f7ecd2');
  grad.addColorStop(0.5, '#fff6e0');
  grad.addColorStop(1, '#e8d8b8');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#23222c';
  g.font = 'bold 58px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Letterspace manually for the monumental look.
  const spacing = 14;
  const widths = [...text].map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let x = w / 2 - total / 2;
  [...text].forEach((ch, i) => {
    g.fillText(ch, x + widths[i] / 2, h / 2 + 2);
    x += widths[i] + spacing;
  });
  g.fillStyle = 'rgba(120,90,50,0.25)';
  g.fillRect(0, 0, w, 4);
  g.fillRect(0, h - 4, w, 4);
  grain(g, w, h, 6);
});

// Small tower with thin horizontal white stripes — the mid-ground slab behind the Ángel.
export const stripeTowerTex = () => canvasTexture(256, 512, (g, w, h) => {
  g.fillStyle = '#1a2030';
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 18) {
    g.fillStyle = 'rgba(226,232,244,0.8)';
    g.fillRect(0, y, w, 3);
    g.fillStyle = 'rgba(120,140,180,0.25)';
    g.fillRect(0, y + 3, w, 2);
  }
  // Sparse cool window glints between the stripes.
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(170,210,255,${0.3 + rand() * 0.5})`;
    g.fillRect(rand() * w, rand() * h, 3 + rand() * 8, 2);
  }
});

// Biblioteca Central mural: own procedural stone-mosaic in the UNAM spirit — terracotta
// ground, cream glyph lines, black/dark-blue accents, turquoise tiles, two sun discs,
// stepped figure stacks and a serpent zig-zag. No copied artwork.
export const bibliotecaMuralTex = () => canvasTexture(1024, 640, (g, w, h) => {
  const rnd = prng('bibmural');
  // Terracotta mosaic ground: per-tile jitter reads as thousands of stones.
  const tile = 8;
  const base = ['#8f3a20', '#a04020', '#96502a', '#7e3418', '#b05028'];
  for (let y = 0; y < h; y += tile) {
    for (let x = 0; x < w; x += tile) {
      g.fillStyle = base[Math.floor(rnd() * base.length)];
      g.fillRect(x, y, tile, tile);
      if (rnd() < 0.16) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(240,220,190,0.5)' : 'rgba(20,14,10,0.4)';
        g.fillRect(x + rnd() * 8, y + rnd() * 8, 5 + rnd() * 8, 5 + rnd() * 8);
      }
    }
  }
  const grout = (a = 0.5) => {
    g.fillStyle = `rgba(24,16,10,${a})`;
    for (let x = 0; x < w; x += tile) g.fillRect(x, 0, 1.5, h);
    for (let y = 0; y < h; y += tile) g.fillRect(0, y, w, 1.5);
  };
  const glyph = (x, y, s, col, kind) => {
    g.fillStyle = col;
    if (kind === 0) { // stepped figure
      for (let i = 0; i < 4; i++) g.fillRect(x - s * (0.5 - i * 0.11), y - i * s * 0.42, s * (1 - i * 0.22), s * 0.4);
      g.beginPath(); g.arc(x, y - 4 * s * 0.42 - s * 0.1, s * 0.16, 0, Math.PI * 2); g.fill();
    } else if (kind === 1) { // ring + dot
      g.strokeStyle = col; g.lineWidth = s * 0.09;
      g.beginPath(); g.arc(x, y, s * 0.4, 0, Math.PI * 2); g.stroke();
      g.fillRect(x - s * 0.05, y - s * 0.05, s * 0.1, s * 0.1);
    } else if (kind === 2) { // cross
      g.fillRect(x - s * 0.05, y - s * 0.45, s * 0.1, s * 0.9);
      g.fillRect(x - s * 0.45, y - s * 0.05, s * 0.9, s * 0.1);
    } else { // diamond
      g.beginPath();
      g.moveTo(x, y - s * 0.4); g.lineTo(x + s * 0.3, y); g.lineTo(x, y + s * 0.4); g.lineTo(x - s * 0.3, y);
      g.fill();
    }
  };
  const cream = '#e8d9b8', white = '#f2ead8', black = '#1c1a20', blue = '#2a3a5e', teal = '#3f8a8a', ochre = '#c88a3a';
  // Two big sun/calendar discs with tick rings.
  const disc = (cx, cy, r, colA, colB) => {
    g.fillStyle = colA;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = colB;
    g.beginPath(); g.arc(cx, cy, r * 0.72, 0, Math.PI * 2); g.fill();
    g.strokeStyle = cream; g.lineWidth = r * 0.06;
    g.beginPath(); g.arc(cx, cy, r * 0.86, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.fillStyle = cream;
      g.fillRect(cx + Math.cos(a) * r * 0.86 - 2, cy + Math.sin(a) * r * 0.86 - 2, 4, 4);
    }
    g.fillStyle = white;
    g.beginPath(); g.arc(cx, cy, r * 0.3, 0, Math.PI * 2); g.fill();
  };
  disc(w * 0.12, h * 0.52, 110, teal, black);
  disc(w * 0.72, h * 0.6, 120, cream, '#a04020');
  for (const [dx, dy, r] of [[0.42, 0.22, 34], [0.9, 0.25, 40], [0.3, 0.8, 30], [0.55, 0.85, 26]]) disc(w * dx, h * dy, r, ochre, blue);
  // Vertical stacks of stepped figure motifs through the centre.
  for (let col = 0; col < 6; col++) {
    const sx = w * (0.26 + col * 0.06), top = h * (0.14 + (col % 3) * 0.04);
    for (let i = 0; i < 5; i++) {
      glyph(sx + (rnd() - 0.5) * 10, top + i * h * 0.15, 30 + rnd() * 12, i % 2 ? white : black, 0);
    }
  }
  // Serpent zig-zag bands top and bottom.
  const zig = (y0, amp, col) => {
    g.strokeStyle = col; g.lineWidth = 7; g.lineJoin = 'miter';
    g.beginPath();
    g.moveTo(0, y0);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, y0 + (Math.floor(x / 32) % 2 ? -amp : amp));
    g.stroke();
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, y0 + amp * 1.6);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, y0 + amp * 1.6 + (Math.floor(x / 32) % 2 ? -amp : amp));
    g.stroke();
  };
  zig(h * 0.09, 14, white);
  zig(h * 0.9, 14, cream);
  // Scattered glyph fields.
  for (let i = 0; i < 420; i++) {
    const cols = [cream, white, white, black, blue, teal, ochre];
    glyph(rnd() * w, h * 0.12 + rnd() * h * 0.78, 10 + rnd() * 22, cols[Math.floor(rnd() * cols.length)], Math.floor(rnd() * 4));
  }
  // Horizontal register bands framing the field.
  g.fillStyle = black;
  g.fillRect(0, h * 0.02, w, h * 0.035);
  g.fillRect(0, h * 0.955, w, h * 0.045);
  g.fillStyle = teal;
  g.fillRect(0, h * 0.055, w, 4);
  g.fillRect(0, h * 0.94, w, 4);
  grout(0.55);
  // Uplight falloff baked in: darker toward the top, hot at the base.
  const up = g.createLinearGradient(0, 0, 0, h);
  up.addColorStop(0, 'rgba(10,6,16,0.5)');
  up.addColorStop(0.45, 'rgba(10,6,16,0.12)');
  up.addColorStop(1, 'rgba(255,190,120,0.14)');
  g.fillStyle = up;
  g.fillRect(0, 0, w, h);
  grain(g, w, h, 14);
});

// Yellow full moon for the Torre shot: warm disc, faint maria, layered halo.
export const moonGlowTex = () => canvasTexture(128, 128, (g, w, h) => {
  const cx = w / 2, cy = h / 2;
  let halo = g.createRadialGradient(cx, cy, 6, cx, cy, w * 0.48);
  halo.addColorStop(0, 'rgba(255,224,150,0.5)');
  halo.addColorStop(0.35, 'rgba(255,214,140,0.16)');
  halo.addColorStop(1, 'rgba(255,214,140,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, w, h);
  halo = g.createRadialGradient(cx, cy, 2, cx, cy, w * 0.24);
  halo.addColorStop(0, 'rgba(255,240,200,0.95)');
  halo.addColorStop(0.7, 'rgba(255,230,170,0.55)');
  halo.addColorStop(1, 'rgba(255,230,170,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffdf9e';
  g.beginPath(); g.arc(cx, cy, w * 0.15, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(190,150,90,0.4)';
  for (const [dx, dy, r] of [[-4, -3, 3], [4, 2, 2.4], [0, 5, 2.8], [-2, -6, 1.8]]) {
    g.beginPath(); g.arc(cx + dx, cy + dy, r, 0, Math.PI * 2); g.fill();
  }
});

// Moonlit park path: pale lavender paving with slab joints and a soft sheen.
export const pathTex = () => canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#8f8ba4';
  g.fillRect(0, 0, w, h);
  blotch(g, w, h, '#7d79a0', 0.4, 8, 34);
  blotch(g, w, h, '#a8a4c0', 0.35, 6, 28);
  // Large slabs: 2x2 per repeat.
  g.fillStyle = 'rgba(40,36,60,0.7)';
  for (const B of [0, 128]) {
    g.fillRect(B - 2, 0, 4, h);
    g.fillRect(0, B - 2, w, 4);
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(230,226,245,${0.04 + rand() * 0.08})`;
    g.fillRect(rand() * w, rand() * h, 2 + rand() * 8, 1 + rand() * 3);
  }
  grime(g, w, h, { stain: 0.4, edge: 0.15, crack: 0.5, scratch: 0.2 });
  grain(g, w, h, 10);
});

// Dark earth/leaf litter for the park floor away from the path.
export const parkGroundTex = () => canvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#1c2418';
  g.fillRect(0, 0, w, h);
  blotch(g, w, h, '#26331f', 0.5, 12, 40);
  blotch(g, w, h, '#121a10', 0.5, 10, 44);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${50 + rand() * 40},${80 + rand() * 50},${36 + rand() * 30},${0.15 + rand() * 0.3})`;
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 2);
  }
  grain(g, w, h, 14);
});

// Cool glass-curtain facade for the towers behind the Ángel: dense blue/teal window grid.
export const glassTowerTex = (tint = '#7fd0e8', cols = 9, rows = 22) => canvasTexture(256, 512, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0d1424');
  grad.addColorStop(0.6, '#101a30');
  grad.addColorStop(1, '#0a0e1c');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const cw = w / cols, ch = h / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const r = rand();
      if (r < 0.3) continue;
      const warm = r > 0.86;
      g.fillStyle = warm ? `rgba(255,206,142,${0.4 + rand() * 0.5})` : tint;
      g.globalAlpha = 0.3 + rand() * 0.6;
      g.fillRect(x * cw + cw * 0.16, y * ch + ch * 0.2, cw * 0.68, ch * 0.5);
    }
  }
  g.globalAlpha = 1;
  // Floor lines.
  g.fillStyle = 'rgba(6,8,14,0.6)';
  for (let y = 0; y <= rows; y++) g.fillRect(0, y * ch - 0.5, w, 1.5);
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
