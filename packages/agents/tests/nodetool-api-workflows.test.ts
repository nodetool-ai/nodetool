/**
 * `nodetool.workflows` escalation + example coverage — code actions run in
 * the real QuickJS sandbox against a fake chat tool router. No network.
 */
import { describe, it, expect } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  createChatCodeActSession,
  type ChatCodeActToolCall
} from "../src/codeact/chat-codeact.js";
import { createMockContext } from "./_helpers/mock-context.js";

const toolDef = (name: string) => ({
  name,
  description: `Tool ${name}.`,
  inputSchema: { type: "object", properties: {} }
});

const WORKFLOW_TOOLS = [
  "list_workflows",
  "run_workflow",
  "resolve_workflow_escalation",
  "get_example_workflow"
].map(toolDef);

const EXAMPLE_GRAPH = {
  nodes: [
    {
      id: "in",
      type: "nodetool.input.StringInput",
      data: { properties: { name: "prompt" } }
    },
    {
      id: "out",
      type: "nodetool.output.StringOutput",
      data: { properties: { name: "text" } }
    }
  ],
  edges: [
    {
      id: "e1",
      source: "in",
      sourceHandle: "output",
      target: "out",
      targetHandle: "value"
    }
  ]
};

/** In-memory router: records calls, plays one escalation then a report. */
function createFakeRouter() {
  const calls: ChatCodeActToolCall[] = [];
  let verdicts = 0;
  const executeTool = async (call: ChatCodeActToolCall): Promise<unknown> => {
    calls.push(call);
    const args = call.args;
    switch (call.name) {
      case "list_workflows":
        return JSON.stringify({
          workflows: [{ id: "ex1", name: "Summarize", tags: ["text"] }],
          next: null
        });
      case "run_workflow":
        return JSON.stringify({
          status: "escalated",
          session_id: "sess1",
          escalation: {
            id: "esc1",
            node_id: "llm_1",
            allowedActions: ["retry", "skip", "fail"]
          }
        });
      case "resolve_workflow_escalation":
        verdicts++;
        return verdicts === 1
          ? JSON.stringify({
              status: "escalated",
              session_id: args["session_id"],
              escalation: { id: "esc2", allowedActions: ["skip", "fail"] }
            })
          : JSON.stringify({ status: "completed", resolved: verdicts });
      case "get_example_workflow":
        return JSON.stringify({
          id: "ex1",
          name: args["example_name"],
          package_name: args["package_name"],
          graph: EXAMPLE_GRAPH
        });
      default:
        return JSON.stringify({ error: `Unknown tool ${call.name}` });
    }
  };
  return { executeTool, calls };
}

function makeSession(
  tools: Array<{ name: string; description: string; inputSchema: unknown }>,
  executeTool: (call: ChatCodeActToolCall) => Promise<unknown>
) {
  return createChatCodeActSession({
    tools,
    executeTool,
    context: createMockContext() as unknown as ProcessingContext
  });
}

async function runAction(
  session: ReturnType<typeof createChatCodeActSession>,
  code: string
) {
  const observation = await session.executeAction({ code });
  return JSON.parse(observation) as {
    ok: boolean;
    result?: unknown;
    error?: string;
    toolCalls: number;
  };
}

