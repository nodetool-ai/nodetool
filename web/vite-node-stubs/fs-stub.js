// Minimal browser stub for `node:fs`. Throws on use; browser-tagged
// code must not call these. Exports are named to match destructured
// imports we see in the workspace bundles.
function notInBrowser(name) {
  return () => {
    throw new Error(`node:fs.${name} not available in browser`);
  };
}

export const existsSync = notInBrowser("existsSync");
export const mkdirSync = notInBrowser("mkdirSync");
export const readdirSync = notInBrowser("readdirSync");
export const readFileSync = notInBrowser("readFileSync");
export const statSync = notInBrowser("statSync");
export const lstatSync = notInBrowser("lstatSync");
export const realpathSync = notInBrowser("realpathSync");
export const accessSync = notInBrowser("accessSync");
export const writeFileSync = notInBrowser("writeFileSync");
export const openSync = notInBrowser("openSync");
export const writeSync = notInBrowser("writeSync");
export const readSync = notInBrowser("readSync");
export const closeSync = notInBrowser("closeSync");
export const createReadStream = notInBrowser("createReadStream");
export const createWriteStream = notInBrowser("createWriteStream");
export const cpSync = notInBrowser("cpSync");
export const unlinkSync = notInBrowser("unlinkSync");
export const rmSync = notInBrowser("rmSync");
export const mkdtempSync = notInBrowser("mkdtempSync");

// `constants` is data, not behavior — `accessSync(p, constants.R_OK)` reads it
// before it ever calls, so a throwing stub would break at the wrong moment.
// These are the POSIX values Node exposes.
export const constants = { F_OK: 0, X_OK: 1, W_OK: 2, R_OK: 4 };

// `import { promises as fs } from "node:fs"` — async API surface. Methods
// reject (browser-tagged code must never call them); the object exists so the
// named import resolves at bundle time.
const rejectInBrowser = (name) => () =>
  Promise.reject(new Error(`node:fs.promises.${name} not available in browser`));
export const promises = {
  readFile: rejectInBrowser("readFile"),
  writeFile: rejectInBrowser("writeFile"),
  mkdir: rejectInBrowser("mkdir"),
  readdir: rejectInBrowser("readdir"),
  stat: rejectInBrowser("stat"),
  unlink: rejectInBrowser("unlink"),
  cp: rejectInBrowser("cp"),
  rm: rejectInBrowser("rm")
};

export default {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  lstatSync,
  realpathSync,
  accessSync,
  writeFileSync,
  openSync,
  writeSync,
  readSync,
  closeSync,
  createReadStream,
  createWriteStream,
  cpSync,
  unlinkSync,
  rmSync,
  mkdtempSync,
  constants,
  promises
};
