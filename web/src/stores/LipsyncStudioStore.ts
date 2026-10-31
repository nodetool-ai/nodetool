import { create } from "zustand";
import type { GenerateMediaRequest } from "@nodetool-ai/protocol";
import { rpcRequest } from "../lib/websocket/rpcRequest";
import { useLastModelStore } from "./lastModelStore";

interface LipsyncState {
  sourceAssetId: string | null;
  text: string;
  realPerson: boolean;
  confirmed: boolean;
  status: "idle" | "speech" | "video" | "done" | "failed";
  assetIds: string[];
  error: string | null;
  setSource: (id: string) => void;
  setText: (text: string) => void;
  setRealPerson: (value: boolean) => void;
  setConfirmed: (value: boolean) => void;
  start: (
    speech: GenerateMediaRequest,
    video: GenerateMediaRequest
  ) => Promise<void>;
}

const TIMEOUT_MS = 10 * 60_000;
const firstAsset = (answer: { asset_ids?: string[] }): string => {
  const id = answer.asset_ids?.[0];
  if (!id) {
    throw new Error("The provider returned no media. Try again.");
  }
  return id;
};

export const useLipsyncStudioStore = create<LipsyncState>()((set, get) => ({
  sourceAssetId: null,
  text: "",
  realPerson: false,
  confirmed: false,
  status: "idle",
  assetIds: [],
  error: null,
  setSource: (sourceAssetId) => set({ sourceAssetId, confirmed: false }),
  setText: (text) => set({ text }),
  setRealPerson: (realPerson) => set({ realPerson, confirmed: false }),
  setConfirmed: (confirmed) => set({ confirmed }),
  start: async (speech, video) => {
    const state = get();
    if (
      state.status === "speech" ||
      state.status === "video" ||
      !state.sourceAssetId ||
      !state.text.trim() ||
      (state.realPerson && !state.confirmed) ||
      !speech.model ||
      !speech.provider ||
      !speech.voice ||
      !video.model ||
      !video.provider
    ) {
      return;
    }
    const consent = {
      real_person: state.realPerson,
      confirmed: state.confirmed
    };
    set({ status: "speech", error: null, assetIds: [] });
    try {
      const audioId = firstAsset(
        await rpcRequest(
          "generate_media",
          {
            ...speech,
            mode: "audio",
            prompt: state.text,
            person_consent: consent
          },
          TIMEOUT_MS
        )
      );
      set({ status: "video" });
      const videoId = firstAsset(
        await rpcRequest(
          "generate_media",
          {
            ...video,
            mode: "audio_to_video",
            prompt: state.text,
            source_asset_id: state.sourceAssetId,
            audio_asset_id: audioId,
            person_consent: consent
          },
          TIMEOUT_MS
        )
      );
      const remembered = useLastModelStore.getState();
      remembered.remember("audio", {
        model: speech.model,
        provider: speech.provider,
        voice: speech.voice
      });
      remembered.rememberForTask("video", "audio_to_video", {
        model: video.model,
        provider: video.provider
      });
      set({ status: "done", assetIds: [videoId] });
    } catch (cause) {
      set({
        status: "failed",
        error: cause instanceof Error ? cause.message : ""
      });
    }
  }
}));
