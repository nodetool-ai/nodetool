/**
 * useWorkflowFreshnessCheck — unit tests
 *
 * The hook reconciles clips against the current state of their bound
 * workflows. It returns void; assertions read from the timeline store.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";

import { makeTrack, makeClip } from "@nodetool-ai/timeline";
import { mockWorkflowsGet } from "../../../__mocks__/trpcClientMock";

import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import type { TimelineStoreApi } from "../../../stores/timeline/TimelineStore";
import { TimelineProvider } from "../../../stores/timeline/TimelineInstance";
import { useWorkflowFreshnessCheck } from "../useWorkflowFreshnessCheck";

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

describe("useWorkflowFreshnessCheck", () => {
  beforeEach(() => {
    useTimelineStore.setState({
      sequenceId: null,
      tracks: [],
      clips: [],
      markers: []
    });
    mockWorkflowsGet.mockReset();
  });

  it("marks clips stale when workflow.updated_at is newer than the last version", async () => {
    const track = makeTrack({ type: "video" });
    const clip = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      sourceType: "generated",
      status: "generated",
      versions: [makeSuccessVersion(BASE_UPDATED_AT)]
    });
    useTimelineStore.setState({
      sequenceId: "seq-1",
      tracks: [track],
      clips: [clip]
    });

    mockWorkflowsGet.mockResolvedValue(
      buildWorkflow({ id: "wf-1", updatedAt: NEWER_UPDATED_AT })
    );

    renderHook(() => useWorkflowFreshnessCheck("seq-1"));

    await waitFor(() => {
      const current = useTimelineStore
        .getState()
        .clips.find((c) => c.id === clip.id);
      expect(current?.status).toBe("stale");
    });
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
    useTimelineStore.setState({
      sequenceId: "seq-1",
      tracks: [track],
      clips: [clip]
    });

    mockWorkflowsGet.mockResolvedValue(
      buildWorkflow({ id: "wf-1", updatedAt: BASE_UPDATED_AT })
    );

    renderHook(() => useWorkflowFreshnessCheck("seq-1"));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const current = useTimelineStore
      .getState()
      .clips.find((c) => c.id === clip.id);
    expect(current?.status).toBe("generated");
  });

  it("only marks the clips whose workflowId actually changed", async () => {
    const track = makeTrack({ type: "video" });
    const clipChanged = makeClip({
      trackId: track.id,
      workflowId: "wf-changed",
      sourceType: "generated",
      status: "generated",
      versions: [makeSuccessVersion(BASE_UPDATED_AT)]
    });
    const clipUnchanged = makeClip({
      trackId: track.id,
      workflowId: "wf-other",
      sourceType: "generated",
      status: "generated",
      versions: [makeSuccessVersion(BASE_UPDATED_AT)]
    });
    useTimelineStore.setState({
      sequenceId: "seq-1",
      tracks: [track],
      clips: [clipChanged, clipUnchanged]
    });

    mockWorkflowsGet.mockImplementation(async ({ id }: { id: string }) => {
      if (id === "wf-changed") {
        return buildWorkflow({ id: "wf-changed", updatedAt: NEWER_UPDATED_AT });
      }
      return buildWorkflow({ id: "wf-other", updatedAt: BASE_UPDATED_AT });
    });

    renderHook(() => useWorkflowFreshnessCheck("seq-1"));

    await waitFor(() => {
      const c = useTimelineStore
        .getState()
        .clips.find((x) => x.id === clipChanged.id);
      expect(c?.status).toBe("stale");
    });

    const other = useTimelineStore
      .getState()
      .clips.find((x) => x.id === clipUnchanged.id);
    expect(other?.status).toBe("generated");
  });

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
    useTimelineStore.setState({
      sequenceId: "seq-1",
      tracks: [track],
      clips: [clip]
    });

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

    const updated = useTimelineStore
      .getState()
      .clips.find((c) => c.id === clip.id);
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
    useTimelineStore.setState({
      sequenceId: "seq-1",
      tracks: [track],
      clips: [clip]
    });

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

    const updated = useTimelineStore
      .getState()
      .clips.find((c) => c.id === clip.id);
    expect(updated?.paramOverrides?.keepMe).toBe("yes");
  });

  it("defers the check until clips load into the store (avoids running with an empty clip set)", async () => {
    // Mount the hook BEFORE seeding any clips — simulates the real flow where
    // useLoadTimelineIntoStore populates the store asynchronously after the
    // freshness hook is wired up.
    useTimelineStore.setState({
      sequenceId: null,
      tracks: [],
      clips: []
    });

    mockWorkflowsGet.mockResolvedValue(
      buildWorkflow({ id: "wf-1", updatedAt: NEWER_UPDATED_AT })
    );

    renderHook(() => useWorkflowFreshnessCheck("seq-1"));

    // Give any premature check a chance to run — none should fire while the
    // store is still empty.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(mockWorkflowsGet).not.toHaveBeenCalled();

    // Now load clips, mimicking the async tRPC populate.
    const track = makeTrack({ type: "video" });
    const clip = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      sourceType: "generated",
      status: "generated",
      versions: [makeSuccessVersion(BASE_UPDATED_AT)]
    });
    act(() => {
      useTimelineStore.setState({
        sequenceId: "seq-1",
        tracks: [track],
        clips: [clip]
      });
    });

    // The check fires once the store carries clips for this sequence.
    await waitFor(() => {
      const current = useTimelineStore
        .getState()
        .clips.find((c) => c.id === clip.id);
      expect(current?.status).toBe("stale");
    });
  });

  it("subscribes to the surrounding provider's instance, not the active/static one", async () => {
    // A provider with active={false} never pushes its instance onto the
    // activation stack, so the static `useTimelineStore.getState()` keeps
    // resolving the default instance. The hook must still observe the
    // provider's instance via context.
    const apiRef: { current: TimelineStoreApi | null } = { current: null };
    const Capture: React.FC<{ children?: React.ReactNode }> = ({
      children
    }) => {
      apiRef.current = useTimelineStoreApi();
      return React.createElement(React.Fragment, null, children);
    };
    const wrapper: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
      React.createElement(TimelineProvider, {
        active: false,
        children: React.createElement(Capture, null, children)
      });

    mockWorkflowsGet.mockResolvedValue(
      buildWorkflow({ id: "wf-1", updatedAt: NEWER_UPDATED_AT })
    );

    renderHook(() => useWorkflowFreshnessCheck("seq-1"), { wrapper });
    expect(apiRef.current).not.toBeNull();

    // Populate the PROVIDER instance (async, like useLoadTimelineIntoStore).
    const track = makeTrack({ type: "video" });
    const clip = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      sourceType: "generated",
      status: "generated",
      versions: [makeSuccessVersion(BASE_UPDATED_AT)]
    });
    act(() => {
      apiRef.current?.setState({
        sequenceId: "seq-1",
        tracks: [track],
        clips: [clip]
      });
    });

    await waitFor(() => {
      const current = apiRef.current
        ?.getState()
        .clips.find((c) => c.id === clip.id);
      expect(current?.status).toBe("stale");
    });

    // The default/static instance was never touched.
    expect(useTimelineStore.getState().clips).toHaveLength(0);
  });

  it("auto-resolves a missing selectedOutputNodeId to the first available output and marks the clip stale", async () => {
    const track = makeTrack({ type: "video" });
    const clipA = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      sourceType: "generated",
      status: "generated",
      selectedOutputNodeId: "deleted-out",
      versions: [makeSuccessVersion(BASE_UPDATED_AT)]
    });
    const clipB = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      sourceType: "generated",
      status: "generated",
      selectedOutputNodeId: "deleted-out",
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
        outputNodes: [{ id: "new-out", name: "Image Output" }]
      })
    );

    renderHook(() => useWorkflowFreshnessCheck("seq-1"));

    await waitFor(() => {
      const a = useTimelineStore
        .getState()
        .clips.find((c) => c.id === clipA.id);
      expect(a?.selectedOutputNodeId).toBe("new-out");
    });

    const clips = useTimelineStore.getState().clips;
    expect(clips.find((c) => c.id === clipB.id)?.selectedOutputNodeId).toBe(
      "new-out"
    );
    expect(clips.find((c) => c.id === clipA.id)?.status).toBe("stale");
  });
});
