/**
 * The mini app renderer for MCP hosts.
 *
 * The host loads this page for the `ui://` resource the `open_app` tool links
 * to. The page completes the MCP Apps handshake, waits for that tool's result
 * (the app instance's bundle), and renders it with the exported app's widgets.
 * Runs go back to NodeTool through the host (see `server.ts`).
 */
import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { parseApplicationBundle, type ApplicationBundle } from "@nodetool-ai/app-runtime";
import { AppRuntimeContext } from "../../template/src/runtime/context";
import { useAppRuntime } from "../../template/src/runtime/useAppRuntime";
import { ComponentList, slotNodes } from "../../template/src/widgets/tree";
import { hostBridge, toolPayload, type HostContext, type ToolResult } from "./bridge";
import { setAppSession } from "./server";
import "../../template/src/styles.css";
import "./host.css";

/**
 * `crypto.randomUUID` exists only in a secure context, and a host may serve
 * this page from an opaque sandbox origin that is not one. The runtime names
 * each run with it, so fill it in from `getRandomValues`, which works anywhere.
 */
if (typeof crypto.randomUUID !== "function") {
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: (): string => {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  });
}

interface OpenedApp {
  instanceId: string;
  bundle: ApplicationBundle;
}

type PageState =
  | { kind: "connecting" }
  | { kind: "waiting" }
  | { kind: "ready"; app: OpenedApp }
  | { kind: "error"; message: string };

function applyHostContext(context: HostContext): void {
  if (context.theme === "light" || context.theme === "dark") {
    document.documentElement.dataset.theme = context.theme;
  }
}

/** The `open_app` result, or the reason it cannot be shown. */
function readOpenResult(params: Record<string, unknown>): OpenedApp | string {
  const result = params as ToolResult;
  const payload = toolPayload(result);
  if (result.isError) {
    return typeof payload.error === "string" ? payload.error : "NodeTool could not open the app.";
  }
  const bundle = parseApplicationBundle(payload.bundle);
  const instanceId = payload.instance_id;
  if (!bundle || typeof instanceId !== "string") {
    return "The tool result is not a NodeTool mini app.";
  }
  return { instanceId, bundle };
}

function RunningApp({ app }: { app: OpenedApp }): ReactNode {
  const runtime = useAppRuntime(app.bundle, `mcp:${app.instanceId}`);
  return (
    <AppRuntimeContext.Provider value={runtime}>
      <main className="nt-app nt-mcp">
        <ComponentList nodes={slotNodes(app.bundle.app.ui.content)} />
      </main>
    </AppRuntimeContext.Provider>
  );
}

function Page(): ReactNode {
  const [state, setState] = useState<PageState>({ kind: "connecting" });

  useEffect(() => {
    const bridge = hostBridge();
    let active = true;
    const offContext = bridge.on("ui/notifications/host-context-changed", (params) =>
      applyHostContext(params as HostContext)
    );
    const offResult = bridge.on("ui/notifications/tool-result", (params) => {
      if (!active) return;
      const opened = readOpenResult(params);
      if (typeof opened === "string") {
        setState({ kind: "error", message: opened });
        return;
      }
      setAppSession({ instanceId: opened.instanceId });
      document.title = opened.bundle.name;
      setState({ kind: "ready", app: opened });
    });
    const offCancelled = bridge.on("ui/notifications/tool-cancelled", () => {
      if (active) setState({ kind: "error", message: "Opening the app was cancelled." });
    });
    bridge
      .initialize()
      .then((context) => {
        applyHostContext(context);
        if (active) setState((current) => (current.kind === "connecting" ? { kind: "waiting" } : current));
        const report = (): void =>
          bridge.notify("ui/notifications/size-changed", {
            width: Math.ceil(document.documentElement.scrollWidth),
            height: Math.ceil(document.documentElement.scrollHeight)
          });
        new ResizeObserver(report).observe(document.documentElement);
        report();
      })
      .catch(() => {
        if (active) setState({ kind: "error", message: "This page must be opened by an MCP host." });
      });
    return () => {
      active = false;
      offContext();
      offResult();
      offCancelled();
    };
  }, []);

  if (state.kind === "ready") return <RunningApp app={state.app} />;
  return (
    <main className="nt-app nt-mcp">
      {state.kind === "error" ? (
        <div className="nt-alert nt-alert-error">{state.message}</div>
      ) : (
        <div className="nt-hint">Opening app…</div>
      )}
    </main>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Page />
    </StrictMode>
  );
}
