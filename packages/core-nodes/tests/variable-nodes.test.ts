import { describe, it, expect } from "vitest";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { SetVariableNode, GetVariableNode } from "../src/nodes/variable.js";

function makeContext(): ProcessingContext {
  return new ProcessingContext({ jobId: "variable-test" });
}

async function drain(
  gen: AsyncGenerator<Record<string, unknown>>
): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const item of gen) {
    out.push(item.output);
  }
  return out;
}

describe("SetVariableNode", () => {
  it("publishes the value to its channel and passes it through", async () => {
    const ctx = makeContext();
    ctx.registerChannelWriters("greeting", 1);

    const node = new SetVariableNode();
    node.assign({ name: "greeting", value: "hello" });
    const result = await node.process(ctx);

    expect(result.output).toBe("hello");
    ctx.markChannelWriterDone("greeting");
    expect(await ctx.getChannel("greeting").first()).toBe("hello");
  });

  it("trims surrounding whitespace from the variable name", async () => {
    const ctx = makeContext();
    ctx.registerChannelWriters("spaced", 1);
    const node = new SetVariableNode();
    node.assign({ name: "  spaced  ", value: 7 });

    await node.process(ctx);

    expect(await ctx.getChannel("spaced").first()).toBe(7);
  });

  it("throws when the variable name is empty", async () => {
    const node = new SetVariableNode();
    node.assign({ name: "   ", value: "x" });
    await expect(node.process(makeContext())).rejects.toThrow(
      /non-empty variable name/
    );
  });
});

describe("GetVariableNode", () => {
  it("streams every value published to its channel", async () => {
    const ctx = makeContext();
    ctx.registerChannelWriters("topic", 1);
    const ch = ctx.getChannel("topic");
    ch.send("a");
    ch.send("b");
    ch.close();

    const node = new GetVariableNode();
    node.assign({ name: "topic" });
    expect(await drain(node.genProcess(ctx))).toEqual(["a", "b"]);
  });

  it("emits nothing for a name no one sets", async () => {
    const ctx = makeContext();
    const node = new GetVariableNode();
    node.assign({ name: "missing" });
    expect(await drain(node.genProcess(ctx))).toEqual([]);
  });

  it("waits for a value, then ends when the last writer closes", async () => {
    const ctx = makeContext();
    ctx.registerChannelWriters("late", 1);

    const node = new GetVariableNode();
    node.assign({ name: "late" });
    const collected = drain(node.genProcess(ctx));

    ctx.getChannel("late").send("v1");
    ctx.markChannelWriterDone("late"); // closes the channel

    expect(await collected).toEqual(["v1"]);
  });

  it("emits nothing when there is no context", async () => {
    const node = new GetVariableNode();
    node.assign({ name: "x" });
    expect(await drain(node.genProcess())).toEqual([]);
  });

  it("throws when the variable name is empty", async () => {
    const node = new GetVariableNode();
    node.assign({ name: "" });
    await expect(node.genProcess(makeContext()).next()).rejects.toThrow(
      /non-empty variable name/
    );
  });
});

describe("Set/Get Variable round trip over a channel", () => {
  it("a reader sees values regardless of who runs first", async () => {
    const ctx = makeContext();
    ctx.registerChannelWriters("subject", 1);

    // Reader subscribes before the writer publishes.
    const getter = new GetVariableNode();
    getter.assign({ name: "subject" });
    const collected = drain(getter.genProcess(ctx));

    const setter = new SetVariableNode();
    setter.assign({ name: "subject", value: "a wizard" });
    await setter.process(ctx);
    ctx.markChannelWriterDone("subject");

    expect(await collected).toEqual(["a wizard"]);
  });
});
