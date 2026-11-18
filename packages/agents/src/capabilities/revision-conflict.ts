/**
 * The refusal a storyboard write returns when the caller's expected revision
 * is not the board's.
 *
 * It names the board's revision and says nothing was written. Without both, a
 * model read "revision conflict" as partial success and repeated the same call
 * with the same stale revision.
 */
export function boardRevisionConflict(
  field: string,
  sent: unknown,
  current: number
): { error: string; revision: number } {
  // A string "1" fails the strict check against 1, so quote it to show why.
  const shown = typeof sent === "number" ? String(sent) : JSON.stringify(sent);
  return {
    error:
      `Revision conflict: you sent ${field} ${shown} but the board is at ` +
      `revision ${current}. Nothing was applied. Re-read the board or resend ` +
      `with ${field} ${current}.`,
    revision: current
  };
}
