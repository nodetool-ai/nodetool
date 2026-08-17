/**
 * Optional node packs — node-menu visibility grouping.
 *
 * NodeTool ships hundreds of nodes. Many live in advanced or niche namespaces
 * (file system, databases, document conversion, raw image processing, code
 * execution, third-party integrations, …) that clutter the node menu for the
 * average user without adding value to their first workflows.
 *
 * This catalog groups those namespaces into named "optional packs". They are
 * hidden from the node-menu namespace tree by default and revealed per-pack
 * from the menu (see {@link OptionalPacksSection}). Hiding is purely a menu
 * concern — the nodes stay registered and usable: existing workflows keep
 * working, drag-drop/paste still resolves them, and search still finds them.
 * Only the browsable namespace tree is decluttered.
 *
 * This is intentionally the single place to tune what counts as "niche". Add a
 * namespace to a pack here and it disappears from the default menu; the user
 * can flip it back on with one click.
 */

interface OptionalNodePack {
  /** Stable id persisted in the enabled list. Never rename. */
  id: string;
  /** Display name shown in the node menu. */
  label: string;
  /** One-line description of what the pack adds. */
  description: string;
  /**
   * Namespace prefixes this pack owns. A node namespace belongs to the pack
   * when it equals a prefix or nests under it (e.g. `lib.image` owns
   * `lib.image.color`).
   */
  namespaces: readonly string[];
}

/**
 * The optional packs, ordered roughly by how commonly they're wanted. Anything
 * not listed here (core `nodetool.*`, the LLM providers, search, vector, …)
 * stays visible by default.
 */
export const OPTIONAL_NODE_PACKS: readonly OptionalNodePack[] = [
  {
    id: "documents",
    label: "Documents",
    description: "Rasterize a PDF.",
    namespaces: ["lib.pdf"]
  },
  {
    id: "imaging",
    label: "Image & Graphics",
    description:
      "Pixel-level image processing — filters, effects, masks, warps — plus SVG and charts.",
    namespaces: ["lib.image", "lib.svg", "lib.charts"]
  },
  {
    id: "audio_dsp",
    label: "Audio Processing",
    description: "Low-level audio analysis and signal-processing utilities.",
    namespaces: ["lib.audio"]
  },
  {
    id: "web",
    label: "Web & Scraping",
    description: "Headless browser and media download.",
    namespaces: ["lib.browser", "lib.video.download"]
  },
  {
    id: "data_stores",
    label: "Files, Cloud & Databases",
    description: "Local filesystem, secrets, and SQLite.",
    namespaces: ["lib.os", "lib.secret", "lib.sqlite"]
  },
  {
    id: "integrations",
    label: "Integrations & Messaging",
    description: "Email and Discord / Telegram message triggers.",
    namespaces: ["lib.mail", "messaging"]
  },
  {
    id: "text_data",
    label: "Text & Data Utilities",
    description: "NLP and grids.",
    namespaces: ["lib.nlp", "lib.grid"]
  },
  {
    id: "developer",
    label: "Developer Tools",
    description: "Run code, ComfyUI, and internal test nodes.",
    namespaces: ["nodetool.code", "lib.comfy", "nodetool.test"]
  }
];

/** True when `namespace` equals `prefix` or nests directly under it. */
const matchesPrefix = (namespace: string, prefix: string): boolean =>
  namespace === prefix || namespace.startsWith(`${prefix}.`);

/**
 * The optional pack that owns `namespace`, if any. Namespaces not covered by
 * any pack are always visible and return `undefined`.
 */
export const getOptionalNodePackForNamespace = (
  namespace: string
): OptionalNodePack | undefined =>
  OPTIONAL_NODE_PACKS.find((pack) =>
    pack.namespaces.some((prefix) => matchesPrefix(namespace, prefix))
  );

/** Whether `namespace` belongs to any optional pack. */
export const isOptionalNamespace = (namespace: string): boolean =>
  getOptionalNodePackForNamespace(namespace) !== undefined;

/**
 * Whether `namespace` should be hidden from the node-menu tree given the set of
 * pack ids the user has turned on. A namespace is hidden only when it belongs
 * to an optional pack that is not enabled.
 */
export const isNamespaceHiddenByOptionalPacks = (
  namespace: string,
  enabledPackIds: ReadonlySet<string>
): boolean => {
  const pack = getOptionalNodePackForNamespace(namespace);
  return pack !== undefined && !enabledPackIds.has(pack.id);
};
