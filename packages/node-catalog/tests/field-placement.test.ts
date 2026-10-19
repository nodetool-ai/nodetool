import { describe, expect, it } from "vitest";
import { readCatalogNodes } from "../src/index.js";

// Types a node cannot do anything useful with unless something connects them.
const CONNECTED_TYPES = new Set([
  "image",
  "image_mask",
  "video",
  "audio",
  "model_3d",
  "document",
  "dataframe",
  "message"
]);

type PropertyType = { type: string; type_args?: PropertyType[] };

const baseTypes = (t: PropertyType): string[] =>
  t.type === "list" || t.type === "union" || t.type === "optional"
    ? (t.type_args ?? []).flatMap((arg) => (arg.type === "list" ? [] : [arg.type]))
    : [t.type];

describe("node field placement", () => {
  const nodes = readCatalogNodes();

  it("declares an inline or input field list on every node", () => {
    const missing = nodes
      .filter(
        (node) =>
          node.metadata.inline_fields === undefined &&
          node.metadata.input_fields === undefined
      )
      .map((node) => node.node_type);
    expect(nodes.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it("gives every property at most one placement", () => {
    const overlaps = nodes.flatMap((node) => {
      const inline = new Set(node.metadata.inline_fields ?? []);
      return (node.metadata.input_fields ?? [])
        .filter((name) => inline.has(name))
        .map((name) => `${node.node_type}.${name}`);
    });
    expect(overlaps).toEqual([]);
  });

  it("only places properties the node declares", () => {
    const unknown = nodes.flatMap((node) => {
      const names = new Set(node.metadata.properties.map((p) => p.name));
      return [
        ...(node.metadata.inline_fields ?? []),
        ...(node.metadata.input_fields ?? [])
      ]
        .filter((name) => !names.has(name))
        .map((name) => `${node.node_type}.${name}`);
    });
    expect(unknown).toEqual([]);
  });

  it("shows a handle for every media and message input", () => {
    let checked = 0;
    const hidden: string[] = [];
    for (const node of nodes) {
      const placed = new Set([
        ...(node.metadata.inline_fields ?? []),
        ...(node.metadata.input_fields ?? [])
      ]);
      for (const p of node.metadata.properties) {
        const types = baseTypes(p.type as PropertyType);
        if (!types.some((t) => CONNECTED_TYPES.has(t))) {
          continue;
        }
        checked += 1;
        if (!placed.has(p.name)) {
          hidden.push(`${node.node_type}.${p.name}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(hidden).toEqual([]);
  });
});
