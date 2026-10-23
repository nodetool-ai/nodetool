/**
 * Tests for resource change handler
 */
import {
  flushResourceInvalidations,
  handleResourceChange,
  INVALIDATION_DEBOUNCE_MS,
  INVALIDATION_MAX_WAIT_MS,
  invalidateAllResourceQueries,
  setWorkflowResourceReloader
} from "../resourceChangeHandler";
import { queryClient } from "../../queryClient";
import { ResourceChangeUpdate } from "../ApiTypes";
import { loadMetadata } from "../../serverState/useMetadata";
import { noteWorkflowCreatedHere } from "../workflowsCreatedHere";
import { resolveDocumentProject } from "../../lib/resolveDocumentProject";

const isFunction = (
  value: unknown
): value is (...args: never[]) => unknown => typeof value === "function";

// Mock the queryClient
jest.mock("../../queryClient", () => ({
  queryClient: {
    invalidateQueries: jest.fn()
  }
}));

// `predicate` invalidations need access to the query cache. Provide a stub
// invalidator the test can inspect; for keyed calls we keep the existing
// `queryKey`-shape assertions.

jest.mock("../../serverState/useMetadata", () => ({
  loadMetadata: jest.fn()
}));

jest.mock("../../lib/resolveDocumentProject", () => ({
  resolveDocumentProject: jest.fn(async (_type: string, id: string) => ({
    id,
    projectId: "proj-1"
  }))
}));

const mockOpenTab = jest.fn();
const mockTabs: { id: string }[] = [];
jest.mock("../WorkspaceTabsStore", () => ({
  LOOSE_PROJECT_ID: "default",
  tabId: (type: string, ref: string) => `${type}:${ref}`,
  useWorkspaceTabsStore: {
    getState: () => ({ tabs: mockTabs, openTab: mockOpenTab })
  }
}));

/** Invalidations join an in-flight refetch instead of restarting it. */
const NO_CANCEL = { cancelRefetch: false };

/** Handle one change and run its queued invalidations now. */
const change = (update: ResourceChangeUpdate): void => {
  handleResourceChange(update);
  flushResourceInvalidations();
};

type QueryPredicate = (q: { queryKey: readonly unknown[] }) => boolean;

/** Every predicate the flushed invalidations passed. */
const invalidationPredicates = (): QueryPredicate[] =>
  (queryClient.invalidateQueries as jest.Mock).mock.calls
    .map((call) => call[0]?.predicate)
    .filter(isFunction) as QueryPredicate[];

/** How many flushed invalidations named exactly this query key. */
const keyedInvalidations = (queryKey: readonly unknown[]): number =>
  (queryClient.invalidateQueries as jest.Mock).mock.calls.filter(
    (call) => JSON.stringify(call[0]?.queryKey) === JSON.stringify(queryKey)
  ).length;

