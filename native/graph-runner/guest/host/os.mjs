// node:os for the guest. The run has no home or temp directory of its own:
// both are the workspace (`__host.files.cwd()`), or `/` without one, so
// `~` in a path names a file node code may reach, or one it is refused.
const workspace = () => globalThis.__host?.files?.cwd?.() || "/";

export const EOL = "\n";
export function homedir() {
  return workspace();
}
export function tmpdir() {
  return workspace();
}
export function platform() {
  return "linux";
}
export function type() {
  return "Linux";
}
export function hostname() {
  return "localhost";
}
export function endianness() {
  return "LE";
}

export default { EOL, homedir, tmpdir, platform, type, hostname, endianness };
