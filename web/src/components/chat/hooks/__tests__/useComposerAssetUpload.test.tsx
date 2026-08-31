import "@testing-library/jest-dom";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useComposerAssetUpload } from "../useComposerAssetUpload";
import useAssetUpload from "../../../../serverState/useAssetUpload";
import { useNotificationStore } from "../../../../stores/NotificationStore";
import type { Asset } from "../../../../stores/ApiTypes";

const asset = (id: string): Asset =>
  ({
    id,
    user_id: "u1",
    name: `${id}.png`,
    content_type: "image/png",
    thumb_url: `https://example.test/${id}-thumb.png`,
    get_url: `https://example.test/${id}.png`
  }) as Asset;

const pickedFile = (name: string) =>
  new File(["bytes"], name, { type: "image/png" });

/** Replace the upload queue's action so no network or asset store is involved. */
const stubUploads = (
  handler: (input: {
    file: File;
    onCompleted?: (asset: Asset) => void;
    onFailed?: (error: string) => void;
  }) => void
) => {
  useAssetUpload.setState({ uploadAsset: handler });
};

beforeEach(() => {
  useNotificationStore.setState({ notifications: [] });
});

describe("useComposerAssetUpload", () => {
  it("attaches each uploaded file as an asset reference", async () => {
    stubUploads(({ file, onCompleted }) =>
      onCompleted?.(asset(file.name.replace(".png", "")))
    );
    const onAssetsUploaded = jest.fn();
    const { result } = renderHook(() =>
      useComposerAssetUpload(onAssetsUploaded)
    );

    act(() => {
      result.current.uploadFiles([pickedFile("a.png"), pickedFile("b.png")]);
    });

    await waitFor(() => expect(onAssetsUploaded).toHaveBeenCalledTimes(2));
    expect(onAssetsUploaded.mock.calls[0][0][0]).toMatchObject({
      name: "a.png",
      type: "image/png",
      assetUri: "asset://a.png",
      dataUri: "https://example.test/a-thumb.png"
    });
    expect(onAssetsUploaded.mock.calls[1][0][0]).toMatchObject({
      assetUri: "asset://b.png"
    });
  });

  it("reports uploading until every file settles", async () => {
    const completions: Array<() => void> = [];
    stubUploads(({ file, onCompleted }) =>
      completions.push(() => onCompleted?.(asset(file.name.replace(".png", ""))))
    );
    const { result } = renderHook(() => useComposerAssetUpload(jest.fn()));

    expect(result.current.isUploading).toBe(false);
    act(() => {
      result.current.uploadFiles([pickedFile("a.png"), pickedFile("b.png")]);
    });
    expect(result.current.isUploading).toBe(true);

    act(() => completions[0]());
    expect(result.current.isUploading).toBe(true);

    act(() => completions[1]());
    expect(result.current.isUploading).toBe(false);
  });

  it("notifies and attaches nothing when an upload fails", async () => {
    stubUploads(({ onFailed }) => onFailed?.("disk full"));
    const onAssetsUploaded = jest.fn();
    const { result } = renderHook(() =>
      useComposerAssetUpload(onAssetsUploaded)
    );

    act(() => {
      result.current.uploadFiles([pickedFile("a.png")]);
    });

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications).toHaveLength(1)
    );
    expect(useNotificationStore.getState().notifications[0].content).toContain(
      "Failed to upload a.png: disk full"
    );
    expect(onAssetsUploaded).not.toHaveBeenCalled();
    expect(result.current.isUploading).toBe(false);
  });

  it("does nothing when the picker is dismissed with no files", () => {
    const uploadAsset = jest.fn();
    stubUploads(uploadAsset);
    const { result } = renderHook(() => useComposerAssetUpload(jest.fn()));

    act(() => {
      result.current.uploadFiles([]);
    });

    expect(uploadAsset).not.toHaveBeenCalled();
    expect(result.current.isUploading).toBe(false);
  });
});
