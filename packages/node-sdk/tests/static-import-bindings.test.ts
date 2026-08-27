import { describe, expect, it } from "vitest";

import { parseCodeBody, staticImportBindings } from "../src/code-analysis.js";

function bindings(code: string) {
  const parsed = parseCodeBody(code);
  if ("error" in parsed) throw new Error(parsed.error);
  return staticImportBindings(parsed.statements);
}

describe("staticImportBindings", () => {
  it("reports the exported names a body pulls off each module", () => {
    expect(
      bindings(
        'import { generate_image, find_model } from "@nodetool-ai/sandbox-nodetool/media";'
      )
    ).toEqual([
      {
        specifier: "@nodetool-ai/sandbox-nodetool/media",
        named: ["generate_image", "find_model"]
      }
    ]);
  });

  it("reports the exported name, not the local alias", () => {
    expect(bindings('import { parse as p } from "@acme/x";')).toEqual([
      { specifier: "@acme/x", named: ["parse"] }
    ]);
  });

  it("reports no names for a default or namespace import", () => {
    expect(
      bindings('import media from "@a/b";\nimport * as all from "@c/d";')
    ).toEqual([
      { specifier: "@a/b", named: [] },
      { specifier: "@c/d", named: [] }
    ]);
  });

  it("reports a string-literal import name", () => {
    expect(bindings('import { "a-b" as ab } from "@a/b";')).toEqual([
      { specifier: "@a/b", named: ["a-b"] }
    ]);
  });

  it("ignores a side-effect import's absent name list and dynamic import", () => {
    expect(bindings('import "@a/b";\nconst x = () => import("@c/d");')).toEqual(
      [{ specifier: "@a/b", named: [] }]
    );
  });
});
