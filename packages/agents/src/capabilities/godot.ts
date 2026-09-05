/**
 * The `godot` capability module — a game template plus filled asset slots in,
 * a Godot project in the workspace out.
 *
 * The pieces are all elsewhere and this module only joins them: the templates
 * and the headless runner are `@nodetool-ai/godot-templates`, the resource
 * writer and reference checker are `@nodetool-ai/godot`, the slot contract is
 * `@nodetool-ai/protocol`. What is decided here is the join: the template's
 * own `project.godot` wins over the writer's (it carries the input map and
 * window settings), a filled audio slot whose extension differs from the
 * placeholder's has the scene references rewritten, and verification runs
 * only where a real directory and a Godot binary exist, saying so otherwise.
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
  getTemplate,
  importProject,
  listTemplates,
  smokeProject,
  type GodotRunResult
} from "@nodetool-ai/godot-templates";
import {
  checkFilledManifest,
  filledManifest,
  slotFill,
  SLOT_METADATA_KEY,
  type FilledManifest,
  type FilledSlot
} from "@nodetool-ai/protocol";
import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import type { Workspace } from "@nodetool-ai/runtime";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  exportGodotProjectSpec,
  listGameTemplatesSpec,
  verifyGodotProjectSpec
} from "./godot.specs.js";
import { userIdOf } from "../tools/mcp-tool-support.js";
import { isRecord, isString } from "../utils/type-guards.js";

export {
  LIST_GAME_TEMPLATES_SCHEMA,
  EXPORT_GODOT_PROJECT_SCHEMA,
  VERIFY_GODOT_PROJECT_SCHEMA
} from "./godot.specs.js";

type ToolError = { error: string };

const isError = (value: unknown): value is ToolError =>
  isRecord(value) && isString((value as ToolError).error);

const NO_WORKSPACE_ERROR =
  "No workspace is configured for this context, and a Godot project is a directory of files.";

/** Text files whose `res://` references may name a slot's asset. */
const REFERENCING_EXTENSIONS = new Set(["tscn", "tres", "gd", "godot"]);

const extensionOf = (path: string): string => {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return match ? match[1].toLowerCase() : "";
};

/** Every file under `dir`, project-relative with `/` separators. */
function walkTemplate(dir: string): string[] {
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

// ---------------------------------------------------------------------------
// list_game_templates
// ---------------------------------------------------------------------------

const listGameTemplates: CapabilityExport = {
  spec: listGameTemplatesSpec,
  impl: async () => ({
    templates: listTemplates().map((t) => ({
      id: t.id,
      godot: t.manifest.godot,
      slots: t.manifest.slots,
      hooks: t.manifest.hooks
    }))
  })
};

// ---------------------------------------------------------------------------
// export_godot_project
// ---------------------------------------------------------------------------

interface SlotArg {
  slot_id: string;
  asset_id: string;
}

function slotArgs(raw: unknown): SlotArg[] | ToolError {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "slots must be a non-empty array of {slot_id, asset_id}." };
  }
  const out: SlotArg[] = [];
  for (const entry of raw) {
    if (
      !isRecord(entry) ||
      !isString(entry["slot_id"]) ||
      !isString(entry["asset_id"])
    ) {
      return { error: "Each slot needs a string slot_id and asset_id." };
    }
    out.push({
      slot_id: entry["slot_id"],
      asset_id: entry["asset_id"].replace(/^asset:\/\//, "")
    });
  }
  return out;
}

/**
 * The filled manifest the slot args describe, read off each asset's stamped
 * fill. An asset without a fill, or with a fill for another slot, reports
 * rather than being guessed at.
 */
async function loadFilledManifest(
  run: CapabilityRun,
  template: string,
  slots: SlotArg[]
): Promise<FilledManifest | ToolError> {
  const userId = userIdOf(run.context);
  const { Asset } = await import("@nodetool-ai/models");
  const filled: FilledSlot[] = [];
  for (const { slot_id, asset_id } of slots) {
    const asset = await Asset.find(userId, asset_id);
    if (!asset) return { error: `Asset ${asset_id} for slot ${slot_id} was not found.` };
    const raw = asset.metadata?.[SLOT_METADATA_KEY];
    const parsed = slotFill.safeParse(raw);
    if (!parsed.success) {
      return {
        error:
          `Asset ${asset_id} carries no slot fill. Run it through the ` +
          `nodetool.game node for its kind first (SpriteSheet, Tileset, ` +
          `SeamlessImage, SoundEffect, MusicLoop).`
      };
    }
    if (parsed.data.slot_id !== slot_id) {
      return {
        error: `Asset ${asset_id} was filled for slot ${parsed.data.slot_id}, not ${slot_id}.`
      };
    }
    const ext = extensionOf(asset.name);
    const type = asset.content_type.startsWith("audio/") ? "audio" : "image";
    filled.push({
      slot_id,
      asset: {
        type,
        uri: ext ? `asset://${asset_id}.${ext}` : `asset://${asset_id}`,
        asset_id
      },
      fill: parsed.data
    });
  }
  const result = filledManifest.safeParse({
    manifest_version: 1,
    template,
    slots: filled
  });
  if (!result.success) {
    return { error: `Filled manifest is malformed: ${result.error.message}` };
  }
  return result.data;
}

