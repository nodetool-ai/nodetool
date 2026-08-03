/**
 * Executes the image examples in `examples/workflows/` and asserts what they
 * produce.
 *
 * These nodes are shader-backed: every `lib.image.*` generator and every
 * `nodetool.image` transform needs a WebGPU adapter through Dawn. CI installs
 * `mesa-vulkan-drivers` (lavapipe, a CPU Vulkan ICD) for exactly this reason —
 * see the `test-packages` leg of `.github/workflows/quality-checks.yml`. On a
 * developer machine with no Vulkan driver these cases fail with "No WebGPU
 * adapter available (Node/Dawn)"; installing that package, or pointing
 * `VK_DRIVER_FILES` at an ICD manifest, is the fix.
 *
 * Nothing here is a "did an image come out" check. Geometry is asserted as
 * exact pixel dimensions read back through `GetMetadata`, and the colour
 * operations are asserted by round-trip with `nodetool.compare.CompareImages`,
 * which compares pixels: inverting twice must return the original, and
 * inverting once must not. A no-op implementation fails both halves.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NodeRegistry,
  createGraphNodeTypeResolver
} from "@nodetool-ai/node-sdk";
import { ExecutionSession } from "@nodetool-ai/execution";
import { registerBaseNodes } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.resolve(__dirname, "../../../examples/workflows");

async function run(file: string): Promise<Record<string, unknown[]>> {
  const { graph } = JSON.parse(
    fs.readFileSync(path.join(EXAMPLES_DIR, file), "utf8")
  ) as { graph: unknown };
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  const session = await ExecutionSession.create({
    graph,
    registry,
    resolveNodeType: createGraphNodeTypeResolver(registry).resolveNodeType,
    jobId: `image-example-${file}`,
    params: {}
  } as never);
  const result = await session.result;
  expect(result.error ?? null, `${file} errored`).toBeNull();
  expect(result.status, `${file} did not complete`).toBe("completed");
  return (result.outputs ?? {}) as Record<string, unknown[]>;
}

describe("image_geometry_cli", () => {
  it("resizes, scales, tiles and rotates to exact dimensions", async () => {
    const out = await run("image_geometry_cli.json");

    expect(out["source_width"]).toEqual([64]);
    expect(out["source_height"]).toEqual([64]);
    // Generated images carry an alpha channel.
    expect(out["source_mode"]).toEqual(["RGBA"]);

    // Resize takes an explicit size and does not preserve aspect ratio.
    expect(out["resized_width"]).toEqual([100]);
    expect(out["resized_height"]).toEqual([50]);

    // Scale is a multiplier on both axes: 64 * 0.5.
    expect(out["scaled_width"]).toEqual([32]);
    expect(out["scaled_height"]).toEqual([32]);

    // Tile repeats the image *inside the existing canvas* — it does not grow
    // it. 3x2 tiles of a 64x64 image is still 64x64, not 192x128, which is the
    // opposite of what "tiles_x: 3" reads like.
    expect(out["tiled_width"]).toEqual([64]);
    expect(out["tiled_height"]).toEqual([64]);

    // A 90 degree rotation swaps the axes: the 100x50 input comes back 50x100.
    expect(out["rotated_width"]).toEqual([50]);
    expect(out["rotated_height"]).toEqual([100]);
  });
});

describe("image_color_roundtrip_cli", () => {
  it("inverts and inverts back to the original pixels", async () => {
    const out = await run("image_color_roundtrip_cli.json");

    // The pair is the assertion. A node that returned its input unchanged
    // would make the first `false` into `true`; a node that corrupted the
    // image would make the second `true` into `false`. Only a real, exactly
    // reversible invert satisfies both.
    expect(out["invert_once_equal"]).toEqual([false]);
    expect(out["invert_twice_equal"]).toEqual([true]);

    // Posterize genuinely changes pixels, and leaves the canvas alone.
    expect(out["posterize_equal"]).toEqual([false]);
    expect(out["posterize_width"]).toEqual([48]);
    expect(out["posterize_height"]).toEqual([32]);
  });
});

describe("image_generators_cli", () => {
  it("draws every generator at the requested size", async () => {
    const out = await run("image_generators_cli.json");
    expect(out["flat_width"]).toEqual([40]);
    expect(out["flat_height"]).toEqual([24]);
    expect(out["radial_width"]).toEqual([40]);
    expect(out["angular_width"]).toEqual([40]);
    expect(out["diamond_width"]).toEqual([40]);

    // Two different generators must not agree, or the comparison below proves
    // nothing.
    expect(out["flat_vs_radial_equal"]).toEqual([false]);
  });

  it("honours GaussianNoise's seed", async () => {
    const out = await run("image_generators_cli.json");
    // Same seed, pixel-identical output; different seed, different output.
    // A seed that was accepted and then ignored would fail the second.
    expect(out["same_seed_equal"]).toEqual([true]);
    expect(out["diff_seed_equal"]).toEqual([false]);
  });
});
