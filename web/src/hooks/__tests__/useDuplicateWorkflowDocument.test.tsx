import { renderHook } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";

import { useDuplicateWorkflowDocument } from "../useDuplicateWorkflowDocument";
import { fetchWorkflowById } from "../../serverState/useWorkflow";

const mockCreate = jest.fn();
const mockOpenTab = jest.fn();
const mockInvalidate = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn()
}));
jest.mock("../../serverState/useWorkflow", () => ({
  fetchWorkflowById: jest.fn()
}));
jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: { create: jest.Mock }) => unknown) =>
    selector({ create: mockCreate })
}));
jest.mock("../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: (
    selector: (state: { openTab: jest.Mock }) => unknown
  ) => selector({ openTab: mockOpenTab })
}));

describe("useDuplicateWorkflowDocument", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useQueryClient as jest.Mock).mockReturnValue({
      invalidateQueries: mockInvalidate
    });
  });

  it("saves a private copy in the source project and opens it", async () => {
    const graph = { nodes: [{ id: "n1" }], edges: [] };
    (fetchWorkflowById as jest.Mock).mockResolvedValue({
      id: "wf-1",
      name: "Greeting Demo",
      access: "public",
      graph,
      project_id: "personal:1"
    });
    mockCreate.mockResolvedValue({
      id: "wf-2",
      name: "Greeting Demo (1)",
      project_id: "personal:1"
    });

    const { result } = renderHook(() => useDuplicateWorkflowDocument());
    await result.current("wf-1", ["Greeting Demo"]);

    const request = mockCreate.mock.calls[0][0];
    expect(request).toMatchObject({
      name: "Greeting Demo (1)",
      access: "private",
      graph,
      project_id: "personal:1"
    });
    expect(request.graph).not.toBe(graph);
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: [["documents"]] });
    expect(mockOpenTab).toHaveBeenCalledWith({
      type: "workflow",
      ref: "wf-2",
      mode: "edit",
      title: "Greeting Demo (1)",
      projectId: "personal:1"
    });
  });
});
