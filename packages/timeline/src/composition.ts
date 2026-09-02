/**
 * Compositions — a stored group of clips with named parameters.
 *
 * A composition is a document fragment, not a second renderer (AS6): the group
 * clip and its children are ordinary {@link TimelineClip}s, and instantiating
 * one copies them into the target document with fresh ids. Child times are
 * stored relative to the group's start, so a template drops in at any timecode.
 *
 * A parameter names a value inside a child by JSON pointer — `/1/textStyle/text`
 * is the text of the second child. The pointer is resolved against the children
 * array, so a template's parameters survive a rename and break loudly when the
 * child they addressed is gone.
 */

import { makeClip } from "./defaults.js";
import type { TimelineClip } from "./types.js";

/** The value kinds a composition parameter carries. */
export const COMPOSITION_PARAM_TYPES = [
  "string",
  "number",
  "color",
  "boolean"
] as const;

export type CompositionParamType = (typeof COMPOSITION_PARAM_TYPES)[number];

export type CompositionParamValue = string | number | boolean;

export interface CompositionParam {
  type: CompositionParamType;
  /** The value the template ships with — what a caller gets by not passing one. */
  default: CompositionParamValue;
  /**
   * JSON pointer into {@link TimelineComposition.children}, e.g.
   * `/1/textStyle/text`. The leading segment is the child's index.
   */
  path: string;
  description?: string;
}

export interface TimelineComposition {
  id: string;
  name: string;
  description?: string;
  params: Record<string, CompositionParam>;
  /** The group clip. Its `startMs` is the origin child times are relative to. */
  group: TimelineClip;
  /** The group's children, times relative to the group start. */
  children: TimelineClip[];
}

export interface InstantiateCompositionOptions {
  /** Where the group lands on the timeline. */
  startMs: number;
  /** Track for the group. Children keep their own tracks unless this is set. */
  trackId?: string;
  params?: Record<string, CompositionParamValue>;
  /** Id minter, for a deterministic test. Defaults to the document's own. */
  newId?: () => string;
}

/** A pointer's segments, with JSON Pointer's `~1`/`~0` escapes undone. */
function pointerSegments(pointer: string): string[] {
  if (pointer === "" || pointer === "/") return [];
  if (!pointer.startsWith("/")) {
    throw new Error(
      `Composition parameter path "${pointer}" must be a JSON pointer starting with "/".`
    );
  }
  return pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Walk a pointer to its parent container and report the leaf key, or null when
 * the container does not exist. A pointer whose container is missing addresses
 * nothing at all, which is the failure a caller has to be told about — a
 * template that silently writes nowhere renders the default forever.
 */
function resolveCompositionPointer(
  children: TimelineClip[],
  pointer: string
): { container: Record<string, unknown> | unknown[]; key: string } | null {
  const segments = pointerSegments(pointer);
  if (segments.length === 0) return null;
  let cursor: unknown = children;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        return null;
      }
      cursor = cursor[index];
      continue;
    }
    if (!isRecord(cursor)) return null;
    cursor = cursor[segment];
  }
  if (!isRecord(cursor) && !Array.isArray(cursor)) return null;
  return {
    container: cursor as Record<string, unknown> | unknown[],
    key: segments[segments.length - 1]
  };
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Whether a value matches a parameter's declared type. `color` is a string
 * shaped like a CSS hex colour: a template's colour slot feeds a canvas fill,
 * and an arbitrary string there paints nothing rather than failing.
 */
export function compositionValueMatchesType(
  type: CompositionParamType,
  value: unknown
): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "color":
      return typeof value === "string" && HEX_COLOR.test(value);
  }
}

/**
 * Check a composition's parameters against its own children: every pointer must
 * address something that exists, and every default must match its declared
 * type. Returns the problems, empty when the template is sound.
 */
export function validateCompositionParams(
  composition: TimelineComposition
): string[] {
  const problems: string[] = [];
  for (const [name, param] of Object.entries(composition.params ?? {})) {
    if (!(COMPOSITION_PARAM_TYPES as readonly string[]).includes(param.type)) {
      problems.push(
        `Parameter "${name}" has type "${param.type}"; expected one of ${COMPOSITION_PARAM_TYPES.join(", ")}.`
      );
      continue;
    }
    let resolved: { container: unknown; key: string } | null;
    try {
      resolved = resolveCompositionPointer(composition.children, param.path);
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
      continue;
    }
    if (!resolved) {
      problems.push(
        `Parameter "${name}" points at ${param.path}, which no child of "${composition.name}" has.`
      );
      continue;
    }
    if (!compositionValueMatchesType(param.type, param.default)) {
      problems.push(
        `Parameter "${name}" is declared ${param.type} but its default is ${JSON.stringify(param.default)}.`
      );
    }
  }
  return problems;
}

