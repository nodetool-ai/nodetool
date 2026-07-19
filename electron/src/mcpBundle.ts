import * as path from "path";
import * as fs from "fs";
import { app, shell } from "electron";
import { logMessage } from "./logger";
import type { McpBundleInstallResult } from "./types.d";

/**
 * Path to the NodeTool MCP bundle (`nodetool.mcpb`) shipped with the app.
 *
 * Packaged builds carry it as an extra resource (see electron-builder.json).
 * In dev it resolves to the repo's `dist/nodetool.mcpb`, which `npm run
 * build:mcpb` (or the electron `prepare-mcpb` script) produces.
 */
export function getMcpBundlePath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "mcpb", "nodetool.mcpb")
    : path.join(__dirname, "..", "..", "dist", "nodetool.mcpb");
}

/**
 * Hand the bundled `.mcpb` to the OS so Claude Desktop can install it.
 *
 * Opening the file with its default handler triggers Claude Desktop's
 * extension-install dialog. When no handler is registered (Claude Desktop not
 * installed), fall back to revealing the file so the user can drag it in
 * manually.
 */
export async function installMcpBundle(): Promise<McpBundleInstallResult> {
  const bundlePath = getMcpBundlePath();
  if (!fs.existsSync(bundlePath)) {
    logMessage(`MCP bundle not found at ${bundlePath}`, "warn");
    return {
      ok: false,
      opened: false,
      revealed: false,
      path: bundlePath,
      error: "MCP bundle is not available in this build."
    };
  }

  const openError = await shell.openPath(bundlePath);
  if (!openError) {
    logMessage(`Opened MCP bundle for install: ${bundlePath}`);
    return { ok: true, opened: true, revealed: false, path: bundlePath };
  }

  logMessage(
    `No handler for .mcpb (${openError}); revealing ${bundlePath} instead`,
    "warn"
  );
  shell.showItemInFolder(bundlePath);
  return {
    ok: true,
    opened: false,
    revealed: true,
    path: bundlePath,
    error: openError
  };
}
