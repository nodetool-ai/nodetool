import { mkdtemp, mkdir, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseNpmPidMarker, setupPackRegistry, disposePackRegistryFixtures } from "../_helpers/pack-registry.js";
import { snapshotInstallTree } from "../../src/packs/install-tree.js";

afterEach(async () => { vi.unstubAllEnvs(); await disposePackRegistryFixtures(); });

describe("npm subprocess markers", () => {
  it("waits for every PID digit before accepting a fragmented stdout line", () => {
    let output = "NPM_PID=123";
    expect(parseNpmPidMarker(output)).toBeNull();
    output += "45\n";
    expect(parseNpmPidMarker(output)).toBe(12345);
  });

  it("accepts Windows line endings and rejects embedded or unterminated markers", () => {
    expect(parseNpmPidMarker("status\r\nNPM_PID=12345\r\n")).toBe(12345);
    expect(parseNpmPidMarker("not-NPM_PID=12345\n")).toBeNull();
    expect(parseNpmPidMarker("NPM_PID=12345")).toBeNull();
  });
});

it("uses canonical fixture paths when the OS temporary directory has a symlink ancestor", async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "npm-fixture-ancestor-")));
  const physical = join(parent, "physical");
  const alias = join(parent, "alias");
  await mkdir(physical);
  await symlink(physical, alias, "junction");
  for (const key of ["TMPDIR", "TEMP", "TMP"]) { vi.stubEnv(key, alias); }
  try {
    const fixture = await setupPackRegistry();
    expect(fixture.directory).toBe(await realpath(fixture.directory));
    expect((await snapshotInstallTree(fixture.root)).map(entry => entry.name)).toContain("fixture-baseline");
  } finally {
    await disposePackRegistryFixtures();
    await rm(parent, { recursive: true, force: true });
  }
}, 30_000);
