/**
 * `nodetool sketch render` — render a sketch to a PNG or a layered PSD with
 * the editor's compositing rules, from an image-document JSON file or an
 * `image_documents` row id.
 *
 * The renderer is `@nodetool-ai/agents/sketch-render`, the one behind the
 * `render_sketch` capability. Layer images stored as `asset://` resolve
 * through the local asset store, which opens only when a layer needs it.
 */
import { writeFileSync } from "node:fs";
import type { Command } from "commander";
import type { HeadlessSketchRenderOptions } from "@nodetool-ai/agents/sketch-render";
import { printCommandError } from "@nodetool-ai/pack-manager/command-errors";
import type { ImageDocumentRecord } from "../sketch-debug/target.js";
import { trimHyphens } from "@nodetool-ai/cli-common/trimHyphens";

export interface SketchRenderCliOptions {
  out?: string;
  format?: string;
  width?: string;
  height?: string;
  background?: string;
  layer?: string;
  mask?: boolean;
  json?: boolean;
}

/** A positive integer flag, or undefined when it was not given. */
export function parseDimension(name: string, value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive whole number of pixels, not "${value}".`);
  }
  return parsed;
}

/** `<name>.png` or `<name>.psd` beside the working directory. */
export function defaultOutputPath(ref: string, format: "png" | "psd", label: string | undefined): string {
  const base = trimHyphens((label ?? ref.replace(/\.json$/i, "").split(/[\\/]/).pop() ?? "sketch")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-"));
  return `${base || "sketch"}.${format}`;
}

/** Bytes for an `asset://` or http(s) layer image, via a local processing context. */
async function localImageLoader(): Promise<(uri: string) => Promise<Uint8Array>> {
  let context: Promise<import("@nodetool-ai/runtime").ProcessingContext> | undefined;
  const open = async () => {
    const { initDb } = await import("@nodetool-ai/models");
    const { getDefaultAssetsPath, getDefaultDbPath } = await import("@nodetool-ai/config");
    const { ProcessingContext } = await import("@nodetool-ai/runtime");
    const { FileStorageAdapter } = await import("@nodetool-ai/storage");
    initDb(getDefaultDbPath());
    return new ProcessingContext({
      jobId: `sketch-render-${Date.now()}`,
      workflowId: null,
      userId: "1",
      storage: new FileStorageAdapter(getDefaultAssetsPath())
    });
  };
  return async (uri: string) => {
    const { loadMediaRefBytes } = await import("@nodetool-ai/runtime");
    context ??= open();
    const bytes = await loadMediaRefBytes({ type: "image", uri }, await context, {
      allowLocalFile: false
    });
    if (!bytes || bytes.length === 0) {
      throw new Error(`${uri} could not be read`);
    }
    return bytes;
  };
}

/** What `sketch render` wrote, as `--json` prints it. */
export interface SketchRenderReport {
  target: { kind: "file" | "id"; ref: string; name?: string };
  out: string;
  format: "png" | "psd";
  width: number;
  height: number;
  canvas_width: number;
  canvas_height: number;
  bytes: number;
  layer_id?: string;
  layers: Array<{ id: string; name: string; type: string; drawn: boolean; issue?: string }>;
}

/** Resolve the target, render it, and write the output file. */
export async function runSketchRender(
  ref: string,
  opts: SketchRenderCliOptions,
  deps: {
    loadDocument: (id: string) => Promise<ImageDocumentRecord | null>;
    loadImageBytes?: (uri: string) => Promise<Uint8Array>;
  }
): Promise<SketchRenderReport> {
  const format = opts.format ?? "png";
  if (format !== "png" && format !== "psd") {
    throw new Error(`--format must be png or psd, not "${format}".`);
  }
  const { resolveSketchTarget } = await import("../sketch-debug/target.js");
  const { renderSketch } = await import("@nodetool-ai/agents/sketch-render");
  const resolved = await resolveSketchTarget(ref, { loadDocument: deps.loadDocument });
  const options: HeadlessSketchRenderOptions = {
    format,
    width: parseDimension("width", opts.width),
    height: parseDimension("height", opts.height),
    background: opts.background,
    layerId: opts.layer,
    mask: opts.mask === true,
    loadImageBytes: deps.loadImageBytes
  };
  const result = await renderSketch(resolved.raw, options);
  const out = opts.out ?? defaultOutputPath(ref, format, resolved.target.name);
  writeFileSync(out, result.bytes);
  const report: SketchRenderReport = {
    target: resolved.target,
    out,
    format: result.format,
    width: result.width,
    height: result.height,
    canvas_width: result.canvasWidth,
    canvas_height: result.canvasHeight,
    bytes: result.bytes.length,
    layers: result.layers
  };
  if (result.layerId) {
    report.layer_id = result.layerId;
  }
  return report;
}

export function registerSketchRenderCommand(
  sketch: Command,
  loadDocument: () => Promise<(id: string) => Promise<ImageDocumentRecord | null>>
): void {
  sketch
    .command("render <sketch_id_or_file>")
    .description(
      "Render a sketch to a PNG, or a layered PSD, with the editor's compositing rules: visibility and groups, opacity, blend modes, transforms, effects, vector layers and placed images. Takes an image-document JSON file or an image_documents row id"
    )
    .option("-o, --out <file>", "Output file (default: <sketch name>.png or .psd in the working directory)")
    .option("--format <format>", "png or psd", "png")
    .option("--width <px>", "Output width. Alone, the height keeps the canvas aspect ratio. PNG only")
    .option("--height <px>", "Output height. Alone, the width keeps the canvas aspect ratio. PNG only")
    .option("--background <color>", "CSS color under the image (default: transparent). PNG only")
    .option("--layer <layer_id>", "Render one layer alone, without its opacity or blend mode. PNG only")
    .option("--mask", "Render the inpainting mask layer. PNG only")
    .option("--json", "Print the render report as JSON")
    .action(async (ref: string, opts: SketchRenderCliOptions) => {
      try {
        const report = await runSketchRender(ref, opts, {
          loadDocument: await loadDocument(),
          loadImageBytes: await localImageLoader()
        });
        const issues = report.layers.filter((layer) => layer.issue);
        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(
            `Wrote ${report.out} (${report.width}x${report.height} ${report.format.toUpperCase()}, ${report.bytes} bytes)`
          );
          for (const layer of issues) {
            console.log(`  ${layer.name || layer.id}: ${layer.issue}`);
          }
        }
        process.exit(issues.some((layer) => !layer.drawn) ? 1 : 0);
      } catch (e) {
        process.exit(printCommandError(e, opts.json));
      }
    });
}
