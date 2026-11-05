import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readWan2GPCatalog, setWan2GPCatalogStatus, wan2gpCatalogPath, wan2gpCatalogKey, wan2gpSourceIdentity } from "../src/wan2gp-helper.js";

let root: string;
let sourceDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "wan2gp-catalog-"));
  sourceDir = join(root, "616e60506aff", "Wan2GP");
  await mkdir(sourceDir, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const row = { model_type: "flux", name: "Flux", main_output: ["image"], capabilities: ["text_to_image"], media_inputs: {} };

describe("Wan2GP model catalog", () => {
  it("sits beside the release's source", async () => {
    expect(await wan2gpCatalogPath(sourceDir)).toBe(join(root, "616e60506aff", "catalog.json"));
  });

  it("reads as missing when absent, unparsable, or of another shape", async () => {
    expect(await readWan2GPCatalog(sourceDir)).toBeNull();
    const file = await wan2gpCatalogPath(sourceDir);
    await writeFile(file, "{not json");
    expect(await readWan2GPCatalog(sourceDir)).toBeNull();
    await writeFile(file, JSON.stringify({ version: 2, models: [] }));
    expect(await readWan2GPCatalog(sourceDir)).toBeNull();
    await writeFile(file, JSON.stringify({ version: 1, models: [{ ...row, status: "downloading" }] }));
    expect(await readWan2GPCatalog(sourceDir)).toBeNull();
  });

  it("records a model's status and keeps the fields it does not know", async () => {
    const file = await wan2gpCatalogPath(sourceDir);
    await writeFile(file, JSON.stringify({ version: 1, models: [{ ...row, status: "missing", extra: 1 }] }));
    await setWan2GPCatalogStatus(sourceDir, "flux", "available");
    await setWan2GPCatalogStatus(sourceDir, "not_a_model", "available");
    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({
      version: 1,
      models: [{ ...row, status: "available", extra: 1 }]
    });
  });
  it("preserves independent status updates from the same catalog generation", async () => {
    const file = await wan2gpCatalogPath(sourceDir);
    await writeFile(file, JSON.stringify({ version: 1, models: [
      { ...row, status: "missing" },
      { ...row, model_type: "other", status: "missing" }
    ] }));
    const key = await wan2gpCatalogKey(sourceDir, await wan2gpSourceIdentity(sourceDir));
    expect(await setWan2GPCatalogStatus(sourceDir, "flux", "available", key)).not.toBeNull();
    expect(await setWan2GPCatalogStatus(sourceDir, "other", "available", key)).not.toBeNull();
    expect((await readWan2GPCatalog(sourceDir))?.map((model) => model.status)).toEqual(["available", "available"]);
    // Repair writes a fresh catalog generation at the same source path.
    await writeFile(file, JSON.stringify({ version: 1, models: [{ ...row, status: "missing" }] }));
    expect(await setWan2GPCatalogStatus(sourceDir, "flux", "available", key)).toBeNull();
    expect((await readWan2GPCatalog(sourceDir))?.[0].status).toBe("missing");
  });

});
