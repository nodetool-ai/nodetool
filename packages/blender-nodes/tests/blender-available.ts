/**
 * Synchronous Blender availability probe for the integration tests.
 *
 * The async `resolveBlenderBinary` actually runs `--version`; this runs no
 * child: `BLENDER_PATH` pointing at a file, an executable `blender` on
 * `PATH`, or a well-known install location. The suites skip on a negative,
 * the way `model3d-render.test.ts` skips without Chrome — and on a machine
 * with Blender installed (like this one) they run.
 */

import { existsSync } from "node:fs";
import path from "node:path";

const WELL_KNOWN = [
  "/Applications/Blender.app/Contents/MacOS/Blender",
  "/usr/bin/blender",
  "/snap/bin/blender"
];

function onPath(name: string): boolean {
  const pathEnv = process.env["PATH"] ?? "";
  return pathEnv.split(path.delimiter).some((dir) => {
    try {
      return dir !== "" && existsSync(path.join(dir, name));
    } catch {
      return false;
    }
  });
}

export function blenderAvailable(): boolean {
  const envPath = process.env["BLENDER_PATH"];
  if (envPath !== undefined && envPath !== "") return existsSync(envPath);
  if (process.platform === "win32") return onPath("blender.exe");
  if (onPath("blender")) return true;
  return WELL_KNOWN.some((candidate) => existsSync(candidate));
}
