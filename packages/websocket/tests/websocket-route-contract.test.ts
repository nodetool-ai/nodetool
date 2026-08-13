import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));

function listTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory()
      ? listTypeScriptFiles(path)
      : extname(entry.name) === ".ts"
        ? [path]
        : [];
  });
}

describe("WebSocket route contract", () => {
  it("registers only the supported socket paths", () => {
    const files = listTypeScriptFiles(sourceRoot);
    const registrations = files.flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(
        /\b(?:app|instance)\.get\(\s*"([^"]+)"\s*,\s*\{\s*websocket:\s*true/g
      )].map((match) => ({ file, path: match[1] }))
    );
    const paths = registrations.map((route) => route.path);

    expect(files.length).toBeGreaterThan(0);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths).toEqual(["/ws", "/ws/extension", "/ws/download"]);
    expect(paths).not.toContain("/ws/agent");
    expect(registrations.every((route) => dirname(route.file).startsWith(sourceRoot))).toBe(
      true
    );
  });
});
