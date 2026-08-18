/**
 * The `apify` capability module — external capabilities, run outside the
 * sandbox, reached through one gated surface.
 *
 * The point of this module is what it is *not*: it is not a YouTube node, a
 * Maps node, and a screenshot node. Apify publishes thousands of actors, and
 * wrapping them one at a time produces a wrapper backlog that never catches
 * up. So NodeTool exposes the primitive — find an actor, read its input
 * contract, run it, read what it produced — and lets an agent compose the rest.
 *
 * What that buys, and what it costs, both come from the same fact: an actor is
 * third-party code running on third-party machines against a URL a model chose.
 * That is exactly the capability the sandbox is denied, so the whole surface is
 * built so the sandbox never gains it:
 *
 * - **The token stays here.** Guest code calls `run_apify_actor`; it never sees
 *   `APIFY_API_TOKEN`. The old `@nodetool-ai/sandbox-apify` pack handed the
 *   token *to the guest* to build its own requests — this module is what
 *   replaced that.
 * - **The network stays here.** The guest gets normalized values and asset
 *   URLs. Every HTTP call — to Apify, and to any file an actor produced —
 *   happens on the host, through `safeFetch`, past NodeTool's SSRF screen.
 * - **The policy is separate from the gate.** `policy.ts` answers "may this
 *   actor run at all, and can this session afford it"; the ordinary capability
 *   gate answers "may this session act externally". Both apply.
 *
 * Ergonomic wrappers belong on top of this, not beside it: a `crawl_website`
 * is a catalog lookup plus a field mapping plus this same `runActor`, so a
 * wrapper can never reach anything the primitive would have refused.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";

import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  abortApifyRunSpec,
  getApifyActorSchemaSpec,
  getApifyActorSpec,
  getApifyDatasetItemsSpec,
  getApifyRecordSpec,
  getApifyRunSpec,
  runApifyActorSpec,
  searchApifyActorsSpec
} from "./apify.specs.js";
import { ApifyClient, toCanonicalActorId } from "../apify/client.js";
import { ApifyError, asApifyError } from "../apify/errors.js";
import {
  ApifyBudgetLedger,
  allowsDiscovery,
  apifyPolicyFromEnv,
  decideActor,
  type ApifyPolicy
} from "../apify/policy.js";
import { catalogActor, ACTOR_CATALOG } from "../apify/catalog.js";
import {
  DEFAULT_DATASET_PREVIEW,
  MAX_DATASET_PAGE,
  inputSchemaFromBuild,
  simplifyInputSchema,
  summarizeActor,
  summarizeDataset
} from "../apify/normalize.js";
import { importActorBytes, isBinaryContentType } from "../apify/assets.js";
import { provenanceOf, resolveApifyToken, runActor } from "../apify/run.js";
import { isRecord, isString } from "../utils/type-guards.js";

/**
 * The budget is per capability *run*, and it is held in a module-level map
 * keyed on the run object.
 *
 * A `CapabilityRun` is created once per chat turn, per workflow execution, or
 * per Code node action, which is exactly the scope "how much may this session
 * spend on Apify" should be measured over. A `WeakMap` rather than a field on
 * the run because `CapabilityRun` is a shared interface every module sees, and
 * one module's accounting has no business widening it.
 */
const LEDGERS = new WeakMap<CapabilityRun, ApifyBudgetLedger>();

function ledgerFor(run: CapabilityRun, policy: ApifyPolicy): ApifyBudgetLedger {
  const existing = LEDGERS.get(run);
  if (existing !== undefined) return existing;
  const created = new ApifyBudgetLedger(policy.budget);
  LEDGERS.set(run, created);
  return created;
}

/** Build a client for this run, or fail with the reason a user can act on. */
async function clientFor(context: ProcessingContext): Promise<ApifyClient> {
  return new ApifyClient(await resolveApifyToken(context));
}

/** The run-scoped cancellation signal, which every Apify call threads through. */
function signalOf(run: CapabilityRun): AbortSignal | undefined {
  return run.context.signal;
}

