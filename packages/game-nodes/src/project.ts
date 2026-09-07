/**
 * Laying a written Godot project down in a workspace, and checking it.
 *
 * `writeGodotProject` (`@nodetool-ai/godot`) produces the resources a filled
 * manifest implies — sprite frames, tile sets, audio import files, and the list
 * of asset bytes to copy. It never touches the template's own scenes and
 * scripts. This module is the other half: copy the template over, lay the
 * writer's output on top, write the asset bytes, and then check that no
 * `res://` path names a file that is not there.
 *
 * The decisions, all of which the `godot` agent capability makes the same way:
 * the template's own `project.godot` wins over the writer's (it carries the
 * input map and window settings), a filled audio slot whose extension differs
 * from the placeholder's has the scenes rewritten to the real path, and a
 * directory that already holds a project keeps its scripts and scenes and only
 * takes new assets — so a re-run after an art change does not undo hook edits.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import {
  checkGodotProject,
  slotFileStem,
  writeGodotProject,
  type GodotProject
} from "@nodetool-ai/godot";
import {
  checkScripts,
  findGodot,
  importProject,
  smokeProject,
  type GodotRunResult
} from "@nodetool-ai/godot-templates";
import {
  checkFilledManifest,
  type FilledManifest,
  type GameAssetManifest
} from "@nodetool-ai/protocol";
import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import type {
  MediaRefValue,
  ProcessingContext,
  Workspace
} from "@nodetool-ai/runtime";

/** Text files whose `res://` references may name a slot's asset. */
export const REFERENCING_EXTENSIONS = new Set(["tscn", "tres", "gd", "godot"]);

export const extensionOf = (path: string): string => {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return match ? match[1].toLowerCase() : "";
};

/** `dir/relative`, with the workspace doing the normalizing. */
export const under = (dir: string, path: string): string => `${dir}/${path}`;

/** Every file under `dir`, project-relative with `/` separators. */
export function walkTemplate(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        out.push(relative(dir, full).split(sep).join("/"));
      }
    }
  };
  walk(dir);
  return out.sort();
}

/** `create` writes the template fresh; `refresh` keeps files already there. */
export type LayoutMode = "create" | "refresh";

export interface LayoutResult {
  written: string[];
  rewritten: string[];
  preserved: string[];
}

export async function layOutProject(
  workspace: Workspace,
  dir: string,
  templateDir: string,
  name: string,
  project: GodotProject,
  filled: FilledManifest,
  mode: LayoutMode
): Promise<LayoutResult> {
  const written: string[] = [];
  const rewritten: string[] = [];
  const preserved: string[] = [];

  const templateFiles = walkTemplate(templateDir);

  // The real audio path per placeholder stem, for slots whose extension moved.
  const audioRenames = new Map<string, string>();
  for (const slot of filled.slots) {
    if (slot.fill.kind !== "sfx" && slot.fill.kind !== "music") continue;
    const stem = `assets/audio/${slotFileStem(slot.slot_id)}`;
    const copy = project.copies.find((c) => c.asset_id === slot.asset.asset_id);
    const placeholder = templateFiles.find(
      (f) => f.replace(/\.[a-z0-9]+$/i, "") === stem
    );
    if (copy && placeholder && placeholder !== copy.path) {
      audioRenames.set(stem, copy.path);
    }
  }
  const placeholderFor = (path: string): string | null => {
    if (!path.startsWith("assets/audio/")) return null;
    const stem = path.replace(/\.[a-z0-9]+$/i, "");
    const target = audioRenames.get(stem);
    return target && target !== path ? target : null;
  };
  const rewriteRefs = (text: string): { text: string; changed: boolean } => {
    let changed = false;
    let out = text;
    for (const [stem, target] of audioRenames) {
      const pattern = new RegExp(
        `res://${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.[a-z0-9]+`,
        "gi"
      );
      out = out.replace(pattern, () => {
        changed = true;
        return `res://${target}`;
      });
    }
    return { text: out, changed };
  };

  const writerPaths = new Set(project.files.map((f) => f.path));
  for (const rel of templateFiles) {
    if (writerPaths.has(rel) && rel !== "project.godot") continue;
    if (placeholderFor(rel)) continue;
    const full = join(templateDir, rel);
    const ext = extensionOf(rel);
    if (mode === "refresh" && (await workspace.exists(under(dir, rel)))) {
      preserved.push(rel);
      if (REFERENCING_EXTENSIONS.has(ext)) {
        const current = await workspace.readText(under(dir, rel));
        const { text, changed } = rewriteRefs(current ?? "");
        if (changed) {
          rewritten.push(rel);
          await workspace.write(under(dir, rel), text, "text/plain");
        }
      }
      continue;
    }
    if (rel === "project.godot") {
      const text = readFileSync(full, "utf8").replace(
        /^config\/name=".*"$/m,
        `config/name=${JSON.stringify(name)}`
      );
      await workspace.write(under(dir, rel), rewriteRefs(text).text, "text/plain");
    } else if (REFERENCING_EXTENSIONS.has(ext)) {
      const { text, changed } = rewriteRefs(readFileSync(full, "utf8"));
      if (changed) rewritten.push(rel);
      await workspace.write(under(dir, rel), text, "text/plain");
    } else {
      await workspace.write(under(dir, rel), new Uint8Array(readFileSync(full)));
    }
    written.push(rel);
  }
  for (const file of project.files) {
    if (file.path === "project.godot") continue;
    await workspace.write(under(dir, file.path), file.content, "text/plain");
    written.push(file.path);
  }
  return { written, rewritten, preserved };
}

