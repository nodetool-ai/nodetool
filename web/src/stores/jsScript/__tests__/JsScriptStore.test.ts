import {
  emptyJsScriptDocument,
  useJsScriptStore,
  JS_SCRIPT_MAX_TIMEOUT_SECONDS
} from "../JsScriptStore";

const ID = "js-1";

const reset = (): void => {
  useJsScriptStore.setState({
    scripts: {},
    serverRevisions: {},
    saveStatus: {},
    lastRun: {},
    lastTest: {},
    running: {},
    history: {}
  });
};

beforeEach(reset);

const store = () => useJsScriptStore.getState();
const doc = () => store().getScript(ID)?.document;

describe("JsScriptStore", () => {
  it("ensureScript creates an empty document once", () => {
    store().ensureScript(ID);
    const first = store().getScript(ID);
    store().ensureScript(ID);
    expect(store().getScript(ID)).toBe(first);
    expect(first?.document).toEqual(emptyJsScriptDocument());
  });

  it("ignores setters for a script that is not open", () => {
    store().setCode(ID, "emit('a', 1)");
    expect(store().getScript(ID)).toBeUndefined();
  });

  it("writes code, ports, secrets, tests and meta", () => {
    store().ensureScript(ID);
    store().setName(ID, "Reshape");
    store().setDescription(ID, "Reshapes an API response");
    store().setCode(ID, "emit('out', inputs.a)");
    store().setPorts(ID, { inputs: [{ name: "a", type: "str" }] });
    store().setPorts(ID, { outputs: [{ name: "out", type: "str" }] });
    store().setSecrets(ID, ["OPENAI_API_KEY"]);
    store().setTests(ID, [{ name: "case", inputs: { a: "x" } }]);

    expect(store().getScript(ID)?.name).toBe("Reshape");
    expect(doc()).toMatchObject({
      description: "Reshapes an API response",
      code: "emit('out', inputs.a)",
      inputs: [{ name: "a", type: "str" }],
      outputs: [{ name: "out", type: "str" }],
      secrets: ["OPENAI_API_KEY"],
      tests: [{ name: "case", inputs: { a: "x" } }]
    });
  });

  it("setPorts leaves the side it was not given alone", () => {
    store().ensureScript(ID);
    store().setPorts(ID, {
      inputs: [{ name: "a", type: "str" }],
      outputs: [{ name: "out", type: "str" }]
    });
    store().setPorts(ID, { inputs: [{ name: "b", type: "int" }] });
    expect(doc()?.outputs).toEqual([{ name: "out", type: "str" }]);
  });

  it("clamps the timeout to the sandbox ceiling and to a whole second", () => {
    store().ensureScript(ID);
    store().setTimeoutSeconds(ID, 5000);
    expect(doc()?.timeoutSeconds).toBe(JS_SCRIPT_MAX_TIMEOUT_SECONDS);
    store().setTimeoutSeconds(ID, 0);
    expect(doc()?.timeoutSeconds).toBe(1);
    store().setTimeoutSeconds(ID, 12.4);
    expect(doc()?.timeoutSeconds).toBe(12);
  });

  it("keeps the entry identity on a no-op edit, so autosave stays quiet", () => {
    store().ensureScript(ID);
    store().setCode(ID, "emit('a', 1)");
    const before = store().getScript(ID);
    store().setCode(ID, "emit('a', 1)");
    expect(store().getScript(ID)).toBe(before);
  });

  it("exposes the script in the node menu and takes it back out", () => {
    store().ensureScript(ID);
    store().setPalette(ID, { category: "My API" });
    expect(store().getScript(ID)?.document.palette).toEqual({
      category: "My API"
    });

    const before = store().getScript(ID);
    store().setPalette(ID, { category: "My API" });
    expect(store().getScript(ID)).toBe(before);

    store().setPalette(ID, null);
    expect(store().getScript(ID)?.document).not.toHaveProperty("palette");
    const hidden = store().getScript(ID);
    store().setPalette(ID, null);
    expect(store().getScript(ID)).toBe(hidden);
  });

  it("undo restores the previous document and redo reapplies it", () => {
    store().ensureScript(ID);
    store().setCode(ID, "first");
    // Distinct coalesce windows would fold two code edits into one step, so
    // change a different field between them.
    store().setPorts(ID, { inputs: [{ name: "a", type: "str" }] });
    store().setCode(ID, "second");

    store().undo(ID);
    expect(doc()?.code).toBe("first");
    store().redo(ID);
    expect(doc()?.code).toBe("second");
  });

  it("removeScript drops the entry, its revision, status and results", () => {
    store().ensureScript(ID);
    store().setServerRevision(ID, "rev-1");
    store().setSaveStatus(ID, "unsaved");
    store().setLastRun(ID, { ok: true, logs: [], duration_ms: 1 });
    store().setLastTest(ID, { passed: 1, failed: 0, cases: [] });

    store().removeScript(ID);

    const state = useJsScriptStore.getState();
    expect(state.scripts[ID]).toBeUndefined();
    expect(state.serverRevisions[ID]).toBeUndefined();
    expect(state.saveStatus[ID]).toBeUndefined();
    expect(state.lastRun[ID]).toBeUndefined();
    expect(state.lastTest[ID]).toBeUndefined();
  });

  it("setServerRevision(null) clears the CAS token", () => {
    store().setServerRevision(ID, "rev-1");
    expect(useJsScriptStore.getState().serverRevisions[ID]).toBe("rev-1");
    store().setServerRevision(ID, null);
    expect(useJsScriptStore.getState().serverRevisions[ID]).toBeUndefined();
  });

  it("loadScript replaces the whole entry", () => {
    store().ensureScript(ID);
    store().setCode(ID, "local");
    store().loadScript(ID, {
      name: "From server",
      document: { ...emptyJsScriptDocument(), code: "remote" }
    });
    expect(store().getScript(ID)?.name).toBe("From server");
    expect(doc()?.code).toBe("remote");
  });
});
