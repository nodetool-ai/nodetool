/**
 * Content-filter refusals, as a class apart from hard errors.
 *
 * Veo 3.1 filtered one shot of a five-shot trailer on an ordinary cinematic
 * prompt ("a lighthouse in a storm"), the same prompt passed on retry, and the
 * blocked take was not charged. Classified as a hard error, that refusal fails
 * the node, fails the run, and discards the four shots already generated and
 * paid for.
 *
 * So a refusal gets its own class. `ProcessingContext.runProviderPrediction`
 * retries it a bounded number of times, and the kernel actor drops the item
 * instead of the run when the invocation is one item of a fan-out.
 *
 * A provider that gives us structured evidence (Veo's `raiMediaFilteredReasons`)
 * throws the class directly. For the rest, {@link isContentFilterRefusal}
 * matches the message text, because that is all a provider hands back.
 */

import { isObjectLike, isString } from "../type-predicates.js";

/** Extra attempts after a refusal, before the refusal reaches the node. */
export const CONTENT_FILTER_MAX_RETRIES = 2;

/** Delay before attempt N+1 after a refusal. */
export function contentFilterRetryDelayMs(attempt: number): number {
  return Math.min(1_000 * 2 ** (attempt - 1), 8_000);
}

/**
 * A provider refused to generate because its content filter rejected the
 * prompt or the result. Not a failure of the request — the same request often
 * succeeds on a retry.
 */
export class ContentFilterRefusal extends Error {
  /** Provider id as the runtime knows it (e.g. `gemini`). */
  readonly provider?: string;
  readonly model?: string;
  /** Provider-supplied reason codes, when it gives any. */
  readonly reasons?: readonly string[];

  constructor(
    message: string,
    opts: {
      provider?: string;
      model?: string;
      reasons?: readonly string[];
    } = {}
  ) {
    super(message);
    this.name = "ContentFilterRefusal";
    this.provider = opts.provider;
    this.model = opts.model;
    this.reasons = opts.reasons;
  }
}

/**
 * Phrasings providers use when their filter — not the request — is what
 * failed. Each entry names the provider it came from.
 */
const REFUSAL_PATTERNS: readonly RegExp[] = [
  // Google Veo / Vertex RAI: "... videos were filtered out because they
  // violated Vertex AI's usage guidelines", and the raw response field.
  /filtered out because .*violat/i,
  /\brai[_ ]?(?:media[_ ]?)?filtered/i,
  // Gemini text and image: blocked prompt / blocked candidate.
  /\bPROHIBITED_CONTENT\b/,
  /blocked (?:due to|by) (?:the )?safety/i,
  // OpenAI images and moderation.
  /rejected as a result of our safety system/i,
  /\bcontent[_ ]policy[_ ]violation\b/i,
  /\bmoderation_blocked\b/i,
  // Azure OpenAI.
  /content management policy/i,
  // FAL / Replicate / KIE image and video models.
  /\bnsfw\b[^.]*\bdetect/i,
  /flagged as sensitive/i,
  /\bsensitive words?\b/i,
  // Phrasings shared across providers.
  /\b(?:content|safety) filters?\b/i,
  /violates? (?:our |the )?(?:content|usage) (?:polic|guideline)/i
];

/** True for {@link ContentFilterRefusal} from any copy of this package. */
export function isContentFilterRefusalError(
  error: unknown
): error is ContentFilterRefusal {
  return error instanceof Error && error.name === "ContentFilterRefusal";
}

/**
 * True when this failure is a content-filter refusal — the class, or a message
 * carrying one of the phrasings providers use for it.
 */
export function isContentFilterRefusal(error: unknown): boolean {
  if (isContentFilterRefusalError(error)) return true;
  const message = refusalText(error);
  return message !== "" && REFUSAL_PATTERNS.some((p) => p.test(message));
}

function refusalText(error: unknown): string {
  if (isString(error)) return error;
  if (isObjectLike(error) && "message" in error && isString(error.message)) {
    return error.message;
  }
  return "";
}
