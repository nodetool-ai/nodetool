/**
 * The cloud window of the desktop app (decision D27, technical design,
 * "Cloud window"; WP1.15).
 *
 * A cloud document opens in a second window that talks only to the signed-in
 * cloud server. The main process decides which window that is and for which
 * server and account: the page asks once at boot, so nothing in its URL can
 * make a window a cloud window or point it at another server.
 *
 * The window belongs to one server and one account. It closes when the
 * account signs out or another account signs in. A document asked for before
 * the page is ready waits here until the page takes it.
 */
import type { CloudAccountState, CloudDocumentRef, CloudWindowOpenResult, CloudWindowOrigin } from "./types.d";

export type { CloudDocumentRef, CloudWindowOpenResult, CloudWindowOrigin } from "./types.d";

/** What the cloud window needs of a `BrowserWindow`. */
export interface WindowLike {
  readonly webContentsId: number;
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
  close(): void;
  loadURL(url: string): void;
  send(document: CloudDocumentRef): void;
  onClosed(listener: () => void): void;
}

export interface CloudWindowDeps {
  account: { state(): CloudAccountState };
  /** A new, hidden-until-shown window with the app's secure preferences. */
  createWindow: () => WindowLike;
  /** The URL of the web app on the local server, or null while it starts. */
  appUrl: () => string | null;
  log: (message: string, level?: "info" | "warn" | "error") => void;
}

/** The server and account of a signed-in state, or null. */
export function originOfState(state: CloudAccountState): CloudWindowOrigin | null {
  if (!state.available || state.state !== "signedIn" || !state.cloudAvailable || !state.serverOrigin || !state.accountId) {
    return null;
  }
  return { server: state.serverOrigin, account: state.accountId };
}

/** Documents a page may hold at once before it is ready. */
const MAX_PENDING_DOCUMENTS = 32;

/**
 * Thread affinity: Electron's main process, on its event loop only. Owns at
 * most one cloud window, which it closes in stateChanged() when the account
 * no longer matches and in dispose().
 */
export class CloudWindow {
  private window: WindowLike | null = null;
  private origin: CloudWindowOrigin | null = null;
  private ready = false;
  private pending: CloudDocumentRef[] = [];
  /**
   * Every page this launch opened as a cloud window, closed ones included.
   * Electron never reuses a webContents id within a process, so the set
   * grows by one per window opened.
   */
  private readonly pages = new Set<number>();

  constructor(private readonly deps: CloudWindowDeps) {}

  /** Opens `document` in the cloud window, creating the window when there is none. */
  open(document: CloudDocumentRef): CloudWindowOpenResult {
    const origin = originOfState(this.deps.account.state());
    if (!origin) {
      return { ok: false, error: "SIGNED_OUT" };
    }
    if (this.window && !this.window.isDestroyed() && this.origin && sameOrigin(this.origin, origin)) {
      this.deliver(document);
      if (this.window.isMinimized()) {
        this.window.restore();
      }
      this.window.show();
      this.window.focus();
      return { ok: true };
    }
    const url = this.deps.appUrl();
    if (!url) {
      return { ok: false, error: "STARTING" };
    }
    this.closeWindow();
    const window = this.deps.createWindow();
    this.pages.add(window.webContentsId);
    this.window = window;
    this.origin = origin;
    this.ready = false;
    this.pending = [document];
    window.onClosed(() => {
      if (this.window === window) {
        this.forget();
      }
    });
    window.loadURL(url);
    window.show();
    return { ok: true };
  }

  /** The server and account of the window whose page asks, or null for any other window. */
  originFor(webContentsId: number): CloudWindowOrigin | null {
    return this.window && !this.window.isDestroyed() && this.window.webContentsId === webContentsId
      ? this.origin
      : null;
  }

  /**
   * Whether a cloud request of the page `webContentsId` may go out with the
   * signed-in account's credential (TC125). Any other window may. A cloud
   * window may only while it belongs to the account that is signed in now,
   * so a window of account A that is still closing sends nothing under B.
   */
  mayCallCloud(webContentsId: number): boolean {
    if (!this.pages.has(webContentsId)) {
      return true;
    }
    const mine = this.originFor(webContentsId);
    const current = originOfState(this.deps.account.state());
    return mine !== null && current !== null && sameOrigin(mine, current);
  }

  /**
   * The cloud window's page is ready: it gets the documents asked for so
   * far, and later ones as events. Any other window gets nothing.
   */
  takePending(webContentsId: number): CloudDocumentRef[] {
    if (!this.originFor(webContentsId)) {
      return [];
    }
    this.ready = true;
    const pending = this.pending;
    this.pending = [];
    return pending;
  }

  /** The account changed: a window of another server or account closes. */
  stateChanged(state: CloudAccountState): void {
    const origin = originOfState(state);
    if (this.window && this.origin && (!origin || !sameOrigin(origin, this.origin))) {
      this.deps.log("Closing the cloud window: the account it was opened for is no longer signed in");
      this.closeWindow();
    }
  }

  dispose(): void {
    this.closeWindow();
  }

  private deliver(document: CloudDocumentRef): void {
    if (this.ready) {
      this.window?.send(document);
    } else if (this.pending.length < MAX_PENDING_DOCUMENTS) {
      this.pending.push(document);
    }
  }

  private closeWindow(): void {
    const window = this.window;
    this.forget();
    if (window && !window.isDestroyed()) {
      window.close();
    }
  }

  private forget(): void {
    this.window = null;
    this.origin = null;
    this.ready = false;
    this.pending = [];
  }
}

function sameOrigin(a: CloudWindowOrigin, b: CloudWindowOrigin): boolean {
  return a.server === b.server && a.account === b.account;
}
