/**
 * Factory Step Sequencer patterns and templates (SQ44, D92).
 *
 * At least 24 patterns spanning drums (four-on-the-floor, boom bap, trap,
 * breakbeat, house, techno, half-time, shuffle, plus extra grooves), bass,
 * keys and arps, plus 8 blank templates whose rows, subrows and settings
 * travel without step values.
 */

import type {
  MidiInstrument,
  Step,
  StepPattern,
  StepRate,
  StepRow,
  StepRowAssignment
} from "../types.js";
import {
  compactStep,
  defaultSubrowsForAssignment,
  normalizePattern,
  normalizeRow,
  patternFromText,
  stripPatternSteps
} from "./stepPattern.js";

/** Asset MIME type for user-saved patterns and templates (SQ44, D92). */
export const STEP_PATTERN_ASSET_CONTENT_TYPE = "application/x-nodetool-step-pattern";

/** Metadata key on user pattern/template assets. */
export const STEP_PATTERN_METADATA_KEY = "step_pattern";

/** Metadata key on explicit step pattern library folder assets (SQ43). */
export const STEP_PATTERN_FOLDER_METADATA_KEY = "step_pattern_folder";

export type StepPatternLibraryKind = "pattern" | "template";

// eslint-disable-next-line no-control-regex -- rejecting control characters in folder names
const FOLDER_CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Root asset folder for user patterns or templates (SQ44). */
export function stepPatternRootFolder(kind: StepPatternLibraryKind): string {
  return kind === "template" ? "Step Patterns/Templates" : "Step Patterns/Patterns";
}

/** Infer section kind from a full `Step Patterns/<Patterns|Templates>` path, or null. */
export function stepPatternKindFromFolderPath(
  folder: string
): StepPatternLibraryKind | null {
  const segments = folder
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== ".");
  if (segments.length < 2 || segments[0]!.toLowerCase() !== "step patterns") {
    return null;
  }
  const section = segments[1]!.toLowerCase();
  if (section === "patterns") return "pattern";
  if (section === "templates") return "template";
  return null;
}

/** Validate a single folder name segment (used for renames and segment checks). */
export function validateStepPatternFolderSegment(segment: string): string {
  const trimmed = segment.trim();
  if (!trimmed) {
    throw new Error("Step pattern folder name cannot be empty.");
  }
  if (trimmed === "." || trimmed === "..") {
    throw new Error(`Invalid step pattern folder name "${trimmed}".`);
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error(
      `Step pattern folder name "${trimmed}" must be a single segment without slashes.`
    );
  }
  if (FOLDER_CONTROL_CHARS.test(trimmed)) {
    throw new Error("Step pattern folder name cannot contain control characters.");
  }
  return trimmed;
}

/**
 * Normalize a relative or full folder path under `Step Patterns/<Patterns|Templates>`.
 * Empty / null / `"/"` resolves to the section root.
 */
export function normalizeStepPatternFolderPath(
  kind: StepPatternLibraryKind,
  folder?: string | null
): string {
  const rootFolder = stepPatternRootFolder(kind);
  if (folder === undefined || folder === null) return rootFolder;
  const rawSegments = folder
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== ".");
  if (rawSegments.some((s) => s === "..")) {
    throw new Error("Pattern folder cannot contain '..' path segments.");
  }
  if (rawSegments.some((s) => FOLDER_CONTROL_CHARS.test(s))) {
    throw new Error("Pattern folder cannot contain control characters.");
  }
  if (
    rawSegments.length >= 2 &&
    rawSegments[0]!.toLowerCase() === "step patterns"
  ) {
    const section = rawSegments[1]!.toLowerCase();
    const expectedSection = kind === "template" ? "templates" : "patterns";
    if (section === "patterns" || section === "templates") {
      if (section !== expectedSection) {
        const otherKind: StepPatternLibraryKind =
          section === "templates" ? "template" : "pattern";
        throw new Error(
          `Folder "${folder}" belongs to the ${otherKind} section, not ${kind}.`
        );
      }
      const subSegments = rawSegments.slice(2);
      return subSegments.length > 0
        ? `${rootFolder}/${subSegments.join("/")}`
        : rootFolder;
    }
  }
  return rawSegments.length > 0
    ? `${rootFolder}/${rawSegments.join("/")}`
    : rootFolder;
}