/** `dir/relative`, with the workspace doing the normalizing. */
const under = (dir: string, path: string): string => `${dir}/${path}`;

/**
 * Copy the template into the workspace, then lay the writer's output over it.
 *
 * Audio placeholders are `.wav`; a filled slot may be `.ogg`. When the
 * extensions differ the placeholder is dropped and every scene that named it
 * is rewritten to the real path, so the reference check below sees one file.
 */
async function layOutProject(
  workspace: Workspace,
  dir: string,
  templateDir: string,
  name: string,
  project: GodotProject,
  filled: FilledManifest
): Promise<{ written: string[]; rewritten: string[] }> {
  const written: string[] = [];
  const rewritten: string[] = [];

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
  return { written, rewritten };
}

async function copyAssets(
  run: CapabilityRun,
  workspace: Workspace,
  dir: string,
  project: GodotProject
): Promise<string[] | ToolError> {
  const copied: string[] = [];
  for (const copy of project.copies) {
    let bytes: Uint8Array | null;
    try {
      bytes = await loadMediaRefBytes(
        { uri: `asset://${copy.asset_id}`, asset_id: copy.asset_id },
        run.context
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
async function danglingReferences(
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

interface GodotVerification {
  ran: boolean;
  reason?: string;
  import?: GodotRunResult;
  scripts?: Array<{ script: string; code: number | null; stderr: string }>;
  smoke?: GodotRunResult;
  ok?: boolean;
}

const trimOutput = (r: GodotRunResult): GodotRunResult => ({
  code: r.code,
  stdout: r.stdout.slice(-4000),
  stderr: r.stderr.slice(-4000)
});

async function verifyWithGodot(
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

const exportGodotProject: CapabilityExport = {
  spec: exportGodotProjectSpec,
  impl: async (run, params) => {
    const workspace = run.context.workspace ?? null;
    if (!workspace) return { error: NO_WORKSPACE_ERROR };

    const templateId = params["template"];
    const name = params["name"];
    if (!isString(templateId) || !isString(name) || name.trim() === "") {
      return { error: "template and name must be non-empty strings." };
    }
    let template;
    try {
      template = getTemplate(templateId);
    } catch {
      return {
        error: `Unknown template ${templateId}. Templates: ${listTemplates()
          .map((t) => t.id)
          .join(", ")}.`
      };
    }
    const slots = slotArgs(params["slots"]);
    if (isError(slots)) return slots;
    const dir = isString(params["dir"]) && params["dir"].trim() !== ""
      ? params["dir"].replace(/\/+$/, "")
      : `godot/${name.replace(/[^a-z0-9_-]+/gi, "_")}`;
    const verify = params["verify"] !== false;

    const filled = await loadFilledManifest(run, template.id, slots);
    if (isError(filled)) return filled;
    const problems = checkFilledManifest(template.manifest, filled);
    if (Object.keys(problems).length > 0) {
      return {
        error: "The filled slots do not satisfy the template's manifest.",
        problems
      };
    }

    const project = writeGodotProject({
      name,
      godot: template.manifest.godot,
      filled,
      manifest: template.manifest
    });
    const resourceProblems = checkGodotProject(project);
    if (resourceProblems.length > 0) {
      return { error: "The writer produced dangling resources.", problems: resourceProblems };
    }

    const { written, rewritten } = await layOutProject(
      workspace,
      dir,
      template.dir,
      name,
      project,
      filled
    );
    const copied = await copyAssets(run, workspace, dir, project);
    if (isError(copied)) return copied;

    const dangling = await danglingReferences(workspace, dir);
    const verification: GodotVerification = verify
      ? await verifyWithGodot(workspace, dir)
      : { ran: false, reason: "verify was false." };

    return {
      dir,
      template: template.id,
      hooks: template.manifest.hooks,
      files_written: written.length + copied.length,
      assets_copied: copied,
      references_rewritten: rewritten,
      dangling_references: dangling,
      verification,
      ok: dangling.length === 0 && (verification.ran ? verification.ok === true : true)
    };
  }
};

// ---------------------------------------------------------------------------
// verify_godot_project
// ---------------------------------------------------------------------------

const verifyGodotProject: CapabilityExport = {
  spec: verifyGodotProjectSpec,
  impl: async (run, params) => {
    const workspace = run.context.workspace ?? null;
    if (!workspace) return { error: NO_WORKSPACE_ERROR };
    const dir = params["dir"];
    if (!isString(dir) || dir.trim() === "") {
      return { error: "dir must be a non-empty string." };
    }
    if (!(await workspace.exists(under(dir, "project.godot")))) {
      return { error: `${dir} holds no project.godot.` };
    }
    const dangling = await danglingReferences(workspace, dir);
    const verification = await verifyWithGodot(workspace, dir);
    if (!verification.ran) {
      return { error: verification.reason, dangling_references: dangling };
    }
    return {
      dir,
      dangling_references: dangling,
      verification,
      ok: dangling.length === 0 && verification.ok === true
    };
  }
};

export const GODOT_CAPABILITIES: readonly CapabilityExport[] = [
  listGameTemplates,
  exportGodotProject,
  verifyGodotProject
];

export const module: CapabilityModule = {
  module: "godot",
  exports: GODOT_CAPABILITIES
};

export { listGameTemplates, exportGodotProject, verifyGodotProject };
