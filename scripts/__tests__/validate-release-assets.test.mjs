import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../validate-release-assets.mjs", import.meta.url));
const temporaryDirectories = [];

const DESKTOP = [
  "latest.yml",
  "latest-mac.yml",
  "latest-linux.yml",
  "Nodetool-Setup-0.9.0.exe",
  "Nodetool-0.9.0-arm64.dmg",
  "Nodetool-0.9.0-arm64.zip",
  "Nodetool-0.9.0-x86_64.AppImage",
  "Nodetool-0.9.0-x86_64.flatpak",
  "Nodetool-0.9.0-arm64.dmg.blockmap",
  "nodetool-web-0.9.0.zip",
  "nodetool-0.9.0.mcpb",
];
const TIMELINE = ["", "with-server-"].flatMap((variant) => [
  `nodetool-timeline-${variant}0.9.0-macos-arm64.zip`,
  `nodetool-timeline-${variant}0.9.0-windows-x64.zip`,
  `nodetool-timeline-${variant}0.9.0-linux-x64.AppImage`,
]);

function validate(files, args = ["--with-timeline"]) {
  const directory = mkdtempSync(join(tmpdir(), "release-assets-"));
  temporaryDirectories.push(directory);
  for (const file of files) {
    writeFileSync(join(directory, file), "");
  }
  return spawnSync(process.execPath, [script, directory, "stable", ...args], { encoding: "utf8" });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("validate-release-assets", () => {
  it("passes with the desktop and native timeline assets", () => {
    const result = validate([...DESKTOP, ...TIMELINE]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("requires each native timeline download", () => {
    const result = validate([...DESKTOP, ...TIMELINE.filter((f) => f !== "nodetool-timeline-0.9.0-linux-x64.AppImage")]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Missing artifact types: native timeline linux-x64");
  });

  it("skips the native timeline without --with-timeline", () => {
    const result = validate(DESKTOP, []);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("does not count a timeline AppImage as the desktop AppImage", () => {
    const result = validate([...DESKTOP.filter((f) => !f.endsWith(".AppImage")), ...TIMELINE]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Missing artifact types: Linux AppImage");
  });
});
