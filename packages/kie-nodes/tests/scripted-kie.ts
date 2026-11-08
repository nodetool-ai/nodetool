/**
 * A processing context whose `kie` provider is a ScriptedProvider, so pack
 * tests run nodes without a network or a key.
 */
import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";
import type { MediaUpload, ScriptedEndpointReply } from "@nodetool-ai/runtime";

export const RESULT_URL = "https://kie.cdn.test/result.bin";
export const RESULT_BYTES = new Uint8Array([1, 2, 3]);

/** A finished `recordInfo` body naming `urls` as its results. */
export function finishedJob(
  urls: string[] = [RESULT_URL],
  data: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    code: 200,
    data: { state: "success", resultJson: JSON.stringify({ resultUrls: urls }), ...data }
  };
}

export interface ScriptedKieOptions {
  endpoints?: Record<string, ScriptedEndpointReply | ScriptedEndpointReply[]>;
  downloads?: Record<string, Uint8Array>;
  uploadUrl?: (upload: MediaUpload, index: number) => string;
}

export function scriptedKie(options: ScriptedKieOptions = {}): {
  provider: ScriptedProvider;
  context: ProcessingContext;
} {
  const provider = new ScriptedProvider([], {
    providerId: "kie",
    endpoints: options.endpoints ?? {
      "*": { output: finishedJob(), requestId: "task-1" }
    },
    downloads: { [RESULT_URL]: RESULT_BYTES, ...options.downloads },
    uploadUrl:
      options.uploadUrl ?? ((_upload, index) => `https://kie.cdn.test/upload-${index}`)
  });
  const context = new ProcessingContext({ jobId: "job-1" });
  context.setProviderResolver(() => provider);
  return { provider, context };
}
