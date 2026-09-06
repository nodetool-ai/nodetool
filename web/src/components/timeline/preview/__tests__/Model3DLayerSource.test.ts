/**
 * The browser's 3D layer pool: which clip holds a render session, when a
 * session is thrown away, and what happens on a machine that cannot draw one.
 *
 * A session is a WebGL context and a parsed glTF, so the two things worth
 * pinning are the ones that cost: how many exist at once, and what makes one be
 * rebuilt. The session itself is mocked — three.js is proven in
 * `packages/video-nodes`; what is proven here is the pool around it.
 */

import { describe, expect, it, jest } from "@jest/globals";
import { DEFAULT_MODEL3D_STYLE } from "@nodetool-ai/timeline";
import type {
  ClipModel3DStyle,
  Model3DCameraChannels
} from "@nodetool-ai/timeline";
import type { ActiveLayer } from "@nodetool-ai/timeline/render";

import { stub } from "../../../../test-utils/doubles";
import {
  Model3DLayerSource,
  type Model3DRenderSession,
  type Model3DSessionOptions
} from "../Model3DLayerSource";

const SIZE = { width: 320, height: 180 };

const STILL: Model3DCameraChannels = {
  cameraAzimuth: 0,
  cameraElevation: 0,
  cameraZoom: 1,
  cameraFov: 0
};

interface FakeSession extends Model3DRenderSession {
  render: jest.Mock<Model3DRenderSession["render"]>;
  dispose: jest.Mock<() => void>;
}

/** A session that hands back a canvas naming itself, and records every call. */
function fakeSession(name: string): FakeSession {
  const canvas = stub<OffscreenCanvas>({ width: 1, height: 1 });
  return {
    animations: ["Idle"],
    cameras: [],
    render: jest.fn(() => canvas),
    dispose: jest.fn(),
    name
  } as unknown as FakeSession;
}

function layer(
  clipId: string,
  over: {
    assetId?: string;
    style?: Partial<ClipModel3DStyle>;
    sourceTimeSec?: number;
  } = {}
): ActiveLayer {
  return stub<ActiveLayer>({
    kind: "model3d",
    clipId,
    assetId: over.assetId ?? "glb-1",
    sourceTimeSec: over.sourceTimeSec ?? 0,
    model3dStyle: { ...DEFAULT_MODEL3D_STYLE, ...over.style }
  });
}

/** A pool whose sessions and bytes are handed over without a network or a GPU. */
function makeSource(
  over: Partial<ConstructorParameters<typeof Model3DLayerSource>[0]> = {}
) {
  const sessions: FakeSession[] = [];
  const createSession = jest.fn(
    async (
      _glb: Uint8Array,
      _options: Model3DSessionOptions
    ): Promise<Model3DRenderSession> => {
      const session = fakeSession(`session-${sessions.length}`);
      sessions.push(session);
      return session;
    }
  );
  const source = new Model3DLayerSource({
    resolveUrl: (assetId: string) => `https://assets.test/${assetId}.glb`,
    supported: () => true,
    fetchModel: async () => new Uint8Array([1, 2, 3]),
    createSession,
    ...over
  });
  return { source, sessions, createSession };
}

/** Let every queued microtask and timer callback run. */
const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

