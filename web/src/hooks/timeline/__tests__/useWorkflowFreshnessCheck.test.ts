/**
 * useWorkflowFreshnessCheck — unit tests
 *
 * Tests that the hook:
 *   1. Marks clips stale when the fetched workflow.updated_at is newer than
 *      the most recent successful clip version's workflowUpdatedAt.
 *   2. Leaves clips unchanged when the workflow hasn't changed.
 *   3. Applies Input* drift (added / removed) via applyInputDrift.
 *   4. Surfaces DriftItems when a selectedOutputNodeId is missing.
 *   5. resolveDrift calls setClipsOutputNode on the store and clears the item.
 *   6. Standalone source-workflow edits do NOT affect clips that reference a
 *      different (cloned) workflowId.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { renderHook, act, waitFor } from "@testing-library/react";

import { makeTrack, makeClip } from "@nodetool-ai/timeline";
import { mockWorkflowsGet } from "../../../__mocks__/trpcClientMock";

// The hook uses the singleton useTimelineStore; drive it by pre-populating its
// state directly. The singleton is safe to manipulate between tests because
// each beforeEach resets it.
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useWorkflowFreshnessCheck } from "../useWorkflowFreshnessCheck";

// ── Helpers ────────────────────────────────────────────────────────────────

const BASE_UPDATED_AT = "2026-01-01T10:00:00.000Z";
const NEWER_UPDATED_AT = "2026-01-02T10:00:00.000Z";

function makeSuccessVersion(workflowUpdatedAt: string) {
  return {
    id: `ver-${Math.random()}`,
    createdAt: "2026-01-01T09:00:00.000Z",
    jobId: "job-1",
    assetId: "asset-1",
    workflowUpdatedAt,
    dependencyHash: "h1",
    paramOverridesSnapshot: {},
    status: "success" as const
  };
}

function buildWorkflow(opts: {
  id: string;
  updatedAt: string;
  inputNodes?: Array<{ id: string; name: string; defaultValue?: unknown }>;
  outputNodes?: Array<{ id: string; name: string }>;
}) {
  return {
    id: opts.id,
    name: "Test Workflow",
    access: "private",
    updated_at: opts.updatedAt,
    graph: {
      nodes: [
        ...(opts.inputNodes ?? []).map((n) => ({
          id: n.id,
          type: "nodetool.input.StringInput",
          data: { name: n.name, default: n.defaultValue ?? "" }
        })),
        ...(opts.outputNodes ?? []).map((n) => ({
          id: n.id,
          type: "nodetool.output.ImageOutput",
          data: { name: n.name }
        }))
      ],
      edges: []
    }
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("useWorkflowFreshnessCheck", () => {
  beforeEach(() => {
    // Reset singleton store to a known empty state before each test.
    useTimelineStore.setState({
      sequenceId: null,
      tracks: [],
      clips: [],
      markers: []
    });
    mockWorkflowsGet.mockReset();
  });

  // ── Freshness check ──────────────────────────────────────────────────────

  it("marks clips stale when workflow.updated_at is newer than the last version", async () => {
    const track = makeTrack({ type: "video" });
    const clip = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      sourceType: "generated",
      status: "generated",
      versions: [makeSuccessVersion(BASE_UPDATED_AT)]
    });
    useTimelineStore.setState({ sequenceId: "seq-1", tracks: [track], clips: [clip] });

    mockWorkflowsGet.mockResolvedValue(
      buildWorkflow({ id: "wf-1", updatedAt: NEWER_UPDATED_AT })
    );

    const { result } = renderHook(() =>
      useWorkflowFreshnessCheck("seq-1")
    );

    await waitFor(() => {
      const current = useTimelineStore.getState().clips.find((c) => c.id === clip.id);
      expect(current?.status).toBe("stale");
    });

    expect(result.current.driftItems).toHaveLength(0);
  });

  it("does NOT mark clips stale when workflow.updated_at has not advanced", async () => {
    const track = makeTrack({ type: "video" });
    const clip = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      sourceType: "generated",
      status: "generated",
      versions: [makeSuccessVersion(BASE_UPDATED_AT)]
    });
    useTimelineStore.setState({ sequenceId: "seq-1", tracks: [track], clips: [clip] });

    // Same updated_at — not newer.
    mockWorkflowsGet.mockResolvedValue(
      buildWorkflow({ id: "wf-1", updatedAt: BASE_UPDATED_AT })
    );

    renderHook(() => useWorkflowFreshnessCheck("seq-1"));

    // Give the async check a chance to run.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const current = useTimelineStore.getState().clips.find((c) => c.id === clip.id);
    expect(current?.status).toBe("generated");
  });

  it("skips clips that have no successful versions (never generated)", async () => {
    const track = makeTrack({ type: "video" });
    const clip = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      sourceType: "generated",
      status: "draft",
      versions: [] // never generated
    });
    useTimelineStore.setState({ sequenceId: "seq-1", tracks: [track], clips: [clip] });

    renderHook(() => useWorkflowFreshnessCheck("seq-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // No API calls expected — clip has no successful versions.
    expect(mockWorkflowsGet).not.toHaveBeenCalled();
    const current = useTimelineStore.getState().clips.find((c) => c.id === clip.id);
    expect(current?.status).toBe("draft");
  });

  // ── Source-workflow edit safeguard ───────────────────────────────────────

  it("does not affect clips that reference a different workflowId (source-workflow safeguard)", async () => {
    const track = makeTrack({ type: "video" });
    const clipLinked = makeClip({
      trackId: track.id,
      workflowId: "wf-clone",
      sourceType: "generated",
      status: "generated",
      versions: [makeSuccessVersion(BASE_UPDATED_AT)]
    });
    const clipSource = makeClip({
      trackId: track.id,
      workflowId: "wf-source",
      sourceType: "generated",
      status: "generated",
      versions: [makeSuccessVersion(BASE_UPDATED_AT)]
    });
    useTimelineStore.setState({
      sequenceId: "seq-1",
      tracks: [track],
      clips: [clipLinked, clipSource]
    });

    // Only "wf-clone" changed; "wf-source" stays the same.
    mockWorkflowsGet.mockImplementation(async ({ id }: { id: string }) => {
      if (id === "wf-clone") {
        return buildWorkflow({ id: "wf-clone", updatedAt: NEWER_UPDATED_AT });
      }
      return buildWorkflow({ id: "wf-source", updatedAt: BASE_UPDATED_AT });
    });

    renderHook(() => useWorkflowFreshnessCheck("seq-1"));

    await waitFor(() => {
      const linked = useTimelineStore.getState().clips.find((c) => c.id === clipLinked.id);
      expect(linked?.status).toBe("stale");
    });

    // Source clip unchanged.
    const source = useTimelineStore.getState().clips.find((c) => c.id === clipSource.id);
    expect(source?.status).toBe("generated");
  });

  // ── Input* node drift ────────────────────────────────────────────────────

  it("seeds added Input* nodes into paramOverrides with their default values", async () => {
    const track = makeTrack({ type: "video" });
    const clip = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      sourceType: "generated",
      status: "generated",
      paramOverrides: { existingParam: "hello" },
      versions: [makeSuccessVersion(BASE_UPDATED_AT)]
    });
    useTimelineStore.setState({ sequenceId: "seq-1", tracks: [track], clips: [clip] });

    mockWorkflowsGet.mockResolvedValue(
      buildWorkflow({
        id: "wf-1",
        updatedAt: BASE_UPDATED_AT,
        inputNodes: [
          { id: "in-1", name: "existingParam" },
          { id: "in-2", name: "newParam", defaultValue: 99 }
        ]
      })
    );

    renderHook(() => useWorkflowFreshnessCheck("seq-1"));

    await waitFor(() => {
      const updated = useTimelineStore
        .getState()
        .clips.find((c) => c.id === clip.id);
      expect(updated?.paramOverrides?.newParam).toBe(99);
    });

    // Existing param must be preserved.
    const updated = useTimelineStore.getState().clips.find((c) => c.id === clip.id);
    expect(updated?.paramOverrides?.existingParam).toBe("hello");
  });

  it("drops removed Input* nodes from paramOverrides", async () => {
    const track = makeTrack({ type: "video" });
    const clip = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      sourceType: "generated",
      status: "generated",
      paramOverrides: { keepMe: "yes", removeMe: "bye" },
      versions: [makeSuccessVersion(BASE_UPDATED_AT)]
    });
    useTimelineStore.setState({ sequenceId: "seq-1", tracks: [track], clips: [clip] });

    // Workflow only has "keepMe" now — "removeMe" was deleted.
    mockWorkflowsGet.mockResolvedValue(
      buildWorkflow({
        id: "wf-1",
        updatedAt: BASE_UPDATED_AT,
        inputNodes: [{ id: "in-keep", name: "keepMe" }]
      })
    );

    renderHook(() => useWorkflowFreshnessCheck("seq-1"));

    await waitFor(() => {
      const updated = useTimelineStore
        .getState()
        .clips.find((c) => c.id === clip.id);
      expect(updated?.paramOverrides).not.toHaveProperty("removeMe");
    });

    const updated = useTimelineStore.getState().clips.find((c) => c.id === clip.id);
    expect(updated?.paramOverrides?.keepMe).toBe("yes");
  });

  // ── Selected output node removed ─────────────────────────────────────────

  it("surfaces a DriftItem when selectedOutputNodeId no longer exists", async () => {
    const track = makeTrack({ type: "video" });
    const clip = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      sourceType: "generated",
      status: "generated",
      selectedOutputNodeId: "deleted-out",
      versions: [makeSuccessVersion(BASE_UPDATED_AT)]
    });
    useTimelineStore.setState({ sequenceId: "seq-1", tracks: [track], clips: [clip] });

    mockWorkflowsGet.mockResolvedValue(
      buildWorkflow({
        id: "wf-1",
        updatedAt: BASE_UPDATED_AT,
        outputNodes: [{ id: "new-out", name: "Image Output" }]
      })
    );

    const { result } = renderHook(() => useWorkflowFreshnessCheck("seq-1"));

    await waitFor(() => {
      expect(result.current.driftItems).toHaveLength(1);
    });

    const item = result.current.driftItems[0];
    expect(item.workflowId).toBe("wf-1");
    expect(item.clipIds).toContain(clip.id);
    expect(item.availableOutputNodes).toHaveLength(1);
    expect(item.availableOutputNodes[0].id).toBe("new-out");
  });

  // ── resolveDrift ─────────────────────────────────────────────────────────

  it("resolveDrift applies the chosen output node to all linked clips and clears the drift item", async () => {
    const track = makeTrack({ type: "video" });
    const clipA = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      sourceType: "generated",
      status: "generated",
      selectedOutputNodeId: "missing-out",
      versions: [makeSuccessVersion(BASE_UPDATED_AT)]
    });
    const clipB = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      sourceType: "generated",
      status: "generated",
      selectedOutputNodeId: "missing-out",
      versions: [makeSuccessVersion(BASE_UPDATED_AT)]
    });
    useTimelineStore.setState({
      sequenceId: "seq-1",
      tracks: [track],
      clips: [clipA, clipB]
    });

    mockWorkflowsGet.mockResolvedValue(
      buildWorkflow({
        id: "wf-1",
        updatedAt: BASE_UPDATED_AT,
        outputNodes: [{ id: "new-out", name: "Output" }]
      })
    );

    const { result } = renderHook(() => useWorkflowFreshnessCheck("seq-1"));

    await waitFor(() => {
      expect(result.current.driftItems).toHaveLength(1);
    });

    act(() => {
      result.current.resolveDrift("wf-1", "new-out");
    });

    // Drift item should be cleared.
    expect(result.current.driftItems).toHaveLength(0);

    // Both clips should now have the new output node.
    const clips = useTimelineStore.getState().clips;
    expect(clips.find((c) => c.id === clipA.id)?.selectedOutputNodeId).toBe("new-out");
    expect(clips.find((c) => c.id === clipB.id)?.selectedOutputNodeId).toBe("new-out");
  });
});
