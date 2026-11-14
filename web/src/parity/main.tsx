/**
 * Web host for the native parity harness. The runner drives it through
 * `window.parity` with Playwright; see native/parity/README.md.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { createRoot, type Root } from "react-dom/client";
import { useColorScheme } from "@mui/material/styles";
import { useEffect, type ReactElement } from "react";
import { WorkflowManagerProvider } from "../contexts/WorkflowManagerContext";
import TranslationProvider from "../contexts/TranslationProvider";
import ThemeNodetool from "../components/themes/ThemeNodetool";
import { ThemeRoot } from "../components/ui_primitives";
import { trpc } from "../trpc/client";
import { createTrpcLinks } from "../trpc/links";
import { MOUNTS, type ParityFixture, type ParityIntent, type ParityMount } from "./mounts";
import "@xyflow/react/dist/style.css";
import "../styles/vars.css";
import "../styles/index.css";
import "../styles/base.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
// Components that read tRPC queries, such as the chat composer's skills, find a
// client. Queries stay disabled, so the page sends no requests.
const trpcClient = trpc.createClient({ links: createTrpcLinks() });

function Scheme({ scheme, onReady, children }: { scheme: "dark" | "light"; onReady: () => void; children: ReactElement }): ReactElement {
  const { mode, setMode } = useColorScheme();
  useEffect(() => { setMode(scheme); }, [scheme, setMode]);
  useEffect(() => { if (mode === scheme) { onReady(); } }, [mode, scheme, onReady]);
  return children;
}

let root: Root | null = null;
let current: ParityMount | null = null;
let intents: ParityIntent[] = [];

const parity = {
  components: Object.keys(MOUNTS),
  mount(component: string, fixture: ParityFixture, scheme: "dark" | "light"): Promise<{ width: number; height: number }> {
    const factory = MOUNTS[component];
    if (!factory) {
      throw new Error(`No mount for component ${component}. Known: ${Object.keys(MOUNTS).join(", ")}`);
    }
    root?.unmount();
    intents = [];
    const host = document.getElementById("root");
    if (!host) {
      throw new Error("Missing parity root");
    }
    current = factory(fixture, (intent) => intents.push(intent), queryClient);
    const mount = current;
    host.setAttribute("data-parity-scope", "");
    host.style.cssText = "position:relative;width:100vw;height:100vh";
    root = createRoot(host);
    return new Promise((resolve) => {
      root?.render(
        <MemoryRouter><trpc.Provider client={trpcClient} queryClient={queryClient}><QueryClientProvider client={queryClient}><WorkflowManagerProvider queryClient={queryClient}><TranslationProvider>
          <ThemeRoot theme={ThemeNodetool}>
            <Scheme scheme={scheme} onReady={() => resolve(mount.size)}>{mount.element}</Scheme>
          </ThemeRoot>
        </TranslationProvider></WorkflowManagerProvider></QueryClientProvider></trpc.Provider></MemoryRouter>
      );
    });
  },
  screenshotSelector(): string {
    if (!current) {
      throw new Error("Nothing is mounted");
    }
    return current.screenshot;
  },
  probe(): Record<string, unknown> {
    if (!current) {
      throw new Error("Nothing is mounted");
    }
    return current.probe();
  },
  takeIntents(): ParityIntent[] {
    const taken = intents;
    intents = [];
    return taken;
  }
};

declare global {
  interface Window { parity: typeof parity }
}
window.parity = parity;
