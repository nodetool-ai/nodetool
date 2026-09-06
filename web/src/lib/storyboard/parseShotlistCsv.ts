/**
 * Shotlist CSV import (PRD § 7.7.8).
 *
 * A creator's shotlist arrives from a spreadsheet, so the file is real CSV:
 * quoted fields, embedded commas, dialogue that runs over several lines.
 * Papaparse does RFC 4180 and is already a web dependency (the sandbox `csv`
 * pack runs the same library on the host), so nothing here re-implements
 * quoting.
 *
 * What this file owns is the contract around the parse: which headers are
 * required, how a scene value becomes a slugline, which vocabulary values are
 * accepted, and the report of everything it refused to import. A discarded
 * value never fails the file — the rest imports and the report names the row,
 * the column and the value.
 *
 * Pure: no store, no DOM, no fetch.
 */

import Papa from "papaparse";
import type { CameraDirection, Scene, Shot } from "@nodetool-ai/protocol";
import {
  ANGLE_OPTIONS,
  EQUIPMENT_OPTIONS,
  FRAMING_OPTIONS,
  LENS_OPTIONS,
  MOVEMENT_OPTIONS
} from "../../components/storyboard/cameraOptions";

/** Header names, in the order the template writes them. Order is free. */
export const SHOTLIST_COLUMNS = [
  "scene",
  "shot",
  "description",
  "dialogue",
  "duration_seconds",
  "size",
  "perspective",
  "movement",
  "equipment",
  "focal_length",
  "notes"
] as const;

/** Without these two a row describes nothing (PRD § 7.7.8). */
export const REQUIRED_COLUMNS = ["scene", "description"] as const;

/** A scene value opening with one of these is a slugline as written. */
const SLUGLINE_PREFIXES = ["int./ext.", "int.", "ext."];

/** One value the import refused, in the words a creator can act on. */
export interface ShotlistReportEntry {
  /** Spreadsheet row: the header is row 1, so the first shot is row 2. */
  row: number;
  column: string;
  value: string;
  reason: string;
}

export interface ShotlistImport {
  scenes: Scene[];
  /** Contiguous `index` from 0, in scene order (PRD § 7.7.3). */
  shots: Shot[];
  /** Every discarded value and skipped row. Empty on a clean file. */
  report: ShotlistReportEntry[];
}

export type ShotlistParseResult =
  | { ok: true; result: ShotlistImport }
  | { ok: false; error: string; missingColumns: string[] };

/** The vocabulary column → its option list and the camera field it fills. */
const VOCABULARIES = {
  size: {
    options: FRAMING_OPTIONS,
    write: (camera: CameraDirection, value: string) => {
      camera.framing = value;
    }
  },
  perspective: {
    options: ANGLE_OPTIONS,
    write: (camera: CameraDirection, value: string) => {
      camera.angle = value;
    }
  },
  movement: {
    options: MOVEMENT_OPTIONS,
    write: (camera: CameraDirection, value: string) => {
      camera.movement = value;
    }
  },
  equipment: {
    options: EQUIPMENT_OPTIONS,
    write: (camera: CameraDirection, value: string) => {
      camera.equipment = value;
    }
  },
  focal_length: {
    options: LENS_OPTIONS,
    write: (camera: CameraDirection, value: string) => {
      camera.lens = value;
    }
  }
} as const;

type VocabularyColumn = keyof typeof VOCABULARIES;

/** Match a value against an option list case-insensitively, or null. */
function matchVocabulary(
  value: string,
  options: readonly string[]
): string | null {
  const wanted = value.trim().toLowerCase();
  return options.find((option) => option.toLowerCase() === wanted) ?? null;
}

/** Numeric shot values sort ascending; the rest keep row order behind them. */
function sortWithinScene<T extends { shot: string; row: number }>(
  rows: readonly T[]
): T[] {
  const numeric: { row: T; key: number }[] = [];
  const rest: T[] = [];
  for (const row of rows) {
    const key = Number(row.shot.trim());
    if (row.shot.trim() !== "" && Number.isFinite(key)) {
      numeric.push({ row, key });
    } else {
      rest.push(row);
    }
  }
  numeric.sort((a, b) => a.key - b.key);
  return [...numeric.map((entry) => entry.row), ...rest];
}

