import { describe, it, expect } from "vitest";
import { z } from "zod";
import { SandboxTool, toJsonSchema } from "../src/SandboxTool.js";
import { ToolClient } from "@nodetool/sandbox";
import type { ProcessingContext } from "@nodetool/runtime";

const makeFetch = (
  responder: (url: string, init?: RequestInit) => Response
): typeof fetch =>
  ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(responder(String(input), init))) as typeof fetch;

function makeClient(
  responder: (url: string, init?: RequestInit) => Response
): ToolClient {
  return new ToolClient({
    baseUrl: "http://sbx",
    fetch: makeFetch(responder)
  });
}

const DummyCtx = {} as ProcessingContext;

describe("toJsonSchema", () => {
  it("produces a JSON schema with type=object for object schemas", () => {
    const s = toJsonSchema(z.object({ x: z.string() }));
    expect(s.type).toBe("object");
    expect(s.properties).toBeDefined();
  });

  it("strips the $schema key", () => {
    const s = toJsonSchema(z.object({ x: z.string() }));
    expect("$schema" in s).toBe(false);
  });

  it("preserves required arrays", () => {
    const s = toJsonSchema(
      z.object({ required: z.string(), optional: z.string().optional() })
    );
    expect(s.required).toEqual(["required"]);
  });
});

describe("SandboxTool", () => {
  const schema = z.object({ q: z.string().min(1) });

  function makeTool(
    invoke: (client: ToolClient, input: { q: string }) => Promise<unknown>
  ): SandboxTool<{ q: string }, unknown> {
    const client = makeClient(
      () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    return new SandboxTool(client, {
      name: "t",
      description: "d",
      inputSchema: schema,
      invoke
    });
  }

  it("rejects invalid input by returning an error object", async () => {
    const tool = makeTool(async () => ({ ok: true }));
    const out = (await tool.process(DummyCtx, { q: "" })) as { error?: string };
    expect(out.error).toBe("invalid input");
  });

  it("passes validated input through to invoke", async () => {
    let captured: unknown = null;
    const tool = makeTool(async (_c, i) => {
      captured = i;
      return { ok: true };
    });
    const out = await tool.process(DummyCtx, { q: "hello" });
    expect(captured).toEqual({ q: "hello" });
    expect(out).toEqual({ ok: true });
  });

  it("wraps invoke failures as an error object instead of throwing", async () => {
    const tool = makeTool(async () => {
      throw new Error("boom");
    });
    const out = (await tool.process(DummyCtx, { q: "hi" })) as {
      error?: string;
    };
    expect(out.error).toBe("boom");
  });

  it("generates a well-formed JSON schema from the Zod schema", () => {
    const tool = makeTool(async () => ({}));
    expect(tool.inputSchema.type).toBe("object");
    const props = tool.inputSchema.properties as Record<string, unknown>;
    expect(props.q).toBeDefined();
  });

  it("uses renderStatus when provided", () => {
    const client = makeClient(
      () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const tool = new SandboxTool(client, {
      name: "t",
      description: "d",
      inputSchema: schema,
      invoke: async () => ({}),
      renderStatus: (i) => `Searching ${i.q}`
    });
    expect(tool.userMessage({ q: "alpha" })).toBe("Searching alpha");
  });

  it("falls back to default userMessage on invalid input", () => {
    const client = makeClient(
      () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const tool = new SandboxTool(client, {
      name: "custom_name",
      description: "d",
      inputSchema: schema,
      invoke: async () => ({}),
      renderStatus: (i) => `go ${i.q}`
    });
    expect(tool.userMessage({})).toBe("Running custom_name");
  });
});
