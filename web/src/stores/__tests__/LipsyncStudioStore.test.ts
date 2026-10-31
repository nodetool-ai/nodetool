import { rpcRequest } from "../../lib/websocket/rpcRequest";
import { useLipsyncStudioStore } from "../LipsyncStudioStore";
jest.mock("../../lib/websocket/rpcRequest", () => ({ rpcRequest: jest.fn() }));
const speech = { model: "tts", provider: "fake", voice: "alloy" };
const video = { model: "lipsync", provider: "fake" };
const state = () => useLipsyncStudioStore.getState();
beforeEach(() => {
  jest.resetAllMocks();
  useLipsyncStudioStore.setState({
    sourceAssetId: "01234567890123456789012345678901",
    text: "Hello",
    status: "idle",
    realPerson: false,
    confirmed: false,
    assetIds: [],
    error: null
  });
});
it("requires consent before either paid call and resets it on a new reference", async () => {
  state().setRealPerson(true);
  await state().start(speech, video);
  expect(rpcRequest).not.toHaveBeenCalled();
  state().setConfirmed(true);
  state().setSource("other");
  expect(state().confirmed).toBe(false);
});
it("awaits speech then sends its full asset id with recorded consent", async () => {
  state().setRealPerson(true);
  state().setConfirmed(true);
  (rpcRequest as jest.Mock)
    .mockResolvedValueOnce({ asset_ids: ["abcdefabcdefabcdefabcdefabcdefab"] })
    .mockResolvedValueOnce({ asset_ids: ["clip"] });
  await state().start(speech, video);
  expect(
    (rpcRequest as jest.Mock).mock.calls.map((call) => call[1].mode)
  ).toEqual(["audio", "audio_to_video"]);
  expect((rpcRequest as jest.Mock).mock.calls[1][1]).toMatchObject({
    source_asset_id: state().sourceAssetId,
    audio_asset_id: "abcdefabcdefabcdefabcdefabcdefab",
    person_consent: { real_person: true, confirmed: true }
  });
  expect(state()).toMatchObject({ status: "done", assetIds: ["clip"] });
});
it("stops on a speech failure and allows retry", async () => {
  (rpcRequest as jest.Mock).mockRejectedValue(new Error("Speech failed"));
  await state().start(speech, video);
  expect(rpcRequest).toHaveBeenCalledTimes(1);
  expect(state()).toMatchObject({ status: "failed", error: "Speech failed" });
});
it("rejects duplicate submission while speech is pending", async () => {
  (rpcRequest as jest.Mock).mockReturnValue(new Promise(() => undefined));
  void state().start(speech, video);
  await state().start(speech, video);
  expect(rpcRequest).toHaveBeenCalledTimes(1);
});
