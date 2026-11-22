/**
 * Shared resolution and validation for step pattern library folder operations (SQ43).
 *
 * Used identically by the in-memory library, the server library
 * (`packages/agents/src/capabilities/timeline-operations.ts`), and the browser
 * library (`web/src/hooks/timeline/useTimelineAgentBridge.ts`) so ID prefix
 * matching, ambiguity refusal, root protection, and cross-kind checks never
 * drift across hosts.
 */
import { isFullResourceId, isShortResourceId } from "@nodetool-ai/protocol";
import {
  findFactoryStepPattern,
  normalizeStepPatternFolderPath,
  normalizeStepPatternSubfolderPath,
  parentStepPatternFolder,
  stepPatternAncestorFolders,
  stepPatternFolderName,
  stepPatternKindFromFolderPath,
  stepPatternRootFolder,
  validateStepPatternFolderSegment,
  type StepPatternLibraryKind
} from "../midi/stepPatternLibrary.js";
import type {
  TimelineOpStepPatternFolder,
  TimelineOpUserStepPattern
} from "./types.js";

export interface ExplicitStepPatternFolderRecord {
  id: string;
  kind: StepPatternLibraryKind;
  folder: string;
}

/**
 * Derive the sorted list of user step pattern folders from both explicit folder
 * marker assets and folder paths stored on user pattern/template assets.
 */
export function collectStepPatternFolders(
  explicitFolders: readonly ExplicitStepPatternFolderRecord[],
  entries: readonly Pick<TimelineOpUserStepPattern, "kind" | "folder">[]
): TimelineOpStepPatternFolder[] {
  const byKey = new Map<string, TimelineOpStepPatternFolder>();

  const ensureAncestors = (kind: StepPatternLibraryKind, fullFolder: string): void => {
    for (const anc of stepPatternAncestorFolders(kind, fullFolder)) {
      const key = anc.toLowerCase();
      if (!byKey.has(key)) {
        byKey.set(key, {
          name: stepPatternFolderName(anc),
          kind,
          folder: anc,
          parentFolder: parentStepPatternFolder(kind, anc)
        });
      }
    }
  };

  for (const item of explicitFolders) {
    let fullFolder: string;
    try {
      fullFolder = normalizeStepPatternSubfolderPath(item.kind, item.folder);
    } catch {
      continue;
    }
    ensureAncestors(item.kind, fullFolder);
    byKey.set(fullFolder.toLowerCase(), {
      id: item.id,
      name: stepPatternFolderName(fullFolder),
      kind: item.kind,
      folder: fullFolder,
      parentFolder: parentStepPatternFolder(item.kind, fullFolder)
    });
  }

  for (const entry of entries) {
    if (!entry.folder) continue;
    let fullFolder: string;
    try {
      fullFolder = normalizeStepPatternFolderPath(entry.kind, entry.folder);
    } catch {
      continue;
    }
    if (fullFolder.toLowerCase() === stepPatternRootFolder(entry.kind).toLowerCase()) {
      continue;
    }
    ensureAncestors(entry.kind, fullFolder);
  }

  return [...byKey.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.folder.localeCompare(b.folder)
  );
}

/**
 * Resolve an existing user folder by full 32-hex ID, unique 12-char hex prefix,
 * full `Step Patterns/<Patterns|Templates>/...` path, or relative path.
 */
export function resolveStepPatternFolderRef(
  folders: readonly TimelineOpStepPatternFolder[],
  ref: string,
  kind?: StepPatternLibraryKind
): TimelineOpStepPatternFolder {
  const trimmed = ref.trim();
  if (!trimmed) {
    throw new Error("Step pattern folder reference cannot be empty.");
  }

  const byId = folders.find((f) => f.id === trimmed);
  if (byId) {
    if (kind && byId.kind !== kind) {
      throw new Error(
        `Folder "${byId.folder}" belongs to the ${byId.kind} section, not ${kind}.`
      );
    }
    return byId;
  }

  if (isShortResourceId(trimmed)) {
    const matches = folders.filter(
      (f) => f.id !== undefined && f.id.startsWith(trimmed)
    );
    if (matches.length > 1) {
      throw new Error(
        `Short folder id "${trimmed}" matches ${matches.length} folders; use the full id.`
      );
    }
    if (matches.length === 1) {
      const hit = matches[0]!;
      if (kind && hit.kind !== kind) {
        throw new Error(
          `Folder "${hit.folder}" belongs to the ${hit.kind} section, not ${kind}.`
        );
      }
      return hit;
    }
    throw new Error(`No step pattern folder found matching "${trimmed}".`);
  }

  if (isFullResourceId(trimmed)) {
    throw new Error(`No step pattern folder found matching "${trimmed}".`);
  }

  const pathKind = stepPatternKindFromFolderPath(trimmed);
  if (pathKind !== null) {
    if (kind && pathKind !== kind) {
      throw new Error(
        `Folder "${trimmed}" belongs to the ${pathKind} section, not ${kind}.`
      );
    }
    const normalized = normalizeStepPatternSubfolderPath(pathKind, trimmed);
    const hit = folders.find(
      (f) => f.kind === pathKind && f.folder.toLowerCase() === normalized.toLowerCase()
    );
    if (!hit) {
      throw new Error(`No step pattern folder found matching "${trimmed}".`);
    }
    return hit;
  }

  if (kind) {
    const normalized = normalizeStepPatternSubfolderPath(kind, trimmed);
    const hit = folders.find(
      (f) => f.kind === kind && f.folder.toLowerCase() === normalized.toLowerCase()
    );
    if (!hit) {
      throw new Error(
        `No step pattern folder found matching "${trimmed}" in ${kind}s.`
      );
    }
    return hit;
  }

  const candidates: TimelineOpStepPatternFolder[] = [];
  for (const k of ["pattern", "template"] as const) {
    const normalized = normalizeStepPatternSubfolderPath(k, trimmed);
    const hit = folders.find(
      (f) => f.kind === k && f.folder.toLowerCase() === normalized.toLowerCase()
    );
    if (hit) candidates.push(hit);
  }
  if (candidates.length > 1) {
    throw new Error(
      `Folder "${trimmed}" exists in both Patterns and Templates; pass kind: "pattern" or "template".`
    );
  }
  if (candidates.length === 1) {
    return candidates[0]!;
  }
  throw new Error(`No step pattern folder found matching "${trimmed}".`);
}

