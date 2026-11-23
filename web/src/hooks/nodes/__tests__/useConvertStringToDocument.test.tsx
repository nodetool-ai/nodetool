import { renderHook, act } from "@testing-library/react";

const mockCreateAsset = jest.fn();
const mockNotify = jest.fn();
let mockState: Record<string, unknown>;

jest.mock("../../../contexts/NodeContext", () => ({
  useNodeStoreRef: () => ({ getState: () => mockState })
}));
jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: (selector: (s: { createAsset: typeof mockCreateAsset }) => unknown) =>
    selector({ createAsset: mockCreateAsset })
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (selector: (s: { addNotification: typeof mockNotify }) => unknown) =>
    selector({ addNotification: mockNotify })
}));
jest.mock("../../../stores/WorkspaceTabsStore", () => ({ creationProjectId: () => "fallback" }));
jest.mock("../../../queryClient", () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock("../../../components/properties/ProjectDocumentSelect", () => ({
  projectDocumentValue: (assetId: string) => ({ type: "document", uri: `asset://${assetId}`, asset_id: assetId })
}));

import { useConvertStringToDocument } from "../useConvertStringToDocument";

describe("useConvertStringToDocument", () => {
  it("creates the document, retypes the node and moves its edges to the text output", async () => {
    const updateNodeData = jest.fn();
    const updateNode = jest.fn();
    const setEdges = jest.fn();
    mockState = {
      findNode: () => ({
        id: "s1",
        type: "nodetool.constant.String",
        data: { title: "Brief", properties: { value: "# Brief" } }
      }),
      updateNodeData,
      updateNode,
      setEdges,
      getWorkflow: () => ({ project_id: "p1" }),
      edges: [
        { id: "e1", source: "s1", sourceHandle: "output", target: "llm", targetHandle: "prompt" },
        { id: "e2", source: "x", sourceHandle: "output", target: "s1", targetHandle: "value" }
      ]
    };
    mockCreateAsset.mockResolvedValue({ id: "doc1", name: "Brief.md" });
    const { result } = renderHook(() => useConvertStringToDocument());
    await act(() => result.current("s1"));

    const [file, , , , , projectId] = mockCreateAsset.mock.calls[0];
    expect(file.name).toBe("Brief.md");
    expect(file.type).toBe("text/markdown");
    expect(file.size).toBe("# Brief".length);
    expect(projectId).toBe("p1");
    expect(updateNodeData).toHaveBeenCalledWith("s1", {
      properties: { value: { type: "document", uri: "asset://doc1", asset_id: "doc1" } }
    });
    expect(updateNode).toHaveBeenCalledWith("s1", { type: "nodetool.constant.Document" });
    expect(setEdges).toHaveBeenCalledWith([
      expect.objectContaining({ id: "e1", sourceHandle: "text" }),
      expect.objectContaining({ id: "e2", sourceHandle: "output" })
    ]);
  });
});
