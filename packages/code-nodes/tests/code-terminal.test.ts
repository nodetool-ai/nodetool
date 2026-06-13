import { describe, it, expect } from "vitest";
import {
  RunBashCommandNode,
  startTerminalEmitter,
  stripAnsi
} from "@nodetool-ai/code-nodes";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { TerminalUpdate } from "@nodetool-ai/protocol";

const makeContext = (sink: TerminalUpdate[]): ProcessingContext =>
  ({
    postMessage: (msg: TerminalUpdate) => {
      if (msg.type === "terminal_update") sink.push(msg);
    }
  }) as unknown as ProcessingContext;

describe("code runner terminal streaming", () => {
  it("mirrors stdout/stderr lines to terminal_update while keeping buffered outputs", async () => {
    const messages: TerminalUpdate[] = [];
    const node = new RunBashCommandNode({
      command: "echo hello && echo oops 1>&2",
      execution_mode: "subprocess"
    });
    node.__node_id = "bash-node-1";

    const result = await node.process(makeContext(messages));

    // Dataflow outputs unchanged: stdout/stderr stay separate handles
    expect(String(result.stdout)).toContain("hello");
    expect(String(result.stderr)).toContain("oops");
    expect(result.success).toBe(true);

    // Terminal mirror: \r\n line endings, stderr tinted red
    const all = messages.map((m) => m.content).join("");
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].node_id).toBe("bash-node-1");
    expect(all).toContain("hello\r\n");
    expect(all).toContain("\x1b[31m");
    expect(all).toContain("oops");
  });

  it("does not emit terminal updates without a context or node id", async () => {
    const node = new RunBashCommandNode({
      command: "echo quiet",
      execution_mode: "subprocess"
    });
    // No context passed — must not throw, outputs still produced
    const result = await node.process();
    expect(String(result.stdout)).toContain("quiet");
  });

  it("injects color/unbuffered env and strips ANSI from data outputs only", async () => {
    const messages: TerminalUpdate[] = [];
    const node = new RunBashCommandNode({
      // Emits genuinely colored output; also proves PIPED_OUTPUT_ENV reached
      // the child process.
      command:
        "printf '\\033[32mgreen\\033[0m\\n' && echo \"$FORCE_COLOR/$TERM\"",
      execution_mode: "subprocess"
    });
    node.__node_id = "bash-node-2";

    const result = await node.process(makeContext(messages));

    // Data handles: escape-free, parseable
    expect(String(result.stdout)).toBe("green\n1/xterm-256color\n");
    // Terminal mirror: raw escapes preserved for the emulator
    const all = messages.map((m) => m.content).join("");
    expect(all).toContain("\x1b[32mgreen\x1b[0m");
  });

  it("stripAnsi removes CSI/OSC/single-char escapes and keeps plain text", () => {
    expect(stripAnsi("\x1b[1;31mbold red\x1b[0m plain")).toBe("bold red plain");
    expect(stripAnsi("\x1b]0;window title\x07text")).toBe("text");
    expect(stripAnsi("\x1b]8;;https://x\x1b\\link\x1b]8;;\x1b\\")).toBe("link");
    expect(stripAnsi("no escapes 100% [ok]")).toBe("no escapes 100% [ok]");
  });

  it("startTerminalEmitter coalesces writes and flushes on close", () => {
    const messages: TerminalUpdate[] = [];
    const emitter = startTerminalEmitter(makeContext(messages), "n1");
    emitter.write("stdout", "line one\n");
    emitter.write("stderr", "bad\n");
    expect(messages).toHaveLength(0); // still pending
    emitter.close();
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("line one\r\n\x1b[31mbad\r\n\x1b[0m");
  });
});
