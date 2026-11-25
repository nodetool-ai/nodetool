import { describe, expect, it } from "vitest";
import { isSearchIndexerProcess, searchIndexerMode } from "../src/search-indexer.js";

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
