import {
  matchesSearch,
  otherMatchingTabs,
  settingsTabLabel,
  tabHasMatches
} from "../settingsSearch";

describe("matchesSearch", () => {
  it("shows every row when the query is empty", () => {
    expect(matchesSearch("mcp servers", "")).toBe(true);
    expect(matchesSearch("mcp servers", "   ")).toBe(true);
  });

  it("matches a substring without regard to case", () => {
    expect(matchesSearch("MCP Servers Claude Desktop", "mcp")).toBe(true);
    expect(matchesSearch("MCP Servers Claude Desktop", "desktop")).toBe(true);
    expect(matchesSearch("MCP Servers Claude Desktop", "openai")).toBe(false);
  });
});

describe("tabHasMatches", () => {
  it("routes provider names to Providers", () => {
    expect(tabHasMatches("providers", "openai")).toBe(true);
    expect(tabHasMatches("general", "openai")).toBe(false);
  });

  it("routes editor and canvas terms to General", () => {
    expect(tabHasMatches("general", "snap")).toBe(true);
    expect(tabHasMatches("general", "autosave")).toBe(true);
    expect(tabHasMatches("providers", "autosave")).toBe(false);
  });

  it("routes MCP and folders to Integrations", () => {
    expect(tabHasMatches("integrations", "mcp")).toBe(true);
    expect(tabHasMatches("integrations", "folders")).toBe(true);
    expect(tabHasMatches("general", "mcp")).toBe(false);
  });
});

describe("otherMatchingTabs", () => {
  it("returns nothing when search is empty", () => {
    expect(otherMatchingTabs("general", "")).toEqual([]);
  });

  it("names the other tabs that match", () => {
    expect(otherMatchingTabs("general", "openai")).toEqual(["providers"]);
    expect(otherMatchingTabs("providers", "mcp")).toEqual(["integrations"]);
  });

  it("exposes human labels for those tabs", () => {
    expect(settingsTabLabel("providers")).toBe("Models & Providers");
  });
});
