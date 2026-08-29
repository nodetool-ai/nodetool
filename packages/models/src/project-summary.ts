/**
 * What a project is made of, and what it cost.
 *
 * A project row carries a name and nothing else, so the overview reads its
 * documents: one query per document table filtered on `project_id`, each row
 * reduced to what a card shows. Status is derived from the stored document
 * every time it is asked for — a board that gained a still is behind by
 * exactly one read, never by a stale counter nobody remembered to bump.
 *
 * Spend comes from the prediction ledger, filtered on the same project id.
 * Rows with no price are counted rather than summed as zero, so a total is a
 * lower bound the caller can say so about (the `nodetool costs` convention).
 */

import {
  effectiveVoice,
  needsVoicing,
  currentTake,
  scriptLines
} from "@nodetool-ai/timeline";
import type {
  ScriptLine as ProtocolScriptLine,
  ScriptSection as ProtocolScriptSection,
  Speaker as ProtocolSpeaker
} from "@nodetool-ai/protocol/api-schemas/scripts.js";
import { Application } from "./application.js";
import { ImageDocument } from "./image-document.js";
import { JsScript } from "./js-script.js";
import { Prediction } from "./prediction.js";
import { Script, type ScriptDocument } from "./script.js";
import { Storyboard, type StoryboardDocument } from "./storyboard.js";
import { TimelineSequence } from "./timeline-sequence.js";

/**
 * The document kinds a project groups, spelled as the workspace tab type that
 * opens each one — `web`'s `WorkspaceTabType`, so a ref opens a tab with no
 * translation table in between.
 */
export type ProjectDocumentType =
  | "storyboard"
  | "script"
  | "timeline"
  | "sketch"
  | "application"
  | "jsscript";

/** One document in a project, as a tab-open needs it. */
export interface ProjectDocumentRef {
  type: ProjectDocumentType;
  /** The document id — what a tab's `ref` carries. */
  ref: string;
  name: string;
  updatedAt: string;
}

export interface StoryboardStatus {
  kind: "storyboard";
  shots: number;
  /** Shots with a selected still. */
  stills: number;
  /** Shots with a selected clip. */
  clips: number;
}

export interface ScriptStatus {
  kind: "script";
  lines: number;
  /** Lines whose current take matches their text and voice. */
  voiced: number;
  /** Lines with a take that drifted from the text or voice it was voiced from. */
  stale: number;
}

/**
 * A cut's size. Whether it has been *rendered* is not recorded anywhere on the
 * sequence row, so it is not reported — an omitted fact beats an invented one.
 */
export interface TimelineStatus {
  kind: "timeline";
  clips: number;
  durationMs: number;
}

export type ProjectDocumentStatus =
  | StoryboardStatus
  | ScriptStatus
  | TimelineStatus;

/**
 * A media locator a card can render — the stored `*Ref` shape, passed through
 * untouched. `asset://` is an identifier, not a URL, so the client resolves it.
 */
export interface ProjectThumbnail {
  uri?: string;
  asset_id?: string | null;
}

/** A document card: the tab-open ref, what it shows, and what it cost. */
export interface ProjectDocumentSummary extends ProjectDocumentRef {
  status: ProjectDocumentStatus | null;
  /** Priced spend attributed to this document, in USD. */
  spendUsd: number;
  /** Calls attributed to it that no catalog priced. */
  unpricedCount: number;
  /** Stills the card montages, oldest shot first. Empty when there are none. */
  thumbnails: ProjectThumbnail[];
}

/** What a run paid for, in the categories the spend bar is split by. */
export type SpendCategory = "stills" | "clips" | "voice" | "pipeline";

export interface CategorySpend {
  category: SpendCategory;
  usd: number;
  unpricedCount: number;
}

export interface ProjectSpend {
  /** Sum of every priced row. A lower bound when `unpricedCount` is non-zero. */
  totalUsd: number;
  unpricedCount: number;
  byCategory: CategorySpend[];
}

export interface ProjectSummary {
  documents: ProjectDocumentSummary[];
  spend: ProjectSpend;
}

// ── Status ───────────────────────────────────────────────────────────────────

/** How many stills a card's montage shows. The mockup's grid holds three. */
const MONTAGE_LIMIT = 3;

export function storyboardStatus(doc: StoryboardDocument): StoryboardStatus {
  return {
    kind: "storyboard",
    shots: doc.shots.length,
    stills: doc.shots.filter((shot) => shot.keyframe != null).length,
    clips: doc.shots.filter((shot) => shot.clip != null).length
  };
}

