/**
 * @jest-environment node
 */
import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import {
  listOpenJsScriptIds,
  setJsScriptAgentHandler,
  type JsScriptAgentHandler,
  type JsScriptSnapshot
} from "../../../components/jsScript/jsScriptAgentBridge";
import { emptyJsScriptDocument } from "../../../stores/jsScript/JsScriptStore";
import "../builtin/jsscript";

const SCRIPT_ID = "js-1";

const snapshot = (
  overrides: Partial<JsScriptSnapshot> = {}
): JsScriptSnapshot => ({
  scriptId: SCRIPT_ID,
  name: "Reshape",
  document: {
    ...emptyJsScriptDocument(),
    description: "Reshapes an API response",
    code: "emit('out', inputs.a)",
    inputs: [{ name: "a", type: "str" }],
    outputs: [{ name: "out", type: "str" }]
  },
  issues: [],
  lastRun: null,
  lastTest: null,
  ...overrides
});

const createMockHandler = (): jest.Mocked<JsScriptAgentHandler> => ({
  getSnapshot: jest.fn(),
  setCode: jest.fn(),
  setPorts: jest.fn(),
  setPackages: jest.fn(),
  setMeta: jest.fn(),
  setTests: jest.fn(),
  run: jest.fn(),
  test: jest.fn()
});

// The JS script tools never touch the workflow state, so a bare stub satisfies ctx.
const ctx = { getState: () => ({}) as FrontendToolState };

afterEach(() => {
  for (const id of listOpenJsScriptIds()) {
    setJsScriptAgentHandler(id, null);
  }
});

