// web/src/components/chat/composer/__tests__/usePromptHistory.test.tsx
import React, { useRef, useState, useCallback } from "react";
import "@testing-library/jest-dom";
import { render, fireEvent, act } from "@testing-library/react";
import { usePromptHistory } from "../../hooks/usePromptHistory";

// jsdom's requestAnimationFrame fires async; run the caret-setting callback
// synchronously so tests can assert caret state right after a key press.
beforeAll(() => {
  jest
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
});

afterAll(() => {
  jest.restoreAllMocks();
});

function Harness() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const { record, handleKeyDown, resetNavigation } = usePromptHistory({
    value,
    setValue,
    textareaRef
  });

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (handleKeyDown(e)) {
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        record(value);
        setValue("");
      }
    },
    [handleKeyDown, record, value]
  );

  return (
    <textarea
      data-testid="input"
      ref={textareaRef}
      value={value}
      onChange={(e) => {
        resetNavigation();
        setValue(e.target.value);
      }}
      onKeyDown={onKeyDown}
    />
  );
}

function getInput() {
  return document.querySelector<HTMLTextAreaElement>(
    '[data-testid="input"]'
  ) as HTMLTextAreaElement;
}

function type(text: string) {
  const input = getInput();
  fireEvent.change(input, { target: { value: text } });
}

function send(text: string) {
  type(text);
  const input = getInput();
  input.setSelectionRange(text.length, text.length);
  fireEvent.keyDown(input, { key: "Enter" });
}

function setCaret(pos: number) {
  getInput().setSelectionRange(pos, pos);
}

function arrowUp() {
  fireEvent.keyDown(getInput(), { key: "ArrowUp" });
}

function arrowDown() {
  fireEvent.keyDown(getInput(), { key: "ArrowDown" });
}

describe("usePromptHistory", () => {
  it("recalls the last sent prompt on ArrowUp from an empty field", () => {
    render(<Harness />);
    send("hello world");
    expect(getInput().value).toBe("");

    setCaret(0);
    arrowUp();
    expect(getInput().value).toBe("hello world");
  });

  it("steps back through multiple entries, newest first", () => {
    render(<Harness />);
    send("first");
    send("second");
    send("third");

    setCaret(0);
    arrowUp();
    expect(getInput().value).toBe("third");
    arrowUp();
    expect(getInput().value).toBe("second");
    arrowUp();
    expect(getInput().value).toBe("first");
    // At the oldest entry ArrowUp is swallowed and stays put.
    arrowUp();
    expect(getInput().value).toBe("first");
  });

  it("steps forward with ArrowDown and restores the live draft past the newest", () => {
    render(<Harness />);
    send("alpha");
    send("beta");

    // Start a fresh draft, then navigate into history and back out.
    type("draft in progress");
    setCaret(0);
    arrowUp();
    expect(getInput().value).toBe("beta");
    arrowUp();
    expect(getInput().value).toBe("alpha");

    arrowDown();
    expect(getInput().value).toBe("beta");
    arrowDown();
    // Past the newest entry: the stashed draft comes back.
    expect(getInput().value).toBe("draft in progress");
  });

  it("ignores ArrowUp when the caret is not at the start of the field", () => {
    render(<Harness />);
    send("remembered");
    type("editing");
    setCaret(3);
    arrowUp();
    // Caret was mid-text, so navigation must not hijack the key.
    expect(getInput().value).toBe("editing");
  });

  it("does nothing when there is no history", () => {
    render(<Harness />);
    type("");
    setCaret(0);
    arrowUp();
    expect(getInput().value).toBe("");
  });

  it("skips consecutive duplicate sends", () => {
    render(<Harness />);
    send("same");
    send("same");
    send("different");

    setCaret(0);
    arrowUp();
    expect(getInput().value).toBe("different");
    arrowUp();
    expect(getInput().value).toBe("same");
    // Only one "same" entry remains, so the next step is the oldest.
    arrowUp();
    expect(getInput().value).toBe("same");
  });

  it("resets navigation after a manual edit", () => {
    render(<Harness />);
    send("one");
    send("two");

    setCaret(0);
    arrowUp();
    expect(getInput().value).toBe("two");
    // Edit the recalled text — navigation resets.
    act(() => {
      type("two edited");
    });
    // ArrowUp from the start begins a fresh walk at the newest entry again.
    setCaret(0);
    arrowUp();
    expect(getInput().value).toBe("two");
  });
});
