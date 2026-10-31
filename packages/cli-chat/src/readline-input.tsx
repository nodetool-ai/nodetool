import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { Text, useInput, type Key } from "ink";
import chalk from "chalk";
import { terminalLines, terminalText } from "./terminal-screen.js";

interface ReadlineInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  focus?: boolean;
  placeholder?: string;
  showCursor?: boolean;
  width?: number;
  maxRows?: number;
  onHistory?: (direction: "up" | "down") => void;
  onComplete?: (direction: "up" | "down" | "accept" | "submit") => void;
}

export interface EditorState {
  readonly value: string;
  readonly cursor: number;
}

interface InputHandlerState {
  readonly current: EditorState;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit?: (value: string) => void;
  readonly onHistory?: (direction: "up" | "down") => void;
  readonly onComplete?: (
    direction: "up" | "down" | "accept" | "submit"
  ) => void;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function previousBoundary(value: string, cursor: number): number {
  let previous = 0;
  for (const segment of graphemes.segment(value)) {
    if (segment.index >= cursor) {
      break;
    }
    previous = segment.index;
  }
  return previous;
}

function nextBoundary(value: string, cursor: number): number {
  for (const segment of graphemes.segment(value)) {
    if (segment.index > cursor) {
      return segment.index;
    }
  }
  return value.length;
}

/** Pure editing boundary shared by keyboard handling and terminal tests. */
export function editInput(
  state: EditorState,
  input: string,
  key: Partial<Key>
): EditorState {
  const { value, cursor } = state;
  const start = value.lastIndexOf("\n", cursor - 1) + 1;
  const newline = value.indexOf("\n", cursor);
  const end = newline < 0 ? value.length : newline;
  const replace = (from: number, to: number, text = ""): EditorState => ({
    value: value.slice(0, from) + text + value.slice(to),
    cursor: from + text.length
  });
  const left = (): number =>
    key.meta || (key.ctrl && input === "w")
      ? (value.slice(0, cursor).match(/\S+\s*$/)?.index ?? 0)
      : previousBoundary(value, cursor);
  const right = (): number =>
    key.meta
      ? cursor +
        (value.slice(cursor).match(/^\s*\S+\s*/)?.[0].length ??
          value.length - cursor)
      : nextBoundary(value, cursor);
  if ((key.ctrl && input === "a") || key.home) {
    return { value, cursor: start };
  }
  if ((key.ctrl && input === "e") || key.end) {
    return { value, cursor: end };
  }
  if (key.leftArrow || ((key.ctrl || key.meta) && input === "b")) {
    return { value, cursor: left() };
  }
  if (key.rightArrow || ((key.ctrl || key.meta) && input === "f")) {
    return { value, cursor: right() };
  }
  if (key.upArrow) {
    const previousEnd = start - 1;
    const previousStart = value.lastIndexOf("\n", previousEnd - 1) + 1;
    return {
      value,
      cursor: start
        ? Math.min(previousStart + cursor - start, previousEnd)
        : cursor
    };
  }
  if (key.downArrow) {
    const nextStart = end + 1;
    const nextEnd = value.indexOf("\n", nextStart);
    return {
      value,
      cursor:
        end < value.length
          ? Math.min(
              nextStart + cursor - start,
              nextEnd < 0 ? value.length : nextEnd
            )
          : cursor
    };
  }
  // Ink 6 reports the DEL byte emitted by Backspace in most terminals as
  // `delete`. Keep Ctrl+D as the unambiguous forward-delete shortcut.
  if (
    key.backspace ||
    key.delete ||
    (key.ctrl && (input === "h" || input === "w"))
  ) {
    return replace(left(), cursor);
  }
  if ((key.ctrl || key.meta) && input === "d") {
    return replace(cursor, right());
  }
  if (key.ctrl && input === "u") {
    return replace(start, cursor);
  }
  if (key.ctrl && input === "k") {
    return replace(
      cursor,
      end === cursor ? Math.min(value.length, end + 1) : end
    );
  }
  if ((key.return && (key.meta || key.shift)) || (key.ctrl && input === "j")) {
    return replace(cursor, cursor, "\n");
  }
  if (
    !key.ctrl &&
    !key.meta &&
    !key.escape &&
    !key.tab &&
    !key.return &&
    input
  ) {
    // A paste is one insertion, never a sequence of submissions.
    return replace(cursor, cursor, terminalText(input.replace(/\r\n?/g, "\n")));
  }
  return state;
}

export default function ReadlineInput({
  value,
  onChange,
  onSubmit,
  focus = true,
  placeholder = "Ask NodeTool…",
  showCursor = true,
  width = 76,
  maxRows = 5,
  onHistory,
  onComplete
}: ReadlineInputProps): React.ReactElement {
  const [editor, setEditor] = useState<EditorState>({
    value,
    cursor: value.length
  });
  const paste = useRef<string | null>(null);
  const current =
    value === editor.value ? editor : { value, cursor: value.length };
  const handlerState = useRef<InputHandlerState>({
    current,
    value,
    onChange,
    onSubmit,
    onHistory,
    onComplete
  });
  // Ink subscribes to useInput handlers in a passive effect. Keep the latest
  // render's callbacks ready before it publishes the committed terminal frame.
  useLayoutEffect(() => {
    handlerState.current = {
      current,
      value,
      onChange,
      onSubmit,
      onHistory,
      onComplete
    };
  });
  useEffect(() => {
    if (value !== editor.value) {
      setEditor({ value, cursor: value.length });
    }
  }, [value, editor.value]);
  const handleInput = useCallback((input: string, key: Key): void => {
    const latest = handlerState.current;
    if (input === "[200~") {
      paste.current = "";
      return;
    }
    if (input === "[201~" && paste.current !== null) {
      const next = editInput(latest.current, paste.current, {});
      paste.current = null;
      setEditor(next);
      latest.onChange(next.value);
      return;
    }
    if (paste.current !== null) {
      paste.current += key.return
        ? "\n"
        : key.ctrl && input === "j"
          ? "\n"
          : key.ctrl || key.meta
            ? ""
            : input;
      return;
    }
    if (
      key.pageUp ||
      key.pageDown ||
      key.escape ||
      (key.ctrl && (key.home || key.end))
    ) {
      return;
    }
    if (
      latest.onComplete &&
      (key.upArrow ||
        key.downArrow ||
        key.tab ||
        (key.return && !key.meta && !key.shift))
    ) {
      latest.onComplete(
        key.upArrow
          ? "up"
          : key.downArrow
            ? "down"
            : key.return
              ? "submit"
              : "accept"
      );
      return;
    }
    if ((key.upArrow || key.downArrow) && !latest.value.includes("\n")) {
      latest.onHistory?.(key.upArrow ? "up" : "down");
      return;
    }
    if (key.return && !key.meta && !key.shift) {
      latest.onSubmit?.(latest.value);
      return;
    }
    const next = editInput(latest.current, input, key);
    setEditor(next);
    if (next.value !== latest.value) {
      latest.onChange(next.value);
    }
  }, []);
  useInput(handleInput, { isActive: focus });
  const cursorEnd = nextBoundary(value, current.cursor);
  const cursorText = value.slice(current.cursor, cursorEnd);
  const display = value
    ? value.slice(0, current.cursor) +
      (focus && showCursor
        ? chalk.inverse(cursorText === "\n" || !cursorText ? " " : cursorText)
        : cursorText) +
      (cursorText === "\n" ? "\n" : "") +
      value.slice(cursorEnd)
    : chalk.dim(placeholder);
  const lines = terminalLines(display, width);
  const cursorLine =
    terminalLines(value.slice(0, current.cursor) + " ", width).length - 1;
  const start = Math.max(0, cursorLine - maxRows + 1);
  return <Text>{lines.slice(start, start + maxRows).join("\n")}</Text>;
}
