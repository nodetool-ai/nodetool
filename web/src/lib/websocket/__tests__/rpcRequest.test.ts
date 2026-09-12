import { rpcRequest } from "../rpcRequest";
import {
  globalWebSocketManager,
  type WebSocketMessage
} from "../GlobalWebSocketManager";

jest.mock("../GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(),
    send: jest.fn().mockResolvedValue(undefined)
  }
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => jest.useRealTimers());

it("releases a read request whose reply was lost with the socket", async () => {
  const unsubscribe = jest.fn();
  jest.mocked(globalWebSocketManager.subscribe).mockReturnValue(unsubscribe);
  const result = rpcRequest("lookup_generations", { request_ids: ["req-1"] }, 1000);
  const rejected = expect(result).rejects.toThrow("timed out");
  await jest.advanceTimersByTimeAsync(1000);
  await rejected;
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

it("clears the timeout when a reply arrives", async () => {
  const unsubscribe = jest.fn();
  let reply: ((message: WebSocketMessage) => void) | undefined;
  jest.mocked(globalWebSocketManager.subscribe).mockImplementation((_id, handler) => {
    reply = handler;
    return unsubscribe;
  });
  const result = rpcRequest("lookup_generations", {}, 1000);
  await jest.advanceTimersByTimeAsync(0);
  const id = jest.mocked(globalWebSocketManager.subscribe).mock.calls[0][0];
  reply?.({ type: "rpc_response", request_id: id, result: { generations: [] } });
  await expect(result).resolves.toEqual({ generations: [] });
  expect(jest.getTimerCount()).toBe(0);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
