import { renderHook } from "@testing-library/react";

import { usePackageManager } from "../usePackageManager";
import usePacksStore from "../../../stores/PacksStore";
import useRuntimePackagesStore from "../../../stores/RuntimePackagesStore";
import useNodePacksStore from "../../../stores/NodePacksStore";
import useOptionalNodePacksStore from "../../../stores/OptionalNodePacksStore";

/** Replace the stores' fetch/console side-effects with no-ops so mounting the
 *  hook touches no network, then seed deterministic data. */
const seed = () => {
  usePacksStore.setState({
    builtins: [
      {
        id: "base",
        name: "Base Nodes",
        description: "Core nodes.",
        enabled: true,
        required: true
      },
      {
        id: "transformers-js",
        name: "Transformers.js",
        description: "Local ONNX.",
        enabled: false,
        required: false
      },
      // A provider pack — gated by its API key, must NOT appear in the list.
      {
        id: "elevenlabs",
        name: "ElevenLabs",
        description: "TTS.",
        enabled: true,
        required: false
      }
    ],
    packs: [],
    error: null,
    fetchBuiltins: async () => {},
    fetch: async () => {}
  });
  useRuntimePackagesStore.setState({
    available: false,
    statuses: [],
    installLocation: null,
    busyIds: [],
    consoleLines: [],
    error: null,
    refresh: async () => {},
    subscribeConsole: () => {},
    unsubscribeConsole: () => {}
  });
  useNodePacksStore.setState({
    available: true,
    availablePacks: [
      { repo_id: "acme/cool", name: "Cool", description: "Cool nodes." }
    ],
    installed: [],
    busyIds: [],
    consoleLines: [],
    error: null,
    refresh: async () => {},
    subscribeConsole: () => {},
    unsubscribeConsole: () => {}
  });
  useOptionalNodePacksStore.setState({ enabledPackIds: [] });
};

describe("usePackageManager", () => {
  beforeEach(seed);

  it("lists core, keyless-local, and optional packs; hides key-gated providers", () => {
    const { result } = renderHook(() =>
      usePackageManager({ tab: "packs", cat: "included", q: "", filter: "all" })
    );
    const names = result.current.rows.map((r) => r.name);
    // Core (required) first, then keyless local pack, plus optional categories.
    expect(names[0]).toBe("Base Nodes");
    expect(names).toContain("Transformers.js");
    expect(names).toContain("Documents"); // an optional node-pack category
    // ElevenLabs is key-gated → managed by its API key, not shown here.
    expect(names).not.toContain("ElevenLabs");
    expect(result.current.rows[0].badge).toBe("alwaysOn");
    expect(result.current.rows[0].toggle?.disabled).toBe(true);
    // The rail count matches the rendered list (filter all, no search).
    expect(
      result.current.categories.find((c) => c.id === "included")?.count
    ).toBe(result.current.rows.length);
  });

  it("filters the included list by the disabled status chip", () => {
    const { result } = renderHook(() =>
      usePackageManager({
        tab: "packs",
        cat: "included",
        q: "",
        filter: "disabled"
      })
    );
    const names = result.current.rows.map((r) => r.name);
    // base is enabled (required) → excluded; the disabled keyless + optional
    // packs remain.
    expect(names).not.toContain("Base Nodes");
    expect(names).toContain("Transformers.js");
    expect(names).toContain("Documents");
  });

  it("offers Install for an uninstalled registry pack", () => {
    const { result } = renderHook(() =>
      usePackageManager({ tab: "packs", cat: "python", q: "", filter: "all" })
    );
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].buttons?.install).toBe(true);
    expect(result.current.rows[0].buttons?.uninstall).toBe(false);
    expect(result.current.notice).toBeNull();
  });

  it("offers a bulk Update all action on the registry tab when packs have updates", () => {
    useNodePacksStore.setState({
      availablePacks: [],
      installed: [
        {
          name: "Cool",
          description: "Cool nodes.",
          version: "1.0.0",
          repo_id: "acme/cool",
          latestVersion: "1.1.0",
          hasUpdate: true
        },
        {
          name: "Plain",
          description: "Up to date.",
          version: "2.0.0",
          repo_id: "acme/plain"
        }
      ]
    });
    const { result } = renderHook(() =>
      usePackageManager({ tab: "packs", cat: "python", q: "", filter: "all" })
    );
    expect(result.current.bulkUpdate?.count).toBe(1);
    expect(result.current.bulkUpdate?.busy).toBe(false);
  });

  it("hides the bulk Update all action when nothing needs updating", () => {
    const { result } = renderHook(() =>
      usePackageManager({ tab: "packs", cat: "python", q: "", filter: "all" })
    );
    // Seed default has one uninstalled pack → no updates available.
    expect(result.current.bulkUpdate).toBeNull();
  });

  it("shows a desktop-only notice for software without the runtime IPC", () => {
    const { result } = renderHook(() =>
      usePackageManager({ tab: "software", cat: "all", q: "", filter: "all" })
    );
    expect(result.current.isSoftware).toBe(true);
    expect(result.current.notice).toMatch(/desktop app/i);
    expect(result.current.rows).toHaveLength(0);
    expect(result.current.chips).toHaveLength(0);
  });
});
