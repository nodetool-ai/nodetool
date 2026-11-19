/**
 * The cloud window (D27). The account and the windows are fakes.
 */
jest.mock("../types.d", () => ({}));

import { CloudWindow, originOfState, type WindowLike } from "../cloudWindow";
import type { CloudAccountState, CloudDocumentRef } from "../types.d";

const SIGNED_IN: CloudAccountState = {
  available: true,
  state: "signedIn",
  displayName: "Ada",
  accountId: "u1",
  serverOrigin: "https://api.nodetool.ai",
  serverEndPending: false,
  cloudAvailable: true,
  keychainAvailable: true,
  message: "",
};

class FakeWindow implements WindowLike {
  destroyed = false;
  minimized = false;
  shown = 0;
  focused = 0;
  loaded: string[] = [];
  sent: CloudDocumentRef[] = [];
  private closedListeners: (() => void)[] = [];

  constructor(readonly webContentsId: number) {}

  isDestroyed(): boolean {
    return this.destroyed;
  }
  isMinimized(): boolean {
    return this.minimized;
  }
  restore(): void {
    this.minimized = false;
  }
  show(): void {
    this.shown += 1;
  }
  focus(): void {
    this.focused += 1;
  }
  close(): void {
    this.destroyed = true;
    this.closedListeners.forEach((listener) => listener());
  }
  loadURL(url: string): void {
    this.loaded.push(url);
  }
  send(document: CloudDocumentRef): void {
    this.sent.push(document);
  }
  onClosed(listener: () => void): void {
    this.closedListeners.push(listener);
  }
}

function setup(appUrl: string | null = "http://127.0.0.1:7777") {
  let state = SIGNED_IN;
  let nextId = 10;
  const windows: FakeWindow[] = [];
  const cloudWindow = new CloudWindow({
    account: { state: () => state },
    createWindow: () => {
      const window = new FakeWindow(nextId++);
      windows.push(window);
      return window;
    },
    appUrl: () => appUrl,
    log: () => {},
  });
  return {
    cloudWindow,
    windows,
    setState: (next: CloudAccountState) => {
      state = next;
      cloudWindow.stateChanged(next);
    },
    /** The account changes before its state event reaches the window. */
    setStateQuietly: (next: CloudAccountState) => {
      state = next;
    },
  };
}

const FLOW: CloudDocumentRef = { type: "workflow", id: "w1" };
const CUT: CloudDocumentRef = { type: "timeline", id: "t1" };

test("the first document opens a window on the web app and waits until the page is ready", () => {
  const { cloudWindow, windows } = setup();
  expect(cloudWindow.open(FLOW)).toEqual({ ok: true });
  expect(windows).toHaveLength(1);
  expect(windows[0].loaded).toEqual(["http://127.0.0.1:7777"]);
  expect(cloudWindow.open(CUT)).toEqual({ ok: true });
  expect(windows).toHaveLength(1);
  expect(windows[0].sent).toEqual([]);
  expect(cloudWindow.takePending(10)).toEqual([FLOW, CUT]);
  expect(cloudWindow.takePending(10)).toEqual([]);
  // Ready now: the next document is an event, and the window comes forward.
  windows[0].minimized = true;
  cloudWindow.open(FLOW);
  expect(windows[0].sent).toEqual([FLOW]);
  expect(windows[0].minimized).toBe(false);
  expect(windows[0].focused).toBeGreaterThan(0);
});

test("only the cloud window learns its server and account, or takes its documents", () => {
  const { cloudWindow } = setup();
  expect(cloudWindow.originFor(10)).toBeNull();
  cloudWindow.open(FLOW);
  expect(cloudWindow.originFor(10)).toEqual({ server: "https://api.nodetool.ai", account: "u1" });
  expect(cloudWindow.originFor(11)).toBeNull();
  expect(cloudWindow.takePending(11)).toEqual([]);
  expect(cloudWindow.takePending(10)).toEqual([FLOW]);
});

test("nothing opens while signed out or before the local server has started", () => {
  const signedOut = setup();
  signedOut.setState({ ...SIGNED_IN, state: "signedOut", accountId: "" });
  expect(signedOut.cloudWindow.open(FLOW)).toEqual({ ok: false, error: "SIGNED_OUT" });
  expect(signedOut.windows).toHaveLength(0);

  const starting = setup(null);
  expect(starting.cloudWindow.open(FLOW)).toEqual({ ok: false, error: "STARTING" });
  expect(starting.windows).toHaveLength(0);
});

test("a sign-out closes the window, and so does another account", () => {
  const { cloudWindow, windows, setState } = setup();
  cloudWindow.open(FLOW);
  setState({ ...SIGNED_IN, displayName: "Ada L." });
  expect(windows[0].destroyed).toBe(false);
  setState({ ...SIGNED_IN, accountId: "u2" });
  expect(windows[0].destroyed).toBe(true);
  expect(cloudWindow.originFor(10)).toBeNull();

  cloudWindow.open(CUT);
  expect(windows).toHaveLength(2);
  expect(cloudWindow.originFor(11)).toEqual({ server: "https://api.nodetool.ai", account: "u2" });
  setState({ ...SIGNED_IN, state: "signedOut", accountId: "" });
  expect(windows[1].destroyed).toBe(true);
});

test("a window of another account is replaced, not reused", () => {
  const { cloudWindow, windows, setStateQuietly } = setup();
  cloudWindow.open(FLOW);
  setStateQuietly({ ...SIGNED_IN, accountId: "u2" });
  cloudWindow.open(CUT);
  expect(windows).toHaveLength(2);
  expect(windows[0].destroyed).toBe(true);
  expect(windows[0].sent).toEqual([]);
  expect(cloudWindow.takePending(11)).toEqual([CUT]);
});

test("a window the person closes is forgotten, and the next document opens a new one", () => {
  const { cloudWindow, windows } = setup();
  cloudWindow.open(FLOW);
  windows[0].close();
  expect(cloudWindow.originFor(10)).toBeNull();
  cloudWindow.open(CUT);
  expect(windows).toHaveLength(2);
  expect(cloudWindow.takePending(11)).toEqual([CUT]);
});

test("the origin of a state needs the account id and the policy", () => {
  expect(originOfState(SIGNED_IN)).toEqual({ server: "https://api.nodetool.ai", account: "u1" });
  expect(originOfState({ ...SIGNED_IN, accountId: "" })).toBeNull();
  expect(originOfState({ ...SIGNED_IN, cloudAvailable: false })).toBeNull();
  expect(originOfState({ ...SIGNED_IN, available: false })).toBeNull();
});
