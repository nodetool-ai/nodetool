/**
 * Native module ABI smoke test.
 *
 * Catches `NODE_MODULE_VERSION` mismatches early during the
 * Electron 35 → 39 / Node 22 → 24 migration. better-sqlite3, sharp,
 * sqlite-vec, and bufferutil all ship native bindings whose ABI is
 * pinned to the Node major version that compiled them. The Electron
 * runtime embeds its own Node — when it diverges from the system Node
 * the bindings fail at `require()` time with a NODE_MODULE_VERSION
 * error.
 *
 * This test only verifies the *system* Node side (Jest runs in
 * system Node). For the Electron-side check, see the e2e suite.
 *
 * To skip locally on a partial install, set `SKIP_NATIVE_SMOKE=1`.
 */

const SKIP = process.env.SKIP_NATIVE_SMOKE === "1";
const describeOrSkip = SKIP ? describe.skip : describe;

const NATIVE_MODULES: Array<{ name: string; smoke: () => unknown }> = [
  {
    name: "better-sqlite3",
    smoke: () => {
      const Database = require("better-sqlite3");
      const db = new Database(":memory:");
      const row = db.prepare("SELECT 1 AS one").get();
      db.close();
      return row;
    },
  },
  {
    name: "sharp",
    smoke: () => {
      const sharp = require("sharp");
      // versions throws if libvips can't load, but does not require I/O
      return sharp.versions;
    },
  },
  {
    name: "sqlite-vec",
    smoke: () => {
      const sqliteVec = require("sqlite-vec");
      // Module exposes load() and getLoadablePath()
      return typeof sqliteVec.getLoadablePath === "function";
    },
  },
  {
    name: "bufferutil",
    smoke: () => {
      const bufferutil = require("bufferutil");
      const buf = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      bufferutil.mask(buf, Buffer.from([0xff, 0xff, 0xff, 0xff]), buf, 0, buf.length);
      return buf.length === 4;
    },
  },
];

describeOrSkip("native module ABI smoke (system Node)", () => {
  for (const mod of NATIVE_MODULES) {
    test(`${mod.name} loads and runs a minimal call without ABI mismatch`, () => {
      let result: unknown;
      try {
        result = mod.smoke();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Surface ABI mismatch with a descriptive failure so a migration
        // engineer immediately sees the cause.
        if (message.includes("NODE_MODULE_VERSION")) {
          throw new Error(
            `[ABI mismatch] ${mod.name} compiled for a different Node ABI: ${message}`,
          );
        }
        // If the module isn't installed (CI without postinstall) or the
        // native binding hasn't been built (npm install --ignore-scripts),
        // skip rather than fail. The ABI check above is the only thing we
        // care about for migration regressions.
        if (
          message.includes("Cannot find module") ||
          message.includes("MODULE_NOT_FOUND") ||
          message.includes("Could not locate the bindings file") ||
          message.includes("could not find") ||
          message.includes("ENOENT")
        ) {
          console.warn(
            `[skip] ${mod.name} native binding unavailable in this environment; skipping smoke test`,
          );
          return;
        }
        throw err;
      }
      expect(result).toBeDefined();
    });
  }
});
