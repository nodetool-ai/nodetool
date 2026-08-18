import { describe, it, expect, afterEach } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  BUILTIN_NODE_PACKS,
  CLOUD_HOST_FILE_NODES,
  CLOUD_PROFILE_ENV,
  NODE_ENV_VAR,
  isCloudNodeType
} from "@nodetool-ai/protocol";
import {
  applyBuiltinPackEnabled,
  applyCloudNodePolicy,
  mergePythonBridgeMetadata,
  registerBuiltInNodes
} from "../src/node-registry-setup.js";

function allEnabled(): Record<string, boolean> {
  return Object.fromEntries(BUILTIN_NODE_PACKS.map((p) => [p.id, true]));
}

describe("registerBuiltInNodes", () => {
  it("catalog and registrars cover every built-in pack", () => {
    const registry = new NodeRegistry();
    // Throws if a catalog id has no registrar.
    registerBuiltInNodes(registry, { enabledOverrides: allEnabled() });
    expect(registry.list().length).toBeGreaterThan(0);
    expect(registry.listNodePackageIds()).toEqual(
      expect.arrayContaining(["base", "elevenlabs"])
    );
  });

  it("only registers required and default-enabled packs out of the box", () => {
    const everything = new NodeRegistry();
    registerBuiltInNodes(everything, { enabledOverrides: allEnabled() });

    const defaults = new NodeRegistry();
    registerBuiltInNodes(defaults, { enabledOverrides: {} });

    // Defaults are a strict subset: opt-in packs (e.g. ElevenLabs) are absent…
    const elevenlabsTypes = everything
      .list()
      .filter((t) => t.startsWith("elevenlabs."));
    expect(elevenlabsTypes.length).toBeGreaterThan(0);
    for (const nodeType of elevenlabsTypes) {
      expect(everything.getNodePackageId(nodeType)).toBe("elevenlabs");
    }
    for (const t of elevenlabsTypes) {
      expect(defaults.has(t)).toBe(false);
    }
    // …while default-enabled packs (e.g. FAL) are present.
    expect(defaults.list().some((t) => t.startsWith("fal."))).toBe(true);
    expect(defaults.list().length).toBeLessThan(everything.list().length);
  });

  it("user overrides enable opt-in packs and disable default ones", () => {
    const registry = new NodeRegistry();
    registerBuiltInNodes(registry, {
      enabledOverrides: { elevenlabs: true, fal: false }
    });
    expect(registry.list().some((t) => t.startsWith("elevenlabs."))).toBe(true);
    expect(registry.list().some((t) => t.startsWith("fal."))).toBe(false);
  });

  it("ignores disabling required packs", () => {
    const registry = new NodeRegistry();
    registerBuiltInNodes(registry, { enabledOverrides: { base: false } });
    expect(
      registry.list().some((t) => t.startsWith("nodetool."))
    ).toBe(true);
  });

  it("base pack is marked required in the catalog", () => {
    expect(
      BUILTIN_NODE_PACKS.find((p) => p.id === "base")?.required
    ).toBe(true);
  });
});

describe("applyBuiltinPackEnabled", () => {
  it("registers and unregisters exactly the pack's node types", () => {
    const registry = new NodeRegistry();
    registerBuiltInNodes(registry, { enabledOverrides: {} });
    const before = registry.list().length;

    applyBuiltinPackEnabled(registry, "elevenlabs", true);
    const elevenlabsTypes = registry
      .list()
      .filter((t) => t.startsWith("elevenlabs."));
    expect(elevenlabsTypes.length).toBeGreaterThan(0);

    applyBuiltinPackEnabled(registry, "elevenlabs", false);
    expect(
      registry.list().some((t) => t.startsWith("elevenlabs."))
    ).toBe(false);
    expect(registry.list().length).toBe(before);
  });

  it("disabling kie leaves base's kie.* nodes intact", () => {
    // base-nodes also registers types under the `kie.` namespace; live
    // disable must remove only what kie-nodes itself registers.
    const registry = new NodeRegistry();
    registerBuiltInNodes(registry, { enabledOverrides: { kie: false } });
    const baseKieTypes = registry
      .list()
      .filter((t) => t.startsWith("kie."));

    applyBuiltinPackEnabled(registry, "kie", true);
    applyBuiltinPackEnabled(registry, "kie", false);
    expect(registry.list().filter((t) => t.startsWith("kie."))).toEqual(
      baseKieTypes
    );
  });

  it("enabling is idempotent", () => {
    const registry = new NodeRegistry();
    registerBuiltInNodes(registry, { enabledOverrides: {} });
    applyBuiltinPackEnabled(registry, "minimax", true);
    const count = registry.list().length;
    applyBuiltinPackEnabled(registry, "minimax", true);
    expect(registry.list().length).toBe(count);
  });

  it("throws for unknown pack ids", () => {
    expect(() =>
      applyBuiltinPackEnabled(new NodeRegistry(), "nope", true)
    ).toThrow(/No registrar/);
  });
});

