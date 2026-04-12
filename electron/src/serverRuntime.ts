import path from "path";

export function getDevServerCommand(
  rootDir: string,
  backendEntryPoint: string,
  nodePath?: string
): {
  command: string;
  args: string[];
} {
  if (process.platform === "win32") {
    return {
      command: nodePath ?? process.execPath,
      args: [path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs"), backendEntryPoint],
    };
  }

  return {
    command: path.join(rootDir, "node_modules", ".bin", "tsx"),
    args: [backendEntryPoint],
  };
}
