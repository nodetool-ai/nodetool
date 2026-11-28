/**
 * The 5.2 version floor (C2): a 4.2 binary is refused with a message naming
 * both versions, and a 5.2 binary resolves.
 *
 * The ops use `scene.compositing_node_group` and
 * `image_settings.media_type`, neither of which exists on 4.2, so the old
 * 4.2 floor promised what the code could not run. These tests pin the floor
 * with fake `blender --version` scripts — no Blender needed.
 */

import { existsSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { missingRuntimePackageOf } from "@nodetool-ai/protocol";

import {
  BLENDER_MIN_VERSION,
  BlenderVersionError,
  resetBlenderBinaryCache,
  resolveBlenderBinary
} from "../src/blender-binary.js";

let savedEnv: string | undefined;
let dir: string;

function fakeBlender(version: string): string {
  const path = join(dir, `blender-${version.replace(/\./g, "_")}`);
  writeFileSync(
    path,
    `#!/bin/sh\necho "Blender ${version} (hash deadbeef built 2026-01-01 00:00:00)"\n`
  );
  chmodSync(path, 0o755);
  return path;
}

beforeEach(() => {
  savedEnv = process.env["BLENDER_PATH"];
  dir = mkdtempSync(join(tmpdir(), "nodetool-blender-binary-"));
  resetBlenderBinaryCache();
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env["BLENDER_PATH"];
  else process.env["BLENDER_PATH"] = savedEnv;
  resetBlenderBinaryCache();
  rmSync(dir, { recursive: true, force: true });
});

describe("Blender version floor", () => {
  it("is 5.2", () => {
    expect([...BLENDER_MIN_VERSION]).toEqual([5, 2, 0]);
  });

  it("resolves a 5.2 binary", async () => {
    process.env["BLENDER_PATH"] = fakeBlender("5.2.1");
    const binary = await resolveBlenderBinary();
    expect(binary.version).toEqual([5, 2, 1]);
  });

  it("resolves a configured path without changing the process environment", async () => {
    delete process.env["BLENDER_PATH"];
    const configuredPath = fakeBlender("5.2.1");
    const binary = await resolveBlenderBinary({ configuredPath });
    expect(binary.path).toBe(configuredPath);
    expect(process.env["BLENDER_PATH"]).toBeUndefined();
  });

  it("refuses a 4.2 binary, naming the found version and the floor", async () => {
    process.env["BLENDER_PATH"] = fakeBlender("4.2.3");
    const err = await resolveBlenderBinary().then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlenderVersionError);
    expect((err as BlenderVersionError).found).toBe("4.2.3");
    expect((err as BlenderVersionError).minimum).toBe("5.2.0");
    expect((err as Error).message).toContain("4.2.3");
    expect((err as Error).message).toContain("5.2.0");
  });
});

describe("Package Manager Blender", () => {
  const saved: Record<string, string | undefined> = {};
  const keys = ["PATH", "XDG_DATA_HOME", "NODETOOL_HOST"] as const;

  beforeEach(() => {
    for (const key of keys) saved[key] = process.env[key];
    delete process.env["BLENDER_PATH"];
    process.env["NODETOOL_HOST"] = "cli";
    process.env["XDG_DATA_HOME"] = join(dir, "data");
    // No Blender on PATH, so only the managed install can resolve.
    process.env["PATH"] = join(dir, "empty-bin");
  });

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it.skipIf(process.platform !== "linux")(
    "resolves the Blender the Package Manager unpacked",
    async () => {
      const installDir = join(dir, "data", "nodetool", "blender");
      mkdirSync(installDir, { recursive: true });
      const binary = join(installDir, "blender");
      writeFileSync(binary, `#!/bin/sh\necho "Blender 5.2.3 (hash deadbeef)"\n`);
      chmodSync(binary, 0o755);
      writeFileSync(join(installDir, "nodetool-runtime.json"), JSON.stringify({ version: "5.2.3" }));

      const resolved = await resolveBlenderBinary();
      expect(resolved.path).toBe(binary);
      expect(resolved.version).toEqual([5, 2, 3]);
    }
  );

  // A machine with Blender at a well-known path (CI installs one) resolves it.
  it.skipIf(
    process.platform !== "linux" || existsSync("/usr/bin/blender") || existsSync("/snap/bin/blender")
  )(
    "names the blender runtime package when nothing is installed",
    async () => {
      const err = await resolveBlenderBinary().then(
        () => null,
        (e: unknown) => e
      );
      expect(missingRuntimePackageOf(err)).toBe("blender");
      expect((err as Error).message).toContain("nodetool runtime add blender");
    }
  );
});
