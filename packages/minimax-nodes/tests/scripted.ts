import { ProcessingContext, ScriptedProvider } from "@nodetool-ai/runtime";
import type {
  ScriptedEndpointReply,
  ScriptedProviderOptions
} from "@nodetool-ai/runtime";

/**
 * A processing context whose `minimax` provider answers from scripted
 * replies. Every endpoint call, keyed by model or "*", and every download is
 * recorded on the returned provider.
 */
export function scriptedMinimax(
  reply: ScriptedEndpointReply | ScriptedEndpointReply[],
  downloads: ScriptedProviderOptions["downloads"] = {}
): { provider: ScriptedProvider; context: ProcessingContext } {
  const provider = new ScriptedProvider([], {
    providerId: "minimax",
    endpoints: { "*": reply },
    downloads
  });
  const context = new ProcessingContext({ jobId: "job-1" });
  context.setProviderResolver(() => provider);
  return { provider, context };
}

/** The predictions a context emitted, newest last. */
export function predictions(context: ProcessingContext): unknown[] {
  return context.getMessages().filter((m) => m.type === "prediction");
}
