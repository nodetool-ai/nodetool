/**
 * The app: parses the bundled document, starts the runtime, renders the UI
 * tree. Everything the app does is described by `app.bundle.json`.
 */
import type { ReactNode } from "react";
import { parseApplicationBundle } from "@nodetool-ai/app-runtime";
import rawBundle from "../app.bundle.json";
import { AppRuntimeContext } from "./runtime/context";
import { useAppRuntime } from "./runtime/useAppRuntime";
import { ComponentList, slotNodes } from "./widgets/tree";

const bundle = parseApplicationBundle(rawBundle);

function RunningApp({ bundle: loaded }: { bundle: NonNullable<typeof bundle> }): ReactNode {
  const runtime = useAppRuntime(loaded, loaded.name);
  return (
    <AppRuntimeContext.Provider value={runtime}>
      <main className="nt-app">
        <ComponentList nodes={slotNodes(loaded.app.ui.content)} />
      </main>
    </AppRuntimeContext.Provider>
  );
}

export function App(): ReactNode {
  if (!bundle) {
    return (
      <main className="nt-app">
        <div className="nt-alert nt-alert-error">app.bundle.json is not a NodeTool app bundle.</div>
      </main>
    );
  }
  document.title = bundle.name;
  return <RunningApp bundle={bundle} />;
}
