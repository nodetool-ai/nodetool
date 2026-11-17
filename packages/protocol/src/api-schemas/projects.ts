import { z } from "zod";
import { timelineTrack } from "./timeline.js";

// ── Project ──────────────────────────────────────────────────────────────────
// A project is a name over documents that already carry `project_id`. `kind` is
// free text ("spot", "trailer", "report") rather than an enum: the taxonomy is
// the user's, not ours.

/**
 * What deleting the project does to its folder: `trash` moves a local folder
 * NodeTool created to the trash, `remove` deletes a cloud folder NodeTool
 * created, and `keep` leaves a folder the user brought with every file except
 * `.nodetool/`.
 */
export const projectFolderDeletePlan = z.enum(["trash", "remove", "keep"]);
export type ProjectFolderDeletePlan = z.infer<typeof projectFolderDeletePlan>;

/**
 * The project's folder. `path` is the absolute directory, or null for a cloud
 * project, whose folder is a key prefix in object storage. `origin` is
 * `created` when NodeTool made the folder and `adopted` when the user brought
 * it. `workspace_id` names the workspace row a client lists and reads the
 * folder's files through. `on_delete` is what the server does to the folder
 * when the project is deleted, which the confirmation dialog states.
 */
export const projectFolder = z.object({
  workspace_id: z.string(),
  path: z.string().nullable(),
  origin: z.enum(["created", "adopted"]),
  is_accessible: z.boolean(),
  on_delete: projectFolderDeletePlan,
  /**
   * Present while the files of assets from before project folders are being
   * moved into the folder: how many are finished and how many there are. The
   * assets stay available throughout.
   */
  moving: z
    .object({
      done: z.number().int().nonnegative(),
      total: z.number().int().nonnegative()
    })
    .nullish()
});
export type ProjectFolder = z.infer<typeof projectFolder>;

/**
 * What a delete did to the project's folder. `trashed` and `moved_aside`
 * carry the folder's new place: the OS trash, or `<projects dir>/.trash` when
 * the server cannot reach the OS trash. `kept` and `trash_failed` carry the
 * folder's unchanged place. `path` is null for a cloud folder and on a
 * production server.
 */
export const projectFolderDisposal = z.object({
  action: z.enum([
    "trashed",
    "moved_aside",
    "removed",
    "kept",
    "trash_failed",
    "none"
  ]),
  path: z.string().nullable()
});
export type ProjectFolderDisposal = z.infer<typeof projectFolderDisposal>;

export const deleteProjectOutput = z.object({
  ok: z.literal(true),
  folder: projectFolderDisposal
});
export type DeleteProjectOutput = z.infer<typeof deleteProjectOutput>;

export const projectResponse = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  isPersonal: z.boolean().default(false),
  archivedAt: z.string().nullable(),
  /** The conversation that builds it, or null while nobody has asked for one. */
  threadId: z.string().nullable(),
  /** Null only while a project from before project folders awaits migration. */
  folder: projectFolder.nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type ProjectResponse = z.infer<typeof projectResponse>;

/**
 * The loose bucket's id. It names no project row, so a client may not claim it
 * — a project holding it would swallow every unassigned document.
 */
const LOOSE_PROJECT_ID = "default";

export const createProjectInput = z.object({
  /**
   * A client-chosen id, for a create that must be idempotent. Re-creating with
   * an id the caller already owns answers with the existing row and discards
   * the `name` and `kind` sent with the repeat — a create is not a rename.
   *
   * The id is trimmed first, so `" abc"` cannot store a row addressable only by
   * a string with a space in it. Blank ids and the loose bucket's id are
   * refused: the first slips past the model's `??=` default and stores a row
   * nothing can address, the second is reserved.
   */
  id: z
    .string()
    .max(128)
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, {
      message: "Project id must not be blank"
    })
    .refine((value) => value !== LOOSE_PROJECT_ID, {
      message: `"${LOOSE_PROJECT_ID}" is reserved for documents in no project`
    })
    .optional(),
  name: z.string().min(1).max(200),
  kind: z.string().max(64).default(""),
  /**
   * The directory the new project's folder is created in, on a local install.
   * Unset, the folder goes in the projects folder (`PROJECTS_DIR`). Any
   * existing writable directory the caller may reach is allowed, except one
   * inside another project's folder.
   */
  location: z.string().trim().min(1).max(4096).optional()
});
export type CreateProjectInput = z.infer<typeof createProjectInput>;

/**
 * Open an existing local folder as a project. `name` defaults to the name in
 * the folder's `.nodetool/project.json`, then to the folder's own name.
 */