/** Normalize a non-root subfolder path; refuses the section root itself. */
export function normalizeStepPatternSubfolderPath(
  kind: StepPatternLibraryKind,
  folder: string
): string {
  const normalized = normalizeStepPatternFolderPath(kind, folder);
  const root = stepPatternRootFolder(kind);
  if (normalized.toLowerCase() === root.toLowerCase()) {
    throw new Error(
      `Cannot modify root folder "${root}"; specify a subfolder name.`
    );
  }
  return normalized;
}

/** Parent folder of `fullFolder`, clamped at the section root. */
export function parentStepPatternFolder(
  kind: StepPatternLibraryKind,
  fullFolder: string
): string {
  const root = stepPatternRootFolder(kind);
  const normalized = normalizeStepPatternFolderPath(kind, fullFolder);
  if (normalized.toLowerCase() === root.toLowerCase()) {
    return root;
  }
  const slash = normalized.lastIndexOf("/");
  const parent = slash >= 0 ? normalized.slice(0, slash) : root;
  return parent.length < root.length ? root : parent;
}

/** Leaf folder name of a normalized folder path. */
export function stepPatternFolderName(fullFolder: string): string {
  const slash = fullFolder.lastIndexOf("/");
  return slash >= 0 ? fullFolder.slice(slash + 1) : fullFolder;
}

/** True when `candidate` equals `folder` or lies inside it at a segment boundary. */
export function isWithinStepPatternFolder(
  candidate: string | undefined,
  folder: string
): boolean {
  if (!candidate) return false;
  const c = candidate.toLowerCase();
  const f = folder.toLowerCase();
  return c === f || c.startsWith(`${f}/`);
}

/** Rewrite a path at or inside `fromFolder` to sit at the matching path under `toFolder`. */
export function remapStepPatternFolderPath(
  candidate: string,
  fromFolder: string,
  toFolder: string
): string {
  if (!isWithinStepPatternFolder(candidate, fromFolder)) return candidate;
  return candidate.length === fromFolder.length
    ? toFolder
    : `${toFolder}${candidate.slice(fromFolder.length)}`;
}

/** Every subfolder from the immediate child of the section root down to `fullFolder`. */
export function stepPatternAncestorFolders(
  kind: StepPatternLibraryKind,
  fullFolder: string
): string[] {
  const root = stepPatternRootFolder(kind);
  const normalized = normalizeStepPatternFolderPath(kind, fullFolder);
  if (normalized.toLowerCase() === root.toLowerCase()) return [];
  const rest = normalized.slice(root.length + 1).split("/");
  const out: string[] = [];
  let acc = root;
  for (const segment of rest) {
    acc = `${acc}/${segment}`;
    out.push(acc);
  }
  return out;
}

export type StepPatternCategory = "drums" | "bass" | "keys" | "arps" | "templates";

export interface StepPatternLibraryEntry {
  id: string;
  name: string;
  kind: "pattern" | "template";
  category: StepPatternCategory;
  tags: readonly string[];
  pattern: StepPattern;
  instrument?: MidiInstrument;
  instrumentPreset?: string;
}

function drumPattern(
  id: string,
  name: string,
  tags: readonly string[],
  text: string,
  opts: {
    swing?: number;
    swingDivision?: "1/8" | "1/16";
    stepRate?: StepRate;
    seed?: number;
    instrumentPreset?: string;
  } = {}
): StepPatternLibraryEntry {
  const base = patternFromText(text, {
    name,
    seed: opts.seed ?? 1,
    stepRate: opts.stepRate ?? "1/16"
  });
  const pattern = normalizePattern({
    ...base,
    swing: opts.swing ?? 0,
    swingDivision: opts.swingDivision ?? "1/16"
  });
  const entry: StepPatternLibraryEntry = {
    id,
    name,
    kind: "pattern",
    category: "drums",
    tags,
    pattern
  };
  if (opts.instrumentPreset) entry.instrumentPreset = opts.instrumentPreset;
  return entry;
}