/** Validate and resolve target path for creating a new user step pattern folder. */
export function resolveCreateStepPatternFolderTarget(
  folders: readonly TimelineOpStepPatternFolder[],
  args: {
    kind?: StepPatternLibraryKind;
    name: string;
    parentFolder?: string;
  }
): {
  kind: StepPatternLibraryKind;
  name: string;
  folder: string;
  parentFolder: string;
} {
  let effectiveKind: StepPatternLibraryKind;
  let baseFolder: string;

  const parentRaw = args.parentFolder?.trim();
  if (parentRaw) {
    const byId = folders.find((f) => f.id === parentRaw);
    if (byId) {
      if (args.kind && byId.kind !== args.kind) {
        throw new Error(
          `Parent folder "${byId.folder}" belongs to the ${byId.kind} section, not ${args.kind}.`
        );
      }
      effectiveKind = byId.kind;
      baseFolder = byId.folder;
    } else if (isShortResourceId(parentRaw)) {
      const matches = folders.filter(
        (f) => f.id !== undefined && f.id.startsWith(parentRaw)
      );
      if (matches.length > 1) {
        throw new Error(
          `Short parent folder id "${parentRaw}" matches ${matches.length} folders; use the full id.`
        );
      }
      if (matches.length === 0) {
        throw new Error(`Parent step pattern folder "${parentRaw}" was not found.`);
      }
      const hit = matches[0]!;
      if (args.kind && hit.kind !== args.kind) {
        throw new Error(
          `Parent folder "${hit.folder}" belongs to the ${hit.kind} section, not ${args.kind}.`
        );
      }
      effectiveKind = hit.kind;
      baseFolder = hit.folder;
    } else if (isFullResourceId(parentRaw)) {
      throw new Error(`Parent step pattern folder "${parentRaw}" was not found.`);
    } else {
      const parentPathKind = stepPatternKindFromFolderPath(parentRaw);
      if (parentPathKind && args.kind && parentPathKind !== args.kind) {
        throw new Error(
          `Parent folder "${parentRaw}" belongs to the ${parentPathKind} section, not ${args.kind}.`
        );
      }
      effectiveKind = args.kind ?? parentPathKind ?? "pattern";
      const normalizedParent = normalizeStepPatternFolderPath(effectiveKind, parentRaw);
      const existingParent = folders.find(
        (f) =>
          f.kind === effectiveKind &&
          f.folder.toLowerCase() === normalizedParent.toLowerCase()
      );
      baseFolder = existingParent ? existingParent.folder : normalizedParent;
    }
  } else {
    const namePathKind = stepPatternKindFromFolderPath(args.name);
    if (namePathKind && args.kind && namePathKind !== args.kind) {
      throw new Error(
        `Folder "${args.name}" belongs to the ${namePathKind} section, not ${args.kind}.`
      );
    }
    effectiveKind = args.kind ?? namePathKind ?? "pattern";
    baseFolder = stepPatternRootFolder(effectiveKind);
  }

  const root = stepPatternRootFolder(effectiveKind);
  if (parentRaw && stepPatternKindFromFolderPath(args.name) !== null) {
    throw new Error(
      "Pass either a relative folder name under parentFolder or a full folder path without parentFolder."
    );
  }

  const childFull = normalizeStepPatternSubfolderPath(effectiveKind, args.name);
  const childRelative = childFull.slice(root.length + 1);
  const fullFolder =
    baseFolder.toLowerCase() === root.toLowerCase()
      ? childFull
      : normalizeStepPatternSubfolderPath(
          effectiveKind,
          `${baseFolder}/${childRelative}`
        );

  if (
    folders.some(
      (f) =>
        f.kind === effectiveKind &&
        f.folder.toLowerCase() === fullFolder.toLowerCase()
    )
  ) {
    throw new Error(`Step pattern folder "${fullFolder}" already exists.`);
  }

  return {
    kind: effectiveKind,
    name: stepPatternFolderName(fullFolder),
    folder: fullFolder,
    parentFolder: parentStepPatternFolder(effectiveKind, fullFolder)
  };
}