describe("nodetool.workflows escalations", () => {
  it("closes the interactive loop: run → escalation → resolve → report", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(WORKFLOW_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const run = await nodetool.workflows.run("wf1", { q: "hi" }, {
         interactive: true
       });
       const next = await nodetool.workflows.resolve(
         run.session_id, run.escalation.id, "retry"
       );
       const done = await nodetool.workflows.resolve(
         run.session_id, next.escalation.id, "fail",
         { reason: "no key", apply_to: "signature" }
       );
       return { first: next.escalation.id, done: done };`
    );
    expect(obs.ok).toBe(true);
    expect(obs.result).toMatchObject({
      first: "esc2",
      done: { status: "completed", resolved: 2 }
    });
    expect(calls[0]).toMatchObject({
      name: "run_workflow",
      args: { workflow_id: "wf1", params: { q: "hi" }, interactive: true }
    });
    expect(calls[1]).toMatchObject({
      name: "resolve_workflow_escalation",
      args: {
        session_id: "sess1",
        escalation_id: "esc1",
        action: "retry"
      }
    });
    expect(calls[2]).toMatchObject({
      name: "resolve_workflow_escalation",
      args: {
        session_id: "sess1",
        escalation_id: "esc2",
        action: "fail",
        reason: "no key",
        apply_to: "signature"
      }
    });
  });

  it("names the missing tool when the belt cannot resolve", async () => {
    const { executeTool } = createFakeRouter();
    const session = makeSession([toolDef("run_workflow")], executeTool);
    const obs = await runAction(
      session,
      `try {
         await nodetool.workflows.resolve("s", "e", "skip");
         return "no throw";
       } catch (err) { return err.message; }`
    );
    expect(obs.ok).toBe(true);
    expect(String(obs.result)).toContain("resolve_workflow_escalation");
  });
});

/**
 * `validate` throws a refusal, and the refusal has to be readable. It used to
 * list the first eight issues of *any* severity, so one real error arrived
 * under seven "untyped dynamic slot" info notes — which are not problems, and
 * which a model reading eight bullets tries to fix.
 */
describe("nodetool.workflows.validate", () => {
  const issues = [
    {
      severity: "error",
      code: "unset_model",
      message: 'Property "model" requires a language_model'
    },
    {
      severity: "info",
      code: "untyped_dynamic_slot",
      message: 'Edge "e1" targets dynamic input "a"'
    },
    {
      severity: "warning",
      code: "code_unused_input",
      message: 'Input "b" is never read by the code'
    }
  ];

  const session = () =>
    makeSession([toolDef("validate_workflow")], async () =>
      JSON.stringify({ ok: false, issues })
    );

  it("lists the errors and counts the rest", async () => {
    const run = await runAction(
      session(),
      `try {
         await nodetool.workflows.validate({ nodes: [], edges: [] });
         return "no throw";
       } catch (error) { return error.message; }`
    );
    const message = run.result as string;
    expect(message).toContain("requires a language_model");
    expect(message).not.toContain("untyped dynamic slot");
    expect(message).not.toContain("never read by the code");
    expect(message).toContain("2 warning/info issue(s) not blocking");
  });

  it("falls back to every issue when none is an error", async () => {
    const warningsOnly = makeSession([toolDef("validate_workflow")], async () =>
      JSON.stringify({ ok: false, issues: [issues[1]] })
    );
    const run = await runAction(
      warningsOnly,
      `try {
         await nodetool.workflows.validate({ nodes: [], edges: [] });
         return "no throw";
       } catch (error) { return error.message; }`
    );
    expect(run.result as string).toContain('Edge "e1" targets dynamic input');
  });
});

describe("nodetool.workflows examples", () => {
  it("lists examples through list({workflow_type: \"example\"})", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(WORKFLOW_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `return await nodetool.workflows.list({
         workflow_type: "example", query: "sum", limit: 5
       });`
    );
    expect(obs.ok).toBe(true);
    expect(obs.result).toMatchObject({
      workflows: [{ id: "ex1", name: "Summarize" }]
    });
    expect(calls[0]).toMatchObject({
      name: "list_workflows",
      args: { workflow_type: "example", query: "sum", limit: 5 }
    });
  });

  it('splits "<package>/<example>" and hands back the example graph', async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(WORKFLOW_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const ex = await nodetool.workflows.example("nodetool-base/Summarize");
       return {
         types: ex.graph.nodes.map((n) => n.type),
         edges: ex.graph.edges.length
       };`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "get_example_workflow",
      args: { package_name: "nodetool-base", example_name: "Summarize" }
    });
    expect(obs.result).toEqual({
      types: ["nodetool.input.StringInput", "nodetool.output.StringOutput"],
      edges: 1
    });
  });

  it("takes the package separately and defaults to nodetool-base", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(WORKFLOW_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.workflows.example("Chart", { package: "nodetool-lib" });
       await nodetool.workflows.example("Summarize");
       try {
         await nodetool.workflows.example("");
         return "no throw";
       } catch (err) { return err.message; }`
    );
    expect(obs.ok).toBe(true);
    expect(String(obs.result)).toContain("nodetool.workflows.example");
    expect(calls[0]).toMatchObject({
      name: "get_example_workflow",
      args: { package_name: "nodetool-lib", example_name: "Chart" }
    });
    expect(calls[1]).toMatchObject({
      name: "get_example_workflow",
      args: { package_name: "nodetool-base", example_name: "Summarize" }
    });
  });
});
