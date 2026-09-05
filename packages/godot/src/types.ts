import type { FilledManifest, GameAssetManifest } from "@nodetool-ai/protocol";

export interface GodotProjectInput {
  name: string;
  /** Godot minor the project targets, e.g. `4.3`. */
  godot: string;
  /** `res://` path of the scene to run, when the template has one. */
  mainScene?: string;
  filled: FilledManifest;
  manifest: GameAssetManifest;
}

/** A text file, project-relative. */
export interface GodotFile {
  path: string;
  content: string;
}

/** Bytes to copy from a stored asset to a project-relative path. */
export interface GodotCopy {
  path: string;
  asset_id: string;
}

export interface GodotProject {
  files: GodotFile[];
  copies: GodotCopy[];
}

/** One `[header key="value" ...]` block and the `key = value` lines under it. */
export interface GodotBlock {
  /** `gd_scene`, `gd_resource`, `ext_resource`, `sub_resource`, `node`, `resource`, `connection`, ... */
  kind: string;
  /** Attributes in the header, in order. */
  attributes: Record<string, string>;
  /** Properties under the header, in order; values are raw Godot text. */
  properties: Record<string, string>;
}

/** A parsed `.tscn` or `.tres`: the header block plus every block after it. */
export interface TscnDocument {
  header: GodotBlock;
  blocks: GodotBlock[];
}
