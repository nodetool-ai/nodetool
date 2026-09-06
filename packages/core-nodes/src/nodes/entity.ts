/**
 * Entity nodes — read and write the entity library from a graph.
 *
 * An entity is the canonical descriptor of a character, location, style or
 * prop. `LoadEntity` and `ListEntities` bring library rows into a run;
 * `CreateEntity` puts one back. Identity is the point: `CreateEntity` upserts
 * on `key` (a SKU, say) and otherwise on (project, kind, name), so a batch that
 * runs twice yields the same entity ids twice instead of growing the library.
 *
 * All three need the `listEntities`/`getEntity`/`upsertEntity` model
 * interfaces, so they are server-tagged.
 */

import { BaseNode, isString, prop } from "@nodetool-ai/node-sdk";
import type {
  Entity,
  EntityKind,
  ImageRef,
  InputMode,
  OutputCorrelation
} from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { tagAsServer } from "@nodetool-ai/nodes-utils";

import { entityDefault, imageRefDefault } from "./ref-defaults.js";

/** The kinds an entity may have, as a prop dropdown takes them. */
const KIND_VALUES: readonly EntityKind[] = [
  "character",
  "location",
  "style",
  "prop"
];

/** `kind` on the reading nodes is optional; blank means every kind. */
const OPTIONAL_KIND_VALUES: readonly string[] = ["", ...KIND_VALUES];

const trimmed = (value: unknown): string =>
  isString(value) ? value.trim() : "";

/** A `kind` prop as the model interfaces take it: the enum, or nothing. */
function asKind(value: unknown): EntityKind | undefined {
  const kind = trimmed(value);
  return KIND_VALUES.includes(kind as EntityKind)
    ? (kind as EntityKind)
    : undefined;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => trimmed(entry)).filter((entry) => entry !== "");
}

/** The entity's primary reference image, or the empty image ref. */
function referenceImage(entity: Entity): ImageRef {
  const first = entity.reference_images?.[0];
  return (first ?? imageRefDefault) as ImageRef;
}

function requireContext(
  node: string,
  context: ProcessingContext | undefined
): ProcessingContext {
  if (!context) {
    throw new Error(`${node} requires a processing context`);
  }
  return context;
}

/**
 * The asset id a `CreateEntity` image points at. An entity is a marker on an
 * image asset row, so bytes with no row have to become one first.
 */
async function imageAssetId(
  context: ProcessingContext,
  image: unknown,
  name: string
): Promise<string> {
  const ref = (image ?? {}) as {
    asset_id?: string | null;
    uri?: string | null;
    data?: unknown;
  };
  const assetId = trimmed(ref.asset_id);
  if (assetId) return assetId;

  const uri = trimmed(ref.uri);
  if (uri.startsWith("asset://")) {
    const id = uri.slice("asset://".length).split(".")[0];
    if (id) return id;
  }

  // `data` is raw base64 or a Uint8Array, depending on which node produced it.
  const bytes =
    ref.data instanceof Uint8Array
      ? ref.data
      : isString(ref.data) && ref.data !== ""
        ? new Uint8Array(Buffer.from(ref.data, "base64"))
        : null;
  if (!bytes || bytes.length === 0) {
    throw new Error(
      "CreateEntity: the image input carries neither an asset id nor bytes — wire a generated or saved image."
    );
  }
  if (!context.hasModelInterface("createAsset")) {
    throw new Error(
      "CreateEntity: the image input has no asset id and this run cannot create assets."
    );
  }
  const created = (await context.createAsset({
    name: `${name || "entity"}.png`,
    contentType: "image/png",
    content: bytes
  })) as { id?: unknown } | null;
  const id = trimmed(created?.id);
  if (!id) {
    throw new Error(
      "CreateEntity: the reference image asset was created without an id."
    );
  }
  return id;
}

// ── LoadEntity ───────────────────────────────────────────────────────────────

/** Output handles LoadEntityNode.process() emits. */
type LoadEntityNodeOutputs = {
  entity: Entity;
  descriptor: string;
  name: string;
  kind: string;
  reference_image: ImageRef;
  voice_id: string;
};

