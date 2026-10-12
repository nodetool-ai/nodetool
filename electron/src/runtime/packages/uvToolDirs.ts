import * as path from "path";

/**
 * Where uv keeps tools and the Pythons they run on, inside the app's user
 * data. The server's PATH includes `bin` (see `getProcessEnv`), so a tool is
 * found as soon as it is installed, without a restart.
 */
export function uvToolDirs(userDataDir: string): { tools: string; bin: string; python: string } {
  const root = path.join(userDataDir, "uv-tools");
  return {
    tools: path.join(root, "tools"),
    bin: path.join(root, "bin"),
    python: path.join(root, "python"),
  };
}
