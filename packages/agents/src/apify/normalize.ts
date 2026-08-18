/**
 * Turning Apify's responses into things that fit in a model's context.
 *
 * Every function here exists because the raw response does not fit. A store
 * search returns thirty-odd fields per actor including two picture URLs and a
 * 90-day run histogram; an input schema for a mature actor runs to hundreds of
 * lines of editor hints and conditional sections; a dataset can hold six
 * figures of rows. Handing any of those to a model straight costs more than
 * the actor run did and buys nothing — the model needs the actor's id, what it
 * does, what it costs, and which fields are required.
 *
 * The rule throughout: keep what a decision turns on, drop presentation, and
 * when something is truncated **say so in the result**, with the handle needed
 * to read the rest. A silent truncation reads as a complete answer.
 */

import { isRecord, isString } from "../utils/type-guards.js";
import { catalogActor, type CatalogActor } from "./catalog.js";
import { toCanonicalActorId } from "./client.js";

/** Longest description text kept on any summarized object. */
const MAX_DESCRIPTION_CHARS = 240;

/** Items returned inline by default; the rest stay in the dataset. */
export const DEFAULT_DATASET_PREVIEW = 20;

/** Hard ceiling on one dataset page, whatever a caller asks for. */
export const MAX_DATASET_PAGE = 250;

/** Serialized size above which a dataset page is trimmed further. */
const MAX_INLINE_RESULT_BYTES = 256 * 1024;

function clip(value: unknown, max = MAX_DESCRIPTION_CHARS): string | undefined {
  if (!isString(value)) return undefined;
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length === 0) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** One actor, in the dozen fields a choice between actors turns on. */
export interface ActorSummary {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly publisher?: string;
  readonly total_runs?: number;
  readonly monthly_users?: number;
  readonly rating?: number;
  readonly pricing_model?: string;
  readonly categories?: readonly string[];
  readonly url: string;
  /** True when NodeTool ships this actor on its default allowlist. */
  readonly shipped: boolean;
  /** Present for shipped actors: what NodeTool uses it for. */
  readonly nodetool_capability?: string;
}

/**
 * Compact one store listing.
 *
 * The id is assembled from `username` and `name` rather than read from `id`:
 * the store's `id` field is Apify's opaque internal key, while every actor
 * page, every doc example and therefore every model writes `username/name` —
 * and that is also the form the allowlist compares against.
 */
export function summarizeActor(item: Record<string, unknown>): ActorSummary {
  const username = isString(item.username) ? item.username : undefined;
  const name = isString(item.name) ? item.name : undefined;
  const id =
    username !== undefined && name !== undefined
      ? `${username}/${name}`
      : toCanonicalActorId(isString(item.id) ? item.id : "");
  const shipped: CatalogActor | undefined = catalogActor(id);
  const categories = Array.isArray(item.categories)
    ? item.categories.filter(isString).slice(0, 5)
    : undefined;

  return {
    id,
    ...(clip(item.title) === undefined ? {} : { title: clip(item.title) }),
    ...(clip(item.description) === undefined
      ? {}
      : { description: clip(item.description) }),
    ...(isString(item.userFullName) || username !== undefined
      ? { publisher: isString(item.userFullName) ? item.userFullName : username }
      : {}),
    ...(finite(item.totalRuns) === undefined
      ? {}
      : { total_runs: finite(item.totalRuns) }),
    ...(finite(item.totalUsers30Days) === undefined
      ? {}
      : { monthly_users: finite(item.totalUsers30Days) }),
    ...(finite(item.actorReviewRating) === undefined
      ? {}
      : { rating: finite(item.actorReviewRating) }),
    ...(isString(item.pricingModel) ? { pricing_model: item.pricingModel } : {}),
    ...(categories === undefined || categories.length === 0
      ? {}
      : { categories }),
    url: `https://apify.com/${id}`,
    shipped: shipped !== undefined,
    ...(shipped === undefined
      ? {}
      : { nodetool_capability: shipped.capability })
  };
}

/** One input field, flattened out of the actor's schema. */
export interface SchemaField {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly description?: string;
  readonly default?: unknown;
  readonly enum?: readonly unknown[];
  /** For arrays and objects, the shape of what goes inside, when declared. */
  readonly items?: string;
}

export interface ActorInputSchema {
  readonly actor_id: string;
  readonly title?: string;
  readonly fields: readonly SchemaField[];
  /** Fields dropped to keep the summary small, if any. */
  readonly omitted_fields?: number;
  /** Where the full schema can be read, when something was omitted. */
  readonly full_schema_url?: string;
}

/** Fields kept in a flattened schema before the tail is summarized away. */
const MAX_SCHEMA_FIELDS = 40;

/**
 * Flatten an Apify input schema into a field list.
 *
 * Apify's schema is JSON Schema plus an editor vocabulary — `editor`,
 * `prefill`, `sectionCaption`, `nestedType`. The editor half drives their web
 * form and means nothing to a model constructing an input, so it is dropped;
 * `prefill` is kept as the default when there is no `default`, because for
 * many actors the prefill *is* the worked example.
 *
 * Required fields sort first so a truncated list never loses one.
 */