/** The first stills a board has rendered, for the card montage. */
export function storyboardThumbnails(
  doc: StoryboardDocument,
  limit = MONTAGE_LIMIT
): ProjectThumbnail[] {
  const stills: ProjectThumbnail[] = [];
  for (const shot of doc.shots) {
    if (stills.length >= limit) break;
    const keyframe = shot.keyframe;
    if (!keyframe) continue;
    stills.push({
      uri: keyframe.uri,
      asset_id: keyframe.asset_id ?? null
    });
  }
  return stills;
}

export function scriptStatus(doc: ScriptDocument): ScriptStatus {
  const cast = doc.cast as ProtocolSpeaker[];
  const lines = scriptLines(doc.sections as ProtocolScriptSection[]);
  let voiced = 0;
  let stale = 0;
  for (const line of lines as ProtocolScriptLine[]) {
    if (!needsVoicing(line, effectiveVoice(line, cast))) {
      voiced += 1;
    } else if (currentTake(line)) {
      stale += 1;
    }
  }
  return { kind: "script", lines: lines.length, voiced, stale };
}

export function timelineStatus(
  clipCount: number,
  durationMs: number
): TimelineStatus {
  return { kind: "timeline", clips: clipCount, durationMs };
}

// ── Spend ────────────────────────────────────────────────────────────────────

const CAPABILITY_CATEGORY: Record<string, SpendCategory> = {
  text_to_image: "stills",
  image_to_image: "stills",
  inpainting: "stills",
  upscale_image: "stills",
  remove_background: "stills",
  relight_image: "stills",
  vectorize_image: "stills",
  text_to_video: "clips",
  image_to_video: "clips",
  video_to_video: "clips",
  lip_sync: "clips",
  text_to_speech: "voice",
  text_to_music: "voice",
  automatic_speech_recognition: "voice"
};

/** The fields of a ledger row the category is read off. */
export interface SpendRow {
  cost: number | null;
  /** The project document the charge belongs to, when the caller named one. */
  document_id?: string | null;
  node_type?: string | null;
  billing_unit?: string | null;
  metadata?: unknown;
}

const capabilityOf = (row: SpendRow): string | null => {
  const metadata = row.metadata;
  if (metadata && typeof metadata === "object") {
    // SAFETY: `metadata` is a non-null object; the assertion only declares
    // `capability` optional and `unknown`, and the read is re-checked below.
    const capability = (metadata as { capability?: unknown }).capability;
    if (typeof capability === "string" && capability.length > 0) {
      return capability;
    }
  }
  // An unpriced generation records its capability as the billing unit, since
  // no catalog answered with a real one.
  return row.billing_unit ?? null;
};

/**
 * Which slice of the spend bar a ledger row belongs to. A capability answers
 * directly; a node-reported charge that carries none is read off the node
 * type, which names its own medium. Everything else is pipeline — the LLM
 * calls that planned the work, and any node that spent without saying on what.
 */
export function spendCategory(row: SpendRow): SpendCategory {
  const capability = capabilityOf(row);
  const byCapability = capability
    ? CAPABILITY_CATEGORY[capability]
    : undefined;
  if (byCapability) return byCapability;

  const nodeType = (row.node_type ?? "").toLowerCase();
  if (nodeType.includes("video")) return "clips";
  if (nodeType.includes("image")) return "stills";
  if (nodeType.includes("speech") || nodeType.includes("audio")) return "voice";
  return "pipeline";
}

const CATEGORY_ORDER: SpendCategory[] = [
  "stills",
  "clips",
  "voice",
  "pipeline"
];

/** Roll a project's ledger rows up into the bar's four segments. */
export function summarizeSpend(rows: SpendRow[]): ProjectSpend {
  const usd = new Map<SpendCategory, number>();
  const unpriced = new Map<SpendCategory, number>();
  for (const row of rows) {
    const category = spendCategory(row);
    if (row.cost == null) {
      unpriced.set(category, (unpriced.get(category) ?? 0) + 1);
    } else {
      usd.set(category, (usd.get(category) ?? 0) + row.cost);
    }
  }
  const byCategory = CATEGORY_ORDER.map((category) => ({
    category,
    usd: usd.get(category) ?? 0,
    unpricedCount: unpriced.get(category) ?? 0
  }));
  return {
    totalUsd: byCategory.reduce((sum, entry) => sum + entry.usd, 0),
    unpricedCount: byCategory.reduce(
      (sum, entry) => sum + entry.unpricedCount,
      0
    ),
    byCategory
  };
}