/**
 * Every `res://` path named by a text file under `dir` that no file answers.
 * `checkGodotProject` checks resource ids inside the writer's own files; this
 * checks the template's scenes against what actually landed.
 */
export async function danglingReferences(
  workspace: Workspace,
  dir: string
): Promise<string[]> {
  const entries = await workspace.list(dir, { recursive: true });
  const present = new Set<string>();
  const texts: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const rel = entry.path.startsWith(`${dir}/`)
      ? entry.path.slice(dir.length + 1)
      : entry.path;
    present.add(rel);
    if (REFERENCING_EXTENSIONS.has(extensionOf(rel))) texts.push(rel);
  }
  const dangling = new Set<string>();
  for (const rel of texts) {
    const text = await workspace.readText(under(dir, rel));
    if (!text) continue;
    for (const match of text.matchAll(/res:\/\/([^"'\s)]+)/g)) {
      if (!present.has(match[1])) dangling.add(`${rel} -> res://${match[1]}`);
    }
  }
  return [...dangling].sort();
}

/**
 * What a headless Godot pass saw.
 *
 * `errors` is the reader's summary — one line per objection — and the three
 * run results below it are the raw output the `verify_godot_project` capability
 * hands an agent. Both come from the same pass, so a node reporting `errors`
 * and a capability reporting `smoke.stdout` can never disagree.
 */
export interface GodotVerification {
  ran: boolean;
  /** Why it did not run, when `ran` is false. */
  reason?: string;
  /** Everything the run objected to; empty on a green run. */
  errors: string[];
  import?: GodotRunResult;
  scripts?: Array<{ script: string; code: number | null; stderr: string }>;
  smoke?: GodotRunResult;
  /** True only on a run that happened and objected to nothing. */
  ok?: boolean;
}

/** A run result small enough to hand back whole. */
const clipped = (r: GodotRunResult): GodotRunResult => ({
  code: r.code,
  stdout: r.stdout.slice(-4000),
  stderr: r.stderr.slice(-4000)
});

const trimmed = (r: GodotRunResult): string =>
  [r.stderr, r.stdout].map((s) => s.trim()).filter((s) => s !== "").join("\n").slice(-2000);

/**
 * Import the project, syntax-check every script, and run its smoke scene —
 * the three steps `verify_godot_project` runs, in the same order.
 *
 * Skipped rather than failed when there is no real directory to run in or no
 * Godot binary: an export in a cloud workspace is still a valid export, and
 * reporting green from a verification that never ran would be the worse bug.
 */
export async function verifyWithGodot(
  workspace: Workspace,
  dir: string
): Promise<GodotVerification> {
  if (!workspace.localDir) {
    return {
      ran: false,
      reason: "This run has a virtual workspace; Godot needs a real directory.",
      errors: []
    };
  }
  if (!findGodot()) {
    return {
      ran: false,
      reason: "No Godot binary found: set GODOT_BIN or put godot on PATH.",
      errors: []
    };
  }
  const projectDir = join(workspace.localDir, workspace.key(dir));
  const errors: string[] = [];
  const imported = clipped(await importProject(projectDir));
  if (imported.code !== 0) {
    errors.push(`godot --import exited ${imported.code}: ${trimmed(imported)}`);
  }
  const scripts = await checkScripts(projectDir);
  for (const result of scripts.results) {
    if (result.code !== 0) {
      errors.push(`${result.script} failed its script check: ${result.stderr.slice(-2000)}`);
    }
  }
  const smoke = clipped(await smokeProject(projectDir));
  if (smoke.code !== 0) {
    errors.push(`the smoke scene exited ${smoke.code}: ${trimmed(smoke)}`);
  }
  return {
    ran: true,
    errors,
    import: imported,
    scripts: scripts.results.map((r) => ({
      script: r.script,
      code: r.code,
      stderr: r.stderr.slice(-2000)
    })),
    smoke,
    ok: errors.length === 0
  };
}

// ── The join ────────────────────────────────────────────────────────────────

/** A join that stopped before it wrote anything the caller can use. */
export interface JoinError {
  error: string;
  problems?: Record<string, string[]> | string[];
}

export const isJoinError = (value: unknown): value is JoinError =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as JoinError).error === "string";

export interface JoinInput {
  /** Manifest of the template being exported. */
  manifest: GameAssetManifest;
  /** The template's directory on disk (`getTemplate(id).dir`). */
  templateDir: string;
  /** Godot feature string (`manifest.godot`). */
  godot: string;
  /** The project's `config/name`. */
  name: string;
  /** Workspace-relative export directory. */
  dir: string;
  filled: FilledManifest;
  workspace: Workspace;
  /** Read for `loadMediaRefBytes`; the asset store a copy's bytes come from. */
  context?: ProcessingContext;
  /**
   * The ref to read each asset's bytes from, by asset id. A graph hands the
   * checker's own stamped ref here, so a hermetic run whose assets were never
   * stored still exports; a caller that omits it reads `asset://<id>`.
   */
  refs?: ReadonlyMap<string, MediaRefValue>;
  verify: boolean;
  /** Replace the template's own files even where the directory already has them. */
  overwrite: boolean;
}

export interface JoinOutcome {
  dir: string;
  template: string;
  mode: LayoutMode;
  written: string[];
  preserved: string[];
  copied: string[];
  rewritten: string[];
  dangling: string[];
  verification: GodotVerification;
  ok: boolean;
}

export async function copyAssets(
  context: ProcessingContext | undefined,
  workspace: Workspace,
  dir: string,
  project: GodotProject,
  refs?: ReadonlyMap<string, MediaRefValue>
): Promise<string[] | JoinError> {
  const copied: string[] = [];
  for (const copy of project.copies) {
    const ref = refs?.get(copy.asset_id) ?? {
      uri: `asset://${copy.asset_id}`,
      asset_id: copy.asset_id
    };
    let bytes: Uint8Array | null;
    try {
      bytes = await loadMediaRefBytes(ref, context);
    } catch (error) {
      return {
        error: `Could not read asset ${copy.asset_id}: ${error instanceof Error ? error.message : String(error)}`
      };
    }
    if (!bytes || bytes.length === 0) {
      return {
        error:
          `The asset for ${copy.path} has no bytes. Wire the checker's output ` +
          `handle, not a ref that was never stored.`
      };
    }
    await workspace.write(under(dir, copy.path), bytes);
    copied.push(copy.path);
  }
  return copied;
}

/**
 * Write the project, copy the assets, check every reference, and verify.
 *
 * `filled` may cover fewer slots than the manifest: a creator who kept the
 * template's placeholder audio (game-prd D27) fills none of the audio slots,
 * and the blank-template path fills none at all. Only the filled slots are
 * handed to the writer, so the template's own placeholders stand for the rest —
 * a caller that needs every slot filled (the `export_godot_project` capability)
 * checks that itself before calling.
 */
export async function joinGodotProject(
  input: JoinInput
): Promise<JoinOutcome | JoinError> {
  const { workspace, dir, filled, manifest } = input;

  const filledIds = new Set(filled.slots.map((slot) => slot.slot_id));
  const unknown = [...filledIds].filter(
    (id) => !manifest.slots.some((slot) => slot.id === id)
  );
  if (unknown.length > 0) {
    return {
      error: `Template ${manifest.template} has no slot named ${unknown.join(", ")}.`
    };
  }
  // The writer refuses a manifest with an unfilled slot, so it is shown only
  // the slots that were actually filled. Every fill is still checked against
  // its real spec.
  const writerManifest: GameAssetManifest = {
    ...manifest,
    slots: manifest.slots.filter((slot) => filledIds.has(slot.id))
  };
  const problems = checkFilledManifest(writerManifest, filled);
  if (Object.keys(problems).length > 0) {
    return {
      error: "The filled slots do not satisfy the template's manifest.",
      problems
    };
  }

  const project = writeGodotProject({
    name: input.name,
    godot: input.godot,
    filled,
    manifest: writerManifest
  });
  const resourceProblems = checkGodotProject(project);
  if (resourceProblems.length > 0) {
    return {
      error: "The writer produced dangling resources.",
      problems: resourceProblems
    };
  }

  const mode: LayoutMode =
    !input.overwrite && (await workspace.exists(under(dir, "project.godot")))
      ? "refresh"
      : "create";
  const { written, rewritten, preserved } = await layOutProject(
    workspace,
    dir,
    input.templateDir,
    input.name,
    project,
    filled,
    mode
  );
  const copied = await copyAssets(
    input.context,
    workspace,
    dir,
    project,
    input.refs
  );
  if (isJoinError(copied)) return copied;

  const dangling = await danglingReferences(workspace, dir);
  const verification: GodotVerification = input.verify
    ? await verifyWithGodot(workspace, dir)
    : { ran: false, reason: "verify was false", errors: [] };

  return {
    dir,
    template: manifest.template,
    mode,
    written,
    preserved,
    copied,
    rewritten,
    dangling,
    verification,
    ok: dangling.length === 0 && (verification.ran ? verification.ok === true : true)
  };
}
