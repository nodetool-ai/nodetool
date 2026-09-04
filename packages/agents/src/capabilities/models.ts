/**
 * The `models` capability module — model discovery over the configured
 * providers.
 *
 * Three capabilities that used to be three `Tool` subclasses, one per file.
 * Wire names, descriptions and schemas are unchanged: a belt builds them
 * from `models.specs.ts` by name.
 *
 * The providers map was a constructor argument and is now `run.providers`. It
 * is read at call time, so a host that fills the map lazily — the MCP mount
 * does — still serves the models it resolved after construction.
 *
 * `find_model` is where an agent's default model choice is made: with no hint
 * from the caller it answers with the model that tops the quality leaderboard
 * for the task (see {@link SCORE_TIERS}), so an agent that just asks for a
 * capability gets the best model for the job rather than the first one a
 * provider happens to list.
 *
 * Design: docs/tool-class-retirement-design.md § Migration.
 */

import type {
  BaseProvider,
  JsonSchema,
  ProviderCapability,
  RecommendedUnifiedModel
} from "@nodetool-ai/runtime";
import { RECOMMENDED_MODELS } from "@nodetool-ai/runtime";
import {
  getModelRank,
  modelRankings,
  routesFor
} from "@nodetool-ai/model-pricing/model-rankings";
import type {
  ModelRankingsArtifact,
  RankedModelEntry,
  TaskRank
} from "@nodetool-ai/model-pricing/model-rankings";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  findModelSpec,
  listModelsSpec,
  listProviderModelsSpec,
  SUPPORTED_CAPABILITIES,
  FIND_MODEL_INPUT_SCHEMA,
  MODEL_TYPES,
  LIST_MODELS_SCHEMA
} from "./models.specs.js";
import {
  isFunction,
  isNonBlankString,
  isNumber,
  isString
} from "../utils/type-guards.js";
import { promptingSkillFor } from "../model-prompting-skills.js";

export {
  SUPPORTED_CAPABILITIES,
  FIND_MODEL_INPUT_SCHEMA,
  MODEL_TYPES,
  LIST_MODELS_SCHEMA
} from "./models.specs.js";

/** Providers this run can reach. Empty when the host wired none. */
function providersOf(run: CapabilityRun): Record<string, BaseProvider> {
  return run.providers ?? {};
}

type SupportedCapability = (typeof SUPPORTED_CAPABILITIES)[number];

/**
 * A provider is treated as offering downloaded models when it runs locally.
 * Neither `find_model` nor `list_models` inspects the on-disk cache, so both
 * report the same `downloaded` for the same model.
 *
 * `huggingface` is not one of them: it is the HF Inference API, a remote call
 * like any other. Counting it as local gave every HF model the `downloaded`
 * bonus and put `FLUX.1-schnell` ahead of the fal_ai copy that could actually
 * run, on a host with no `@huggingface/inference` installed.
 */
const LOCAL_PROVIDER_IDS = new Set([
  "ollama",
  "lmstudio",
  "vllm",
  "llama_cpp",
  "node_llama_cpp"
]);

/**
 * Why a configured provider still cannot serve a call, or `null` when it can.
 * A provider that answers with a reason is dropped from the ranking and named
 * in the result's note — ranking a model nothing can run turns a discovery
 * call into a failed generation call.
 */
