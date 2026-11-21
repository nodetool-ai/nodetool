/**
 * A headless bridge refuses an argument key its contract does not declare, so
 * a misspelled key is an error the model can read instead of a success that
 * changed nothing.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { closedParams, parseBridgeArgs } from "../src/capabilities/bridge-args.js";
import { createScriptToolBridge } from "../src/evals/surfaces/script.js";
import { createJsScriptToolBridge } from "../src/evals/surfaces/js-script.js";

describe("bridge argument parsing", () => {
  it("refuses an unknown key and names the keys the tool accepts", async () => {
    const bridge = createScriptToolBridge();
    const addLine = bridge.tools.find((t) => t.name === "ui_script_add_line")!;
    await expect(addLine.execute({ text: "Hello", speaker: "Ana" })).rejects.toThrow(
      /speaker[\s\S]*accepts: text, speakerId, direction, index/
    );
    expect(bridge.finalState().lines).toHaveLength(0);
  });

  it("lets the reserved protocol fields through", () => {
    const closed = closedParams(z.object({ text: z.string() }));
    expect(parseBridgeArgs(closed, { text: "a", _message: "Adding a line", _tool_call_id: "c1" })).toEqual({ text: "a" });
  });

  it("keeps a schema's own unknown-key policy", () => {
    const loose = z.object({ text: z.string() }).catchall(z.unknown());
    expect(parseBridgeArgs(closedParams(loose), { text: "a", extra: 1 })).toEqual({ text: "a", extra: 1 });
  });

  it("refuses an unknown key inside a js-script test case", async () => {
    const bridge = createJsScriptToolBridge();
    const setTests = bridge.tools.find((t) => t.name === "ui_jsscript_set_tests")!;
    await expect(
      setTests.execute({ tests: [{ name: "adds", inputs: { a: 1 }, expected: { sum: 1 } }] })
    ).rejects.toThrow(/expected/);
  });

  it("accepts the document id the browser's copy of the tool takes, and still refuses other keys", async () => {
    const bridge = createScriptToolBridge();
    const addLine = bridge.tools.find((t) => t.name === "ui_script_add_line")!;
    await expect(addLine.execute({ script_id: "script-eval", text: "Hello" })).resolves.toMatchObject({ ok: true });
    await expect(addLine.execute({ scriptId: "script-eval", text: "Hello" })).rejects.toThrow(/scriptId/);
  });
});
