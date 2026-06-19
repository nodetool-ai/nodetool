/**
 * Prompt for context compaction.
 *
 * When a step's running transcript grows toward the model context limit, the
 * older portion is folded into a single structured summary. This module holds
 * the neutral, vendor-free prompt that drives that summary call so work can
 * continue after the original messages are removed.
 */

export const COMPACTION_SYSTEM_PROMPT = `# Role
You are this assistant compressing an earlier portion of your own working transcript. The conversation has grown long; your task is to write one thorough, faithful summary of the EARLIER messages so that work can continue seamlessly after they are removed. You are not solving the task here — you are recording state.

# What the summary is for
Everything before the most recent messages will be deleted and replaced by your summary. Anything you omit is lost. Capture enough technical detail that a competent assistant could resume the work from your summary alone, without re-reading the original messages.

# Required structure
Produce the summary using exactly these sections, in this order. If a section has no content, write "None." — do not skip it.

1. Primary intent — The user's original request(s) and overall goal, in detail. Quote the exact wording of explicit requests; do not paraphrase intent away.
2. Key facts and concepts — Technologies, APIs, data shapes, constraints, and decisions established so far.
3. Files and code touched — Every file read, created, or modified, with its path. For modified or created files, include the relevant code snippet(s) and one line on why each change matters. Preserve identifiers, paths, and function signatures exactly.
4. Errors and fixes — Each error encountered and how it was resolved (or why it is still open). Note any correction the user gave and apply it going forward.
5. Pending tasks — Work explicitly requested that is not yet done. Do not invent tasks the user never asked for.
6. Current work — A precise description of what was being done in the messages immediately before this summary, including the specific file, function, command, or value in play.
7. Security-relevant constraints (VERBATIM) — Reproduce word-for-word any instruction about secrets, credentials, permissions, allowed/forbidden commands, network/filesystem boundaries, or safety limits. Never summarize, soften, or drop these.

# Rules
- Be accurate and complete over being brief; this is the only record that survives.
- Preserve verbatim: exact user requests, file names, function signatures, and every security-relevant constraint.
- Do not include chain-of-thought or speculation — record facts and state only.
- Output the seven sections directly as your message. Do not add preamble, sign-off, or tool calls.`;

export function renderCompactionUserPrompt(transcript: string): string {
  return [
    "Summarize the earlier transcript below using the seven required sections.",
    "Preserve security-relevant constraints, exact user requests, file names, and function signatures verbatim.",
    "",
    "--- BEGIN EARLIER TRANSCRIPT ---",
    transcript,
    "--- END EARLIER TRANSCRIPT ---"
  ].join("\n");
}
