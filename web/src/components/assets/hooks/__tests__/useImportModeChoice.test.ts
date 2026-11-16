/**
 * When an import asks Copy or Link: only on the desktop app, for a file with
 * a disk path, against a server that can reference files in place. A plain
 * browser copies without asking.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { useImportModeChoice } from "../useImportModeChoice";
import { getLocalFilePath } from "../../../../utils/localFile";
import { trpcClient } from "../../../../trpc/client";

jest.mock("../../../../utils/localFile", () => ({
  getLocalFilePath: jest.fn()
}));

jest.mock("../../../../trpc/client", () => ({
  trpcClient: {
    assets: { externalImportConfig: { query: jest.fn() } }
  }
}));

const diskPath = getLocalFilePath as jest.Mock;
const configQuery = trpcClient.assets.externalImportConfig.query as jest.Mock;
const file = new File(["x"], "clip.mp4", { type: "video/mp4" });

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useImportModeChoice", () => {
  it("copies without asking when a file has no disk path, as in a browser", () => {
    diskPath.mockReturnValue(null);
    const upload = jest.fn();
    const { result } = renderHook(() => useImportModeChoice(upload));

    act(() => result.current.importFiles([file]));

    expect(upload).toHaveBeenCalledWith([file]);
    expect(configQuery).not.toHaveBeenCalled();
    expect(result.current.request).toBeNull();
  });

  it("asks on the desktop app and imports with the chosen mode", async () => {
    diskPath.mockReturnValue("/media/clip.mp4");
    configQuery.mockResolvedValue({ enabled: true, threshold_bytes: 10 });
    const upload = jest.fn();
    const { result } = renderHook(() => useImportModeChoice(upload));

    act(() => result.current.importFiles([file]));
    await waitFor(() =>
      expect(result.current.request).toEqual({ files: [file], thresholdBytes: 10 })
    );
    expect(upload).not.toHaveBeenCalled();

    act(() => result.current.choose("link"));
    expect(upload).toHaveBeenCalledWith([file], "link");
    expect(result.current.request).toBeNull();
  });

  it("imports nothing when the creator cancels", async () => {
    diskPath.mockReturnValue("/media/clip.mp4");
    configQuery.mockResolvedValue({ enabled: true, threshold_bytes: 10 });
    const upload = jest.fn();
    const { result } = renderHook(() => useImportModeChoice(upload));

    act(() => result.current.importFiles([file]));
    await waitFor(() => expect(result.current.request).not.toBeNull());
    act(() => result.current.cancel());

    expect(upload).not.toHaveBeenCalled();
    expect(result.current.request).toBeNull();
  });

  it("copies without asking when the server cannot link, as in production", async () => {
    diskPath.mockReturnValue("/media/clip.mp4");
    configQuery.mockResolvedValue({ enabled: false, threshold_bytes: 10 });
    const upload = jest.fn();
    const { result } = renderHook(() => useImportModeChoice(upload));

    act(() => result.current.importFiles([file]));

    await waitFor(() => expect(upload).toHaveBeenCalledWith([file], "copy"));
    expect(result.current.request).toBeNull();
  });
});
