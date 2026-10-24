/**
 * Document fields the sync used to drop:
 *
 * - Accepting a refused external timeline link, storyboard link or creative
 *   context cleared the banner entry and kept the draft's value.
 * - A script filled from a template lost `templateId` on its first autosave,
 *   because the server replaces the whole document.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { trpc, trpcClient } from "../../../trpc/client";
import { useScriptStore } from "../../../stores/script/ScriptStore";
import { handleDocumentResourceChange } from "../../../stores/documentSync";
import { useScriptServerSync } from "../useScriptServerSync";
import { useDocumentConflicts } from "../../useDocumentConflicts";

jest.mock("../../../trpc/client", () => ({
  trpc: { useUtils: jest.fn() },
  trpcClient: {
    scripts: {
      get: { query: jest.fn() },
      create: { mutate: jest.fn() },
      update: { mutate: jest.fn() }
    }
  }
}));

const getQuery = trpcClient.scripts.get.query as jest.Mock;
const updateMutate = trpcClient.scripts.update.mutate as jest.Mock;

const document = {
  cast: [],
  sections: [{ id: "sec-1", lines: [{ id: "l1", text: "one", takes: [] }] }]
};
const response = {
  id: "s1",
  name: "Saved script",
  document,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "rev-1"
};

beforeEach(() => {
  jest.clearAllMocks();
  useScriptStore.setState({
    scripts: {},
    serverRevisions: {},
    saveStatus: {},
    voicingLineIds: {},
    history: {}
  });
  (trpc.useUtils as jest.Mock).mockReturnValue({
    scripts: { list: { invalidate: jest.fn() } }
  });
  getQuery.mockResolvedValue(response);
  updateMutate.mockImplementation(async (input) => ({
    ...response,
    name: input.name,
    document: input.document,
    updatedAt: "rev-saved"
  }));
});

const loaded = async (): Promise<void> =>
  waitFor(() =>
    expect(useScriptStore.getState().serverRevisions["s1"]).toBeDefined()
  );

describe("useScriptServerSync document fields", () => {
  it("takes the external timeline link when its conflict is accepted", async () => {
    const rendered = renderHook(() => {
      useScriptServerSync("s1");
      return useDocumentConflicts("script", "s1");
    });
    await loaded();
    act(() => useScriptStore.getState().setTimelineLink("s1", "seq-local"));
    getQuery.mockResolvedValue({
      ...response,
      timelineId: "seq-agent",
      updatedAt: "rev-2"
    });
    await act(async () => {
      handleDocumentResourceChange("script", {
        event: "updated",
        id: "s1",
        updatedAt: "rev-2",
        ops: [{ tool: "set_link", input: { timeline_id: "seq-agent" } }]
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(rendered.result.current.items).toHaveLength(1));
    const item = rendered.result.current.items[0];
    expect(useScriptStore.getState().scripts["s1"].timelineId).toBe("seq-local");

    act(() => rendered.result.current.accept(item.unitId));
    expect(useScriptStore.getState().scripts["s1"].timelineId).toBe("seq-agent");
    rendered.unmount();
  });

  it("saves templateId back with the rest of the document", async () => {
    getQuery.mockResolvedValue({
      ...response,
      document: { ...document, templateId: "tpl-1" }
    });
    const rendered = renderHook(() => useScriptServerSync("s1"));
    await loaded();
    act(() => useScriptStore.getState().setTitle("s1", "Renamed"));
    await waitFor(() => expect(updateMutate).toHaveBeenCalled(), {
      timeout: 3000
    });
    expect(updateMutate.mock.calls[0][0].document.templateId).toBe("tpl-1");
    rendered.unmount();
  });
});
