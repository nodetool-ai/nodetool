import { describe, expect, it } from "vitest";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { PromptNode } from "@nodetool-ai/text-nodes";

function makeContext(
  variables?: Record<string, unknown>
): ProcessingContext {
  return new ProcessingContext({ jobId: "prompt-context-test", variables });
}

describe("PromptNode shared-context variables", () => {
  it("resolves {{ name }} from a variable set on the context", async () => {
    const ctx = makeContext();
    ctx.set("subject", "a dragon");

    const node = new PromptNode();
    node.assign({ prompt: "Describe {{ subject }} in detail" });

    const result = await node.process(ctx);

    expect(result.output).toBe("Describe a dragon in detail");
  });

  it("prefers the node's own dynamic input over a context variable", async () => {
    const ctx = makeContext({ subject: "from context" });

    const node = new PromptNode();
    node.assign({ prompt: "{{ subject }}" });
    node.setDynamic("subject", "from input");

    const result = await node.process(ctx);

    expect(result.output).toBe("from input");
  });

  it("still applies filters to context-provided values", async () => {
    const ctx = makeContext({ name: "ada" });

    const node = new PromptNode();
    node.assign({ prompt: "Hello {{ name|capitalize }}" });

    const result = await node.process(ctx);

    expect(result.output).toBe("Hello Ada");
  });

  it("leaves unknown variables intact and works without a context", async () => {
    const node = new PromptNode();
    node.assign({ prompt: "{{ missing }}" });

    const result = await node.process();

    expect(result.output).toBe("{{ missing }}");
  });
});
