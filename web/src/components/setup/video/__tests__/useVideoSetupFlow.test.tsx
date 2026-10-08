/**
 * PRD § 8.7 criterion 2: a sequence at each stage resumes at that step, and a
 * sequence without `setup` opens as it did before the flow existed.
 */

import type { ReactElement } from "react";
import { act, renderHook } from "@testing-library/react";
import { makeClip } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import type { TimelineSetupStage } from "@nodetool-ai/timeline";
import { newVideoSetupDocument, useVideoSetupFlow } from "../useVideoSetupFlow";
import { readVideoSetupContext } from "../setupContext";
import { rpcRequest } from "../../../../lib/websocket/rpcRequest";
import { PLAN_INPUTS_CHANGED } from "../../../../hooks/timeline/usePlanBeats";

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
  }),
  // The format step's model picker reads the same catalogs. One servable
  // language model keeps the plan button live; what an empty catalog does to
  // it is pinned below.
  useLanguageModelsByProvider: () => ({
    models: languageModels,
    providers: languageModels.length > 0 ? ["nodetool"] : [],
    isLoading: languageModelsLoading,
    isFetching: false,
    error: null,
    refetch: async () => undefined
  })
}));

let languageModels: { id: string; provider: string; name: string }[] = [];
let languageModelsLoading = false;
const mockRpc = rpcRequest as jest.Mock;

