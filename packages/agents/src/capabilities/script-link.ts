/**
 * The script side of the script ↔ storyboard link: the `scripts.storyboard_id`
 * back-pointer (design §1.2).
 *
 * The board owns the link — `Screenplay.script_id` is what validation reads —
 * and this column is the navigation pointer back. Both tools that create a
 * linked pair stamp it, and they stamp it last: the pointer is only written
 * once the row it names exists and the board carries the forward link, so a
 * write that fails leaves a consistent unlinked-but-valid script rather than a
 * pointer at something no board confirms (design §7).
 */

const CAS_ATTEMPTS = 2;

/**
 * Point `scriptId` at `storyboardId` (or clear it with `null`), CAS on the
 * script's `updated_at`. Returns the failure as a message rather than throwing:
 * the callers report it beside the resource they did create.
 */
export async function stampScriptStoryboardId(
  scriptId: string,
  storyboardId: string | null,
  userId: string | undefined
): Promise<{ ok: true } | { error: string }> {
  const { Script } = await import("@nodetool-ai/models");
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const row = await Script.findById(scriptId);
    if (!row || (userId && row.user_id !== userId)) {
      return { error: `Script ${scriptId} was not found.` };
    }
    if ((row.storyboard_id ?? null) === storyboardId) return { ok: true };
    const saved = await Script.updateFieldsIfUnchanged(
      scriptId,
      row.updated_at,
      { storyboard_id: storyboardId },
      { ops: [{ tool: "set_link", input: { storyboard_id: storyboardId } }] }
    );
    if (saved) return { ok: true };
  }
  return {
    error: `Script ${scriptId} is being modified concurrently, so its storyboard back-pointer could not be written.`
  };
}
