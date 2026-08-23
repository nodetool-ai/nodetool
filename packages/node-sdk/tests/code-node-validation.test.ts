import { describe, it, expect } from "vitest";
import { validateCodeNodeBody } from "../src/code-node-validation.js";
import { collectBoundNames, freeIdentifiers, parseCodeBody } from "../src/code-analysis.js";
import type { SandboxModuleStatus } from "@nodetool-ai/protocol";
import { refuseSandboxDelivery } from "@nodetool-ai/runtime";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

/** Codes of the issues a body produces, for terse assertions. */
function codes(
  input: Parameters<typeof validateCodeNodeBody>[0]
): string[] {
  return validateCodeNodeBody(input).map((issue) => issue.code);
}

const body = (
  code: string,
  availableInputs: string[] = [],
  declaredOutputs: string[] = [],
  connectedOutputs: string[] = []
) => ({ code, availableInputs, declaredOutputs, connectedOutputs });

describe("validateCodeNodeBody", () => {
  it("accepts a body that reads its inputs and returns its outputs", () => {
    expect(
      validateCodeNodeBody(
        body(
          "const total = inputs.a + inputs.b;\nreturn { total };",
          ["a", "b"],
          ["total"]
        )
      )
    ).toEqual([]);
  });

  it("reports a syntax error and stops there", () => {
    const issues = validateCodeNodeBody(
      body("const x = ;\nreturn { out: x };", [], ["out"])
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("code_syntax");
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toMatch(/does not parse/);
  });

  it("rejects module declarations the async body cannot contain", () => {
    expect(
      codes(body("import fs from 'fs';\nreturn { out: 1 };", [], ["out"]))
    ).toContain("code_module");
  });

  it("flags a name that is neither a sandbox API nor an input", () => {
    const issues = validateCodeNodeBody(
      body("return { out: lodash.sum(inputs.values) };", ["values"], ["out"])
    );
    const undefinedName = issues.find((i) => i.code === "code_undefined_name");
    expect(undefinedName?.severity).toBe("error");
    expect(undefinedName?.message).toContain('"lodash"');
  });

  it("accepts sandbox bridges, inputs, and the persistent state object", () => {
    expect(
      codes(
        body(
          `const res = await fetch(inputs.url);
           state.seen = (state.seen ?? 0) + 1;
           console.log(format.number(state.seen));
           return { body: res.json, seen: state.seen };`,
          ["url"],
          ["body", "seen"]
        )
      )
    ).toEqual([]);
  });

  it("accepts the tool bridge names `nodetool` and `tools`", () => {
    expect(
      codes(
        body(
          `const caps = nodetool.capabilities();
           const wfs = await tools.list_workflows({});
           return { caps, count: wfs.length };`,
          [],
          ["caps", "count"]
        )
      )
    ).toEqual([]);
  });

  it("accepts the media bridge over a media input", () => {
    expect(
      codes(
        body(
          `const bytes = await media.bytes(inputs.pdf);
           const info = await media.info(inputs.pdf);
           const doc = await media.toDocument(bytes, { mimeType: info.mimeType });
           return { doc };`,
          ["pdf"],
          ["doc"]
        )
      )
    ).toEqual([]);
  });

  it("still flags an invented name in a body that also uses media", () => {
    const issues = validateCodeNodeBody(
      body(
        `const bytes = await media.bytes(inputs.pdf);
         return { text: pdfjs.parse(bytes) };`,
        ["pdf"],
        ["text"]
      )
    );
    const undefinedName = issues.find((i) => i.code === "code_undefined_name");
    expect(undefinedName?.severity).toBe("error");
    expect(undefinedName?.message).toContain('"pdfjs"');
    expect(undefinedName?.message).not.toContain('"media"');
  });

  it("tells a body reading a removed guest name what replaced it", () => {
    const issues = validateCodeNodeBody(
      body("return { id: uuid(), bytes: utf8Encode(inputs.text) };", ["text"], [
        "id",
        "bytes"
      ])
    );
    const absent = issues.find((i) => i.code === "code_undefined_name");
    expect(absent?.severity).toBe("error");
    expect(absent?.message).toContain("crypto.randomUUID()");
    expect(absent?.message).toContain("TextEncoder");
  });

  it("flags the deleted quickjs stubs (Buffer, process, Headers)", () => {
    const issues = validateCodeNodeBody(
      body(
        "return { b: Buffer.from(inputs.text), e: process.env.HOME, h: new Headers() };",
        ["text"],
        ["b", "e", "h"]
      )
    );
    const absent = issues.find((i) => i.code === "code_undefined_name");
    expect(absent?.severity).toBe("error");
    expect(absent?.message).toContain('"Buffer"');
    expect(absent?.message).toContain('"process"');
    expect(absent?.message).toContain('"Headers"');
  });

  it("does not flag a typeof guard or an implicit global", () => {
    expect(
      codes(
        body(
          `if (typeof maybe === "undefined") { total = 0; } else { total = maybe; }
           return { total };`,
          [],
          ["total"]
        )
      )
    ).toEqual([]);
  });

  it("flags a body that never returns while outputs are declared", () => {
    const issues = validateCodeNodeBody(
      body("const x = 1;", [], ["out"])
    );
    expect(issues[0].code).toBe("code_no_return");
    expect(issues[0].severity).toBe("error");
  });

  it("warns when a body with no outputs never returns", () => {
    const issues = validateCodeNodeBody(body("const x = 1;"));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
  });

  it("flags an empty body feeding a connected output", () => {
    expect(codes(body("   ", [], [], ["out"]))).toEqual(["code_no_return"]);
  });

  it("warns on a return path that omits a declared output", () => {
    const issues = validateCodeNodeBody(
      body("if (a) return { x: 1, y: 2 };\nreturn { x: 1 };", ["a"], ["x", "y"])
    );
    const missing = issues.find((i) => i.code === "code_missing_output");
    expect(missing?.message).toContain('"y"');
  });

  it("splits a ternary into one shape per branch", () => {
    expect(
      codes(body("return a ? { x: 1, y: 2 } : { x: 1 };", ["a"], ["x", "y"]))
    ).toContain("code_missing_output");
  });

  it("stays quiet when a spread hides the returned keys", () => {
    expect(
      codes(body("const rest = { y: 2 };\nreturn { x: 1, ...rest };", [], ["x", "y"]))
    ).toEqual([]);
  });

  it("flags a return that cannot be an object of outputs", () => {
    expect(codes(body("return 5;", [], ["out"]))).toContain("code_return_shape");
  });

  it("warns on a returned key that is not a declared handle", () => {
    const issues = validateCodeNodeBody(
      body("return { x: 1, stray: 2 };", [], ["x"])
    );
    const undeclared = issues.find((i) => i.code === "code_undeclared_output");
    expect(undeclared?.message).toContain('"stray"');
  });

  it("warns when control can fall past every return", () => {
    expect(
      codes(body("if (a) { return { x: 1 }; }", ["a"], ["x"]))
    ).toContain("code_no_return");
  });

  it("ignores a return that belongs to a helper function", () => {
    expect(
      codes(
        body(
          "function helper() { return 1; }\nreturn { x: helper() };",
          [],
          ["x"]
        )
      )
    ).toEqual([]);
  });

  it("warns about an input the code never reads", () => {
    const issues = validateCodeNodeBody(
      body("return { x: 1 };", ["unused"], ["x"])
    );
    expect(issues.map((i) => i.code)).toEqual(["code_unused_input"]);
    expect(issues[0].message).toContain('"unused"');
  });

  it("accepts top-level await, which a bare parse rejects", () => {
    expect(
      codes(body("const v = await sleep(1);\nreturn { v };", [], ["v"]))
    ).toEqual([]);
  });
});

describe("code AST helpers", () => {
  it("collects bound names including implicit globals", () => {
    const names = collectBoundNames(
      "const { a, b: [c] } = x; function f(p) {} implicit = 1;"
    );
    expect(names).toEqual(expect.arrayContaining(["a", "c", "f", "p", "implicit"]));
  });

  it("leaves property names and object keys out of free identifiers", () => {
    const parsed = parseCodeBody("return { key: obj.prop };");
    if ("error" in parsed) throw new Error(parsed.error);
    expect(freeIdentifiers(parsed.statements)).toEqual(["obj"]);
  });
});

// ---------------------------------------------------------------------------
// Sandbox package declarations
// ---------------------------------------------------------------------------

/**
 * A catalog that serves `@acme/geo` and knows no other specifier. With
 * `versionMoved` it serves it with a drift warning, the way an install whose
 * pack changed under a saved workflow does.
 */
function fakeCatalog(
  options: { versionMoved?: boolean } = {}
): SandboxModuleCatalog {
  return {
    summaries: () => [],
    diagnostics: () => [],
    authorizeDelivery: (moduleId) =>
      Promise.resolve(refuseSandboxDelivery(moduleId)),
    resolveForExecution: (declarations) => {
      const statuses: SandboxModuleStatus[] = [];
      for (const declaration of declarations) {
        if (declaration.specifier !== "@acme/geo") {
          statuses.push({
            packName: "@acme/nodetool-missing",
            specifier: declaration.specifier,
            status: "error",
            code: "module-not-found",
            message: `Sandbox module ${declaration.specifier} is not installed.`
          });
          continue;
        }
        if (options.versionMoved === true) {
          statuses.push({
            packName: "@acme/nodetool-geo",
            specifier: declaration.specifier,
            status: "warning",
            code: "version-mismatch",
            message: `Sandbox module ${declaration.specifier} was saved with pack version 1.0.0.`
          });
        }
      }
      return { modules: [], statuses };
    }
  };
}

const importing = (
  code: string,
  extra: Partial<Parameters<typeof validateCodeNodeBody>[0]> = {}
) => ({
  ...body(code, [], ["out"]),
  ...extra
});

describe("validateCodeNodeBody — sandbox packages", () => {
  it("accepts an import and binds its names", () => {
    expect(
      validateCodeNodeBody(
        importing(
          'import { haversine } from "@acme/geo";\nreturn { out: haversine(1, 2) };'
        )
      )
    ).toEqual([]);
  });

  it("rejects a direct import of the private WASM bridge module", () => {
    // The bridge is reachable only from a generated facade, and the runtime
    // loader refuses it again by name.
    const issues = validateCodeNodeBody(
      importing(
        'import { __call } from "nodetool:wasm-bridge";\nreturn { out: __call };'
      )
    );
    const issue = issues.find((i) => i.code === "code_module");
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain("nodetool:wasm-bridge");
  });

  it("does not send a private bridge specifier to the catalog", () => {
    const issues = validateCodeNodeBody(
      importing(
        'import { __call } from "nodetool:host-bridge";\nreturn { out: __call };',
        { sandboxModuleCatalog: fakeCatalog() }
      )
    );
    expect(issues.map((i) => i.code)).toEqual(["code_module"]);
  });

  it("reports an import no installed pack serves", () => {
    const issues = validateCodeNodeBody(
      importing('import { x } from "@other/pack";\nreturn { out: x };', {
        sandboxModuleCatalog: fakeCatalog()
      })
    );
    const issue = issues.find((i) => i.code === "code_package_unavailable");
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain("@other/pack");
  });

  it("rejects require() and does not also call it an invented name", () => {
    const issues = validateCodeNodeBody(
      importing('const geo = require("@acme/geo");\nreturn { out: geo };')
    );
    const issue = issues.find((i) => i.code === "code_module");
    expect(issue?.message).toContain("require()");
    expect(issues.some((i) => i.code === "code_undefined_name")).toBe(false);
  });

  it("rejects a dynamic import()", () => {
    const issues = validateCodeNodeBody(
      importing('const geo = await import("@acme/geo");\nreturn { out: geo };')
    );
    const issue = issues.find((i) => i.code === "code_module");
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain("import()");
  });

  it("still rejects a top-level export", () => {
    const issues = validateCodeNodeBody(
      body("export const x = 1;\nreturn { out: x };", [], ["out"])
    );
    const issue = issues.find((i) => i.code === "code_module");
    expect(issue?.message).toContain("`export`");
    expect(issue?.message).toContain("top-level statements");
    expect(issue?.message).not.toContain("return an object");
  });

  it("reports a specifier the catalog cannot resolve", () => {
    const issues = validateCodeNodeBody(
      importing('import { x } from "@nope/pack";\nreturn { out: x };', {
        sandboxModuleCatalog: fakeCatalog()
      })
    );
    const issue = issues.find((i) => i.code === "code_package_unavailable");
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain("@nope/pack");
    expect(issue?.message).toContain("@acme/nodetool-missing");
  });

  it("names the package to install when the missing specifier is one NodeTool ships", () => {
    const issues = validateCodeNodeBody(
      importing(
        'import yaml from "@nodetool-ai/sandbox-yaml";\nreturn { out: yaml.load("a: 1") };',
        { sandboxModuleCatalog: fakeCatalog() }
      )
    );
    const issue = issues.find((i) => i.code === "code_package_unavailable");
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain("Install @nodetool-ai/sandbox-yaml");
  });

  it("guesses no package name for a specifier NodeTool does not ship", () => {
    const issues = validateCodeNodeBody(
      importing('import { x } from "@nope/pack";\nreturn { out: x };', {
        sandboxModuleCatalog: fakeCatalog()
      })
    );
    const issue = issues.find((i) => i.code === "code_package_unavailable");
    expect(issue?.message).not.toContain("Install");
  });

  it("warns when the installed pack version moved", () => {
    const issues = validateCodeNodeBody(
      importing('import { h } from "@acme/geo";\nreturn { out: h };', {
        sandboxModuleCatalog: fakeCatalog({ versionMoved: true })
      })
    );
    const issue = issues.find((i) => i.code === "code_package_mismatch");
    expect(issue?.severity).toBe("warning");
    expect(issue?.message).toContain("@acme/nodetool-geo");
  });

  it("says nothing about packages when the body imports none", () => {
    expect(
      validateCodeNodeBody(body("return { out: 1 };", [], ["out"]))
    ).toEqual([]);
  });

  it("lets a JS script import an installed pack and a platform module without a packages list", () => {
    const issues = validateCodeNodeBody({
      ...body(
        'import yaml from "@nodetool-ai/sandbox-yaml";\n' +
          'import { list_models } from "@nodetool-ai/sandbox-nodetool/models";\n' +
          "return { out: typeof yaml + typeof list_models };",
        [],
        ["out"]
      ),
      sandboxModuleCatalog: {
        ...fakeCatalog(),
        summaries: () => [
          {
            specifier: "@nodetool-ai/sandbox-yaml",
            packName: "@nodetool-ai/sandbox-yaml",
            kind: "js",
            contentDigest: "a".repeat(64)
          }
        ],
        resolveForExecution: (declarations) => ({
          modules: [],
          statuses: declarations
            .filter((declaration) => declaration.specifier !== "@nodetool-ai/sandbox-yaml")
            .map((declaration) => ({
              packName: declaration.specifier,
              specifier: declaration.specifier,
              status: "error" as const,
              code: "module-not-found",
              message: `Sandbox module ${declaration.specifier} is not installed.`
            }))
        })
      }
    });
    expect(issues.filter((issue) => issue.code === "code_module")).toEqual([]);
    expect(
      issues.filter((issue) => issue.code === "code_package_unavailable")
    ).toEqual([]);
  });

  it("lets a Code node import a platform module without declaring it", () => {
    // The host mounts `@nodetool-ai/sandbox-nodetool/*` for any body that
    // imports one — the Code node's as well as a script's — so requiring a
    // `packages` entry would fail a body the sandbox runs.
    const issues = validateCodeNodeBody(
      body(
        'import { invoke_node } from "@nodetool-ai/sandbox-nodetool/flow";\n' +
          'const r = await invoke_node({ type: "nodetool.text.Concat" });\n' +
          "return { out: r };",
        [],
        ["out"]
      )
    );
    expect(issues).toEqual([]);
  });

  it("still names a pack a JS script imports that is not installed", () => {
    const issues = validateCodeNodeBody({
      ...body('import { x } from "@nope/pack";\nreturn { out: x };', [], ["out"]),
      sandboxModuleCatalog: fakeCatalog()
    });
    const issue = issues.find((i) => i.code === "code_package_unavailable");
    expect(issue?.severity).toBe("error");
    expect(issue?.message).toContain("@nope/pack");
  });

  it("checks nothing against a catalog when none is given", () => {
    expect(
      validateCodeNodeBody(
        importing('import { x } from "@nope/pack";\nreturn { out: x };')
      )
    ).toEqual([]);
  });
});
