/**
 * Check what an isolated participant session can see before its task.
 *
 * Starts a session with the participant runner's options, asks it to quote all
 * context beyond its own system prompt and message, and fails when the answer
 * shows an email address, project instructions, product names, a git
 * repository, memory, skills, or any callable tool. Run it before a campaign
 * and after any SDK upgrade. It costs one short model turn.
 *
 * Usage (from web/):
 *   npx tsx tests/agentic-qa/probeContext.ts [--model sonnet]
 * Exit 0: clean. Exit 1: a leak, printed with the session's own answer.
 */

import { parseArgs } from "node:util";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { isolatedSessionOptions } from "./isolatedSession";

const PROBE =
  "This is an audit of your context window. Quote verbatim every piece of text " +
  "in your context other than your system prompt and this message: system " +
  "reminders, user context, email addresses, names, file paths, git data, " +
  "project instructions, memory, skill lists. Then list every tool name you " +
  "can call. Write NONE for each category that is empty.";

const LEAKS: Array<[string, RegExp]> = [
  ["email address", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ["project instructions", /AGENTS\.md|CLAUDE\.md/],
  ["product name", /nodetool/i],
  ["git repository", /Is a git repository:\s*true/i],
  ["tool", /\bmcp__|\b(Bash|Read|Write|Edit|Glob|Grep|WebFetch|WebSearch|Skill|Agent)\b(?= *[,\n(])/]
];

const { values } = parseArgs({
  options: { model: { type: "string", default: "sonnet" } }
});
const { options, accountContext } = await isolatedSessionOptions({
  systemPrompt: "You audit your own context window. Answer exactly and completely.",
  model: values.model,
  maxTurns: 1
});

let answer = "";
for await (const msg of query({ prompt: PROBE, options })) {
  if (msg.type === "result" && msg.subtype === "success") {
    answer = msg.result;
  }
}

const found = LEAKS.filter(([, pattern]) => pattern.test(answer)).map(([name]) => name);
console.log(answer);
console.log(`\naccountContext: ${accountContext}`);
if (answer.trim() === "") {
  console.log("PROBE FAILED: the session returned no answer.");
  process.exitCode = 1;
} else if (found.length > 0) {
  console.log(`LEAK: ${found.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("CLEAN");
}
