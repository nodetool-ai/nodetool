import { afterEach, describe, expect, it } from "vitest";
import {
  embedLibraryQuery,
  embeddingSpace,
  setLibraryQueryEmbedder
} from "@nodetool-ai/search-services";
import {
  installLibraryQueryEmbedder,
  isSearchIndexerProcess,
  searchIndexerMode,
  type SearchIndexerSupervisor
} from "../src/search-indexer.js";

afterEach(() => {
  setLibraryQueryEmbedder(null);
});

describe("search indexer mode", () => {
  it("defaults to a supervised child", () => {
    expect(searchIndexerMode({})).toBe("child");
    expect(searchIndexerMode({ NODETOOL_SEARCH_INDEXER: "bogus" })).toBe("child");
  });

  it("reads external and off, ignoring case and spaces", () => {
    expect(searchIndexerMode({ NODETOOL_SEARCH_INDEXER: " External " })).toBe("external");
    expect(searchIndexerMode({ NODETOOL_SEARCH_INDEXER: "off" })).toBe("off");
  });

  it("recognizes the forked indexer by its role", () => {
    expect(isSearchIndexerProcess({ NODETOOL_PROCESS_ROLE: "search-indexer" })).toBe(true);
    expect(isSearchIndexerProcess({})).toBe(false);
  });
});

describe("query embedding for library search", () => {
  const local = embeddingSpace("transformers_js", "Xenova/all-MiniLM-L6-v2");

  it("asks the indexer process for a local model's query vector", async () => {
    const asked: string[] = [];
    const indexer: SearchIndexerSupervisor = {
      stop: () => undefined,
      embedQuery: async (text) => {
        asked.push(text);
        return [3, 4];
      }
    };
    installLibraryQueryEmbedder(indexer);
    expect(await embedLibraryQuery("a red fox", local, "u1")).toEqual([0.6, 0.8]);
    expect(asked).toEqual(["a red fox"]);
  });

  it("never loads a local model in the server: without the indexer the answer is null", async () => {
    installLibraryQueryEmbedder(null);
    expect(await embedLibraryQuery("a red fox", local, "u1")).toBeNull();
  });
});