async function unavailableReasonOf(
  provider: BaseProvider
): Promise<string | null> {
  // Guarded rather than called outright: a provider from an older build has no
  // such method, and hiding every provider over that would be a far worse
  // failure than the one this prevents.
  if (!isFunction(provider.unavailableReason)) return null;
  try {
    return await provider.unavailableReason();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

interface AnyModel {
  id: string;
  name: string;
  provider: string;
  supportedTasks?: string[];
}

interface FindModelResult extends CandidateRankingFields {
  provider: string;
  model_id: string;
  /**
   * The same id as `model_id`. Both are here because the ref nested in every
   * result calls it `id`, and a caller reading the rows next to the refs
   * reaches for `id` — a live session printed a whole catalog as
   * `fal_ai/undefined` twice and concluded the install had no models.
   */
  id: string;
  name: string;
  downloaded: boolean;
  recommended: boolean;
  score: number;
  /** Ready to assign to a node's model property — see {@link modelRef}. */
  ref: ModelRef;
  /**
   * The system skill covering this model line's prompting, when one ships.
   * Read it with `load_skill` before writing the prompt: the lines that have
   * one each want a differently shaped prompt, and the default shape gets the
   * blandest reading every one of them has.
   */
  prompting_skill?: string;
}

interface ModelRef {
  type: string;
  provider: string;
  id: string;
  name: string;
}

/**
 * The typed-ref property shape a model-typed node property takes. A pick
 * result's flat fields (`model_id`) do not round-trip into a property — a
 * live session lost three rounds to exactly that — so every result carries
 * the assignable form too.
 */
const CAPABILITY_REF_TYPE = {
  generate_message: "language_model",
  text_to_image: "image_model",
  image_to_image: "image_model",
  segment_image: "image_model",
  text_to_video: "video_model",
  image_to_video: "video_model",
  text_to_speech: "tts_model",
  // A music-typed node property takes a `music_model`, never a `tts_model`.
  // Handing back the wrong tag made every music ref unassignable: the property
  // refused it, and the graph validator then checked the id against the TTS
  // catalog and reported a real music model as one the provider does not offer.
  text_to_music: "music_model",
  automatic_speech_recognition: "asr_model",
  generate_embedding: "embedding_model"
} satisfies Record<SupportedCapability, string>;

function modelRef(
  capability: SupportedCapability,
  provider: string,
  id: string,
  name: string
): ModelRef {
  return { type: CAPABILITY_REF_TYPE[capability], provider, id, name };
}

function getRecommendedSet(capability: SupportedCapability): Set<string> {
  const wantedTasks = capabilityToRecommendedTasks(capability);
  const wantedModalities = capabilityToRecommendedModalities(capability);
  const ids = new Set<string>();
  for (const m of RECOMMENDED_MODELS) {
    const taskMatch = !wantedTasks || (m.task && wantedTasks.has(m.task));
    const modalityMatch = wantedModalities.has(m.modality);
    if (modalityMatch && taskMatch && m.provider) {
      ids.add(`${m.provider}::${m.id}`);
    }
  }
  return ids;
}

function capabilityToRecommendedTasks(
  capability: SupportedCapability
): Set<string> | null {
  switch (capability) {
    case "text_to_image":
      return new Set(["text_to_image"]);
    case "image_to_image":
      return new Set(["image_to_image"]);
    case "segment_image":
      // No recommended entry is a segmentation model, so nothing is boosted.
      return new Set(["segment"]);
    case "text_to_video":
      return new Set(["text_to_video"]);
    case "image_to_video":
      return new Set(["image_to_video"]);
    case "generate_embedding":
      return new Set(["embedding"]);
    case "generate_message":
      return new Set(["text_generation"]);
    default:
      // tts/asr have no `task` set on recommended entries — fall back to
      // modality-only filtering.
      return null;
  }
}

function capabilityToRecommendedModalities(
  capability: SupportedCapability
): Set<RecommendedUnifiedModel["modality"]> {
  switch (capability) {
    case "text_to_image":
    case "image_to_image":
    case "segment_image":
      return new Set(["image"]);
    case "text_to_video":
    case "image_to_video":
      return new Set(["video"]);
    case "text_to_speech":
      return new Set(["tts"]);
    case "text_to_music":
      return new Set(["music"]);
    case "automatic_speech_recognition":
      return new Set(["asr"]);
    case "generate_embedding":
    case "generate_message":
      return new Set(["language"]);
  }
}

async function fetchModelsForCapability(
  provider: BaseProvider,
  capability: SupportedCapability
): Promise<AnyModel[]> {
  switch (capability) {
    case "text_to_image":
    case "image_to_image":
    case "segment_image":
      return await provider.getAvailableImageModels();
    case "text_to_video":
    case "image_to_video":
      return await provider.getAvailableVideoModels();
    case "text_to_speech":
      return await provider.getAvailableTTSModels();
    case "text_to_music":
      return await provider.getAvailableMusicModels();
    case "automatic_speech_recognition":
      return await provider.getAvailableASRModels();
    case "generate_embedding":
      return await provider.getAvailableEmbeddingModels();
    case "generate_message":
      return await provider.getAvailableLanguageModels();
  }
}

/**
 * The task a capability asks a model to perform, where one model list serves
 * two directions. `getAvailableVideoModels` answers with every video endpoint
 * the provider has — text-to-video, image-to-video, lip-sync, upscalers — so
 * without this a `text_to_video` search ranked `.../image-to-video` first and
 * the generation call that followed failed with a 422 from the provider. The
 * same holds for image models (`text_to_image` vs `image_to_image`).
 *
 * It is also the task the leaderboard is read for when the caller names none.
 * Without that, `pickTaskRank` was free to score a candidate on its *best*
 * task: a `text_to_music` search ranked ElevenLabs' dialogue model first on
 * its `text_to_speech` standing, in a leaderboard that has no music task at
 * all.
 *
 * Capabilities whose ranking is meaningless either way (asr, embeddings,
 * language — none of them ranked) map to `null` and filter nothing.
 */
function capabilityTask(capability: SupportedCapability): string | null {
  switch (capability) {
    // The image catalog tags a segmentation endpoint `segment`, which is what
    // keeps a FLUX from being offered as the answer to "segment this".
    case "segment_image":
      return "segment";
    case "text_to_image":
    case "image_to_image":
    case "text_to_video":
    case "image_to_video":
    case "text_to_speech":
    case "text_to_music":
      return capability;
    default:
      return null;
  }
}

/**
 * Models that declare they can do this capability's task. A model that
 * declares no tasks at all is kept — the alternative is hiding every model
 * from a provider whose manifest carries no task information.
 */
function forCapabilityTask<T extends { model: AnyModel }>(
  candidates: T[],
  capability: SupportedCapability
): { kept: T[]; dropped: number } {
  const task = capabilityTask(capability);
  if (!task) return { kept: candidates, dropped: 0 };
  const kept = candidates.filter(({ model }) => taskMatch(model, task));
  return { kept, dropped: candidates.length - kept.length };
}

function taskMatch(model: AnyModel, task: string | undefined): boolean {
  if (!task) return true;
  if (!model.supportedTasks || model.supportedTasks.length === 0) return true;
  return model.supportedTasks.includes(task);
}

/**
 * Lowercase, with every separator collapsed to a single space, so a query
 * word matches across the punctuation a model id happens to use:
 * `black-forest-labs/FLUX.1-schnell` → `black forest labs flux 1 schnell`.
 */
function searchable(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function queryWords(query: string): string[] {
  const words = searchable(query).split(" ").filter(Boolean);
  return words;
}

/** Every word of the query appears somewhere in the model's id or name. */
function queryMatch(model: AnyModel, words: string[]): boolean {
  if (words.length === 0) return true;
  const haystack = ` ${searchable(`${model.id} ${model.name}`)} `;
  return words.every((w) => haystack.includes(w));
}

function hintMatch(model: AnyModel, hints: Set<string>): boolean {
  if (hints.size === 0) return false;
  const id = searchable(model.id);
  for (const hint of hints) {
    const h = searchable(hint);
    if (h && (id === h || id.includes(h))) return true;
  }
  return false;
}

/**
 * The score ladder. Each tier outranks the sum of every tier below it, so the
 * order between two candidates is a decision rather than an arithmetic
 * accident:
 *
 * | tier | addend | when |
 * |---|---:|---|
 * | model hint | 2000 | the caller named this model |
 * | provider hint | 1000 | the caller named this provider |
 * | prefer_local | 500 | the caller asked for local and this runs locally |
 * | leaderboard | 200 + 0…80 | the artifact ranks this model for the task |
 * | recommended | 100 | `RECOMMENDED_MODELS` pins it and nothing ranks it |
 * | downloaded | 30 | a local provider serves it |
 *
 * What the ladder decides: with no hint from the caller, the default pick is
 * the model that tops the leaderboard for the task — `find_model`, and so
 * `nodetool.models.pick`, answer with the best model for the job rather than
 * with whichever one the static `RECOMMENDED_MODELS` list happens to pin.
 * The pinned list still orders what the artifact says nothing about: language,
 * embedding and ASR models, local models, and any model the rankings have
 * never heard of.
 *
 * A caller's own preference still wins: naming a provider or a model, or
 * asking for local, outranks any leaderboard position. Rankings order the
 * field; they never overrule the caller.
 */
export const SCORE_TIERS = {
  modelHint: 2000,
  providerHint: 1000,
  preferLocal: 500,
  ranked: 200,
  recommended: 100,
  downloaded: 30,
  /** Nudge against a hosted model when the caller asked for local. */
  remote: -5
} as const;

/** The most a leaderboard *position* adds, on top of {@link SCORE_TIERS}.ranked. */
export const RANK_BONUS_MAX = 80;

/**
 * Capabilities the rankings artifact covers. Language, embedding and ASR
 * models are unranked by design (§1 of the design doc), so a candidate of one
 * of those kinds gets no best-task fallback — only an exact task match, which
 * cannot happen for them either.
 */
const RANKED_CAPABILITIES: ReadonlySet<SupportedCapability> = new Set<
  SupportedCapability
>([
  "text_to_image",
  "image_to_image",
  "text_to_video",
  "image_to_video",
  "text_to_speech",
  "text_to_music"
]);

/** One alternate provider route to the same canonical model. */
interface RouteRef {
  provider: string;
  model_id: string;
}

/**
 * What the rankings artifact adds to a candidate. Every field is omitted when
 * the artifact says nothing, so an unranked model's result is the same shape
 * `find_model` returned before rankings existed.
 */
export interface CandidateRankingFields {
  /** GenSpend's `model_slug` — the id grouping this route with its siblings. */
  canonical?: string;
  /** The task whose leaderboard `rank`/`of` refer to. */
  ranked_task?: string;
  rank?: number;
  of?: number;
  /** Other providers serving the same canonical model. */
  alternate_routes?: RouteRef[];
}

/** A candidate's ranking: the score addend and the fields to attach. */
export interface CandidateRanking {
  bonus: number;
  fields: CandidateRankingFields;
}

/**
 * The leaderboard row to report for a candidate: the requested task's, or —
 * when the caller named no task and the capability is one rankings cover —
 * the model's best normalized standing across the tasks it is ranked for.
 */
export function pickTaskRank(
  entry: RankedModelEntry,
  task: string | undefined,
  allowBestTask: boolean
): { task: string; rank: TaskRank } | null {
  if (task) {
    const exact = entry.tasks?.[task];
    return exact ? { task, rank: exact } : null;
  }
  if (!allowBestTask) return null;
  let best: { task: string; rank: TaskRank } | null = null;
  for (const [name, rank] of Object.entries(entry.tasks ?? {})) {
    if (!best || rank.normalized > best.rank.normalized) {
      best = { task: name, rank };
    }
  }
  return best;
}

/**
 * Score addend and answer fields for one candidate route. Pure in the
 * artifact so tests drive it with a fixture instead of mocking the module.
 */
export function rankCandidate(
  provider: string,
  modelId: string,
  task: string | undefined,
  allowBestTask: boolean,
  artifact: ModelRankingsArtifact = modelRankings
): CandidateRanking {
  const entry = getModelRank(provider, modelId, artifact);
  if (!entry) return { bonus: 0, fields: {} };

  const fields: CandidateRankingFields = {};
  if (entry.canonical) {
    fields.canonical = entry.canonical;
    const alternates = routesFor(entry.canonical, artifact)
      .filter((r) => r.provider !== provider || r.modelId !== modelId)
      .map((r): RouteRef => ({ provider: r.provider, model_id: r.modelId }));
    if (alternates.length > 0) fields.alternate_routes = alternates;
  }

  const picked = pickTaskRank(entry, task, allowBestTask);
  if (!picked) return { bonus: 0, fields };

  fields.ranked_task = picked.task;
  fields.rank = picked.rank.rank;
  fields.of = picked.rank.of;
  return {
    bonus: Math.round(picked.rank.normalized * RANK_BONUS_MAX),
    fields
  };
}

/** Everything the ranking of one candidate depends on. */
export interface CandidateScoreInput {
  providerId: string;
  model: AnyModel;
  /** Whether the model is in `RECOMMENDED_MODELS` for this capability. */
  recommended: boolean;
  /** The requested task, or undefined when the caller named none. */
  task?: string;
  providerHint?: string;
  modelHints: Set<string>;
  preferLocal: boolean;
  /** Whether rankings cover this capability — see {@link RANKED_CAPABILITIES}. */
  rankedCapability: boolean;
}

/**
 * One candidate's score and the ranking fields to attach to it. Additive and
 * pure in the artifact, so the ordering between an explicit hint and a
 * leaderboard position is pinned by a unit test with a fixture rather than by
 * reading the constants.
 */
export function scoreCandidate(
  input: CandidateScoreInput,
  artifact: ModelRankingsArtifact = modelRankings
): { score: number; downloaded: boolean; fields: CandidateRankingFields } {
  const { providerId, model } = input;
  const downloaded = LOCAL_PROVIDER_IDS.has(providerId);

  const ranking = rankCandidate(
    providerId,
    model.id,
    input.task,
    input.rankedCapability,
    artifact
  );
  const ranked = ranking.fields.rank !== undefined;

  let score = 0;
  if (downloaded) score += SCORE_TIERS.downloaded;
  if (input.providerHint && providerId === input.providerHint) {
    score += SCORE_TIERS.providerHint;
  }
  if (hintMatch(model, input.modelHints)) score += SCORE_TIERS.modelHint;
  if (input.preferLocal) {
    score += downloaded ? SCORE_TIERS.preferLocal : SCORE_TIERS.remote;
  }

  if (ranked) {
    // The leaderboard decides among the models it covers, so a candidate it
    // ranks does not also take the recommended bonus: +100 on top of a 0…80
    // span would let the static list reorder the leaderboard, which is the
    // blindness this term exists to fix.
    score += SCORE_TIERS.ranked + ranking.bonus;
  } else if (input.recommended) {
    score += SCORE_TIERS.recommended;
  }

  return { score, downloaded, fields: ranking.fields };
}

const findModel: CapabilityExport = {
  spec: findModelSpec,
  impl: async (run, params) => {
    const capability = params["capability"] as SupportedCapability | undefined;
    if (!capability || !SUPPORTED_CAPABILITIES.includes(capability)) {
      return {
        capability,
        total: 0,
        results: [],
        error: `capability must be one of: ${SUPPORTED_CAPABILITIES.join(", ")}`
      };
    }

    const task =
      isString(params["task"])
        ? params["task"]
        : undefined;
    const query =
      isString(params["query"])
        ? params["query"]
        : undefined;
    const providerHint =
      isString(params["provider_hint"])
        ? params["provider_hint"]
        : undefined;
    const modelHintRaw = params["model_hint"];
    const modelHints: Set<string> = new Set(
      isString(modelHintRaw)
        ? [modelHintRaw]
        : Array.isArray(modelHintRaw)
          ? modelHintRaw.filter((x) => isString(x))
          : []
    );
    const preferLocal = params["prefer_local"] === true;
    const limit =
      isNumber(params["limit"]) && params["limit"] > 0
        ? Math.floor(params["limit"])
        : 5;

    const providerEntries = Object.entries(providersOf(run));
    if (providerEntries.length === 0) {
      return {
        capability,
        total: 0,
        results: [],
        note: "No providers configured. Use nodetool.agents.Agent without a model property for AI work."
      };
    }

    const recommendedSet = getRecommendedSet(capability);
    const candidates: Array<{ providerId: string; model: AnyModel }> = [];
    const unavailable: string[] = [];

    for (const [providerId, instance] of providerEntries) {
      let supports: boolean;
      try {
        supports = instance
          .getCapabilities()
          .includes(capability);
      } catch {
        continue;
      }
      if (!supports) continue;

      const blocked = await unavailableReasonOf(instance);
      if (blocked) {
        unavailable.push(`${providerId} (${blocked})`);
        continue;
      }

      let models: AnyModel[];
      try {
        models = await fetchModelsForCapability(instance, capability);
      } catch {
        continue;
      }

      for (const m of models) {
        candidates.push({ providerId, model: m });
      }
    }

    // Drop the models that cannot do what the capability asks before anything
    // ranks or filters them: an `image_to_video` endpoint is not an answer to
    // a `text_to_video` search, however well its name matches the query.
    const forTask = forCapabilityTask(candidates, capability);
    const capabilityCandidates = forTask.kept;

    const notes: string[] = [];
    if (unavailable.length > 0) {
      notes.push(
        `Skipped providers that cannot run here: ${unavailable.join(", ")}.`
      );
    }
    if (forTask.dropped > 0 && capabilityCandidates.length === 0) {
      notes.push(
        `${forTask.dropped} model(s) were found but none declares ${capability}.`
      );
    }
    let words = queryWords(query ?? "");

    // The `task` filter reads `supportedTasks`. A caller who typed a model name
    // into it used to get an empty list — or, when no model declares tasks at
    // all, the unfiltered default ranking — and no way to tell why. A task no
    // model declares is read as a name search instead.
    const declaredTasks = new Set<string>();
    for (const { model } of capabilityCandidates) {
      for (const t of model.supportedTasks ?? []) declaredTasks.add(t);
    }
    let pool: typeof capabilityCandidates;
    // The task the rank term reads: the caller's, else the one the capability
    // itself asks for. A `task` no model declares was a name search all along,
    // so it falls back to the capability's task rather than to no task — which
    // would let the leaderboard score a candidate on an unrelated task.
    const defaultRankTask = capabilityTask(capability) ?? undefined;
    let rankTask = task ?? defaultRankTask;
    if (task && !declaredTasks.has(task)) {
      pool = capabilityCandidates;
      rankTask = defaultRankTask;
      words = [...words, ...queryWords(task)];
      notes.push(
        `No model declares task '${task}'; searched model names for it instead. Use \`query\` to search by name.`
      );
    } else {
      pool = capabilityCandidates.filter(({ model }) => taskMatch(model, task));
    }

    let queryMatched: boolean | undefined;
    if (words.length > 0) {
      const matched = pool.filter(({ model }) => queryMatch(model, words));
      queryMatched = matched.length > 0;
      if (matched.length > 0) {
        pool = matched;
      } else {
        notes.push(
          `No model name matched '${words.join(" ")}'. Showing the ranked models for ${capability} instead.`
        );
      }
    }

    const collected: FindModelResult[] = pool.map(({ providerId, model }) => {
      const recommended = recommendedSet.has(`${providerId}::${model.id}`);
      const { score, downloaded, fields } = scoreCandidate({
        providerId,
        model,
        recommended,
        task: rankTask,
        providerHint,
        modelHints,
        preferLocal,
        rankedCapability: RANKED_CAPABILITIES.has(capability)
      });

      const result: FindModelResult = {
        provider: providerId,
        model_id: model.id,
        id: model.id,
        name: model.name,
        downloaded,
        recommended,
        score,
        ref: modelRef(capability, providerId, model.id, model.name),
        ...fields
      };
      // Absent, not null, when no shipped guide covers the line: a row that
      // carries the key at all reads as "there is a guide" to a model
      // skimming the answer.
      const promptingSkill = promptingSkillFor(model.id);
      if (promptingSkill) result.prompting_skill = promptingSkill;
      return result;
    });

    collected.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.provider !== b.provider)
        return a.provider.localeCompare(b.provider);
      return a.model_id.localeCompare(b.model_id);
    });

    const results = bestRoutePerModel(collected).slice(0, limit);
    const answer: FindModelAnswer = {
      capability,
      total: collected.length,
      results
    };
    const best = results[0];
    if (best !== undefined) {
      answer.ref = best.ref;
      // Lifted for the same reason `ref` is: callers read the top level and
      // never dig into `results[0]`, and a prompting guide nobody notices is
      // a guide nobody reads.
      if (best.prompting_skill) answer.prompting_skill = best.prompting_skill;
    }
    if (queryMatched !== undefined) answer.query_matched = queryMatched;
    if (notes.length > 0) answer.note = notes.join(" ");
    return answer;
  }
};

