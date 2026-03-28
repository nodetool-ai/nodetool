import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readFalUnitPricingSnapshot,
  writeFalUnitPricingSnapshot,
} from "../src/fal-pricing-snapshot.js";

describe("fal-pricing-snapshot", () => {
  it("round-trips JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fal-pricing-"));
    const path = join(dir, "snap.json");
    try {
      const map = new Map([
        [
          "fal-ai/a",
          {
            endpointId: "fal-ai/a",
            unitPrice: 0.01,
            billingUnit: "image",
            currency: "USD",
          },
        ],
      ]);
      await writeFalUnitPricingSnapshot(path, map);
      const text = await readFile(path, "utf8");
      expect(JSON.parse(text).schemaVersion).toBe(1);
      const back = await readFalUnitPricingSnapshot(path);
      expect(back.get("fal-ai/a")).toEqual(map.get("fal-ai/a"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
