import { createHash } from "node:crypto";

/** Hashes the generated runtime files and templates, independently of a game's revision. */
export function gameBuildFingerprint(files: Readonly<Record<string, string | Uint8Array>>): string {
  const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path, content]) => [
    path, createHash("sha256").update(content).digest("hex")
  ]);
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}
