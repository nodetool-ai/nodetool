/**
 * The orbit camera's lens, pinned without Blender.
 *
 * `fov` means the vertical field of view everywhere in this stack, but
 * Blender's `Camera.angle` resolves against whichever sensor axis
 * `sensor_fit` names. Two call sites wrote `angle` in opposite orders around
 * the `sensor_fit` assignment and ended up with two focal lengths for the same
 * params, so a sampled bake and the still `render_image` draws from the same
 * camera were two different pictures. `framing.apply_camera_lens` is now the
 * only place a camera lens is written.
 *
 * Two checks, neither of which renders anything: the Python one runs the real
 * helper against a stub datablock that reproduces Blender's `angle`/`angle_y`
 * semantics, and the source one keeps the second call site from growing back.
 */

import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { resolveBlenderBinary } from "../src/blender-binary.js";

const execFileAsync = promisify(execFile);

const opsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "blender_ops"
);

/** Any interpreter that runs the op scripts: the helper imports no bpy. */
async function findInterpreter(): Promise<string | null> {
  for (const candidate of ["python3", "python"]) {
    try {
      await execFileAsync(candidate, ["-c", "print(1)"], { timeout: 30_000 });
      return candidate;
    } catch {
      // Not installed under that name; try the next one.
    }
  }
  try {
    // Blender's bundled Python, reached the way `framing.test.ts` reaches it.
    return (await resolveBlenderBinary()).path;
  } catch {
    return null;
  }
}

async function pythonFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await pythonFiles(file)));
    } else if (entry.name.endsWith(".py")) {
      found.push(file);
    }
  }
  return found;
}

describe("orbit camera lens", () => {
  it("gives the camera the requested vertical fov, whatever fit it arrived with", async (ctx) => {
    const interpreter = await findInterpreter();
    if (!interpreter) {
      await ctx.skip();
      return;
    }
    const script = path.join(opsDir, "tests", "test_camera_lens.py");
    // `-B` keeps a stale `__pycache__` from answering for an edited source,
    // which is exactly how a mutation of this helper once passed.
    const args = interpreter.includes("python")
      ? ["-B", script]
      : ["-b", "--factory-startup", "--python", script];
    const { stdout } = await execFileAsync(interpreter, args, {
      timeout: 120_000
    });
    expect(stdout).toContain("camera lens ok");
  }, 150_000);

  it("writes a camera lens in exactly one place", async () => {
    const files = await pythonFiles(opsDir);
    const ops = files.filter(
      (file) =>
        !file.endsWith(`${path.sep}framing.py`) &&
        !file.includes(`${path.sep}tests${path.sep}`)
    );
    // The scan is worthless if it found nothing to scan.
    expect(ops.length).toBeGreaterThan(3);

    const lensWrite = /\.(angle|angle_y|lens|sensor_fit|clip_start|clip_end)\s*=[^=]/;
    const offenders: string[] = [];
    for (const file of ops) {
      const source = await readFile(file, "utf8");
      for (const [index, line] of source.split("\n").entries()) {
        if (lensWrite.test(line)) {
          offenders.push(`${path.relative(opsDir, file)}:${index + 1}`);
        }
      }
    }
    expect(offenders).toEqual([]);

    // And both callers reach the helper that does write it.
    const common = await readFile(path.join(opsDir, "ops", "common.py"), "utf8");
    const animation = await readFile(
      path.join(opsDir, "ops", "render_animation.py"),
      "utf8"
    );
    expect(common).toContain("apply_camera_lens(data, params[\"fov\"], framing)");
    expect(animation).toContain(
      "apply_camera_lens(camera_obj.data, camera_params[\"fov\"], framing)"
    );
  });
});
