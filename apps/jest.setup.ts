import '@testing-library/jest-dom';

// Polyfill structuredClone for environments that don't have it
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = function structuredClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  };
}

// Polyfill TextEncoder/TextDecoder for jsdom environment
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const util = require('util');
  if (typeof globalThis.TextEncoder === 'undefined') {
    // @ts-ignore
    globalThis.TextEncoder = util.TextEncoder;
  }
  if (typeof globalThis.TextDecoder === 'undefined') {
    // @ts-ignore
    globalThis.TextDecoder = util.TextDecoder;
  }
} catch {
  // ignore if util import fails
}