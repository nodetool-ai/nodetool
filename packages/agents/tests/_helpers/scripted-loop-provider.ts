/**
 * A provider that answers each `generateLoop` call with a scripted list of
 * code actions.
 *
 * Everything below the provider is real: the executor, the bridge, the QuickJS
 * sandbox, and — for a session that allows packages — the module mount. That
 * makes a scripted run a proof that a case is satisfiable and that the wiring
 * under it works, without a model or a network.
 */

import type {
  BaseProvider,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";

export function createScriptedLoopProvider(
  actionsByCall: string[][]
): BaseProvider {
  let call = 0;
  return {
    provider: "fake",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<string | unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const actions = actionsByCall[call++] ?? [];
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      let idx = 0;
      for (const code of actions) {
        if (args.signal?.aborted) break;
        const tc: ToolCall = {
          id: `tc_${call}_${idx++}`,
          name: "execute_code",
          args: { code }
        };
        yield tc;
        const tool = toolMap.get(tc.name);
        const content = tool?.execute ? await tool.execute(tc.args) : "";
        yield {
          type: "message",
          message: {
            role: "tool",
            toolCallId: tc.id,
            content:
              typeof content === "string" ? content : JSON.stringify(content)
          }
        };
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}