/**
 * Route an approval for one actor through the run's own permission gate.
 *
 * Reusing `gate.requestApproval` rather than inventing a second prompt is the
 * whole reason `discovery` mode is safe to offer: the user sees an Apify actor
 * approval in the same place, with the same "allow for this chat" semantics, as
 * every other permission decision.
 */
function approverFor(run: CapabilityRun) {
  return async (actorId: string, reason: string): Promise<boolean> => {
    const key = `run_apify_actor:${actorId}`;
    if (run.gate.sessionAllow.has(key)) return true;
    const decision = await run.gate.requestApproval({
      toolName: "run_apify_actor",
      category: "external",
      args: { actor_id: actorId },
      message: reason
    });
    if (decision === "allow_for_chat") {
      run.gate.sessionAllow.add(key);
      return true;
    }
    return decision === "allow";
  };
}

/** Turn any throw into the `{ok: false, error, error_kind}` result shape. */
async function guarded(
  work: () => Promise<unknown>
): Promise<unknown> {
  try {
    return await work();
  } catch (e) {
    return asApifyError(e).toResult();
  }
}

function requireString(
  params: Record<string, unknown>,
  key: string
): string {
  const value = params[key];
  if (!isString(value) || value.trim().length === 0) {
    throw new ApifyError("invalid_input", `${key} is required`);
  }
  return value.trim();
}

function readInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

// ---------------------------------------------------------------------------
// search_apify_actors
// ---------------------------------------------------------------------------

const searchApifyActors: CapabilityExport = {
  spec: searchApifyActorsSpec,
  impl: (run, params) =>
    guarded(async () => {
      const policy = apifyPolicyFromEnv();
      if (policy.mode === "disabled") {
        throw new ApifyError(
          "disabled",
          "The Apify integration is disabled on this install."
        );
      }
      const query = requireString(params, "query");

      // Without discovery, searching the store would list actors this install
      // will not run. Answering from the shipped catalog instead keeps the
      // call useful and keeps the answer honest about what is runnable.
      if (!allowsDiscovery(policy)) {
        const needle = query.toLowerCase();
        const matches = ACTOR_CATALOG.filter(
          (actor) =>
            actor.id.includes(needle) ||
            actor.capability.includes(needle) ||
            actor.summary.toLowerCase().includes(needle)
        );
        return {
          ok: true,
          discovery: "allowlist-only",
          note:
            "Store search is off on this install, so these are the actors it " +
            "ships and allows. An operator can widen it with " +
            "NODETOOL_APIFY_MODE=discovery.",
          actors: (matches.length > 0 ? matches : ACTOR_CATALOG).map(
            (actor) => ({
              id: actor.id,
              capability: actor.capability,
              description: actor.summary,
              cost_hint: actor.costHint,
              shipped: true
            })
          )
        };
      }

      const client = await clientFor(run.context);
      const limit = Math.min(readInteger(params.limit, 10), 50);
      const items = await client.searchActors(
        {
          query,
          limit,
          category: isString(params.category) ? params.category : undefined
        },
        signalOf(run)
      );
      const actors = items.map(summarizeActor);
      return {
        ok: true,
        discovery: policy.mode,
        count: actors.length,
        actors,
        note:
          "Read an unfamiliar actor's input contract with " +
          "get_apify_actor_schema before running it."
      };
    })
};

// ---------------------------------------------------------------------------
// get_apify_actor
// ---------------------------------------------------------------------------

const getApifyActor: CapabilityExport = {
  spec: getApifyActorSpec,
  impl: (run, params) =>
    guarded(async () => {
      const policy = apifyPolicyFromEnv();
      const actorId = toCanonicalActorId(requireString(params, "actor_id"));
      assertInspectable(policy, actorId);

      const client = await clientFor(run.context);
      const actor = await client.getActor(actorId, signalOf(run));
      const verdict = decideActor(policy, actorId);
      const shipped = catalogActor(actorId);

      const result: Record<string, unknown> = {
        ok: true,
        ...summarizeActor(actor),
        runnable: verdict.decision
      };
      if (verdict.decision !== "allow") result.runnable_reason = verdict.reason;
      if (shipped !== undefined) result.cost_hint = shipped.costHint;
      return result;
    })
};

