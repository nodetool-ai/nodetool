import { getIsElectronDetails, isEditableElement, isTextInputActive } from "../browser";

describe("getIsElectronDetails", () => {
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    delete (window as any).process;
    delete (window as any).api;
    Object.defineProperty(Object.getPrototypeOf(navigator), "userAgent", {
      value: originalUserAgent,
      configurable: true,
      writable: true
    });
  });

  it("returns false when no electron signals are present", () => {
    const details = getIsElectronDetails();
    expect(details).toEqual({
      isElectron: false,
      isRendererProcess: false,
      hasElectronVersionInWindowProcess: false,
      hasElectronInUserAgent: false,
      hasElectronBridge: false
    });
  });

  it("detects renderer process", () => {
    (window as any).process = { type: "renderer" };
    const details = getIsElectronDetails();
    // isElectron is only true when window.api is present (the primary check)
    expect(details.isElectron).toBe(false);
    expect(details.isRendererProcess).toBe(true);
  });

  it("detects electron version in process", () => {
    (window as any).process = { versions: { electron: "1.0.0" } };
    const details = getIsElectronDetails();
    // isElectron is only true when window.api is present (the primary check)
    expect(details.isElectron).toBe(false);
    expect(details.hasElectronVersionInWindowProcess).toBe(true);
  });

  it("detects electron user agent", () => {
    Object.defineProperty(Object.getPrototypeOf(navigator), "userAgent", {
      value: "MyApp Electron/22.0",
      configurable: true,
      writable: true
    });
    const details = getIsElectronDetails();
    // isElectron is only true when window.api is present (the primary check)
    expect(details.isElectron).toBe(false);
    expect(details.hasElectronInUserAgent).toBe(true);
  });

  it("detects electron bridge via window.api", () => {
    (window as any).api = {};
    const details = getIsElectronDetails();
    expect(details.isElectron).toBe(true);
    expect(details.hasElectronBridge).toBe(true);
  });
});

describe("isEditableElement", () => {
  it("returns true for native inputs and textareas", () => {
    expect(isEditableElement(document.createElement("input"))).toBe(true);
    expect(isEditableElement(document.createElement("textarea"))).toBe(true);
  });

  it("returns true for elements inside Monaco", () => {
    const monacoRoot = document.createElement("div");
    monacoRoot.className = "monaco-editor";
    const inner = document.createElement("div");
    monacoRoot.appendChild(inner);
    document.body.appendChild(monacoRoot);

    expect(isEditableElement(inner)).toBe(true);

    document.body.removeChild(monacoRoot);
  });

  it("returns true for editor placeholder elements", () => {
    const placeholder = document.createElement("div");
    placeholder.className = "editor-placeholder";
    expect(isEditableElement(placeholder)).toBe(true);
  });
});

describe("isTextInputActive", () => {
  it("returns true when Monaco textarea is focused", () => {
    const monacoRoot = document.createElement("div");
    monacoRoot.className = "monaco-editor";
    const textarea = document.createElement("textarea");
    monacoRoot.appendChild(textarea);
    document.body.appendChild(monacoRoot);
    textarea.focus();

    expect(isTextInputActive()).toBe(true);

    document.body.removeChild(monacoRoot);
  });
});
