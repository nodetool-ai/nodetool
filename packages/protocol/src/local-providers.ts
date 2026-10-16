/**
 * Providers that run models on this machine and need a package installed
 * first. The desktop model picker lists each one beside the configured
 * providers and offers its install in place, so a user reaches a local model
 * without a detour through the Package Manager.
 */
import type { RuntimePackageId } from "./missing-runtime-package.js";

export type LocalProviderInstall =
  /** A runtime package from the desktop Package Manager. */
  | { readonly kind: "runtime"; readonly id: RuntimePackageId }
  /** A Python node pack, installed into the Python environment. */
  | { readonly kind: "python_pack"; readonly repoId: string };

export interface LocalProviderSpec {
  readonly provider: string;
  readonly displayName: string;
  readonly install: LocalProviderInstall;
  /** The name of what the install adds, for the button label. */
  readonly installLabel: string;
  /** The provider capabilities its models serve once installed. */
  readonly capabilities: readonly string[];
  /** Platforms (`process.platform`) the install exists for. Unset means all. */
  readonly platforms?: readonly string[];
}

export const LOCAL_PROVIDERS: readonly LocalProviderSpec[] = [
  {
    provider: "stable_diffusion_cpp",
    displayName: "stable-diffusion.cpp",
    install: { kind: "runtime", id: "sd-cpp" },
    installLabel: "stable-diffusion.cpp",
    capabilities: ["text_to_image", "image_to_image"]
  },
  {
    provider: "node_llama_cpp",
    displayName: "llama.cpp (local)",
    install: { kind: "runtime", id: "node-llama-cpp" },
    installLabel: "llama.cpp",
    capabilities: ["generate_message", "generate_messages", "generate_embedding"]
  },
  {
    provider: "transformers_js",
    displayName: "Transformers.js",
    install: { kind: "runtime", id: "transformers-js" },
    installLabel: "Transformers.js",
    capabilities: [
      "generate_message",
      "generate_messages",
      "text_to_speech",
      "text_to_music",
      "automatic_speech_recognition",
      "generate_embedding",
      "remove_background",
      "estimate_depth",
      "segment_image",
      "text_to_image",
      "upscale_image",
      "rerank"
    ]
  },
  {
    provider: "mlx",
    displayName: "MLX",
    install: { kind: "python_pack", repoId: "nodetool-ai/nodetool-mlx" },
    installLabel: "the MLX pack",
    capabilities: [
      "generate_message",
      "generate_messages",
      "text_to_image",
      "image_to_image",
      "text_to_speech",
      "automatic_speech_recognition"
    ],
    platforms: ["darwin"]
  }
];

export function localProviderSpec(provider: string): LocalProviderSpec | null {
  return LOCAL_PROVIDERS.find((spec) => spec.provider === provider) ?? null;
}
