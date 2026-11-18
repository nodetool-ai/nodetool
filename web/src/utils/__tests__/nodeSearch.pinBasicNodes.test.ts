/**
 * @jest-environment node
 */
import type { NodeMetadata } from "../../stores/ApiTypes";
import { computeSearchResults } from "../nodeSearch";

const makeNode = (
  node_type: string,
  title: string,
  description = ""
): NodeMetadata =>
  ({
    title,
    node_type,
    namespace: node_type.split(".").slice(0, -1).join("."),
    description,
    properties: [],
    outputs: [],
    layout: "default"
  }) as unknown as NodeMetadata;

// The plain Text node is titled "String", so ranking alone puts every node
// with "Text" in its title above it.
const CATALOG: NodeMetadata[] = [
  makeNode("nodetool.text.Concat", "Concat Text", "Join text"),
  makeNode("nodetool.text.SaveText", "Save Text", "Save text to a file"),
  makeNode("nodetool.text.LoadTextFolder", "Load Text Folder", "Read text"),
  makeNode("nodetool.text.FilterString", "Filter Text", "Filter text"),
  makeNode("nodetool.constant.String", "String", "A string constant.\n text"),
  makeNode("nodetool.agents.Agent", "Agent", "Chat with an LLM"),
  makeNode("nodetool.image.TextToImage", "Text To Image", "Make an image"),
  makeNode("nodetool.image.ImageToImage", "Image To Image", "Edit an image"),
  makeNode("lib.image.enhance.Sharpen", "Sharpen Image", "Sharpen an image"),
  makeNode("nodetool.image.Upscale", "Upscale", "Upscale an image")
];

const search = (term: string, path: string[] = []) =>
  computeSearchResults(CATALOG, term, path).sortedResults;

describe("computeSearchResults basic pinning", () => {
  it("lists Text and Generate text first for a search for text", () => {
    const results = search("text");
    expect(results.slice(0, 2).map((node) => node.node_type)).toEqual([
      "nodetool.constant.String",
      "nodetool.agents.Agent"
    ]);
    expect(results[0].searchInfo?.pinnedAsBasic).toBe(true);
    expect(results[1].searchInfo?.pinnedAsBasic).toBe(true);
    expect(results[2].searchInfo?.pinnedAsBasic).toBeUndefined();
  });

  it("keeps the specialized matches after the basics, each once", () => {
    const types = search("text").map((node) => node.node_type);
    expect(types).toContain("nodetool.text.Concat");
    expect(new Set(types).size).toBe(types.length);
  });

  it("pins the editing basic for edit image", () => {
    expect(search("edit image")[0].node_type).toBe(
      "nodetool.image.ImageToImage"
    );
  });

  it("does not pin anything for a specialized search", () => {
    const results = search("upscale");
    expect(results[0].node_type).toBe("nodetool.image.Upscale");
    expect(results.some((node) => node.searchInfo?.pinnedAsBasic)).toBe(false);
  });

  it("leaves out a basic node the namespace filter excludes", () => {
    const types = search("text", ["nodetool", "text"]).map(
      (node) => node.node_type
    );
    expect(types).not.toContain("nodetool.constant.String");
    expect(types).not.toContain("nodetool.agents.Agent");
  });
});
