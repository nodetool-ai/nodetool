import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import * as game2d from "../src/game.js";
import * as game3d from "../src/game3d.js";

const baseline = JSON.parse(readFileSync(new URL("./fixtures/game-schemas.json", import.meta.url), "utf8"));

describe("game schema module compatibility", () => {
  it("preserves every exported legacy JSON schema", () => {
    const schemas = Object.fromEntries(Object.entries({ ...game2d, ...game3d })
      .filter(([, value]) => value instanceof z.ZodType)
      .map(([name, value]) => [name, z.toJSONSchema(value, { io: "input" })]));
    expect(Object.keys(baseline).length).toBeGreaterThan(0);
    expect(schemas).toEqual(baseline);
  });
});
