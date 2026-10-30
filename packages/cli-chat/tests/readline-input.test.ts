import React, { useLayoutEffect, useState } from "react";
import { useStdin } from "ink";
import { describe, expect, it, vi } from "vitest";
import ReadlineInput from "../src/readline-input.js";
import { renderTerminal } from "./terminal-harness.js";

describe("ReadlineInput", () => {
  it("keeps input received across adjacent renders", async () => {
    function Harness(): React.ReactElement {
      const [value, setValue] = useState("");
      const { internal_eventEmitter } = useStdin();
      useLayoutEffect(() => {
        if (value === "a") {
          internal_eventEmitter.emit("input", "b");
        }
      }, [internal_eventEmitter, value]);
      return React.createElement(ReadlineInput, {
        value,
        onChange: setValue
      });
    }

    const terminal = renderTerminal(React.createElement(Harness));
    try {
      terminal.stdin.write("a");
      await vi.waitFor(() => expect(terminal.frame()).toContain("ab"), {
        timeout: 1_000
      });
    } finally {
      terminal.close();
    }
  });
});