/**
 * One row per canonical model: its best-scoring route, in the order the sort
 * left them. Without this a top-5 for `text_to_image` is five routes to the
 * same leaderboard leader (atlascloud's two endpoints, kie's, openai's) and
 * the caller sees one model. The routes that drop out are not lost — each
 * survivor names them in `alternate_routes`.
 *
 * A candidate the artifact does not group carries no `canonical` and is never
 * collapsed: two unranked models are two models.
 */
function bestRoutePerModel(results: FindModelResult[]): FindModelResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (!result.canonical) return true;
    if (seen.has(result.canonical)) return false;
    seen.add(result.canonical);
    return true;
  });
}

/** One ranked candidate `find_model` returns. */
interface RankedModel extends CandidateRankingFields {
  provider: string;
  model_id: string;
  /** Alias of `model_id` — see {@link FindModelResult.id}. */
  id: string;
  name: string;
  downloaded: boolean;
  recommended: boolean;
  score: number;
  ref: ReturnType<typeof modelRef>;
  /** See {@link FindModelResult.prompting_skill}. */
  prompting_skill?: string;
}

/** `find_model`'s answer; each note appears only when there is one. */
interface FindModelAnswer {
  capability: string;
  total: number;
  /**
   * The top result's `ref`, lifted to the top level.
   *
   * Every caller wants one model, and the shape that used to make them dig for
   * it — `results[0].ref` — reads as `results` and `ref` being alternatives.
   * Agents wrote `find_model(...).ref`, got `undefined`, and assigned it to a
   * node's model property: `undefined` is not an error, so the mistake
   * surfaced much later as "Property model requires a language_model to be
   * selected" on a graph whose model line looked right. Answering `ref`
   * directly makes the obvious read the correct one.
   *
   * Absent only when nothing matched.
   */
  ref?: ReturnType<typeof modelRef>;
  /** The top result's `prompting_skill`, lifted the same way `ref` is. */
  prompting_skill?: string;
  results: RankedModel[];
  query_matched?: boolean;
  note?: string;
}

