import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { compilePresets } from "@nodetool-ai/presets";
import { readPresetPacks, runtimePresetCatalog } from "@nodetool-ai/pack-core/preset-catalog";
import { installPresetPack, removePresetPack } from "../src/preset-packs.js";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "preset-pack-"));
  roots.push(root);
  const source = join(root, "source");
  cpSync(fileURLToPath(new URL("./fixtures/preset-pack", import.meta.url)), source, { recursive: true });
  return { root, source, store: join(root, "installed") };
}
function edit(path: string, values: Record<string, unknown>) {
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), ...values }));
}
afterEach(() => { for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); } });

describe("data-only preset packs", () => {
  it("installs, lists, compiles and removes a pack without dropping saved ids", () => {
    const { source, store } = fixture();
    installPresetPack(source, store);
    expect(readPresetPacks(store).map(pack => pack.manifest.id)).toEqual(["test-moves"]);
    const catalog = runtimePresetCatalog(store);
    expect(catalog.getPreset("camera.community-orbit")?.author).toBe("Fixture author");
    expect(compilePresets(["camera.community-orbit"], { catalog, modelId: "other", mode: "video", prompt: "A cat" }).prompt).toContain("Orbit around");
    removePresetPack("test-moves", store);
    expect(readPresetPacks(store)).toEqual([]);
    expect(() => compilePresets(["camera.community-orbit"], {
      catalog: runtimePresetCatalog(store), modelId: "other", mode: "video", prompt: "A cat"
    })).toThrow("Unknown preset: camera.community-orbit");
  });
  it("refuses an npm install script before it can create a marker", () => {
    const { source, store } = fixture();
    const marker = join(source, "script-ran");
    writeFileSync(join(source, "package.json"), JSON.stringify({
      name: "hostile-pack",
      scripts: { postinstall: "touch script-ran" },
      bin: "install.js"
    }));
    writeFileSync(join(source, "install.js"), "process.exit(1)");
    expect(() => installPresetPack(source, store)).toThrow("only their manifest");
    expect(existsSync(marker)).toBe(false);
  });
  it.each(["scripts", "bin", "dependencies"])("rejects manifest %s", key => {
    const { source, store } = fixture();
    edit(join(source, "preset-pack.json"), { [key]: { install: "touch owned" } });
    expect(() => installPresetPack(source, store)).toThrow();
    expect(readPresetPacks(store)).toEqual([]);
  });
  it.each(["install.js", "index.ts", "run.sh", "binary", "package.json"])("rejects extra file %s", name => {
    const { source, store } = fixture();
    writeFileSync(join(source, name), 'throw new Error("never run");');
    expect(() => installPresetPack(source, store)).toThrow();
  });
  it("rejects executable JSON and symbolic links", () => {
    const { source, store, root } = fixture();
    const path = join(source, "orbit.json");
    chmodSync(path, 0o755);
    expect(() => installPresetPack(source, store)).toThrow();
    chmodSync(path, 0o644);
    cpSync(path, join(root, "external.json"));
    rmSync(path);
    symlinkSync(join(root, "external.json"), path);
    expect(() => installPresetPack(source, store)).toThrow();
  });
  it.each([
    { workflow: "graph" },
    { id: "camera.dolly-in" },
    { prompt: { default: "x".repeat(4097) } },
    { preview: { url: "http://example.com/video", poster: "https://example.com/poster", run: "fixture" } },
    { preview: { url: "https://example.com/video", poster: "javascript:alert(1)", run: "fixture" } }
  ])("rejects unsafe preset %j", values => {
    const { source, store } = fixture();
    edit(join(source, "orbit.json"), values);
    expect(() => installPresetPack(source, store)).toThrow();
    expect(readPresetPacks(store)).toEqual([]);
  });
  it("rejects an id from another pack and alias shadowing", () => {
    const { source, store } = fixture();
    installPresetPack(source, store);
    edit(join(source, "preset-pack.json"), { id: "other-pack" });
    expect(() => installPresetPack(source, store)).toThrow("Duplicate preset id");
    edit(join(source, "orbit.json"), { id: "camera.other", aliases: ["Dolly In"] });
    expect(() => installPresetPack(source, store)).toThrow("Alias");
  });
});