describe("ui_jsscript_* tools", () => {
  it("registers every JS script tool in the manifest", () => {
    const names = FrontendToolRegistry.getManifest().map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "ui_jsscript_get_state",
        "ui_jsscript_set_code",
        "ui_jsscript_set_ports",
        "ui_jsscript_set_packages",
        "ui_jsscript_set_meta",
        "ui_jsscript_set_tests",
        "ui_jsscript_run",
        "ui_jsscript_test"
      ])
    );
  });

  it("tells set_code not to wrap the body in a module function", () => {
    const setCode = FrontendToolRegistry.getManifest().find(
      (tool) => tool.name === "ui_jsscript_set_code"
    );
    expect(setCode?.description).toContain("top-level statements");
    expect(setCode?.description).toContain("function run");
    expect(setCode?.description).toContain("`export`");
  });

  it("requires the script id on every tool", () => {
    const jsScriptTools = FrontendToolRegistry.getManifest().filter((tool) =>
      tool.name.startsWith("ui_jsscript_")
    );
    expect(jsScriptTools).toHaveLength(8);
    for (const tool of jsScriptTools) {
      const schema = tool.parameters as { required?: string[] };
      expect(schema.required).toContain("script_id");
    }
  });

  it("rejects with a descriptive error when the script is not open", async () => {
    await expect(
      FrontendToolRegistry.call(
        "ui_jsscript_get_state",
        { script_id: "missing" },
        "tc-1",
        ctx
      )
    ).rejects.toThrow(
      'No JS script "missing" is open. No JS scripts are currently open.'
    );
  });

  it("returns the snapshot through the handler", async () => {
    const handler = createMockHandler();
    handler.getSnapshot.mockReturnValue(snapshot());
    setJsScriptAgentHandler(SCRIPT_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_jsscript_get_state",
      { script_id: SCRIPT_ID },
      "tc-2",
      ctx
    )) as { ok: boolean } & JsScriptSnapshot;

    expect(handler.getSnapshot).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.document.code).toBe("emit('out', inputs.a)");
  });

  it("replaces the body and reports the validation issues", async () => {
    const handler = createMockHandler();
    handler.setCode.mockReturnValue(
      snapshot({
        issues: [
          { severity: "warning", code: "js_script_no_tests", message: "no tests" }
        ]
      })
    );
    setJsScriptAgentHandler(SCRIPT_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_jsscript_set_code",
      { script_id: SCRIPT_ID, code: "emit('out', 1)" },
      "tc-3",
      ctx
    )) as { ok: boolean; chars: number; issues: { code: string }[] };

    expect(handler.setCode).toHaveBeenCalledWith("emit('out', 1)");
    expect(result.chars).toBe("emit('out', 1)".length);
    expect(result.issues[0].code).toBe("js_script_no_tests");
  });

  it("replaces only the port side it was given", async () => {
    const handler = createMockHandler();
    handler.setPorts.mockReturnValue(snapshot());
    setJsScriptAgentHandler(SCRIPT_ID, handler);

    await FrontendToolRegistry.call(
      "ui_jsscript_set_ports",
      { script_id: SCRIPT_ID, inputs: [{ name: "a", type: "str" }] },
      "tc-4",
      ctx
    );

    expect(handler.setPorts).toHaveBeenCalledWith({
      inputs: [{ name: "a", type: "str" }],
      outputs: undefined
    });
  });

  it("writes metadata through the handler", async () => {
    const handler = createMockHandler();
    handler.setMeta.mockReturnValue(snapshot());
    setJsScriptAgentHandler(SCRIPT_ID, handler);

    await FrontendToolRegistry.call(
      "ui_jsscript_set_meta",
      { script_id: SCRIPT_ID, description: "does a thing", timeoutSeconds: 10 },
      "tc-5",
      ctx
    );

    expect(handler.setMeta).toHaveBeenCalledWith({
      name: undefined,
      description: "does a thing",
      secrets: undefined,
      timeoutSeconds: 10
    });
  });

  it("runs the script with the given inputs", async () => {
    const handler = createMockHandler();
    handler.run.mockResolvedValue({
      ok: true,
      outputs: { out: "x" },
      logs: ["hi"],
      duration_ms: 12
    });
    setJsScriptAgentHandler(SCRIPT_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_jsscript_run",
      { script_id: SCRIPT_ID, inputs: { a: "x" } },
      "tc-6",
      ctx
    )) as { ok: boolean; run: { outputs?: Record<string, unknown> } };

    expect(handler.run).toHaveBeenCalledWith({ a: "x" }, undefined);
    expect(result.ok).toBe(true);
    expect(result.run.outputs).toEqual({ out: "x" });
  });

  it("mirrors a failed run on the tool result", async () => {
    const handler = createMockHandler();
    handler.run.mockResolvedValue({
      ok: false,
      logs: [],
      duration_ms: 4,
      error: "The script declares output ports (out) but the run produced none of them."
    });
    setJsScriptAgentHandler(SCRIPT_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_jsscript_run",
      { script_id: SCRIPT_ID },
      "tc-6c",
      ctx
    )) as { ok: boolean; run: { ok: boolean; error?: string } };

    expect(result.ok).toBe(false);
    expect(result.run.ok).toBe(false);
    expect(result.run.error).toMatch(/produced none/);
  });

  it("stages input_streams for a body that reads them with stream()", async () => {
    const handler = createMockHandler();
    handler.run.mockResolvedValue({ ok: true, logs: [], duration_ms: 1 });
    setJsScriptAgentHandler(SCRIPT_ID, handler);

    await FrontendToolRegistry.call(
      "ui_jsscript_run",
      { script_id: SCRIPT_ID, input_streams: { numbers: [1, 2, 3] } },
      "tc-6b",
      ctx
    );

    expect(handler.run).toHaveBeenCalledWith({}, { numbers: [1, 2, 3] });
  });

  it("runs with an empty bag when no inputs are given", async () => {
    const handler = createMockHandler();
    handler.run.mockResolvedValue({ ok: true, logs: [], duration_ms: 1 });
    setJsScriptAgentHandler(SCRIPT_ID, handler);

    await FrontendToolRegistry.call(
      "ui_jsscript_run",
      { script_id: SCRIPT_ID },
      "tc-7",
      ctx
    );

    expect(handler.run).toHaveBeenCalledWith({}, undefined);
  });

  it("tells run that it flushes first and fails on empty declared outputs", () => {
    const run = FrontendToolRegistry.getManifest().find(
      (tool) => tool.name === "ui_jsscript_run"
    );
    expect(run?.description).toMatch(/flush/i);
    expect(run?.description).toMatch(/declared outputs/i);
  });

  it("tells test that it flushes first and fails when there are no cases", () => {
    const test = FrontendToolRegistry.getManifest().find(
      (tool) => tool.name === "ui_jsscript_test"
    );
    expect(test?.description).toMatch(/flush/i);
    expect(test?.description).toMatch(/no saved cases|no saved test cases/i);
  });

  it("returns the graded report from the test tool", async () => {
    const handler = createMockHandler();
    handler.test.mockResolvedValue({
      passed: 1,
      failed: 1,
      cases: [
        { name: "a", ok: true, logs: [], mismatches: [] },
        { name: "b", ok: false, logs: [], mismatches: [] }
      ]
    });
    setJsScriptAgentHandler(SCRIPT_ID, handler);

    const result = (await FrontendToolRegistry.call(
      "ui_jsscript_test",
      { script_id: SCRIPT_ID },
      "tc-8",
      ctx
    )) as { ok: boolean; passed: number; failed: number };

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
  });
});
