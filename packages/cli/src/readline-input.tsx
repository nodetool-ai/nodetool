/**
 * Readline-style text input for Ink.
 *
 * Supports standard readline keybindings:
 *   Ctrl+A / Home      — move to beginning of line
 *   Ctrl+E / End       — move to end of line
 *   Ctrl+B / ←         — move back one character
 *   Ctrl+F / →         — move forward one character
 *   Alt+B              — move back one word
 *   Alt+F              — move forward one word
 *   Ctrl+W / Alt+Bksp  — delete word backward
 *   Alt+D              — delete word forward
 *   Ctrl+U             — delete from cursor to start of line
 *   Ctrl+K             — delete from cursor to end of line
 *   Ctrl+D             — delete character under cursor
 *   Ctrl+H / Backspace — delete character before cursor
 *   Ctrl+T             — transpose characters
 */

import React, { useState, useEffect, useCallback } from "react";
import { Text, useInput } from "ink";
import chalk from "chalk";

interface ReadlineInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  focus?: boolean;
  placeholder?: string;
  showCursor?: boolean;
}

function findWordBoundaryLeft(value: string, offset: number): number {
  let i = offset - 1;
  // skip whitespace
  while (i > 0 && value[i - 1] === " ") i--;
  // skip word chars
  while (i > 0 && value[i - 1] !== " ") i--;
  return i;
}

function findWordBoundaryRight(value: string, offset: number): number {
  let i = offset;
  // skip word chars
  while (i < value.length && value[i] !== " ") i++;
  // skip whitespace
  while (i < value.length && value[i] === " ") i++;
  return i;
}

export default function ReadlineInput({
  value,
  onChange,
  onSubmit,
  focus = true,
  placeholder = "",
  showCursor = true,
}: ReadlineInputProps) {
  const [cursorOffset, setCursorOffset] = useState(value.length);

  // When value changes externally, move cursor to end
  useEffect(() => {
    setCursorOffset(value.length);
  }, [value]);

  const update = useCallback(
    (nextValue: string, nextCursor: number) => {
      const clamped = Math.max(0, Math.min(nextCursor, nextValue.length));
      setCursorOffset(clamped);
      if (nextValue !== value) {
        onChange(nextValue);
      }
    },
    [value, onChange]
  );

  useInput(
    (input, key) => {
      // Pass through to parent: up/down arrows, Ctrl+C, tab
      if (
        key.upArrow ||
        key.downArrow ||
        (key.ctrl && input === "c") ||
        key.tab ||
        (key.shift && key.tab)
      ) {
        return;
      }

      // Submit
      if (key.return) {
        onSubmit?.(value);
        return;
      }

      // --- Movement ---

      // Ctrl+A or Home: beginning of line
      if (key.ctrl && input === "a") {
        setCursorOffset(0);
        return;
      }

      // Ctrl+E or End: end of line
      if (key.ctrl && input === "e") {
        setCursorOffset(value.length);
        return;
      }

      // Ctrl+B or Left: back one char
      if (key.ctrl && input === "b") {
        setCursorOffset((c) => Math.max(0, c - 1));
        return;
      }
      if (key.leftArrow) {
        // Alt+Left / Alt+B: back one word
        if (key.meta) {
          setCursorOffset(findWordBoundaryLeft(value, cursorOffset));
        } else {
          setCursorOffset((c) => Math.max(0, c - 1));
        }
        return;
      }

      // Ctrl+F or Right: forward one char
      if (key.ctrl && input === "f") {
        setCursorOffset((c) => Math.min(value.length, c + 1));
        return;
      }
      if (key.rightArrow) {
        // Alt+Right / Alt+F: forward one word
        if (key.meta) {
          setCursorOffset(findWordBoundaryRight(value, cursorOffset));
        } else {
          setCursorOffset((c) => Math.min(value.length, c + 1));
        }
        return;
      }

      // Alt+B: back one word (without arrow)
      if (key.meta && input === "b") {
        setCursorOffset(findWordBoundaryLeft(value, cursorOffset));
        return;
      }

      // Alt+F: forward one word (without arrow)
      if (key.meta && input === "f") {
        setCursorOffset(findWordBoundaryRight(value, cursorOffset));
        return;
      }

      // --- Deletion ---

      // Ctrl+W: delete word backward
      if (key.ctrl && input === "w") {
        const boundary = findWordBoundaryLeft(value, cursorOffset);
        update(value.slice(0, boundary) + value.slice(cursorOffset), boundary);
        return;
      }

      // Alt+Backspace: delete word backward
      if (key.meta && key.backspace) {
        const boundary = findWordBoundaryLeft(value, cursorOffset);
        update(value.slice(0, boundary) + value.slice(cursorOffset), boundary);
        return;
      }

      // Alt+D: delete word forward
      if (key.meta && input === "d") {
        const boundary = findWordBoundaryRight(value, cursorOffset);
        update(value.slice(0, cursorOffset) + value.slice(boundary), cursorOffset);
        return;
      }

      // Ctrl+U: delete to beginning of line
      if (key.ctrl && input === "u") {
        update(value.slice(cursorOffset), 0);
        return;
      }

      // Ctrl+K: delete to end of line
      if (key.ctrl && input === "k") {
        update(value.slice(0, cursorOffset), cursorOffset);
        return;
      }

      // Ctrl+D: delete char at cursor (or noop if empty)
      if (key.ctrl && input === "d") {
        if (value.length > 0 && cursorOffset < value.length) {
          update(
            value.slice(0, cursorOffset) + value.slice(cursorOffset + 1),
            cursorOffset
          );
        }
        return;
      }

      // Ctrl+H or Backspace: delete char before cursor
      if (key.backspace || key.delete || (key.ctrl && input === "h")) {
        if (cursorOffset > 0) {
          update(
            value.slice(0, cursorOffset - 1) + value.slice(cursorOffset),
            cursorOffset - 1
          );
        }
        return;
      }

      // Ctrl+T: transpose characters
      if (key.ctrl && input === "t") {
        if (cursorOffset > 0 && value.length > 1) {
          const pos = cursorOffset === value.length ? cursorOffset - 1 : cursorOffset;
          if (pos > 0) {
            const swapped =
              value.slice(0, pos - 1) +
              value[pos] +
              value[pos - 1] +
              value.slice(pos + 1);
            update(swapped, Math.min(pos + 1, swapped.length));
          }
        }
        return;
      }

      // --- Regular character input ---
      if (!key.ctrl && !key.meta && input) {
        update(
          value.slice(0, cursorOffset) + input + value.slice(cursorOffset),
          cursorOffset + input.length
        );
      }
    },
    { isActive: focus }
  );

  // --- Render ---
  if (!value && placeholder && showCursor && focus) {
    return (
      <Text>
        {chalk.inverse(placeholder[0] ?? " ")}
        {placeholder.length > 1 ? chalk.grey(placeholder.slice(1)) : ""}
      </Text>
    );
  }

  if (!value && placeholder) {
    return <Text color="gray">{placeholder}</Text>;
  }

  if (!showCursor || !focus) {
    return <Text>{value}</Text>;
  }

  // Render with fake cursor
  const before = value.slice(0, cursorOffset);
  const cursorChar = cursorOffset < value.length ? value[cursorOffset] : " ";
  const after = value.slice(cursorOffset + 1);

  return (
    <Text>
      {before}
      {chalk.inverse(cursorChar)}
      {after}
    </Text>
  );
}