export class LoadEntityNode extends BaseNode {
  static readonly nodeType = "nodetool.entity.LoadEntity";
  static readonly title = "Load Entity";
  static readonly description =
    "Read one entity from the library, by picker or by name.\n    entity, character, location, style, prop, library, load\n\n    Use cases:\n    - Feed a character's descriptor into a prompt\n    - Pull an entity's reference image into a generator\n    - Look an entity up by name inside a batch";
  static readonly metadataOutputTypes = {
    entity: "entity",
    descriptor: "str",
    name: "str",
    kind: "str",
    reference_image: "image",
    voice_id: "str"
  };
  static readonly inlineFields = ["entity", "name"];
  static readonly inputFields = ["entity", "name"];

  @prop({
    type: "entity",
    default: entityDefault,
    title: "Entity",
    description: "The entity to load. Takes precedence over Name."
  })
  declare entity: Entity;

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "Look the entity up by name when no entity is picked."
  })
  declare name: string;

  @prop({
    type: "str",
    default: "",
    title: "Kind",
    description: "Narrow a name lookup to one kind. Blank matches any kind.",
    values: [...OPTIONAL_KIND_VALUES]
  })
  declare kind: string;

  async process(
    context?: ProcessingContext
  ): Promise<LoadEntityNodeOutputs> {
    const entity = await this._load(context);
    return {
      entity,
      descriptor: entity.descriptor ?? "",
      name: entity.name ?? "",
      kind: entity.kind ?? "",
      reference_image: referenceImage(entity),
      voice_id: entity.voice_id ?? ""
    };
  }

  /**
   * The picked entity wins over the name. A picked value is a pointer whose
   * other fields are a cache, so the library row replaces it when one is
   * readable; an inline entity (a test, a DSL graph) keeps working with no
   * database at all.
   */
  private async _load(
    context: ProcessingContext | undefined
  ): Promise<Entity> {
    const picked = (this.entity ?? {}) as Entity;
    const pickedId = trimmed(picked.id);
    if (pickedId) {
      if (context?.hasModelInterface("getEntity")) {
        const stored = await context.getEntity(pickedId);
        if (stored) return stored;
      }
      if (trimmed(picked.name) || trimmed(picked.descriptor)) return picked;
      throw new Error(`LoadEntity: entity not found: ${pickedId}`);
    }

    const name = trimmed(this.name);
    if (!name) {
      throw new Error(
        "LoadEntity: pick an entity or give a name to look one up by."
      );
    }
    const ctx = requireContext("LoadEntity", context);
    const kind = asKind(this.kind);
    const candidates = await ctx.listEntities({ kind, nameContains: name });
    const lower = name.toLowerCase();
    const exact = candidates.find(
      (candidate) => trimmed(candidate.name).toLowerCase() === lower
    );
    const found = exact ?? candidates[0];
    if (!found) {
      throw new Error(`LoadEntity: no entity named "${name}" in the library.`);
    }
    return found;
  }
}

// ── ListEntities ─────────────────────────────────────────────────────────────

/** Output handles ListEntitiesNode emits — one per item, then the list. */
type ListEntitiesNodeOutputs = {
  entity: Entity;
  entities: Entity[];
};

export class ListEntitiesNode extends BaseNode {
  static readonly nodeType = "nodetool.entity.ListEntities";
  static readonly title = "List Entities";
  static readonly description =
    "List entities from the library, filtered by kind, tags, name or project.\n    entity, library, list, cast, batch\n\n    Use cases:\n    - Fan a graph out over every product in a project\n    - Collect a cast to pass into a generator\n    - Find the entities carrying one tag";
  static readonly metadataOutputTypes = {
    entity: "entity",
    entities: "list[entity]"
  };
  static readonly inlineFields = ["kind", "name_contains"];
  static readonly inputFields: string[] = [];

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation = {
    entity: { kind: "iteration", source: "__execution__", group: "items" },
    entities: { kind: "single", source: "__execution__" }
  } satisfies Record<string, OutputCorrelation>;

  @prop({
    type: "str",
    default: "",
    title: "Kind",
    description: "Only entities of this kind. Blank matches any kind.",
    values: [...OPTIONAL_KIND_VALUES]
  })
  declare kind: string;

  @prop({
    type: "list[str]",
    default: [],
    title: "Tags",
    description: "Only entities carrying these tags."
  })
  declare tags: string[];

  @prop({
    type: "str",
    default: "",
    title: "Name Contains",
    description: "Only entities whose name contains this text."
  })
  declare name_contains: string;