describe("Model3DLayerSource", () => {
  it("draws nothing until the session has loaded", async () => {
    const { source, createSession } = makeSource();
    const first = layer("clip-a");

    expect(source.frame(first, STILL, SIZE)).toBeNull();
    expect(source.state("clip-a")).toEqual({ status: "loading" });

    await settle();
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(source.frame(first, STILL, SIZE)).not.toBeNull();
  });

  it("reuses one session across frames and renders each at its own time", async () => {
    const { source, sessions, createSession } = makeSource();
    source.acquire(layer("clip-a"));
    await settle();

    source.frame(layer("clip-a", { sourceTimeSec: 0.5 }), STILL, SIZE);
    source.frame(layer("clip-a", { sourceTimeSec: 1.5 }), STILL, SIZE);

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(sessions[0].render).toHaveBeenCalledTimes(2);
    expect(sessions[0].render.mock.calls[0][0].timeSec).toBe(0.5);
    expect(sessions[0].render.mock.calls[1][0].timeSec).toBe(1.5);
    expect(sessions[0].dispose).not.toHaveBeenCalled();
  });

  it("keeps the session when only the camera moves", async () => {
    // Orbiting, keying a camera channel and scrubbing all change the camera and
    // nothing else. Rebuilding the session there would reload the glTF on every
    // drag frame.
    const { source, sessions, createSession } = makeSource();
    source.acquire(layer("clip-a"));
    await settle();

    const orbited = layer("clip-a", {
      style: {
        camera: { ...DEFAULT_MODEL3D_STYLE.camera, azimuthDeg: 180, zoom: 2 }
      }
    });
    source.frame(orbited, STILL, SIZE);
    await settle();

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(sessions[0].dispose).not.toHaveBeenCalled();
    expect(sessions[0].render.mock.calls[0][0].camera).toMatchObject({
      azimuthDeg: 180,
      zoom: 2
    });
  });

  it("folds the animated camera channels onto the clip's pose", async () => {
    const { source, sessions } = makeSource();
    source.acquire(layer("clip-a"));
    await settle();

    source.frame(
      layer("clip-a"),
      {
        cameraAzimuth: 90,
        cameraElevation: -5,
        cameraZoom: 2,
        cameraFov: 10
      },
      SIZE
    );

    expect(sessions[0].render.mock.calls[0][0].camera).toMatchObject({
      // Additive on the defaults (azimuth 45, elevation 25, fov 35, zoom 1).
      azimuthDeg: 135,
      elevationDeg: 20,
      fovDeg: 45,
      zoom: 2
    });
  });

  it("re-creates the session when the background changes", async () => {
    const { source, sessions, createSession } = makeSource();
    source.acquire(layer("clip-a"));
    await settle();

    source.acquire(
      layer("clip-a", {
        style: { background: { transparent: false, color: "#101010" } }
      })
    );
    await settle();

    expect(createSession).toHaveBeenCalledTimes(2);
    expect(sessions[0].dispose).toHaveBeenCalledTimes(1);
    expect(createSession.mock.calls[1][1].background).toEqual({
      transparent: false,
      color: "#101010"
    });
  });

  it("re-creates the session when the lighting changes", async () => {
    const { source, sessions, createSession } = makeSource();
    source.acquire(layer("clip-a"));
    await settle();

    source.acquire(layer("clip-a", { style: { lighting: "flat" } }));
    await settle();

    expect(createSession).toHaveBeenCalledTimes(2);
    expect(sessions[0].dispose).toHaveBeenCalledTimes(1);
    expect(createSession.mock.calls[1][1].lighting).toBe("flat");
  });

  it("evicts the least recently drawn session at the cap", async () => {
    // One WebGL context per session, and the scene model never makes more than
    // MAX_MODEL3D_LAYERS live at once (R2) — so a third clip takes the slot of
    // whichever of the first two was drawn longest ago.
    const { source, sessions } = makeSource();
    source.acquire(layer("clip-a"));
    source.acquire(layer("clip-b"));
    await settle();
    // Draw a again, so b is the older of the two.
    source.frame(layer("clip-a"), STILL, SIZE);

    source.acquire(layer("clip-c"));
    await settle();

    expect(sessions).toHaveLength(3);
    expect(sessions[1].dispose).toHaveBeenCalledTimes(1);
    expect(sessions[0].dispose).not.toHaveBeenCalled();
    expect(source.state("clip-b")).toBeUndefined();
    expect(source.state("clip-a")?.status).toBe("ready");
    expect(source.state("clip-c")?.status).toBe("ready");
  });

  it("reports unavailable, and never loads, without WebGL", async () => {
    const { source, createSession } = makeSource({ supported: () => false });

    source.acquire(layer("clip-a"));
    await settle();

    expect(createSession).not.toHaveBeenCalled();
    expect(source.frame(layer("clip-a"), STILL, SIZE)).toBeNull();
    expect(source.state("clip-a")).toEqual({
      status: "unavailable",
      reason: "no_webgl",
      message: expect.stringContaining("WebGL")
    });
  });

  it("reports unavailable when the model cannot be fetched", async () => {
    const { source } = makeSource({
      fetchModel: async () => {
        throw new Error("HTTP 404");
      }
    });

    source.acquire(layer("clip-a"));
    await settle();

    expect(source.state("clip-a")).toMatchObject({
      status: "unavailable",
      reason: "load_failed"
    });
  });

  it("fetches one asset once for every clip that draws it", async () => {
    const fetchModel = jest.fn(async () => new Uint8Array([1]));
    const { source } = makeSource({ fetchModel });

    source.acquire(layer("clip-a", { assetId: "shared" }));
    source.acquire(layer("clip-b", { assetId: "shared" }));
    await settle();

    expect(fetchModel).toHaveBeenCalledTimes(1);
  });

  it("retries a layer whose asset url has not resolved yet", async () => {
    // The preview resolves asset urls asynchronously and returns undefined in
    // the meantime; treating that as a failure would leave the clip blank for
    // the rest of the session.
    let url: string | undefined;
    const { source, createSession } = makeSource({ resolveUrl: () => url });

    source.acquire(layer("clip-a"));
    await settle();
    expect(createSession).not.toHaveBeenCalled();
    expect(source.state("clip-a")).toBeUndefined();

    url = "https://assets.test/glb-1.glb";
    source.acquire(layer("clip-a"));
    await settle();
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it("disposes on release and on dispose", async () => {
    const { source, sessions } = makeSource();
    source.acquire(layer("clip-a"));
    source.acquire(layer("clip-b"));
    await settle();

    source.retain(["clip-b"]);
    expect(sessions[0].dispose).toHaveBeenCalledTimes(1);
    expect(sessions[1].dispose).not.toHaveBeenCalled();

    source.dispose();
    expect(sessions[1].dispose).toHaveBeenCalledTimes(1);
  });

  it("awaits the session on the export path", async () => {
    const { source, sessions } = makeSource();

    const session = await source.load(layer("clip-a"));

    expect(session).toBe(sessions[0]);
    expect(source.frame(layer("clip-a"), STILL, SIZE)).not.toBeNull();
  });
});
