/**
 * Media provider calls that ChatUI should surface while they run.
 * Judge / embed / ASR / chat-model predictions stay silent.
 */
const MEDIA_PREDICTION_CAPABILITIES = new Set<string>([
  "text_to_image",
  "image_to_image",
  "text_to_video",
  "image_to_video",
  "video_to_video",
  "lip_sync",
  "text_to_speech",
  "text_to_music"
]);

export interface ActiveMediaPrediction {
  id: string;
  provider: string;
  model: string;
  capability: string;
  startedAt: number;
}

export function isMediaPredictionCapability(
  capability: string | null | undefined
): boolean {
  return capability != null && MEDIA_PREDICTION_CAPABILITIES.has(capability);
}

export function mediaPredictionLabel(capability: string): string {
  switch (capability) {
    case "text_to_image":
    case "image_to_image":
      return "Generating image";
    case "text_to_video":
    case "image_to_video":
    case "video_to_video":
    case "lip_sync":
      return "Generating video";
    case "text_to_speech":
    case "text_to_music":
      return "Generating audio";
    default:
      return "Generating";
  }
}

export function formatPredictionElapsed(seconds: number): string {
  if (seconds < 1) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function applyMediaPrediction(
  current: ActiveMediaPrediction[] | undefined,
  update: {
    id: string;
    status: string;
    provider?: string | null;
    model?: string | null;
    capability?: string | null;
  },
  now: number = Date.now()
): ActiveMediaPrediction[] | null {
  const list = current ?? [];
  if (update.status === "running") {
    if (!isMediaPredictionCapability(update.capability)) {
      return null;
    }
    const next: ActiveMediaPrediction = {
      id: update.id,
      provider: update.provider ?? "",
      model: update.model ?? "",
      capability: update.capability as string,
      startedAt: now
    };
    const index = list.findIndex((item) => item.id === update.id);
    if (index < 0) {
      return [...list, next];
    }
    return list.map((item, i) => (i === index ? next : item));
  }
  if (update.status === "completed" || update.status === "failed") {
    if (!list.some((item) => item.id === update.id)) {
      return null;
    }
    return list.filter((item) => item.id !== update.id);
  }
  return null;
}
