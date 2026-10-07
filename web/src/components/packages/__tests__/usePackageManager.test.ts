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
      usePackageManager({ cat: "included", q: "", filter: "all" })
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

  it("filters the included list to the packs that are off", () => {
    const { result } = renderHook(() =>
      usePackageManager({
        cat: "included",
        q: "",
        filter: "available"
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
      usePackageManager({ cat: "python", q: "", filter: "all" })
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
      usePackageManager({ cat: "python", q: "", filter: "all" })
    );
    expect(result.current.bulkUpdate?.count).toBe(1);
    expect(result.current.bulkUpdate?.busy).toBe(false);
  });

  it("hides the bulk Update all action when nothing needs updating", () => {
    const { result } = renderHook(() =>
      usePackageManager({ cat: "python", q: "", filter: "all" })
    );
    // Seed default has one uninstalled pack → no updates available.
    expect(result.current.bulkUpdate).toBeNull();
  });

  it("offers an update for an outdated desktop runtime package", () => {
    const update = jest.fn().mockResolvedValue(true);
    useRuntimePackagesStore.setState({
      available: true,
      statuses: [
        {
          id: "claude-agent-sdk",
          name: "Claude Agent SDK",
          description: "SDK",
          installed: true,
          installing: false,
          installedVersion: "0.3.190",
          latestVersion: "0.3.283",
          updateAvailable: true
        },
        {
          id: "ffmpeg",
          name: "FFmpeg",
          description: "Media",
          installed: true,
          installing: false
        }
      ],
      update
    });
    const { result } = renderHook(() =>
      usePackageManager({ cat: "runtimes", q: "", filter: "all" })
    );
    const sdk = result.current.rows.find((r) => r.key === "claude-agent-sdk");
    expect(sdk?.badge).toBe("update");
    expect(sdk?.version).toBe("v0.3.190  →  v0.3.283");
    expect(sdk?.buttons?.update).toBe(true);
    sdk?.buttons?.onUpdate();
    expect(update).toHaveBeenCalledWith("claude-agent-sdk");

    const ffmpeg = result.current.rows.find((r) => r.key === "ffmpeg");
    expect(ffmpeg?.badge).toBe("installed");
    expect(ffmpeg?.buttons?.update).toBe(false);
  });

  it("shows a desktop-only notice for software without the runtime IPC", () => {
    const { result } = renderHook(() =>
      usePackageManager({ cat: "runtimes", q: "", filter: "all" })
    );
    expect(result.current.isSoftware).toBe(true);
    expect(result.current.notice).toMatch(/desktop app/i);
    expect(result.current.rows).toHaveLength(0);
    expect(result.current.filters).toHaveLength(0);
  });

  it("keeps a pack with an update in the Installed filter", () => {
    useNodePacksStore.setState({
      availablePacks: [
        { repo_id: "acme/cool", name: "Cool", description: "Cool nodes." },
        { repo_id: "acme/new", name: "New", description: "Not installed." }
      ],
      installed: [
        {
          name: "Cool",
          description: "Cool nodes.",
          version: "1.0.0",
          repo_id: "acme/cool",
          latestVersion: "1.1.0",
          hasUpdate: true
        }
      ]
    });
    const { result } = renderHook(() =>
      usePackageManager({ cat: "python", q: "", filter: "installed" })
    );
    expect(result.current.rows.map((r) => r.name)).toEqual(["Cool"]);
    expect(result.current.rows[0].badge).toBe("update");
    expect(result.current.filters).toEqual([
      { id: "all", label: "All", count: 2 },
      { id: "installed", label: "Installed", count: 1 },
      { id: "available", label: "Not installed", count: 1 }
    ]);
  });

  it("shows runtimes in groups: languages, then media, then AI", () => {
    const status = (id: string, name: string) => ({
      id,
      name,
      description: name,
      installed: false,
      installing: false
    });
    useRuntimePackagesStore.setState({
      available: true,
      statuses: [
        status("whisper-cpp", "whisper.cpp"),
        status("ffmpeg", "FFmpeg"),
        status("python", "Python")
      ]
    });
    const { result } = renderHook(() =>
      usePackageManager({ cat: "runtimes", q: "", filter: "all" })
    );
    expect(
      result.current.rows.map((r) => [r.group, r.name])
    ).toEqual([
      ["Languages", "Python"],
      ["Media & documents", "FFmpeg"],
      ["AI runtimes", "whisper.cpp"]
    ]);
  });

  it("lists the four categories in the rail", () => {
    const { result } = renderHook(() =>
      usePackageManager({ cat: "included", q: "", filter: "all" })
    );
    expect(result.current.categories.map((c) => c.label)).toEqual([
      "Included",
      "Python packs",
      "Third-party",
      "Software"
    ]);
  });
});