// ── Gathering ────────────────────────────────────────────────────────────────

interface ProjectDocumentRows {
  storyboards: Storyboard[];
  scripts: Script[];
  timelines: TimelineSequence[];
  sketches: ImageDocument[];
  applications: Application[];
  jsScripts: JsScript[];
}

/**
 * One query per document table — the tables share only the column, so there is
 * no join to make here.
 */
async function loadProjectDocuments(
  userId: string,
  projectId: string
): Promise<ProjectDocumentRows> {
  const [storyboards, scripts, timelines, sketches, applications, jsScripts] =
    await Promise.all([
      Storyboard.listByProject(projectId, userId),
      Script.listByProject(projectId, userId),
      TimelineSequence.listByProject(projectId, userId),
      ImageDocument.listByProject(projectId, userId),
      Application.listByProject(projectId, userId),
      JsScript.listByProject(projectId, userId)
    ]);
  return { storyboards, scripts, timelines, sketches, applications, jsScripts };
}

const toRef = (
  type: ProjectDocumentType,
  row: { id: string; name: string; updated_at: string }
): ProjectDocumentRef => ({
  type,
  ref: row.id,
  name: row.name,
  updatedAt: row.updated_at
});

const newestFirst = <T extends ProjectDocumentRef>(refs: T[]): T[] =>
  refs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

/** Every document naming this project, newest first. */
export async function listProjectDocuments(
  userId: string,
  projectId: string
): Promise<ProjectDocumentRef[]> {
  const rows = await loadProjectDocuments(userId, projectId);
  return newestFirst([
    ...rows.storyboards.map((row) => toRef("storyboard", row)),
    ...rows.scripts.map((row) => toRef("script", row)),
    ...rows.timelines.map((row) => toRef("timeline", row)),
    ...rows.sketches.map((row) => toRef("sketch", row)),
    ...rows.applications.map((row) => toRef("application", row)),
    ...rows.jsScripts.map((row) => toRef("jsscript", row))
  ]);
}

/** Priced spend and unpriced calls per document id. */
function spendByDocument(
  ledger: SpendRow[]
): Map<string, { usd: number; unpriced: number }> {
  const perDocument = new Map<string, { usd: number; unpriced: number }>();
  for (const row of ledger) {
    const documentId = row.document_id;
    if (!documentId) continue;
    const entry = perDocument.get(documentId) ?? { usd: 0, unpriced: 0 };
    if (row.cost == null) entry.unpriced += 1;
    else entry.usd += row.cost;
    perDocument.set(documentId, entry);
  }
  return perDocument;
}

/**
 * The overview's payload: every document with its derived status and its share
 * of the ledger, plus the project's spend split by category.
 */
export async function summarizeProject(
  userId: string,
  projectId: string
): Promise<ProjectSummary> {
  const rows = await loadProjectDocuments(userId, projectId);
  const ledger = await Prediction.listByProject(userId, projectId);
  const perDocument = spendByDocument(ledger);

  const summarize = (
    ref: ProjectDocumentRef,
    status: ProjectDocumentStatus | null,
    thumbnails: ProjectThumbnail[] = []
  ): ProjectDocumentSummary => {
    const spend = perDocument.get(ref.ref);
    return {
      ...ref,
      status,
      spendUsd: spend?.usd ?? 0,
      unpricedCount: spend?.unpriced ?? 0,
      thumbnails
    };
  };

  const documents = newestFirst<ProjectDocumentSummary>([
    ...rows.storyboards.map((row) => {
      const doc = row.toDocument();
      return summarize(
        toRef("storyboard", row),
        storyboardStatus(doc),
        storyboardThumbnails(doc)
      );
    }),
    ...rows.scripts.map((row) =>
      summarize(toRef("script", row), scriptStatus(row.toDocument()))
    ),
    ...rows.timelines.map((row) =>
      summarize(
        toRef("timeline", row),
        timelineStatus(row.toDocument().clips.length, row.duration_ms)
      )
    ),
    ...rows.sketches.map((row) => summarize(toRef("sketch", row), null)),
    ...rows.applications.map((row) => summarize(toRef("application", row), null)),
    ...rows.jsScripts.map((row) => summarize(toRef("jsscript", row), null))
  ]);

  return { documents, spend: summarizeSpend(ledger) };
}