/**
 * Refuse to *read* an actor this install would never run.
 *
 * Inspection is free and side-effect-free, so the restriction is not about
 * cost. It is about not filling a model's context with a catalog of actors it
 * cannot use, which reliably produces a plan built on one of them.
 */
function assertInspectable(policy: ApifyPolicy, actorId: string): void {
  if (policy.mode === "disabled") {
    throw new ApifyError(
      "disabled",
      "The Apify integration is disabled on this install.",
      { actorId }
    );
  }
  if (allowsDiscovery(policy)) return;
  const verdict = decideActor(policy, actorId);
  if (verdict.decision !== "allow") {
    throw new ApifyError("actor_not_allowed", verdict.reason, { actorId });
  }
}

// ---------------------------------------------------------------------------
// get_apify_actor_schema
// ---------------------------------------------------------------------------

const getApifyActorSchema: CapabilityExport = {
  spec: getApifyActorSchemaSpec,
  impl: (run, params) =>
    guarded(async () => {
      const policy = apifyPolicyFromEnv();
      const actorId = toCanonicalActorId(requireString(params, "actor_id"));
      assertInspectable(policy, actorId);

      const client = await clientFor(run.context);
      const build = await client.getDefaultBuild(actorId, signalOf(run));
      const schema = simplifyInputSchema(
        actorId,
        inputSchemaFromBuild(build)
      );
      if (schema.fields.length === 0) {
        return {
          ok: true,
          ...schema,
          note:
            "This actor's build declares no input schema. Its README on " +
            `https://apify.com/${actorId} is the only description of its ` +
            "input, so treat any input as unverified."
        };
      }
      return { ok: true, ...schema };
    })
};

// ---------------------------------------------------------------------------
// run_apify_actor
// ---------------------------------------------------------------------------

const runApifyActor: CapabilityExport = {
  spec: runApifyActorSpec,
  impl: (run, params) =>
    guarded(async () => {
      const policy = apifyPolicyFromEnv();
      const actorId = toCanonicalActorId(requireString(params, "actor_id"));
      const input = isRecord(params.input) ? params.input : {};
      const client = await clientFor(run.context);
      const ledger = ledgerFor(run, policy);
      const waitForFinish = params.wait_for_finish !== false;

      const { run: actorRun, provenance } = await runActor(
        client,
        policy,
        ledger,
        {
          actorId,
          input,
          waitForFinish,
          timeoutSecs:
            params.timeout_seconds === undefined
              ? undefined
              : readInteger(params.timeout_seconds, 300),
          maxItems:
            params.max_items === undefined
              ? undefined
              : readInteger(params.max_items, 1000)
        },
        { signal: signalOf(run), approve: approverFor(run) }
      );

      if (!waitForFinish) {
        return {
          ok: true,
          status: actorRun.status,
          run_id: actorRun.id,
          provenance,
          note:
            "The run was started, not awaited. Poll it with " +
            `get_apify_run({run_id: "${actorRun.id}"}), and abort it with ` +
            "abort_apify_run if it is no longer wanted — a running actor " +
            "keeps billing."
        };
      }

      const preview = Math.min(
        readInteger(params.preview_items, DEFAULT_DATASET_PREVIEW),
        MAX_DATASET_PAGE
      );
      const dataset =
        actorRun.defaultDatasetId === undefined
          ? undefined
          : await client
              .getDatasetItems(
                {
                  datasetId: actorRun.defaultDatasetId,
                  limit: preview,
                  offset: 0,
                  clean: true
                },
                signalOf(run)
              )
              .catch(() => undefined);

      return {
        ok: true,
        status: actorRun.status,
        run_id: actorRun.id,
        provenance,
        ...(dataset === undefined
          ? {
              note:
                "The run produced no readable dataset. Non-tabular output " +
                "lives in the key-value store — read it with " +
                "get_apify_key_value_record."
            }
          : {
              dataset: summarizeDataset({
                items: dataset.items,
                total: dataset.total,
                offset: dataset.offset,
                datasetId: actorRun.defaultDatasetId
              })
            }),
        budget: {
          runs_used: ledger.runs,
          runs_allowed: ledger.budget.maxRuns,
          session_cost_usd: Number(ledger.costUsd.toFixed(4))
        }
      };
    })
};