  @prop({
    type: "str",
    default: "",
    title: "Project",
    description: "Only entities in this project. Blank searches the whole library."
  })
  declare project: string;

  async process(context?: ProcessingContext): Promise<ListEntitiesNodeOutputs> {
    const entities = await this._list(context);
    return { entity: entities[0] ?? ({} as Entity), entities };
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Partial<ListEntitiesNodeOutputs>> {
    const entities = await this._list(context);
    for (const entity of entities) {
      yield { entity };
    }
    yield { entities };
  }

  private async _list(
    context: ProcessingContext | undefined
  ): Promise<Entity[]> {
    const ctx = requireContext("ListEntities", context);
    const tags = stringList(this.tags);
    const nameContains = trimmed(this.name_contains);
    const projectId = trimmed(this.project);
    return ctx.listEntities({
      kind: asKind(this.kind),
      tags: tags.length > 0 ? tags : undefined,
      nameContains: nameContains || undefined,
      projectId: projectId || undefined
    });
  }
}

// ── CreateEntity ─────────────────────────────────────────────────────────────

/** Output handles CreateEntityNode.process() emits. */
type CreateEntityNodeOutputs = {
  entity: Entity;
  created: boolean;
};

export class CreateEntityNode extends BaseNode {
  static readonly nodeType = "nodetool.entity.CreateEntity";
  static readonly title = "Create Entity";
  static readonly description =
    "Add an entity to the library, or update the one this graph made last time.\n    entity, library, create, upsert, batch\n\n    Use cases:\n    - Turn a product photo into a reusable entity per SKU\n    - Register a generated character so later shots stay consistent\n    - Re-run a catalog import without duplicating the library";
  static readonly metadataOutputTypes = {
    entity: "entity",
    created: "bool"
  };
  static readonly inlineFields = ["name", "kind", "descriptor"];
  static readonly inputFields = ["image", "name", "descriptor"];

  @prop({
    type: "image",
    default: imageRefDefault,
    title: "Image",
    description: "The reference image the entity shows."
  })
  declare image: ImageRef;

  @prop({
    type: "str",
    default: "prop",
    title: "Kind",
    description: "What the entity is.",
    values: [...KIND_VALUES]
  })
  declare kind: string;

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "Display name, referenced from shot text."
  })
  declare name: string;

  @prop({
    type: "str",
    default: "",
    title: "Descriptor",
    description:
      "The canonical visual description pasted into every prompt naming this entity."
  })
  declare descriptor: string;

  @prop({
    type: "str",
    default: "",
    title: "Description",
    description: "Longer notes, never injected into prompts."
  })
  declare description: string;

  @prop({
    type: "list[str]",
    default: [],
    title: "Tags",
    description: "Tags stored on the entity for later filtering."
  })
  declare tags: string[];

  @prop({
    type: "str",
    default: "",
    title: "Voice Id",
    description: "Provider voice id, for a character entity."
  })
  declare voice_id: string;

  @prop({
    type: "str",
    default: "",
    title: "Key",
    description:
      "Upsert identity (a SKU, say). A re-run with the same key updates its own entity instead of adding one."
  })
  declare key: string;

  async process(context?: ProcessingContext): Promise<CreateEntityNodeOutputs> {
    const ctx = requireContext("CreateEntity", context);
    const name = trimmed(this.name);
    if (!name) {
      throw new Error("CreateEntity: name is required.");
    }
    const kind = asKind(this.kind);
    if (!kind) {
      throw new Error(
        `CreateEntity: kind must be one of ${KIND_VALUES.join(", ")}.`
      );
    }
    const key = trimmed(this.key);
    const assetId = await imageAssetId(ctx, this.image, name);
    const tags = stringList(this.tags);
    const description = trimmed(this.description);
    const voiceId = trimmed(this.voice_id);

    const result = await ctx.upsertEntity({
      kind,
      name,
      descriptor: isString(this.descriptor) ? this.descriptor : "",
      imageAssetId: assetId,
      description: description || undefined,
      tags: tags.length > 0 ? tags : undefined,
      voiceId: voiceId || undefined,
      source: {
        workflow_id: ctx.workflowId ?? undefined,
        key: key || undefined
      }
    });

    return { entity: result.entity, created: result.created };
  }
}

export const ENTITY_NODES = tagAsServer([
  LoadEntityNode,
  ListEntitiesNode,
  CreateEntityNode
]);
