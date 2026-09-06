/**
 * PRD § 8.7 criterion 2: a sequence at each stage resumes at that step, and a
 * sequence without `setup` opens as it did before the flow existed.
 */

import { act, renderHook } from "@testing-library/react";

import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import type { TimelineSetupStage } from "@nodetool-ai/timeline";
import { useVideoSetupFlow } from "../useVideoSetupFlow";

jest.mock("../../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: jest.fn(async () => ({}))
}));
jest.mock("../../../../hooks/storyboard/useStoryboards", () => ({
  useExampleStoryboards: () => ({ data: [] })
}));

beforeEach(() => {
  useTimelineStore.getState().reset();
});

const seed = (stage: TimelineSetupStage, over: Record<string, unknown> = {}) => {
  useTimelineStore.getState().setSetup({
    stage,
    brief: "a paper boat",
    format: "ad-15",
    ...over
  });
};

describe("useVideoSetupFlow (criterion 2)", () => {
  it("resumes at the stage the document carries", () => {
    for (const stage of ["idea", "format", "review", "look"] as const) {
      seed(stage);
      const { result } = renderHook(() => useVideoSetupFlow());
      expect(result.current.stage).toBe(stage);
      expect(
        result.current.steps.some((step) => step.stage === stage)
      ).toBe(true);
    }
  });

  it("maps a sequence with no setup to no step, so the editor keeps it", () => {
    const { result } = renderHook(() => useVideoSetupFlow());
    expect(result.current.stage).toBe("done");
    expect(result.current.steps.some((step) => step.stage === "done")).toBe(
      false
    );
  });

  it("offers the four steps, with format and review under one stepper entry", () => {
    seed("idea");
    const { result } = renderHook(() => useVideoSetupFlow());
    expect(result.current.steps.map((step) => step.stage)).toEqual([
      "idea",
      "format",
      "review",
      "look"
    ]);
    expect(result.current.steps.map((step) => step.label)).toEqual([
      "Idea",
      "Beats",
      "Beats",
      "Look"
    ]);
  });

  it("holds Continue until there is a brief", () => {
    seed("idea", { brief: "" });
    const { result, rerender } = renderHook(() => useVideoSetupFlow());
    expect(result.current.steps[0].canAdvance).toBe(false);
    act(() => useTimelineStore.getState().setSetup({ brief: "a paper boat" }));
    rerender();
    expect(result.current.steps[0].canAdvance).toBe(true);
  });

  it("holds Plan the beats until a format is chosen", () => {
    seed("format", { format: undefined });
    const { result, rerender } = renderHook(() => useVideoSetupFlow());
    expect(result.current.steps[1].canAdvance).toBe(false);
    act(() => useTimelineStore.getState().setSetup({ format: "spot-30" }));
    rerender();
    expect(result.current.steps[1].canAdvance).toBe(true);
  });

  it("writes the stage back onto the document when the shell moves", () => {
    seed("format");
    const { result } = renderHook(() => useVideoSetupFlow());
    act(() => result.current.onStageChange("review"));
    expect(useTimelineStore.getState().setup?.stage).toBe("review");
  });

  it("names the outcome on every primary button", () => {
    seed("idea");
    const { result } = renderHook(() => useVideoSetupFlow());
    expect(result.current.steps.map((step) => step.primaryLabel)).toEqual([
      "Continue",
      "Plan the beats",
      "Continue to look",
      "Generate your video"
    ]);
  });
});
