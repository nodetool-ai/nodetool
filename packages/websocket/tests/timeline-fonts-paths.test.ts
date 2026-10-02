import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({ directory: "" }));
vi.mock("@nodetool-ai/timeline/fonts/google-fetch", () => ({
  googleFontsCacheDir: () => cache.directory,
  resolveGoogleFontFamily: vi.fn()
}));
import timelineFontRoutes from "../src/routes/timeline-fonts.js";

let root: string;
let app: ReturnType<typeof Fastify>;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "font-paths-"));
  cache.directory = join(root, "cache");
  app = Fastify();
  await app.register(timelineFontRoutes, {apiOptions: {} as never});
  for (const folder of [join(cache.directory, "roboto"), join(root, "outside")]) {
    await mkdir(folder, {recursive: true});
    await writeFile(join(folder, "manifest.json"), JSON.stringify({family: "Roboto", faces: [{file: "regular.ttf", style: "normal", weights: [400, 400]}]}));
    await writeFile(join(folder, "regular.ttf"), "font bytes");
  }
});
afterEach(async () => {
  await app.close();
  await rm(root, {recursive: true, force: true});
});

describe("cached font route", () => {
  it("serves a manifest-listed face in its family directory", async () => {
    const response = await app.inject("/api/assets/packages/timeline/fonts/google/roboto/regular.ttf");
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("font bytes");
  });
  it("rejects an encoded family path that escapes the cache", async () => {
    const response = await app.inject(`/api/assets/packages/timeline/fonts/google/${encodeURIComponent("../outside")}/regular.ttf`);
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain("font bytes");
  });
  it.each(["..", "../outside", "..\\outside", "/outside", "Roboto", "roboto%2foutside"])("rejects invalid slug %s", async (slug) => {
    const response = await app.inject(`/api/assets/packages/timeline/fonts/google/${encodeURIComponent(slug)}/regular.ttf`);
    expect(response.statusCode).toBe(404);
  });
  it.each(["../regular.ttf", "..\\regular.ttf", "/regular.ttf", "unknown.ttf"])("rejects file %s", async (file) => {
    const response = await app.inject(`/api/assets/packages/timeline/fonts/google/roboto/${encodeURIComponent(file)}`);
    expect(response.statusCode).toBe(404);
  });
});
