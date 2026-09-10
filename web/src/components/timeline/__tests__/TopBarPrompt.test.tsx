/** @jest-environment jsdom */
import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Asset, TTSModel, VideoModel } from "../../../stores/ApiTypes";

const mockSend = jest.fn(async (_frame: unknown) => {});
const mockReplies = new Map<string, (message: unknown) => void>();
jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn(async () => {}),
    send: (frame: unknown) => mockSend(frame),
    subscribe: (id: string, reply: (message: unknown) => void) => {
      mockReplies.set(id, reply);
      return () => mockReplies.delete(id);
    },
    setResumeJobIdProvider: jest.fn()
  }
}));
jest.mock("../../../lib/websocket/lookupGenerations", () => ({
  isSettled: (status: string) => status !== "running",
  lookupGenerations: jest.fn(async () => new Map())
}));
jest.mock("../../model_menu/TTSModelMenuDialog", () => ({
  __esModule: true,
  default: ({
    onModelChange
  }: {
    onModelChange: (model: TTSModel) => void;
  }) => (
    <button
      onClick={() =>
        onModelChange({
          id: "tts-1",
          provider: "openai",
          name: "Test speech",
          voices: ["nova", "alloy"]
        } as TTSModel)
      }
    >
      Pick speech model
    </button>
  )
}));
jest.mock("../../model_menu/VideoModelMenuDialog", () => ({
  __esModule: true,
  default: ({
    onModelChange
  }: {
    onModelChange: (model: VideoModel) => void;
  }) => (
    <button
      onClick={() =>
        onModelChange({
          id: "video-test",
          provider: "fal_ai",
          name: "Test video"
        } as VideoModel)
      }
    >
      Pick video model
    </button>
  )
}));

import { landDirectGen } from "../../../hooks/timeline/useTimelineDirectGenJob";
import { TopBarPrompt } from "../TopBarPrompt";
import {
  createTimelineInstance,
  TimelineProvider,
  type TimelineInstance
} from "../../../stores/timeline/TimelineInstance";
import { useLastModelStore } from "../../../stores/lastModelStore";
import { useAssetStore } from "../../../stores/AssetStore";
import { __resetGenerationWatchesForTests } from "../../../lib/websocket/generationWatch";

let instance: TimelineInstance;

function renderPrompt(compact = false) {
  return render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <TopBarPrompt compact={compact} />
      </TimelineProvider>
    </ThemeProvider>
  );
}

async function chooseSpeech() {
  await userEvent.click(screen.getByRole("button", { name: "Video" }));
  expect(screen.getAllByRole("menuitemradio")).toHaveLength(2);
  await userEvent.click(
    screen.getByRole("menuitemradio", { name: "Generate Speech" })
  );
}

async function pickSpeechModel() {
  await userEvent.click(
    screen.getByRole("button", { name: "Select TTS Model" })
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Pick speech model" })
  );
}

beforeEach(() => {
  instance = createTimelineInstance();
  useLastModelStore.setState({ byKind: {} });
  mockSend.mockClear();
  mockReplies.clear();
});

afterEach(() => {
  __resetGenerationWatchesForTests();
  jest.restoreAllMocks();
});

