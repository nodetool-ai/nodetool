/**
 * The `apify` module's specs — data only, no implementation.
 *
 * Split out for the reason every module splits: the registry's eager spec
 * table imports this file and never `apify.ts`, so the client, the policy and
 * the asset importer stay out of the entry graph until something calls them.
 *
 * The descriptions are load-bearing rather than decorative. These capabilities
 * spend money on somebody else's machines, and the two failure modes that
 * matter are a model inventing an actor id and a model reaching for a browser
 * when an HTTP fetch would have done. Both are addressed here, in the text the
 * model actually reads, and not only in the code that refuses afterwards.
 */

import type { JsonSchema } from "@nodetool-ai/runtime";

import type { CapabilitySpec } from "./types.js";

const ACTOR_ID_FIELD = {
  type: "string" as const,
  description:
    'Actor id as "owner/name", e.g. "apify/website-content-crawler". Never ' +
    "invent one: use search_apify_actors to find an actor, or pick one this " +
    "install already ships. An id that does not exist fails the call."
};

export const SEARCH_APIFY_ACTORS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        'What the actor should do, e.g. "youtube transcript" or "google maps ' +
        'businesses". Describe the capability, not a brand.'
    },
    limit: {
      type: "integer",
      description: "How many actors to return.",
      default: 10,
      maximum: 50
    },
    category: {
      type: "string",
      description: "Restrict to one Apify store category."
    }
  },
  required: ["query"]
};

export const searchApifyActorsSpec: CapabilitySpec = {
  name: "search_apify_actors",
  description:
    "Search the Apify Actor Store for an actor that provides a capability " +
    "NodeTool does not have natively — crawling, browser automation, " +
    "structured extraction, maps and business listings, social media, media " +
    "downloads, screenshots, transcripts. Returns a compact list: id, what " +
    "it does, publisher, popularity, and pricing model. Inspect an " +
    "unfamiliar actor with get_apify_actor_schema before running it. " +
    "Availability depends on this install's Apify mode; when discovery is " +
    "off, only the actors it already ships can be run.",
  inputSchema: SEARCH_APIFY_ACTORS_SCHEMA,
  category: "read",
  userMessage: (params) => {
    const query = (params.query as string | undefined) ?? "actors";
    const msg = `Searching Apify for '${query}'`;
    return msg.length > 80 ? "Searching Apify actors" : msg;
  }
};

export const getApifyActorSchemaSpec: CapabilitySpec = {
  name: "get_apify_actor_schema",
  description:
    "Read an actor's input schema — the required and optional fields, their " +
    "types, enums, defaults, and descriptions — so a run can be given valid " +
    "input. Read from the actor's own machine-readable schema, not its " +
    "README. Call this before running any actor whose input you do not " +
    "already know; guessing field names starts a run that succeeds and " +
    "returns nothing.",
  inputSchema: {
    type: "object",
    properties: { actor_id: ACTOR_ID_FIELD },
    required: ["actor_id"]
  },
  category: "read",
  userMessage: (params) =>
    `Reading the input schema for ${String(params.actor_id ?? "an actor")}`
};

export const getApifyActorSpec: CapabilitySpec = {
  name: "get_apify_actor",
  description:
    "Read one actor's record: what it does, who publishes it, how heavily it " +
    "is used, its current pricing, and whether this install allows running " +
    "it. Use it to compare candidates from search_apify_actors before " +
    "spending a run.",
  inputSchema: {
    type: "object",
    properties: { actor_id: ACTOR_ID_FIELD },
    required: ["actor_id"]
  },
  category: "read",
  userMessage: (params) =>
    `Reading the Apify actor ${String(params.actor_id ?? "")}`
};

export const RUN_APIFY_ACTOR_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    actor_id: ACTOR_ID_FIELD,
    input: {
      type: "object",
      description:
        "The actor's own input object, matching its input schema. Read the " +
        "schema with get_apify_actor_schema first — field names differ per " +
        "actor and a wrong key is not an error, it is an empty result.",
      additionalProperties: true
    },
    wait_for_finish: {
      type: "boolean",
      description:
        "Wait for the run to finish and return its results. Set false to " +
        "start it and poll later with get_apify_run — useful for an actor " +
        "that takes many minutes.",
      default: true
    },
    max_items: {
      type: "integer",
      description:
        "Cap the dataset items the run is billed for. Clamped to this " +
        "install's limit."
    },
    timeout_seconds: {
      type: "integer",
      description:
        "Give up on the run after this long and abort it. Clamped to this " +
        "install's limit."
    },
    preview_items: {
      type: "integer",
      description:
        "How many dataset rows to return inline. The rest stay in the " +
        "dataset and are read with get_apify_dataset_items.",
      default: 20
    }
  },
  required: ["actor_id", "input"]
};

