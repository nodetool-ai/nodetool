/**
 * @jest-environment jsdom
 *
 * Step 3 of the video flow. Two claims: a Voiceover switch that is on holds
 * the paid button until there is a voice that can read the lines, rather than
 * being turned off behind the creator's back (F11); and the model grids tell
 * loading, failure, no provider and nothing compatible apart (F14).
 */

import { render, renderHook, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useLastModelStore } from "../../../../stores/lastModelStore";
import { STUDIO_CLIP_MODELS, STUDIO_VOICES } from "../../../../studio/curatedModels";
import { LookStep, useLookStep } from "../LookStep";

jest.mock("../../../../hooks/useResolvedMediaUri");
jest.mock("../../../../hooks/timeline/useGenerateFromBeats", () => ({
  useGenerateFromBeats: () => jest.fn()
}));
jest.mock("../../../../hooks/timeline/useBeatPlanCostEstimate", () => ({
  useBeatPlanCostEstimate: () => null
}));
jest.mock("../../modelSamples", () => ({
  useModelSamples: () => ({})
}));

interface CatalogState {
  models: Array<{ id: string; voices?: string[] }>;
  providers: string[];
  isLoading: boolean;
  error: Error | null;
}

let videoCatalog: CatalogState;
let voiceCatalog: CatalogState;
const refetch = jest.fn(async () => undefined);

jest.mock("../../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useVideoModelsByProvider: () => ({ ...videoCatalog, refetch }),
  useTTSModelsByProvider: () => ({ ...voiceCatalog, refetch })
}));

const CLIP_MODEL = STUDIO_CLIP_MODELS[0];
const VOICE = STUDIO_VOICES[0];

const seedPlan = () =>
  useTimelineStore.getState().setSetup({
    stage: "look",
    brief: "a paper boat",
    format: "ad-15",
    beats: [{ id: "b1", prompt: "the kerb", duration_ms: 3000 }]
  });

const renderBody = (voiceOn = true) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <LookStep
        voiceOn={voiceOn}
        musicOn={false}
        onVoiceChange={jest.fn()}
        onMusicChange={jest.fn()}
        musicAvailable={false}
      />
    </ThemeProvider>
  );

beforeEach(() => {
  useTimelineStore.getState().reset();
  useLastModelStore.setState({ byKind: {} });
  videoCatalog = {
    models: [{ id: CLIP_MODEL.id }],
    providers: ["nodetool"],
    isLoading: false,
    error: null
  };
  voiceCatalog = {
    models: [{ id: VOICE.modelId, voices: [VOICE.id] }],
    providers: ["nodetool"],
    isLoading: false,
    error: null
  };
});

describe("useLookStep — the gate before the paid button", () => {
  it("holds the button while Voiceover is on and no voice is picked (F11)", () => {
    seedPlan();
    useLastModelStore.setState({
      byKind: { video: { provider: "nodetool", model: CLIP_MODEL.id } }
    });
    const { result } = renderHook(() =>
      useLookStep({ voiceOn: true, musicOn: false })
    );
    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toBe(
      "Pick a voice, or switch Voiceover off"
    );
  });

  it("releases the button once a voice the providers offer is picked (F11)", () => {
    seedPlan();
    useLastModelStore.setState({
      byKind: {
        video: { provider: "nodetool", model: CLIP_MODEL.id },
        audio: {
          provider: "nodetool",
          model: VOICE.modelId,
          voice: VOICE.id
        }
      }
    });
    const { result } = renderHook(() =>
      useLookStep({ voiceOn: true, musicOn: false })
    );
    expect(result.current.canAdvance).toBe(true);
    expect(result.current.blockedReason).toBeUndefined();
  });

  it("releases the button when the creator switches Voiceover off (F11)", () => {
    seedPlan();
    useLastModelStore.setState({
      byKind: { video: { provider: "nodetool", model: CLIP_MODEL.id } }
    });
    const { result } = renderHook(() =>
      useLookStep({ voiceOn: false, musicOn: false })
    );
    expect(result.current.canAdvance).toBe(true);
  });

  it("refuses a voice the providers do not offer (F11, F14)", () => {
    seedPlan();
    voiceCatalog = { ...voiceCatalog, models: [] };
    useLastModelStore.setState({
      byKind: {
        video: { provider: "nodetool", model: CLIP_MODEL.id },
        audio: { provider: "nodetool", model: VOICE.modelId, voice: VOICE.id }
      }
    });
    const { result } = renderHook(() =>
      useLookStep({ voiceOn: true, musicOn: false })
    );
    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toContain("do not offer that voice");
  });

  it("refuses a video model the providers do not offer (F14)", () => {
    seedPlan();
    videoCatalog = { ...videoCatalog, models: [{ id: "some/other-model" }] };
    useLastModelStore.setState({
      byKind: { video: { provider: "nodetool", model: CLIP_MODEL.id } }
    });
    const { result } = renderHook(() =>
      useLookStep({ voiceOn: false, musicOn: false })
    );
    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toContain(
      "do not offer that video model"
    );
  });

  it("says so when no provider renders video at all (F14)", () => {
    seedPlan();
    videoCatalog = { models: [], providers: [], isLoading: false, error: null };
    const { result } = renderHook(() =>
      useLookStep({ voiceOn: false, musicOn: false })
    );
    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toContain("No provider is set up");
  });

  it("judges no tile while the catalog is still loading (F14)", () => {
    seedPlan();
    videoCatalog = {
      models: [],
      providers: ["nodetool"],
      isLoading: true,
      error: null
    };
    useLastModelStore.setState({
      byKind: { video: { provider: "nodetool", model: CLIP_MODEL.id } }
    });
    const { result } = renderHook(() =>
      useLookStep({ voiceOn: false, musicOn: false })
    );
    expect(result.current.canAdvance).toBe(true);
  });
});

describe("LookStep body", () => {
  it("opens with the step heading, not with a control (F32)", () => {
    seedPlan();
    renderBody(false);
    expect(
      screen.getByRole("heading", { name: "Choose your look" })
    ).toBeInTheDocument();
  });

  it("offers a way to ask again when the catalog failed (F14)", () => {
    seedPlan();
    videoCatalog = {
      models: [],
      providers: ["nodetool"],
      isLoading: false,
      error: new Error("offline")
    };
    renderBody(false);
    expect(
      screen.getByRole("button", { name: "Try again" })
    ).toBeInTheDocument();
  });

  it("explains a missing voice beside the selector (F11)", () => {
    seedPlan();
    renderBody(true);
    expect(
      screen.getByText(/Pick a voice, or switch Voiceover off/)
    ).toBeInTheDocument();
  });

  it("says what an unavailable bed means, not what is curated (F30)", () => {
    seedPlan();
    renderBody(false);
    expect(
      screen.getByText(/Music generation is unavailable/)
    ).toBeInTheDocument();
  });
});
