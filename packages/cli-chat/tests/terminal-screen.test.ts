import { describe, expect, it, vi } from "vitest";

vi.mock("../src/terminal-clipboard.js", () => ({
  copyTerminalText: vi.fn(async () => {})
}));

import { copyTerminalText } from "../src/terminal-clipboard.js";
import { EventEmitter } from "node:events";
import React from "react";
import stringWidth from "string-width";
import { renderTerminal } from "./terminal-harness.js";
import {
  Transcript,
  enterTerminalScreen,
  terminalText,
  terminalLines,
  transcriptLines,
  selectedTranscriptText,
  type ChatMessage
} from "../src/terminal-screen.js";

describe("terminal viewport", () => {
  it("restores the previous screen once after fullscreen exit", () => {
    const writes: string[] = [];
    const restore = enterTerminalScreen({
      isTTY: true,
      write: (text: string) => writes.push(text)
    } as unknown as NodeJS.WriteStream);
    restore();
    restore();
    expect(writes).toEqual([
      "\u001b[?1049h\u001b[H\u001b[?25l\u001b[?2004h\u001b[?1000h\u001b[?1002h\u001b[?1006h",
      "\u001b[?1006l\u001b[?1002l\u001b[?1000l\u001b[?2004l\u001b[?25h\u001b[?1049l"
    ]);
  });
  it("copies only selected visible columns across wrapped lines", () => {
    expect(selectedTranscriptText(
      ["\u001b[32mhello\u001b[39m", "世界 done"],
      { line: 0, column: 2 },
      { line: 1, column: 4 }
    )).toBe("llo\n世界");
  });
  it("clears selection on release and briefly confirms clipboard copy", async () => {
    const mouseEvents = new EventEmitter();
    const terminal = renderTerminal(React.createElement(Transcript, {
      messages: [{ id: "1", role: "assistant", content: "hello world" }],
      live: "", width: 40, height: 8, details: false,
      resetKey: "session", mouseEvents, screenY: 4
    }), 40, 8);
    try {
      await new Promise((resolve) => setTimeout(resolve, 20));
      mouseEvents.emit("mouse", { action: "down", x: 2, y: 6 });
      mouseEvents.emit("mouse", { action: "move", x: 7, y: 6 });
      await new Promise((resolve) => setTimeout(resolve, 20));
      mouseEvents.emit("mouse", { action: "up", x: 7, y: 6 });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(copyTerminalText).toHaveBeenCalledWith("hello", process.stdout);
      expect(terminal.frame()).toContain("Copied to clipboard");
      expect(terminal.frame()).toContain("hello world");
      await new Promise((resolve) => setTimeout(resolve, 1900));
      expect(terminal.frame()).not.toContain("Copied to clipboard");
    } finally {
      terminal.close();
    }
  });
  it("scrolls the visible conversation with the mouse wheel", async () => {
    const mouseEvents = new EventEmitter();
    const messages: ChatMessage[] = Array.from({ length: 20 }, (_, index) => ({
      id: String(index), role: "assistant", content: `Response ${index}`
    }));
    const terminal = renderTerminal(React.createElement(Transcript, {
      messages, live: "", width: 40, height: 8, details: false,
      resetKey: "session", mouseEvents, screenY: 4
    }), 40, 8);
    try {
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(terminal.frame()).toContain("Response 19");
      mouseEvents.emit("mouse", { action: "wheel", x: 3, y: 5, direction: -1 });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(terminal.frame()).toContain("Response 17");
      expect(terminal.frame()).not.toContain("Response 19");
    } finally {
      terminal.close();
    }
  });
  it("wraps CJK, emoji, code and colored output within the viewport", () => {
    const lines = terminalLines(
      "\u001b[32m你好 world 👩‍💻\u001b[39m\n" + "x".repeat(500),
      12
    );
    expect(lines.length).toBeGreaterThan(40);
    expect(lines.every((line) => stringWidth(line) <= 12)).toBe(true);
  });
  it("strips control sequences from provider content", () => {
    expect(terminalText("safe\u001b[2J\u001b]52;c;secret\u0007text")).toBe(
      "safetext"
    );
  });
  it("lays out a long history and reflows it after resize", () => {
    const messages: ChatMessage[] = Array.from({ length: 10000 }, (_, i) => ({
      id: String(i),
      role: "assistant",
      content: `Response ${i} ${"word ".repeat(10)}`
    }));
    const wide = transcriptLines(messages, 80, false);
    const narrow = transcriptLines(messages, 30, false);
    expect(wide.length).toBe(30000);
    expect(narrow.length).toBeGreaterThan(wide.length);
    expect(narrow.at(-1)).toBeDefined();
  });
});
