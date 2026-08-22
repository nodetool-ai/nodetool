import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FIXTURES_DIR,
  generateFalFixtureOutputs,
  readFalGeneratorManifest
} from "../src/fixture-generate.js";

describe("FAL fixture-mode generation", () => {
  it("produces every output the generator manifest declares", async () => {
    const manifest = await readFalGeneratorManifest();
    expect(manifest.fixtures.length).toBeGreaterThan(0);
    expect(manifest.outputs.length).toBeGreaterThan(0);

    const files = await generateFalFixtureOutputs();
    expect([...files.keys()].sort()).toEqual(
      manifest.outputs.map((o) => o.path).sort()
    );
  });

  it("matches the checked-in expected outputs", async () => {
    const manifest = await readFalGeneratorManifest();
    const files = await generateFalFixtureOutputs();

    let compared = 0;
    for (const output of manifest.outputs) {
      const expected = await readFile(
        join(FIXTURES_DIR, "expected", output.path),
        "utf8"
      );
      expect(files.get(output.path), output.path).toBe(expected);
      compared++;
    }
    expect(compared).toBe(manifest.outputs.length);
  });

  it("is byte-stable across two runs", async () => {
    const first = await generateFalFixtureOutputs();
    const second = await generateFalFixtureOutputs();
    expect([...second.entries()]).toEqual([...first.entries()]);
  });

  it("fails when a declared schema fixture is absent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fal-fixture-"));
    await writeFile(
      join(dir, "generator-manifest.json"),
      JSON.stringify({
        provider: "fal",
        fixtures: [
          {
            endpointId: "fal-ai/flux/dev",
            module: "text_to_image",
            schema: "schemas/not-checked-in.json"
          }
        ],
        outputs: [{ path: "fal-manifest.json", kind: "static-metadata" }]
      })
    );

    await expect(generateFalFixtureOutputs(dir)).rejects.toThrow(
      /Missing schema fixture for fal-ai\/flux\/dev/
    );
  });

  it("fails when a fixture names an endpoint the module no longer configures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fal-fixture-"));
    const schemaRel = "schemas/flux-dev.json";
    await mkdir(dirname(join(dir, schemaRel)), { recursive: true });
    await writeFile(
      join(dir, schemaRel),
      await readFile(join(FIXTURES_DIR, "schemas/fal-ai_flux_dev.json"), "utf8")
    );
    await writeFile(
      join(dir, "generator-manifest.json"),
      JSON.stringify({
        provider: "fal",
        fixtures: [
          {
            endpointId: "fal-ai/flux/dev",
            module: "speech_to_text",
            schema: schemaRel
          }
        ],
        outputs: [{ path: "fal-manifest.json", kind: "static-metadata" }]
      })
    );

    await expect(generateFalFixtureOutputs(dir)).rejects.toThrow(
      /not configured in module "speech_to_text"/
    );
  });
});
