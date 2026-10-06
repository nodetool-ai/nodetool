import { act, renderHook } from "@testing-library/react";

import { useSettingsStore } from "../../stores/SettingsStore";
import type { NodeStore } from "../../stores/NodeStore";
import type { WorkflowManagerStore } from "../../stores/WorkflowManagerStore";
import { triggerAutosaveForWorkflow } from "../useAutosave";
import { autosaveIfDirty, useWorkflowAutosave } from "../useWorkflowAutosave";

jest.mock("../useAutosave");

interface FakeNodeState {
  workflowIsDirty: boolean;
  nodes: unknown[];
  edges: unknown[];
  workflow: { id: string; updated_at: string };
  getWorkflow: () => {
    id: string;
    updated_at: string;
    graph: { nodes: unknown[]; edges: unknown[] };
  };
  setWorkflowDirty: jest.Mock;
  setWorkflowUpdatedAt: jest.Mock;
}

const makeNodeStore = (dirty: boolean) => {
  const state: FakeNodeState = {
    workflowIsDirty: dirty,
    nodes: [{ id: "n1" }],
    edges: [],
    workflow: { id: "wf-1", updated_at: "2026-10-06T10:00:00Z" },
    getWorkflow: () => ({
      ...state.workflow,
      graph: { nodes: state.nodes, edges: state.edges }
    }),
    setWorkflowDirty: jest.fn(),
    setWorkflowUpdatedAt: jest.fn()
  };
  return { state, store: { getState: () => state } as unknown as NodeStore };
};

const makeManager = (
  overrides: { unsaved?: boolean; saving?: boolean } = {}
): WorkflowManagerStore =>
  ({
    getState: () => ({
      unsavedWorkflowIds: overrides.unsaved ? { "wf-1": true } : {},
      isSavingWorkflow: () => overrides.saving ?? false
    })
  }) as unknown as WorkflowManagerStore;

let mockNodeStore: NodeStore;
let mockManager: WorkflowManagerStore;
jest.mock("../../contexts/NodeContext", () => ({
  useNodeStoreRef: () => mockNodeStore
}));
jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManagerStore: () => mockManager
}));

const autosaveMock = jest.mocked(triggerAutosaveForWorkflow);

describe("autosaveIfDirty", () => {
  beforeEach(() => {
    autosaveMock.mockReset();
    autosaveMock.mockResolvedValue("2026-10-06T10:05:00Z");
  });

  it("does nothing when the workflow has no unsaved changes", async () => {
    const { store } = makeNodeStore(false);
    await autosaveIfDirty(store, makeManager(), 50);
    expect(autosaveMock).not.toHaveBeenCalled();
  });

  it("skips workflows that were never saved or have a save in flight", async () => {
    await autosaveIfDirty(
      makeNodeStore(true).store,
      makeManager({ unsaved: true }),
      50
    );
    await autosaveIfDirty(
      makeNodeStore(true).store,
      makeManager({ saving: true }),
      50
    );
    expect(autosaveMock).not.toHaveBeenCalled();
  });

  it("saves a dirty workflow as an autosave and marks it clean", async () => {
    const { state, store } = makeNodeStore(true);
    await autosaveIfDirty(store, makeManager(), 25);

    expect(autosaveMock).toHaveBeenCalledWith(
      "wf-1",
      { nodes: state.nodes, edges: [] },
      "autosave",
      { maxVersions: 25, expectedUpdatedAt: "2026-10-06T10:00:00Z" }
    );
    expect(state.setWorkflowUpdatedAt).toHaveBeenCalledWith(
      "2026-10-06T10:05:00Z"
    );
    expect(state.setWorkflowDirty).toHaveBeenCalledWith(false);
  });

  it("keeps the dirty flag when the graph changed during the save", async () => {
    const { state, store } = makeNodeStore(true);
    autosaveMock.mockImplementation(async () => {
      state.nodes = [...state.nodes, { id: "n2" }];
      return "2026-10-06T10:05:00Z";
    });
    await autosaveIfDirty(store, makeManager(), 50);

    expect(state.setWorkflowUpdatedAt).toHaveBeenCalled();
    expect(state.setWorkflowDirty).not.toHaveBeenCalled();
  });

  it("keeps the dirty flag when the save fails", async () => {
    const { state, store } = makeNodeStore(true);
    autosaveMock.mockResolvedValue(null);
    await autosaveIfDirty(store, makeManager(), 50);

    expect(state.setWorkflowUpdatedAt).not.toHaveBeenCalled();
    expect(state.setWorkflowDirty).not.toHaveBeenCalled();
  });
});

describe("useWorkflowAutosave", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    autosaveMock.mockReset();
    autosaveMock.mockResolvedValue("2026-10-06T10:05:00Z");
    mockNodeStore = makeNodeStore(true).store;
    mockManager = makeManager();
    useSettingsStore.getState().resetSettings();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const setAutosave = (enabled: boolean, intervalMinutes: number) => {
    const { autosave } = useSettingsStore.getState().settings;
    useSettingsStore
      .getState()
      .updateSettings({ autosave: { ...autosave, enabled, intervalMinutes } });
  };

  it("autosaves on the configured interval", async () => {
    setAutosave(true, 2);
    renderHook(() => useWorkflowAutosave());

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(autosaveMock).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(autosaveMock).toHaveBeenCalledTimes(1);
  });

  it("does not autosave when autosave is disabled", async () => {
    setAutosave(false, 1);
    renderHook(() => useWorkflowAutosave());

    await act(async () => {
      jest.advanceTimersByTime(5 * 60_000);
    });
    expect(autosaveMock).not.toHaveBeenCalled();
  });
});
