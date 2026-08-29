/**
 * What a project card says about itself, derived from the documents the
 * server returned. Pure: the same summary always reads the same way, and the
 * wording is testable without rendering a card.
 *
 * Only facts the summary carries are stated. A cut's render state is not one
 * of them — nothing records it — so no card claims a project is delivered.
 */

import type { RouterOutputs } from "../../trpc/client";

export type ProjectDetail = RouterOutputs["projects"]["summaries"][number];
export type ProjectDocument = ProjectDetail["documents"][number];
export type ProjectDocumentStatus = NonNullable<ProjectDocument["status"]>;

const statusOfKind = <K extends ProjectDocumentStatus["kind"]>(
  documents: readonly ProjectDocument[],
  kind: K
): Extract<ProjectDocumentStatus, { kind: K }> | undefined => {
  for (const doc of documents) {
    if (doc.status?.kind === kind) {
      return doc.status as Extract<ProjectDocumentStatus, { kind: K }>;
    }
  }
  return undefined;
};

/** `123456` → `2:03`. */
export const formatDuration = (durationMs: number): string => {
  const total = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * The card's one-line status. Documents of the same kind collapse onto the
 * newest of them — a card is a glance, and the overview tab has the rest.
 */
export const projectStatusLine = (
  documents: readonly ProjectDocument[]
): string => {
  if (documents.length === 0) {
    return "No documents yet";
  }
  const parts: string[] = [];

  const board = statusOfKind(documents, "storyboard");
  if (board) {
    parts.push(`${board.shots} shots`);
    if (board.shots > 0) {
      parts.push(`stills ${board.stills}/${board.shots}`);
    }
  }

  const script = statusOfKind(documents, "script");
  if (script) {
    parts.push(`voiced ${script.voiced}/${script.lines}`);
    if (script.stale > 0) {
      parts.push(`${script.stale} stale`);
    }
  }

  const cut = statusOfKind(documents, "timeline");
  if (cut) {
    parts.push(`cut ${cut.clips} clips · ${formatDuration(cut.durationMs)}`);
  }

  if (parts.length === 0) {
    const label = documents.length === 1 ? "document" : "documents";
    return `${documents.length} ${label}`;
  }
  return parts.join(" · ");
};

export interface ProjectProgress {
  label: string;
  /** Everything the board set out to render exists. */
  done: boolean;
}

/**
 * The pill over the card's montage: how far the clips have got. A project
 * with no board and no cut gets none rather than an invented one.
 */
export const projectProgress = (
  documents: readonly ProjectDocument[]
): ProjectProgress | null => {
  const board = statusOfKind(documents, "storyboard");
  if (board && board.shots > 0) {
    return {
      label: `clips ${board.clips}/${board.shots}`,
      done: board.clips === board.shots
    };
  }
  const cut = statusOfKind(documents, "timeline");
  if (cut) {
    return { label: `cut · ${formatDuration(cut.durationMs)}`, done: false };
  }
  return null;
};

/** `$4.12`, and what the ledger could not price rather than a silent zero. */
export const formatSpend = (spend: ProjectDetail["spend"]): string => {
  const amount = `$${spend.totalUsd.toFixed(2)}`;
  return spend.unpricedCount > 0
    ? `${amount} · ${spend.unpricedCount} unpriced`
    : amount;
};
