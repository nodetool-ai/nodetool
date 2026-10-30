import { createLogger } from "@nodetool-ai/config";
import * as agentsModule from "@nodetool-ai/agents";
import { importPack, MissingPackError } from "@nodetool-ai/node-catalog";
import {
  createCatalogPackSource as createHostPackSource,
  loadBundledPackSource as loadHostPackSource,
  type PackSource
} from "@nodetool-ai/pack-host";

export { setDefaultPackSource, type PackSource } from "@nodetool-ai/pack-host";
const log = createLogger("nodetool.websocket.pack-source");
let catalogSource: PackSource | undefined;

async function optionalPack<T extends object>(id: string, specifier?: string): Promise<T | undefined> {
  try { return await importPack<T>(id, specifier); }
  catch (error) {
    if (!(error instanceof MissingPackError)) { throw error; }
    log.info("Optional node pack is unavailable", { ...error.details, message: error.message });
    return undefined;
  }
}

/** Compose the full HTTP host's explicit agent and local-provider integration. */
export function createCatalogPackSource(options: { readonly configuredPackIds?: readonly string[] } = {}): PackSource {
  const configured = options.configuredPackIds;
  return createHostPackSource({
    ...options,
    registerProviders: async policy => {
      const code = configured && !configured.includes("code") ? undefined : await optionalPack<typeof import("@nodetool-ai/code-nodes")>("code");
      code?.setCodeNodeAgentsModule(agentsModule);
      if (!policy.production && (!configured || configured.includes("transformers-js"))) {
        const transformers = await optionalPack<typeof import("@nodetool-ai/transformers-js-provider")>("transformers-js", "@nodetool-ai/transformers-js-provider");
        transformers?.registerTransformersJsProvider();
      }
      if (!policy.production && (!configured || configured.includes("whisper-cpp"))) {
        const whisper = await optionalPack<typeof import("@nodetool-ai/whisper-cpp")>("whisper-cpp");
        whisper?.registerWhisperCppProviders();
      }
    }
  });
}

/** Retain the full host's public default-source entry point. */
export function loadBundledPackSource(): Promise<PackSource> {
  return loadHostPackSource(() => { catalogSource ??= createCatalogPackSource(); return catalogSource; });
}