beforeEach(() => {
  useTimelineStore.getState().reset();
  languageModelsLoading = false;
  mockRpc.mockReset();
  mockRpc.mockImplementation(async () => ({}));
  languageModels = [
    { id: "nodetool/director", provider: "nodetool", name: "NodeTool Director" }
  ];
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
  it("requires review after creative context or production changes, including after remount", async () => {
    seed("review", {
      creative_context: { schema_version: 1, audience: "Travelers" },
      beats: [{ id: "b", prompt: "Camera", duration_ms: 3000 }]
    });
    const hook = renderHook(() => useVideoSetupFlow());
    expect(hook.result.current.steps[3].blockedReason).toContain("review");
    await act(async () => hook.result.current.steps[2].onAdvance?.());
    expect(hook.result.current.steps[3].blockedReason).not.toContain(
      "Production context changed"
    );
    hook.unmount();
    const resumed = renderHook(() => useVideoSetupFlow());
    expect(resumed.result.current.steps[3].blockedReason).not.toContain(
      "Production context changed"
    );
    act(() =>
      useTimelineStore
        .getState()
        .setSetup({
          creative_context: { schema_version: 1, audience: "Photographers" }
        })
    );
    expect(resumed.result.current.steps[3].blockedReason).toContain(
      "Production context changed"
    );
    await act(async () => resumed.result.current.steps[2].onAdvance?.());
    act(() =>
      useTimelineStore
        .getState()
        .updateBeat("b", {
          production: {
            schema_version: 1,
            requested_take_count: 3,
            speech_mode: "none"
          }
        })
    );
    expect(resumed.result.current.steps[3].blockedReason).toContain(
      "Production context changed"
    );
    await act(async () => resumed.result.current.steps[2].onAdvance?.());
    expect(resumed.result.current.steps[3].blockedReason).not.toContain(
      "multiple candidates"
    );
  });
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
      "Media comes later in Look"
    );
    expect(result.current.steps[1].generation?.model?.id).toBeTruthy();
  });

  it("holds Plan the beats when no provider offers a language model", () => {
    // Otherwise the step reaches the button and the run fails there, which is
    // what the hardcoded curated director did on a server with no platform key.
    languageModels = [];
    seed("format");
    const { result } = renderHook(() => useVideoSetupFlow());
    expect(result.current.steps[1].canAdvance).toBe(false);
    expect(result.current.steps[1].blockedReason).toBe(
      "Pick a model to draft the beats"
    );
  });

  it("estimates the step on the model the picker wrote, not a fixed one", () => {
    languageModels = [{ id: "gpt-5", provider: "openai", name: "GPT-5" }];
    seed("format");
    const { result } = renderHook(() => useVideoSetupFlow());
    expect(result.current.steps[1].generation?.model?.id).toBe("gpt-5");
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

describe("useVideoSetupFlow plan outcomes", () => {
  it("stays on the format step when the setup changed under the plan", async () => {
    seed("format");
    let answer: (value: Record<string, unknown>) => void = () => undefined;
    mockRpc.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    const { result } = renderHook(() => useVideoSetupFlow());

    let advanced: Promise<unknown> = Promise.resolve();
    act(() => {
      advanced = Promise.resolve(result.current.steps[1].onAdvance?.());
    });
    act(() => useTimelineStore.getState().setSetup({ brief: "a steel hull" }));
    await act(async () => {
      answer({});
      await expect(advanced).rejects.toThrow(PLAN_INPUTS_CHANGED);
    });

    expect(useTimelineStore.getState().setup?.stage).toBe("format");
    expect(useTimelineStore.getState().setup?.beats).toBeUndefined();
  });

  it("returns false so the shell stays when the owning run is canceled", async () => {
    seed("format");
    let answer: (value: Record<string, unknown>) => void = () => undefined;
    mockRpc.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    const { result } = renderHook(() => useVideoSetupFlow());
    const controller = new AbortController();

    let advanced: Promise<unknown> = Promise.resolve();
    act(() => {
      advanced = Promise.resolve(
        result.current.steps[1].onAdvance?.({ signal: controller.signal })
      );
    });
    controller.abort();
    await act(async () => {
      answer({});
      await expect(advanced).resolves.toBe(false);
    });
  });

  it("shows a failed Re-plan on the review step", async () => {
    seed("review", {
      beats: [{ id: "b1", prompt: "the kerb", duration_ms: 3000 }]
    });
    mockRpc.mockRejectedValue(new Error("The provider refused the request."));
    const { result } = renderHook(() => useVideoSetupFlow());
    const review = () =>
      result.current.steps[2].render() as ReactElement<{
        onReplan: () => void;
        error?: string | null;
      }>;

    expect(review().props.error ?? null).toBeNull();
    await act(async () => {
      review().props.onReplan();
      await Promise.resolve();
    });

    expect(review().props.error).toBe("The provider refused the request.");
    expect(useTimelineStore.getState().setup?.beats?.[0].prompt).toBe(
      "the kerb"
    );
  });

  it("holds Continue on the idea step while dropped media uploads", () => {
    seed("idea");
    const { result } = renderHook(() => useVideoSetupFlow());
    const idea = result.current.steps[0].render() as ReactElement<{
      onImportingChange: (importing: boolean) => void;
    }>;
    expect(result.current.steps[0].canAdvance).toBe(true);

    act(() => idea.props.onImportingChange(true));
    expect(result.current.steps[0].canAdvance).toBe(false);
    expect(result.current.steps[0].blockedReason).toBe("Uploading your media");

    act(() => idea.props.onImportingChange(false));
    expect(result.current.steps[0].canAdvance).toBe(true);
  });

  it("counts one beat per dropped clip in the cost line", () => {
    seed("format");
    useTimelineStore.setState({
      clips: ["kerb.mp4", "harbor.png"].map((name, index) =>
        makeClip({
          id: `c${index}`,
          name,
          startMs: index * 3000,
          durationMs: 3000,
          mediaType: name.endsWith(".png") ? "image" : "video",
          sourceType: "imported"
        })
      )
    });
    const { result } = renderHook(() => useVideoSetupFlow());
    expect(result.current.steps[1].generation?.result).toBe(
      "Draft 2 beats, one per clip"
    );
  });

  it("says the models are loading instead of asking for a pick", () => {
    languageModels = [];
    languageModelsLoading = true;
    seed("format");
    const { result } = renderHook(() => useVideoSetupFlow());
    expect(result.current.steps[1].canAdvance).toBe(false);
    expect(result.current.steps[1].blockedReason).toBe(
      "Loading the models that can draft the beats"
    );
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
      references: [
        { uri: "asset://a1.png", name: "kerb.png", role: "product" }
      ],
      entityIds: ["e1"]
    });
    expect(readVideoSetupContext(document.setup)).toEqual({
      references: [
        { uri: "asset://a1.png", name: "kerb.png", role: "product" }
      ],
      entityIds: ["e1"],
      creativeContext: {
        schema_version: 1,
        reference_bindings: [
          { kind: "product", asset_id: "a1", label: "kerb.png" }
        ]
      }
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
