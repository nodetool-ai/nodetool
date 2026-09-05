/**
 * Comfy Cloud Provider — the registry entry behind the `COMFY_API_KEY` secret.
 *
 * It runs no generation itself. The `lib.comfy` nodes submit ComfyUI graphs to
 * cloud.comfy.org through the Comfy SDK and do all the work; this class exists
 * for what registration gives every provider: credential resolution, the
 * settings card in Settings → Models & Providers, `isProviderConfigured`,
 * `getContainerEnv` for deployments, and a provider id to write on cost
 * records.
 *
 * No `getAvailable*Models` overrides. The Comfy API v2 enumerates no models —
 * a ComfyUI graph names its own checkpoints — so the derived capability list
 * is deliberately just chat's two entries, and chat itself throws.
 *
 * The same key authenticates partner API nodes inside a submitted graph, which
 * the SDK passes as `extra_data.api_key_comfy_org`.
 *
 * API keys: https://platform.comfy.org
 */

import { BaseProvider } from "./base-provider.js";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import type { Message, ProviderStreamItem } from "./types.js";

export class ComfyCloudProvider extends BaseProvider {
  private readonly apiKey: string;

  static override requiredSecrets(): string[] {
    return ["COMFY_API_KEY"];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super(PROVIDER_IDS.COMFY_CLOUD);
    this.apiKey = (secrets["COMFY_API_KEY"] as string) ?? "";
  }

  override getContainerEnv(): Record<string, string> {
    return { COMFY_API_KEY: this.apiKey };
  }

  async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("comfy_cloud does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("comfy_cloud does not support chat generation");
  }
}
