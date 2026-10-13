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

/** Transitional public source for packed CLI releases that still carry every pack. */
export function createBundledPackSource() {
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
    }
  };
}
