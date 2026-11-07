// node:fs/promises for the guest: the promise half of fs.mjs.
import { promises } from "./fs.mjs";

export const {
  open,
  readFile,
  writeFile,
  appendFile,
  stat,
  lstat,
  readdir,
  mkdir,
  mkdtemp,
  rm,
  rmdir,
  unlink,
  rename,
  copyFile,
  realpath,
  access,
  constants
} = promises;
export default promises;