/**
 * Copy a composition into a document as fresh clips: the group first, then its
 * children, each with a new id, the group's start applied, and the template's
 * parameters written in.
 *
 * Throws when a parameter is unknown to the template, is of the wrong type, or
 * addresses a child field that is not there. All three are authoring mistakes
 * whose only symptom otherwise is a title that never says what it was asked to.
 */
export function instantiateComposition(
  composition: TimelineComposition,
  options: InstantiateCompositionOptions
): TimelineClip[] {
  const mint = options.newId ?? (() => makeClip().id);
  const children: TimelineClip[] = composition.children.map((child) =>
    structuredClone(child)
  );

  const supplied = options.params ?? {};
  const applied: Record<string, CompositionParamValue> = {};
  for (const [name, param] of Object.entries(composition.params ?? {})) {
    const value = Object.prototype.hasOwnProperty.call(supplied, name)
      ? supplied[name]
      : param.default;
    if (!compositionValueMatchesType(param.type, value)) {
      throw new Error(
        `Parameter "${name}" of composition "${composition.name}" is ${param.type}; got ${JSON.stringify(value)}.`
      );
    }
    const target = resolveCompositionPointer(children, param.path);
    if (!target) {
      throw new Error(
        `Parameter "${name}" of composition "${composition.name}" points at ${param.path}, which no child has.`
      );
    }
    if (Array.isArray(target.container)) {
      target.container[Number(target.key)] = value;
    } else {
      target.container[target.key] = value;
    }
    applied[name] = value;
  }
  for (const name of Object.keys(supplied)) {
    if (!Object.prototype.hasOwnProperty.call(composition.params ?? {}, name)) {
      const known = Object.keys(composition.params ?? {});
      throw new Error(
        `Composition "${composition.name}" has no parameter "${name}". ` +
          (known.length > 0
            ? `Its parameters: ${known.join(", ")}.`
            : "It declares none.")
      );
    }
  }

  const groupId = mint();
  const group: TimelineClip = {
    ...structuredClone(composition.group),
    id: groupId,
    startMs: options.startMs,
    compositionId: composition.id,
    compositionParams: applied
  };
  if (options.trackId) group.trackId = options.trackId;
  delete group.parentId;

  const out: TimelineClip[] = [group];
  for (const child of children) {
    out.push({
      ...child,
      id: mint(),
      startMs: options.startMs + child.startMs,
      trackId: options.trackId ?? child.trackId,
      parentId: groupId,
      compositionId: composition.id,
      compositionParams: applied
    });
  }
  return out;
}

export interface ExtractCompositionSource {
  clips: readonly TimelineClip[];
}

/**
 * Turn a group already on the timeline into a reusable composition: the group
 * clip plus every clip parented to it, child times rebased to the group start.
 *
 * The parameters are the caller's — a template is a statement about which
 * values are meant to vary, which nothing in a document records — and each one
 * is checked against the extracted children before the composition is returned.
 */
export function extractComposition(
  doc: ExtractCompositionSource,
  groupId: string,
  params: Record<string, CompositionParam> = {},
  meta: { id?: string; name?: string; description?: string } = {}
): TimelineComposition {
  const group = doc.clips.find((clip) => clip.id === groupId);
  if (!group) {
    throw new Error(`No clip with id "${groupId}" is in this timeline.`);
  }
  if (group.mediaType !== "group") {
    throw new Error(
      `"${group.name}" is a ${group.mediaType} clip, not a group — only a group can become a composition.`
    );
  }
  const children = doc.clips
    .filter((clip) => clip.parentId === groupId)
    .map((clip) => {
      const copy = structuredClone(clip);
      copy.startMs = clip.startMs - group.startMs;
      // The group is implicit in a template, so a child does not name it.
      // Instantiating parents every child to the group it mints.
      delete copy.parentId;
      delete copy.compositionId;
      delete copy.compositionParams;
      return copy;
    });

  const groupTemplate = structuredClone(group);
  groupTemplate.startMs = 0;
  delete groupTemplate.compositionId;
  delete groupTemplate.compositionParams;
  delete groupTemplate.parentId;

  const composition: TimelineComposition = {
    id: meta.id ?? group.compositionId ?? makeClip().id,
    name: meta.name ?? group.name,
    params,
    group: groupTemplate,
    children
  };
  if (meta.description !== undefined) {
    composition.description = meta.description;
  }
  const problems = validateCompositionParams(composition);
  if (problems.length > 0) {
    throw new Error(problems.join(" "));
  }
  return composition;
}
