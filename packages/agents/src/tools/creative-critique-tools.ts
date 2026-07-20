/**
 * Creative critique tools — the judging half of a generate → look → critique →
 * revise loop, built entirely on VLM chat calls (`generate_message` capability).
 * No dedicated scorer models: the same vision-capable chat models the agent
 * already uses do the judging, shaped around what VLMs are measurably good at:
 *
 * - `compare_images` uses pairwise comparison, never absolute scores. VLM
 *   judges agree with humans far more when picking between two images than
 *   when scoring one, and verdicts flip with presentation order — so every
 *   match runs twice with the order swapped, and a tiebreak call settles
 *   disagreements.
 * - `critique_image` asks for *directional* defects (what's wrong, where, and
 *   the concrete fix) rather than a score. It explicitly forbids "add more
 *   detail" advice — iteration loops driven by vague critique polish details
 *   while freezing a bad composition.
 * - `score_image_adherence` decomposes the brief into binary yes/no checks and
 *   has the VLM answer each one — an explainable adherence score, instead of
 *   one opaque number a judge can't calibrate.
 *
 * The taste half: `record_style_preference` / `get_style_profile` persist the
 * user's aesthetic preferences through {@link LongTermMemory} so briefs and
 * judge rubrics can carry a durable style profile across sessions.
 *
 * All judging tools take `provider` + `model` params (pair with `find_model`,
 * capability `generate_message` on a vision-capable model) and run through
 * `ProcessingContext.runProviderPrediction`, so asset:// image URIs resolve
 * exactly like they do everywhere else.
 */

import type { Message, MessageContent } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "./base-tool.js";
import { extractJSON } from "../utils/json-parser.js";
import { LongTermMemory } from "../long-term-memory.js";
import { getLongTermMemory } from "./ltm-tools.js";

const MAX_COMPARE_IMAGES = 8;
const MAX_ADHERENCE_QUESTIONS = 12;
const JUDGE_MAX_TOKENS = 1500;

interface ModelArgs {
  provider: string;
  model: string;
}

function parseModelArgs(
  params: Record<string, unknown>
): ModelArgs | { error: string } {
  const provider = params["provider"];
  const model = params["model"];
  if (typeof provider !== "string" || !provider) {
    return {
      error:
        "provider must be a non-empty string (use find_model with a vision-capable chat model)"
    };
  }
  if (typeof model !== "string" || !model) {
    return {
      error:
        "model must be a non-empty string (use find_model with a vision-capable chat model)"
    };
  }
  return { provider, model };
}

/** Normalize an image source so the context media resolver can inline it. */
function normalizeImageSource(source: string): string {
  const trimmed = source.trim();
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("asset://") ||
    /^https?:\/\//i.test(trimmed)
  ) {
    return trimmed;
  }
  // Bare asset ids (what list_images and generate_image return) become
  // asset:// URIs, which resolveMessageMediaUris inlines as data URIs.
  return `asset://${trimmed}`;
}

function imagePart(source: string): MessageContent {
  return {
    type: "image_url",
    image: { type: "image", uri: normalizeImageSource(source) }
  };
}

function textPart(text: string): MessageContent {
  return { type: "text", text };
}

/** Pull the text out of a provider response message. */
function messageText(message: Message): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === "text" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

async function judgeCall(
  context: ProcessingContext,
  m: ModelArgs,
  content: MessageContent[]
): Promise<string> {
  const result = (await context.runProviderPrediction({
    provider: m.provider,
    capability: "generate_message",
    model: m.model,
    params: {
      messages: [{ role: "user", content }] satisfies Message[],
      max_tokens: JUDGE_MAX_TOKENS,
      temperature: 0
    }
  })) as Message;
  return messageText(result);
}

function tasteBlock(params: Record<string, unknown>): string {
  const profile = params["taste_profile"];
  if (typeof profile !== "string" || !profile.trim()) return "";
  return `\n\nThe user's known aesthetic preferences (weigh these alongside the brief):\n${profile.trim()}`;
}

// ---------------------------------------------------------------------------
// critique_image
// ---------------------------------------------------------------------------

interface CritiqueDefect {
  defect: string;
  location: string;
  fix: string;
}

interface CritiqueResult {
  verdict: "pass" | "revise";
  defects: CritiqueDefect[];
  strengths: string[];
}

