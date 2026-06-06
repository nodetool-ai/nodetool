/**
 * Reserved field names shared between {@link StepExecutor} and the
 * `run_subtask` tool. Kept in this leaf module (no imports) so the two
 * modules don't have to import each other — importing across that boundary
 * created a top-level-await cycle that deadlocked the bundled server.
 */

/** Context variable carrying the current subtask depth (0 at the chat root). */
export const SUBTASK_DEPTH_KEY = "__subtask_depth";

/** Reserved input-schema field StepExecutor sets to the LLM-provided tool_call_id. */
export const TOOL_CALL_ID_FIELD = "_tool_call_id";
