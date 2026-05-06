// Set timezone to UTC to ensure consistent test results
process.env.TZ = 'UTC';

// Note: React is imported via standard imports in test files.
// CJS mode in ts-jest handles the default export properly.

// Polyfill structuredClone for jsdom which does not expose it as a window global.
// structuredClone is a Node.js 17+ and modern-browser built-in; jsdom simply
// does not forward it to the window object. All paramOverrides values are
// JSON-serialisable (they originate from UI inputs), so JSON round-trip is a
// valid deep-clone strategy here.
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// Mock import.meta for Vite compatibility
global.import = {
  meta: {
    hot: undefined,
  },
};

// Mock canvas before jsdom requires it
const Module = require("module");
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  if (id === "canvas" || id.includes("canvas")) {
    return {
      createCanvas: () => ({
        getContext: () => ({
          fillRect: () => {},
          clearRect: () => {},
          getImageData: () => ({ data: new Uint8ClampedArray(4) }),
          putImageData: () => {},
          createImageData: () => ({ data: new Uint8ClampedArray(4) }),
          setTransform: () => {},
          drawImage: () => {},
          save: () => {},
          fillText: () => {},
          restore: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          closePath: () => {},
          stroke: () => {},
          translate: () => {},
          scale: () => {},
          rotate: () => {},
          arc: () => {},
          fill: () => {},
          measureText: () => ({ width: 0 }),
          transform: () => {},
          rect: () => {},
          clip: () => {}
        }),
        toBuffer: (callback) => callback(null, Buffer.from("")),
        width: 300,
        height: 150
      }),
      loadImage: () => Promise.resolve({}),
      Image: function() {}
    };
  }
  return originalRequire.apply(this, arguments);
};