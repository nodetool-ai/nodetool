/**
 * Static validation of a sketch (image document).
 *
 * Pure and structural: everything here is decidable from the document alone —
 * no database, no assets, no canvas. Layer bitmaps stay opaque: a layer's
 * `data` is a serialized raster payload or a data URL, and nothing offline
 * decides whether it still decodes, so pixel decode is out of scope.
 *
 * Unlike the timeline validator, a schema failure does not stop the structural
 * pass. `imageDocumentData` leaves layers as `z.array(z.unknown())`, so almost
 * everything checked here is read by this module anyway; a document that fails
 * on one binding field should still report the layer stack around it.
 */
import { BLEND_MODE_TUPLE } from "@nodetool-ai/gpu";
import {
  imageDocumentData,
  sketchLayerLike
} from "@nodetool-ai/protocol/api-schemas/sketch.js";

import type { SketchDebugIssue, SketchValidation } from "./types.js";

/** Canvas settings the row carries beside the document. */
export interface SketchValidationMeta {
  width?: number;
  height?: number;
  backgroundColor?: string;
}

const BLEND_MODES = new Set<string>(BLEND_MODE_TUPLE);

const BINDING_KINDS = new Set([
  "workflow",
  "text-to-image",
  "image-to-image",
  "inpaint"
]);

const BINDING_STATUSES = new Set([
  "draft",
  "queued",
  "generating",
  "generated",
  "stale",
  "failed",
  "locked",
  "missing"
]);

