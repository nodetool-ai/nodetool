import path from "path";

export function getDevServerCommand(
  rootDir: string,
  backendEntryPoint: string,
  _nodePath?: string
): {
  command: string;
  args: string[];
} {
  // Always use the running Electron binary as Node (ELECTRON_RUN_AS_NODE=1 is
  // set in backendEnv by the caller). This ensures the dev server uses the
  // same Node ABI as Electron, matching what electron-builder install-app-deps
  // compiles native modules for — no more ABI mismatch regardless of system node.
  return {
    command: process.execPath,
    args: [path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs"), backendEntryPoint],
  };
}
