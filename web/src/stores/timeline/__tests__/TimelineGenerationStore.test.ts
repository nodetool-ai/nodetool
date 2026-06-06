import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import { useTimelineGenerationStore } from "../TimelineGenerationStore";

jest.mock("../TimelineStore", () => ({
  useTimelineStore: {
    getState: () => ({
      patchClip: jest.fn()
    })
  }
}));

jest.mock("../../ResultsStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      getOutputResult: jest.fn()
    })
  }
}));

function resetStore() {
  const state = useTimelineGenerationStore.getState();
  for (const clipId of Object.keys(state.clipJobs)) {
    state.clearJob(clipId);
  }
}

describe("TimelineGenerationStore", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("initial state", () => {
    it("starts with empty clipJobs and jobToClip", () => {
      const { clipJobs, jobToClip } = useTimelineGenerationStore.getState();
      expect(clipJobs).toEqual({});
      expect(jobToClip).toEqual({});
    });
  });

  describe("registerJob", () => {
    it("creates a queued job entry", () => {
      act(() => {
        useTimelineGenerationStore.getState().registerJob("clip-1", "job-1", "wf-1");
      });

      const { clipJobs, jobToClip } = useTimelineGenerationStore.getState();
      expect(clipJobs["clip-1"]).toEqual({
        clipId: "clip-1",
        jobId: "job-1",
        workflowId: "wf-1",
        status: "queued",
        progress: 0
      });
      expect(jobToClip["job-1"]).toBe("clip-1");
    });

    it("overwrites an existing job for the same clip", () => {
      act(() => {
        useTimelineGenerationStore.getState().registerJob("clip-1", "job-1", "wf-1");
        useTimelineGenerationStore.getState().registerJob("clip-1", "job-2", "wf-2");
      });

      const { clipJobs, jobToClip } = useTimelineGenerationStore.getState();
      expect(clipJobs["clip-1"].jobId).toBe("job-2");
      expect(jobToClip["job-2"]).toBe("clip-1");
    });

    it("tracks multiple clips independently", () => {
      act(() => {
        useTimelineGenerationStore.getState().registerJob("clip-1", "job-1", "wf-1");
        useTimelineGenerationStore.getState().registerJob("clip-2", "job-2", "wf-1");
      });

      const { clipJobs } = useTimelineGenerationStore.getState();
      expect(Object.keys(clipJobs)).toHaveLength(2);
    });
  });

  describe("updateJobStatus", () => {
    it("transitions a queued job to running", () => {
      act(() => {
        useTimelineGenerationStore.getState().registerJob("clip-1", "job-1", "wf-1");
        useTimelineGenerationStore.getState().updateJobStatus("job-1", "running");
      });

      expect(useTimelineGenerationStore.getState().clipJobs["clip-1"].status).toBe("running");
    });

    it("transitions to failed with error message", () => {
      act(() => {
        useTimelineGenerationStore.getState().registerJob("clip-1", "job-1", "wf-1");
        useTimelineGenerationStore.getState().updateJobStatus("job-1", "failed", {
          errorMessage: "GPU out of memory"
        });
      });

      const job = useTimelineGenerationStore.getState().clipJobs["clip-1"];
      expect(job.status).toBe("failed");
      expect(job.errorMessage).toBe("GPU out of memory");
    });

    it("transitions to completed with assetId", () => {
      act(() => {
        useTimelineGenerationStore.getState().registerJob("clip-1", "job-1", "wf-1");
        useTimelineGenerationStore.getState().updateJobStatus("job-1", "completed", {
          assetId: "asset-42"
        });
      });

      const job = useTimelineGenerationStore.getState().clipJobs["clip-1"];
      expect(job.status).toBe("completed");
      expect(job.assetId).toBe("asset-42");
    });

    it("no-ops for an unknown jobId", () => {
      act(() => {
        useTimelineGenerationStore.getState().registerJob("clip-1", "job-1", "wf-1");
        useTimelineGenerationStore.getState().updateJobStatus("unknown-job", "running");
      });

      expect(useTimelineGenerationStore.getState().clipJobs["clip-1"].status).toBe("queued");
    });
  });

  describe("updateJobProgress", () => {
    it("updates progress within the valid range", () => {
      act(() => {
        useTimelineGenerationStore.getState().registerJob("clip-1", "job-1", "wf-1");
        useTimelineGenerationStore.getState().updateJobProgress("job-1", 50);
      });

      expect(useTimelineGenerationStore.getState().clipJobs["clip-1"].progress).toBe(50);
    });

    it("clamps progress to 0-100", () => {
      act(() => {
        useTimelineGenerationStore.getState().registerJob("clip-1", "job-1", "wf-1");
        useTimelineGenerationStore.getState().updateJobProgress("job-1", 150);
      });

      expect(useTimelineGenerationStore.getState().clipJobs["clip-1"].progress).toBe(100);

      act(() => {
        useTimelineGenerationStore.getState().updateJobProgress("job-1", -10);
      });

      expect(useTimelineGenerationStore.getState().clipJobs["clip-1"].progress).toBe(0);
    });

    it("no-ops for an unknown jobId", () => {
      act(() => {
        useTimelineGenerationStore.getState().registerJob("clip-1", "job-1", "wf-1");
        useTimelineGenerationStore.getState().updateJobProgress("unknown-job", 50);
      });

      expect(useTimelineGenerationStore.getState().clipJobs["clip-1"].progress).toBe(0);
    });
  });

  describe("clearJob", () => {
    it("removes the job entry", () => {
      act(() => {
        useTimelineGenerationStore.getState().registerJob("clip-1", "job-1", "wf-1");
        useTimelineGenerationStore.getState().clearJob("clip-1");
      });

      const { clipJobs, jobToClip } = useTimelineGenerationStore.getState();
      expect(clipJobs["clip-1"]).toBeUndefined();
      expect(jobToClip["job-1"]).toBeUndefined();
    });

    it("no-ops for an unknown clipId", () => {
      act(() => {
        useTimelineGenerationStore.getState().registerJob("clip-1", "job-1", "wf-1");
        useTimelineGenerationStore.getState().clearJob("nonexistent");
      });

      expect(Object.keys(useTimelineGenerationStore.getState().clipJobs)).toHaveLength(1);
    });
  });

  describe("getClipJobState", () => {
    it("returns the job state for a registered clip", () => {
      act(() => {
        useTimelineGenerationStore.getState().registerJob("clip-1", "job-1", "wf-1");
      });

      const state = useTimelineGenerationStore.getState().getClipJobState("clip-1");
      expect(state).toBeDefined();
      expect(state!.jobId).toBe("job-1");
    });

    it("returns undefined for an unregistered clip", () => {
      const state = useTimelineGenerationStore.getState().getClipJobState("missing");
      expect(state).toBeUndefined();
    });
  });

  describe("resolveOutputAssetId", () => {
    it("returns undefined when no result exists", () => {
      const result = useTimelineGenerationStore.getState().resolveOutputAssetId("wf-1", "job-1", "node-1");
      expect(result).toBeUndefined();
    });

    it("returns asset_id from an object result", () => {
      const mockGetOutputResult = jest.fn().mockReturnValue({ asset_id: "asset-42" });
      jest.spyOn(
        require("../../ResultsStore").default, "getState"
      ).mockReturnValue({ getOutputResult: mockGetOutputResult });

      const result = useTimelineGenerationStore.getState().resolveOutputAssetId("wf-1", "job-1", "node-1");
      expect(result).toBe("asset-42");
    });

    it("returns a string result directly", () => {
      const mockGetOutputResult = jest.fn().mockReturnValue("direct-id");
      jest.spyOn(
        require("../../ResultsStore").default, "getState"
      ).mockReturnValue({ getOutputResult: mockGetOutputResult });

      const result = useTimelineGenerationStore.getState().resolveOutputAssetId("wf-1", "job-1", "node-1");
      expect(result).toBe("direct-id");
    });
  });
});