/** Validate and resolve a folder rename in place under its existing parent. */
export function resolveRenameStepPatternFolderTarget(
  folders: readonly TimelineOpStepPatternFolder[],
  args: {
    folder: string;
    newName: string;
    kind?: StepPatternLibraryKind;
  }
): {
  current: TimelineOpStepPatternFolder;
  kind: StepPatternLibraryKind;
  name: string;
  previousFolder: string;
  folder: string;
  parentFolder: string;
} {
  const current = resolveStepPatternFolderRef(folders, args.folder, args.kind);
  const leaf = validateStepPatternFolderSegment(args.newName);
  const newFolder = `${current.parentFolder}/${leaf}`;
  const caseOnly = newFolder.toLowerCase() === current.folder.toLowerCase();
  if (
    !caseOnly &&
    folders.some(
      (f) =>
        f.kind === current.kind &&
        f.folder.toLowerCase() === newFolder.toLowerCase()
    )
  ) {
    throw new Error(`Step pattern folder "${newFolder}" already exists.`);
  }
  return {
    current,
    kind: current.kind,
    name: leaf,
    previousFolder: current.folder,
    folder: newFolder,
    parentFolder: current.parentFolder
  };
}

/**
 * Resolve a user step pattern or template by full 32-hex ID, unique 12-char
 * hex prefix, or unique case-insensitive name. Refuses factory patterns and
 * ambiguous prefixes/names.
 */
export function resolveUserStepPatternRef<
  T extends Pick<TimelineOpUserStepPattern, "id" | "name" | "kind" | "folder">
>(entries: readonly T[], ref: string): T {
  const trimmed = ref.trim();
  if (!trimmed) {
    throw new Error("Step pattern reference cannot be empty.");
  }

  const byId = entries.find((e) => e.id === trimmed);
  if (byId) return byId;

  if (isShortResourceId(trimmed)) {
    const matches = entries.filter((e) => e.id.startsWith(trimmed));
    if (matches.length > 1) {
      throw new Error(
        `Short step pattern id "${trimmed}" matches ${matches.length} user patterns; use the full id.`
      );
    }
    if (matches.length === 1) return matches[0]!;
  }

  const lower = trimmed.toLowerCase();
  const nameMatches = entries.filter((e) => e.name.toLowerCase() === lower);
  if (nameMatches.length > 1) {
    throw new Error(
      `Step pattern name "${trimmed}" matches ${nameMatches.length} user patterns (${nameMatches.map((e) => e.id).join(", ")}); use an id.`
    );
  }
  if (nameMatches.length === 1) return nameMatches[0]!;

  const factory = findFactoryStepPattern(trimmed);
  if (factory) {
    throw new Error(
      `Cannot move factory ${factory.kind} "${factory.name}". Only user patterns and templates can be moved between folders.`
    );
  }

  throw new Error(
    `No user step pattern or template found matching "${trimmed}". Call list_step_patterns to see saved user patterns.`
  );
}

/**
 * Resolve a destination folder for moving or saving a user pattern/template:
 * empty/null -> section root; full or 12-char folder ID -> matched folder
 * (same kind required); path -> normalized path (preserving existing casing).
 */
export function resolveMoveDestinationFolder(
  folders: readonly TimelineOpStepPatternFolder[],
  kind: StepPatternLibraryKind,
  folderArg?: string | null
): string {
  const root = stepPatternRootFolder(kind);
  if (folderArg === undefined || folderArg === null) return root;
  const trimmed = folderArg.trim();
  if (!trimmed || trimmed === "/") return root;

  const byId = folders.find((f) => f.id === trimmed);
  if (byId) {
    if (byId.kind !== kind) {
      throw new Error(
        `Cannot move ${kind} into ${byId.kind} folder "${byId.folder}".`
      );
    }
    return byId.folder;
  }

  if (isShortResourceId(trimmed)) {
    const matches = folders.filter(
      (f) => f.id !== undefined && f.id.startsWith(trimmed)
    );
    if (matches.length > 1) {
      throw new Error(
        `Short folder id "${trimmed}" matches ${matches.length} folders; use the full id.`
      );
    }
    if (matches.length === 1) {
      const hit = matches[0]!;
      if (hit.kind !== kind) {
        throw new Error(
          `Cannot move ${kind} into ${hit.kind} folder "${hit.folder}".`
        );
      }
      return hit.folder;
    }
    throw new Error(`No step pattern folder found matching "${trimmed}".`);
  }

  if (isFullResourceId(trimmed)) {
    throw new Error(`No step pattern folder found matching "${trimmed}".`);
  }

  const normalized = normalizeStepPatternFolderPath(kind, trimmed);
  const existing = folders.find(
    (f) => f.kind === kind && f.folder.toLowerCase() === normalized.toLowerCase()
  );
  return existing ? existing.folder : normalized;
}