describe("TopBarPrompt", () => {
  it.each([false, true])(
    "generates speech at the playhead and fits its duration (compact=%s)",
    async (compact) => {
      renderPrompt(compact);
      act(() => instance.playback.getState().setTimeMs(2500));
      await chooseSpeech();
      expect(
        screen.queryByRole("button", { name: "720p" })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "4 Sec" })
      ).not.toBeInTheDocument();
      const prompt = screen.getByRole("textbox", {
        name: "Quick text-to-audio prompt"
      });
      await userEvent.type(prompt, "Read the whole sentence aloud.");
      expect(
        screen.getByRole("button", { name: "Generate audio" })
      ).toBeDisabled();
      await pickSpeechModel();
      await userEvent.click(screen.getByRole("button", { name: "nova" }));
      await userEvent.click(screen.getByText("alloy"));
      await userEvent.click(
        screen.getByRole("button", { name: "Generate audio" })
      );

      const clip = instance.doc.getState().clips[0];
      expect(clip).toMatchObject({
        mediaType: "audio",
        bindingKind: "text-to-audio",
        startMs: 2500,
        provider: "openai",
        model: "tts-1",
        voice: "alloy",
        status: "generating"
      });
      expect(
        instance.doc
          .getState()
          .tracks.find((track) => track.id === clip.trackId)?.type
      ).toBe("audio");
      expect(mockSend).toHaveBeenCalledTimes(1);
      const frame = mockSend.mock.calls[0][0] as {
        request_id: string;
        data: Record<string, unknown>;
      };
      expect(frame.data).toMatchObject({
        mode: "audio",
        provider: "openai",
        model: "tts-1",
        voice: "alloy",
        prompt: "Read the whole sentence aloud.",
        variations: 1
      });
      expect(frame.data).not.toHaveProperty("duration");
      expect(frame.data).not.toHaveProperty("aspect_ratio");
      expect(frame.data).not.toHaveProperty("resolution");
      jest
        .spyOn(useAssetStore.getState(), "get")
        .mockResolvedValue({ id: "speech-asset", duration: 12.5 } as Asset);
      act(() =>
        mockReplies.get(frame.request_id)?.({
          type: "rpc_response",
          result: { asset_ids: ["speech-asset"] }
        })
      );
      await waitFor(() =>
        expect(instance.doc.getState().clips[0]).toMatchObject({
          status: "generated",
          currentAssetId: "speech-asset",
          durationMs: 12500
        })
      );
      expect(prompt).toHaveValue("");
    }
  );

  it("keeps a remembered provider's voice instead of offering unrelated defaults", async () => {
    useLastModelStore.getState().remember("audio", {
      provider: "gemini",
      model: "gemini-2.5-flash-preview-tts",
      voice: "Puck"
    });
    renderPrompt();
    await chooseSpeech();
    await userEvent.click(screen.getByRole("button", { name: "Puck" }));
    expect(screen.queryByText("alloy")).not.toBeInTheDocument();
    expect(screen.getAllByText("Puck").length).toBeGreaterThan(0);
  });

  it("uses the provider default when the remembered audio model has no voice", async () => {
    useLastModelStore.getState().remember("audio", {
      provider: "gemini",
      model: "gemini-2.5-flash-preview-tts"
    });
    renderPrompt();
    await chooseSpeech();
    await userEvent.type(screen.getByRole("textbox"), "Hello{enter}");
    const frame = mockSend.mock.calls[0][0] as { data: { voice?: string } };
    expect(frame.data.voice).toBeUndefined();
  });

  it("does not fit retimed audio to its raw source length", async () => {
    instance.doc.getState().addTrack("audio", "Speech");
    const clipId = instance.doc.getState().addDirectGenClip({
      trackId: instance.doc.getState().tracks[0].id,
      startMs: 0,
      durationMs: 16000,
      mediaType: "audio",
      bindingKind: "text-to-audio",
      prompt: "Hello",
      provider: "openai",
      model: "tts-1"
    });
    instance.doc.getState().patchClip(clipId, { speedMultiplier: 0.5 });
    jest
      .spyOn(useAssetStore.getState(), "get")
      .mockResolvedValue({ id: "slow-speech", duration: 8 } as Asset);
    await act(async () =>
      landDirectGen(instance.doc, clipId, "request", null, {
        assetIds: ["slow-speech"],
        errored: false
      })
    );
    expect(instance.doc.getState().clips[0]).toMatchObject({
      currentAssetId: "slow-speech",
      durationMs: 16000,
      speedMultiplier: 0.5
    });
  });

  it("preserves each mode's model and uses the video generation path after switching back", async () => {
    renderPrompt();
    await userEvent.click(screen.getByRole("button", { name: "Select Model" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Pick video model" })
    );
    await chooseSpeech();
    await pickSpeechModel();
    await userEvent.click(screen.getByRole("button", { name: "Speech" }));
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: "Generate Videos" })
    );
    expect(
      screen.getByRole("button", { name: "Test video" })
    ).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox"), "An ocean wave{enter}");
    expect(instance.doc.getState().clips[0]).toMatchObject({
      mediaType: "video",
      bindingKind: "text-to-video",
      model: "video-test",
      aspectRatio: "16:9",
      resolution: "720p",
      durationMs: 4000
    });
    await chooseSpeech();
    expect(
      screen.getByRole("button", { name: "Test speech" })
    ).toBeInTheDocument();
  });

  it("uses an unlocked audio track and refuses generation when all audio tracks are locked", async () => {
    instance.doc.getState().addTrack("audio", "Locked");
    const locked = instance.doc
      .getState()
      .tracks.find((track) => track.type === "audio")!;
    instance.doc.setState({
      tracks: instance.doc
        .getState()
        .tracks.map((track) => ({ ...track, locked: true }))
    });
    renderPrompt();
    await chooseSpeech();
    await pickSpeechModel();
    await userEvent.type(screen.getByRole("textbox"), "Hello");
    await userEvent.click(
      screen.getByRole("button", { name: "Generate audio" })
    );
    expect(mockSend).not.toHaveBeenCalled();
    expect(
      screen.getByText("Unlock an audio track first.")
    ).toBeInTheDocument();
    act(() => instance.doc.getState().addTrack("audio", "Unlocked"));
    await userEvent.click(
      screen.getByRole("button", { name: "Generate audio" })
    );
    const clip = instance.doc.getState().clips[0];
    expect(clip.trackId).not.toBe(locked.id);
    expect(
      instance.doc.getState().tracks.find((track) => track.id === clip.trackId)
        ?.name
    ).toBe("Unlocked");
  });
});