/** `list_models`' answer; the note names providers that could not be reached. */
interface ListModelsAnswer {
  total: number;
  truncated: boolean;
  results: ListedModel[];
  note?: string;
}

type ModelType = (typeof MODEL_TYPES)[number];

/** Names an agent is likely to guess, mapped onto the canonical type. */
const MODEL_TYPE_ALIASES: Record<string, ModelType> = {
  llm: "language",
  text: "language",
  language_model: "language",
  text_generation: "language",
  image_model: "image",
  video_model: "video",
  // The capability names `find_model` takes — a caller who knows one surface
  // should not have to learn the other's vocabulary to browse.
  generate_message: "language",
  text_to_image: "image",
  image_to_image: "image",
  text_to_video: "video",
  image_to_video: "video",
  text_to_music: "music",
  generate_embedding: "embedding",
  speech: "tts",
  text_to_speech: "tts",
  audio: "tts",
  transcription: "asr",
  automatic_speech_recognition: "asr",
  embeddings: "embedding"
};

interface ListedModelSource {
  id: string;
  name?: string;
  provider?: string;
}

interface ListedModel {
  provider: string;
  model_id: string;
  /** Alias of `model_id` — see {@link FindModelResult.id}. */
  id: string;
  name: string;
  type: ModelType;
  downloaded: boolean;
}

