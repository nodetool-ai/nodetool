/**
 * T3, TypeScript side: the orbit-camera math shared with the Blender op.
 *
 * Imports the real `computeFraming` / `orbitOffset` from
 * `video-nodes` (test-only cross-package import, like `job.test.ts` pins
 * the argv guard against `agents`) and asserts the golden camera position
 * to four decimals. `blender_ops/tests/test_framing.py` asserts the same
 * goldens from the Python port; the Blender case below runs it under
 * Blender's own interpreter when Blender is present and skips otherwise.
 */

import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

// Test-only cross-package import: the Blender op ports these exact
// functions to Python (see `blender_ops/framing.py`).
import {
  computeFraming,
  orbitOffset
} from "../../video-nodes/src/nodes/model3d/render3d-core.js";
import { resolveBlenderBinary } from "../src/blender-binary.js";
import { failWhenBlenderRequired } from "./blender-available.js";

failWhenBlenderRequired();

const execFileAsync = promisify(execFile);

// radius 2, fov 40, aspect 4/3, zoom 1.2; azimuth 30, elevation 20;
// bounds center (0.5, 0.25, -1).
const GOLDEN = {
  distance: 4.873,
  near: 0.0487,
  far: 24.873,
  offset: { x: 2.2896, y: 1.6667, z: 3.9656 },
  position: [2.7896, 1.9167, 2.9656],
  center: [0.5, 0.25, -1]
} as const;

describe("framing math (shared with the Blender op)", () => {
  it("fits the bounding sphere to the golden distance", () => {
    const framing = computeFraming(2, 40, 4 / 3, 1.2);
    expect(framing.distance).toBeCloseTo(GOLDEN.distance, 4);
    expect(framing.near).toBeCloseTo(GOLDEN.near, 4);
    expect(framing.far).toBeCloseTo(GOLDEN.far, 4);
  });

  it("places the orbit camera at the golden position", () => {
    const framing = computeFraming(2, 40, 4 / 3, 1.2);
    const offset = orbitOffset(30, 20, framing.distance);
    expect(offset.x).toBeCloseTo(GOLDEN.offset.x, 4);
    expect(offset.y).toBeCloseTo(GOLDEN.offset.y, 4);
    expect(offset.z).toBeCloseTo(GOLDEN.offset.z, 4);
    const [cx, cy, cz] = GOLDEN.center;
    expect(cx + offset.x).toBeCloseTo(GOLDEN.position[0], 4);
    expect(cy + offset.y).toBeCloseTo(GOLDEN.position[1], 4);
    expect(cz + offset.z).toBeCloseTo(GOLDEN.position[2], 4);
  });
});

const testsDir = path.dirname(fileURLToPath(import.meta.url));

async function findBlender(): Promise<string | null> {
  try {
    return (await resolveBlenderBinary()).path;
  } catch {
    return null;
  }
}

describe("framing math under Blender's interpreter", () => {
  it("python port reports the same goldens", async (ctx) => {
    // No existsSync: `resolveBlenderBinary` already ran `--version`
    // against the winner, so a returned path runs. Without Blender the
    // test genuinely skips (`ctx.skip()` reports skipped, never passed);
    // with NODETOOL_REQUIRE_BLENDER=1 the module-scope gate above already
    // failed the file, so the skip below is unreachable there.
    const blender = await findBlender();
    if (!blender) {
      await ctx.skip();
      return;
    }
    const script = path.join(
      testsDir,
      "..",
      "blender_ops",
      "tests",
      "test_framing.py"
    );
    const { stdout } = await execFileAsync(
      blender,
      ["-b", "--factory-startup", "--python", script],
      { timeout: 120_000 }
    );
    expect(stdout).toContain("framing goldens ok");
  }, 150_000);
});