export const runApifyActorSpec: CapabilitySpec = {
  name: "run_apify_actor",
  description:
    "Run an Apify actor and return its results. This is the general escape " +
    "hatch for external capabilities NodeTool has no node for. Prefer the " +
    "cheapest thing that works: a content crawl beats an HTML scrape beats a " +
    "full browser run, and a browser actor costs many times what a fetch " +
    "does. Use search_apify_actors if you do not know which actor to use, " +
    "and get_apify_actor_schema before running an unfamiliar one — do not " +
    "invent actor ids or input fields. Runs cost money and count against " +
    "this session's budget. Results come back as a dataset preview plus the " +
    "ids needed to read more; files the actor produced are imported as " +
    "NodeTool assets.",
  inputSchema: RUN_APIFY_ACTOR_SCHEMA,
  category: "external",
  userMessage: (params) =>
    `Running the Apify actor ${String(params.actor_id ?? "")}`
};

export const getApifyRunSpec: CapabilitySpec = {
  name: "get_apify_run",
  description:
    "Check a run started with wait_for_finish: false. Reports its status, " +
    "what it has cost so far, and — once it has succeeded — the dataset to " +
    "read.",
  inputSchema: {
    type: "object",
    properties: {
      run_id: { type: "string", description: "The run id." }
    },
    required: ["run_id"]
  },
  category: "read",
  userMessage: () => "Checking an Apify run"
};

export const abortApifyRunSpec: CapabilitySpec = {
  name: "abort_apify_run",
  description:
    "Stop a running actor. Use it as soon as a run is known to be unwanted — " +
    "an actor left running keeps billing. Aborting a run that already " +
    "finished does nothing and is not an error.",
  inputSchema: {
    type: "object",
    properties: {
      run_id: { type: "string", description: "The run id." }
    },
    required: ["run_id"]
  },
  category: "external",
  userMessage: () => "Stopping an Apify run"
};

export const getApifyDatasetItemsSpec: CapabilitySpec = {
  name: "get_apify_dataset_items",
  description:
    "Read a page of rows from a run's dataset. Datasets can hold hundreds of " +
    "thousands of rows, so this always pages: pass offset and limit, and " +
    "read the reported total before deciding to walk the whole thing.",
  inputSchema: {
    type: "object",
    properties: {
      dataset_id: { type: "string", description: "The dataset id." },
      offset: { type: "integer", description: "Rows to skip.", default: 0 },
      limit: {
        type: "integer",
        description: "Rows to return.",
        default: 20,
        maximum: 250
      },
      fields: {
        type: "array",
        items: { type: "string" },
        description:
          "Keep only these fields of each row. Use it when rows are large " +
          "and only a few fields matter."
      }
    },
    required: ["dataset_id"]
  },
  category: "read",
  userMessage: () => "Reading Apify dataset items"
};

export const getApifyRecordSpec: CapabilitySpec = {
  name: "get_apify_key_value_record",
  description:
    "Read one record from a run's key-value store — where actors put " +
    "non-tabular output such as a screenshot, a rendered PDF, or the OUTPUT " +
    "key. Text and JSON come back inline; binary is imported as a NodeTool " +
    "asset and returned as a URL, because Apify's own URLs expire.",
  inputSchema: {
    type: "object",
    properties: {
      store_id: { type: "string", description: "The key-value store id." },
      key: {
        type: "string",
        description: 'The record key, e.g. "OUTPUT".',
        default: "OUTPUT"
      }
    },
    required: ["store_id"]
  },
  category: "read",
  userMessage: () => "Reading an Apify record"
};

/** Every spec this module declares, in declaration order. */
export const apifySpecs: readonly CapabilitySpec[] = [
  searchApifyActorsSpec,
  getApifyActorSpec,
  getApifyActorSchemaSpec,
  runApifyActorSpec,
  getApifyRunSpec,
  abortApifyRunSpec,
  getApifyDatasetItemsSpec,
  getApifyRecordSpec
];
