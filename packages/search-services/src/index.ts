export {
  EXTRACTOR_VERSION,
  assetKind,
  extractAsset,
  extractDocument,
  type ExtractedChunk,
  type ExtractedItem
} from "./extract.js";
export {
  ensureLibraryIndexed,
  flushLibraryIndexWrites,
  reconcileLibraryIndex,
  startLibraryIndexWrites,
  stopLibraryIndexWrites,
  type ReconcileResult
} from "./sync.js";
export {
  libraryIndexState,
  queryTerms,
  searchLibrary,
  snippetOf,
  type LibrarySearchFilter,
  type LibrarySearchHit,
  type LibrarySearchIndexState,
  type LibrarySearchMatch,
  type LibrarySearchRequest,
  type LibrarySearchResult
} from "./query.js";
export {
  ASSET_SEARCH_KINDS,
  searchAssets,
  type AssetSearchOptions,
  type AssetSearchResult
} from "./assets.js";
