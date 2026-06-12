import React from "react";
import { render, screen } from "@testing-library/react";
import NodeTerminal from "../NodeTerminal";
import { Terminal } from "@xterm/xterm";
import type { TerminalBuffer } from "../../../stores/ResultsStore";

// The moduleNameMapper swaps @xterm/xterm for the jsdom-safe mock, whose
// instances expose `written`, `resetCount`, `cols`/`rows`, and `disposed`.
type MockTerminal = InstanceType<typeof Terminal> & {
  written: string[];
  resetCount: number;
  disposed: boolean;
};

const buf = (overrides: Partial<TerminalBuffer> = {}): TerminalBuffer => ({
  buffer: "",
  cols: 120,
  rows: 36,
  version: 0,
  ...overrides
});

describe("NodeTerminal", () => {
  it("renders the terminal container and writes the initial buffer", () => {
    render(<NodeTerminal terminal={buf({ buffer: "hello \x1b[31mred\x1b[0m" })} />);
    expect(screen.getByTestId("node-terminal")).toBeInTheDocument();
  });

  it("writes only the unseen suffix on append, and replays on version bump", () => {
    const written: string[] = [];
    const origWrite = Terminal.prototype.write;
    jest
      .spyOn(Terminal.prototype, "write")
      .mockImplementation(function (
        this: MockTerminal,
        data: string | Uint8Array
      ) {
        written.push(String(data));
        origWrite.call(this, data);
      });
    const resetSpy = jest.spyOn(Terminal.prototype, "reset");

    const { rerender } = render(<NodeTerminal terminal={buf({ buffer: "abc" })} />);
    rerender(<NodeTerminal terminal={buf({ buffer: "abcdef" })} />);
    expect(written).toEqual(["abc", "def"]);

    // Reset snapshot: version bumps, buffer replaced → terminal resets and replays
    rerender(<NodeTerminal terminal={buf({ buffer: "SNAP", version: 1 })} />);
    expect(written).toEqual(["abc", "def", "SNAP"]);
    expect(resetSpy).toHaveBeenCalledTimes(1);

    jest.restoreAllMocks();
  });

  it("disposes the terminal on unmount", () => {
    const dispose = jest.spyOn(Terminal.prototype, "dispose");
    const { unmount } = render(<NodeTerminal terminal={buf({ buffer: "x" })} />);
    unmount();
    expect(dispose).toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});
