/**
 * The library packs NodeTool ships, by specifier.
 *
 * Presence is never assumed. A workflow can declare `@nodetool-ai/sandbox-yaml`
 * on a machine where nobody installed it, and the catalog answers "not
 * installed" — true, and useless. This table is what turns that answer into the
 * next step: install this package. It is a list of names, not a resolution
 * path — nothing here loads, resolves, or vouches for a pack.
 */

/** A pack this repo ships as a config-only sandbox module. */
export interface BridgePack {
  /** The import specifier guest code uses. */
  readonly specifier: string;
  /** The npm package to install, which for a single-module pack is the same string. */
  readonly packName: string;
  /** The npm library behind the module. */
  readonly library: string;
  /**
   * Where the library runs.
   *
   * `guest` — compiled into the QuickJS guest by the sandbox compiler.
   * `host` — a NodeTool-implemented host function set behind a generated
   * facade, because the library needs what the guest lacks, or carries a limit
   * the guest could not enforce.
   */
  readonly runs: "guest" | "host";
}

export const BRIDGE_PACKS: readonly BridgePack[] = [
  {
    specifier: "@nodetool-ai/sandbox-csv",
    packName: "@nodetool-ai/sandbox-csv",
    library: "papaparse",
    runs: "host"
  },
  {
    specifier: "@nodetool-ai/sandbox-dates",
    packName: "@nodetool-ai/sandbox-dates",
    library: "date-fns",
    runs: "guest"
  },
  {
    specifier: "@nodetool-ai/sandbox-diff",
    packName: "@nodetool-ai/sandbox-diff",
    library: "diff",
    runs: "host"
  },
  {
    specifier: "@nodetool-ai/sandbox-html",
    packName: "@nodetool-ai/sandbox-html",
    library: "cheerio + turndown",
    runs: "host"
  },
  {
    specifier: "@nodetool-ai/sandbox-ocr",
    packName: "@nodetool-ai/sandbox-ocr",
    library: "tesseract.js",
    runs: "host"
  },
  {
    specifier: "@nodetool-ai/sandbox-tfjs",
    packName: "@nodetool-ai/sandbox-tfjs",
    library: "@tensorflow/tfjs",
    runs: "host"
  },
  {
    specifier: "@nodetool-ai/sandbox-xlsx",
    packName: "@nodetool-ai/sandbox-xlsx",
    library: "exceljs",
    runs: "host"
  },
  {
    specifier: "@nodetool-ai/sandbox-xml",
    packName: "@nodetool-ai/sandbox-xml",
    library: "fast-xml-parser",
    runs: "host"
  },
  {
    specifier: "@nodetool-ai/sandbox-yaml",
    packName: "@nodetool-ai/sandbox-yaml",
    library: "js-yaml",
    runs: "guest"
  },
  {
    specifier: "@nodetool-ai/sandbox-zip",
    packName: "@nodetool-ai/sandbox-zip",
    library: "fflate",
    runs: "host"
  }
];

const BY_SPECIFIER = new Map(BRIDGE_PACKS.map((pack) => [pack.specifier, pack]));

/** The bridge pack a specifier names, or undefined for anything else. */
export function bridgePackFor(specifier: string): BridgePack | undefined {
  return BY_SPECIFIER.get(specifier);
}

/**
 * What to do about a specifier no installed pack offers, when NodeTool ships one
 * under that name. Anything else gets no hint — a guess at a package name is
 * worse than silence.
 */
export function installHintFor(specifier: string): string | undefined {
  const pack = bridgePackFor(specifier);
  return pack === undefined ? undefined : `Install ${pack.packName} to use it.`;
}
