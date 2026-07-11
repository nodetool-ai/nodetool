import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import {
  resolveExtensionDist,
  zipExtensionDist
} from "../src/lib/extension-dist.js";

const ENV_KEY = "NODETOOL_EXTENSION_DIST";

/** Build a fake extension dist dir with a manifest and a nested asset. */
function makeBuild(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nt-ext-"));
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({ name: "ext", version: "1.0" }),
    "utf8"
  );
  fs.writeFileSync(path.join(dir, "background.js"), "console.log(1)", "utf8");
  const sub = path.join(dir, "icons");
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(sub, "icon.png"), "PNGDATA", "utf8");
  return dir;
}

describe("resolveExtensionDist", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[ENV_KEY];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it("returns the env dir when it holds a valid build", () => {
    const dir = makeBuild();
    process.env[ENV_KEY] = dir;
    const info = resolveExtensionDist();
    expect(info.exists).toBe(true);
    expect(info.path).toBe(dir);
  });

  it("reports not-found when the env dir has no manifest.json", () => {
    // A dir without manifest.json is not a valid build, and no chrome-extension/
    // dist/manifest.json exists in the repo tree, so findUp also returns null.
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "nt-ext-empty-"));
    process.env[ENV_KEY] = empty;
    const info = resolveExtensionDist();
    expect(info.exists).toBe(false);
    // Falls back to `env ?? ""` — the (invalid) env path is preserved.
    expect(info.path).toBe(empty);
  });

  it("returns an empty path when the env var is unset and no build exists", () => {
    delete process.env[ENV_KEY];
    const info = resolveExtensionDist();
    expect(info.exists).toBe(false);
    expect(info.path).toBe("");
  });

  it("treats an env dir whose manifest is missing as not a build", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nt-ext-partial-"));
    fs.writeFileSync(path.join(dir, "background.js"), "x", "utf8");
    process.env[ENV_KEY] = dir;
    expect(resolveExtensionDist().exists).toBe(false);
  });
});

describe("zipExtensionDist", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[ENV_KEY];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it("throws when no build is found", async () => {
    delete process.env[ENV_KEY];
    await expect(zipExtensionDist()).rejects.toThrow("Extension build not found");
  });

  it("zips all files, recursing into subdirectories", async () => {
    const dir = makeBuild();
    process.env[ENV_KEY] = dir;

    const buf = await zipExtensionDist();
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(0);

    const unzipped = unzipSync(new Uint8Array(buf));
    // Flat top-level file, and the nested icon uses a forward-slash rel path.
    expect(Object.keys(unzipped).sort()).toEqual([
      "background.js",
      "icons/icon.png",
      "manifest.json"
    ]);
    expect(strFromU8(unzipped["manifest.json"])).toContain('"name":"ext"');
    expect(strFromU8(unzipped["icons/icon.png"])).toBe("PNGDATA");
  });
});
