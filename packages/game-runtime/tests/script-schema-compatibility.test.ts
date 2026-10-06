import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

import { GAME_SCRIPT_TYPES } from "../src/script-types.js";
import { GAME_SCRIPT_TYPES_3D } from "../src/script-types3d.js";

it("preserves the script declaration bytes across protocol module changes", () => {
  const baseline = JSON.parse(readFileSync(new URL("./fixtures/script-declaration-digests.json", import.meta.url), "utf8"));
  const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
  expect({ two: digest(GAME_SCRIPT_TYPES), three: digest(GAME_SCRIPT_TYPES_3D) }).toEqual(baseline);
});
