import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

import * as NODE_TYPE_CONSTANTS from "../nodeTypes";
import {
  CONSTANT_NODE_OPTIONS,
  INPUT_NODE_OPTIONS
} from "../../components/context_menus/paneNodeOptions";
import {
  constantForType,
  constantToInputType,
  inputToConstantType
} from "../../utils/NodeTypeMapping";
import type { TypeName } from "../../stores/ApiTypes";

/**
 * Node types the web references that no backend class declares, each with the
 * reason it is allowed to stay. Anything not listed here must exist, otherwise
 * the menu item / drop handler / node renderer that names it is a dead end the
 * user never sees fail.
 */
const KNOWN_ORPHANS: Record<string, string> = {
  "nodetool.workflows.base_node.Group":
    "editor-only container node, has no backend class",
  "nodetool.workflows.base_node.Comment":
    "editor-only annotation node, has no backend class",
  "fal.DynamicFal":
    "no backend class (the fal package declares fal.dynamic.FalDynamic); the fal schema node UI is orphaned — see the node-editor slop-fix report",
  "replicate.DynamicReplicate":
    "no backend class; the replicate schema node UI is orphaned — see the node-editor slop-fix report"
};

const PACKAGES_DIR = resolve(__dirname, "../../../../packages");
/**
 * The three ways a package spells a node id: `static readonly nodeType = "…"`,
 * a factory config's `nodeType: "…"`, and a `const X_NODE_TYPE = "…"` the class
 * then assigns.
 */
const NODE_TYPE_DECLARATION = /(?:nodeType|NODE_TYPE)\s*[=:]\s*"([^"]+)"/g;

function collectTsFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsFiles(full, out);
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
}

function declaredNodeTypes(): Set<string> {
  const files: string[] = [];
  for (const pkg of readdirSync(PACKAGES_DIR)) {
    const src = join(PACKAGES_DIR, pkg, "src");
    try {
      if (!statSync(src).isDirectory()) {
        continue;
      }
    } catch {
      // Not a package directory (README.md, CLAUDE.md, …).
      continue;
    }
    collectTsFiles(src, files);
  }
  const types = new Set<string>();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(NODE_TYPE_DECLARATION)) {
      types.add(match[1]);
    }
  }
  return types;
}

const declared = declaredNodeTypes();

const expectDeclared = (nodeType: string, where: string) => {
  if (KNOWN_ORPHANS[nodeType]) {
    return;
  }
  if (!declared.has(nodeType)) {
    throw new Error(
      `${where} references "${nodeType}", which no packages/*/src node class declares.`
    );
  }
};

describe("web node-type identifiers exist in the backend registry", () => {
  it("reads the backend node classes", () => {
    // A scan that matched nothing would let every assertion below pass.
    expect(declared.size).toBeGreaterThan(300);
    expect(declared.has("nodetool.constant.String")).toBe(true);
  });

  it("constants/nodeTypes.ts", () => {
    const literals = Object.entries(NODE_TYPE_CONSTANTS).filter(
      ([name, value]) =>
        name.endsWith("_NODE_TYPE") && typeof value === "string"
    );
    expect(literals.length).toBeGreaterThan(10);
    for (const [name, value] of literals) {
      expectDeclared(value as string, `constants/nodeTypes.ts:${name}`);
    }
  });

  it("PaneContextMenu constant and input options", () => {
    expect(CONSTANT_NODE_OPTIONS.length).toBeGreaterThan(0);
    expect(INPUT_NODE_OPTIONS.length).toBeGreaterThan(0);
    for (const option of [...CONSTANT_NODE_OPTIONS, ...INPUT_NODE_OPTIONS]) {
      expectDeclared(option.nodeType, `PaneContextMenu "${option.label}"`);
    }
  });

  it("NodeTypeMapping drag-and-drop targets", () => {
    const assetTypes: TypeName[] = [
      "str",
      "text",
      "dataframe",
      "int",
      "float",
      "bool",
      "image",
      "video",
      "audio",
      "list",
      "folder",
      "document",
      "model_3d"
    ];
    for (const type of assetTypes) {
      const nodeType = constantForType(type);
      expect(nodeType).not.toBeNull();
      expectDeclared(nodeType as string, `constantForType("${type}")`);
    }
  });

  it("NodeTypeMapping constant <-> input conversions", () => {
    const constants = [
      "nodetool.constant.String",
      "nodetool.constant.Integer",
      "nodetool.constant.Float",
      "nodetool.constant.Bool",
      "nodetool.constant.Image",
      "nodetool.constant.Video",
      "nodetool.constant.Audio",
      "nodetool.constant.Document",
      "nodetool.constant.DataFrame",
      "nodetool.constant.Model3D"
    ];
    for (const constantType of constants) {
      expectDeclared(constantType, "constantToInputType source");
      const inputType = constantToInputType(constantType);
      expect(inputType).not.toBeNull();
      expectDeclared(inputType as string, `constantToInputType("${constantType}")`);
      expect(inputToConstantType(inputType as string)).toBe(constantType);
    }
  });
});
