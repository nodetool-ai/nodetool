import { describe, expect, it } from "vitest";
import stringWidth from "string-width";
import {
  enterTerminalScreen,
  terminalText,
  terminalLines,
  transcriptLines,
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
      "\u001b[?1049h\u001b[H\u001b[?25l\u001b[?2004h",
      "\u001b[?2004l\u001b[?25h\u001b[?1049l"
    ]);
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
