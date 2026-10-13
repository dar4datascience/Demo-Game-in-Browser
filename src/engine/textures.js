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
