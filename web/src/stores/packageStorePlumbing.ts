/**
 * Shared plumbing for the two Package Manager stores (`NodePacksStore` for
 * Python node packs, `RuntimePackagesStore` for runtimes). Both wrap the same
 * Electron IPC surface with the same install-console and the same
 * busy/refresh/error op sequence.
 */
import type { StoreApi } from "zustand";

import { createErrorMessage } from "../utils/errorHandling";

const MAX_CONSOLE_LINES = 500;

export interface PackageConsoleSlice {
  consoleLines: string[];
  subscribeConsole: () => void;
  unsubscribeConsole: () => void;
  clearConsole: () => void;
}

/**
 * One listener on the Electron server-log stream, fanned out to whichever
 * stores asked for it. Each store opening its own `onLog` meant two IPC
 * listeners delivering the same lines.
 */
const sinks = new Set<(line: string) => void>();
let logUnsubscribe: (() => void) | null = null;

const addSink = (sink: (line: string) => void): void => {
  sinks.add(sink);
  if (logUnsubscribe) {
    return;
  }
  const onLog =
    typeof window !== "undefined" ? window.api?.server?.onLog : undefined;
  if (!onLog) {
    return;
  }
  logUnsubscribe = onLog((message: string) => {
    for (const s of sinks) {
      s(message);
    }
  });
};

const removeSink = (sink: (line: string) => void): void => {
  sinks.delete(sink);
  if (sinks.size === 0 && logUnsubscribe) {
    logUnsubscribe();
    logUnsubscribe = null;
  }
};

export function createPackageConsoleSlice<S extends PackageConsoleSlice>(
  set: StoreApi<S>["setState"]
): PackageConsoleSlice {
  let sink: ((line: string) => void) | null = null;
  return {
    consoleLines: [],

    subscribeConsole: () => {
      if (sink) {
        return;
      }
      sink = (line: string) =>
        set(
          (state) =>
            ({
              consoleLines: [...state.consoleLines, line].slice(
                -MAX_CONSOLE_LINES
              )
            }) as Partial<S>
        );
      addSink(sink);
    },

    unsubscribeConsole: () => {
      if (!sink) {
        return;
      }
      removeSink(sink);
      sink = null;
    },

    clearConsole: () => set({ consoleLines: [] as string[] } as Partial<S>)
  };
}

export interface PackageOpState {
  /** Ids with an install/uninstall/update in flight (per-row spinners). */
  busyIds: string[];
  error: string | null;
  refresh: () => Promise<void>;
}

export interface PackageOpResult {
  success: boolean;
  message: string;
}

/**
 * Run install/uninstall/update over one or more ids: flag the rows busy, run
 * each op, refresh, then apply the outcome. The outcome is set *after* refresh
 * so a failure message survives (refresh clears `error`). A restart reloads the
 * registry once for the whole batch when the change affects which nodes are
 * importable.
 */
export async function runPackageOp<S extends PackageOpState>(
  set: StoreApi<S>["setState"],
  get: StoreApi<S>["getState"],
  ids: string[],
  op: (id: string) => Promise<PackageOpResult>,
  failureMessage: string,
  restartAfter: boolean
): Promise<boolean> {
  set(
    (state) => ({ busyIds: [...new Set([...state.busyIds, ...ids])] }) as Partial<S>
  );

  let success = true;
  let message = "";
  for (const id of ids) {
    try {
      const res = await op(id);
      if (!res.success) {
        success = false;
        message = res.message;
      }
    } catch (err: unknown) {
      success = false;
      message = createErrorMessage(err, failureMessage).message;
    }
  }

  await get().refresh();
  set(
    (state) =>
      ({
        busyIds: state.busyIds.filter((p) => !ids.includes(p)),
        error: success ? state.error : message
      }) as Partial<S>
  );

  if (success && restartAfter) {
    try {
      void window.api?.server?.restart?.();
    } catch {
      // Best-effort: the change is on disk; the user can restart manually.
    }
  }
  return success;
}