function melodicPattern(
  id: string,
  name: string,
  category: "bass" | "keys" | "arps",
  tags: readonly string[],
  rows: Array<{
    id: string;
    name?: string;
    assignment: StepRowAssignment;
    steps: Array<Partial<Step>>;
    stepRate?: StepRate;
    playback?: StepRow["playback"];
  }>,
  opts: {
    lengthSteps?: number;
    stepRate?: StepRate;
    swing?: number;
    legato?: boolean;
    mono?: boolean;
    pitchSource?: StepPattern["pitchSource"];
    scale?: StepPattern["scale"];
    instrumentPreset?: string;
  } = {}
): StepPatternLibraryEntry {
  const lengthSteps = opts.lengthSteps ?? 16;
  const stepRate: StepRate = opts.stepRate ?? "1/16";
  const builtRows: StepRow[] = rows.map((r) =>
    normalizeRow(
      {
        id: r.id,
        // normalizeRow leaves an undefined name off the row.
        name: r.name || undefined,
        assignment: r.assignment,
        lengthSteps: r.steps.length,
        loopStart: 0,
        loopEnd: r.steps.length,
        stepRate: r.stepRate ?? stepRate,
        playback: r.playback ?? "forward",
        subrows: defaultSubrowsForAssignment(r.assignment),
        steps: r.steps.map((s) => compactStep(s))
      },
      {
        lengthSteps,
        stepRate,
        playback: "forward",
        midiChannel: 1,
        automationMode: "latch"
      }
    )
  );
  const entry: StepPatternLibraryEntry = {
    id,
    name,
    kind: "pattern",
    category,
    tags,
    pattern: normalizePattern({
      name,
      lengthSteps,
      stepRate,
      swing: opts.swing ?? 0,
      legato: opts.legato ?? false,
      mono: opts.mono ?? false,
      pitchSource: opts.pitchSource ?? "off",
      scale: opts.scale ?? "chromatic",
      rows: builtRows
    })
  };
  if (opts.instrumentPreset) entry.instrumentPreset = opts.instrumentPreset;
  return entry;
}

function buildSteps(length: number, hits: Record<number, Partial<Step>>): Array<Partial<Step>> {
  return Array.from({ length }, (_, i) => hits[i] ?? {});
}

