// Minimal DOM canvas stand-in so procedural textures (and therefore whole levels) build in Node.
// Drawing calls are no-ops; pixel buffers are real so grain/noise loops run normally.
function createContext2d() {
  const state = {};
  const imageData = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
  const methods = {
    getImageData: (x, y, w, h) => imageData(w, h),
    createImageData: (w, h) => imageData(w, h),
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: (text) => ({ width: String(text).length * 6 }),
  };
  return new Proxy(state, {
    get: (target, prop) => (prop in methods ? methods[prop] : prop in target ? target[prop] : () => {}),
    set: (target, prop, value) => {
      target[prop] = value;
      return true;
    },
  });
}

globalThis.document ??= {
  createElement: (tag) => {
    if (tag !== 'canvas') throw new Error(`test DOM stub only supports <canvas>, got <${tag}>`);
    return { width: 300, height: 150, style: {}, getContext: () => createContext2d() };
  },
};
