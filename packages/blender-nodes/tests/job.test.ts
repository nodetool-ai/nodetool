import { describe, expect, it } from "vitest";

// Test-only cross-package import: pins the blender-nodes copy against the
// original it was copied from. See `src/argv-guard.ts`.
import { refuseFlagLikeValue as originalRefuseFlagLikeValue } from "../../agents/src/host-binary-guard.js";
import { refuseFlagLikeValue } from "../src/argv-guard.js";
import {
  blenderResultSchema,
  jobFileNameSchema,
  type BlenderOp
} from "../src/job.js";
import { MAX_OUTPUT_COUNT } from "../src/runner.js";
import { runBlenderJob } from "../src/run-job.js";
import { blenderTestContext } from "./context.js";

function renderImageOp(overrides: Record<string, unknown> = {}): BlenderOp {
  return {
    op: "render_image",
    params: {
      camera_mode: "orbit",
      azimuth: 45,
      elevation: 25,
      fov: 35,
      zoom: 1,
      lighting: "studio",
      light_intensity: 1,
      background_color: "#ffffff",
      transparent: false,
      engine: "eevee",
      samples: 16,
      denoise: true,
      resolution_percentage: 100,
      width: 64,
      height: 64,
      ...overrides
    }
  };
}

describe("blenderResultSchema", () => {
  it("rejects an unknown error code", () => {
    const parsed = blenderResultSchema.safeParse({
      ok: false,
      error: { code: "definitely_not_a_code", message: "boom" }
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts every documented error code", () => {
    for (const code of [
      "import_failed",
      "no_geometry",
      "no_camera",
      "unsupported_format",
      "render_failed",
      "export_failed",
      "bad_job"
    ]) {
      const parsed = blenderResultSchema.safeParse({
        ok: false,
        error: { code, message: "m" }
      });
      expect(parsed.success).toBe(true);
    }
  });
});

describe("jobFileNameSchema", () => {
  it.each(["../x.png", "/tmp/x.png", ".hidden", ""])(
    "rejects %j",
    (name) => {
      expect(jobFileNameSchema.safeParse(name).success).toBe(false);
    }
  );

  it.each(["render.png", "model.glb", "a", "frame-001.exr", "out_2.MP4"])(
    "accepts %j",
    (name) => {
      expect(jobFileNameSchema.safeParse(name).success).toBe(true);
    }
  );
});

describe("runBlenderJob validation", () => {
  it(`refuses more than MAX_OUTPUT_COUNT (${MAX_OUTPUT_COUNT}) outputs`, async () => {
    const { context, cleanup } = blenderTestContext();
    try {
      const outputs: Record<string, string> = {};
      for (let i = 0; i <= MAX_OUTPUT_COUNT; i++) outputs[`out${i}`] = `out${i}.png`;
      await expect(
        runBlenderJob(context, new Uint8Array([1]), renderImageOp(), outputs, {
          timeoutMs: 1000
        })
      ).rejects.toMatchObject({ name: "BlenderJobError", code: "bad_job" });
    } finally {
      cleanup();
    }
  });

  it("refuses an output file name that escapes the scratch dir", async () => {
    const { context, cleanup } = blenderTestContext();
    try {
      await expect(
        runBlenderJob(
          context,
          new Uint8Array([1]),
          renderImageOp(),
          { image: "../evil.png" },
          { timeoutMs: 1000 }
        )
      ).rejects.toMatchObject({ name: "BlenderJobError", code: "bad_job" });
    } finally {
      cleanup();
    }
  });

  it("refuses a flag-like string prop", async () => {
    const { context, cleanup } = blenderTestContext();
    try {
      await expect(
        runBlenderJob(
          context,
          new Uint8Array([1]),
          renderImageOp({ background_color: "--python" }),
          { image: "render.png" },
          { timeoutMs: 1000 }
        )
      ).rejects.toMatchObject({ name: "BlenderJobError", code: "bad_job" });
    } finally {
      cleanup();
    }
  });

  it("refuses empty model bytes before touching Blender", async () => {
    const { context, cleanup } = blenderTestContext();
    try {
      await expect(
        runBlenderJob(context, new Uint8Array(), renderImageOp(), {
          image: "render.png"
        }, { timeoutMs: 1000 })
      ).rejects.toMatchObject({ name: "BlenderJobError", code: "bad_job" });
    } finally {
      cleanup();
    }
  });

  it("refuses a context-free call on the local runner", async () => {
    await expect(
      runBlenderJob(undefined, new Uint8Array([1]), renderImageOp(), {
        image: "render.png"
      }, { timeoutMs: 1000 })
    ).rejects.toMatchObject({ name: "BlenderJobError", code: "bad_job" });
  });
});

describe("refuseFlagLikeValue", () => {
  it("rejects a value starting with a dash", () => {
    expect(refuseFlagLikeValue("--python", "background_color")).toBeDefined();
  });

  it("accepts an ordinary value", () => {
    expect(refuseFlagLikeValue("#ffffff", "background_color")).toBeUndefined();
  });

  it("behaves exactly like the agents original", () => {
    const values = [
      "--python",
      "-x",
      "-",
      "#ffffff",
      "eevee",
      "",
      " --leading-space",
      "--",
      "a-b"
    ];
    for (const value of values) {
      expect(
        refuseFlagLikeValue(value, "background_color"),
        `copy disagrees on ${JSON.stringify(value)}`
      ).toEqual(originalRefuseFlagLikeValue(value, "background_color"));
    }
  });
});
