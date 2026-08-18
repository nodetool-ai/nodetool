import {
  canTakeFocus,
  getIsElectronDetails,
  isEditableElement,
  isTextInputActive
} from "../browser";

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

describe("canTakeFocus", () => {
  const mount = (build: (host: HTMLElement) => HTMLElement) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const target = build(host);
    return { host, target };
  };

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("accepts a mounted, enabled input", () => {
    const { target } = mount((host) => {
      const input = document.createElement("input");
      host.appendChild(input);
      return input;
    });
    expect(canTakeFocus(target)).toBe(true);
  });

  it("rejects null and detached nodes", () => {
    expect(canTakeFocus(null)).toBe(false);
    expect(canTakeFocus(undefined)).toBe(false);
    expect(canTakeFocus(document.createElement("input"))).toBe(false);
  });

  it("rejects an input inside an inert subtree", () => {
    const { host, target } = mount((h) => {
      const input = document.createElement("input");
      h.appendChild(input);
      return input;
    });
    host.setAttribute("inert", "");
    expect(canTakeFocus(target)).toBe(false);
  });

  it("rejects hidden and aria-hidden subtrees", () => {
    const { host, target } = mount((h) => {
      const input = document.createElement("input");
      h.appendChild(input);
      return input;
    });
    host.setAttribute("aria-hidden", "true");
    expect(canTakeFocus(target)).toBe(false);
    host.removeAttribute("aria-hidden");
    host.setAttribute("hidden", "");
    expect(canTakeFocus(target)).toBe(false);
  });

  it("rejects a disabled control", () => {
    const { target } = mount((h) => {
      const input = document.createElement("input");
      input.disabled = true;
      h.appendChild(input);
      return input;
    });
    expect(canTakeFocus(target)).toBe(false);
  });
});
