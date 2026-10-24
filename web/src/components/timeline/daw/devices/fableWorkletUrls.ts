/**
 * Served URLs of the FableSynth AudioWorklet processors. Kept in their own
 * module and loaded with `import()`, so Jest never parses `import.meta`.
 * Vite copies each `.js` file verbatim: the processors are plain scripts.
 */

export const FABLE_WORKLET_URLS = {
  pauto: new URL("./param-automation-worklet.js", import.meta.url).href,
  ott: new URL("../fablesynth/engine/ott-worklet.js", import.meta.url).href,
  lab: new URL("../fablesynth/engine/lab-worklet.js", import.meta.url).href,
  wt1: new URL("../fablesynth/engine/worklet.js", import.meta.url).href,
  bl1: new URL("../fablesynth/bass/engine/worklet-bass.js", import.meta.url).href,
  dr1: new URL("../fablesynth/drum/engine/worklet-drum.js", import.meta.url).href,
  master: new URL("../fablesynth/seq/master-worklet.js", import.meta.url).href,
  fx: new URL("../fablesynth/fx/fx-worklet.js", import.meta.url).href
} as const;

export type FableWorkletName = keyof typeof FABLE_WORKLET_URLS;