export const openProjectFolderInput = z.object({
  path: z.string().min(1).max(4096),
  name: z.string().trim().min(1).max(200).optional()
});
export type OpenProjectFolderInput = z.infer<typeof openProjectFolderInput>;

/** Point a project at the new place of its folder. */
export const relocateProjectInput = z.object({
  project_id: z.string().min(1),
  path: z.string().min(1).max(4096)
});
export type RelocateProjectInput = z.infer<typeof relocateProjectInput>;

export const patchProjectInput = z
  .object({
    name: z.string().min(1).max(200).optional(),
    kind: z.string().max(64).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });
export type PatchProjectInput = z.infer<typeof patchProjectInput>;

// ── Documents ────────────────────────────────────────────────────────────────
// Spelled as the workspace tab type that opens each one, so a ref opens a tab
// with no translation table in between.

export const projectDocumentType = z.enum([
  "storyboard",
  "script",
  "timeline",
  "sketch",
  "application",
  "jsscript",
  "game"
]);
export type ProjectDocumentType = z.infer<typeof projectDocumentType>;

/** The document kinds that are JSON files in the project folder. */
export const fileDocumentType = z.enum(["workflow", "timeline", "storyboard", "script"]);
export type FileDocumentType = z.infer<typeof fileDocumentType>;

/**
 * The file a workflow or timeline has in its project folder. `ok`: the file
 * matches the document. `invalid`: the file was edited and refused, `error`
 * says why, and the document keeps its last valid content. `missing`: the
 * file is gone. `path` is relative to the project folder.
 */
export const projectDocumentFile = z.object({
  path: z.string(),
  state: z.enum(["ok", "invalid", "missing"]),
  error: z.string().nullable()
});
export type ProjectDocumentFile = z.infer<typeof projectDocumentFile>;

export const projectDocumentRef = z.object({
  type: projectDocumentType,
  ref: z.string(),
  name: z.string(),
  updatedAt: z.string(),
  /** The file of a workflow or timeline. Absent for the other kinds. */
  file: projectDocumentFile.nullable().optional()
});
export type ProjectDocumentRef = z.infer<typeof projectDocumentRef>;

/** A document in `projects.documents`: the copyable kinds plus workflows. */
export const projectDocumentListEntry = projectDocumentRef.extend({
  type: z.enum([...projectDocumentType.options, "workflow"])
});
export type ProjectDocumentListEntry = z.infer<typeof projectDocumentListEntry>;

/** Find the workflow or timeline whose file is `path` in project `id`. */
export const projectDocumentByFileInput = z.object({
  id: z.string(),
  path: z.string().min(1)
});
export type ProjectDocumentByFileInput = z.infer<
  typeof projectDocumentByFileInput
>;

/** A workflow or timeline and its file. */
export const projectFileDocument = z.object({
  type: fileDocumentType,
  ref: z.string(),
  name: z.string(),
  updatedAt: z.string(),
  file: projectDocumentFile
});
export type ProjectFileDocument = z.infer<typeof projectFileDocument>;

/** Write a document's missing file again from the document. */
export const restoreDocumentFileInput = z.object({
  type: fileDocumentType,
  ref: z.string()
});
export type RestoreDocumentFileInput = z.infer<typeof restoreDocumentFileInput>;

/** Copy one project document and its owned dependency graph into another project. */
export const copyProjectDocumentInput = z.object({
  type: projectDocumentType,
  ref: z.string(),
  destinationProjectId: z.string()
});
export type CopyProjectDocumentInput = z.infer<
  typeof copyProjectDocumentInput
>;

export const copyProjectDocumentOutput = projectDocumentRef.extend({
  copiedAssets: z.number(),
  copiedDocuments: z.number()
});
export type CopyProjectDocumentOutput = z.infer<
  typeof copyProjectDocumentOutput
>;

/**
 * Derived from the stored document on every read. A timeline reports its size
 * but not whether it has been rendered — nothing on the sequence row records
 * that, and an omitted fact beats an invented one.
 */
export const projectDocumentStatus = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("storyboard"),
    shots: z.number(),
    stills: z.number(),
    clips: z.number()
  }),
  z.object({
    kind: z.literal("script"),
    lines: z.number(),
    voiced: z.number(),
    stale: z.number()
  }),
  z.object({
    kind: z.literal("timeline"),
    clips: z.number(),
    durationMs: z.number()
  })
]);
export type ProjectDocumentStatus = z.infer<typeof projectDocumentStatus>;

/**
 * A stored media locator a card renders through `ResponsiveImage`. `asset://`
 * is an identifier, not a URL — the client resolves it.
 */
