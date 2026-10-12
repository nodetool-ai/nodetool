// The MP3 encoder's package entry is ESM-only, which Jest does not transform.
// Its IIFE bundle is CommonJS-compatible but reads mediabunny from a global, so
// this shim provides that global and tests encode with the real LAME build.
globalThis.Mediabunny = require("mediabunny");
module.exports = require("../../node_modules/@mediabunny/mp3-encoder/dist/bundles/mediabunny-mp3-encoder.js");