describe("handleResourceChange", () => {
  beforeEach(() => {
    flushResourceInvalidations();
    jest.clearAllMocks();
    setWorkflowResourceReloader(null);
  });

  it("refetches the workspace explorer when a run writes a file", () => {
    change({
      type: "resource_change",
      event: "updated",
      resource_type: "workspacefile",
      resource: { id: "ws-1" }
    } as ResourceChangeUpdate);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["workspace-files", "ws-1"] },
      NO_CANCEL
    );
  });

  it("refetches every workspace listing when the change names none", () => {
    change({
      type: "resource_change",
      event: "updated",
      resource_type: "workspacefile",
      resource: {}
    } as unknown as ResourceChangeUpdate);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["workspace-files"] },
      NO_CANCEL
    );
  });

  it("invalidates workflow queries on workflow update", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "updated",
      resource_type: "workflow",
      resource: {
        id: "workflow-123",
        etag: "abc123"
      }
    };

    change(update);

    // Should invalidate general workflows query
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["workflows"] },
      NO_CANCEL
    );

    // Templates are shipped examples no user write changes.
    expect(keyedInvalidations(["templates"])).toBe(0);

    // Should invalidate specific workflow query
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["workflow", "workflow-123"] },
      NO_CANCEL
    );

    // Should invalidate workflow versions query
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["workflow", "workflow-123", "versions"] },
      NO_CANCEL
    );
  });

  it("opens a tab for a workflow created outside the editor", async () => {
    handleResourceChange({
      type: "resource_change",
      event: "created",
      resource_type: "workflow",
      resource: { id: "wf-new" }
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockOpenTab).toHaveBeenCalledWith({
      type: "workflow",
      ref: "wf-new",
      mode: "edit",
      projectId: "proj-1"
    });
  });

  it("does not reopen a workflow that already has a tab", async () => {
    mockTabs.push({ id: "workflow:wf-open" });
    handleResourceChange({
      type: "resource_change",
      event: "created",
      resource_type: "workflow",
      resource: { id: "wf-open" }
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    mockTabs.length = 0;

    expect(mockOpenTab).not.toHaveBeenCalled();
  });

  it("does not open a tab for a workflow this page created", async () => {
    // The guided Workflow flow creates its draft and shows it in a guided
    // flow tab. Its created event used to open a second, "Untitled" tab.
    noteWorkflowCreatedHere("wf-guided");
    handleResourceChange({
      type: "resource_change",
      event: "created",
      resource_type: "workflow",
      resource: { id: "wf-guided" }
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockOpenTab).not.toHaveBeenCalled();
  });

  it("does not open a tab when this page's create returns after the event", async () => {
    let resolveProject: (value: { id: string; projectId: string }) => void =
      () => undefined;
    (resolveDocumentProject as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProject = resolve;
        })
    );
    handleResourceChange({
      type: "resource_change",
      event: "created",
      resource_type: "workflow",
      resource: { id: "wf-late" }
    });
    noteWorkflowCreatedHere("wf-late");
    resolveProject({ id: "wf-late", projectId: "proj-1" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockOpenTab).not.toHaveBeenCalled();
  });

  it("reloads an open workflow after a remote update", () => {
    const reload = jest.fn();
    setWorkflowResourceReloader(reload);

    handleResourceChange({
      type: "resource_change",
      event: "updated",
      resource_type: "workflow",
      resource: { id: "workflow-123", etag: "abc123" }
    });

    expect(reload).toHaveBeenCalledWith("workflow-123", "abc123", undefined);
  });

  it("invalidates job queries on job created", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "created",
      resource_type: "job",
      resource: {
        id: "job-456",
        etag: "def456"
      }
    };

    change(update);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["jobs"] },
      NO_CANCEL
    );

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["job", "job-456"] },
      NO_CANCEL
    );
  });

  it("invalidates asset queries on asset deleted", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "deleted",
      resource_type: "asset",
      resource: {
        id: "asset-789"
      }
    };

    change(update);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["assets"] },
      NO_CANCEL
    );

    // The plural ["assets"] key does not prefix-match the singular form,
    // so detail queries need an explicit invalidation.
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["asset", "asset-789"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["textAsset", "asset-789"] },
      NO_CANCEL
    );
  });

  it("invalidates settings queries on setting update", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "updated",
      resource_type: "setting",
      resource: { id: "user-1:THEME", etag: "s1" }
    };

    change(update);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["settings"] },
      NO_CANCEL
    );
  });

  it("invalidates messages query when a message resource includes thread_id", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "created",
      resource_type: "message",
      resource: { id: "msg-1", thread_id: "thread-101" }
    };

    change(update);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["messages"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["messages", "thread-101"] },
      NO_CANCEL
    );
  });

  it("invalidates the workflow versions list when scoped to a workflow", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "created",
      resource_type: "workflowversion",
      resource: { id: "ver-1", workflow_id: "workflow-123" }
    };

    change(update);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["workflow", "workflow-123", "versions"] },
      NO_CANCEL
    );
  });

  it("invalidates collections on collection mutation", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "created",
      resource_type: "collection",
      resource: { id: "my-coll" }
    };

    change(update);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["collections"] },
      NO_CANCEL
    );
  });

  it("invalidates thread and messages queries on thread update", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "updated",
      resource_type: "thread",
      resource: {
        id: "thread-101",
        etag: "ghi101"
      }
    };

    change(update);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["threads"] },
      NO_CANCEL
    );

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["thread", "thread-101"] },
      NO_CANCEL
    );

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["messages", "thread-101"] },
      NO_CANCEL
    );
  });

  it("handles resource types without query key mappings", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "created",
      resource_type: "unknown_resource",
      resource: {
        id: "unknown-999"
      }
    };

    // Should not throw
    change(update);

    // Should not invalidate any queries
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it("handles resource without id gracefully", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "updated",
      resource_type: "workflow",
      resource: {
        id: "", // Empty id
        etag: "abc"
      }
    };

    // Should not throw
    change(update);

    // Should still invalidate general queries
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["workflows"] },
      NO_CANCEL
    );
  });

  it("reloads metadata on metadata update", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "updated",
      resource_type: "metadata",
      resource: {
        id: "nodes",
        etag: "meta-123"
      }
    };

    change(update);

    expect(loadMetadata).toHaveBeenCalled();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["metadata"] },
      NO_CANCEL
    );
  });

  it("invalidates provider and model queries on provider update", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "created",
      resource_type: "provider",
      resource: {
        id: "mlx",
        etag: "provider-123"
      }
    };

    change(update);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["providers"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["models"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["language-models"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["embedding-models"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["image-models"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["tts-models"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["asr-models"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["video-models"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["allModels"] },
      NO_CANCEL
    );
  });

  it("invalidates model queries on model update", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "updated",
      resource_type: "model",
      resource: {
        id: "mlx",
        etag: "model-123"
      }
    };

    change(update);

    expect(queryClient.invalidateQueries).not.toHaveBeenCalledWith(
      { queryKey: ["providers"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["models"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["language-models"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["embedding-models"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["image-models"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["tts-models"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["asr-models"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["video-models"] },
      NO_CANCEL
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["allModels"] },
      NO_CANCEL
    );
  });

  it("invalidates settings on setting update", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "updated",
      resource_type: "setting",
      resource: { id: "OPENAI_API_KEY" }
    };

    change(update);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["settings"] },
      NO_CANCEL
    );
  });

  it("invalidates workflow version queries on workflowversion change", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "created",
      resource_type: "workflowversion",
      resource: { id: "version-xyz" }
    };

    change(update);

    // The version's id is not the workflow id, so the handler invalidates
    // every `["workflow", *, "versions"]` query via predicate.
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({
        predicate: expect.any(Function)
      })
    );
    const predicateCall = (
      queryClient.invalidateQueries as jest.Mock
    ).mock.calls.find((call) => isFunction(call[0]?.predicate));
    expect(predicateCall).toBeTruthy();
    const predicate = predicateCall![0].predicate as (q: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["workflow", "abc", "versions"] })).toBe(true);
    expect(predicate({ queryKey: ["workflow", "abc"] })).toBe(false);
    expect(predicate({ queryKey: ["workflows"] })).toBe(false);
  });

  it("refetches the project views when a document is created", () => {
    change({
      type: "resource_change",
      event: "created",
      resource_type: "storyboard",
      resource: { id: "b1" }
    } as ResourceChangeUpdate);

    const predicates = (queryClient.invalidateQueries as jest.Mock).mock.calls
      .map((call) => call[0]?.predicate)
      .filter(isFunction) as Array<
      (q: { queryKey: readonly unknown[] }) => boolean
    >;
    const matchesProjects = predicates.some((predicate) =>
      predicate({ queryKey: [["projects", "get"], { input: { id: "p1" } }] })
    );
    expect(matchesProjects).toBe(true);
  });

  it("refetches the entity library and the project views on an asset write", () => {
    // An entity is an image asset carrying the marker, so an entity the agent
    // tags reaches the browser as an asset change and nothing else. `["assets"]`
    // does not prefix-match `["entities"]`, and a project's overview lists the
    // entities filed under it.
    change({
      type: "resource_change",
      event: "updated",
      resource_type: "asset",
      resource: { id: "a1" }
    } as ResourceChangeUpdate);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      { queryKey: ["entities"] },
      NO_CANCEL
    );

    const predicates = (queryClient.invalidateQueries as jest.Mock).mock.calls
      .map((call) => call[0]?.predicate)
      .filter(isFunction) as Array<
      (q: { queryKey: readonly unknown[] }) => boolean
    >;
    expect(
      predicates.some((predicate) =>
        predicate({ queryKey: [["projects", "get"], { input: { id: "p1" } }] })
      )
    ).toBe(true);
  });

  it("refetches the project views when a project row changes", () => {
    change({
      type: "resource_change",
      event: "updated",
      resource_type: "project",
      resource: { id: "p1" }
    } as ResourceChangeUpdate);

    const predicate = (queryClient.invalidateQueries as jest.Mock).mock.calls
      .map((call) => call[0]?.predicate)
      .find(isFunction) as (q: { queryKey: readonly unknown[] }) => boolean;
    expect(predicate({ queryKey: [["projects", "summaries"], {}] })).toBe(true);
    expect(predicate({ queryKey: [["workflows", "list"], {}] })).toBe(false);
  });

  it("refetches the project views when a workflow is saved", () => {
    change({
      type: "resource_change",
      event: "created",
      resource_type: "workflow",
      resource: { id: "wf-1" }
    } as ResourceChangeUpdate);

    const predicates = (queryClient.invalidateQueries as jest.Mock).mock.calls
      .map((call) => call[0]?.predicate)
      .filter(isFunction) as Array<(q: { queryKey: readonly unknown[] }) => boolean>;
    expect(
      predicates.some((predicate) =>
        predicate({
          queryKey: [["projects", "documentPage"], { input: { id: "p1" } }]
        })
      )
    ).toBe(true);
  });

  it("refetches the project views when a prediction (chat spend) lands", () => {
    change({
      type: "resource_change",
      event: "created",
      resource_type: "prediction",
      resource: { id: "pred-1" }
    } as ResourceChangeUpdate);

    const predicate = (queryClient.invalidateQueries as jest.Mock).mock.calls
      .map((call) => call[0]?.predicate)
      .find(isFunction) as (q: { queryKey: readonly unknown[] }) => boolean;
    expect(predicate).toBeTruthy();
    expect(
      predicate({ queryKey: [["projects", "get"], { input: { id: "p1" } }] })
    ).toBe(true);
    expect(predicate({ queryKey: [["workflows", "list"], {}] })).toBe(false);
  });

  it("refetches both the js script list and the node menu's palette", () => {
    change({
      type: "resource_change",
      event: "updated",
      resource_type: "jsscript",
      resource: { id: "script-1", updated_at: "2026-08-18T00:00:00Z" }
    });

    const predicates = (queryClient.invalidateQueries as jest.Mock).mock.calls
      .filter((call) => isFunction(call[0]?.predicate))
      .map(
        (call) =>
          call[0].predicate as (q: { queryKey: readonly unknown[] }) => boolean
      );

    const matches = (key: readonly unknown[]) =>
      predicates.some((predicate) => predicate({ queryKey: key }));

    expect(matches([["jsScripts", "list"], {}])).toBe(true);
    expect(matches([["jsScripts", "palette"], {}])).toBe(true);
    expect(matches([["jsScripts", "get"], {}])).toBe(false);
    expect(matches([["scripts", "palette"], {}])).toBe(false);
  });

  describe("the project navigator's index", () => {
    /** True when some invalidation this call made matches `documents.index`. */
    const invalidatedDocumentIndex = (): boolean =>
      (queryClient.invalidateQueries as jest.Mock).mock.calls.some((call) => {
        const predicate = call[0]?.predicate;
        return (
          isFunction(predicate) &&
          (predicate as (q: { queryKey: readonly unknown[] }) => boolean)({
            queryKey: [["documents", "index"], { input: {}, type: "query" }]
          })
        );
      });

    it.each([
      "workflow",
      "script",
      "storyboard",
      "timelinesequence",
      "imagedocument",
      "jsscript",
      "application",
      "asset",
      "project"
    ])("refetches after a %s change", (resourceType) => {
      change({
        type: "resource_change",
        event: "updated",
        resource_type: resourceType,
        resource: { id: "doc-1" }
      } as ResourceChangeUpdate);

      expect(invalidatedDocumentIndex()).toBe(true);
    });

    it("leaves it alone for a change that adds no document", () => {
      change({
        type: "resource_change",
        event: "updated",
        resource_type: "setting",
        resource: { id: "s-1" }
      } as ResourceChangeUpdate);

      expect(invalidatedDocumentIndex()).toBe(false);
    });
  });

  it("includes additional resource properties in the update", () => {
    const update: ResourceChangeUpdate = {
      type: "resource_change",
      event: "updated",
      resource_type: "workflow",
      resource: {
        id: "workflow-123",
        etag: "abc123",
        name: "My Workflow",
        status: "active"
      }
    };

    // Should not throw with additional properties
    change(update);

    expect(queryClient.invalidateQueries).toHaveBeenCalled();
  });

  describe("workflow detail owned by an open editor", () => {
    const updated: ResourceChangeUpdate = {
      type: "resource_change",
      event: "updated",
      resource_type: "workflow",
      resource: { id: "wf-open", etag: "e2" }
    };

    it("leaves the detail query to the editor but refetches its versions", () => {
      setWorkflowResourceReloader(() => true);

      change(updated);

      expect(keyedInvalidations(["workflow", "wf-open"])).toBe(0);
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
        { queryKey: ["workflow", "wf-open", "versions"] },
        NO_CANCEL
      );
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
        { queryKey: ["workflows"] },
        NO_CANCEL
      );
    });

    it("invalidates the detail query when no editor owns the workflow", () => {
      setWorkflowResourceReloader(() => false);

      change(updated);

      expect(keyedInvalidations(["workflow", "wf-open"])).toBe(1);
    });

    it("runs the reloader before any invalidation lands", () => {
      let invalidationsBeforeReload = -1;
      setWorkflowResourceReloader(() => {
        invalidationsBeforeReload = (queryClient.invalidateQueries as jest.Mock)
          .mock.calls.length;
        return false;
      });

      change(updated);

      expect(invalidationsBeforeReload).toBe(0);
    });
  });

  describe("project views narrowed by project_id", () => {
    const pageKey = (id: string): readonly unknown[] => [
      ["projects", "documentPage"],
      { input: { id, offset: 0, limit: 4 }, type: "query" }
    ];
    const summariesKey: readonly unknown[] = [
      ["projects", "summaries"],
      { input: {}, type: "query" }
    ];
    const matchesAny = (queryKey: readonly unknown[]): boolean =>
      invalidationPredicates().some((predicate) => predicate({ queryKey }));

    it("refetches only the named project's views and the cross-project ones", () => {
      change({
        type: "resource_change",
        event: "updated",
        resource_type: "asset",
        resource: { id: "a1", project_id: "p1" }
      });

      expect(matchesAny(pageKey("p1"))).toBe(true);
      expect(
        matchesAny([["projects", "get"], { input: { id: "p1" }, type: "query" }])
      ).toBe(true);
      expect(matchesAny(summariesKey)).toBe(true);
      expect(matchesAny(pageKey("p2"))).toBe(false);
      expect(
        matchesAny([["projects", "get"], { input: { id: "p2" }, type: "query" }])
      ).toBe(false);
    });

    it("refetches every project's views when the change names none", () => {
      change({
        type: "resource_change",
        event: "updated",
        resource_type: "asset",
        resource: { id: "a1" }
      });

      expect(matchesAny(pageKey("p1"))).toBe(true);
      expect(matchesAny(pageKey("p2"))).toBe(true);
      expect(matchesAny(summariesKey)).toBe(true);
    });
  });

  describe("coalescing", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      flushResourceInvalidations();
      jest.useRealTimers();
    });

    const assetChange = (index: number): ResourceChangeUpdate => ({
      type: "resource_change",
      event: "created",
      resource_type: "asset",
      resource: { id: `asset-${index}` }
    });

    it("invalidates each target once after a burst of asset events", () => {
      for (let index = 0; index < 20; index += 1) {
        handleResourceChange(assetChange(index));
      }
      expect(queryClient.invalidateQueries).not.toHaveBeenCalled();

      jest.advanceTimersByTime(INVALIDATION_DEBOUNCE_MS);

      expect(keyedInvalidations(["assets"])).toBe(1);
      expect(keyedInvalidations(["entities"])).toBe(1);
      expect(keyedInvalidations(["asset", "asset-0"])).toBe(1);
      expect(keyedInvalidations(["asset", "asset-19"])).toBe(1);
      // One project-views sweep and one documents.index sweep.
      expect(invalidationPredicates()).toHaveLength(2);
      for (const call of (queryClient.invalidateQueries as jest.Mock).mock
        .calls) {
        expect(call[1]).toEqual(NO_CANCEL);
      }
    });

    it("waits for the burst to go quiet", () => {
      handleResourceChange(assetChange(0));
      jest.advanceTimersByTime(INVALIDATION_DEBOUNCE_MS - 1);
      handleResourceChange(assetChange(1));
      jest.advanceTimersByTime(INVALIDATION_DEBOUNCE_MS - 1);

      expect(queryClient.invalidateQueries).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(keyedInvalidations(["assets"])).toBe(1);
    });

    it("flushes a continuous burst by the max wait", () => {
      const step = INVALIDATION_DEBOUNCE_MS / 2;
      for (let elapsed = 0; elapsed < INVALIDATION_MAX_WAIT_MS; elapsed += step) {
        handleResourceChange(assetChange(elapsed));
        jest.advanceTimersByTime(step);
      }

      expect(keyedInvalidations(["assets"])).toBe(1);
    });

    it("drops queued work when every query is refreshed", () => {
      handleResourceChange(assetChange(0));

      invalidateAllResourceQueries();
      jest.advanceTimersByTime(INVALIDATION_MAX_WAIT_MS);

      expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1);
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({}, NO_CANCEL);
    });
  });
});
