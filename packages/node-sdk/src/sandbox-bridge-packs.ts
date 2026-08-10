/**
 * The bridge packs NodeTool ships, by specifier.
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
  /** The npm library the module is compiled from. */
  readonly library: string;
}

export const BRIDGE_PACKS: readonly BridgePack[] = [
  {
    specifier: "@nodetool-ai/sandbox-dates",
    packName: "@nodetool-ai/sandbox-dates",
    library: "date-fns"
  },
  {
    specifier: "@nodetool-ai/sandbox-yaml",
    packName: "@nodetool-ai/sandbox-yaml",
    library: "js-yaml"
  },
  {
    specifier: "@nodetool-ai/sandbox-zip",
    packName: "@nodetool-ai/sandbox-zip",
    library: "fflate"
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
