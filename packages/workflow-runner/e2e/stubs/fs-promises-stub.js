// Browser-safe `node:fs/promises` substitute. Every export is a thrower
// — workspace modules destructure these at top level but the
// browser-tagged execution path never invokes them.
function makeThrower(name) {
  return (...args) => {
    throw new Error(
      `Stubbed fs/promises.${name} called from a browser bundle: ` +
        `args=${JSON.stringify(args).slice(0, 120)}`
    );
  };
}

export const readFile = makeThrower("readFile");
export const writeFile = makeThrower("writeFile");
export const mkdir = makeThrower("mkdir");
export const readdir = makeThrower("readdir");
export const stat = makeThrower("stat");
export const access = makeThrower("access");
export const copyFile = makeThrower("copyFile");
export const unlink = makeThrower("unlink");
export const rm = makeThrower("rm");
export const rename = makeThrower("rename");
export const open = makeThrower("open");
export const chmod = makeThrower("chmod");
export const lstat = makeThrower("lstat");
export const realpath = makeThrower("realpath");
export const symlink = makeThrower("symlink");
export const readlink = makeThrower("readlink");
export const utimes = makeThrower("utimes");
export const truncate = makeThrower("truncate");
export const rmdir = makeThrower("rmdir");

export default {
  readFile,
  writeFile,
  mkdir,
  readdir,
  stat,
  access,
  copyFile,
  unlink,
  rm,
  rename,
  open,
  chmod,
  lstat,
  realpath,
  symlink,
  readlink,
  utimes,
  truncate,
  rmdir
};
