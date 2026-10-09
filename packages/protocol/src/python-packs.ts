/**
 * Catalog of the Python node packs the package manager offers.
 *
 * Each pack installs from PyPI under the name of its GitHub repo. The catalog ships with the
 * app, so adding or removing a pack is a change to this file. List only packs that are
 * published on PyPI: an entry without a release fails on Install.
 *
 * Every pack releases on its own schedule. The desktop app never pins a pack to the app
 * version. Compatibility with the app is the bridge protocol floor
 * (`MIN_NODETOOL_CORE_VERSION`), which applies to `nodetool-core` only.
 */

/** `<process.platform>-<process.arch>`, for example `darwin-arm64`. */
export type PythonPackPlatform = `${string}-${string}`;

export interface PythonNodePack {
  /** Display name shown in the package manager. */
  name: string;
  /** GitHub `owner/repo`. Stable id for install, update and uninstall. */
  repo_id: string;
  /** Short user-facing description of what the pack provides. */
  description: string;
  /** Python module prefixes of the node types this pack registers. */
  namespaces: readonly string[];
  /**
   * Platforms the pack runs on, as `<process.platform>-<process.arch>`. Absent
   * means every platform. The package manager hides the pack elsewhere and
   * refuses to install it.
   */
  platforms?: readonly PythonPackPlatform[];
  /** What the pack needs, named in the refusal on an unsupported platform. */
  platformRequirement?: string;
}

export const PYTHON_NODE_PACKS: readonly PythonNodePack[] = [
  {
    name: "Core",
    repo_id: "nodetool-ai/nodetool-core",
    description:
      "Essential NodeTool core nodes and shared runtime components. Install this package in every NodeTool environment.",
    namespaces: []
  },
  {
    name: "MLX",
    repo_id: "nodetool-ai/nodetool-mlx",
    description: "Apple Silicon MLX nodes for NodeTool.",
    namespaces: ["nodetool.nodes.mlx"],
    platforms: ["darwin-arm64"],
    platformRequirement: "a Mac with Apple Silicon"
  },
  {
    name: "HuggingFace",
    repo_id: "nodetool-ai/nodetool-huggingface",
    description:
      "Use a growing list of HuggingFace models from categories like vision, audio, classification, segmentation and more.",
    namespaces: ["nodetool.nodes.huggingface"],
    // PyTorch 2.14, which the pack pins, has no Intel Mac (darwin-x64) build.
    platforms: [
      "darwin-arm64",
      "linux-x64",
      "linux-arm64",
      "win32-x64",
      "win32-arm64"
    ],
    platformRequirement:
      "a Mac with Apple Silicon or a Windows or Linux PC. PyTorch has no build for Intel Macs"
  },
  {
    name: "Wan2GP",
    repo_id: "nodetool-ai/nodetool-wan2gp",
    description:
      "Generate video with a Wan2GP server you run yourself. The nodes call it over MCP, so no model loads inside NodeTool.",
    namespaces: ["nodetool.nodes.wan2gp"]
  }
];

/** The catalog pack with this GitHub `owner/repo` id, if any. */
export function findPythonNodePack(
  repoId: string
): PythonNodePack | undefined {
  const wanted = repoId.toLowerCase();
  return PYTHON_NODE_PACKS.find((pack) => pack.repo_id.toLowerCase() === wanted);
}

/**
 * Whether `pack` runs on the given platform and architecture (Node's
 * `process.platform` and `process.arch` values).
 */
export function isPythonPackSupported(
  pack: PythonNodePack,
  platform: string,
  arch: string
): boolean {
  return !pack.platforms || pack.platforms.includes(`${platform}-${arch}`);
}
