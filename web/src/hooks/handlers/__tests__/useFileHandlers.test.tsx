/**
 * `handleGenericFile` is what a canvas drop of an image/audio/video/document
 * lands in. Two shapes matter and neither used to be covered: uploading the
 * file (browser, or Electron when the drop exposes no disk path) and
 * referencing it in place via `file://` (Electron local mode).
 *
 * The upload branch used to `await` a queue call that returns immediately, so a
 * failed upload reported a successful drop — no node, no error, nothing in the
 * log. That is the shape of nodetool-ai/nodetool#4999.
 */
import { renderHook } from "@testing-library/react";
import type { Asset } from "../../../stores/ApiTypes";

type UploadArgs = {
  file: File;
  onCompleted?: (asset: Asset) => void;
  onFailed?: (error: string) => void;
};

const mockUploadAsset = jest.fn<void, [UploadArgs]>();
const mockAddNotification = jest.fn();
const mockAddNode = jest.fn();
const mockCreateNode = jest.fn(() => ({
  id: "node-1",
  data: { properties: {} as Record<string, unknown> }
}));
const mockGetLocalFilePath = jest.fn<string | null, [File]>(() => null);

jest.mock("../../../serverState/useAssetUpload", () => ({
  useAssetUpload: () => ({ uploadAsset: mockUploadAsset })
}));
jest.mock("../../../stores/AssetGridStore", () => ({
  useAssetGridStore: (selector: (state: unknown) => unknown) =>
    selector({ currentFolderId: null }),
  useLibraryCurrentFolderId: () => null
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (selector: (state: unknown) => unknown) =>
    selector({ addNotification: mockAddNotification })
}));
jest.mock("../../../stores/useAuth", () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: "user-1" } })
}));
jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) =>
    selector({ getMetadata: () => ({ node_type: "nodetool.constant.Image" }) })
}));
jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: (selector: (state: unknown) => unknown) =>
    selector({
      createNode: mockCreateNode,
      addNode: mockAddNode,
      workflow: { id: "workflow-1" }
    })
}));
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector({ create: jest.fn() })
}));
jest.mock("../useCreateDataframe", () => ({
  useCreateDataframe: () => jest.fn(() => [])
}));
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }));
jest.mock("../../../utils/localFile", () => ({
  getLocalFilePath: (file: File) => mockGetLocalFilePath(file),
  pathToFileUri: (p: string) => `file://${p}`
}));

import { useFileHandlers } from "../dropHandlerUtils";

const png = () => new File(["bytes"], "playingTag.png", { type: "image/png" });
const position = { x: 0, y: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLocalFilePath.mockReturnValue(null);
});

describe("handleGenericFile", () => {
  it("reports a failed upload instead of a successful drop", async () => {
    mockUploadAsset.mockImplementation(({ onFailed }) => {
      onFailed?.("storage is full");
    });

    const { result } = renderHook(() => useFileHandlers());
    const outcome = await result.current.handleGenericFile(png(), position);

    expect(outcome.success).toBe(false);
    expect(outcome.error).toContain("storage is full");
    expect(mockAddNode).not.toHaveBeenCalled();
  });

  it("adds a node pointing at the uploaded asset", async () => {
    mockUploadAsset.mockImplementation(({ onCompleted }) => {
      onCompleted?.({
        id: "asset-1",
        name: "playingTag.png",
        content_type: "image/png",
        get_url: "http://localhost:7777/api/storage/user-1/asset-1.png"
      } as Asset);
    });

    const { result } = renderHook(() => useFileHandlers());
    const outcome = await result.current.handleGenericFile(png(), position);

    expect(outcome.success).toBe(true);
    expect(mockAddNode).toHaveBeenCalledTimes(1);
    expect(mockCreateNode.mock.results[0].value.data.properties.value).toEqual({
      type: "image",
      uri: "http://localhost:7777/api/storage/user-1/asset-1.png",
      asset_id: "asset-1",
      temp_id: null
    });
  });

  it("references a dropped file in place when it has a disk path", async () => {
    mockGetLocalFilePath.mockReturnValue("C:\\projects\\playingTag.png");

    const { result } = renderHook(() => useFileHandlers());
    const outcome = await result.current.handleGenericFile(png(), position);

    expect(outcome.success).toBe(true);
    expect(mockUploadAsset).not.toHaveBeenCalled();
    expect(mockCreateNode.mock.results[0].value.data.properties.value).toEqual({
      type: "image",
      uri: "file://C:\\projects\\playingTag.png",
      asset_id: null,
      temp_id: null
    });
  });
});
