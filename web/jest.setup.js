// Set timezone to UTC to ensure consistent test results
process.env.TZ = 'UTC';

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

// Mock crypto.randomUUID for NodeTemplatesStore tests
// This must be done before any module imports that use crypto
let uuidCallCount = 0;

Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => {
      uuidCallCount++;
      return `mock-uuid-${Date.now()}-${uuidCallCount}-${Math.random().toString(36).substring(2, 15)}`;
    }
  },
  writable: true,
  configurable: true
});

// Expose uuidCallCount for tests to reset
global.__TEST_UUID_CALL_COUNT = uuidCallCount;