function parseCritique(text: string): CritiqueResult | null {
  const parsed = extractJSON(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  const verdict = obj["verdict"] === "pass" ? "pass" : "revise";
  const defects: CritiqueDefect[] = Array.isArray(obj["defects"])
    ? (obj["defects"] as unknown[])
        .filter((d): d is Record<string, unknown> =>
          Boolean(d && typeof d === "object")
        )
        .map((d) => ({
          defect: String(d["defect"] ?? ""),
          location: String(d["location"] ?? ""),
          fix: String(d["fix"] ?? "")
        }))
        .filter((d) => d.defect)
    : [];
  const strengths: string[] = Array.isArray(obj["strengths"])
    ? (obj["strengths"] as unknown[]).map(String).filter(Boolean)
    : [];
  return { verdict, defects, strengths };
}

export class CritiqueImageTool extends Tool {
  readonly name = "critique_image";
  readonly description =
    "Have a vision model critique a generated image against the brief and " +
    "return directional feedback: concrete defects with locations and fixes, " +
    "plus a pass/revise verdict. Use the fixes to revise the prompt and " +
    "regenerate; if the critique names no specific defect, prefer generating " +
    "fresh variations over further iteration.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      provider: {
        type: "string" as const,
        description: "Provider id of a vision-capable chat model (find_model)."
      },
      model: { type: "string" as const, description: "Model id." },
      image: {
        type: "string" as const,
        description: "Image to critique: asset id, asset:// URI, URL, or data URI."
      },
      brief: {
        type: "string" as const,
        description:
          "What the image is supposed to be — the original creative brief, " +
          "including mood, constraints, and any must-have elements."
      },
      taste_profile: {
        type: "string" as const,
        description:
          "Optional style profile from get_style_profile to judge against " +
          "the user's aesthetic, not generic taste."
      }
    },
    required: ["provider", "model", "image", "brief"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const image = params["image"];
    const brief = params["brief"];
    if (typeof image !== "string" || !image) return { error: "image is required" };
    if (typeof brief !== "string" || !brief) return { error: "brief is required" };

    const prompt =
      `You are a demanding art director reviewing one image against a brief.` +
      `\n\nBrief:\n${brief}${tasteBlock(params)}` +
      `\n\nExamine the image and report only defects you can point at: things that are` +
      ` wrong, missing relative to the brief, or technically broken (anatomy, geometry,` +
      ` illegible text, composition, lighting inconsistencies). For each defect say` +
      ` exactly where it is and the concrete change that fixes it.` +
      `\n\nRules:` +
      `\n- Never suggest adding embellishment or "more detail" — only fixes to named problems.` +
      `\n- If the composition itself is wrong for the brief, say so explicitly; that means` +
      ` regenerating, not patching.` +
      `\n- Verdict "pass" only if the image fulfills the brief with no defect a client would notice.` +
      `\n\nRespond with JSON only:` +
      `\n{"verdict": "pass" | "revise", "defects": [{"defect": "...", "location": "...",` +
      ` "fix": "..."}], "strengths": ["..."]}`;

    try {
      const text = await judgeCall(context, m, [
        textPart(prompt),
        imagePart(image)
      ]);
      const critique = parseCritique(text);
      if (!critique) {
        return { error: `Judge did not return parseable JSON: ${text.slice(0, 300)}` };
      }
      return { type: "critique", provider: m.provider, model: m.model, ...critique };
    } catch (e) {
      return {
        error: `critique_image failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }

  userMessage(): string {
    return "Critiquing image against the brief";
  }
}

// ---------------------------------------------------------------------------
// compare_images
// ---------------------------------------------------------------------------

interface MatchRecord {
  a: string;
  b: string;
  winner: string;
  agreed: boolean;
  reason: string;
}

function parsePairVerdict(text: string): { winner: 1 | 2; reason: string } | null {
  const parsed = extractJSON(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const winner = Number(obj["winner"]);
  if (winner !== 1 && winner !== 2) return null;
  return { winner, reason: String(obj["reason"] ?? "") };
}

export class CompareImagesTool extends Tool {
  readonly name = "compare_images";
  readonly description =
    "Pick the image that best fulfills a brief from 2-8 candidates using a " +
    "vision model as a pairwise judge. Runs a knockout tournament; every " +
    "match is judged twice with the presentation order swapped (VLM verdicts " +
    "are order-sensitive) and a tiebreak call settles disagreements. Returns " +
    "the winner plus every match verdict. All candidates remain available — " +
    "treat the ranking as triage, not deletion.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      provider: {
        type: "string" as const,
        description: "Provider id of a vision-capable chat model (find_model)."
      },
      model: { type: "string" as const, description: "Model id." },
      images: {
        type: "array" as const,
        items: { type: "string" as const },
        minItems: 2,
        maxItems: MAX_COMPARE_IMAGES,
        description:
          "2-8 candidate images: asset ids, asset:// URIs, URLs, or data URIs."
      },
      brief: {
        type: "string" as const,
        description: "The creative brief the images are judged against."
      },
      taste_profile: {
        type: "string" as const,
        description:
          "Optional style profile from get_style_profile so the judge weighs " +
          "the user's aesthetic."
      }
    },
    required: ["provider", "model", "images", "brief"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const images = params["images"];
    const brief = params["brief"];
    if (
      !Array.isArray(images) ||
      images.length < 2 ||
      images.some((i) => typeof i !== "string" || !i)
    ) {
      return { error: "images must be an array of 2-8 non-empty strings" };
    }
    if (images.length > MAX_COMPARE_IMAGES) {
      return { error: `images must contain at most ${MAX_COMPARE_IMAGES} candidates` };
    }
    if (typeof brief !== "string" || !brief) return { error: "brief is required" };

    const prompt =
      `You are judging which of two images better fulfills a creative brief.` +
      `\n\nBrief:\n${brief}${tasteBlock(params)}` +
      `\n\nImage 1 is shown first, image 2 second. Judge fulfillment of the brief and` +
      ` craft (composition, coherence, technical execution) — not which image is busier` +
      ` or more embellished. You must pick exactly one winner.` +
      `\n\nRespond with JSON only: {"winner": 1 | 2, "reason": "one sentence"}`;

    const judgePair = async (
      a: string,
      b: string
    ): Promise<{ winner: string; reason: string } | { error: string }> => {
      const call = async (first: string, second: string) => {
        const text = await judgeCall(context, m, [
          textPart(prompt),
          imagePart(first),
          imagePart(second)
        ]);
        const verdict = parsePairVerdict(text);
        if (!verdict) {
          throw new Error(`Judge did not return parseable JSON: ${text.slice(0, 200)}`);
        }
        return {
          winner: verdict.winner === 1 ? first : second,
          reason: verdict.reason
        };
      };
      try {
        // Same pair, both presentation orders: an order-dependent preference
        // cancels out; only a stable preference wins outright.
        const [forward, reversed] = [await call(a, b), await call(b, a)];
        if (forward.winner === reversed.winner) {
          return { winner: forward.winner, reason: forward.reason };
        }
        const tiebreakFirst = Math.random() < 0.5;
        const tiebreak = tiebreakFirst ? await call(a, b) : await call(b, a);
        return {
          winner: tiebreak.winner,
          reason: `(order-sensitive verdict, tiebreak) ${tiebreak.reason}`
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    };

    const matches: MatchRecord[] = [];
    let round = images.map(String);
    try {
      while (round.length > 1) {
        const next: string[] = [];
        for (let i = 0; i + 1 < round.length; i += 2) {
          const result = await judgePair(round[i], round[i + 1]);
          if ("error" in result) return { error: `compare_images failed: ${result.error}` };
          matches.push({
            a: round[i],
            b: round[i + 1],
            winner: result.winner,
            agreed: !result.reason.startsWith("(order-sensitive"),
            reason: result.reason
          });
          next.push(result.winner);
        }
        if (round.length % 2 === 1) next.push(round[round.length - 1]);
        round = next;
      }
    } catch (e) {
      return {
        error: `compare_images failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }

    return {
      type: "comparison",
      provider: m.provider,
      model: m.model,
      winner: round[0],
      matches,
      note:
        "Winner of a pairwise knockout. Other candidates were not deleted — " +
        "surface them to the user if the pick looks wrong."
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const n = Array.isArray(params["images"]) ? params["images"].length : 0;
    return n ? `Comparing ${n} images against the brief` : "Comparing images";
  }
}

// ---------------------------------------------------------------------------
// score_image_adherence
// ---------------------------------------------------------------------------

interface AdherenceAnswer {
  question: string;
  answer: "yes" | "no";
  note: string;
}

export class ScoreImageAdherenceTool extends Tool {
  readonly name = "score_image_adherence";
  readonly description =
    "Score how faithfully an image matches a brief by decomposing the brief " +
    "into binary yes/no checks and answering each one with a vision model. " +
    "Returns the per-check answers and the fraction that passed — an " +
    "explainable adherence score, not an opaque rating. Pass `questions` to " +
    "skip decomposition and check exactly those.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      provider: {
        type: "string" as const,
        description: "Provider id of a vision-capable chat model (find_model)."
      },
      model: { type: "string" as const, description: "Model id." },
      image: {
        type: "string" as const,
        description: "Image to score: asset id, asset:// URI, URL, or data URI."
      },
      brief: {
        type: "string" as const,
        description: "The creative brief the image must adhere to."
      },
      questions: {
        type: "array" as const,
        items: { type: "string" as const },
        description:
          "Optional explicit yes/no checks. When omitted, the brief is " +
          "decomposed into up to 12 atomic checks automatically."
      }
    },
    required: ["provider", "model", "image", "brief"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const m = parseModelArgs(params);
    if ("error" in m) return m;
    const image = params["image"];
    const brief = params["brief"];
    if (typeof image !== "string" || !image) return { error: "image is required" };
    if (typeof brief !== "string" || !brief) return { error: "brief is required" };

    try {
      let questions = Array.isArray(params["questions"])
        ? (params["questions"] as unknown[]).map(String).filter(Boolean)
        : [];

      if (questions.length === 0) {
        const decomposeText = await judgeCall(context, m, [
          textPart(
            `Decompose this creative brief into at most ${MAX_ADHERENCE_QUESTIONS} atomic` +
              ` yes/no questions, each verifiable by looking at a single image. Cover every` +
              ` explicit requirement (subjects, counts, colors, text, style, composition,` +
              ` mood). Phrase each so "yes" means the requirement is met. Skip anything not` +
              ` visually checkable.` +
              `\n\nBrief:\n${brief}` +
              `\n\nRespond with JSON only: {"questions": ["..."]}`
          )
        ]);
        const parsed = extractJSON(decomposeText);
        const list =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)["questions"]
            : parsed;
        questions = Array.isArray(list) ? list.map(String).filter(Boolean) : [];
        if (questions.length === 0) {
          return {
            error: `Could not decompose the brief into checks: ${decomposeText.slice(0, 300)}`
          };
        }
      }
      questions = questions.slice(0, MAX_ADHERENCE_QUESTIONS);

      const answerText = await judgeCall(context, m, [
        textPart(
          `Answer each question about the image with a strict yes or no. "yes" only if` +
            ` the image clearly satisfies it; when unsure, answer "no" and say why in the note.` +
            `\n\nQuestions:\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}` +
            `\n\nRespond with JSON only:` +
            `\n{"answers": [{"question": "...", "answer": "yes" | "no", "note": "..."}]}`
        ),
        imagePart(image)
      ]);
      const parsed = extractJSON(answerText);
      const rawAnswers =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)["answers"]
          : null;
      if (!Array.isArray(rawAnswers) || rawAnswers.length === 0) {
        return { error: `Judge did not return parseable answers: ${answerText.slice(0, 300)}` };
      }
      const answers: AdherenceAnswer[] = rawAnswers
        .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === "object"))
        .map((a) => ({
          question: String(a["question"] ?? ""),
          answer: a["answer"] === "yes" ? "yes" : "no",
          note: String(a["note"] ?? "")
        }));
      const passed = answers.filter((a) => a.answer === "yes").length;
      return {
        type: "adherence",
        provider: m.provider,
        model: m.model,
        score: answers.length ? passed / answers.length : 0,
        passed,
        total: answers.length,
        failed: answers.filter((a) => a.answer === "no"),
        answers
      };
    } catch (e) {
      return {
        error: `score_image_adherence failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }

  userMessage(): string {
    return "Scoring image adherence to the brief";
  }
}

// ---------------------------------------------------------------------------
// record_style_preference / get_style_profile
// ---------------------------------------------------------------------------

function resolveMemory(
  bound: LongTermMemory | null,
  context: ProcessingContext
): LongTermMemory | null {
  return bound ?? getLongTermMemory(context.userId);
}

export class RecordStylePreferenceTool extends Tool {
  readonly name = "record_style_preference";
  readonly description =
    "Persist one aesthetic preference learned from the user — which variant " +
    "they chose, what they rejected, or a stated taste — as a durable memory. " +
    "Call it whenever the user picks between candidates, corrects a style, or " +
    "expresses what they like. These accumulate into the profile returned by " +
    "get_style_profile.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      takeaway: {
        type: "string" as const,
        description:
          "One self-contained sentence stating the preference (e.g. \"User " +
          "prefers muted, desaturated palettes over vivid colors for poster " +
          "work.\")."
      },
      chosen: {
        type: "string" as const,
        description: "Optional short description of what the user picked."
      },
      rejected: {
        type: "string" as const,
        description: "Optional short description of what they passed over."
      },
      brief: {
        type: "string" as const,
        description: "Optional context: the brief or task the choice was made in."
      },
      importance: {
        type: "number" as const,
        minimum: 0,
        maximum: 1,
        description:
          "How broadly this preference applies (1 = always, 0.3 = niche). Default 0.6."
      }
    },
    required: ["takeaway"]
  };

  constructor(private readonly bound: LongTermMemory | null = null) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const memory = resolveMemory(this.bound, context);
    if (!memory) {
      return { stored: false, note: "Long-term memory is not configured." };
    }
    const takeaway = typeof params["takeaway"] === "string" ? params["takeaway"].trim() : "";
    if (!takeaway) return { stored: false, note: "takeaway is required" };

    const details: string[] = [];
    if (typeof params["chosen"] === "string" && params["chosen"].trim())
      details.push(`chose: ${params["chosen"].trim()}`);
    if (typeof params["rejected"] === "string" && params["rejected"].trim())
      details.push(`over: ${params["rejected"].trim()}`);
    if (typeof params["brief"] === "string" && params["brief"].trim())
      details.push(`brief: ${params["brief"].trim()}`);
    const text = details.length ? `${takeaway} (${details.join("; ")})` : takeaway;

    const stored = await memory.remember(text, {
      kind: "preference",
      importance:
        typeof params["importance"] === "number" ? params["importance"] : 0.6,
      source: "style_preference"
    });
    if (!stored) {
      return { stored: false, note: "Skipped as duplicate of existing preference." };
    }
    return { stored: true, id: stored.id, text };
  }

  userMessage(params: Record<string, unknown>): string {
    const t = typeof params["takeaway"] === "string" ? params["takeaway"] : "";
    return t ? `Remembering preference: ${t.slice(0, 60)}` : "Recording style preference";
  }
}

export class GetStyleProfileTool extends Tool {
  readonly name = "get_style_profile";
  readonly description =
    "Retrieve the user's accumulated aesthetic preferences as a style profile " +
    "block. Inject it into generation prompts and pass it as `taste_profile` " +
    "to critique_image / compare_images so judging reflects the user's taste, " +
    "not generic preference.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      query: {
        type: "string" as const,
        description:
          "Optional focus (e.g. \"typography\", \"color palettes for posters\"). " +
          "Defaults to a broad visual-style query."
      },
      k: {
        type: "number" as const,
        minimum: 1,
        maximum: 20,
        description: "Maximum preferences to include (default 10)."
      }
    },
    required: []
  };

  constructor(private readonly bound: LongTermMemory | null = null) {
    super();
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const memory = resolveMemory(this.bound, context);
    if (!memory) {
      return { profile: "", items: [], note: "Long-term memory is not configured." };
    }
    const query =
      typeof params["query"] === "string" && params["query"].trim()
        ? params["query"].trim()
        : "visual style aesthetic preference taste";
    const k =
      typeof params["k"] === "number" && Number.isFinite(params["k"])
        ? Math.max(1, Math.min(20, Math.trunc(params["k"])))
        : 10;

    const items = (await memory.recall(query, { k })).filter(
      (item) => item.kind === "preference"
    );
    return {
      profile: items.map((item) => `- ${item.text}`).join("\n"),
      items: items.map((item) => ({
        id: item.id,
        text: item.text,
        importance: item.importance
      }))
    };
  }

  userMessage(): string {
    return "Loading the user's style profile";
  }
}

/** Names of the creative critique tools. */
export const CREATIVE_CRITIQUE_TOOL_NAMES = [
  "critique_image",
  "compare_images",
  "score_image_adherence",
  "record_style_preference",
  "get_style_profile"
] as const;
