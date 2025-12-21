import { useQuery } from "@tanstack/react-query";
import { BASE_URL } from "../stores/BASE_URL";
import type { ImageModel, LanguageModel, TTSModel, ASRModel, UnifiedModel } from "../stores/ApiTypes";

type TaskType = "image" | "language" | "tts" | "asr";

const inferProvider = (m: UnifiedModel): string => {
  const t = (m.type || "").toLowerCase();
  const tags = (m.tags || []).map((x) => (x || "").toLowerCase());
  if (t === "mlx" || tags.includes("mlx") || tags.includes("mflux")) {return "mlx";}
  if (t.startsWith("hf.")) {return "huggingface";}
  if (t === "llama_cpp") {return "llama_cpp";}
  if (t === "vllm") {return "vllm";}
  return "huggingface";
};

const mapUnifiedToImageModel = (u: UnifiedModel): ImageModel => ({
  type: "image_model",
  id: u.id,
  name: u.name || u.repo_id || u.id,
  provider: inferProvider(u) as any,
});

const mapUnifiedToLanguageModel = (u: UnifiedModel): LanguageModel => ({
  type: "language_model",
  id: u.id,
  name: u.name || u.repo_id || u.id,
  provider: inferProvider(u) as any,
});

const mapUnifiedToASRModel = (u: UnifiedModel): ASRModel => ({
  type: "asr_model",
  id: u.id,
  name: u.name || u.repo_id || u.id,
  provider: inferProvider(u) as any,
});

const mapUnifiedToTTSModel = (u: UnifiedModel): TTSModel => ({
  type: "tts_model",
  id: u.id,
  name: u.name || u.repo_id || u.id,
  provider: inferProvider(u) as any,
  voices: [],
  selected_voice: "",
});

export const useRecommendedTaskModels = <T extends TaskType>(task: T) => {
  return useQuery({
    queryKey: ["recommended", task],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/models/recommended/${task}`);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Failed to fetch recommended ${task} models: ${res.status} ${txt}`);
      }
      const unified = (await res.json()) as UnifiedModel[];
      switch (task) {
        case "image":
          return unified.map(mapUnifiedToImageModel);
        case "language":
          return unified.map(mapUnifiedToLanguageModel);
        case "asr":
          return unified.map(mapUnifiedToASRModel);
        case "tts":
          return unified.map(mapUnifiedToTTSModel);
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};

