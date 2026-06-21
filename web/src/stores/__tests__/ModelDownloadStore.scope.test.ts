jest.mock("../BASE_URL", () => ({
  BASE_URL: "http://localhost:7777",
  DOWNLOAD_URL: "ws://localhost:7777/hf/download"
}));

jest.mock("../../lib/trpc", () => ({
  trpc: {
    models: {
      pullOllamaModel: { mutate: jest.fn() }
    }
  }
}));

import { useModelDownloadStore } from "../ModelDownloadStore";

const originalState = useModelDownloadStore.getState();

beforeEach(() => {
  useModelDownloadStore.setState(
    { ...originalState, downloads: {}, ws: null, isDialogOpen: false },
    true
  );
});

describe("startDownload scope", () => {
  it("defaults to scope=local in the start_download command", async () => {
    const sent: Record<string, unknown>[] = [];
    const mockWs = {
      send: (s: string) => sent.push(JSON.parse(s)),
      readyState: WebSocket.OPEN
    } as unknown as WebSocket;
    useModelDownloadStore.setState(
      { connectWebSocket: jest.fn().mockResolvedValue(mockWs) },
      false
    );

    await useModelDownloadStore
      .getState()
      .startDownload("org/m", "hf.model");

    const cmd = sent.find((s) => s.command === "start_download");
    expect(cmd?.scope).toBe("local");
  });

  it("includes scope=worker in the start_download WS command", async () => {
    const sent: Record<string, unknown>[] = [];
    const mockWs = {
      send: (s: string) => sent.push(JSON.parse(s)),
      readyState: WebSocket.OPEN
    } as unknown as WebSocket;
    useModelDownloadStore.setState(
      { connectWebSocket: jest.fn().mockResolvedValue(mockWs) },
      false
    );

    await useModelDownloadStore
      .getState()
      .startDownload("org/m", "hf.model", null, null, null, "worker");

    const cmd = sent.find((s) => s.command === "start_download");
    expect(cmd?.scope).toBe("worker");
    expect(cmd?.repo_id).toBe("org/m");
  });
});
