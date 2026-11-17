/**
 * The checks a whole timeline document passes before it is stored.
 *
 * `set_timeline_document` runs them on the document an agent authored, and
 * the project folder sync runs them on the document of a `.timeline.json`
 * file a person or an agent edited. One implementation, so a file edit cannot
 * store a document the tool would refuse and both report a refused document
 * with the same issues.
 */
import {
  normalizeAuthoredDocument,
  type AuthoredRenderSettings
} from "@nodetool-ai/timeline";
import type { TimelineValidation } from "@nodetool-ai/execution/timeline-debug";
import {
  canonicalizeTimelineAssetIds,
  userAssetFinder
} from "./capabilities/timeline-asset-ids.js";
import { isRecord, isString } from "./utils/type-guards.js";

/** The render settings of a sequence. */
export interface TimelineRenderSettings {
  fps: number;
  width: number;
  height: number;
}

export interface TimelineDocumentSaveOptions {
  /** The owner of the sequence. Short asset ids resolve among their assets. */
  userId: string;
  /** The settings the sequence holds now, kept where none is stated. */
  current: TimelineRenderSettings;
  /**
   * Settings stated beside the document. Each wins over the same setting
   * inside the document.
   */
  settings?: Partial<Record<keyof TimelineRenderSettings, unknown>>;
  /**
   * A step between the asset IDs and the validation, for a caller that
   * changes the document before it is checked. `set_timeline_document` copies
   * the assets of other projects into the timeline's project here. An error
   * refuses the document.
   */
  localize?: (
    document: Record<string, unknown>
  ) => Promise<{ document: Record<string, unknown> } | { error: string }>;
}

/** A document ready to store, or the reason it is refused. */
export type TimelineDocumentSaveResult =
  | {
      ok: true;
      /** The document in the stored shape. */
      document: Record<string, unknown>;
      /** The name the document carried beside its content, if any. */
      name: string | undefined;
      fps: number;
      width: number;
      height: number;
      /** The end of the last clip. */
      durationMs: number;
    }
  | {
      ok: false;
      /** One sentence that says what is wrong. */
      error: string;
      /** The validation that refused the document, when that is the reason. */
      validation?: TimelineValidation;
    };

/** One-line count of what a validation found. */
export function timelineValidationSummary(validation: {
  errors: unknown[];
  warnings: unknown[];
}): string {
  const errors = validation.errors.length;
  const warnings = validation.warnings.length;
  if (errors === 0 && warnings === 0) return "No issues found.";
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  if (warnings > 0)
    parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
  return parts.join(", ");
}

/** A positive integer setting, or the fallback when the caller gave none. */
export function timelineSequenceSetting(
  value: unknown,
  fallback: number,
  field: string
): number | { error: string } {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return { error: `${field} must be a positive number.` };
  }
  return Math.round(n);
}

/**
 * A document the caller sent, ready to validate.
 *
 * A hand-authored cut leaves out the bookkeeping the schema requires — track
 * `index`/`visible`/`locked`, clip `sourceType`/`status`/`locked`/`versions`,
 * animation ids, `markers` — and refusing it with two dozen schema errors
 * teaches the caller nothing. `normalizeAuthoredDocument` fills exactly what is
 * missing and lifts document-level `fps`/`width`/`height` out as sequence
 * settings; a value the caller sent is never replaced, because the point of a
 * whole-document write is that what was sent is what the sequence becomes.
 */
export function timelineDocumentToStore(raw: Record<string, unknown>): {
  document: Record<string, unknown>;
  settings: AuthoredRenderSettings;
  name: string | undefined;
} {
  const {
    name,
    id: _id,
    projectId: _projectId,
    workflowId: _workflowId,
    durationMs: _durationMs,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    schemaVersion: _schemaVersion,
    ...document
  } = raw;
  return {
    ...normalizeAuthoredDocument(document),
    name: isString(name) && name.trim() ? name.trim() : undefined
  };
}

/** The end of the last clip — what the sequence's stored duration means. */
export function timelineDocumentEndMs(
  document: Record<string, unknown>
): number {
  const clips = document["clips"];
  if (!Array.isArray(clips)) return 0;
  return clips.reduce((end: number, clip: unknown) => {
    if (!isRecord(clip)) return end;
    const start = Number(clip["startMs"]) || 0;
    const length = Number(clip["durationMs"]) || 0;
    return Math.max(end, start + length);
  }, 0);
}

/**
 * Bring a whole document into the stored shape and validate it.
 *
 * The bookkeeping a hand-authored document leaves out is filled in, asset
 * references become full asset ids, and the render settings are resolved:
 * one stated beside the document, else one inside it, else the one the
 * sequence holds. A document with validation errors is refused. Nothing is
 * written here.
 */
export async function prepareTimelineDocumentForSave(
  raw: Record<string, unknown>,
  options: TimelineDocumentSaveOptions
): Promise<TimelineDocumentSaveResult> {
  // `get_timeline` returns the sequence row's fields beside the document. The
  // row fields are owned by the row, so they are dropped rather than reported
  // as stripped document fields.
  const stored = timelineDocumentToStore(raw);
  // Sandbox code holds the `asset://<short id>.<ext>` form the asset tools
  // print. The stored clip holds the asset row's full id.
  const canonical = await canonicalizeTimelineAssetIds(
    stored.document,
    userAssetFinder(options.userId)
  );
  if ("error" in canonical) return { ok: false, error: canonical.error };
  const local = (await options.localize?.(canonical.document)) ?? canonical;
  if ("error" in local) return { ok: false, error: local.error };
  const { document } = local;

  // Document-level fps/width/height are sequence settings, so a document that
  // carries them configures the sequence instead of having them stripped with
  // a `field_stripped` warning.
  const resolved: TimelineRenderSettings = {
    fps: options.current.fps,
    width: options.current.width,
    height: options.current.height
  };
  for (const field of ["fps", "width", "height"] as const) {
    const setting = timelineSequenceSetting(
      options.settings?.[field] ?? stored.settings[field],
      options.current[field],
      field
    );
    if (typeof setting !== "number") return { ok: false, error: setting.error };
    resolved[field] = setting;
  }

  const { validateTimelineSequence } =
    await import("@nodetool-ai/execution/timeline-debug");
  const validation: TimelineValidation = validateTimelineSequence(
    document,
    resolved
  );
  if (!validation.ok) {
    const count = validation.errors.length;
    return {
      ok: false,
      error: `The document has ${count} error${count === 1 ? "" : "s"}`,
      validation
    };
  }
  return {
    ok: true,
    document,
    name: stored.name,
    ...resolved,
    durationMs: timelineDocumentEndMs(document)
  };
}