export const projectThumbnail = z.object({
  uri: z.string().optional(),
  asset_id: z.string().nullable().optional()
});
export type ProjectThumbnail = z.infer<typeof projectThumbnail>;

/**
 * What a document card draws above its name, for the kinds whose glance is not
 * a picture: a script's opening lines with their voicing state, and a cut's
 * tracks reduced to bars. Both are already-stored facts sliced down to what a
 * 120px card can show, so the card renders without fetching the document.
 */
export const projectDocumentPreview = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("script"),
    lines: z.array(
      z.object({
        speaker: z.string(),
        text: z.string(),
        /** `voiced` matches its take; `stale` drifted from it; `draft` has none. */
        state: z.enum(["voiced", "stale", "draft"])
      })
    )
  }),
  z.object({
    kind: z.literal("timeline"),
    /** Total span the bars are laid out against, in milliseconds. */
    durationMs: z.number(),
    tracks: z.array(
      z.object({
        type: timelineTrack.shape.type,
        name: z.string(),
        clips: z.array(
          z.object({ startMs: z.number(), durationMs: z.number() })
        )
      })
    )
  })
]);
export type ProjectDocumentPreview = z.infer<typeof projectDocumentPreview>;

/**
 * What counts as a project document: every kind that opens in a workspace tab.
 * The project overview, the home documents strip and the Documents panel all
 * list these. It is every {@link projectDocumentType} plus `workflow` and
 * `text` (a text file asset, such as a Markdown note). Copying a document into
 * another project covers neither of those, so they stay out of
 * {@link projectDocumentType}.
 */
export const projectSummaryDocumentType = z.enum([
  ...projectDocumentType.options,
  "workflow",
  "text"
]);
export type ProjectSummaryDocumentType = z.infer<
  typeof projectSummaryDocumentType
>;

export const projectDocumentSummary = projectDocumentRef.extend({
  type: projectSummaryDocumentType,
  status: projectDocumentStatus.nullable(),
  spendUsd: z.number(),
  unpricedCount: z.number(),
  /** Stills the card montages. Empty for the kinds that render none. */
  thumbnails: z.array(projectThumbnail),
  /** What the card draws when it has no stills. Null when there is nothing. */
  preview: projectDocumentPreview.nullable()
});
export type ProjectDocumentSummary = z.infer<typeof projectDocumentSummary>;

// ── Spend ────────────────────────────────────────────────────────────────────

export const spendCategory = z.enum(["stills", "clips", "voice", "pipeline"]);
export type SpendCategory = z.infer<typeof spendCategory>;

export const categorySpend = z.object({
  category: spendCategory,
  usd: z.number(),
  /** Calls in this category no catalog priced. They are not summed as zero. */
  unpricedCount: z.number()
});
export type CategorySpend = z.infer<typeof categorySpend>;

export const projectSpend = z.object({
  /** A lower bound whenever `unpricedCount` or `partial` says so. */
  totalUsd: z.number(),
  unpricedCount: z.number(),
  /** True when the ledger read hit its cap, so rows are missing from the sum. */
  partial: z.boolean().optional(),
  byCategory: z.array(categorySpend)
});
export type ProjectSpend = z.infer<typeof projectSpend>;

/**
 * An entity in a project. Entities are tagged image assets, not document rows,
 * so a card edits one in place rather than opening a tab — which is why this
 * carries no tab `type` and sits beside `documents` instead of inside it.
 */
export const projectEntitySummary = z.object({
  /** The entity's id, which is its asset id — also its reference image. */
  id: z.string(),
  kind: z.enum(["character", "location", "style", "prop"]),
  name: z.string(),
  descriptor: z.string(),
  description: z.string().optional(),
  voice_id: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  lora: z
    .object({
      url: z.string().optional(),
      asset_id: z.string().nullable().optional(),
      scale: z.number().optional()
    })
    .nullable()
    .optional(),
  palette: z
    .array(z.object({ name: z.string().optional(), hex: z.string() }))
    .nullable()
    .optional(),
  /** Reference image when the entity marker points at a separate asset. */
  reference_asset_id: z.string().optional(),
  updatedAt: z.string()
});
export type ProjectEntitySummary = z.infer<typeof projectEntitySummary>;

export const projectDetail = z.object({
  project: projectResponse,
  documents: z.array(projectDocumentSummary),
  /** True when a document table hit its per-type cap, so documents are missing. */
  documentsPartial: z.boolean().optional(),
  /** The project's entities, newest first. */
  entities: z.array(projectEntitySummary).default([]),
  spend: projectSpend
});
export type ProjectDetail = z.infer<typeof projectDetail>;

