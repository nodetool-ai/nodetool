import {
  getJsScriptAgentHandler,
  hasJsScriptAgentHandler,
  listOpenJsScriptIds,
  setJsScriptAgentHandler,
  type JsScriptAgentHandler
} from "../jsScriptAgentBridge";

const makeMockHandler = (): JsScriptAgentHandler => ({
  getSnapshot: jest.fn(),
  setCode: jest.fn(),
  setPorts: jest.fn(),
  setMeta: jest.fn(),
  setTests: jest.fn(),
  run: jest.fn(),
  test: jest.fn()
});

afterEach(() => {
  for (const id of listOpenJsScriptIds()) {
    setJsScriptAgentHandler(id, null);
  }
});

describe("jsScriptAgentBridge", () => {
  it("reports no handler before one is registered", () => {
    expect(hasJsScriptAgentHandler("js-1")).toBe(false);
  });

  it("registers, resolves and clears a handler by id", () => {
    const handler = makeMockHandler();
    setJsScriptAgentHandler("js-1", handler);
    expect(hasJsScriptAgentHandler("js-1")).toBe(true);
    expect(getJsScriptAgentHandler("js-1")).toBe(handler);

    setJsScriptAgentHandler("js-1", null);
    expect(hasJsScriptAgentHandler("js-1")).toBe(false);
  });

  it("keeps handlers separate per id", () => {
    setJsScriptAgentHandler("js-1", makeMockHandler());
    expect(hasJsScriptAgentHandler("js-2")).toBe(false);
    expect(listOpenJsScriptIds()).toEqual(["js-1"]);
  });

  it("throws and says nothing is open when the registry is empty", () => {
    expect(() => getJsScriptAgentHandler("abc")).toThrow(
      'No JS script "abc" is open. No JS scripts are currently open.'
    );
  });

  it("throws and lists the open ids when the id is unknown", () => {
    setJsScriptAgentHandler("def", makeMockHandler());
    setJsScriptAgentHandler("ghi", makeMockHandler());
    expect(() => getJsScriptAgentHandler("abc")).toThrow(
      'No JS script "abc" is open. Open JS scripts: def, ghi.'
    );
  });
});
