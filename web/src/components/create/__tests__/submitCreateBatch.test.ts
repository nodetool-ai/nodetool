import { submitCreateBatch } from "../submitCreateBatch";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: { send: jest.fn() }
}));

const send = jest.mocked(globalWebSocketManager.send);

describe("submitCreateBatch", () => {
  beforeEach(() => send.mockReset().mockResolvedValue(undefined));

  it("sends one generate_media command per take, each with its own request id", async () => {
    const result = await submitCreateBatch([
      { mode: "image", prompt: "a", seed: 1 },
      { mode: "image", prompt: "a", seed: 2 },
      { mode: "image", prompt: "a", seed: 3 }
    ]);
    expect(send).toHaveBeenCalledTimes(3);
    const sent = send.mock.calls.map(([message]) => message);
    expect(sent.every((message) => message.command === "generate_media")).toBe(true);
    expect(new Set(sent.map((message) => message.request_id)).size).toBe(3);
    expect(sent.map((message) => (message.data as { seed: number }).seed)).toEqual([1, 2, 3]);
    expect(result.sent).toHaveLength(3);
    expect(result.error).toBeNull();
  });

  it("stops at the first take that cannot be sent and reports how many left", async () => {
    send
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("socket closed"));
    const result = await submitCreateBatch([{ prompt: "a" }, { prompt: "b" }, { prompt: "c" }]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.sent).toHaveLength(1);
    expect(result.error?.message).toBe("socket closed");
  });
});
