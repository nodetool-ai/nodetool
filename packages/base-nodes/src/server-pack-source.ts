import {
  builtinPackUnavailableReason,
  registerBuiltinPacks,
  setBuiltinPackEnabled
} from "./builtin-packs.js";
import { setCodeNodeAgentsModule } from "@nodetool-ai/code-nodes";
import * as agentsModule from "@nodetool-ai/agents";
import { registerTransformersJsProvider } from "@nodetool-ai/transformers-js-provider";
import { registerWhisperCppProviders } from "@nodetool-ai/whisper-cpp";
import type { BuiltinPackPolicy } from "@nodetool-ai/node-sdk";

interface BundledPackSource {
  readonly register: typeof registerBuiltinPacks;
  readonly setEnabled: typeof setBuiltinPackEnabled;
  readonly unavailableReason: typeof builtinPackUnavailableReason;
  readonly registerProviders: (policy: BuiltinPackPolicy) => void;
  readonly modules: Readonly<Record<string, () => Promise<object>>>;
}

/**
 * Every `importPack` target in a pack this source compiles in. The packaged
 * backend inlines these packages into server.mjs, so `importPack` cannot
 * resolve them from disk and takes these loaders instead.
 */
export const BUNDLED_PACK_MODULES = {
  "@nodetool-ai/blender-nodes": () => import("@nodetool-ai/blender-nodes"),
  "@nodetool-ai/document-nodes/lib/pdf-text": () => import("@nodetool-ai/document-nodes/lib/pdf-text"),
  "@nodetool-ai/game-nodes": () => import("@nodetool-ai/game-nodes"),
  "@nodetool-ai/integration-nodes": () => import("@nodetool-ai/integration-nodes"),
  "@nodetool-ai/transformers-js-nodes": () => import("@nodetool-ai/transformers-js-nodes"),
  "@nodetool-ai/video-nodes/nodes/model3d/render3d-headless": () => import("@nodetool-ai/video-nodes/nodes/model3d/render3d-headless"),
  "@nodetool-ai/video-nodes/nodes/timeline": () => import("@nodetool-ai/video-nodes/nodes/timeline"),
  "@nodetool-ai/video-nodes/nodes/timeline/assetFiles": () => import("@nodetool-ai/video-nodes/nodes/timeline/assetFiles"),
  "@nodetool-ai/video-nodes/nodes/timeline/compositeRender": () => import("@nodetool-ai/video-nodes/nodes/timeline/compositeRender"),
  "@nodetool-ai/video-nodes/nodes/timeline/contactSheet": () => import("@nodetool-ai/video-nodes/nodes/timeline/contactSheet"),
  "@nodetool-ai/video-nodes/nodes/timeline/outputFormats": () => import("@nodetool-ai/video-nodes/nodes/timeline/outputFormats"),
  "@nodetool-ai/video-nodes/nodes/timeline/pngSequence": () => import("@nodetool-ai/video-nodes/nodes/timeline/pngSequence")
} satisfies Record<string, () => Promise<object>>;

/** Transitional public source for packed CLI releases that still carry every pack. */
export function createBundledPackSource(): BundledPackSource {
  return {
    register: registerBuiltinPacks,
    setEnabled: setBuiltinPackEnabled,
    unavailableReason: builtinPackUnavailableReason,
    registerProviders: (policy: BuiltinPackPolicy): void => {
      setCodeNodeAgentsModule(agentsModule);
      if (!policy.production) {
        registerTransformersJsProvider();
        registerWhisperCppProviders();
      }
    },
    modules: BUNDLED_PACK_MODULES
  };
}
