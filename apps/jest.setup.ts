import '@testing-library/jest-dom';

// Polyfill structuredClone for environments that don't have it
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = function structuredClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  };
}