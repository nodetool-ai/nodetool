import { IFuseOptions } from "fuse.js";

export interface ExtendedFuseOptions<T> extends Omit<IFuseOptions<T>, "keys"> {
  keys?: Array<{ name: string; weight: number }>;
  findAllMatches?: boolean;
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
  findAllMatches: true
};
