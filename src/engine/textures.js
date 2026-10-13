import * as THREE from 'three';

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
