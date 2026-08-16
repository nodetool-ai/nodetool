/**
 * `nodetool sketch validate`, `debug` and `versions` — the sketch harness
 * commands.
 *
 * `validate` checks an image document statically: layers a binding points at,
 * fields a round trip through the schema would strip, canvas and layer values
 * nothing can composite. `debug` additionally replays a scripted `--interact`
 * edit session against the headless `ui_sketch_*` bridge and writes a bundle.
 * Both take an image-document JSON file or an `image_documents` row id.
 * `versions` (sketch-versions.ts) reads and restores a document's snapshot
 * history.
 *
 * Heavy dependencies (the database, the validator core, the bridge) are
 * imported lazily inside each action, so command registration stays light and
 * unit-testable.
 */
import type { Command } from "commander";
import type { SketchDebugReport } from "@nodetool-ai/execution/sketch-debug";
import type { ImageDocumentRecord } from "../sketch-debug/target.js";
import { printCommandError } from "../command-errors.js";
import { renderSketchValidation } from "./sketch-validation-output.js";
import { registerSketchVersionsCommands } from "./sketch-versions.js";

export { renderSketchValidation };

interface SketchValidateCliOptions {
  json?: boolean;
  warningsAsErrors?: boolean;
}

interface SketchDebugCliOptions {
  interact?: string;
  out?: string;
  json?: boolean;
}

/** Read an image document row through the local database. */
async function documentLoader(): Promise<
  (id: string) => Promise<ImageDocumentRecord | null>
> {
  const { initDb, ImageDocument } = await import("@nodetool-ai/models");
  const { getDefaultDbPath } = await import("@nodetool-ai/config");
  let ready = false;
  return async (id: string) => {
    if (!ready) {
      initDb(getDefaultDbPath());
      ready = true;
    }
    const row = await ImageDocument.findById(id);
    return row
      ? {
          id: row.id,
          name: row.name,
          width: row.width,
          height: row.height,
          background_color: row.background_color,
          document: row.document
        }
      : null;
  };
}

export function registerSketchCommands(program: Command): void {
  const sketch = program
    .command("sketch")
    .description("Work with sketches (image documents)");

  sketch
    .command("validate <sketch_id_or_file>")
    .description(
      "Validate an image document without rendering it: bindings on missing layers, fields a schema round trip would strip, canvas and layer values nothing can composite. Takes an image-document JSON file or an image_documents row id"
    )
    .option("--json", "Print the full SketchValidation as JSON")
    .option(
      "--warnings-as-errors",
      "Exit non-zero when there are warnings (not just errors)"
    )
    .action(async (ref: string, opts: SketchValidateCliOptions) => {
      try {
        const { runSketchValidate } = await import("../sketch-debug/index.js");
        const { target, validation } = await runSketchValidate(ref, {
          loadDocument: await documentLoader()
        });

        if (opts.json) {
          console.log(JSON.stringify({ target, validation }, null, 2));
        } else {
          console.log(renderSketchValidation(validation).join("\n"));
        }

        const failed =
          !validation.ok ||
          (opts.warningsAsErrors === true && validation.warnings.length > 0);
        process.exit(failed ? 1 : 0);
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  sketch
    .command("debug <sketch_id_or_file>")
    .description(
      "Replay a scripted edit session against a sketch headlessly and collect a debug bundle (the document, the report, every step's result)"
    )
    .option(
      "--interact <json>",
      'Scripted steps: [{"tool":"add_layer","input":{"name":"Glow"}}] — the ui_sketch_ prefix is optional'
    )
    .option(
      "--out <dir>",
      "Bundle output directory (default: nodetool-debug/sketch-<id>-<timestamp>)"
    )
    .option("--json", "Print the full SketchDebugReport as JSON to stdout")
    .action(async (ref: string, opts: SketchDebugCliOptions) => {
      try {
        const { parseInteractionScript, runSketchDebug } =
          await import("../sketch-debug/index.js");
        const interact = opts.interact
          ? parseInteractionScript(opts.interact)
          : undefined;

        const debugOptions: Parameters<typeof runSketchDebug>[1] = {};
        if (interact) {
          debugOptions.interact = interact;
        }
        if (opts.out) {
          debugOptions.outDir = opts.out;
        }
        const { report, bundleDir } = await runSketchDebug(ref, debugOptions, {
          loadDocument: await documentLoader(),
          onLog: (line) => console.error(line)
        });

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          printSketchSummary(report, bundleDir);
        }
        process.exit(report.verdict.ok ? 0 : 1);
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });

  registerSketchVersionsCommands(sketch);
}

function printSketchSummary(
  report: SketchDebugReport,
  bundleDir: string
): void {
  const mark = report.verdict.ok ? "✅" : "❌";
  console.log(`\n${mark} ${report.verdict.headline}`);
  console.log(
    `  sketch:  ${report.meta.layerCount} layer(s), ${report.meta.bindingCount} binding(s), ${report.meta.width}x${report.meta.height}`
  );
  const failed = report.interactions.filter((i) => !i.ok).length;
  if (report.interactions.length > 0) {
    console.log(
      `  session: ${report.interactions.length} step(s), ${failed} failed`
    );
  }
  if (report.verdict.issues.length > 0) {
    console.log("\nIssues:");
    for (const issue of report.verdict.issues) console.log(`  - ${issue}`);
  }
  if (report.verdict.warnings && report.verdict.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of report.verdict.warnings)
      console.log(`  - ${warning}`);
  }
  console.log(`\nDebug bundle: ${bundleDir}`);
  console.log("  report.md / report.json · sketch.json");
}