describe("mergePythonBridgeMetadata", () => {
  it("adds bridge-only Python nodes with current dynamic and streaming flags", () => {
    const registry = new NodeRegistry();
    const beforeRevision = registry.revision;

    const result = mergePythonBridgeMetadata(registry, [
      {
        node_type: "python.dynamic.Streamer",
        title: "Python Streamer",
        description: "Bridge-only test node",
        properties: [
          {
            name: "items",
            type: { type: "list", type_args: [{ type: "image" }] }
          }
        ],
        outputs: [
          {
            name: "output",
            type: { type: "image", type_args: [] }
          }
        ],
        required_settings: ["PYTHON_TEST_TOKEN"],
        recommended_models: [],
        is_dynamic: true,
        is_streaming_input: true,
        is_streaming_output: true
      }
    ]);

    expect(result).toEqual({ total: 1, bridgeOnly: 1, alreadyKnown: 0 });
    expect(registry.revision).toBeGreaterThan(beforeRevision);
    expect(registry.getMetadata("python.dynamic.Streamer")).toMatchObject({
      namespace: "python.dynamic",
      supports_dynamic_inputs: true,
      supports_dynamic_outputs: false,
      is_streaming_input: true,
      is_streaming_output: true,
      required_settings: ["PYTHON_TEST_TOKEN"],
      properties: [
        {
          name: "items",
          type: { type: "list", type_args: [{ type: "image" }] }
        }
      ]
    });
    expect(registry.getMetadataSource("python.dynamic.Streamer")).toBe(
      "python-bridge"
    );
  });

  it("does not overwrite metadata already in the registry", () => {
    const registry = new NodeRegistry();
    registry.loadMetadata("shared.Node", {
      title: "Authoritative TypeScript node",
      description: "",
      namespace: "shared",
      node_type: "shared.Node",
      properties: [],
      outputs: []
    });
    const beforeRevision = registry.revision;

    const result = mergePythonBridgeMetadata(registry, [
      {
        node_type: "shared.Node",
        title: "Python copy",
        description: "",
        properties: [],
        outputs: [],
        required_settings: []
      }
    ]);

    expect(result).toEqual({ total: 1, bridgeOnly: 0, alreadyKnown: 1 });
    expect(registry.revision).toBe(beforeRevision);
    expect(registry.getMetadata("shared.Node")?.title).toBe(
      "Authoritative TypeScript node"
    );
    expect(registry.getMetadataSource("shared.Node")).toBe("loaded-metadata");
  });
});

