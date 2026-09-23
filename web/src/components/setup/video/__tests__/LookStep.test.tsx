/**
 * @jest-environment jsdom
 *
 * Step 3 of the video flow. Two claims: a Voiceover switch that is on holds
 * the paid button until there is a voice that can read the lines, rather than
 * being turned off behind the creator's back (F11); and the model grids tell
 * loading, failure, no provider and nothing compatible apart (F14).
 */

import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useLastModelStore } from "../../../../stores/lastModelStore";
import useProviderOnboardingStore from "../../../../stores/ProviderOnboardingStore";
import { STUDIO_CLIP_MODELS, STUDIO_VOICES } from "../../../../studio/curatedModels";
import {
  LookStep,
  useDraftGenerationSettings,
  useLookStep
} from "../LookStep";

jest.mock("../../../../hooks/useResolvedMediaUri");
jest.mock("../../../../hooks/timeline/useGenerateFromBeats", () => ({
  useGenerateFromBeats: () => jest.fn()
}));
let mockEstimate: {
  total: number;
  label: string;
  destinationCount: number;
  videoRequestCount: number;
  voiceRequestCount: number;
  pricedCount: number;
  unpricedCount: number;
} | null = null;
jest.mock("../../../../hooks/timeline/useBeatPlanCostEstimate", () => ({
  useBeatPlanCostEstimate: () => mockEstimate
}));
jest.mock("../../modelSamples", () => ({
  useModelSamples: () => ({})
}));

interface CatalogState {
  models: Array<{
    id: string;
    name?: string;
    provider?: string;
    voices?: string[];
  }>;
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
  useProviderOnboardingStore.getState().dismiss();
  mockEstimate = null;
  videoCatalog = {
    models: [{ id: CLIP_MODEL.id, provider: "nodetool" }],
    providers: ["nodetool"],
    isLoading: false,
    error: null
  };
  voiceCatalog = {
    models: [
      { id: VOICE.modelId, provider: "nodetool", voices: [VOICE.id] }
    ],
    providers: ["nodetool"],
    isLoading: false,
    error: null
  };
});