/** One page of a project's document cards, newest first. */
export const projectDocumentPageInput = z.object({
  id: z.string(),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(50).default(12)
});
export type ProjectDocumentPageInput = z.infer<typeof projectDocumentPageInput>;

export const projectDocumentPage = z.object({
  documents: z.array(projectDocumentSummary),
  /** Every document in the project, not only this page. */
  total: z.number(),
  /** True when a document table hit its per-type cap, so documents are missing. */
  partial: z.boolean()
});
export type ProjectDocumentPage = z.infer<typeof projectDocumentPage>;

/**
 * What a project holds. `entity` is not a {@link projectDocumentType}: nothing
 * opens an entity as a tab, so it has no tab type to be spelled as.
 */
export const projectMemberType = z.union([
  projectDocumentType,
  z.literal("entity")
]);
export type ProjectMemberType = z.infer<typeof projectMemberType>;

/**
 * Move one document or entity into a project, or — with
 * {@link LOOSE_PROJECT_ID} — back out of every project.
 */
export const assignDocumentInput = z.object({
  projectId: z.string(),
  type: projectMemberType,
  ref: z.string()
});
export type AssignDocumentInput = z.infer<typeof assignDocumentInput>;

// ── Project folder migration ─────────────────────────────────────────────────
// The upgrade from before project folders, as the user confirms and follows
// it. See docs/project-folders/migration-ux.md.

/** Where the migration of a user's projects into folders stands. */
export const projectFolderMigrationState = z.enum([
  "not_started",
  "plan_shown",
  "confirmed",
  "running",
  "paused",
  "done"
]);
export type ProjectFolderMigrationState = z.infer<typeof projectFolderMigrationState>;

/**
 * Something the migration could not finish: an asset whose bytes stayed in
 * asset storage, or a project whose folder could not be made or reached.
 */
export const projectFolderMigrationFailure = z.object({
  kind: z.enum(["asset", "project"]),
  id: z.string(),
  name: z.string(),
  project_id: z.string().nullable(),
  project_name: z.string().nullable(),
  reason: z.string()
});
export type ProjectFolderMigrationFailure = z.infer<
  typeof projectFolderMigrationFailure
>;

/**
 * The directory new project folders go in. `error` says why it cannot hold
 * them. `permission_prompt` is true where macOS asks the user for access
 * first: Documents, Desktop, Downloads, iCloud Drive and external volumes.
 */
export const projectFolderMigrationLocation = z.object({
  path: z.string(),
  is_default: z.boolean(),
  permission_prompt: z.boolean(),
  error: z.string().nullable()
});
export type ProjectFolderMigrationLocation = z.infer<
  typeof projectFolderMigrationLocation
>;

/** A workspace row named in the plan. */
export const projectFolderMigrationWorkspace = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string()
});

/**
 * A project with more than one workspace: the one that becomes its folder,
 * and the ones that are hidden. Hidden workspaces keep their files.
 */
export const projectFolderMigrationExtraWorkspaces = z.object({
  project_id: z.string(),
  project_name: z.string(),
  kept: projectFolderMigrationWorkspace,
  hidden: z.array(projectFolderMigrationWorkspace)
});

/** What confirming the migration does. */
export const projectFolderMigrationPlan = z.object({
  projects: z.number().int().nonnegative(),
  assets: z.number().int().nonnegative(),
  workflows: z.number().int().nonnegative(),
  timelines: z.number().int().nonnegative(),
  extra_workspaces: z.array(projectFolderMigrationExtraWorkspaces),
  location: projectFolderMigrationLocation
});
export type ProjectFolderMigrationPlan = z.infer<typeof projectFolderMigrationPlan>;

/**
 * The migration as a client shows it. `applies` is false where the server
 * migrates without asking: in the cloud, on a production server, and on an
 * install with nothing to move. `progress.done` and `progress.total` count
 * assets. `current_project` is known only to the process that does the work.
 */
export const projectFolderMigrationStatus = z.object({
  applies: z.boolean(),
  state: projectFolderMigrationState,
  location: z.string().nullable(),
  progress: z.object({
    done: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    phase: z.enum(["folders", "files", "assets"]).nullable(),
    current_project: z.string().nullable()
  }),
  failures: z.array(projectFolderMigrationFailure),
  failure_count: z.number().int().nonnegative(),
  dismissed: z.boolean()
});
export type ProjectFolderMigrationStatus = z.infer<
  typeof projectFolderMigrationStatus
>;

/** A location the user chose instead of the configured one. */
export const projectFolderMigrationLocationInput = z
  .object({ location: z.string().trim().min(1).max(4096).optional() })
  .optional();
export type ProjectFolderMigrationLocationInput = z.infer<
  typeof projectFolderMigrationLocationInput
>;
