/**
 * Built-in pack enable/disable persistence.
 *
 * The module reads/writes `disabledBuiltins` in the packs config file shared
 * with the backend pack loader, so these tests pin: defaults (everything
 * enabled), round-tripping a toggle, preservation of unrelated config keys,
 * and the guards (unknown id, required pack).
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listBuiltinPacks, setBuiltinPackEnabled } from "../builtinPacks";

describe("builtinPacks", () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nodetool-builtin-packs-"));
    configPath = join(dir, "packs.json");
    process.env.NODETOOL_PACKS_CONFIG = configPath;
  });

  afterEach(() => {
    delete process.env.NODETOOL_PACKS_CONFIG;
    rmSync(dir, { recursive: true, force: true });
  });

  test("all packs enabled by default when no config file exists", () => {
    const packs = listBuiltinPacks();
    expect(packs.length).toBeGreaterThan(0);
    expect(packs.every((p) => p.enabled)).toBe(true);
    const base = packs.find((p) => p.id === "base");
    expect(base?.required).toBe(true);
  });

  test("disabling a pack persists and round-trips", () => {
    const updated = setBuiltinPackEnabled("fal", false);
    expect(updated.find((p) => p.id === "fal")?.enabled).toBe(false);

    // Fresh read sees the same state.
    expect(listBuiltinPacks().find((p) => p.id === "fal")?.enabled).toBe(false);

    const reEnabled = setBuiltinPackEnabled("fal", true);
    expect(reEnabled.find((p) => p.id === "fal")?.enabled).toBe(true);
    expect(listBuiltinPacks().every((p) => p.enabled)).toBe(true);
  });

  test("preserves unrelated keys in the shared packs config file", () => {
    writeFileSync(
      configPath,
      JSON.stringify({ allow: ["@acme/cool-nodes"], allowUnlisted: false }),
      "utf8",
    );

    setBuiltinPackEnabled("replicate", false);

    const config = JSON.parse(readFileSync(configPath, "utf8"));
    expect(config.allow).toEqual(["@acme/cool-nodes"]);
    expect(config.allowUnlisted).toBe(false);
    expect(config.disabledBuiltins).toEqual(["replicate"]);
  });

  test("rejects unknown pack ids", () => {
    expect(() => setBuiltinPackEnabled("nope", false)).toThrow(
      /Unknown built-in pack/,
    );
  });

  test("required packs cannot be disabled", () => {
    expect(() => setBuiltinPackEnabled("base", false)).toThrow(
      /cannot be disabled/,
    );
  });

  test("tolerates a corrupt config file", () => {
    writeFileSync(configPath, "not json", "utf8");
    expect(listBuiltinPacks().every((p) => p.enabled)).toBe(true);
    const updated = setBuiltinPackEnabled("kie", false);
    expect(updated.find((p) => p.id === "kie")?.enabled).toBe(false);
  });
});
