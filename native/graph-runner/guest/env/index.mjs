import "../host/media-native-bootstrap.mjs";
import "./webassembly.mjs";
// The JavaScript environment node code expects beyond what QuickJS-ng
// provides, installed as globals before any other module of the guest runs
// (entry.mjs imports this first). QuickJS-ng itself supplies queueMicrotask,
// performance, WeakRef, DOMException, atob and btoa.
//
//   setTimeout, setInterval, setImmediate and their clear functions
//                    guest/host/timers.mjs, on the "timers" capability
//   Intl             ICU-backed formatting and collation in env/icu.mjs
//   structuredClone  guest/env/structured-clone.mjs
//
// Process is virtual. Its empty versions object avoids claiming a Node runtime.
import { randomUUID } from "../host/crypto.mjs";
import { installIcu } from "./icu.mjs";
import "./url.mjs";
import { installProcess } from "../host/process.mjs";
import { installCanvasGlobals } from "../host/canvas.mjs";
import { installIntl } from "./intl.mjs";
import { installStructuredClone } from "./structured-clone.mjs";
import * as timers from "../host/timers.mjs";

for (const name of ["setTimeout", "setInterval", "setImmediate", "clearTimeout", "clearInterval", "clearImmediate"]) {
  if (typeof globalThis[name] !== "function") {
    Object.defineProperty(globalThis, name, { value: timers[name], writable: true, configurable: true, enumerable: true });
  }
}
installIntl(globalThis);
installStructuredClone(globalThis);

installProcess(globalThis);
installIcu(globalThis);
installCanvasGlobals(globalThis);

// Timeline document factories use Web Crypto UUIDs, backed by native entropy.
globalThis.crypto ??= { randomUUID };