export function simplifyInputSchema(
  actorId: string,
  schema: unknown
): ActorInputSchema {
  const id = toCanonicalActorId(actorId);
  if (!isRecord(schema) || !isRecord(schema.properties)) {
    return {
      actor_id: id,
      fields: [],
      full_schema_url: `https://apify.com/${id}/input-schema`
    };
  }
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.filter(isString) : []
  );

  const all: SchemaField[] = Object.entries(schema.properties).map(
    ([name, raw]) => {
      const property = isRecord(raw) ? raw : {};
      const fallback = property.default ?? property.prefill;
      const enumValues = Array.isArray(property.enum)
        ? property.enum.slice(0, 20)
        : undefined;
      const items = isRecord(property.items)
        ? isString(property.items.type)
          ? property.items.type
          : undefined
        : isString(property.nestedType)
          ? property.nestedType
          : undefined;
      return {
        name,
        type: isString(property.type) ? property.type : "string",
        required: required.has(name),
        ...(clip(property.description ?? property.title) === undefined
          ? {}
          : { description: clip(property.description ?? property.title) }),
        ...(fallback === undefined ? {} : { default: fallback }),
        ...(enumValues === undefined ? {} : { enum: enumValues }),
        ...(items === undefined ? {} : { items })
      };
    }
  );

  all.sort((a, b) => Number(b.required) - Number(a.required));
  const fields = all.slice(0, MAX_SCHEMA_FIELDS);
  const omitted = all.length - fields.length;

  return {
    actor_id: id,
    ...(clip(schema.title) === undefined ? {} : { title: clip(schema.title) }),
    fields,
    ...(omitted > 0
      ? {
          omitted_fields: omitted,
          full_schema_url: `https://apify.com/${id}/input-schema`
        }
      : {})
  };
}

/**
 * Pull the input schema out of a build record.
 *
 * `actorDefinition.input` is the documented location and the only one this
 * reads. When a build carries none — some actors ship without a schema — the
 * caller gets an empty field list and says so, rather than this falling back to
 * scraping a README, which would put prose into a contract position.
 */
export function inputSchemaFromBuild(build: Record<string, unknown>): unknown {
  const definition = build.actorDefinition;
  return isRecord(definition) ? definition.input : undefined;
}

export interface DatasetSummary {
  readonly items: readonly unknown[];
  /** Total rows in the dataset, when Apify reported it. */
  readonly total?: number;
  readonly offset: number;
  /** True when more rows exist past this page. */
  readonly has_more: boolean;
  /** Present when rows were dropped to fit; says how to read the rest. */
  readonly note?: string;
}

/**
 * Shape one dataset page for a model or for guest code.
 *
 * Two independent limits apply, because rows vary by three orders of magnitude:
 * a row *count*, and a serialized *byte* ceiling. A hundred rows of a Maps
 * scrape fit comfortably; a hundred rows of a full-page crawl do not, and only
 * the byte check catches that. When the byte check bites, the page is halved
 * until it fits rather than truncating mid-row, so what comes back is always
 * whole records.
 */
export function summarizeDataset(page: {
  items: readonly unknown[];
  total?: number;
  offset: number;
  datasetId?: string;
}): DatasetSummary {
  let items = [...page.items];
  let trimmedForSize = false;
  while (
    items.length > 1 &&
    JSON.stringify(items).length > MAX_INLINE_RESULT_BYTES
  ) {
    items = items.slice(0, Math.floor(items.length / 2));
    trimmedForSize = true;
  }

  const nextOffset = page.offset + items.length;
  const hasMore =
    page.total === undefined
      ? items.length < page.items.length
      : nextOffset < page.total;

  const notes: string[] = [];
  if (trimmedForSize) {
    notes.push(
      `Rows were dropped from this page to stay under ${Math.floor(
        MAX_INLINE_RESULT_BYTES / 1024
      )}KB.`
    );
  }
  if (hasMore) {
    notes.push(
      page.datasetId === undefined
        ? `Read further rows with offset ${nextOffset}.`
        : `Read further rows with get_apify_dataset_items({dataset_id: "${page.datasetId}", offset: ${nextOffset}}).`
    );
  }

  return {
    items,
    ...(page.total === undefined ? {} : { total: page.total }),
    offset: page.offset,
    has_more: hasMore,
    ...(notes.length === 0 ? {} : { note: notes.join(" ") })
  };
}

/**
 * Where external data came from, carried alongside every result.
 *
 * Provenance matters more here than for a normal tool: everything an actor
 * returns is attacker-influenced text that is about to enter a model's
 * context, and "which actor, which run, when" is the first question asked when
 * an answer turns out to be wrong or hostile. It carries no token and no
 * actor input — an input can hold a query a user typed.
 */
export interface ApifyProvenance {
  readonly actor_id: string;
  readonly run_id: string;
  readonly retrieved_at: string;
  readonly dataset_id?: string;
  readonly key_value_store_id?: string;
  readonly status: string;
  readonly cost_usd?: number;
}