const VERSION_STATUSES = new Set(["success", "failed", "cancelled"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const positive = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * A binding issue, with `layerId` left out when the binding names no layer.
 * Kept in one place so every binding finding carries the same field order.
 */
function bindingIssue(
  severity: "error" | "warning",
  code: string,
  message: string,
  layerId: string,
  path: string
): SketchDebugIssue {
  const issue: SketchDebugIssue = { severity, code, message };
  if (layerId) {
    issue.layerId = layerId;
  }
  issue.path = path;
  return issue;
}

/** Collect every leaf/branch path the parse output dropped from the input. */
function collectStrippedPaths(
  input: unknown,
  output: unknown,
  path: string,
  found: Set<string>
): void {
  if (Array.isArray(input)) {
    if (!Array.isArray(output)) return;
    input.forEach((item, index) => {
      collectStrippedPaths(item, output[index], `${path}[*]`, found);
    });
    return;
  }
  if (!isRecord(input) || !isRecord(output)) return;
  for (const [key, value] of Object.entries(input)) {
    // An explicit `undefined` carries nothing, so its absence loses nothing.
    if (value === undefined) continue;
    const childPath = path ? `${path}.${key}` : key;
    if (!(key in output) || output[key] === undefined) {
      found.add(childPath);
      continue;
    }
    collectStrippedPaths(value, output[key], childPath, found);
  }
}

/**
 * Fields the schema silently drops. A stripped field survives in memory and
 * disappears on the next autosave round trip, so it never fails loudly — the
 * only way to see it is to diff the input against what Zod handed back.
 *
 * The document schema keeps layers as `unknown`, so nothing inside a layer is
 * ever reported here; layer fields are checked directly instead.
 */
function checkFieldStripping(
  raw: unknown,
  parsed: unknown
): SketchDebugIssue[] {
  const paths = new Set<string>();
  collectStrippedPaths(raw, parsed, "", paths);
  return [...paths].sort().map((path) => ({
    severity: "warning" as const,
    code: "field_stripped",
    path,
    message: `\`${path}\` is present in the document but absent after schema parse — the schema strips it, so it is lost on the next save.`
  }));
}

function checkSchema(raw: unknown) {
  const result = imageDocumentData.safeParse(raw);
  if (result.success) {
    return {
      issues: checkFieldStripping(raw, result.data),
      parsed: result.data
    };
  }
  const issues: SketchDebugIssue[] = result.error.issues
    .slice(0, 25)
    .map((issue) => {
      const path = issue.path.map((part) => String(part)).join(".");
      const schemaIssue: SketchDebugIssue = {
        severity: "error",
        code: "schema_invalid",
        message: `${path || "(root)"}: ${issue.message}`
      };
      if (path) {
        schemaIssue.path = path;
      }
      return schemaIssue;
    });
  if (issues.length === 0) {
    issues.push({
      severity: "error",
      code: "schema_invalid",
      message: "Document does not match the image-document schema."
    });
  }
  return { issues, parsed: undefined };
}

function checkCanvas(
  sketch: Record<string, unknown>,
  meta: SketchValidationMeta | undefined
): SketchDebugIssue[] {
  const issues: SketchDebugIssue[] = [];
  const canvas = isRecord(sketch.canvas) ? sketch.canvas : undefined;
  if (!canvas) {
    issues.push({
      severity: "error",
      code: "canvas_missing",
      message:
        "The sketch has no `canvas` — nothing declares the artboard size.",
      path: "sketch.canvas"
    });
    return issues;
  }

  for (const axis of ["width", "height"] as const) {
    if (!positive(canvas[axis])) {
      issues.push({
        severity: "error",
        code: "canvas_invalid",
        message: `Canvas ${axis} is ${JSON.stringify(canvas[axis])} — the artboard must have a positive ${axis}.`,
        path: `sketch.canvas.${axis}`
      });
    }
  }

  if (
    canvas.backgroundColor !== undefined &&
    typeof canvas.backgroundColor !== "string"
  ) {
    issues.push({
      severity: "error",
      code: "canvas_invalid",
      message: `Canvas backgroundColor is ${JSON.stringify(canvas.backgroundColor)} — expected a color string.`,
      path: "sketch.canvas.backgroundColor"
    });
  }

  // The row's width/height are what the editor opens and what thumbnails are
  // cut at; a document that disagrees renders at one size and is stored at
  // another.
  for (const axis of ["width", "height"] as const) {
    const outer = meta?.[axis];
    if (positive(outer) && positive(canvas[axis]) && outer !== canvas[axis]) {
      issues.push({
        severity: "warning",
        code: "canvas_size_mismatch",
        message: `Canvas ${axis} is ${String(canvas[axis])} but the image document records ${String(outer)}.`,
        path: `sketch.canvas.${axis}`
      });
    }
  }

  return issues;
}

interface LayerRead {
  id: string;
  label: string;
  type: string;
  record: Record<string, unknown>;
}

function readLayers(sketch: Record<string, unknown>) {
  const issues: SketchDebugIssue[] = [];
  const layers: LayerRead[] = [];
  const seen = new Set<string>();

  asArray(sketch.layers).forEach((entry, index) => {
    const path = `sketch.layers[${index}]`;
    if (!isRecord(entry)) {
      issues.push({
        severity: "error",
        code: "layer_invalid",
        message: `Layer at index ${index} is ${JSON.stringify(entry)} — expected an object.`,
        path
      });
      return;
    }

    const parsed = sketchLayerLike.safeParse(entry);
    if (!parsed.success) {
      for (const issue of parsed.error.issues.slice(0, 5)) {
        const field = issue.path.map((part) => String(part)).join(".");
        const layerIssue: SketchDebugIssue = {
          severity: "error",
          code: "layer_invalid",
          message: `Layer at index ${index}: ${field || "(root)"}: ${issue.message}`,
          path: field ? `${path}.${field}` : path
        };
        if (typeof entry.id === "string") {
          layerIssue.layerId = entry.id;
        }
        issues.push(layerIssue);
      }
      if (typeof entry.id !== "string" || entry.id === "") return;
    }

    const id = String(entry.id);
    const label =
      typeof entry.name === "string" && entry.name ? entry.name : id;
    if (seen.has(id)) {
      issues.push({
        severity: "error",
        code: "duplicate_layer_id",
        message: `Duplicate layer id "${id}" — every reference to it is ambiguous.`,
        layerId: id,
        path
      });
    }
    seen.add(id);
    layers.push({
      id,
      label,
      type: typeof entry.type === "string" ? entry.type : "raster",
      record: entry
    });
  });

  return { layers, issues };
}

function checkLayer(
  layer: LayerRead,
  ids: ReadonlySet<string>
): SketchDebugIssue[] {
  const issues: SketchDebugIssue[] = [];
  const { record, id, label } = layer;

  const { opacity } = record;
  if (opacity !== undefined) {
    if (
      typeof opacity !== "number" ||
      !Number.isFinite(opacity) ||
      opacity < 0 ||
      opacity > 1
    ) {
      issues.push({
        severity: "error",
        code: "layer_opacity_invalid",
        message: `Layer "${label}" has opacity ${JSON.stringify(opacity)} — compositing expects a number in [0, 1].`,
        layerId: id,
        path: "opacity"
      });
    }
  }

  const { blendMode } = record;
  if (blendMode !== undefined && !BLEND_MODES.has(String(blendMode))) {
    issues.push({
      severity: "error",
      code: "unknown_blend_mode",
      message: `Layer "${label}" blends with "${String(blendMode)}", which no NodeTool compositor ships.`,
      layerId: id,
      path: "blendMode"
    });
  }

  const bounds = record.contentBounds;
  if (bounds !== undefined) {
    if (!isRecord(bounds)) {
      issues.push({
        severity: "error",
        code: "content_bounds_invalid",
        message: `Layer "${label}" has contentBounds ${JSON.stringify(bounds)} — expected an object.`,
        layerId: id,
        path: "contentBounds"
      });
    } else {
      for (const axis of ["width", "height"] as const) {
        const value = bounds[axis];
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          issues.push({
            severity: "error",
            code: "content_bounds_invalid",
            message: `Layer "${label}" has contentBounds.${axis} ${JSON.stringify(value)} — a backing raster cannot be smaller than nothing.`,
            layerId: id,
            path: `contentBounds.${axis}`
          });
        }
      }
    }
  }

  const { parentId } = record;
  if (typeof parentId === "string" && parentId !== "" && !ids.has(parentId)) {
    issues.push({
      severity: "warning",
      code: "layer_parent_missing",
      message: `Layer "${label}" names parent "${parentId}", which the document does not contain — it renders at the root.`,
      layerId: id,
      path: "parentId"
    });
  }

  return issues;
}

function checkSelection(
  sketch: Record<string, unknown>,
  layers: ReadonlyArray<LayerRead>,
  ids: ReadonlySet<string>
): SketchDebugIssue[] {
  const issues: SketchDebugIssue[] = [];

  if (layers.length === 0) {
    issues.push({
      severity: "warning",
      code: "document_empty",
      message: "The sketch has no layers — nothing composites onto the canvas.",
      path: "sketch.layers"
    });
  }

  const active = sketch.activeLayerId;
  if (layers.length > 0) {
    if (typeof active !== "string" || active === "") {
      issues.push({
        severity: "error",
        code: "active_layer_missing",
        message: `activeLayerId is ${JSON.stringify(active)} — edits have no layer to land on.`,
        path: "sketch.activeLayerId"
      });
    } else if (!ids.has(active)) {
      issues.push({
        severity: "error",
        code: "active_layer_missing",
        message: `activeLayerId "${active}" names a layer the document does not contain.`,
        layerId: active,
        path: "sketch.activeLayerId"
      });
    }
  }

  const mask = sketch.maskLayerId;
  if (typeof mask === "string" && mask !== "" && !ids.has(mask)) {
    issues.push({
      severity: "warning",
      code: "mask_layer_missing",
      message: `maskLayerId "${mask}" names a layer the document does not contain — masked edits fall back to the whole canvas.`,
      layerId: mask,
      path: "sketch.maskLayerId"
    });
  }

  return issues;
}

function checkBindings(
  document: Record<string, unknown>,
  ids: ReadonlySet<string>
): SketchDebugIssue[] {
  const issues: SketchDebugIssue[] = [];
  const raw = document.layerBindings;
  if (raw === undefined || !Array.isArray(raw)) {
    issues.push({
      severity: "error",
      code: "bindings_missing",
      message:
        "`layerBindings` is missing or not an array — the document does not declare how any layer generates.",
      path: "layerBindings"
    });
    return issues;
  }

  const bound = new Set<string>();
  raw.forEach((entry, index) => {
    const path = `layerBindings[${index}]`;
    if (!isRecord(entry)) {
      issues.push({
        severity: "error",
        code: "binding_invalid",
        message: `Binding at index ${index} is ${JSON.stringify(entry)} — expected an object.`,
        path
      });
      return;
    }

    const layerId = typeof entry.layerId === "string" ? entry.layerId : "";
    if (layerId === "") {
      issues.push({
        severity: "error",
        code: "binding_invalid",
        message: `Binding at index ${index} has no \`layerId\` — nothing says which layer it generates.`,
        path: `${path}.layerId`
      });
    } else if (!ids.has(layerId)) {
      issues.push({
        severity: "error",
        code: "binding_layer_missing",
        message: `Binding at index ${index} generates layer "${layerId}", which the document does not contain.`,
        layerId,
        path: `${path}.layerId`
      });
    } else if (bound.has(layerId)) {
      issues.push({
        severity: "error",
        code: "duplicate_binding",
        message: `Layer "${layerId}" carries more than one binding — which one generates it is undefined.`,
        layerId,
        path: `${path}.layerId`
      });
    }
    if (layerId !== "") bound.add(layerId);

    // Absent `kind` is legacy data, which the editor reads as "workflow".
    const kind = entry.kind === undefined ? "workflow" : String(entry.kind);
    if (!BINDING_KINDS.has(kind)) {
      issues.push(
        bindingIssue(
          "error",
          "binding_kind_invalid",
          `Binding for "${layerId}" has kind "${kind}" — expected one of ${[...BINDING_KINDS].join(", ")}.`,
          layerId,
          `${path}.kind`
        )
      );
    }

    if (kind === "workflow") {
      const workflowId = entry.workflowId;
      if (typeof workflowId !== "string" || workflowId === "") {
        issues.push(
          bindingIssue(
            "error",
            "binding_workflow_missing",
            `Workflow binding for "${layerId}" names no workflowId — nothing can produce its pixels.`,
            layerId,
            `${path}.workflowId`
          )
        );
      }
    } else {
      const prompt = entry.prompt;
      if (typeof prompt !== "string" || prompt.trim() === "") {
        issues.push(
          bindingIssue(
            "warning",
            "binding_incomplete",
            `${kind} binding for "${layerId}" carries no prompt — a generation would run on nothing.`,
            layerId,
            `${path}.prompt`
          )
        );
      }
      const source = entry.sourceLayerId;
      if (
        (kind === "image-to-image" || kind === "inpaint") &&
        typeof source === "string" &&
        source !== "" &&
        !ids.has(source)
      ) {
        issues.push(
          bindingIssue(
            "warning",
            "binding_source_layer_missing",
            `${kind} binding for "${layerId}" reads source layer "${source}", which the document does not contain.`,
            layerId,
            `${path}.sourceLayerId`
          )
        );
      }
    }

    const status = entry.status;
    if (typeof status !== "string" || !BINDING_STATUSES.has(status)) {
      issues.push(
        bindingIssue(
          "error",
          "binding_status_invalid",
          `Binding for "${layerId}" has status ${JSON.stringify(status)} — expected one of ${[...BINDING_STATUSES].join(", ")}.`,
          layerId,
          `${path}.status`
        )
      );
    }

    const versions = entry.versions;
    if (versions !== undefined && !Array.isArray(versions)) {
      issues.push(
        bindingIssue(
          "error",
          "binding_invalid",
          `Binding for "${layerId}" has \`versions\` ${JSON.stringify(versions)} — expected an array.`,
          layerId,
          `${path}.versions`
        )
      );
    }
    asArray(versions).forEach((version, versionIndex) => {
      if (!isRecord(version)) return;
      const versionStatus = version.status;
      if (
        typeof versionStatus !== "string" ||
        !VERSION_STATUSES.has(versionStatus)
      ) {
        issues.push(
          bindingIssue(
            "error",
            "version_status_invalid",
            `Version ${versionIndex} of the binding for "${layerId}" has status ${JSON.stringify(versionStatus)} — expected one of ${[...VERSION_STATUSES].join(", ")}.`,
            layerId,
            `${path}.versions[${versionIndex}].status`
          )
        );
      }
    });
  });

  return issues;
}

/**
 * Validate a parsed-JSON image document (`{sketch, layerBindings}`). `raw` is
 * untrusted: a document that is not an object, or has no `sketch`, is reported
 * and the rest of the pass is skipped, since there is nothing left to read.
 */
export function validateSketchDocument(
  raw: unknown,
  meta?: SketchValidationMeta
): SketchValidation {
  if (!isRecord(raw)) {
    return {
      ok: false,
      errors: [
        {
          severity: "error",
          code: "document_invalid",
          message: `Document is ${JSON.stringify(raw)} — expected an object carrying \`sketch\` and \`layerBindings\`.`
        }
      ],
      warnings: []
    };
  }

  const { issues: schemaIssues } = checkSchema(raw);

  if (!isRecord(raw.sketch)) {
    return {
      ok: false,
      errors: [
        ...schemaIssues.filter((issue) => issue.severity === "error"),
        {
          severity: "error",
          code: "sketch_missing",
          message:
            "Document has no `sketch` object — there is no layer stack to check.",
          path: "sketch"
        }
      ],
      warnings: schemaIssues.filter((issue) => issue.severity === "warning")
    };
  }

  const sketch = raw.sketch;
  const { layers, issues: layerIssues } = readLayers(sketch);
  const ids = new Set(layers.map((layer) => layer.id));

  const issues: SketchDebugIssue[] = [
    ...schemaIssues,
    ...checkCanvas(sketch, meta),
    ...layerIssues,
    ...layers.flatMap((layer) => checkLayer(layer, ids)),
    ...checkSelection(sketch, layers, ids),
    ...checkBindings(raw, ids)
  ];

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { ok: errors.length === 0, errors, warnings };
}
