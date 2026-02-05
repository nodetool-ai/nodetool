import { renderHook, act } from "@testing-library/react";
import { useClipboardContentPaste } from "../useClipboardContentPaste";
import { useReactFlow } from "@xyflow/react";
import { useNodes } from "../../../contexts/NodeContext";
import { useAssetUpload } from "../../../serverState/useAssetUpload";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import useAuth from "../../../stores/useAuth";
import useMetadataStore from "../../../stores/MetadataStore";
import * as MousePosition from "../../../utils/MousePosition";
import * as Browser from "../../../utils/browser";

// Mock dependencies
jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn()
}));
jest.mock("../../../contexts/NodeContext");
jest.mock("../../../serverState/useAssetUpload");
jest.mock("../../../stores/AssetGridStore");
jest.mock("../../../stores/useAuth");
jest.mock("../../../stores/MetadataStore");
jest.mock("../../../utils/MousePosition");
jest.mock("../../../utils/browser");

describe("useClipboardContentPaste Performance", () => {
  const mockScreenToFlowPosition = jest.fn();
  const mockCreateNode = jest.fn();
  const mockAddNode = jest.fn();
  const mockUploadAsset = jest.fn();
  const mockGetMetadata = jest.fn();

  // Mocks setup (similar to existing test)
  beforeEach(() => {
    jest.clearAllMocks();
    (useReactFlow as jest.Mock).mockReturnValue({ screenToFlowPosition: mockScreenToFlowPosition });
    (useNodes as unknown as jest.Mock).mockReturnValue({ createNode: mockCreateNode, addNode: mockAddNode, workflow: { id: "1" } });
    (useAssetUpload as unknown as jest.Mock).mockReturnValue({ uploadAsset: mockUploadAsset });
    (useAssetGridStore as unknown as jest.Mock).mockReturnValue({ currentFolderId: "1" });
    (useAuth as unknown as jest.Mock).mockReturnValue({ user: { id: "1" } });
    (useMetadataStore as unknown as jest.Mock).mockReturnValue({ getMetadata: mockGetMetadata });
  });

  it("measures performance of sequential reads when first item fails", async () => {
    // Mock navigator.clipboard
    const originalClipboard = navigator.clipboard;

    const readMock = jest.fn().mockResolvedValue([
      {
        types: ["image/png"],
        getType: jest.fn().mockImplementation(() => new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Failed")), 100);
        }))
      },
      {
        types: ["image/jpeg"],
        getType: jest.fn().mockImplementation(() => new Promise((resolve) => {
            setTimeout(() => resolve(new Blob(["data"], { type: "image/jpeg" })), 50);
        }))
      }
    ]);

    Object.defineProperty(navigator, "clipboard", {
      value: { read: readMock },
      writable: true,
      configurable: true
    });

    const { result } = renderHook(() => useClipboardContentPaste());

    const start = performance.now();
    await act(async () => {
      const content = await result.current.readClipboardContent();
      expect(content.type).toBe("image");
      expect(content.mimeType).toBe("image/jpeg");
    });
    const end = performance.now();

    // Restore clipboard
    if (originalClipboard) {
       Object.defineProperty(navigator, "clipboard", { value: originalClipboard, writable: true });
    } else {
       // @ts-ignore
       delete navigator.clipboard;
    }
  });
});
