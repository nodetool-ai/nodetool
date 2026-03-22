import { IFuseOptions, FuseResult, FuseResultMatch } from "fuse.js";

// Extend Fuse options type
export interface ExtendedFuseOptions<T> extends Omit<IFuseOptions<T>, "keys"> {
  keys?: Array<{ name: string; weight: number }>;
  tokenize?: boolean;
  matchAllTokens?: boolean;
  findAllMatches?: boolean;
}

// Re-export FuseResultMatch as FuseMatch for convenience
export type FuseMatch = FuseResultMatch;

// Type for extended Fuse result with proper match typing
export interface TypedFuseResult<T> extends Omit<FuseResult<T>, 'matches'> {
  matches?: readonly FuseMatch[];
}

export const fuseOptions: ExtendedFuseOptions<unknown> = {
  keys: [
    // Relative importance
    { name: "title", weight: 0.8 },
    { name: "namespace", weight: 0.4 },
    { name: "tags", weight: 0.4 },
    { name: "description", weight: 0.3 }
  ],
  includeMatches: true,
  ignoreLocation: true,
  threshold: 0.3,
  distance: 2,
  includeScore: true,
  shouldSort: true,
  minMatchCharLength: 3,
  useExtendedSearch: true,
  tokenize: false,
  matchAllTokens: false,
  findAllMatches: true
};