interface ParsedRow {
  row: number;
  scene: string;
  shot: string;
  cells: Record<string, string>;
}

const cell = (record: Record<string, string>, column: string): string =>
  (record[column] ?? "").trim();

/**
 * Parse a shotlist. A file missing a required header is refused whole, naming
 * the header — nothing else it holds is worth importing without one.
 */
export function parseShotlistCsv(csv: string): ShotlistParseResult {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    // Headers travel from a spreadsheet with stray case and padding; the
    // values are the creator's and are never touched here.
    transformHeader: (header) => header.trim().toLowerCase()
  });

  const headers = parsed.meta.fields ?? [];
  const missingColumns = REQUIRED_COLUMNS.filter(
    (column) => !headers.includes(column)
  );
  if (missingColumns.length > 0) {
    return {
      ok: false,
      missingColumns,
      error: `This CSV is missing the ${missingColumns.join(" and ")} column${
        missingColumns.length === 1 ? "" : "s"
      }. Add ${missingColumns.length === 1 ? "it" : "them"} and import again.`
    };
  }

  const report: ShotlistReportEntry[] = [];
  const rows: ParsedRow[] = [];
  parsed.data.forEach((record, position) => {
    // Row 1 is the header, so a creator reading the file sees this number.
    const row = position + 2;
    const description = cell(record, "description");
    if (description === "") {
      report.push({
        row,
        column: "description",
        value: "",
        reason: "Row skipped: a shot needs a description."
      });
      return;
    }
    rows.push({
      row,
      scene: cell(record, "scene"),
      shot: cell(record, "shot"),
      cells: record
    });
  });

  // `scene` groups rows; a scene's position is where it first appears.
  const grouped = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    const existing = grouped.get(row.scene);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(row.scene, [row]);
    }
  }

  const scenes: Scene[] = [];
  const shots: Shot[] = [];
  let sceneNumber = 0;
  for (const [value, sceneRows] of grouped) {
    sceneNumber += 1;
    const slugline = SLUGLINE_PREFIXES.some((prefix) =>
      value.toLowerCase().startsWith(prefix)
    )
      ? value
      : `Scene ${sceneNumber}`;
    const scene: Scene = {
      type: "scene",
      id: `csv-scene-${sceneNumber}`,
      slugline
    };
    scenes.push(scene);
    for (const row of sortWithinScene(sceneRows)) {
      shots.push(buildShot(row, scene.id, shots.length, report));
    }
  }

  // Rows are reported as they are read and again as they are built, so one
  // pass at the end puts the report back in file order.
  report.sort((a, b) => a.row - b.row);
  return { ok: true, result: { scenes, shots, report } };
}

/** One row as a shot, reporting every value it could not accept. */
function buildShot(
  row: ParsedRow,
  sceneId: string,
  index: number,
  report: ShotlistReportEntry[]
): Shot {
  const shot: Shot = {
    type: "shot",
    id: `csv-shot-${index + 1}`,
    index,
    action: cell(row.cells, "description"),
    status: "planned",
    scene_id: sceneId
  };

  const dialogue = cell(row.cells, "dialogue");
  if (dialogue !== "") {
    shot.dialogue = dialogue;
  }
  const notes = cell(row.cells, "notes");
  if (notes !== "") {
    shot.notes = notes;
  }

  const duration = cell(row.cells, "duration_seconds");
  if (duration !== "") {
    const seconds = Number(duration);
    if (Number.isFinite(seconds) && seconds > 0) {
      shot.duration_seconds = seconds;
    } else {
      report.push({
        row: row.row,
        column: "duration_seconds",
        value: duration,
        reason: "Not a positive number. The shot imported without a duration."
      });
    }
  }

  const camera: CameraDirection = {};
  for (const column of Object.keys(VOCABULARIES) as VocabularyColumn[]) {
    const value = cell(row.cells, column);
    if (value === "") {
      continue;
    }
    const { options, write } = VOCABULARIES[column];
    const matched = matchVocabulary(value, options);
    if (matched === null) {
      report.push({
        row: row.row,
        column,
        value,
        reason: `Not one of: ${options.join(", ")}. The shot imported without it.`
      });
      continue;
    }
    write(camera, matched);
  }
  if (Object.keys(camera).length > 0) {
    shot.camera = camera;
  }

  return shot;
}

export default parseShotlistCsv;
