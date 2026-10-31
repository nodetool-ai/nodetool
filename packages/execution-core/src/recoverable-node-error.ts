/**
 * The error a node throws when it has the broken value in hand.
 *
 * Without the malformed value, "repair" is fabrication: the supervisor would
 * invent a structurally valid output that no runtime validator can semantically
 * vet. So `substitute` is offered only for an escalation carrying a
 * `candidateOutput`, and this is how a node supplies one — a JSON parser that
 * chokes attaches the raw response instead of losing it.
 *
 * The value is redacted and truncated by the kernel when the escalation is
 * built, alongside the node's inputs; nothing here is safe to log as-is.
 *
 * See docs/workflow-supervisor-design.md §4.
 */
export class RecoverableNodeError extends Error {
  /** The malformed value a `substitute` verdict would replace. */
  readonly candidateOutput: unknown;
  /**
   * Stable categorical code for this failure (an HTTP status, a provider error
   * code, a validation path). Verdicts stick per `(nodeId, code)`, so it must
   * never embed request-specific values — see design §4.
   */
  readonly code?: string;

  constructor(
    message: string,
    opts: { candidateOutput: unknown; code?: string }
  ) {
    super(message);
    this.name = "RecoverableNodeError";
    this.candidateOutput = opts.candidateOutput;
    this.code = opts.code;
  }
}

/** True for a `RecoverableNodeError` from any copy of this package. */
export function isRecoverableNodeError(
  err: unknown
): err is RecoverableNodeError {
  return (
    err instanceof Error &&
    err.name === "RecoverableNodeError" &&
    "candidateOutput" in err
  );
}
