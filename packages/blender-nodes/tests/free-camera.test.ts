/**
 * The free camera math shared with the Blender op.
 *
 * `blender_ops/framing.py` ports `model3dFreeCameraBasis` from
 * `packages/timeline` and `computeFreeClipPlanes` from the three.js render
 * core. This file asserts the goldens from the TypeScript originals, and
 * `blender_ops/tests/test_free_camera.py` asserts the same numbers from the
 * port. The port needs no bpy, so plain `python3` runs it when it is on PATH.
 */

import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { model3dFreeCameraBasis } from "../../timeline/src/model3d.js";
import { computeFreeClipPlanes } from "../../video-nodes/src/nodes/model3d/render3d-core.js";

const execFileAsync = promisify(execFile);

const GOLDEN = {
  forward: [-0.543075, -0.203653, 0.814613],
  right: [-0.73249, 0.589203, -0.341026],
  up: [0.410521, 0.781899, 0.469156]
} as const;

describe("free camera math (shared with the Blender op)", () => {
  it("builds the golden basis", () => {
    const basis = model3dFreeCameraBasis([3, 2, -4], [-1, 0.5, 2], 37);
    for (const axis of ["forward", "right", "up"] as const) {
      basis[axis].forEach((value, i) => {
        expect(value).toBeCloseTo(GOLDEN[axis][i], 5);
      });
    }
  });

  it("derives the golden clip planes", () => {
    expect(computeFreeClipPlanes(7.5, 2)).toEqual({ near: 0.0155, far: 15.5 });
    expect(computeFreeClipPlanes(20, 2).near).toBeCloseTo(12);
    const inside = computeFreeClipPlanes(0.5, 10);
    expect(inside.near).toBeCloseTo(0.0405);
    expect(inside.far).toBeCloseTo(40.5);
  });
});

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(
  testsDir,
  "..",
  "blender_ops",
  "tests",
  "test_free_camera.py"
);

async function findPython(): Promise<string | null> {
  for (const candidate of ["python3", "python"]) {
    try {
      await execFileAsync(candidate, ["--version"]);
      return candidate;
    } catch {
      // Not on PATH under this name.
    }
  }
  return null;
}

const python = await findPython();

describe.skipIf(!python)("free camera math, Python port", () => {
  it("matches the same goldens", async () => {
    const { stdout } = await execFileAsync(python as string, [script]);
    expect(stdout).toContain("free camera goldens ok");
  });
});