export const FACTORY_STEP_PATTERNS: readonly StepPatternLibraryEntry[] = [
  // ── Drums (12) ────────────────────────────────────────────────────────────
  drumPattern(
    "four-on-the-floor",
    "Four-on-the-Floor",
    ["drums", "dance", "club", "4x4"],
    [
      "Kick:          X... X... X... X...",
      "Snare:         .... x... .... x...",
      "Closed Hi-Hat: ..x. ..x. ..x. ..x."
    ].join("\n"),
    { instrumentPreset: "dr1-tr-void" }
  ),
  drumPattern(
    "boom-bap",
    "Boom Bap",
    ["drums", "hip-hop", "boom-bap", "swing"],
    [
      "Kick:          X..o ..x. ..X. ....",
      "Snare:         .... X..o .o.. X...",
      "Closed Hi-Hat: x.o. x.o. x.o. x.o.",
      "Open Hi-Hat:   .... .... .... ..o."
    ].join("\n"),
    { swing: 36, instrumentPreset: "dr1-tr-void" }
  ),
  drumPattern(
    "trap",
    "Trap",
    ["drums", "trap", "hip-hop", "808"],
    [
      "Kick:          X.....x. ..x.....",
      "Snare:         ........ X.......",
      "Clap:          ........ x.......",
      "Closed Hi-Hat: x.x.xxx. x.x.xxxx"
    ].join("\n"),
    { instrumentPreset: "dr1-tr-void" }
  ),
  drumPattern(
    "breakbeat",
    "Breakbeat",
    ["drums", "breakbeat", "funk", "jungle"],
    [
      "Kick:          X.x. .... ..x. ....",
      "Snare:         .... X..o .o.. X..o",
      "Closed Hi-Hat: x.x. x.x. x.x. x.x."
    ].join("\n"),
    { swing: 16, instrumentPreset: "dr1-tr-void" }
  ),
  drumPattern(
    "house",
    "House",
    ["drums", "house", "dance", "electronic"],
    [
      "Kick:          X... X... X... X...",
      "Clap:          .... X... .... X...",
      "Closed Hi-Hat: x.o. x.o. x.o. x.o.",
      "Open Hi-Hat:   ..x. ..x. ..x. ..x."
    ].join("\n"),
    { swing: 22, instrumentPreset: "dr1-tr-void" }
  ),
  drumPattern(
    "techno",
    "Techno",
    ["drums", "techno", "warehouse", "electronic"],
    [
      "Kick:          X... X... X... X...",
      "Closed Hi-Hat: ..X. ..X. ..X. ..X.",
      "Ride:          x.o. x.o. x.o. x.o.",
      "Clap:          .... x... .... x..o"
    ].join("\n"),
    { instrumentPreset: "dr1-tr-void" }
  ),
  drumPattern(
    "half-time",
    "Half-Time",
    ["drums", "halftime", "cinematic", "dubstep"],
    [
      "Kick:          X... .... ..x. ....",
      "Snare:         .... .... X... ....",
      "Closed Hi-Hat: x.o. x.o. x.o. x.o.",
      "Crash:         x... .... .... ...."
    ].join("\n"),
    { instrumentPreset: "dr1-cinematic" }
  ),
  drumPattern(
    "shuffle",
    "Shuffle",
    ["drums", "shuffle", "blues", "swing"],
    [
      "Kick:          X..o ..x. X..o ..x.",
      "Snare:         .... X... .... X..o",
      "Ride:          x.ox .ox. x.ox .ox."
    ].join("\n"),
    { swing: 66, instrumentPreset: "dr1-tr-void" }
  ),
  drumPattern(
    "dnb-two-step",
    "D&B Two-Step",
    ["drums", "dnb", "drum-and-bass", "fast"],
    [
      "Kick:          X... .... ..X. ....",
      "Snare:         .... X... .... X...",
      "Closed Hi-Hat: x.x. x.x. x.x. x.x.",
      "Open Hi-Hat:   ..o. .... .... ..o."
    ].join("\n"),
    { instrumentPreset: "dr1-tr-void" }
  ),
  drumPattern(
    "bossa-nova",
    "Bossa Nova",
    ["drums", "latin", "bossa", "acoustic"],
    [
      "Kick:          X..x X..x X..x X..x",
      "Side Stick:    x..x ..x. ..x. x...",
      "Closed Hi-Hat: x.o. x.o. x.o. x.o."
    ].join("\n"),
    { instrumentPreset: "dr1-tr-void" }
  ),
  drumPattern(
    "reggaeton",
    "Reggaeton",
    ["drums", "latin", "dembow", "pop"],
    [
      "Kick:          X... X... X... X...",
      "Snare:         ...x ..x. ...x ..x.",
      "Closed Hi-Hat: x.x. x.x. x.x. x.x."
    ].join("\n"),
    { instrumentPreset: "dr1-tr-void" }
  ),
  drumPattern(
    "afrobeat",
    "Afrobeat",
    ["drums", "afro", "groove", "percussion"],
    [
      "Kick:          X... ..x. ..x. ....",
      "Snare:         ...x ..o. .x.. ..x.",
      "Side Stick:    x..x ..x. .x.. x...",
      "Closed Hi-Hat: x.o. x.o. x.o. x.o."
    ].join("\n"),
    { swing: 24, instrumentPreset: "dr1-tr-void" }
  ),

  // ── Bass (4) ──────────────────────────────────────────────────────────────
  melodicPattern(
    "acid-303-bass",
    "Acid 303 Bass",
    "bass",
    ["bass", "acid", "303", "techno"],
    [
      {
        id: "bass",
        name: "Acid Line",
        assignment: { type: "melodic", pitch: 36 },
        steps: buildSteps(16, {
          0: { on: true, note: 0, velocity: 120, gate: 70 },
          2: { on: true, note: 0, velocity: 90, gate: 60 },
          3: { on: true, note: 12, velocity: 125, gate: 80 },
          6: { on: true, note: 3, velocity: 100, gate: 75 },
          7: { tie: true, gate: 60 },
          10: { on: true, note: 7, velocity: 115, gate: 70 },
          12: { on: true, note: 0, velocity: 100, gate: 65 },
          14: { on: true, note: 10, velocity: 120, gate: 80 }
        })
      }
    ],
    { mono: true, instrumentPreset: "bl1-acid" }
  ),
  melodicPattern(
    "octave-house-bass",
    "Octave House Bass",
    "bass",
    ["bass", "house", "octave", "club"],
    [
      {
        id: "bass",
        name: "Octave Bass",
        assignment: { type: "melodic", pitch: 36 },
        steps: buildSteps(16, {
          0: { on: true, note: 0, gate: 80 },
          2: { on: true, note: 12, gate: 70 },
          4: { on: true, note: 0, gate: 80 },
          6: { on: true, note: 12, gate: 70 },
          8: { on: true, note: 0, gate: 80 },
          10: { on: true, note: 12, gate: 70 },
          12: { on: true, note: 5, gate: 80 },
          14: { on: true, note: 7, gate: 70 }
        })
      }
    ],
    { swing: 18, mono: true, instrumentPreset: "bl1-deep" }
  ),
  melodicPattern(
    "sub-808-bass",
    "Sub 808 Bass",
    "bass",
    ["bass", "808", "trap", "sub"],
    [
      {
        id: "sub",
        name: "808 Sub",
        assignment: { type: "melodic", pitch: 36 },
        steps: buildSteps(16, {
          0: { on: true, note: 0, velocity: 120 },
          1: { tie: true },
          2: { tie: true },
          3: { tie: true, gate: 90 },
          6: { on: true, note: 0, velocity: 110 },
          7: { tie: true, gate: 85 },
          10: { on: true, note: 3, velocity: 115 },
          11: { tie: true },
          12: { tie: true, gate: 80 }
        })
      }
    ],
    { mono: true, instrumentPreset: "bl1-cinematic-sub" }
  ),
  melodicPattern(
    "funk-syncopated-bass",
    "Funk Syncopated Bass",
    "bass",
    ["bass", "funk", "groove", "syncopated"],
    [
      {
        id: "funk",
        name: "Funk Bass",
        assignment: { type: "melodic", pitch: 40 },
        steps: buildSteps(16, {
          0: { on: true, note: 0, velocity: 118, gate: 65 },
          3: { on: true, note: 0, velocity: 85, gate: 55 },
          5: { on: true, note: 3, velocity: 105, gate: 65 },
          6: { on: true, note: 5, velocity: 112, gate: 70 },
          10: { on: true, note: 7, velocity: 115, gate: 65 },
          12: { on: true, note: 10, velocity: 95, gate: 60 },
          14: { on: true, note: 12, velocity: 120, gate: 70 }
        })
      }
    ],
    { swing: 25, mono: true, instrumentPreset: "bl1-rubber" }
  ),

  // ── Keys & Chords (4) ─────────────────────────────────────────────────────
  melodicPattern(
    "deep-house-chords",
    "Deep House Chords",
    "keys",
    ["keys", "house", "chords", "stabs"],
    [
      {
        id: "r1",
        assignment: { type: "note", pitch: 57 },
        steps: buildSteps(16, { 0: { on: true, gate: 75 }, 3: { on: true, gate: 70 }, 6: { on: true, gate: 75 }, 11: { on: true, gate: 70 } })
      },
      {
        id: "r2",
        assignment: { type: "note", pitch: 60 },
        steps: buildSteps(16, { 0: { on: true, gate: 75 }, 3: { on: true, gate: 70 }, 6: { on: true, gate: 75 }, 11: { on: true, gate: 70 } })
      },
      {
        id: "r3",
        assignment: { type: "note", pitch: 64 },
        steps: buildSteps(16, { 0: { on: true, gate: 75 }, 3: { on: true, gate: 70 }, 6: { on: true, gate: 75 }, 11: { on: true, gate: 70 } })
      },
      {
        id: "r4",
        assignment: { type: "note", pitch: 67 },
        steps: buildSteps(16, { 0: { on: true, gate: 75 }, 3: { on: true, gate: 70 }, 6: { on: true, gate: 75 }, 11: { on: true, gate: 70 } })
      }
    ],
    { swing: 20, instrumentPreset: "wt1-soft-keys" }
  ),
  melodicPattern(
    "neo-soul-stabs",
    "Neo-Soul Stabs",
    "keys",
    ["keys", "neo-soul", "rhodes", "chords"],
    [
      {
        id: "r1",
        assignment: { type: "note", pitch: 53 },
        steps: buildSteps(16, { 0: { on: true }, 1: { tie: true }, 6: { on: true }, 10: { on: true }, 11: { tie: true } })
      },
      {
        id: "r2",
        assignment: { type: "note", pitch: 57 },
        steps: buildSteps(16, { 0: { on: true }, 1: { tie: true }, 6: { on: true }, 10: { on: true }, 11: { tie: true } })
      },
      {
        id: "r3",
        assignment: { type: "note", pitch: 60 },
        steps: buildSteps(16, { 0: { on: true }, 1: { tie: true }, 6: { on: true }, 10: { on: true }, 11: { tie: true } })
      },
      {
        id: "r4",
        assignment: { type: "note", pitch: 64 },
        steps: buildSteps(16, { 0: { on: true }, 1: { tie: true }, 6: { on: true }, 10: { on: true }, 11: { tie: true } })
      }
    ],
    { swing: 32, instrumentPreset: "wt1-soft-keys" }
  ),
  melodicPattern(
    "synthwave-pulse",
    "Synthwave Pulse",
    "keys",
    ["keys", "synthwave", "80s", "pulse"],
    [
      {
        id: "r1",
        assignment: { type: "note", pitch: 48 },
        steps: buildSteps(16, Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i * 2, { on: true, velocity: i % 2 === 0 ? 115 : 85, gate: 75 }])))
      },
      {
        id: "r2",
        assignment: { type: "note", pitch: 55 },
        steps: buildSteps(16, Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i * 2, { on: true, velocity: i % 2 === 0 ? 105 : 80, gate: 75 }])))
      },
      {
        id: "r3",
        assignment: { type: "note", pitch: 60 },
        steps: buildSteps(16, Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i * 2, { on: true, velocity: i % 2 === 0 ? 110 : 82, gate: 75 }])))
      }
    ],
    { instrumentPreset: "wt1-prime-lead" }
  ),
  melodicPattern(
    "piano-offbeat-chords",
    "Piano Offbeat Chords",
    "keys",
    ["keys", "piano", "reggae", "offbeat"],
    [
      {
        id: "r1",
        assignment: { type: "note", pitch: 60 },
        steps: buildSteps(16, { 2: { on: true, gate: 50 }, 6: { on: true, gate: 50 }, 10: { on: true, gate: 50 }, 14: { on: true, gate: 50 } })
      },
      {
        id: "r2",
        assignment: { type: "note", pitch: 64 },
        steps: buildSteps(16, { 2: { on: true, gate: 50 }, 6: { on: true, gate: 50 }, 10: { on: true, gate: 50 }, 14: { on: true, gate: 50 } })
      },
      {
        id: "r3",
        assignment: { type: "note", pitch: 67 },
        steps: buildSteps(16, { 2: { on: true, gate: 50 }, 6: { on: true, gate: 50 }, 10: { on: true, gate: 50 }, 14: { on: true, gate: 50 } })
      }
    ],
    { instrumentPreset: "wt1-soft-keys" }
  ),

  // ── Arps & Leads (4) ──────────────────────────────────────────────────────
  melodicPattern(
    "classic-16th-arp",
    "Classic 16th Arp",
    "arps",
    ["arps", "synth", "16th", "electronic"],
    [
      {
        id: "arp",
        name: "Arp",
        assignment: { type: "melodic", pitch: 60 },
        steps: [0, 4, 7, 12, 7, 4, 0, 4, 7, 12, 7, 4, 0, 7, 12, 7].map((n, i) => ({
          on: true,
          note: n,
          velocity: i % 4 === 0 ? 115 : 88,
          gate: 65
        }))
      }
    ],
    { instrumentPreset: "wt1-muted-pluck" }
  ),
  melodicPattern(
    "trance-gate-arp",
    "Trance Gate Arp",
    "arps",
    ["arps", "trance", "gate", "lead"],
    [
      {
        id: "arp",
        name: "Trance Arp",
        assignment: { type: "melodic", pitch: 60 },
        steps: buildSteps(16, {
          0: { on: true, note: 0, velocity: 120, gate: 70 },
          1: { on: true, note: 7, velocity: 90, gate: 60 },
          3: { on: true, note: 12, velocity: 115, gate: 70 },
          4: { on: true, note: 7, velocity: 95, gate: 60 },
          6: { on: true, note: 3, velocity: 115, gate: 70 },
          8: { on: true, note: 0, velocity: 120, gate: 70 },
          9: { on: true, note: 7, velocity: 90, gate: 60 },
          11: { on: true, note: 10, velocity: 115, gate: 70 },
          12: { on: true, note: 7, velocity: 95, gate: 60 },
          14: { on: true, note: 3, velocity: 110, gate: 70 }
        })
      }
    ],
    { instrumentPreset: "wt1-chime-bell" }
  ),
  melodicPattern(
    "pentatonic-lead",
    "Pentatonic Lead",
    "arps",
    ["arps", "lead", "pentatonic", "melodic"],
    [
      {
        id: "lead",
        name: "Lead",
        assignment: { type: "melodic", pitch: 69 },
        steps: buildSteps(16, {
          0: { on: true, note: 0, velocity: 115, gate: 80 },
          2: { on: true, note: 3, velocity: 100, gate: 75 },
          4: { on: true, note: 5, velocity: 110, gate: 80 },
          7: { on: true, note: 7, velocity: 115, gate: 90 },
          8: { tie: true, gate: 80 },
          10: { on: true, note: 10, velocity: 112, gate: 75 },
          12: { on: true, note: 7, velocity: 100, gate: 75 },
          14: { on: true, note: 5, velocity: 95, gate: 70 }
        })
      }
    ],
    { scale: "minPent", instrumentPreset: "wt1-prime-lead" }
  ),
  melodicPattern(
    "polyrhythm-pluck",
    "Polyrhythm Pluck",
    "arps",
    ["arps", "polyrhythm", "polymeter", "ambient"],
    [
      {
        id: "p1",
        name: "Pluck A",
        assignment: { type: "melodic", pitch: 60 },
        steps: [0, 7, 12, 7, 4, 7, 12, 4, 0, 7, 12, 7].map((n, i) => ({
          on: i % 2 === 0 || i === 5,
          note: n,
          gate: 65
        }))
      },
      {
        id: "p2",
        name: "Pluck B",
        assignment: { type: "melodic", pitch: 72 },
        steps: buildSteps(16, {
          0: { on: true, note: 0, gate: 60 },
          5: { on: true, note: 4, gate: 60 },
          10: { on: true, note: 7, gate: 60 }
        })
      }
    ],
    { instrumentPreset: "wt1-glass-mallet" }
  )
];

