import React, { useEffect, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { stripVTControlCharacters } from "node:util";
import chalk from "chalk";
import wrapAnsi from "wrap-ansi";
import {
  friendlyToolName,
  formatToolParams,
  formatToolDiff,
  formatToolCode
} from "./tool-format.js";

export interface ChatMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "tool" | "system";
  readonly content: string;
  readonly toolName?: string;
  readonly toolArgs?: Record<string, unknown>;
  readonly rendered?: string;
}

/** Remove terminal commands from external text before adding our own styling. */
export function terminalText(text: string): string {
  return stripVTControlCharacters(text).replace(/\p{Cc}/gu, (character) =>
    character === "\n" || character === "\t" ? character : ""
  );
}

export function terminalLines(text: string, width: number): string[] {
  return wrapAnsi(text, Math.max(1, width), { hard: true, trim: false }).split(
    "\n"
  );
}

export function useTerminalSize(): { columns: number; rows: number } {
  const { stdout } = useStdout();
  const [size, setSize] = useState(() => ({
    columns: stdout.columns || 80,
    rows: stdout.rows || 24
  }));
  useEffect(() => {
    const resize = (): void =>
      setSize({ columns: stdout.columns || 80, rows: stdout.rows || 24 });
    stdout.on("resize", resize);
    return () => {
      stdout.off("resize", resize);
    };
  }, [stdout]);
  return size;
}

/** Restore the caller's screen even when Ink exits through a signal. */
export function enterTerminalScreen(output: NodeJS.WriteStream): () => void {
  if (!output.isTTY) {
    return () => {};
  }
  output.write("\u001b[?1049h\u001b[H\u001b[?25l\u001b[?2004h");
  let restored = false;
  return () => {
    if (restored) {
      return;
    }
    restored = true;
    output.write("\u001b[?2004l\u001b[?25h\u001b[?1049l");
  };
}

export function messageLines(
  message: ChatMessage,
  width: number,
  details: boolean
): string[] {
  const content = terminalText(message.content);
  if (message.role === "tool") {
    const name = message.toolName ?? "tool";
    const title = `${friendlyToolName(name)}  ${formatToolParams(name, message.toolArgs)}`;
    const body = details ? content : content.split("\n").slice(0, 2).join("\n");
    const lines = [
      chalk.cyan(terminalText(title)),
      ...terminalLines(body, width).map((line) => chalk.dim(line))
    ];
    if (details && message.toolArgs) {
      lines.push(
        ...terminalLines(
          terminalText(JSON.stringify(message.toolArgs, null, 2)),
          width
        ).map((line) => chalk.dim(line))
      );
    }
    if (details) {
      for (const line of formatToolCode(name, message.toolArgs) ?? []) {
        lines.push(chalk.dim(terminalText(line)));
      }
      for (const line of formatToolDiff(name, message.toolArgs) ?? []) {
        const text = terminalText(`${line.sign} ${line.text}`);
        lines.push(
          line.sign === "+"
            ? chalk.green(text)
            : line.sign === "-"
              ? chalk.red(text)
              : chalk.dim(text)
        );
      }
    }
    return ["", ...lines.flatMap((line) => terminalLines(line, width))];
  }
  if (message.role === "system") {
    return terminalLines(chalk.dim(content), width);
  }
  const heading =
    message.role === "user"
      ? chalk.cyan.bold("You")
      : chalk.green.bold("NodeTool");
  return ["", heading, ...terminalLines(message.rendered ?? content, width)];
}

interface TranscriptProps {
  readonly messages: readonly ChatMessage[];
  readonly live: string;
  readonly width: number;
  readonly height: number;
  readonly details: boolean;
  readonly resetKey: string;
  readonly startAtTop?: boolean;
}

const layoutCache = new WeakMap<
  ChatMessage,
  { width: number; details: boolean; lines: string[] }
>();

export function transcriptLines(
  messages: readonly ChatMessage[],
  width: number,
  details: boolean
): string[] {
  const lines: string[] = [];
  for (const message of messages) {
    let cached = layoutCache.get(message);
    if (!cached || cached.width !== width || cached.details !== details) {
      cached = { width, details, lines: messageLines(message, width, details) };
      layoutCache.set(message, cached);
    }
    for (const line of cached.lines) {
      lines.push(line);
    }
  }
  return lines;
}

export function Transcript({
  messages,
  live,
  width,
  height,
  details,
  resetKey,
  startAtTop = false
}: TranscriptProps): React.ReactElement {
  const [top, setTop] = useState<number | null>(startAtTop ? 0 : null);
  useEffect(() => {
    setTop(startAtTop ? 0 : null);
  }, [resetKey, startAtTop]);
  const lines = transcriptLines(messages, width, details);
  if (live) {
    lines.push(
      "",
      chalk.green("NodeTool"),
      ...terminalLines(terminalText(live), width)
    );
  }
  if (!lines.length) {
    lines.push(
      "",
      chalk.cyan.bold("What would you like to make?"),
      "",
      ...terminalLines(
        "Build a workflow, create media, explore your files, or ask a question.",
        width
      ),
      "",
      chalk.dim("/model  Choose a model"),
      chalk.dim("/sessions  Continue a conversation"),
      chalk.dim("/help  Commands and keyboard shortcuts")
    );
  }
  const contentHeight = Math.max(1, height - 1);
  const bottom = Math.max(0, lines.length - contentHeight);
  const start = top === null ? bottom : Math.min(top, bottom);
  useInput((input, key) => {
    if (key.pageUp) {
      setTop(Math.max(0, start - contentHeight));
    }
    if (key.pageDown) {
      setTop(start + contentHeight >= bottom ? null : start + contentHeight);
    }
    if (key.ctrl && key.home) {
      setTop(0);
    }
    if ((key.ctrl && key.end) || (key.ctrl && input === "g")) {
      setTop(null);
    }
  });
  return (
    <Box flexDirection="column" width={width} height={height} overflow="hidden">
      <Box height={contentHeight} flexDirection="column" flexShrink={0}>
        <Text>{lines.slice(start, start + contentHeight).join("\n")}</Text>
      </Box>
      <Text dimColor wrap="truncate">
        {start < bottom
          ? `History · ${bottom - start} lines below · Ctrl+G latest`
          : ""}
      </Text>
    </Box>
  );
}
