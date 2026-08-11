/**
 * The `lib.pdf.*` → Code node migrations, executed.
 *
 * `packages/protocol` owns the migration table but sits at the base of the
 * dependency order and cannot import the sandbox, so its tests can only assert
 * the migration's shape. This runs the body it produces: a saved `lib.pdf.*`
 * node goes through `migrateGraphNodeTypes`, and the code that comes out is
 * executed against a real PDF with `@nodetool-ai/sandbox-pdf` mounted.
 *
 * The body is read from the migration, never retyped — a drifting code string
 * fails here. The input is a `data:` ref, which `media.bytes` decodes without
 * touching storage or the network.
 */
import { describe, it, expect } from "vitest";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { CODE_INPUTS_GLOBAL } from "@nodetool-ai/node-sdk";
import {
  migrateGraphNodeTypes,
  SANDBOX_HOST_MODULES,
  type ResolvedSandboxModule,
  type SandboxModuleResolution
} from "@nodetool-ai/protocol";

import { runInSandbox } from "../src/js-sandbox.js";
import { buildPdf } from "./_helpers/fixture-pdf.js";

const PAGES = ["Hello from page one", "Second page text here"] as const;

/** The fixture as the ref a `document` input carries. */
function documentRef(): Record<string, unknown> {
  const base64 = Buffer.from(buildPdf([...PAGES])).toString("base64");
  return {
    type: "document",
    uri: `data:application/pdf;base64,${base64}`,
    asset_id: null,
    data: null,
    metadata: null
  };
}

/** The pdf host module, addressed by the pack the registry pins to it. */
function pdfModules(): SandboxModuleResolution {
  const spec = SANDBOX_HOST_MODULES.pdf;
  if (spec === undefined) throw new Error("no pdf host module");
  const module: ResolvedSandboxModule = {
    specifier: spec.packName,
    packName: spec.packName,
    packVersion: "0.0.0-test",
    contentDigest: "b".repeat(64),
    moduleId: "host:pdf",
    kind: "host",
    hostId: "pdf",
    graph: []
  };
  return { modules: [module], statuses: [] };
}

/**
 * Migrate a saved node and run what the migration produced, the way the Code
 * node runs it: the old node's properties arrive on the `inputs` global.
 */
async function runMigrated(
  type: string,
  properties: Record<string, unknown>
): Promise<unknown> {
  const migrated = migrateGraphNodeTypes({
    nodes: [{ id: "n1", type, data: properties }],
    edges: []
  }) as {
    nodes: Array<{
      type: string;
      data: Record<string, unknown>;
      dynamic_properties?: Record<string, unknown>;
    }>;
  };
  const node = migrated.nodes[0];
  expect(node.type).toBe("nodetool.code.Code");
  expect(node.data.packages).toEqual(["@nodetool-ai/sandbox-pdf"]);

  const result = await runInSandbox({
    code: String(node.data.code),
    context: new ProcessingContext({ jobId: "pdf-migration", userId: "test" }),
    globals: { [CODE_INPUTS_GLOBAL]: node.dynamic_properties ?? {} },
    modules: pdfModules(),
    timeoutMs: 20000
  });

  expect(result.error).toBeUndefined();
  expect(result.success).toBe(true);
  return result.result;
}

describe("the lib.pdf.* migrations produce a body that runs", () => {
  it("extracts the fixture's text for lib.pdf.ExtractText", async () => {
    const output = (await runMigrated("lib.pdf.ExtractText", {
      pdf: documentRef(),
      start_page: 0,
      end_page: -1
    })) as { output: string };

    expect(typeof output.output).toBe("string");
    expect(output.output).toContain(PAGES[0]);
    expect(output.output).toContain(PAGES[1]);
  });

  it("honors the saved page range, where -1 means the last page", async () => {
    const firstOnly = (await runMigrated("lib.pdf.ExtractText", {
      pdf: documentRef(),
      start_page: 0,
      end_page: 0
    })) as { output: string };
    expect(firstOnly.output).toContain(PAGES[0]);
    expect(firstOnly.output).not.toContain(PAGES[1]);

    const toTheLast = (await runMigrated("lib.pdf.ExtractText", {
      pdf: documentRef(),
      start_page: 1,
      end_page: -1
    })) as { output: string };
    expect(toTheLast.output).not.toContain(PAGES[0]);
    expect(toTheLast.output).toContain(PAGES[1]);
  });

  it("counts the fixture's pages for lib.pdf.PageCount", async () => {
    const output = (await runMigrated("lib.pdf.PageCount", {
      pdf: documentRef()
    })) as { output: number };

    expect(output.output).toBe(PAGES.length);
  });

  it("finds a phrase per page for lib.pdf.SearchText", async () => {
    const output = (await runMigrated("lib.pdf.SearchText", {
      pdf: documentRef(),
      phrase: "page",
      case_sensitive: false,
      start_page: 0,
      end_page: -1
    })) as { output: Array<{ page: number; text: string }> };

    expect(output.output.length).toBeGreaterThan(0);
    expect(output.output.map((match) => match.page)).toContain(0);
    expect(output.output.map((match) => match.page)).toContain(1);
    for (const match of output.output) {
      expect(match.text.toLowerCase()).toBe("page");
    }
  });

  it("reports a ref it cannot read instead of returning empty text", async () => {
    const migrated = migrateGraphNodeTypes({
      nodes: [
        {
          id: "n1",
          type: "lib.pdf.ExtractText",
          data: { pdf: { type: "document", uri: "" } }
        }
      ],
      edges: []
    }) as {
      nodes: Array<{
        data: Record<string, unknown>;
        dynamic_properties?: Record<string, unknown>;
      }>;
    };
    const node = migrated.nodes[0];

    const result = await runInSandbox({
      code: String(node.data.code),
      context: new ProcessingContext({ jobId: "pdf-migration", userId: "test" }),
      globals: { [CODE_INPUTS_GLOBAL]: node.dynamic_properties ?? {} },
      modules: pdfModules(),
      timeoutMs: 20000
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("media.bytes");
  });
});
