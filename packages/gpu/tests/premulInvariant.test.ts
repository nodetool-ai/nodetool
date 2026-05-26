/**
 * Runtime premultiplied-alpha invariant harness.
 *
 * The pool's contract: every texture that flows between modules is
 * premultiplied, which means `rgb <= a` for every pixel (modulo one ulp of
 * 8-bit slop). A module whose RGB math forgets to un/re-premultiply, or whose
 * RGB output is decoupled from its alpha (e.g. `vec4f(processed_rgb, src.a)`
 * where `processed_rgb` was multiplied by a gain > 1), silently produces
 * "super-bright" pixels — `rgb > a` — that bleed across every downstream
 * compositor.
 *
 * This harness feeds a battery of canonical premul-edge fixtures through every
 * registered shader module via the executor and asserts `rgb <= a` on the
 * output. It is the runtime counterpart to the load-time linearity classifier
 * in `module.ts` — the classifier flags how RGB math relates to input, the
 * harness proves the math actually preserves the invariant in practice.
 *
 * Modules with documented violations (Phase-3 follow-up — fixes ship as
 * separate commits) are wrapped with `it.fails()`. That keeps the suite green
 * today AND verifies the harness still catches the bug — the moment the bug
 * is fixed, `.fails()` flips to a hard failure and the entry is removed.
 *
 * Runs against the same `tryGetDevice()` path the other GPU suites use; with
 * no device the entire `describe` block skips so CI without a Vulkan ICD
 * still passes.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createExecutor, type Executor } from "../src/executor.js";
import { createGPUContextFromDevice, type GPUContext } from "../src/context.js";
import { createLabeledTexture, type LabeledTexture } from "../src/texture.js";
import type { ShaderModule } from "../src/module.js";
import { moduleKey } from "../src/module.js";
import { ALL_SHADERS } from "../src/shaders/index.js";
import { createNodeGPUDevice } from "../src/node.js";

/** Same acquisition pattern as `alphaConvert.test.ts` / `canarySmoke.test.ts`. */
async function tryGetDevice(): Promise<GPUDevice | null> {
  const nav = (globalThis as { navigator?: { gpu?: GPU } }).navigator;
  if (nav?.gpu) {
    const adapter = await nav.gpu.requestAdapter();
    return (await adapter?.requestDevice()) ?? null;
  }
  try {
    return await createNodeGPUDevice();
  } catch {
    return null;
  }
}

const device = await tryGetDevice();

const FIXTURE_SIZE = 4;

/** A premul-edge fixture: name + 4×4 RGBA8 byte buffer. */
interface Fixture {
  name: string;
  pixels: Uint8Array;
}

/**
 * Canonical premul-edge fixtures. Sized 4×4 so storage textures (with their
 * 256-byte row alignment constraint for `copyTextureToBuffer`) don't waste
 * memory while still exposing per-column behaviour for `gradient_alpha`.
 *
 * Every fixture is premul-valid (rgb ≤ a). The harness asserts "valid input
 * produces valid output"; testing defensiveness against invalid input bytes
 * (e.g. decoded JPEG with `premultipliedAlpha: false`) is the host bridge's
 * responsibility, not the pool's.
 */
function buildFixtures(): Fixture[] {
  const fill = (
    fn: (col: number, row: number) => [number, number, number, number]
  ): Uint8Array => {
    const out = new Uint8Array(FIXTURE_SIZE * FIXTURE_SIZE * 4);
    for (let y = 0; y < FIXTURE_SIZE; y++) {
      for (let x = 0; x < FIXTURE_SIZE; x++) {
        const [r, g, b, a] = fn(x, y);
        const i = (y * FIXTURE_SIZE + x) * 4;
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
        out[i + 3] = a;
      }
    }
    return out;
  };
  // Per-column alpha ramp for gradient_alpha: 0 / 64 / 128 / 255 across the
  // four columns. RGB = alpha keeps it premul-valid (grey at that coverage).
  const alphaRamp = [0, 64, 128, 255];
  return [
    { name: "transparent_zero", pixels: fill(() => [0, 0, 0, 0]) },
    { name: "semitransparent_white", pixels: fill(() => [128, 128, 128, 128]) },
    // RGB ratio 4:2:1 (orange) at 50% alpha. Each channel kept strictly ≤ a so
    // the input is premul-valid; this exercises asymmetric channel handling
    // without seeding a violation that a passthrough would propagate.
    { name: "semitransparent_color", pixels: fill(() => [100, 50, 25, 128]) },
    { name: "opaque_mid", pixels: fill(() => [128, 128, 128, 255]) },
    { name: "opaque_black", pixels: fill(() => [0, 0, 0, 255]) },
    { name: "opaque_white", pixels: fill(() => [255, 255, 255, 255]) },
    {
      name: "gradient_alpha",
      pixels: fill((col) => {
        const a = alphaRamp[col];
        return [a, a, a, a];
      })
    }
  ];
}

