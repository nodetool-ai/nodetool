// Minimal browser stub for `node:os`.
export function homedir() {
  return "/home/browser";
}
export function tmpdir() {
  return "/tmp";
}
export function platform() {
  return "browser";
}
export function arch() {
  return "wasm";
}
export function availableParallelism() {
  return typeof navigator !== "undefined" && navigator.hardwareConcurrency
    ? navigator.hardwareConcurrency
    : 1;
}
export function cpus() {
  return [];
}
export const EOL = "\n";

export default { homedir, tmpdir, platform, arch, availableParallelism, cpus, EOL };
