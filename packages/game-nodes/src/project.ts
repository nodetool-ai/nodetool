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

import { slotFileStem, type GodotProject } from "@nodetool-ai/godot";
import {
  checkScripts,
  findGodot,
  importProject,
  smokeProject,
  type GodotRunResult
} from "@nodetool-ai/godot-templates";
import type { FilledManifest } from "@nodetool-ai/protocol";
import type { Workspace } from "@nodetool-ai/runtime";

/** Text files whose `res://` references may name a slot's asset. */
const REFERENCING_EXTENSIONS = new Set(["tscn", "tres", "gd", "godot"]);

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

export interface GodotVerification {
  ran: boolean;
  /** Why it did not run, when `ran` is false. */
  reason?: string;
  /** Everything the run objected to; empty on a green run. */
  errors: string[];
}

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
      reason: "this run has a virtual workspace and Godot needs a real directory",
      errors: []
    };
  }
  if (!findGodot()) {
    return {
      ran: false,
      reason: "no Godot binary found: set GODOT_BIN or put godot on PATH",
      errors: []
    };
  }
  const projectDir = join(workspace.localDir, workspace.key(dir));
  const errors: string[] = [];
  const imported = await importProject(projectDir);
  if (imported.code !== 0) {
    errors.push(`godot --import exited ${imported.code}: ${trimmed(imported)}`);
  }
  const scripts = await checkScripts(projectDir);
  for (const result of scripts.results) {
    if (result.code !== 0) {
      errors.push(`${result.script} failed its script check: ${result.stderr.slice(-2000)}`);
    }
  }
  const smoke = await smokeProject(projectDir);
  if (smoke.code !== 0) {
    errors.push(`the smoke scene exited ${smoke.code}: ${trimmed(smoke)}`);
  }
  return { ran: true, errors };
}
