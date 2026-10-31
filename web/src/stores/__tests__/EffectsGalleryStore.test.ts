import { rpcRequest } from "../../lib/websocket/rpcRequest";
import { useEffectsGalleryStore } from "../EffectsGalleryStore";
import { getRememberedModel, getRememberedModelForTask, useLastModelStore } from "../lastModelStore";

jest.mock("../../lib/websocket/rpcRequest", () => ({
  rpcRequest: jest.fn()
}));

const request = {
  mode: "video" as const,
  provider: "fake",
  model: "fake-video",
  prompt: "",
  preset_ids: ["effect.levitate"],
  source_asset_id: "asset-1"
};
const remember = { kind: "video" as const, task: "image_to_video" };
const run = () => useEffectsGalleryStore.getState().run;

describe("EffectsGalleryStore", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    useEffectsGalleryStore.setState({
      sourceAssetId: null,
      effectId: null,
      run: { status: "idle", effectId: null, sourceAssetId: null, assetIds: [], error: null }
    });
    useLastModelStore.setState({ byKind: {}, byTask: {} });
  });

  it("sends generate_media and keeps the result and the model that made it", async () => {
    (rpcRequest as jest.Mock).mockResolvedValue({ asset_ids: ["out-1"] });
    const pending = useEffectsGalleryStore.getState().start(request, remember);
    expect(run().status).toBe("running");
    await pending;
    expect((rpcRequest as jest.Mock).mock.calls[0][0]).toBe("generate_media");
    expect((rpcRequest as jest.Mock).mock.calls[0][1]).toEqual(request);
    expect(run()).toMatchObject({
      status: "done",
      effectId: "effect.levitate",
      sourceAssetId: "asset-1",
      assetIds: ["out-1"]
    });
    expect(getRememberedModel("video")).toMatchObject({ provider: "fake", model: "fake-video" });
    expect(getRememberedModelForTask("video", "image_to_video")?.model).toBe("fake-video");
  });

  it("reports the server's reason and does not remember a failed model", async () => {
    (rpcRequest as jest.Mock).mockRejectedValue(new Error("No credits left."));
    await useEffectsGalleryStore.getState().start(request, remember);
    expect(run()).toMatchObject({ status: "failed", error: "No credits left." });
    expect(getRememberedModel("video")).toBeUndefined();
  });

  it("treats an answer with no assets as a failure", async () => {
    (rpcRequest as jest.Mock).mockResolvedValue({ asset_ids: [] });
    await useEffectsGalleryStore.getState().start(request, remember);
    expect(run()).toMatchObject({ status: "failed", error: "" });
  });

  it("clears a failure when the picture or the effect changes, but not a run in flight", async () => {
    (rpcRequest as jest.Mock).mockRejectedValue(new Error("boom"));
    await useEffectsGalleryStore.getState().start(request, remember);
    useEffectsGalleryStore.getState().setSourceAssetId("asset-2");
    expect(run().status).toBe("idle");

    (rpcRequest as jest.Mock).mockReturnValue(new Promise(() => undefined));
    void useEffectsGalleryStore.getState().start(request, remember);
    useEffectsGalleryStore.getState().selectEffect("effect.claymation");
    expect(run().status).toBe("running");
    expect(useEffectsGalleryStore.getState().effectId).toBe("effect.claymation");
  });

  it("ignores the answer of a request a newer one replaced", async () => {
    let finishFirst!: (value: Record<string, unknown>) => void;
    (rpcRequest as jest.Mock)
      .mockImplementationOnce(
        (_command: string, _data: unknown, _timeout: number, signal: AbortSignal) =>
          new Promise((resolve, reject) => {
            finishFirst = resolve;
            signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          })
      )
      .mockResolvedValueOnce({ asset_ids: ["second"] });
    const first = useEffectsGalleryStore.getState().start(request, remember);
    await useEffectsGalleryStore.getState().start({ ...request, preset_ids: ["effect.frost-crystals"] }, remember);
    finishFirst({ asset_ids: ["first"] });
    await first;
    expect(run()).toMatchObject({ status: "done", assetIds: ["second"], effectId: "effect.frost-crystals" });
  });
});
