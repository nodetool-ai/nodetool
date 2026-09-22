import React, { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import ReadlineInput from "../src/readline-input.js";
import { Transcript, type ChatMessage } from "../src/terminal-screen.js";
import { renderTerminal } from "./terminal-harness.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
it("buffers a bracketed paste across input chunks without submitting any pasted line", async () => {
  const changed = vi.fn();
  const submitted = vi.fn();
  function Editor(): React.ReactElement {
    const [value, setValue] = useState("");
    return React.createElement(ReadlineInput, {
      value,
      onChange: (next) => {
        changed(next);
        setValue(next);
      },
      onSubmit: submitted
    });
  }
  const terminal = renderTerminal(React.createElement(Editor));
  cleanups.push(terminal.close);
  await vi.waitFor(() => expect(terminal.frame()).toContain("Ask NodeTool"));
  terminal.stdin.write("\u001b[200~first");
  terminal.stdin.write("\r");
  terminal.stdin.write("second\u001b[201~");
  await vi.waitFor(() =>
    expect(changed).toHaveBeenLastCalledWith("first\nsecond")
  );
  expect(submitted).not.toHaveBeenCalled();
  terminal.stdin.write("\n");
  await vi.waitFor(() =>
    expect(changed).toHaveBeenLastCalledWith("first\nsecond\n")
  );
  terminal.stdin.write("\r");
  await vi.waitFor(() =>
    expect(submitted).toHaveBeenCalledWith("first\nsecond\n")
  );
});
it("keeps scrolled history stationary while output arrives and follows on Ctrl+G", async () => {
  const messages: ChatMessage[] = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    role: "system",
    content: `Message ${i}`
  }));
  const props = {
    messages,
    live: "",
    width: 40,
    height: 8,
    details: false,
    resetKey: "session"
  };
  const terminal = renderTerminal(React.createElement(Transcript, props));
  cleanups.push(terminal.close);
  await vi.waitFor(() => expect(terminal.frame()).toContain("Message 29"));
  terminal.stdin.write("\u001b[5~");
  await vi.waitFor(() => expect(terminal.frame()).toContain("Message 16"));
  terminal.instance.rerender(
    React.createElement(Transcript, {
      ...props,
      messages: [
        ...messages,
        { id: "new", role: "system", content: "New output" }
      ]
    })
  );
  await vi.waitFor(() => expect(terminal.frame()).toContain("8 lines below"));
  expect(terminal.frame()).toContain("Message 16");
  expect(terminal.frame()).not.toContain("New output");
  terminal.stdin.write("\u0007");
  await vi.waitFor(() => expect(terminal.frame()).toContain("New output"));
});
