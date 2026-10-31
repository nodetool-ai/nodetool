import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/index.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const scriptPath = `${repoRoot}scripts/presets/sync-effects-template.mjs`;

interface SyncModule {
  effectOptions(catalog: readonly unknown[]): string[];
  syncTemplate(template: unknown, options: string[]): {
    description: string;
    graph: { nodes: { id: string; data: { options?: string[]; value?: string } }[] };
  };
  templatePath: string;
}
const loadSync = async (): Promise<SyncModule> =>
  (await import(pathToFileURL(scriptPath).href)) as SyncModule;

const catalog = loadCatalog(() =>
  JSON.parse(readFileSync(new URL("../preset-catalog.json", import.meta.url), "utf8"))
);

describe("effects catalogue", () => {
  it("has 20 effects that take an image and exclude identity effects", () => {
    const effects = catalog.filter({ kind: "effect" });
    expect(effects).toHaveLength(20);
    for (const effect of effects) {
      expect(effect.inputs, effect.id).toEqual(["image"]);
      expect(effect.slot, effect.id).toBe("effect");
      expect(effect.modes.length, effect.id).toBe(1);
      expect(["image_to_video", "image_edit"]).toContain(effect.modes[0]);
      expect(`${effect.name} ${effect.description} ${effect.tags.join(" ")}`).not.toMatch(
        /face[- ]?swap|deepfake|celebrit|likeness|identity/i
      );
    }
  });

  it("writes family fragments for every image-to-video effect", () => {
    for (const effect of catalog.filter({ kind: "effect", mode: "image_to_video" })) {
      expect(Object.keys(effect.prompt).sort(), effect.id).toEqual(
        ["default", "kling", "seedance", "veo", "wan"]
      );
    }
  });
});

describe("Effects Gallery template sync", () => {
  it("matches the catalogue (node scripts/presets/sync-effects-template.mjs --check)", () => {
    execFileSync(process.execPath, [scriptPath, "--check"], { cwd: repoRoot });
  });

  it("lists every image-to-video effect as an option", async () => {
    const { effectOptions } = await loadSync();
    const options = effectOptions(catalog.presets);
    expect(options).toHaveLength(catalog.filter({ kind: "effect", mode: "image_to_video" }).length);
    expect(new Set(options).size).toBe(options.length);
  });

  it("detects drift when an option is removed", async () => {
    const { effectOptions, syncTemplate, templatePath } = await loadSync();
    const template = JSON.parse(readFileSync(templatePath, "utf8"));
    const options = effectOptions(catalog.presets);
    const drifted = syncTemplate(template, options.slice(1));
    const select = drifted.graph.nodes.find((node) => node.id === "effect");
    expect(select?.data.options).toHaveLength(options.length - 1);
    expect(JSON.stringify(drifted)).not.toBe(JSON.stringify(syncTemplate(template, options)));
    expect(drifted.description).toContain(`one of ${options.length - 1} visual effects`);
  });

  it("refuses to empty the template", async () => {
    const { syncTemplate, templatePath } = await loadSync();
    expect(() => syncTemplate(JSON.parse(readFileSync(templatePath, "utf8")), [])).toThrow(/No image-to-video/);
  });
});
