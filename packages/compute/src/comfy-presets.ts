// One-click ComfyUI models. The template must serve ComfyUI without a login and
// must install its models by itself. Only MiniMax H3 has rendered on a real pod
// through `lib.comfy.RunWorkflow`. Wan 2.2 and LTX 2.3 are untested.

export interface ComfyPreset {
  id: string;
  label: string;
  /** The worker profile that the preset creates. */
  profileName: string;
  templateId: string;
  /** GPUs to try in order, when RunPod has no capacity for the earlier ones. */
  gpus: readonly string[];
  /** Listed hourly price range of `gpus` when the preset was tested. */
  hourlyUsd: { min: number; max: number };
  maxLifetimeMinutes: number;
}

export const COMFY_PRESETS: readonly ComfyPreset[] = [
  {
    id: "minimax-h3",
    label: "MiniMax H3",
    profileName: "ComfyUI MiniMax H3",
    templateId: "dunz9ocpnc",
    gpus: ["NVIDIA RTX PRO 4500 Blackwell", "NVIDIA GeForce RTX 5090"],
    hourlyUsd: { min: 0.72, max: 1.19 },
    maxLifetimeMinutes: 120,
  },
  {
    id: "wan-2-2",
    label: "Wan 2.2",
    profileName: "ComfyUI Wan 2.2",
    templateId: "758dsjwiqz",
    gpus: ["NVIDIA RTX PRO 4500 Blackwell", "NVIDIA GeForce RTX 5090"],
    hourlyUsd: { min: 0.72, max: 1.19 },
    maxLifetimeMinutes: 120,
  },
  {
    id: "ltx-2-3",
    label: "LTX 2.3",
    profileName: "ComfyUI LTX 2.3",
    templateId: "j3hu4cjf5b",
    gpus: ["NVIDIA RTX PRO 4500 Blackwell", "NVIDIA GeForce RTX 5090"],
    hourlyUsd: { min: 0.72, max: 1.19 },
    maxLifetimeMinutes: 120,
  },
];
