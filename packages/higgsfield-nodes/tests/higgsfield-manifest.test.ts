import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import manifest from "../src/higgsfield-manifest.json";

describe("Higgsfield manifest", () => {
  it("keeps every entry tied to a schema fixture and source page", () => {
    expect(manifest.length).toBeGreaterThan(0);
    for (const entry of manifest) {
      expect(entry.configVersion).toBe(1);
      expect(entry.sourceUrl).toMatch(/^https:\/\//);
      const fixturePath = resolve(process.cwd(), "src/schema-fixtures", entry.schemaFixture);
      expect(existsSync(fixturePath)).toBe(true);
      const parsed = JSON.parse(readFileSync(fixturePath, "utf8")) as { modelId?: string; sourceUrl?: string } | Array<{ modelId?: string; sourceUrl?: string }>;
      const fixture = Array.isArray(parsed) ? parsed.find((candidate) => candidate.modelId === entry.modelId) : parsed;
      expect(fixture.modelId).toBe(entry.modelId);
      expect(fixture.sourceUrl).toBe(entry.sourceUrl);
    }
  });
});
