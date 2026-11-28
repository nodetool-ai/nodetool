/**
 * A reference render joins the one in flight for a clip only when it asks for
 * the same picture. A request for another pass waits and renders its own, so
 * no video is stored under a pass or hash it was not drawn at.
 */
import { renderHook } from "@testing-library/react";
import {
  DEFAULT_MODEL3D_STYLE,
  computeModel3DReferenceHash,
  makeClip,
  type Model3DReferencePass,
  type TimelineClip
} from "@nodetool-ai/timeline";

import { useBlockoutReference } from "../useBlockoutReference";

interface PendingRender {
  pass: Model3DReferencePass;
  resolve: () => void;
}

const pending: PendingRender[] = [];
const mockRender = jest.fn(
  ({ pass }: { pass: Model3DReferencePass }) =>
    new Promise<{ bytes: Uint8Array; mimeType: string }>((resolve) => {
      pending.push({
        pass,
        resolve: () => resolve({ bytes: new Uint8Array([1]), mimeType: "video/mp4" })
      });
    })
);
let revision = "2026-11-01T10:00:00Z";
let created = 0;
const mockGet = jest.fn(async (id: string) => ({ id, updated_at: revision }));
const mockCreate = jest.fn(async () => ({ id: `ref_${++created}` }));

jest.mock("../../../components/timeline/render/renderBlockoutReference", () => ({
  renderBlockoutReference: (options: { pass: Model3DReferencePass }) => mockRender(options)
}));
jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: (selector: (s: unknown) => unknown) =>
    selector({ get: mockGet, createAsset: mockCreate })
}));
jest.mock("../../../stores/timeline/TimelineStore", () => ({
  useTimelineStoreApi: () => ({ getState: () => ({ sequenceId: "seq_1" }) })
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: { getState: () => ({ activeProjectId: "project_1" }) }
}));
jest.mock("../../../utils/assetHelpers", () => ({
  getAssetUrl: () => "/storage/set.glb"
}));

const SEQUENCE = { fps: 10, width: 640, height: 360 };
const clip: TimelineClip = makeClip({
  id: "clip_1",
  trackId: "track_1",
  name: "Set",
  startMs: 0,
  durationMs: 1000,
  mediaType: "model3d",
  sourceType: "imported",
  status: "generated",
  currentAssetId: "asset_glb",
  model3dStyle: { ...DEFAULT_MODEL3D_STYLE }
});

/** Let queued promise callbacks run until the render mock has `count` calls. */
async function untilRenders(count: number): Promise<void> {
  for (let i = 0; i < 50 && mockRender.mock.calls.length < count; i++) {
    await Promise.resolve();
  }
  expect(mockRender).toHaveBeenCalledTimes(count);
}

beforeEach(() => {
  pending.length = 0;
  mockRender.mockClear();
  mockCreate.mockClear();
  created = 0;
  revision = "2026-11-01T10:00:00Z";
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(1)
  })) as unknown as typeof fetch;
});

describe("useBlockoutReference renderReferenceAsset", () => {
  it("joins a render in flight for the same pass and set", async () => {
    const { result } = renderHook(() => useBlockoutReference());
    const first = result.current.renderReferenceAsset(clip, SEQUENCE, "clay");
    const second = result.current.renderReferenceAsset(clip, SEQUENCE, "clay");
    await untilRenders(1);
    pending[0].resolve();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(mockRender).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0]).toContain("project_1");
  });

  it("renders a request for another pass after the running one, with its own pass and hash", async () => {
    const { result } = renderHook(() => useBlockoutReference());
    const clay = result.current.renderReferenceAsset(clip, SEQUENCE, "clay");
    const depth = result.current.renderReferenceAsset(clip, SEQUENCE, "depth");
    await untilRenders(1);
    expect(pending[0].pass).toBe("clay");
    pending[0].resolve();
    const clayRef = await clay;
    await untilRenders(2);
    expect(pending[1].pass).toBe("depth");
    pending[1].resolve();
    const depthRef = await depth;

    expect(clayRef.pass).toBe("clay");
    expect(depthRef.pass).toBe("depth");
    expect(depthRef.dependencyHash).toBe(computeModel3DReferenceHash(clip, SEQUENCE, "depth"));
    expect(depthRef.assetId).not.toBe(clayRef.assetId);
  });

  it("renders again when the set was saved during a render", async () => {
    const { result } = renderHook(() => useBlockoutReference());
    const before = result.current.renderReferenceAsset(clip, SEQUENCE, "clay");
    await untilRenders(1);
    revision = "2026-11-02T09:00:00Z";
    const after = result.current.renderReferenceAsset(clip, SEQUENCE, "clay");
    pending[0].resolve();
    expect((await before).assetRevision).toBe("2026-11-01T10:00:00Z");
    await untilRenders(2);
    pending[1].resolve();
    expect((await after).assetRevision).toBe("2026-11-02T09:00:00Z");
  });
});
