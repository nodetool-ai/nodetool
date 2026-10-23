import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mergeDirectory, mergeManifests, parseManifest } from "../merge-mac-update-manifests.mjs";

// The latest-mac.yml that one two-arch macOS job published for v0.8.6.
const COMBINED = `version: 0.8.6
files:
  - url: Nodetool-0.8.6-x64.zip
    sha512: ZOyA==
    size: 489446326
  - url: Nodetool-0.8.6-arm64.zip
    sha512: dsb0==
    size: 472212469
  - url: Nodetool-0.8.6-x64.dmg
    sha512: 7Q/I==
    size: 502191685
  - url: Nodetool-0.8.6-arm64.dmg
    sha512: 6MUH==
    size: 484674224
path: Nodetool-0.8.6-x64.zip
sha512: ZOyA==
releaseDate: '2026-10-18T07:41:07.310Z'
`;

// What each single-arch job writes for the same release.
const X64 = `version: 0.8.6
files:
  - url: Nodetool-0.8.6-x64.zip
    sha512: ZOyA==
    size: 489446326
  - url: Nodetool-0.8.6-x64.dmg
    sha512: 7Q/I==
    size: 502191685
path: Nodetool-0.8.6-x64.zip
sha512: ZOyA==
releaseDate: '2026-10-18T07:41:07.310Z'
`;
const ARM64 = `version: 0.8.6
files:
  - url: Nodetool-0.8.6-arm64.zip
    sha512: dsb0==
    size: 472212469
  - url: Nodetool-0.8.6-arm64.dmg
    sha512: 6MUH==
    size: 484674224
path: Nodetool-0.8.6-arm64.zip
sha512: dsb0==
releaseDate: '2026-10-18T07:39:52.002Z'
`;

let dir;
afterEach(() => { if (dir) { rmSync(dir, { recursive: true, force: true }); } dir = undefined; });

describe("merge-mac-update-manifests", () => {
  it("rebuilds the manifest a single two-arch build wrote", () => {
    expect(mergeManifests({ x64: parseManifest(X64), arm64: parseManifest(ARM64) })).toBe(COMBINED);
  });

  it("writes the merged manifest per channel and removes the per-arch inputs", () => {
    dir = mkdtempSync(join(tmpdir(), "mac-manifests-"));
    writeFileSync(join(dir, "nightly-mac-x64.yml"), X64);
    writeFileSync(join(dir, "nightly-mac-arm64.yml"), ARM64);
    writeFileSync(join(dir, "nightly.yml"), "version: 0.8.6\n");
    mergeDirectory(dir);
    expect(readdirSync(dir).sort()).toEqual(["nightly-mac.yml", "nightly.yml"]);
    expect(readFileSync(join(dir, "nightly-mac.yml"), "utf8")).toBe(COMBINED);
  });

  it("refuses to publish a manifest that is missing one architecture", () => {
    dir = mkdtempSync(join(tmpdir(), "mac-manifests-"));
    writeFileSync(join(dir, "latest-mac-x64.yml"), X64);
    expect(() => mergeDirectory(dir)).toThrow("Missing arm64 macOS updater manifest");
    expect(existsSync(join(dir, "latest-mac.yml"))).toBe(false);
  });

  it("refuses manifests from different versions", () => {
    const stale = ARM64.replace("version: 0.8.6", "version: 0.8.5");
    expect(() => mergeManifests({ x64: parseManifest(X64), arm64: parseManifest(stale) })).toThrow("disagree on version");
  });

  it("fails when no per-arch manifest was downloaded", () => {
    dir = mkdtempSync(join(tmpdir(), "mac-manifests-"));
    expect(() => mergeDirectory(dir)).toThrow("No per-arch macOS updater manifests");
  });
});
