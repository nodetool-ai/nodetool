import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FIXTURES_DIR,
  generateKieFixtureOutputs,
  readKieGeneratorManifest
} from "../src/fixture-generate.js";

async function copyFixtureBase(dir: string): Promise<void> {
  const manifest = await readKieGeneratorManifest();
  await writeFile(
    join(dir, "llms.txt"),
    await readFile(join(FIXTURES_DIR, manifest.llms), "utf8")
  );
}

describe("KIE fixture-mode generation", () => {
  it("produces every output the generator manifest declares", async () => {
    const manifest = await readKieGeneratorManifest();
    expect(manifest.fixtures.length).toBeGreaterThan(0);
    expect(manifest.outputs.length).toBeGreaterThan(0);

    const files = await generateKieFixtureOutputs();
    expect([...files.keys()].sort()).toEqual(
      manifest.outputs.map((o) => o.path).sort()
    );
  });

  it("matches the checked-in expected outputs", async () => {
    const manifest = await readKieGeneratorManifest();
    const files = await generateKieFixtureOutputs();

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
    const first = await generateKieFixtureOutputs();
    const second = await generateKieFixtureOutputs();
    expect([...second.entries()]).toEqual([...first.entries()]);
  });

  it("fails when a declared docs fixture is absent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kie-fixture-"));
    await copyFixtureBase(dir);
    const manifest = await readKieGeneratorManifest();
    await writeFile(
      join(dir, "generator-manifest.json"),
      JSON.stringify({
        provider: "kie",
        llms: "llms.txt",
        fixtures: [{ url: manifest.fixtures[0].url, doc: "docs/absent.md" }],
        outputs: [{ path: "kie-manifest.json", kind: "static-metadata" }]
      })
    );

    await expect(generateKieFixtureOutputs(dir)).rejects.toThrow(
      /Missing docs fixture/
    );
  });

  it("fails when a declared URL is not listed in the llms.txt snapshot", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kie-fixture-"));
    await copyFixtureBase(dir);
    const docRel = "docs/page.md";
    await mkdir(dirname(join(dir, docRel)), { recursive: true });
    await writeFile(join(dir, docRel), "# nothing\n");
    await writeFile(
      join(dir, "generator-manifest.json"),
      JSON.stringify({
        provider: "kie",
        llms: "llms.txt",
        fixtures: [
          { url: "https://docs.kie.ai/market/never/listed.md", doc: docRel }
        ],
        outputs: [{ path: "kie-manifest.json", kind: "static-metadata" }]
      })
    );

    await expect(generateKieFixtureOutputs(dir)).rejects.toThrow(
      /is not listed in the checked-in llms\.txt/
    );
  });
});