const FIXTURES = buildFixtures();
const FIXTURE_BY_NAME = new Map(FIXTURES.map((f) => [f.name, f]));

/** Binding kinds this harness cannot supply — modules requiring these skip. */
const UNSUPPORTED_BINDING_KINDS = new Set<string>(["texture_external"]);

interface Violation {
  fixture: string;
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Modules with known runtime invariant violations. Each entry is a
 * `(id, version)` key + the fixture name that trips it. They are wrapped with
 * `it.fails()` so the suite passes today, but flips red the moment a fix
 * (separate commit) makes them invariant-correct.
 *
 * Why marker per (module, fixture) rather than per module: some modules pass
 * most fixtures and fail one. We want to keep coverage of the passing fixtures
 * as positive assertions and only relax the failing one.
 *
 * Populate from real-GPU CI runs only — speculation produces both false
 * positives and false negatives.
 */
const KNOWN_VIOLATIONS = new Set<string>([]);

/**
 * Maximum allowed `rgb - a` slack. rgba8unorm round-trips integer→[0,1]→integer
 * at ±1 ulp (1/255 ≈ 0.004), so two ulps of slack tolerates legitimate ramp
 * blending without masking the violations the harness is designed to catch
 * (which routinely overshoot by 0.5 or more).
 */
const PREMUL_EPS = 2 / 255;

function checkPremul(
  pixels: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
  fixtureName: string
): Violation[] {
  const violations: Violation[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * bytesPerRow + x * 4;
      const r = pixels[i] / 255;
      const g = pixels[i + 1] / 255;
      const b = pixels[i + 2] / 255;
      const a = pixels[i + 3] / 255;
      if (
        r > a + PREMUL_EPS ||
        g > a + PREMUL_EPS ||
        b > a + PREMUL_EPS ||
        r < -PREMUL_EPS ||
        g < -PREMUL_EPS ||
        b < -PREMUL_EPS
      ) {
        violations.push({
          fixture: fixtureName,
          x,
          y,
          r: pixels[i],
          g: pixels[i + 1],
          b: pixels[i + 2],
          a: pixels[i + 3]
        });
      }
    }
  }
  return violations;
}

/** Pick a fixture for a non-source input slot. */
function fixtureForSlot(slotName: string): Uint8Array {
  // For mask/alpha-coverage slots, full coverage is the canonical "no
  // contribution from a missing mask" stand-in.
  if (slotName === "mask" || slotName === "shadowMask") {
    return FIXTURE_BY_NAME.get("opaque_white")!.pixels;
  }
  // For additive/overlay/displacement slots, a neutral premul-valid
  // mid-grey gives the module non-trivial work without poisoning the input.
  return FIXTURE_BY_NAME.get("opaque_mid")!.pixels;
}

function moduleUsesUnsupportedBinding(module: ShaderModule): string | null {
  for (const [name, contract] of Object.entries(module.io.inputs)) {
    for (const kind of contract.bindingKinds) {
      if (UNSUPPORTED_BINDING_KINDS.has(kind)) {
        return `${name}:${kind}`;
      }
    }
  }
  return null;
}

