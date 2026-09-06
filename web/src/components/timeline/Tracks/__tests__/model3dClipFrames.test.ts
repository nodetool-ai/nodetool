/**
 * A 3D clip's lane filmstrip: which source times its cells are drawn at, and
 * that the WebGL session they cost is handed back when the strip is done.
 *
 * The render session is mocked — three.js is proven in `packages/video-nodes`
 * and the pool around it in `Model3DLayerSource.test.ts`. What is proven here
 * is the mapping from a clip's trim, speed and animation speed onto the frames
 * the strip asks for.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { DEFAULT_MODEL3D_STYLE, makeClip } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import type { ActiveLayer } from "@nodetool-ai/timeline/render";

import { stub } from "../../../../test-utils/doubles";
import type {
  Model3DLayerSource,
  Model3DRenderSession
} from "../../preview/Model3DLayerSource";
import {
  MODEL3D_FILMSTRIP_SAMPLES,
  extractModel3DThumbnails,
  model3dSourceTimeSec
} from "../model3dClipFrames";

const SEQUENCE = { width: 1920, height: 1080 };

/** Compare sampled seconds without pinning the last bits of the arithmetic. */
const round = (value: number): number => Math.round(value * 1e6) / 1e6;

/** A pool that hands back a canvas for every frame and records what it drew. */
function fakeSource() {
  const canvas = stub<OffscreenCanvas>({ width: 96, height: 54 });
  const frame = jest.fn((_layer: ActiveLayer) => canvas);
  const release = jest.fn((_clipId: string) => undefined);
  const load = jest.fn(
    async (_layer: ActiveLayer): Promise<Model3DRenderSession | null> =>
      stub<Model3DRenderSession>({})
  );
  const source = stub<Model3DLayerSource>({
    load,
    frame,
    release,
    state: () => undefined
  });
  return { source, frame, release, load };
}

/** A 3D clip trimmed to a 2 s in point and played at 2x. */
function model3dClip(over: Partial<TimelineClip> = {}): TimelineClip {
  return makeClip({
    id: "cube-1",
    trackId: "overlay-1",
    name: "Cube",
    mediaType: "model3d",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "glb-1",
    startMs: 1000,
    durationMs: 4000,
    inPointMs: 2000,
    speedMultiplier: 2,
    model3dStyle: DEFAULT_MODEL3D_STYLE,
    ...over
  });
}

describe("extractModel3DThumbnails", () => {
  beforeEach(() => {
    // jsdom has no 2D context. The `getContext` overloads resolve to the WebGPU
    // one when the return is a plain double, so the spy goes through a narrowed
    // view of the prototype; `restoreAllMocks` still puts the real one back.
    jest
      .spyOn(
        HTMLCanvasElement.prototype as unknown as {
          getContext: () => unknown;
        },
        "getContext"
      )
      .mockReturnValue(
        stub<CanvasRenderingContext2D>({
          clearRect: jest.fn(),
          drawImage: jest.fn()
        })
      );
    jest
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockImplementation(() => "data:image/jpeg;base64,cell");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders one cell per sample at the clip's own source times", async () => {
    const { source, frame } = fakeSource();

    const thumbnails = await extractModel3DThumbnails(
      model3dClip(),
      SEQUENCE,
      { source }
    );

    // Sample i sits at `startMs + i/7 * durationMs`; at 2x from a 2 s in point
    // that is source second `2 + 8 * i/7`.
    const steps = MODEL3D_FILMSTRIP_SAMPLES - 1;
    const expected = Array.from({ length: MODEL3D_FILMSTRIP_SAMPLES }, (_, i) =>
      round(2 + (8 * i) / steps)
    );

    expect(frame).toHaveBeenCalledTimes(MODEL3D_FILMSTRIP_SAMPLES);
    expect(
      frame.mock.calls.map((call) => round(call[0].sourceTimeSec ?? -1))
    ).toEqual(expected);
    expect(thumbnails.map((thumb) => round(thumb.time))).toEqual(expected);
    expect(thumbnails.map((thumb) => thumb.dataUrl)).toEqual(
      expected.map(() => "data:image/jpeg;base64,cell")
    );
  });

  it("advances the glTF clock by the style's animation speed", async () => {
    const { source, frame } = fakeSource();
    const clip = model3dClip({
      model3dStyle: {
        ...DEFAULT_MODEL3D_STYLE,
        animation: { ...DEFAULT_MODEL3D_STYLE.animation, speed: 1.5 }
      }
    });

    const thumbnails = await extractModel3DThumbnails(clip, SEQUENCE, {
      source
    });

    // The strip is still stamped with the clip's source seconds — that is what
    // `selectFilmstripCells` picks against — while the model is posed at the
    // animation's own, faster clock.
    expect(frame.mock.calls[1][0].sourceTimeSec).toBeCloseTo(
      thumbnails[1].time * 1.5
    );
    expect(model3dSourceTimeSec(clip, clip.startMs)).toBeCloseTo(3);
  });

  it("hands the WebGL context back when the strip is done", async () => {
    // The preview owns the only two sessions the scene model allows; a strip
    // that kept one would evict the clip the user is scrubbing.
    const { source, release } = fakeSource();

    await extractModel3DThumbnails(model3dClip(), SEQUENCE, { source });

    expect(release).toHaveBeenCalledWith("cube-1");
  });

  it("refuses a clip with no model asset", async () => {
    const { source, frame } = fakeSource();

    await expect(
      extractModel3DThumbnails(model3dClip({ status: "draft" }), SEQUENCE, {
        source
      })
    ).rejects.toThrow(/no model asset/);
    expect(frame).not.toHaveBeenCalled();
  });
});