describe("useLookStep — the gate before the paid button", () => {
  it("seeds a new draft once, then ignores later global choices", async () => {
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
    const { result } = renderHook(() => useDraftGenerationSettings());

    await waitFor(() =>
      expect(
        useTimelineStore.getState().setup?.generation_settings
      ).toEqual({
        video: { provider: "nodetool", model: CLIP_MODEL.id },
        voice: {
          provider: "nodetool",
          model: VOICE.modelId,
          voice: VOICE.id
        }
      })
    );

    act(() => {
      useLastModelStore.setState({
        byKind: {
          video: { provider: "other", model: "other/video" },
          audio: { provider: "other", model: "other/tts", voice: "other" }
        }
      });
    });

    expect(result.current.video?.model).toBe(CLIP_MODEL.id);
    expect(result.current.voice?.voice).toBe(VOICE.id);
  });

  it("keeps document A choices after document B changes the global preference", () => {
    seedPlan();
    useTimelineStore.getState().setSetup({
      generation_settings: {
        video: { provider: "nodetool", model: CLIP_MODEL.id },
        voice: {
          provider: "nodetool",
          model: VOICE.modelId,
          voice: VOICE.id
        }
      }
    });
    useLastModelStore.setState({
      byKind: {
        video: { provider: "document-b", model: "document-b/video" },
        audio: {
          provider: "document-b",
          model: "document-b/tts",
          voice: "document-b-voice"
        }
      }
    });

    const { result } = renderHook(() => ({
      settings: useDraftGenerationSettings(),
      look: useLookStep({ voiceOn: true, musicOn: false })
    }));

    expect(result.current.look.canAdvance).toBe(true);
    expect(result.current.settings.video?.model).toBe(CLIP_MODEL.id);
    expect(result.current.settings.voice?.voice).toBe(VOICE.id);
  });

  it("shows request counts and qualifies a partial price as a known subtotal", () => {
    seedPlan();
    mockEstimate = {
      total: 1.25,
      label: "$1.25",
      destinationCount: 2,
      videoRequestCount: 6,
      voiceRequestCount: 1,
      pricedCount: 6,
      unpricedCount: 1
    };
    useLastModelStore.setState({
      byKind: { video: { provider: "nodetool", model: CLIP_MODEL.id } }
    });

    const { result } = renderHook(() =>
      useLookStep({ voiceOn: false, musicOn: false })
    );

    expect(result.current.primaryDetail).toBe(
      "2 destinations · 6 video takes · 1 voice request · known subtotal $1.25 · 1 unpriced request"
    );
  });

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

  it("allows a source-only edit without a video provider and states zero generation cost", () => {
    useTimelineStore.getState().setSetup({
      stage: "look",
      brief: "tighten supplied footage",
      format: "ad-15",
      beats: [
        {
          id: "b-source",
          prompt: "trim the supplied shot",
          duration_ms: 3000,
          source_clip_id: "source-clip"
        }
      ]
    });
    videoCatalog = { models: [], providers: [], isLoading: false, error: null };
    mockEstimate = {
      total: 0,
      label: "$0.00",
      destinationCount: 1,
      videoRequestCount: 0,
      voiceRequestCount: 0,
      pricedCount: 0,
      unpricedCount: 0
    };

    const { result } = renderHook(() =>
      useLookStep({ voiceOn: false, musicOn: false })
    );

    expect(result.current.canAdvance).toBe(true);
    expect(result.current.blockedReason).toBeUndefined();
    expect(result.current.primaryDetail).toBe(
      "1 destination · 0 video takes · no generation requests · no generation cost"
    );
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

  it("opens provider onboarding when the providers offer no video model (F14)", async () => {
    seedPlan();
    // An uncurated model the providers report is still pickable, so the note
    // only shows when they report none.
    videoCatalog = {
      models: [],
      providers: ["nodetool"],
      isLoading: false,
      error: null
    };
    renderBody(false);

    expect(
      screen.getByText("Your providers offer no video model.")
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getAllByRole("button", { name: "Connect a provider" })[0]
    );

    expect(useProviderOnboardingStore.getState()).toMatchObject({
      open: true,
      capability: "text_to_video"
    });
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

/**
 * The curated tiles are NodeTool's own managed models, which only the cloud
 * `nodetool` provider reports. A BYOK or desktop install reports none of them
 * while offering several video providers of its own, and the step read that as
 * a setup problem: every tile disabled, "your providers offer no video model",
 * and a paid button that never unblocked.
 */
describe("LookStep on an install without the curated catalog", () => {
  const byokVideo = () => {
    videoCatalog = {
      models: [
        {
          id: "fal-ai/kling-video/v2/master/text-to-video",
          name: "Kling 2 Master",
          provider: "fal_ai"
        },
        {
          id: "wan-video/wan-2.5-t2v",
          name: "Wan 2.5",
          provider: "replicate"
        }
      ],
      providers: ["fal_ai", "replicate"],
      isLoading: false,
      error: null
    };
  };
  const byokVoice = () => {
    voiceCatalog = {
      models: [
        {
          id: "eleven_multilingual_v2",
          name: "Multilingual v2",
          provider: "elevenlabs",
          voices: ["rachel", "adam"]
        }
      ],
      providers: ["elevenlabs"],
      isLoading: false,
      error: null
    };
  };

  it("does not blame the providers when several report video models", () => {
    seedPlan();
    byokVideo();
    renderBody(false);
    expect(
      screen.queryByText(/providers offer no video model/)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/No provider is set up to render video/)
    ).not.toBeInTheDocument();
  });

  it("offers the video models the configured providers do report", () => {
    seedPlan();
    byokVideo();
    renderBody(false);
    expect(
      screen.getByRole("combobox", { name: /Video model/ })
    ).toBeInTheDocument();
  });

  it("does not blame the providers when one reports voices", () => {
    seedPlan();
    byokVideo();
    byokVoice();
    renderBody(true);
    expect(
      screen.queryByText(/providers offer no voice/)
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /Voice/ })
    ).toBeInTheDocument();
  });

  it("still says so when nothing at all reports a video model", () => {
    seedPlan();
    videoCatalog = {
      models: [],
      providers: ["fal_ai"],
      isLoading: false,
      error: null
    };
    renderBody(false);
    expect(
      screen.getByText(/providers offer no video model/)
    ).toBeInTheDocument();
  });
});
