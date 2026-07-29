/**
 * Agent script mode — end-to-end through Agent.execute with a pre-authored
 * script (skips the planner) and with ScriptPlanner in the loop.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Agent } from "../src/agent.js";
import type {
  BaseProvider,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import { createMockContext } from "./_helpers/mock-context.js";

const ECHO_SCHEMA = {
  type: "object",
  properties: { echo: { type: "string" } },
  required: ["echo"]
};

/**
 * Provider serving both roles: `submit_script` calls (planner) are answered
 * with `plannerScript`; execution loops finish via `finish_step`, echoing the
 * step objective.
 */
function createDualProvider(plannerScript: string | null): BaseProvider {
  let calls = 0;
  return {
    provider: "dual",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      messages: Array<{ role: string; content: unknown }>;
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      calls++;
      const submit = args.tools?.find((t) => t.name === "submit_script");
      if (submit) {
        if (plannerScript !== null && !args.signal?.aborted) {
          const tc: ToolCall = {
            id: `plan_${calls}`,
            name: "submit_script",
            args: { script: plannerScript }
          };
          yield tc;
          const content = await submit.execute?.(tc.args as never);
          yield {
            type: "message",
            message: {
              role: "tool",
              toolCallId: tc.id,
              content: String(content)
            }
          };
        }
        yield { type: "chunk", content: "", done: true };
        return;
      }

      const system = String(args.messages[0]?.content ?? "");
      const objective = /# Objective\n(.*)/.exec(system)?.[1] ?? "?";
      const finish = args.tools?.find((t) => t.name === "finish_step");
      const tc: ToolCall = {
        id: `exec_${calls}`,
        name: "finish_step",
        args: { result: { echo: objective } }
      };
      yield tc;
      const content = await finish?.execute?.(tc.args as never);
      yield {
        type: "message",
        message: {
          role: "tool",
          toolCallId: tc.id,
          content: typeof content === "string" ? content : JSON.stringify(content)
        }
      };
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

async function makeWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "agent-script-test-"));
}

describe("Agent script mode", () => {
  it("runs a pre-authored script (no planning) and sets results", async () => {
    const agent = new Agent({
      name: "scripted",
      objective: "echo things",
      provider: createDualProvider(null),
      model: "test",
      workspace: await makeWorkspace(),
      script: `const results = await parallel(
        ["one", "two"].map((p) => () =>
          agent(p, { schema: ${JSON.stringify(ECHO_SCHEMA)} })
        )
      );
      return results.map((r) => r.echo).sort();`
    });

    const types: string[] = [];
    for await (const msg of agent.execute(createMockContext())) {
      types.push(msg.type);
    }

    expect(agent.getResults()).toEqual(["one", "two"]);
    expect(types).toContain("step_result");
  });

  it("plans the script via ScriptPlanner when useScriptPlanner is set", async () => {
    const plannerScript = `const a = await agent("planned prompt", { schema: ${JSON.stringify(ECHO_SCHEMA)} });
return a.echo;`;

    const agent = new Agent({
      name: "planned",
      objective: "echo via planner",
      provider: createDualProvider(plannerScript),
      model: "test",
      workspace: await makeWorkspace(),
      useScriptPlanner: true
    });

    const messages: string[] = [];
    for await (const msg of agent.execute(createMockContext())) {
      messages.push(msg.type);
    }

    expect(agent.getResults()).toBe("planned prompt");
    expect(messages).toContain("planning_update");
  });

  it("throws when the planner produces no valid script", async () => {
    const agent = new Agent({
      name: "planless",
      objective: "nothing works",
      provider: createDualProvider("return 1;"), // fails validation, no retry
      model: "test",
      workspace: await makeWorkspace(),
      useScriptPlanner: true
    });

    const drain = async () => {
      for await (const _msg of agent.execute(createMockContext())) {
        // drain
      }
    };
    await expect(drain()).rejects.toThrow(
      /ScriptPlanner failed to produce an orchestration script/
    );
  });
});
