/**
 * Built-in pack enable/disable persistence.
 *
 * Built-in packs are opt-in: only `required` / `defaultEnabled` packs are on
 * after a fresh install. The module reads/writes `enabledBuiltins` /
 * `disabledBuiltins` in the packs config file shared with the backend pack
 * loader, so these tests pin: install defaults, round-tripping overrides in
 * both directions, preservation of unrelated config keys, and the guards
 * (unknown id, required pack).
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

  test("only required and default-enabled packs are on after a fresh install", () => {
    const packs = listBuiltinPacks();
    const byId = new Map(packs.map((p) => [p.id, p]));

    expect(byId.get("base")).toMatchObject({ enabled: true, required: true });
    // The essentials ship enabled…
    for (const id of ["fal", "replicate", "huggingface"]) {
      expect(byId.get(id)?.enabled).toBe(true);
    }
    // …everything else is opt-in.
    for (const id of ["elevenlabs", "minimax", "kie", "topaz", "reve"]) {
      expect(byId.get(id)?.enabled).toBe(false);
    }
  });

  test("enabling an opt-in pack persists and round-trips", () => {
    const updated = setBuiltinPackEnabled("kie", true);
    expect(updated.find((p) => p.id === "kie")?.enabled).toBe(true);

    // Fresh read sees the same state.
    expect(listBuiltinPacks().find((p) => p.id === "kie")?.enabled).toBe(true);

    const reverted = setBuiltinPackEnabled("kie", false);
    expect(reverted.find((p) => p.id === "kie")?.enabled).toBe(false);
  });

  test("disabling a default-enabled pack persists", () => {
    const updated = setBuiltinPackEnabled("fal", false);
    expect(updated.find((p) => p.id === "fal")?.enabled).toBe(false);
    expect(listBuiltinPacks().find((p) => p.id === "fal")?.enabled).toBe(false);
  });

  test("preserves unrelated keys in the shared packs config file", () => {
    writeFileSync(
      configPath,
      JSON.stringify({ allow: ["@acme/cool-nodes"], allowUnlisted: false }),
      "utf8",
    );

    setBuiltinPackEnabled("replicate", false);
    setBuiltinPackEnabled("kie", true);

    const config = JSON.parse(readFileSync(configPath, "utf8"));
    expect(config.allow).toEqual(["@acme/cool-nodes"]);
    expect(config.allowUnlisted).toBe(false);
    expect(config.disabledBuiltins).toEqual(["replicate"]);
    expect(config.enabledBuiltins).toEqual(["kie"]);
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
    expect(listBuiltinPacks().find((p) => p.id === "base")?.enabled).toBe(true);
    const updated = setBuiltinPackEnabled("kie", true);
    expect(updated.find((p) => p.id === "kie")?.enabled).toBe(true);
  });
});
