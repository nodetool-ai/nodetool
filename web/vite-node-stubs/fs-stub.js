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
export const writeFileSync = notInBrowser("writeFileSync");
export const openSync = notInBrowser("openSync");
export const writeSync = notInBrowser("writeSync");
export const createReadStream = notInBrowser("createReadStream");
export const createWriteStream = notInBrowser("createWriteStream");
export const cpSync = notInBrowser("cpSync");
export const unlinkSync = notInBrowser("unlinkSync");

export default {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  openSync,
  writeSync,
  createReadStream,
  createWriteStream,
  cpSync,
  unlinkSync
};