/** The capability a provider must report before we ask it for this type. */
const TYPE_CAPABILITY = {
  language: "generate_message",
  image: "text_to_image",
  video: "text_to_video",
  tts: "text_to_speech",
  music: "text_to_music",
  asr: "automatic_speech_recognition",
  embedding: "generate_embedding"
} satisfies Record<ModelType, ProviderCapability>;

async function fetchModelsOfType(
  provider: BaseProvider,
  type: ModelType
): Promise<ListedModelSource[]> {
  switch (type) {
    case "language":
      return await provider.getAvailableLanguageModels();
    case "image":
      return await provider.getAvailableImageModels();
    case "video":
      return await provider.getAvailableVideoModels();
    case "tts":
      return await provider.getAvailableTTSModels();
    case "music":
      return await provider.getAvailableMusicModels();
    case "asr":
      return await provider.getAvailableASRModels();
    case "embedding":
      return await provider.getAvailableEmbeddingModels();
  }
}

function normalizeModelType(raw: unknown): ModelType | null | "invalid" {
  if (raw === undefined || raw === null || raw === "") return null;
  if (!isString(raw)) return "invalid";
  const key = raw.trim().toLowerCase();
  if ((MODEL_TYPES as readonly string[]).includes(key)) return key as ModelType;
  return MODEL_TYPE_ALIASES[key] ?? "invalid";
}

