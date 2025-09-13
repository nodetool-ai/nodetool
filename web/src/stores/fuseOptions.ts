import { IFuseOptions } from "fuse.js";

// Extend Fuse options type
export interface ExtendedFuseOptions<T> extends Omit<IFuseOptions<T>, "keys"> {
  keys?: Array<{ name: string; weight: number }>;
  tokenize?: boolean;
  matchAllTokens?: boolean;
  findAllMatches?: boolean;
}

export const fuseOptions: ExtendedFuseOptions<any> = {
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
