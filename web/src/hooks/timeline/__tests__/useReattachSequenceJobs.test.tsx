/** @jest-environment jsdom */

import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { renderHook, waitFor } from "@testing-library/react";
import {
  createTimelineInstance,
  TimelineProvider
} from "../../../stores/timeline/TimelineInstance";

const reattachMock = jest.fn(async (..._args: unknown[]) => {});
jest.mock("../useTimelineDirectGenJob", () => ({
  reattachSequenceJobs: (...args: unknown[]) => reattachMock(...args)
}));

import { useReattachSequenceJobs } from "../useReattachSequenceJobs";

const emptySequence = {
  id: "seq-empty",
  projectId: "project-1",
  name: "Empty cut",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 0,
  tracks: [],
  clips: [],
  markers: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

afterEach(() => {
  reattachMock.mockClear();
});

describe("useReattachSequenceJobs", () => {
  it("reattaches an empty sequence so deleted destinations can settle", async () => {
    const instance = createTimelineInstance();
    instance.doc.getState().loadSequence(emptySequence);

    renderHook(() => useReattachSequenceJobs("seq-empty"), {
      wrapper: ({ children }) => (
        <TimelineProvider instance={instance}>{children}</TimelineProvider>
      )
    });

    await waitFor(() => {
      expect(reattachMock).toHaveBeenCalledWith(instance.doc, "seq-empty");
    });
  });
});
