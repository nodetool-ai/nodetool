jest.mock("../ApiClient", () => ({
  BASE_URL: "http://localhost:8000",
  DOWNLOAD_URL: "ws://localhost/hf/download"
}));
jest.mock("../BASE_URL", () => ({
  BASE_URL: "http://localhost:8000",
  DOWNLOAD_URL: "ws://localhost:8000/hf/download"
}));
import { useModelDownloadStore } from "../ModelDownloadStore";

const originalDownloadState = useModelDownloadStore.getState();

beforeEach(() => {
  jest.restoreAllMocks();
  useModelDownloadStore.setState(
    {
      ...originalDownloadState,
      downloads: {},
      ws: null,
      isDialogOpen: false,
      connectWebSocket: originalDownloadState.connectWebSocket,
      disconnectWebSocket: originalDownloadState.disconnectWebSocket,
      addDownload: originalDownloadState.addDownload,
      updateDownload: originalDownloadState.updateDownload,
      removeDownload: originalDownloadState.removeDownload,
      startDownload: originalDownloadState.startDownload,
      cancelDownload: originalDownloadState.cancelDownload,
      openDialog: originalDownloadState.openDialog,
      closeDialog: originalDownloadState.closeDialog
    },
    true
  );
});

afterEach(() => {
  // reset store state
  useModelDownloadStore.setState(
    {
      ...originalDownloadState,
      downloads: {},
      ws: null,
      isDialogOpen: false
    },
    true
  );
});

describe("ModelDownloadStore", () => {
  test("addDownload adds a new download with default values", () => {
    useModelDownloadStore.getState().addDownload("model1");
    const download = useModelDownloadStore.getState().downloads["model1"];
    expect(download).toMatchObject({
      id: "model1",
      status: "pending",
      downloadedBytes: 0,
      totalBytes: 0,
      speed: null,
      speedHistory: []
    });
  });

  test("updateDownload updates speed history and calculates speed", () => {
    const nowSpy = jest.spyOn(Date, "now");
    useModelDownloadStore.getState().addDownload("model2");

    nowSpy.mockReturnValueOnce(0);
    useModelDownloadStore
      .getState()
      .updateDownload("model2", { downloadedBytes: 100 });
    expect(
      useModelDownloadStore.getState().downloads["model2"].speed
    ).toBeNull();

    nowSpy.mockReturnValueOnce(1000);
    useModelDownloadStore
      .getState()
      .updateDownload("model2", { downloadedBytes: 1100 });
    const download = useModelDownloadStore.getState().downloads["model2"];
    expect(download.speed).toBe(1000);
    expect(download.speedHistory.length).toBe(2);
    nowSpy.mockRestore();
  });

  test("updateDownload initializes missing download entries", () => {
    useModelDownloadStore.getState().updateDownload("new-model", {
      status: "progress",
      downloadedBytes: 50,
      totalBytes: 100
    });
    const download = useModelDownloadStore.getState().downloads["new-model"];
    expect(download).toBeDefined();
    expect(download.status).toBe("progress");
    expect(download.downloadedBytes).toBe(50);
    expect(download.totalBytes).toBe(100);
  });

  test("completed status is corrected when totals are not reached", () => {
    useModelDownloadStore.getState().addDownload("model4");
    useModelDownloadStore.getState().updateDownload("model4", {
      status: "completed",
      downloadedBytes: 50,
      totalBytes: 100,
      downloadedFiles: 1,
      totalFiles: 2
    });
    const download = useModelDownloadStore.getState().downloads["model4"];
    expect(download.status).toBe("progress");
  });

  test("removeDownload removes the specified download", () => {
    useModelDownloadStore.getState().addDownload("model3");
    useModelDownloadStore.getState().removeDownload("model3");
    expect(
      useModelDownloadStore.getState().downloads["model3"]
    ).toBeUndefined();
  });

  test("startDownload for huggingface model sends websocket message", async () => {
    const sendMock = jest.fn();
    const mockWs = {
      send: sendMock,
      readyState: WebSocket.OPEN
    } as unknown as WebSocket;
    const connectMock = jest.fn().mockResolvedValue(mockWs);

    useModelDownloadStore.setState({ connectWebSocket: connectMock }, false);

    await useModelDownloadStore.getState().startDownload("repo1", "hf.model");

    expect(connectMock).toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledWith(
      JSON.stringify({
        command: "start_download",
        repo_id: "repo1",
        path: undefined,
        allow_patterns: undefined,
        ignore_patterns: undefined
      })
    );

    expect(useModelDownloadStore.getState().downloads["repo1"]).toBeDefined();
  });

  test("startDownload throws when path and allowPatterns provided", async () => {
    await expect(
      useModelDownloadStore
        .getState()
        .startDownload("repo2", "hf.model", "path", ["a"])
    ).rejects.toThrow("allowPatterns is not supported when path is provided");
  });

  test("startDownload for llama_model triggers fetch call", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({ read: jest.fn().mockResolvedValue({ done: true }) })
      }
    } as any);
    (global as any).fetch = fetchMock;

    await useModelDownloadStore
      .getState()
      .startDownload("llama", "llama_model");

    expect(fetchMock).toHaveBeenCalled();
    const download = useModelDownloadStore.getState().downloads["llama"];
    expect(download).toBeDefined();
  });
});