function templateEntry(
  id: string,
  name: string,
  tags: readonly string[],
  pattern: StepPattern
): StepPatternLibraryEntry {
  return {
    id,
    name,
    kind: "template",
    category: "templates",
    tags,
    pattern: stripPatternSteps({ ...pattern, name })
  };
}

function blankRow(
  id: string,
  assignment: StepRowAssignment,
  opts: { name?: string; lengthSteps?: number; stepRate?: StepRate } = {}
): StepRow {
  const lengthSteps = opts.lengthSteps ?? 16;
  return normalizeRow(
    {
      id,
      // normalizeRow leaves an undefined name off the row.
      name: opts.name || undefined,
      assignment,
      lengthSteps,
      loopStart: 0,
      loopEnd: lengthSteps,
      stepRate: opts.stepRate ?? "1/16",
      subrows: defaultSubrowsForAssignment(assignment),
      steps: Array.from({ length: lengthSteps }, () => ({}))
    },
    {
      lengthSteps,
      stepRate: opts.stepRate ?? "1/16",
      playback: "forward",
      midiChannel: 1,
      automationMode: "latch"
    }
  );
}

export const FACTORY_STEP_TEMPLATES: readonly StepPatternLibraryEntry[] = [
  templateEntry(
    "tpl-4-piece-kit",
    "4-Piece Drum Kit",
    ["template", "drums", "kit"],
    normalizePattern({
      rows: [
        blankRow("r1", { type: "note", pitch: 36 }, { name: "Kick" }),
        blankRow("r2", { type: "note", pitch: 38 }, { name: "Snare" }),
        blankRow("r3", { type: "note", pitch: 42 }, { name: "Closed Hi-Hat" }),
        blankRow("r4", { type: "note", pitch: 46 }, { name: "Open Hi-Hat" })
      ]
    })
  ),
  templateEntry(
    "tpl-8-piece-kit",
    "8-Piece Drum Kit",
    ["template", "drums", "full-kit"],
    normalizePattern({
      rows: [
        blankRow("r1", { type: "note", pitch: 36 }, { name: "Kick" }),
        blankRow("r2", { type: "note", pitch: 38 }, { name: "Snare" }),
        blankRow("r3", { type: "note", pitch: 39 }, { name: "Clap" }),
        blankRow("r4", { type: "note", pitch: 37 }, { name: "Side Stick" }),
        blankRow("r5", { type: "note", pitch: 42 }, { name: "Closed Hi-Hat" }),
        blankRow("r6", { type: "note", pitch: 46 }, { name: "Open Hi-Hat" }),
        blankRow("r7", { type: "note", pitch: 45 }, { name: "Mid Tom" }),
        blankRow("r8", { type: "note", pitch: 51 }, { name: "Ride" })
      ]
    })
  ),
  templateEntry(
    "tpl-trap-kit",
    "Trap 32-Step Kit",
    ["template", "drums", "trap"],
    normalizePattern({
      lengthSteps: 32,
      rows: [
        blankRow("r1", { type: "note", pitch: 36 }, { name: "Kick", lengthSteps: 32 }),
        blankRow("r2", { type: "note", pitch: 38 }, { name: "Snare", lengthSteps: 32 }),
        blankRow("r3", { type: "note", pitch: 39 }, { name: "Clap", lengthSteps: 32 }),
        blankRow("r4", { type: "note", pitch: 42 }, { name: "Closed Hi-Hat", lengthSteps: 32 }),
        blankRow("r5", { type: "note", pitch: 46 }, { name: "Open Hi-Hat", lengthSteps: 32 })
      ]
    })
  ),
  templateEntry(
    "tpl-melodic-bass",
    "Melodic Bassline",
    ["template", "bass", "mono"],
    normalizePattern({
      mono: true,
      rows: [blankRow("r1", { type: "melodic", pitch: 36 }, { name: "Bass" })]
    })
  ),
  templateEntry(
    "tpl-poly-synth",
    "Poly Synth Sequence",
    ["template", "keys", "melodic"],
    normalizePattern({
      rows: [
        blankRow("r1", { type: "melodic", pitch: 60 }, { name: "Voice 1" }),
        blankRow("r2", { type: "melodic", pitch: 64 }, { name: "Voice 2" }),
        blankRow("r3", { type: "melodic", pitch: 67 }, { name: "Voice 3" })
      ]
    })
  ),
  templateEntry(
    "tpl-chord-degrees",
    "Chord Degree Arpeggio",
    ["template", "chords", "degrees"],
    normalizePattern({
      pitchSource: "chords",
      rows: [
        blankRow("r1", { type: "degree", degree: "root", octave: 3 }),
        blankRow("r2", { type: "degree", degree: "3rd", octave: 3 }),
        blankRow("r3", { type: "degree", degree: "5th", octave: 3 }),
        blankRow("r4", { type: "degree", degree: "7th", octave: 3 })
      ]
    })
  ),
  templateEntry(
    "tpl-automation-cc",
    "Filter & Modulation CC",
    ["template", "automation", "cc"],
    normalizePattern({
      rows: [
        blankRow("r1", { type: "melodic", pitch: 60 }, { name: "Synth" }),
        blankRow("r2", { type: "automation", target: { kind: "cc", cc: 74 } }),
        blankRow("r3", { type: "automation", target: { kind: "cc", cc: 1 } })
      ]
    })
  ),
  templateEntry(
    "tpl-polyrhythm",
    "Polyrhythm 16 / 12",
    ["template", "polyrhythm", "polymeter"],
    normalizePattern({
      lengthSteps: 16,
      rows: [
        blankRow("r1", { type: "note", pitch: 36 }, { name: "Kick", lengthSteps: 16 }),
        blankRow("r2", { type: "note", pitch: 42 }, { name: "Closed Hi-Hat", lengthSteps: 12 }),
        blankRow("r3", { type: "melodic", pitch: 60 }, { name: "Pluck", lengthSteps: 12 })
      ]
    })
  )
];

