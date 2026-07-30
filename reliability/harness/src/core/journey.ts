/**
 * Journey manifest loader (docs/RELIABILITY_ARCHITECTURE.md §4).
 *
 * A journey is a directory under `reliability/journeys/<name>/` carrying
 * `journey.json` (the manifest), `workflow.json` (or a ref to a shipped
 * example), `interactions.json` (scripted actions), and `expected/` (the
 * normalized stream shape + terminal outputs a passing run must match).
 *
 * The loader is Zod-validated and refuses a journey that asserts nothing
 * beyond "completed" — every journey must declare at least one invariant
 * family, or opt into an outputs/stream-shape comparison (§4's last rule).
 */
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

/** Execution surfaces a journey may run on (§12 drivers). */
export const journeySurfaceSchema = z.enum([
  "kernel",
  "ws-server",
  "cli",
  "browser",
  "app-headless",
  "packaged",
  "electron"
]);
export type JourneySurface = z.infer<typeof journeySurfaceSchema>;

/**
 * A scripted interaction. `at` names the event to anchor on (e.g.
 * `"chunk:2"`, `"node_update:upper1:completed"`) — never a wall-clock delay,
 * per §4's "event-anchored, not time-anchored" rule.
 */
export const journeyInteractionSchema = z.object({
  action: z.enum([
    "run",
    "cancel",
    "stream_input",
    "end_input_stream",
    "reconnect"
  ]),
  at: z.string().optional(),
  nodeId: z.string().optional(),
  value: z.unknown().optional()
});
export type JourneyInteraction = z.infer<typeof journeyInteractionSchema>;

/** One entry in the fault matrix (§9). */
export const journeyFaultSchema = z.object({
  /** Restrict the fault to one surface; omitted = every surface that runs it. */
  surface: journeySurfaceSchema.optional(),
  type: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional()
});
export type JourneyFault = z.infer<typeof journeyFaultSchema>;

/**
 * What a journey asserts beyond "the run reached a terminal status". At
 * least one of these must be non-trivial (§4's last rule).
 */
export const journeyAssertionsSchema = z.object({
  /** §6 invariant family names (e.g. "lifecycle-pairing", "terminal-uniqueness"). */
  invariants: z.array(z.string()).default([]),
  /** Compare terminal outputs against `expected/outputs.json`. */
  outputs: z.boolean().default(false),
  /** Compare the normalized message stream against `expected/stream.shape.json`. */
  streamShape: z.boolean().default(false)
});
export type JourneyAssertions = z.infer<typeof journeyAssertionsSchema>;

export const journeyManifestSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  workflow: z.object({
    /** Path to a workflow JSON file (relative to the journey dir), or a shipped-example ref. */
    ref: z.string().min(1)
  }),
  params: z.record(z.string(), z.unknown()).default({}),
  /** Filename (relative to the journey dir) carrying scripted interactions. */
  interactions: z.string().default("interactions.json"),
  surfaces: z.array(journeySurfaceSchema).min(1),
  faults: z.array(journeyFaultSchema).default([]),
  timeoutMs: z.number().positive().default(30000),
  assertions: journeyAssertionsSchema
});
export type JourneyManifest = z.infer<typeof journeyManifestSchema>;

export class JourneyValidationError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = []
  ) {
    super(message);
    this.name = "JourneyValidationError";
  }
}

/** A fully loaded journey: manifest, graph, interactions, and expected fixtures. */
export interface Journey {
  dir: string;
  manifest: JourneyManifest;
  workflow: Record<string, unknown>;
  interactions: JourneyInteraction[];
  expected: {
    streamShape: unknown | null;
    outputs: unknown | null;
  };
}

/** True when a manifest asserts something beyond "completed" (§4's last rule). */
export function assertsSomething(assertions: JourneyAssertions): boolean {
  return (
    assertions.invariants.length > 0 ||
    assertions.outputs ||
    assertions.streamShape
  );
}

async function readJsonIfExists(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Parses and validates a raw `journey.json` payload. Split out from
 * {@link loadJourney} so the "asserts nothing" rejection is unit-testable
 * without touching the filesystem.
 */
export function parseJourneyManifest(raw: unknown): JourneyManifest {
  const result = journeyManifestSchema.safeParse(raw);
  if (!result.success) {
    throw new JourneyValidationError(
      "journey.json failed schema validation",
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
    );
  }
  if (!assertsSomething(result.data.assertions)) {
    throw new JourneyValidationError(
      `journey "${result.data.name}" asserts nothing beyond "completed" — ` +
        "declare at least one invariant family (assertions.invariants), or " +
        "opt into assertions.outputs / assertions.streamShape (§4)."
    );
  }
  return result.data;
}

/** Loads and validates a journey directory (§4 layout). */
export async function loadJourney(journeyDir: string): Promise<Journey> {
  const dir = resolve(journeyDir);
  const manifestPath = join(dir, "journey.json");

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new JourneyValidationError(`no journey.json in ${dir}`);
    }
    throw err;
  }

  const manifest = parseJourneyManifest(raw);

  const workflowPath = resolve(dir, manifest.workflow.ref);
  const workflow = JSON.parse(await readFile(workflowPath, "utf8")) as Record<
    string,
    unknown
  >;

  const interactionsPath = join(dir, manifest.interactions);
  const interactionsRaw = await readJsonIfExists(interactionsPath);
  const interactionsResult = z
    .array(journeyInteractionSchema)
    .safeParse(interactionsRaw ?? []);
  if (!interactionsResult.success) {
    throw new JourneyValidationError(
      `${interactionsPath} failed schema validation`,
      interactionsResult.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`
      )
    );
  }

  const expectedDir = join(dir, "expected");
  const streamShape = await readJsonIfExists(
    join(expectedDir, "stream.shape.json")
  );
  const outputs = await readJsonIfExists(join(expectedDir, "outputs.json"));

  if (manifest.assertions.streamShape && streamShape === null) {
    throw new JourneyValidationError(
      `journey "${manifest.name}" declares assertions.streamShape but has no ` +
        "expected/stream.shape.json"
    );
  }
  if (manifest.assertions.outputs && outputs === null) {
    throw new JourneyValidationError(
      `journey "${manifest.name}" declares assertions.outputs but has no ` +
        "expected/outputs.json"
    );
  }

  return {
    dir,
    manifest,
    workflow,
    interactions: interactionsResult.data,
    expected: { streamShape, outputs }
  };
}

/** Directory a journey ref lives in, given its manifest path — small helper for drivers. */
export function journeyDirOf(manifestPath: string): string {
  return dirname(manifestPath);
}
