/**
 * Catalog of the Python node packs the package manager offers.
 *
 * Each pack installs from PyPI under the name of its GitHub repo. The catalog ships with the
 * app, so adding or removing a pack is a change to this file.
 */

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
   * Released on its own schedule. Other `nodetool-*` packs share the app
   * version, and the desktop app pins them to it at startup.
   */
  independentVersion?: boolean;
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
    name: "Apple",
    repo_id: "nodetool-ai/nodetool-apple",
    description:
      "Automate macOS Calendar, Notes, Messages, Reminders, Dictionary, screenshots and system TTS.",
    namespaces: ["nodetool.nodes.apple"]
  },
  {
    name: "MLX",
    repo_id: "nodetool-ai/nodetool-mlx",
    description: "Apple Silicon MLX nodes for NodeTool.",
    namespaces: ["nodetool.nodes.mlx"]
  },
  {
    name: "HuggingFace",
    repo_id: "nodetool-ai/nodetool-huggingface",
    description:
      "Use a growing list of HuggingFace models from categories like vision, audio, classification, segmentation and more.",
    namespaces: ["nodetool.nodes.huggingface"]
  },
  {
    name: "ML",
    repo_id: "nodetool-ai/nodetool-lib-ml",
    description:
      "Add nodes for scikit-learn and statsmodels: estimators, classification, clustering, regression.",
    namespaces: ["nodetool.nodes.lib.ml"]
  },
  {
    name: "Wan2GP",
    repo_id: "nodetool-ai/nodetool-wan2gp",
    description:
      "Generate video with a Wan2GP server you run yourself. The nodes call it over MCP, so no model loads inside NodeTool.",
    namespaces: ["nodetool.nodes.wan2gp"],
    independentVersion: true
  }
];

/** The catalog pack with this GitHub `owner/repo` id, if any. */
export function findPythonNodePack(
  repoId: string
): PythonNodePack | undefined {
  const wanted = repoId.toLowerCase();
  return PYTHON_NODE_PACKS.find((pack) => pack.repo_id.toLowerCase() === wanted);
}
