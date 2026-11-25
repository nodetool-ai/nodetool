/**
 * Catalog of the Python node packs the package manager offers.
 *
 * Each pack installs from PyPI under the name of its GitHub repo. The catalog ships with the
 * app, so adding or removing a pack is a change to this file. List only packs that are
 * published on PyPI: an entry without a release fails on Install. An engine a
 * pack imports but cannot depend on, because it is not on PyPI, goes in the
 * pack's `requirements`.
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
  /**
   * Lowest macOS major version the pack's wheels install on. The package
   * manager hides the pack on older macOS and refuses to install it.
   */
  minMacOSVersion?: number;
  /** What the pack needs, named in the refusal on an unsupported platform. */
  platformRequirement?: string;
  /**
   * PEP 508 requirements installed in the same resolve as the pack, on every
   * install and update. For engines that are not on PyPI, so the pack cannot
   * declare them: PyPI refuses a release with a direct URL dependency. Pin
   * each URL to a commit archive, which needs no git on the user's machine.
   */
  requirements?: readonly string[];
}

/**
 * ltx-2-mlx v0.18.0 (MIT), the LTX-2.5 engine of nodetool-mlx's video nodes.
 * Its packages are not on PyPI.
 */
const LTX_2_MLX_ARCHIVE =
  "https://github.com/dgrauet/ltx-2-mlx/archive/b82b97e3d000e01361f8cfcb745244b15b89a521.tar.gz";

/** A declared Python-pack namespace, including its node type suffix. */
export function isPythonNodeType(nodeType: string): boolean {
  const qualified = nodeType.startsWith("nodetool.nodes.") ? nodeType : `nodetool.nodes.${nodeType}`;
  return PYTHON_NODE_PACKS.some((pack) => pack.namespaces.some((namespace) =>
    qualified === namespace || qualified.startsWith(`${namespace}.`)
  ));
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
    // MLX ships macOS 14+ wheels only.
    minMacOSVersion: 14,
    platformRequirement: "a Mac with Apple Silicon and macOS 14 or newer",
    requirements: [
      `ltx-core-mlx @ ${LTX_2_MLX_ARCHIVE}#subdirectory=packages/ltx-core-mlx`,
      `ltx-pipelines-mlx @ ${LTX_2_MLX_ARCHIVE}#subdirectory=packages/ltx-pipelines-mlx`
    ]
  },
  {
    name: "HuggingFace",
    repo_id: "nodetool-ai/nodetool-huggingface",
    description:
      "Use a growing list of HuggingFace models from categories like vision, audio, classification, segmentation and more.",
    namespaces: ["nodetool.nodes.huggingface"],
    // PyTorch 2.14, which the pack pins, has no Intel Mac (darwin-x64) build,
    // and its macOS wheels need macOS 14.
    platforms: [
      "darwin-arm64",
      "linux-x64",
      "linux-arm64",
      "win32-x64",
      "win32-arm64"
    ],
    minMacOSVersion: 14,
    platformRequirement:
      "a Mac with Apple Silicon and macOS 14 or newer, or a Windows or Linux PC. PyTorch has no build for Intel Macs or older macOS"
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
 * `process.platform` and `process.arch` values). On macOS, `osVersion` is the
 * product version (`13.6.1`). An unknown version passes the macOS check.
 */
export function isPythonPackSupported(
  pack: PythonNodePack,
  platform: string,
  arch: string,
  osVersion?: string
): boolean {
  if (pack.platforms && !pack.platforms.includes(`${platform}-${arch}`)) {
    return false;
  }
  if (platform === "darwin" && pack.minMacOSVersion !== undefined && osVersion) {
    const major = Number.parseInt(osVersion, 10);
    if (Number.isFinite(major) && major < pack.minMacOSVersion) {
      return false;
    }
  }
  return true;
}