describe.skipIf(!device)("premultiplied invariant harness (GPU)", () => {
  let gpu: GPUDevice;
  let ctx: GPUContext;
  let executor: Executor;

  beforeAll(() => {
    if (!device) return;
    gpu = device;
    ctx = createGPUContextFromDevice(gpu);
    executor = createExecutor();
  });

  /**
   * Allocate a `LabeledTexture` for one of the fixture buffers. The label
   * carries the fixture name so violation messages can trace back to the
   * source pixels.
   */
  function uploadFixture(
    name: string,
    pixels: Uint8Array,
    role: string
  ): LabeledTexture {
    const tex = createLabeledTexture(gpu, {
      label: `premul-fixture-${role}-${name}`,
      width: FIXTURE_SIZE,
      height: FIXTURE_SIZE,
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      meta: { colorSpace: "linear", alpha: "premultiplied" }
    });
    gpu.queue.writeTexture(
      { texture: tex.texture },
      pixels,
      { bytesPerRow: FIXTURE_SIZE * 4, rowsPerImage: FIXTURE_SIZE },
      { width: FIXTURE_SIZE, height: FIXTURE_SIZE }
    );
    return tex;
  }

  function allocOutput(module: ShaderModule): LabeledTexture {
    // Fragment modules need RENDER_ATTACHMENT; compute modules need
    // STORAGE_BINDING. Set both so a single helper covers both kinds.
    const usage =
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.COPY_SRC;
    return createLabeledTexture(gpu, {
      label: `premul-output-${module.id}`,
      width: FIXTURE_SIZE,
      height: FIXTURE_SIZE,
      format: module.io.output.format,
      usage,
      meta: {
        colorSpace: module.io.output.colorSpace,
        alpha: module.io.output.alpha
      }
    });
  }

  /**
   * Run a module with the given inputs/params, read back the output, and
   * return any premul-invariant violations.
   */
  async function runAndCheck(
    module: ShaderModule,
    fixtureName: string,
    inputs: Record<string, LabeledTexture>
  ): Promise<Violation[]> {
    const output = allocOutput(module);
    const encoder = gpu.createCommandEncoder();
    const dispatch =
      module.kind === "compute"
        ? {
            kind: "compute" as const,
            x: Math.ceil(FIXTURE_SIZE / module.workgroupSize[0]),
            y: Math.ceil(FIXTURE_SIZE / module.workgroupSize[1]),
            z: 1
          }
        : { kind: "fragment" as const };
    executor.encode({
      ctx,
      module,
      encoder,
      inputs,
      output,
      params: module.paramDefaults,
      dispatch
    });

    const bytesPerRow = 256;
    const readback = gpu.createBuffer({
      size: bytesPerRow * FIXTURE_SIZE,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
    encoder.copyTextureToBuffer(
      { texture: output.texture },
      { buffer: readback, bytesPerRow, rowsPerImage: FIXTURE_SIZE },
      { width: FIXTURE_SIZE, height: FIXTURE_SIZE }
    );
    gpu.queue.submit([encoder.finish()]);

    await readback.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(readback.getMappedRange()).slice();
    readback.unmap();
    readback.destroy();
    output.destroy();

    return checkPremul(
      mapped,
      FIXTURE_SIZE,
      FIXTURE_SIZE,
      bytesPerRow,
      fixtureName
    );
  }

  // ---- Module loop ----------------------------------------------------------

  // Pre-compute the (module, fixture) cases so vitest reports each one
  // separately — a violation in `mixer.add` shouldn't mask a regression in
  // `color.exposure`.
  type Case = {
    module: ShaderModule;
    fixture: Fixture | null; // null ⇒ source module, no input fixture
    label: string;
    expectedToFail: boolean;
    skipReason: string | null;
  };

  const cases: Case[] = [];
  for (const module of ALL_SHADERS) {
    const unsupported = moduleUsesUnsupportedBinding(module);
    const isSource = Object.keys(module.io.inputs).length === 0;
    if (isSource) {
      cases.push({
        module,
        fixture: null,
        label: `${moduleKey(module.id, module.version)} :: <no input>`,
        expectedToFail: false,
        skipReason: unsupported
          ? `unsupported binding kind ${unsupported}`
          : null
      });
      continue;
    }
    for (const fixture of FIXTURES) {
      const key = `${moduleKey(module.id, module.version)}::${fixture.name}`;
      cases.push({
        module,
        fixture,
        label: `${moduleKey(module.id, module.version)} :: ${fixture.name}`,
        expectedToFail: KNOWN_VIOLATIONS.has(key),
        skipReason: unsupported
          ? `unsupported binding kind ${unsupported}`
          : null
      });
    }
  }

  for (const c of cases) {
    if (c.skipReason) {
      it.skip(`${c.label} [skipped: ${c.skipReason}]`, () => {
        // skipped
      });
      continue;
    }
    const fn = async () => {
      const cleanup: LabeledTexture[] = [];
      try {
        // Build the input map. The primary fixture goes into `source`
        // (or the first declared input if no `source`); every other declared
        // input gets a slot-appropriate stand-in via `fixtureForSlot`.
        const inputs: Record<string, LabeledTexture> = {};
        const inputNames = Object.keys(c.module.io.inputs);
        const primaryName =
          "source" in c.module.io.inputs ? "source" : inputNames[0];
        for (const name of inputNames) {
          const pixels =
            name === primaryName
              ? c.fixture!.pixels
              : fixtureForSlot(name);
          const tex = uploadFixture(
            name === primaryName ? c.fixture!.name : `slot-${name}`,
            pixels,
            name
          );
          inputs[name] = tex;
          cleanup.push(tex);
        }
        const violations = await runAndCheck(
          c.module,
          c.fixture ? c.fixture.name : "<source>",
          inputs
        );
        if (violations.length > 0) {
          const preview = violations
            .slice(0, 3)
            .map(
              (v) =>
                `(${v.x},${v.y}) rgba=(${v.r},${v.g},${v.b},${v.a})`
            )
            .join("; ");
          throw new Error(
            `${moduleKey(c.module.id, c.module.version)} violated rgb ≤ a on fixture "${
              c.fixture?.name ?? "<source>"
            }" at ${violations.length} pixel(s); first: ${preview}`
          );
        }
        expect(violations.length).toBe(0);
      } finally {
        for (const tex of cleanup) {
          tex.destroy();
        }
      }
    };
    if (c.expectedToFail) {
      // `it.fails` inverts the assertion: the test passes today (catching the
      // known bug) and flips to red the moment the bug is fixed (signalling
      // that the entry should be removed from KNOWN_VIOLATIONS).
      it.fails(c.label, fn);
    } else {
      it(c.label, fn);
    }
  }
});
