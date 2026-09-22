import type { EntityKind } from "@nodetool-ai/protocol";

import type { EntityDetailsValue } from "./DetailsStep";

export type EntitySetupStage = "details" | "reference" | "review";

export interface EntitySetupDraft {
  readonly version: 1;
  readonly stage: EntitySetupStage;
  readonly details: EntityDetailsValue;
  readonly assetId: string | null;
}

const STORAGE_PREFIX = "nodetool-entity-setup-draft:";
const ENTITY_KINDS: ReadonlySet<string> = new Set([
  "character",
  "location",
  "style",
  "prop"
]);

const storageKey = (projectId?: string): string =>
  `${STORAGE_PREFIX}${projectId ?? "loose"}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStage = (value: unknown): value is EntitySetupStage =>
  value === "details" || value === "reference" || value === "review";

const parseDetails = (value: unknown): EntityDetailsValue | null => {
  if (!isRecord(value)) {
    return null;
  }
  const kind = value["kind"];
  const name = value["name"];
  const descriptor = value["descriptor"];
  const tags = value["tags"];
  if (
    typeof kind !== "string" ||
    !ENTITY_KINDS.has(kind) ||
    typeof name !== "string" ||
    typeof descriptor !== "string" ||
    typeof tags !== "string"
  ) {
    return null;
  }
  return { kind: kind as EntityKind, name, descriptor, tags };
};

export const readEntitySetupDraft = (
  projectId?: string
): EntitySetupDraft | null => {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (!raw) {
      return null;
    }
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value["version"] !== 1) {
      return null;
    }
    const stage = value["stage"];
    const details = parseDetails(value["details"]);
    const assetId = value["assetId"];
    if (
      !isStage(stage) ||
      !details ||
      (assetId !== null && typeof assetId !== "string")
    ) {
      return null;
    }
    return { version: 1, stage, details, assetId };
  } catch {
    return null;
  }
};

export const writeEntitySetupDraft = (
  projectId: string | undefined,
  draft: EntitySetupDraft
): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(draft));
  } catch {
    // Storage can be unavailable in private browsing. The mounted draft stays usable.
  }
};

export const clearEntitySetupDraft = (projectId?: string): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(storageKey(projectId));
  } catch {
    // A failed cleanup must not block creating or abandoning the entity.
  }
};