describe("applyCloudNodePolicy", () => {
  const originalProfile = process.env[CLOUD_PROFILE_ENV];
  const originalEnv = process.env[NODE_ENV_VAR];

  afterEach(() => {
    if (originalProfile === undefined) delete process.env[CLOUD_PROFILE_ENV];
    else process.env[CLOUD_PROFILE_ENV] = originalProfile;
    if (originalEnv === undefined) delete process.env[NODE_ENV_VAR];
    else process.env[NODE_ENV_VAR] = originalEnv;
  });

  function fullRegistry(): NodeRegistry {
    const registry = new NodeRegistry();
    registerBuiltInNodes(registry, {
      enabledOverrides: Object.fromEntries(
        BUILTIN_NODE_PACKS.map((p) => [p.id, true])
      )
    });
    return registry;
  }

  function expectCuratedSurface(registry: NodeRegistry): void {
    const remaining = registry.list();
    expect(remaining.length).toBeGreaterThan(0);
    // Every survivor is part of the curated cloud surface…
    for (const nodeType of remaining) {
      expect(isCloudNodeType(nodeType)).toBe(true);
    }
    // …nerdy namespaces are gone…
    for (const prefix of [
      "lib.sqlite.",
      "nodetool.data.",
      "nodetool.workspace.",
      "vector.",
      "huggingface."
    ]) {
      expect(remaining.some((t) => t.startsWith(prefix))).toBe(false);
    }
    // …developer-flavored agents are gone…
    expect(remaining).not.toContain("nodetool.agents.ShellAgent");
    // …the sandboxed Code node is allowlisted out of nodetool.code…
    expect(remaining).toContain("nodetool.code.Code");
    // …the text namespace stays whole (toolkit + ASR + utilities)…
    expect(remaining).toContain("nodetool.text.Prompt");
    expect(remaining).toContain("nodetool.text.Embedding");
    expect(remaining).toContain("nodetool.text.Concat");
    expect(remaining).toContain("nodetool.text.AutomaticSpeechRecognition");
    // …except the host-filesystem text nodes, which are denied…
    expect(remaining).not.toContain("nodetool.text.LoadTextFolder");
    expect(remaining).not.toContain("nodetool.text.SaveText");
    expect(remaining).not.toContain("nodetool.text.SaveTextFile");
    // …the same goes for every node that reads or writes a host path,
    // including the file/folder pickers in the otherwise-allowed input
    // namespace…
    for (const nodeType of CLOUD_HOST_FILE_NODES) {
      expect(remaining).not.toContain(nodeType);
    }
    // …while the asset-store equivalents stay, since assets are how the cloud
    // moves files…
    expect(remaining).toContain("nodetool.input.AssetFolderInput");
    expect(remaining).toContain("nodetool.image.LoadImageAssets");
    expect(remaining).toContain("nodetool.image.SaveImage");
    // …while the creative media core stays.
    expect(remaining.some((t) => t.startsWith("nodetool.image."))).toBe(true);
    expect(remaining.some((t) => t.startsWith("nodetool.audio."))).toBe(true);
  }

  /**
   * Drift guard. A path property the editor renders as a native picker is the
   * one host-filesystem shape that is visible in metadata, so a node added
   * later inside an allowed namespace is caught here rather than in
   * production. Nodes taking a plain string path look like any other string
   * node and can only be caught by naming them in CLOUD_HOST_FILE_NODES.
   */
  function expectNoNativePathPickers(registry: NodeRegistry): void {
    const offenders = registry.list().filter((nodeType) =>
      (registry.getMetadata(nodeType)?.properties ?? []).some((property) => {
        const kind = property.json_schema_extra?.["type"];
        return kind === "file_path" || kind === "folder_path";
      })
    );
    expect(offenders).toEqual([]);
  }

  it("is a no-op when the cloud profile is off", () => {
    delete process.env[CLOUD_PROFILE_ENV];
    delete process.env[NODE_ENV_VAR];
    const registry = fullRegistry();
    const before = registry.list().length;
    applyCloudNodePolicy(registry);
    expect(registry.list().length).toBe(before);
    // Nerdy namespaces survive without the profile.
    expect(registry.list().some((t) => t.startsWith("lib.sqlite."))).toBe(
      true
    );
  });

  it("prunes to the curated surface under NODETOOL_NODE_PROFILE=cloud", () => {
    delete process.env[NODE_ENV_VAR];
    process.env[CLOUD_PROFILE_ENV] = "cloud";
    const registry = fullRegistry();
    applyCloudNodePolicy(registry);
    expectCuratedSurface(registry);
  });

  it("prunes to the curated surface in production mode", () => {
    delete process.env[CLOUD_PROFILE_ENV];
    process.env[NODE_ENV_VAR] = "production";
    const registry = fullRegistry();
    applyCloudNodePolicy(registry);
    expectCuratedSurface(registry);
  });

  it("leaves no native file/folder picker in the cloud surface", () => {
    delete process.env[CLOUD_PROFILE_ENV];
    process.env[NODE_ENV_VAR] = "production";
    const registry = fullRegistry();
    // The pickers exist before the policy runs — otherwise this guard would
    // pass for the wrong reason.
    expect(registry.list()).toContain("nodetool.input.DocumentFileInput");
    applyCloudNodePolicy(registry);
    expectNoNativePathPickers(registry);
  });
});
