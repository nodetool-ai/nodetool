import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../smoke-release-updater-assets.mjs", import.meta.url));
const temporaryDirectories = [];
const VERSION = "0.9.0";

const sha512 = (content) => createHash("sha512").update(content).digest("base64");

function manifest(version, files, top = files[0]) {
  const entries = files
    .map((file) => `  - url: ${file.url}\n    sha512: ${file.sha512}\n    size: ${file.size}`)
    .join("\n");
  return `version: ${version}\nfiles:\n${entries}\npath: ${top.url}\nsha512: ${top.sha512}\nreleaseDate: '2026-10-17T00:00:00.000Z'\n`;
}

function releaseAssets() {
  const directory = mkdtempSync(join(tmpdir(), "updater-assets-"));
  temporaryDirectories.push(directory);
  const assets = {
    "latest.yml": [`Nodetool-Setup-${VERSION}.exe`],
    "latest-mac.yml": [`Nodetool-${VERSION}-x64.zip`, `Nodetool-${VERSION}-arm64.zip`],
    "latest-linux.yml": [`Nodetool-${VERSION}-x86_64.AppImage`],
  };
  const entries = {};
  for (const [manifestName, names] of Object.entries(assets)) {
    entries[manifestName] = names.map((name) => {
      const content = `artifact ${name}`;
      writeFileSync(join(directory, name), content);
      return { url: name, sha512: sha512(content), size: Buffer.byteLength(content) };
    });
    writeFileSync(join(directory, manifestName), manifest(VERSION, entries[manifestName]));
  }
  return { directory, entries };
}

function smoke(directory) {
  return spawnSync(process.execPath, [script, directory, VERSION, "stable"], { encoding: "utf8" });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("smoke-release-updater-assets", () => {
  it("passes when every manifest entry matches its asset", () => {
    const { directory } = releaseAssets();
    const result = smoke(directory);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Nodetool-${VERSION}-arm64.zip`);
  });

  it("fails when a files entry hash is stale although the top-level path matches", () => {
    const { directory, entries } = releaseAssets();
    const [x64, arm64] = entries["latest-mac.yml"];
    writeFileSync(
      join(directory, "latest-mac.yml"),
      manifest(VERSION, [x64, { ...arm64, sha512: sha512("unsigned build") }], x64),
    );
    const result = smoke(directory);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`files entry sha512 mismatch for Nodetool-${VERSION}-arm64.zip`);
  });

  it("fails when a files entry size is wrong", () => {
    const { directory, entries } = releaseAssets();
    const [installer] = entries["latest.yml"];
    writeFileSync(join(directory, "latest.yml"), manifest(VERSION, [{ ...installer, size: installer.size + 1 }]));
    const result = smoke(directory);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`files entry size mismatch for Nodetool-Setup-${VERSION}.exe`);
  });
});
