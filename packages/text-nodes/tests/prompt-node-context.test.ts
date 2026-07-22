import { describe, expect, it } from "vitest";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { PromptNode, TemplateTextNode } from "@nodetool-ai/text-nodes";

function ctxWith(name: string, value: unknown): ProcessingContext {
  const ctx = new ProcessingContext({ jobId: "prompt-context-test" });
  ctx.registerChannelWriters(name, 1);
  ctx.getChannel(name).send(value);
  return ctx;
}

describe("PromptNode variable channels", () => {
  it("resolves {{ name }} from a variable channel", async () => {
    const ctx = ctxWith("subject", "a dragon");
    const node = new PromptNode();
    node.assign({ prompt: "Describe {{ subject }} in detail" });

    expect((await node.process(ctx)).output).toBe("Describe a dragon in detail");
  });

  it("prefers the node's own dynamic input over a channel", async () => {
    const ctx = ctxWith("subject", "from channel");
    const node = new PromptNode();
    node.assign({ prompt: "{{ subject }}" });
    node.setDynamic("subject", "from input");

    expect((await node.process(ctx)).output).toBe("from input");
  });

  it("applies filters to channel-provided values", async () => {
    const ctx = ctxWith("name", "ada");
    const node = new PromptNode();
    node.assign({ prompt: "Hello {{ name|capitalize }}" });

    expect((await node.process(ctx)).output).toBe("Hello Ada");
  });

  it("waits for the channel's first value before rendering", async () => {
    const ctx = new ProcessingContext({ jobId: "prompt-wait" });
    ctx.registerChannelWriters("subject", 1);

    const node = new PromptNode();
    node.assign({ prompt: "Describe {{ subject }}" });
    const pending = node.process(ctx);

    // The value is published only after process() has started waiting.
    ctx.getChannel("subject").send("a dragon");

    expect((await pending).output).toBe("Describe a dragon");
  });

  it("leaves a referenced variable intact when nothing sets it", async () => {
    const ctx = new ProcessingContext({ jobId: "prompt-none" });
    const node = new PromptNode();
    node.assign({ prompt: "{{ missing }}" });

    expect((await node.process(ctx)).output).toBe("{{ missing }}");
  });

  it("works without a context", async () => {
    const node = new PromptNode();
    node.assign({ prompt: "{{ missing }}" });

    expect((await node.process()).output).toBe("{{ missing }}");
  });
});

describe("PromptNode asset variables", () => {
  it("expands an asset-ref dynamic input into its asset:// token", async () => {
    const node = new PromptNode();
    node.assign({ prompt: "Describe {{ img }}" });
    node.setDynamic("img", { type: "image", uri: "asset://abc.png" });

    expect((await node.process()).output).toBe("Describe asset://abc.png");
  });

  it("builds a token from an asset_id-only ref", async () => {
    const node = new PromptNode();
    node.assign({ prompt: "{{ img }}" });
    node.setDynamic("img", { type: "image", asset_id: "xyz" });

    expect((await node.process()).output).toBe("asset://xyz.png");
  });

  it("expands an asset delivered over a variable channel", async () => {
    const ctx = new ProcessingContext({ jobId: "prompt-asset-channel" });
    ctx.registerChannelWriters("clip", 1);
    ctx.getChannel("clip").send({ type: "audio", uri: "asset://a.mp3" });

    const node = new PromptNode();
    node.assign({ prompt: "Transcribe {{ clip }}" });

    expect((await node.process(ctx)).output).toBe("Transcribe asset://a.mp3");
  });

  it("leaves plain-string variables untouched", async () => {
    const node = new PromptNode();
    node.assign({ prompt: "{{ subject }}" });
    node.setDynamic("subject", "a dragon");

    expect((await node.process()).output).toBe("a dragon");
  });
});

describe("TemplateTextNode asset variables", () => {
  it("expands an asset-ref variable into its asset:// token", async () => {
    const node = new TemplateTextNode();
    node.assign({ string: "look at {{ img }}" });
    node.setDynamic("img", { type: "image", asset_id: "xyz" });

    expect((await node.process()).output).toBe("look at asset://xyz.png");
  });
});
