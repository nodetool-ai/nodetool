import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exampleProviders, readExamples, UNSET_MODEL } from "../src/commands/examples.js";

describe("workflow examples", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("names the provider, an unset model, or nothing", () => {
    expect(exampleProviders([{ type: "nodetool.text.Template" }])).toEqual([]);
    expect(exampleProviders([{ type: "fal.text_to_image.FluxSchnell" }])).toEqual(["fal"]);
    expect(
      exampleProviders([{ type: "nodetool.agents.Agent", data: { model: { type: "language_model", provider: "" } } }])
    ).toEqual([UNSET_MODEL]);
    expect(
      exampleProviders([{ type: "nodetool.agents.Agent", data: { model: { type: "language_model", provider: "openai" } } }])
    ).toEqual(["openai"]);
  });

  it("reads example files and skips the ones that do not parse", () => {
    const dir = mkdtempSync(join(tmpdir(), "nodetool-examples-"));
    dirs.push(dir);
    writeFileSync(join(dir, "a.json"), JSON.stringify({ name: "Alpha", tags: ["example", "image"], graph: { nodes: [] } }));
    writeFileSync(join(dir, "b.json"), "not json");
    expect(readExamples(dir)).toEqual([
      { name: "Alpha", description: "", tags: ["image"], providers: [], file: "a.json" }
    ]);
  });
});