const listModels: CapabilityExport = {
  spec: listModelsSpec,
  impl: async (run, params) => {
    const providers = providersOf(run);
    const modelType = normalizeModelType(params["model_type"]);
    if (modelType === "invalid") {
      return {
        total: 0,
        results: [],
        error: `model_type must be one of: ${MODEL_TYPES.join(", ")}`
      };
    }

    const providerFilterRaw = params["provider"];
    const providerFilter =
      isNonBlankString(providerFilterRaw) &&
      providerFilterRaw.trim().toLowerCase() !== "all"
        ? providerFilterRaw.trim()
        : undefined;
    const downloadedOnly = params["downloaded_only"] === true;
    const limit =
      isNumber(params["limit"]) && params["limit"] > 0
        ? Math.floor(params["limit"])
        : 50;

    const entries = Object.entries(providers).filter(
      ([id]) => !providerFilter || id === providerFilter
    );

    if (entries.length === 0) {
      const configured = Object.keys(providers).sort();
      return {
        total: 0,
        results: [],
        note: providerFilter
          ? `Provider '${providerFilter}' is not configured. Configured providers: ${
              configured.length > 0 ? configured.join(", ") : "none"
            }.`
          : "No providers are configured. Add an API key in Settings → Models & Providers."
      };
    }

    const wantedTypes = modelType ? [modelType] : [...MODEL_TYPES];
    const collected: ListedModel[] = [];
    const unavailable: string[] = [];

    for (const [providerId, instance] of entries) {
      const downloaded = LOCAL_PROVIDER_IDS.has(providerId);
      if (downloadedOnly && !downloaded) continue;

      let capabilities: ProviderCapability[];
      try {
        capabilities = instance.getCapabilities();
      } catch {
        continue;
      }

      const blocked = await unavailableReasonOf(instance);
      if (blocked) {
        unavailable.push(`${providerId} (${blocked})`);
        continue;
      }

      for (const type of wantedTypes) {
        if (!capabilities.includes(TYPE_CAPABILITY[type])) continue;

        let models: ListedModelSource[];
        try {
          models = await fetchModelsOfType(instance, type);
        } catch {
          // A provider that can't be reached (no key, server down) drops out
          // of the listing rather than failing the whole call.
          continue;
        }

        for (const model of models) {
          if (!model?.id) continue;
          collected.push({
            provider: providerId,
            model_id: model.id,
            id: model.id,
            name: model.name ?? model.id,
            type,
            downloaded
          });
        }
      }
    }

    collected.sort((a, b) => {
      if (a.provider !== b.provider)
        return a.provider.localeCompare(b.provider);
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.model_id.localeCompare(b.model_id);
    });

    const answer: ListModelsAnswer = {
      total: collected.length,
      truncated: collected.length > limit,
      results: collected.slice(0, limit)
    };
    if (unavailable.length > 0) {
      answer.note = `Skipped providers that cannot run here: ${unavailable.join(", ")}.`;
    }
    return answer;
  }
};

// ---------------------------------------------------------------------------
// list_provider_models
// ---------------------------------------------------------------------------

const listProviderModels: CapabilityExport = {
  spec: listProviderModelsSpec,
  impl: async (run, params) => {
    const providerId = params["provider"];
    if (!isString(providerId)) {
      return { success: false, error: "provider must be a string" };
    }

    const provider = providersOf(run)[providerId];
    if (!provider) {
      return { success: false, error: `Unknown provider: ${providerId}` };
    }

    if (!isFunction(provider.getAvailableLanguageModels)) {
      return {
        success: false,
        error: `Provider ${providerId} does not support model listing`
      };
    }

    try {
      const models = await provider.getAvailableLanguageModels();
      return { success: true, provider: providerId, models };
    } catch (e) {
      return {
        success: false,
        error: `Failed to list models: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }
};

/** Every model capability, in the order `getAllMcpTools` offered them. */
export const MODEL_CAPABILITIES: readonly CapabilityExport[] = [
  findModel,
  listModels,
  listProviderModels
];

export const module: CapabilityModule = {
  module: "models",
  exports: MODEL_CAPABILITIES
};

export { findModel, listModels, listProviderModels };