/** All shipped factory patterns and templates. */
export const ALL_FACTORY_STEP_PATTERNS: readonly StepPatternLibraryEntry[] = [
  ...FACTORY_STEP_PATTERNS,
  ...FACTORY_STEP_TEMPLATES
];

/** Extract a clean template from `pattern` (no step values, SQ44). */
export function extractStepPatternTemplate(pattern: StepPattern): StepPattern {
  return stripPatternSteps(pattern);
}

/** Find a factory pattern or template by exact id or case-insensitive name. */
export function findFactoryStepPattern(
  idOrName: string
): StepPatternLibraryEntry | undefined {
  const needle = idOrName.trim().toLowerCase();
  return (
    ALL_FACTORY_STEP_PATTERNS.find((e) => e.id.toLowerCase() === needle) ??
    ALL_FACTORY_STEP_PATTERNS.find((e) => e.name.toLowerCase() === needle)
  );
}

/** Filter factory patterns and/or templates by query, kind and category (SQ54). */
export function listFactoryStepPatterns(options: {
  query?: string;
  kind?: "pattern" | "template";
  category?: string;
} = {}): StepPatternLibraryEntry[] {
  const q = options.query?.trim().toLowerCase();
  const cat = options.category?.trim().toLowerCase();
  return ALL_FACTORY_STEP_PATTERNS.filter((entry) => {
    if (options.kind && entry.kind !== options.kind) return false;
    if (cat && entry.category.toLowerCase() !== cat) return false;
    if (q) {
      const hay = `${entry.id} ${entry.name} ${entry.category} ${entry.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