// ---------------------------------------------------------------------------
// get_apify_run / abort_apify_run
// ---------------------------------------------------------------------------

const getApifyRun: CapabilityExport = {
  spec: getApifyRunSpec,
  impl: (run, params) =>
    guarded(async () => {
      const client = await clientFor(run.context);
      const runId = requireString(params, "run_id");
      const actorRun = await client.getRun(runId, signalOf(run));
      return {
        ok: true,
        status: actorRun.status,
        run_id: actorRun.id,
        provenance: provenanceOf(actorRun.actId, actorRun)
      };
    })
};

const abortApifyRun: CapabilityExport = {
  spec: abortApifyRunSpec,
  impl: (run, params) =>
    guarded(async () => {
      const client = await clientFor(run.context);
      const runId = requireString(params, "run_id");
      // Deliberately not passing the run signal: aborting is what happens
      // *because* something was cancelled, so the cleanup must outlive it.
      const aborted = await client.abortRun(runId);
      return {
        ok: true,
        run_id: runId,
        // A run that finished on its own is the success case, not an error.
        status: aborted?.status ?? "ALREADY_FINISHED"
      };
    })
};

// ---------------------------------------------------------------------------
// get_apify_dataset_items
// ---------------------------------------------------------------------------

const getApifyDatasetItems: CapabilityExport = {
  spec: getApifyDatasetItemsSpec,
  impl: (run, params) =>
    guarded(async () => {
      const client = await clientFor(run.context);
      const datasetId = requireString(params, "dataset_id");
      const limit = Math.min(
        readInteger(params.limit, DEFAULT_DATASET_PREVIEW),
        MAX_DATASET_PAGE
      );
      const offset = Number.isFinite(Number(params.offset))
        ? Math.max(0, Math.floor(Number(params.offset)))
        : 0;
      const fields = Array.isArray(params.fields)
        ? params.fields.filter(isString)
        : undefined;

      const page = await client.getDatasetItems(
        {
          datasetId,
          limit,
          offset,
          clean: true,
          fields: fields === undefined || fields.length === 0 ? undefined : fields
        },
        signalOf(run)
      );
      return {
        ok: true,
        dataset_id: datasetId,
        ...summarizeDataset({
          items: page.items,
          total: page.total,
          offset: page.offset,
          datasetId
        })
      };
    })
};

// ---------------------------------------------------------------------------
// get_apify_key_value_record
// ---------------------------------------------------------------------------

const getApifyRecord: CapabilityExport = {
  spec: getApifyRecordSpec,
  impl: (run, params) =>
    guarded(async () => {
      const client = await clientFor(run.context);
      const storeId = requireString(params, "store_id");
      const key = isString(params.key) ? params.key : "OUTPUT";

      const record = await client.getKeyValueRecord(
        storeId,
        key,
        signalOf(run)
      );
      if (record === null) {
        return {
          ok: true,
          store_id: storeId,
          key,
          found: false,
          note: `The store has no record under "${key}".`
        };
      }

      // Binary becomes an asset; text and JSON are already the answer, and
      // storing a copy of them would just be a second handle on one string.
      if (isBinaryContentType(record.contentType)) {
        const imported = await importActorBytes(
          run.context,
          record.bytes,
          record.contentType,
          { label: `${storeId}/${key}` }
        );
        return { ok: true, store_id: storeId, key, found: true, ...imported };
      }

      const text = new TextDecoder().decode(record.bytes);
      return {
        ok: true,
        store_id: storeId,
        key,
        found: true,
        content_type: record.contentType,
        content: text
      };
    })
};

export const APIFY_CAPABILITIES: readonly CapabilityExport[] = [
  searchApifyActors,
  getApifyActor,
  getApifyActorSchema,
  runApifyActor,
  getApifyRun,
  abortApifyRun,
  getApifyDatasetItems,
  getApifyRecord
];

export const module: CapabilityModule = {
  module: "apify",
  exports: APIFY_CAPABILITIES
};
