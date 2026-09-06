/**
 * PRD § 8.7 criterion 2: a sequence at each stage resumes at that step, and a
 * sequence without `setup` opens as it did before the flow existed.
 */

import { act, renderHook } from "@testing-library/react";

import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import type { TimelineSetupStage } from "@nodetool-ai/timeline";
import {
  newVideoSetupDocument,
  useVideoSetupFlow
} from "../useVideoSetupFlow";
import { readVideoSetupContext } from "../setupContext";

jest.mock("../../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: jest.fn(async () => ({}))
}));
jest.mock("../../../../hooks/storyboard/useStoryboards", () => ({
  useExampleStoryboards: () => ({ data: [] })
}));
// The look step reads the configured providers' catalogs through TanStack
// Query; this suite stands up no client. What availability does to the step is
// pinned by `LookStep.test.tsx`.
jest.mock("../../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useVideoModelsByProvider: () => ({
    models: [],
    providers: ["nodetool"],
    isLoading: true,
    isFetching: false,
    error: null,
    refetch: async () => undefined
  }),
  useTTSModelsByProvider: () => ({
    models: [],
    providers: ["nodetool"],
    isLoading: true,
    isFetching: false,
    error: null,
    refetch: async () => undefined
  })
}));

beforeEach(() => {
  useTimelineStore.getState().reset();
});

const seed = (
  stage: TimelineSetupStage,
  over: Record<string, unknown> = {}
) => {
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
      expect(result.current.steps.some((step) => step.stage === stage)).toBe(
        true
      );
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
    expect(result.current.steps[1].blockedReason).toBe("Pick a video template");
    act(() => useTimelineStore.getState().setSetup({ format: "spot-30" }));
    rerender();
    expect(result.current.steps[1].canAdvance).toBe(true);
    expect(result.current.steps[1].generation?.result).toContain("8 beats");
    expect(result.current.steps[1].generation?.next).toContain(
      "No generated clips"
    );
    expect(result.current.steps[1].generation?.model?.id).toBeTruthy();
  });

  it("writes the stage back onto the document when the shell moves", () => {
    seed("format");
    const { result } = renderHook(() => useVideoSetupFlow());
    act(() => result.current.onStageChange("review"));
    expect(useTimelineStore.getState().setup?.stage).toBe("review");
  });

  // F15: coming back to the format step and pressing on must not throw the
  // reviewed plan away when nothing it was drafted from has changed.
  it("continues to an existing plan instead of re-planning it", () => {
    seed("format", {
      beats: [{ id: "b1", prompt: "the kerb", duration_ms: 3000 }]
    });
    const { result } = renderHook(() => useVideoSetupFlow());
    const format = result.current.steps[1];
    expect(format.primaryLabel).toBe("Continue to the beats");
    expect(format.onAdvance).toBeUndefined();
    expect(format.generation).toBeUndefined();
  });

  it("offers an explicit re-plan once the brief changed", () => {
    seed("format", {
      beats: [{ id: "b1", prompt: "the kerb", duration_ms: 3000 }]
    });
    const { result, rerender } = renderHook(() => useVideoSetupFlow());
    act(() => useTimelineStore.getState().setSetup({ brief: "a steel hull" }));
    rerender();
    expect(result.current.steps[1].primaryLabel).toBe("Re-plan the beats");
    expect(result.current.steps[1].onAdvance).toBeDefined();
    expect(result.current.steps[1].generation).toBeDefined();
  });

  // F20: the review is the last cheap step, so nothing empty leaves it.
  it("holds Continue to look until every beat has a description and a length", () => {
    seed("review", {
      beats: [{ id: "b1", prompt: "   ", duration_ms: 3000 }]
    });
    const { result, rerender } = renderHook(() => useVideoSetupFlow());
    expect(result.current.steps[2].canAdvance).toBe(false);
    expect(result.current.steps[2].blockedReason).toContain("1 beat");
    act(() =>
      useTimelineStore.getState().updateBeat("b1", { prompt: "the kerb" })
    );
    rerender();
    expect(result.current.steps[2].canAdvance).toBe(true);
  });

  it("holds Continue to look while a beat has no length", () => {
    seed("review", {
      beats: [{ id: "b1", prompt: "the kerb", duration_ms: 0 }]
    });
    const { result } = renderHook(() => useVideoSetupFlow());
    expect(result.current.steps[2].canAdvance).toBe(false);
  });

  // F17: the Voiceover switch is a decision about the output, so it survives a
  // remount. An older document that never carried the field still reads its
  // beats' lines.
  it("stores the Voiceover switch on the document", () => {
    seed("look", {
      beats: [{ id: "b1", prompt: "the kerb", duration_ms: 3000 }]
    });
    const { result } = renderHook(() => useVideoSetupFlow());
    const look = result.current.steps[3];
    act(() => {
      const element = look.render() as unknown as {
        props: { onVoiceChange: (on: boolean) => void };
      };
      element.props.onVoiceChange(false);
    });
    expect(useTimelineStore.getState().setup?.voiceover).toBe(false);
  });

  it("reads a document with no Voiceover field from its beats", () => {
    seed("look", {
      beats: [
        { id: "b1", prompt: "the kerb", duration_ms: 3000, voiceover: "Gone." }
      ]
    });
    const { result } = renderHook(() => useVideoSetupFlow());
    const look = result.current.steps[3];
    expect(
      (look.render() as unknown as { props: { voiceOn: boolean } }).props
        .voiceOn
    ).toBe(true);
  });

  it("keeps a stored no over the beats' own lines", () => {
    seed("look", {
      voiceover: false,
      beats: [
        { id: "b1", prompt: "the kerb", duration_ms: 3000, voiceover: "Gone." }
      ]
    });
    const { result } = renderHook(() => useVideoSetupFlow());
    const look = result.current.steps[3];
    expect(
      (look.render() as unknown as { props: { voiceOn: boolean } }).props
        .voiceOn
    ).toBe(false);
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

// F4: the composer's context rides on the document, and a caller that has
// none writes exactly the document it wrote before the fields existed.
describe("newVideoSetupDocument", () => {
  it("writes neither field when the composer carried nothing", () => {
    expect(newVideoSetupDocument("a paper boat").setup).toEqual({
      stage: "idea",
      brief: "a paper boat"
    });
    expect(newVideoSetupDocument("a paper boat", {}).setup).toEqual({
      stage: "idea",
      brief: "a paper boat"
    });
  });

  it("carries references and entities when there are some", () => {
    const document = newVideoSetupDocument("a paper boat", {
      references: [{ uri: "asset://a1.png", name: "kerb.png" }],
      entityIds: ["e1"]
    });
    expect(readVideoSetupContext(document.setup)).toEqual({
      references: [{ uri: "asset://a1.png", name: "kerb.png" }],
      entityIds: ["e1"]
    });
  });

  it("reads a sequence with no context as empty, not as broken", () => {
    expect(readVideoSetupContext(undefined)).toEqual({
      references: [],
      entityIds: []
    });
    expect(
      readVideoSetupContext({ stage: "idea", brief: "", references: "oops" })
    ).toEqual({ references: [], entityIds: [] });
  });
});
