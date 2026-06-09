// Browser stub for `node:child_process`. Named throwers so the bundler can
// resolve the destructured imports used across the workspace (`exec`,
// `spawn`, …); browser-tagged execution never invokes them.
function notInBrowser(name) {
  return () => {
    throw new Error(`node:child_process.${name} not available in browser`);
  };
}

export const exec = notInBrowser("exec");
export const execFile = notInBrowser("execFile");
export const execSync = notInBrowser("execSync");
export const execFileSync = notInBrowser("execFileSync");
export const spawn = notInBrowser("spawn");
export const spawnSync = notInBrowser("spawnSync");
export const fork = notInBrowser("fork");

export default {
  exec,
  execFile,
  execSync,
  execFileSync,
  spawn,
  spawnSync,
  fork
};
