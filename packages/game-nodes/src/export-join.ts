/**
 * The export join: a Godot template plus a filled asset manifest in, a project
 * directory in the workspace out.
 *
 * Extracted from `packages/agents/src/capabilities/godot.ts` so the
 * `export_godot_project` capability and the `nodetool.game.ExportGodotProject`
 * node run the same code rather than two copies of it. The pieces it joins are
 * elsewhere: the templates and the headless runner are
 * `@nodetool-ai/godot-templates`, the resource writer and reference checker are
 * `@nodetool-ai/godot`, the slot contract is `@nodetool-ai/protocol`.
 *
 * What is decided here is the join: the template's own `project.godot` wins
 * over the writer's (it carries the input map and window settings), a filled
 * audio slot whose extension differs from the placeholder's has the scene
 * references rewritten, a directory that already holds a project keeps its
 * scripts and scenes and only takes new assets, and verification runs only
 * where a real directory and a Godot binary exist, saying so otherwise.
 *
 * It lives in this package rather than in `@nodetool-ai/godot` because it needs
 * `Workspace` and `loadMediaRefBytes` from `@nodetool-ai/runtime`, and the
 * `godot` package sits below runtime in the dependency order. `@nodetool-ai/agents`
 * depends on this package; this package never imports agents, so there is no
 * cycle.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  checkGodotProject,
  writeGodotProject,
  slotFileStem,
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
import type { ProcessingContext, Workspace } from "@nodetool-ai/runtime";

/** Text files whose `res://` references may name a slot's asset. */
export const REFERENCING_EXTENSIONS = new Set(["tscn", "tres", "gd", "godot"]);

export const extensionOf = (path: string): string => {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return match ? match[1].toLowerCase() : "";
};

/** `dir/relative`, with the workspace doing the normalizing. */
export const under = (dir: string, path: string): string => `${dir}/${path}`;

export type LayoutMode = "create" | "refresh";

export interface GodotVerification {
  ran: boolean;
  reason?: string;
  import?: GodotRunResult;
  scripts?: Array<{ script: string; code: number | null; stderr: string }>;
  smoke?: GodotRunResult;
  ok?: boolean;
}

export interface JoinError {
  error: string;
  problems?: Record<string, string[]> | string[];
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

export const isJoinError = (value: unknown): value is JoinError =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as JoinError).error === "string";

/** Every file under `dir`, project-relative with `/` separators. */
export function walkTemplate(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
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

/**
 * Copy the template into the workspace, then lay the writer's output over it.
 *
 * Audio placeholders are `.wav`; a filled slot may be `.ogg`. When the
 * extensions differ the placeholder is dropped and every scene that named it
 * is rewritten to the real path, so the reference check below sees one file.
 *
 * In `refresh` mode a template file the directory already holds is left as it
 * is, so the hook scripts and scenes an agent edited after the first export
 * survive an art change. Audio references inside those kept files are still
 * rewritten, since the file they name may have moved extension this time.
 * The writer's resources and the asset copies are replaced in both modes.
 */
export async function layOutProject(
  workspace: Workspace,
  dir: string,
  templateDir: string,
  name: string,
  project: GodotProject,
  filled: FilledManifest,
  mode: LayoutMode
): Promise<{ written: string[]; rewritten: string[]; preserved: string[] }> {
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
      const pattern = new RegExp(`res://${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.[a-z0-9]+`, "gi");
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

export async function copyAssets(
  context: ProcessingContext | undefined,
  workspace: Workspace,
  dir: string,
  project: GodotProject
): Promise<string[] | JoinError> {
  const copied: string[] = [];
  for (const copy of project.copies) {
    let bytes: Uint8Array | null;
    try {
      bytes = await loadMediaRefBytes(
        { uri: `asset://${copy.asset_id}`, asset_id: copy.asset_id },
        context
      );
    } catch (error) {
      return {
        error: `Could not read asset ${copy.asset_id}: ${error instanceof Error ? error.message : String(error)}`
      };
    }
    if (!bytes) return { error: `Asset ${copy.asset_id} has no bytes.` };
    await workspace.write(under(dir, copy.path), bytes);
    copied.push(copy.path);
  }
  return copied;
}

/**
 * Every `res://` path named by a text file under `dir` that no file answers.
 * The reader in `@nodetool-ai/godot` checks resource ids inside the writer's
 * own files; this checks the template's scenes against what actually landed.
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
    const rel = entry.path.startsWith(`${dir}/`) ? entry.path.slice(dir.length + 1) : entry.path;
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

const trimOutput = (r: GodotRunResult): GodotRunResult => ({
  code: r.code,
  stdout: r.stdout.slice(-4000),
  stderr: r.stderr.slice(-4000)
});

export async function verifyWithGodot(
  workspace: Workspace,
  dir: string
): Promise<GodotVerification> {
  if (!workspace.localDir) {
    return {
      ran: false,
      reason: "This run has a virtual workspace; Godot needs a real directory."
    };
  }
  if (!findGodot()) {
    return {
      ran: false,
      reason: "No Godot binary found: set GODOT_BIN or put godot on PATH."
    };
  }
  const projectDir = join(workspace.localDir, workspace.key(dir));
  const imported = trimOutput(await importProject(projectDir));
  const scripts = await checkScripts(projectDir);
  const smoke = trimOutput(await smokeProject(projectDir));
  return {
    ran: true,
    import: imported,
    scripts: scripts.results.map((r) => ({
      script: r.script,
      code: r.code,
      stderr: r.stderr.slice(-2000)
    })),
    smoke,
    ok: imported.code === 0 && scripts.ok && smoke.code === 0
  };
}

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
  verify: boolean;
  overwrite: boolean;
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
  const copied = await copyAssets(input.context, workspace, dir, project);
  if (isJoinError(copied)) return copied;

  const dangling = await danglingReferences(workspace, dir);
  const verification: GodotVerification = input.verify
    ? await verifyWithGodot(workspace, dir)
    : { ran: false, reason: "verify was false." };

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
