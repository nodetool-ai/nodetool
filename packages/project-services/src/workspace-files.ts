/**
 * The workspace files of a project folder: files that no asset or document
 * names (docs/plans/native-cloud-sync/technical-design.md, "Capture from the
 * project folder" and "Receiving workspace files"). A send lists them in the
 * local folder, and a receive's capture in the cloud folder, by one rule.
 */
import { Asset, pendingPlacementPaths, TimelineSequence, Workflow } from "@nodetool-ai/models";
import type { Workspace } from "@nodetool-ai/runtime";
import { scanFolder, type FolderFile } from "./project-index.js";

/** Files that travel as documents only, whatever row names them (CF2). */
const DOCUMENT_FILE_SUFFIXES = [".workflow.json", ".timeline.json"];

/**
 * Every file the index's own scan finds (CF5), except a file an asset names,
 * a document's file, any workflow or timeline file (CF2), and a path a
 * receive is still placing. Sorted by path.
 */
export async function listWorkspaceFiles(userId: string, projectId: string, workspace: Workspace): Promise<FolderFile[]> {
  const [placing, assets, workflows, timelines] = await Promise.all([
    pendingPlacementPaths(projectId),
    Asset.listProjectFiles(userId, projectId),
    Workflow.listForProjects(userId, [projectId]),
    TimelineSequence.listForProjects(userId, [projectId])
  ]);
  const excluded = new Set<string>(placing);
  for (const row of [...assets.map((asset) => asset.workspace_path), ...workflows.map((w) => w.file_path), ...timelines.map((t) => t.file_path)]) {
    if (row) excluded.add(row);
  }
  const out: FolderFile[] = [];
  for (const file of (await scanFolder(workspace)).values()) {
    if (excluded.has(file.path)) continue;
    if (DOCUMENT_FILE_SUFFIXES.some((suffix) => file.path.endsWith(suffix))) continue;
    out.push(file);
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
