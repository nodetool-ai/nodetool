/**
 * `nodetool.nodes` (catalog discovery) and `nodetool.jobs.wait` (background-job
 * polling) — real QuickJS sandbox, fake chat tool router. No network, no model.
 */
import { describe, it, expect } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  createChatCodeActSession,
  type ChatCodeActToolCall
} from "../src/codeact/chat-codeact.js";
import { buildNodetoolApiPromptSection } from "../src/codeact/nodetool-api.js";
import { createMockContext } from "./_helpers/mock-context.js";

const toolDef = (name: string) => ({
  name,
  description: `Tool ${name}.`,
  inputSchema: { type: "object", properties: {} }
});

const NODE_TOOLS = ["search_nodes", "get_node_info", "list_nodes"].map(toolDef);
const JOB_TOOLS = ["list_jobs", "get_job", "get_job_logs"].map(toolDef);

/** Router for the catalog tools plus a get_job that settles after N polls. */
function createFakeRouter(options?: { runningPolls?: number }) {
  const calls: ChatCodeActToolCall[] = [];
  const runningPolls = options?.runningPolls ?? 0;
  let jobPolls = 0;
  const executeTool = async (call: ChatCodeActToolCall): Promise<unknown> => {
    calls.push(call);
    const args = call.args;
    switch (call.name) {
      case "search_nodes":
        return JSON.stringify({
          query: args["query"],
          results: [{ node_type: "nodetool.text.Concat" }]
        });
      case "get_node_info":
        return JSON.stringify({
          node_type: args["node_type"],
          properties: [{ name: "a", type: "str" }]
        });
      case "list_nodes":
        return JSON.stringify({ namespace: args["namespace"], nodes: [] });
      case "get_job": {
        jobPolls++;
        const done = runningPolls >= 0 && jobPolls > runningPolls;
        return JSON.stringify({
          id: args["job_id"],
          status: done ? "completed" : "running",
          polls: jobPolls
        });
      }
      default:
        return JSON.stringify({ error: `Unknown tool ${call.name}` });
    }
  };
  return { executeTool, calls, jobPollCount: () => jobPolls };
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

describe("nodetool.nodes", () => {
  it("searches the catalog, wrapping a bare string query in an array", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(NODE_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const a = await nodetool.nodes.search("summarize text", {
         n_results: 5,
         output_type: "str"
       });
       const b = await nodetool.nodes.search(["concat", "join"]);
       return { a: a.results.length, b: b.query };`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "search_nodes",
      args: {
        query: ["summarize text"],
        n_results: 5,
        output_type: "str"
      }
    });
    expect(calls[1].args["query"]).toEqual(["concat", "join"]);
  });

  it("maps info(type) onto node_type and list(opts) onto list_nodes", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(NODE_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const info = await nodetool.nodes.info("nodetool.text.Concat");
       await nodetool.nodes.list({ namespace: "nodetool.text", limit: 20 });
       return info.properties.length;`
    );
    expect(obs.ok).toBe(true);
    expect(obs.result).toBe(1);
    expect(calls[0]).toMatchObject({
      name: "get_node_info",
      args: { node_type: "nodetool.text.Concat" }
    });
    expect(calls[1]).toMatchObject({
      name: "list_nodes",
      args: { namespace: "nodetool.text", limit: 20 }
    });
  });

  it("names the missing tool when the belt has no catalog tools", async () => {
    const { executeTool } = createFakeRouter();
    const session = makeSession(JOB_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `try { await nodetool.nodes.info("x"); return "no throw"; }
       catch (e) { return e.message; }`
    );
    expect(obs.ok).toBe(true);
    expect(String(obs.result)).toContain('"get_node_info"');
  });

  it("documents the namespace only when the belt carries a catalog tool", () => {
    const withNodes = buildNodetoolApiPromptSection(["search_nodes"]);
    expect(withNodes).toContain("nodetool.nodes");
    expect(withNodes).toContain("NEVER guess a node");
    expect(buildNodetoolApiPromptSection(["get_job"])).not.toContain(
      "nodetool.nodes"
    );
  });
});

describe("nodetool.jobs.wait", () => {
  it("polls until the job reaches a terminal status", async () => {
    const { executeTool, calls, jobPollCount } = createFakeRouter({
      runningPolls: 2
    });
    const session = makeSession(JOB_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const job = await nodetool.jobs.wait("job1", { pollMs: 1 });
       return job;`
    );
    expect(obs.ok).toBe(true);
    const job = obs.result as { id: string; status: string; polls: number };
    expect(job.status).toBe("completed");
    expect(job.id).toBe("job1");
    expect(jobPollCount()).toBeGreaterThanOrEqual(3);
    expect(calls.every((c) => c.name === "get_job")).toBe(true);
    expect(calls[0].args).toEqual({ job_id: "job1" });
  });

  it("returns immediately when the job is already terminal", async () => {
    const { executeTool, jobPollCount } = createFakeRouter({ runningPolls: 0 });
    const session = makeSession(JOB_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const job = await nodetool.jobs.wait("job2");
       return job.status;`
    );
    expect(obs.ok).toBe(true);
    expect(obs.result).toBe("completed");
    expect(jobPollCount()).toBe(1);
  });

  // A live session called `wait(job.id)` on the receipt `start()` returns —
  // which spells its id `job_id` — and the undefined reached the tool, which
  // answered "Job undefined was not found".
  it("takes the receipt start() returns, not just an id string", async () => {
    const { executeTool, calls } = createFakeRouter({ runningPolls: 0 });
    const session = makeSession(JOB_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const receipt = { job_id: "job3", status: "running" };
       const job = await nodetool.jobs.wait(receipt);
       return job.id;`
    );
    expect(obs.ok).toBe(true);
    expect(obs.result).toBe("job3");
    expect(calls[0].args).toEqual({ job_id: "job3" });
  });

  it("names the call, not a phantom job, when the id is missing", async () => {
    const { executeTool, calls } = createFakeRouter({ runningPolls: 0 });
    const session = makeSession(JOB_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `try {
         await nodetool.jobs.wait(undefined);
         return "no throw";
       } catch (e) { return e.message; }`
    );
    expect(obs.ok).toBe(true);
    const message = String(obs.result);
    expect(message).toContain("nodetool.jobs.wait: no job id");
    expect(message).toContain("job_id");
    // Nothing was asked of the belt: the mistake is in the call, not the job.
    expect(calls).toHaveLength(0);
  });

  it("throws a timeout naming the job id and last status", async () => {
    const { executeTool } = createFakeRouter({ runningPolls: -1 });
    const session = makeSession(JOB_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `try {
         await nodetool.jobs.wait("job_stuck", { timeoutMs: 1, pollMs: 1 });
         return "no throw";
       } catch (e) { return e.message; }`
    );
    expect(obs.ok).toBe(true);
    const message = String(obs.result);
    expect(message).toContain("job_stuck");
    expect(message).toContain("running");
    expect(message).toContain("nodetool.jobs.wait");
  });
});
