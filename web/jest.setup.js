// Set timezone to UTC to ensure consistent test results
process.env.TZ = 'UTC';

// Mock crypto.randomUUID for tests that need it
if (typeof crypto === 'undefined') {
  global.crypto = {
    randomUUID: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    })
  };
} else if (!crypto.randomUUID) {
  crypto.randomUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

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