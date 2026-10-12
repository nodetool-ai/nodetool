import { renderHook, act } from "@testing-library/react";

const exportScript = jest.fn();
const createJsScript = jest.fn();
const invalidateList = jest.fn();
const openTab = jest.fn();
const addNotification = jest.fn();
const saveBlobAsFile = jest.fn();

const graph = { nodes: [{ id: "n1", type: "nodetool.constant.String" }], edges: [] };
const workflow = { id: "wf-1", name: "Poster maker", graph };

jest.mock("../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({ jsScripts: { list: { invalidate: invalidateList } } })
  },
  trpcClient: {
    workflows: { exportScript: { mutate: exportScript } },
    jsScripts: { create: { mutate: createJsScript } }
  }
}));
jest.mock("../../contexts/NodeContext", () => ({
  useNodes: (selector: (state: { getWorkflow: () => typeof workflow }) => unknown) =>
    selector({ getWorkflow: () => workflow })
}));
jest.mock("../../stores/NotificationStore", () => ({
  useNotificationStore: (
    selector: (state: { addNotification: typeof addNotification }) => unknown
  ) => selector({ addNotification })
}));
jest.mock("../../stores/WorkspaceTabsStore", () => ({
  creationProjectId: () => "proj-1",
  useWorkspaceTabsStore: (selector: (state: { openTab: typeof openTab }) => unknown) =>
    selector({ openTab })
}));
jest.mock("../../utils/downloadResponse", () => ({
  saveBlobAsFile: (...args: unknown[]) => saveBlobAsFile(...args)
}));

import { useWorkflowScriptExport } from "../useWorkflowScriptExport";

const exported = {
  code: "// script",
  filename: "Poster_maker.mjs",
  inputs: [{ name: "prompt", type: "str" }],
  outputs: [{ name: "image", type: "image" }],
  unsupported: []
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useWorkflowScriptExport", () => {
  it("creates a JS script document from the editor's graph and opens it", async () => {
    exportScript.mockResolvedValue({ ...exported, filename: "Poster_maker.js" });
    createJsScript.mockResolvedValue({
      id: "js-1",
      name: "Poster maker (script)",
      projectId: "proj-1"
    });
    const { result } = renderHook(() => useWorkflowScriptExport());

    await act(() => result.current.convertToJsScript());

    expect(exportScript).toHaveBeenCalledWith({ id: "wf-1", target: "sandbox", graph });
    expect(createJsScript).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Poster maker (script)",
        projectId: "proj-1",
        document: expect.objectContaining({
          code: "// script",
          inputs: exported.inputs,
          outputs: exported.outputs
        })
      })
    );
    expect(openTab).toHaveBeenCalledWith(
      expect.objectContaining({ type: "jsscript", ref: "js-1", mode: "edit" })
    );
    expect(addNotification).not.toHaveBeenCalled();
  });

  it("downloads the Node.js script under the server's file name", async () => {
    exportScript.mockResolvedValue(exported);
    const { result } = renderHook(() => useWorkflowScriptExport());

    await act(() => result.current.downloadNodeScript());

    expect(exportScript).toHaveBeenCalledWith({ id: "wf-1", target: "node", graph });
    expect(saveBlobAsFile).toHaveBeenCalledWith(expect.any(Blob), "Poster_maker.mjs");
    expect(createJsScript).not.toHaveBeenCalled();
  });

  it("warns when the script refuses nodes, and reports a failed conversion", async () => {
    exportScript.mockResolvedValueOnce({
      ...exported,
      unsupported: [
        { node_id: "n2", node_type: "nodetool.text.Concat", message: "receives …" }
      ]
    });
    const { result } = renderHook(() => useWorkflowScriptExport());
    await act(() => result.current.downloadNodeScript());
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "warning", content: expect.stringContaining("Concat") })
    );

    exportScript.mockRejectedValueOnce(new Error("Workflow contains a cycle"));
    await act(() => result.current.downloadNodeScript());
    expect(addNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: "error", content: expect.stringContaining("cycle") })
    );
    expect(saveBlobAsFile).toHaveBeenCalledTimes(1);
  });
});
