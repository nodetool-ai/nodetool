#!/usr/bin/env node
/**
 * Motion-craft eval loop.
 *
 * Runs the in-product agent (`nodetool agent run`) on a motion-graphics
 * brief, finds the timeline sequence the run produced, scores it with
 * `nodetool timeline score` against the shipped showcase examples, and
 * writes a report. This is the repeatable form of the by-hand loop used to
 * measure agent-harness changes: run a brief, find the saved timeline,
 * render a contact sheet, count structural features, validate — now `timeline
 * score` (packages/execution/src/timeline-debug/score.ts) does the counting
 * and comparison, and this script drives the agent and writes the report.
 *
 *   node scripts/motion-craft-eval.mjs
 *   node scripts/motion-craft-eval.mjs --runs 3 -p claude_agent_sdk -m opus
 *   node scripts/motion-craft-eval.mjs --brief-file brief.txt --max-iterations 40 --timeout 900
 *
 * See docs/harnesses.md § motion-craft-eval.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_BRIEF =
  'Make an amazing motion graphics timeline at the highest quality. Subject: a 20-second launch spot for "Halo", a fictional focus-timer app that blocks distractions and tracks deep-work streaks. Pure motion graphics on the timeline: kinetic type, shapes, data, transitions. I want it dense, expressive and elegant, like a top motion-design studio made it. Save it as a timeline I can open in the editor, and check the frames before you finish.';

const DEFAULT_PROVIDER = "claude_agent_sdk";
const DEFAULT_MODEL = "opus";
const DEFAULT_MAX_ITERATIONS = 60;
const DEFAULT_TIMEOUT_S = 1800;

// ── Event parsing ───────────────────────────────────────────────────────────

/**
 * Best-effort success read of a `tool_result_update`. `execute_code` (the
 * QuickJS sandbox) reports its own outcome as a JSON-encoded string in
 * `result.value` (`{"ok": true|false, ...}`); a direct tool call reports it
 * on `result` itself. Absent either signal, the call is undecidable from the
 * stream and treated as successful — the optimistic default a report-writer
 * should not need to defend, since `errors` below still lists whatever an
 * `ok: false` did carry.
 */
function resultOk(event) {
  const result = event.result;
  if (result == null) return true;
  if (typeof result.value === "string") {
    try {
      const parsed = JSON.parse(result.value);
      if (typeof parsed.ok === "boolean") return parsed.ok;
    } catch {
      // Not JSON — fall through to the other signals.
    }
  }
  if (typeof result.error === "string" && result.error.length > 0) return false;
  if (typeof result.ok === "boolean") return result.ok;
  return true;
}

function resultErrorMessage(event) {
  const result = event.result;
  if (result == null) return null;
  if (typeof result.value === "string") {
    try {
      const parsed = JSON.parse(result.value);
      if (parsed && parsed.ok === false) {
        return String(parsed.error ?? "unknown error");
      }
    } catch {
      // fall through
    }
  }
  if (typeof result.error === "string" && result.error.length > 0) {
    return result.error;
  }
  return null;
}

/**
 * Parse an agent run's NDJSON event stream (`agent run --json`'s **stderr** —
 * the final answer goes to stdout, see docs/agent-cli.md — one event object
 * per line) into: the timeline the run settled on, tool-call counts by name,
 * every error a tool result carried, and how many lines actually parsed as a
 * JSON event (`eventCount`). A caller should treat `eventCount === 0` as a
 * hard failure of the capture, not as "the agent found no timeline" — an
 * empty or non-JSON event file means the trace never reached this file, most
 * often because stdout and stderr were swapped when the process was spawned.
 *
 * `create_timeline` / `set_timeline_document` reach the model two ways in
 * practice: as a direct tool call carrying its own `tool_call_id` (paired
 * with a `tool_result_update` of the same id), or nested inside one
 * `execute_code` sandbox action calling `nodetool.timelines.*` — the shape
 * this script was written against, from a real recorded run (see
 * `scripts/__tests__/fixtures/motion-craft-eval-events.sample.jsonl`, a
 * trimmed extract). A nested call carries no `tool_call_id` of its own; its
 * outcome is the enclosing `execute_code` call's, tracked as the most
 * recently opened `execute_code` `tool_call_id` at the time it appears. The
 * winning timeline is the last `set_timeline_document` that resolved
 * successfully, falling back to the last one at all, then the last
 * `create_timeline`.
 */
export function parseTimelineRunEvents(lines) {
  const events = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // Not a JSON event line (npm banner, a raw log line) — skip it.
    }
  }

  const resultOkByCallId = new Map();
  for (const event of events) {
    if (event.type === "tool_result_update" && event.tool_call_id) {
      resultOkByCallId.set(event.tool_call_id, resultOk(event));
    }
  }

  const toolCallCounts = {};
  const errors = [];
  const candidates = [];
  let openExecuteCodeId = null;

  for (const event of events) {
    if (event.type === "tool_result_update") {
      if (resultOk(event) === false) {
        const message = resultErrorMessage(event);
        if (message) errors.push(`${event.name ?? "tool"}: ${message}`);
      }
      continue;
    }
    if (event.type !== "tool_call_update" || !event.name) continue;
    toolCallCounts[event.name] = (toolCallCounts[event.name] ?? 0) + 1;

    if (event.name === "execute_code" && event.tool_call_id) {
      openExecuteCodeId = event.tool_call_id;
    }
    if (event.name !== "create_timeline" && event.name !== "set_timeline_document") {
      continue;
    }

    const timelineId = event.args?.timeline_id;
    if (typeof timelineId !== "string" || timelineId.length === 0) continue;

    let ok;
    if (event.tool_call_id && resultOkByCallId.has(event.tool_call_id)) {
      ok = resultOkByCallId.get(event.tool_call_id);
    } else if (openExecuteCodeId && resultOkByCallId.has(openExecuteCodeId)) {
      ok = resultOkByCallId.get(openExecuteCodeId);
    } else {
      ok = true;
    }
    candidates.push({ name: event.name, timelineId, ok });
  }

  const lastWhere = (predicate) => {
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      if (predicate(candidates[i])) return candidates[i];
    }
    return null;
  };

  const winner =
    lastWhere((c) => c.name === "set_timeline_document" && c.ok) ??
    lastWhere((c) => c.name === "set_timeline_document") ??
    lastWhere((c) => c.name === "create_timeline");

  return {
    timelineId: winner ? winner.timelineId : null,
    toolCallCounts,
    errors,
    eventCount: events.length
  };
}

/** A bare 32-hex-character id, `nodetool timeline`'s row id shape. */
const TIMELINE_ID_PATTERN = /\b[0-9a-f]{32}\b/;

/**
 * Fallback timeline-id recovery from the agent's final answer text, for when
 * the event stream named none (including when the event capture itself
 * failed — `eventCount === 0`). The agent routinely names the timeline id
 * in its closing summary (e.g. "**Timeline id:** `523c891b...`"), so this is
 * a real, if weaker, second source — weaker because nothing here confirms
 * the id refers to a timeline that was actually saved, only that the model
 * wrote a string shaped like one.
 */
export function extractTimelineIdFromAnswer(answer) {
  if (typeof answer !== "string") return null;
  const match = answer.match(TIMELINE_ID_PATTERN);
  return match ? match[0] : null;
}

// ── CLI driving ──────────────────────────────────────────────────────────

function nodetoolArgs(args) {
  return ["tsx", join(root, "packages/cli/src/nodetool.ts"), ...args];
}

function runNodetoolCli(args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("npx", nodetoolArgs(args), {
      cwd: root,
      env: { ...process.env, NODE_OPTIONS: "--conditions=nodetool-dev" }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({ code, stdout, stderr });
    });
  });
}

/**
 * Run a command, streaming its **stderr** to `eventsPath` as it arrives and
 * collecting its **stdout** whole, trimmed, as the returned `answer`. Split
 * out of `runAgentToFile` so the routing itself — which channel goes where —
 * is testable against a real child process without spawning the agent.
 */
export function runProcessSplitOutputs(command, args, options, eventsPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const out = createWriteStream(eventsPath);
    const child = spawn(command, args, options);
    let answer = "";
    child.stderr.pipe(out);
    child.stdout.on("data", (chunk) => {
      answer += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      out.end(() => resolvePromise({ code, answer: answer.trim() }));
    });
  });
}

/**
 * Run `agent run --json` and route its two output channels to where they
 * actually belong (docs/agent-cli.md): the NDJSON event trace is on
 * **stderr**, the final answer is on **stdout** — the opposite of the naive
 * assumption that `--json` output is on stdout, which is the bug this
 * function exists to not repeat.
 */
function runAgentToFile(args, eventsPath) {
  return runProcessSplitOutputs(
    "npx",
    nodetoolArgs(["agent", "run", ...args]),
    { cwd: root, env: { ...process.env, NODE_OPTIONS: "--conditions=nodetool-dev" } },
    eventsPath
  );
}

/** The last `{...}` JSON value on stdout — `timeline score --json`'s report, after any stray log lines. */
function lastJsonObject(stdout) {
  const lines = stdout.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      return JSON.parse(trimmed);
    } catch {
      // keep scanning backward
    }
  }
  return null;
}

// ── Report ──────────────────────────────────────────────────────────────

export function formatReport({
  brief,
  provider,
  model,
  toolCallCounts,
  errors,
  eventCount,
  timelineId,
  usedFallback,
  score,
  sheetPath,
  finalAnswer
}) {
  const lines = [];
  lines.push(`# Motion-craft eval — ${provider} / ${model}`);
  lines.push("");
  lines.push("## Brief");
  lines.push("");
  lines.push(brief);
  lines.push("");
  if (eventCount === 0) {
    lines.push(
      "## Event capture failed"
    );
    lines.push("");
    lines.push(
      "`events.jsonl` has no parseable JSON events — the agent's --json trace " +
        "did not reach it. Tool-call counts and errors below are unavailable " +
        "for this reason, not because the agent made no calls."
    );
    lines.push("");
  }
  lines.push("## Tool calls");
  lines.push("");
  const names = Object.keys(toolCallCounts).sort();
  if (names.length === 0) {
    lines.push(eventCount === 0 ? "(unavailable — see event capture failure above)" : "(none recorded)");
  } else {
    for (const name of names) {
      lines.push(`- ${name}: ${toolCallCounts[name]}`);
    }
  }
  if (errors.length > 0) {
    lines.push("");
    lines.push("## Errors");
    lines.push("");
    for (const error of errors) lines.push(`- ${error}`);
  }
  lines.push("");
  lines.push("## Scorecard");
  lines.push("");
  if (usedFallback && timelineId) {
    lines.push(
      `Timeline id \`${timelineId}\` recovered from the agent's final answer text — the event stream named none. Treat this id with less confidence than one read from the events.`
    );
    lines.push("");
  }
  if (!timelineId) {
    lines.push(
      "No timeline id was found in the run's events or in its final answer — nothing to score."
    );
  } else if (!score) {
    lines.push(`Timeline ${timelineId} — scoring failed. See stderr in the run bundle.`);
  } else {
    lines.push(
      `Timeline \`${timelineId}\` — score ${score.score.toFixed(1)}/100 (raw ${score.rawScore.toFixed(1)}, -${score.penalty} for ${Object.keys(score.showcaseWarningCodeCounts ?? {}).length} distinct showcase warning code(s), ${score.showcaseWarnings.length} instance(s))`
    );
    lines.push("");
    lines.push("| metric | value | reference median | credit |");
    lines.push("|---|---:|---:|---:|");
    for (const m of score.metricScores) {
      lines.push(
        `| ${m.metric} | ${m.value.toFixed(2)} | ${m.referenceMedian.toFixed(2)} | ${m.credit.toFixed(2)} |`
      );
    }
    if (sheetPath) {
      lines.push("");
      lines.push(`Contact sheet: ${sheetPath}`);
    }
  }
  if (finalAnswer) {
    lines.push("");
    lines.push("## Agent's final answer");
    lines.push("");
    lines.push(finalAnswer);
  }
  return lines.join("\n") + "\n";
}

// ── One run ─────────────────────────────────────────────────────────────

async function runOnce({ provider, model, brief, maxIterations, timeoutS, dir }) {
  await mkdir(dir, { recursive: true });
  const eventsPath = join(dir, "events.jsonl");

  const { code: agentCode, answer } = await runAgentToFile(
    [
      "-p",
      provider,
      "-m",
      model,
      "--json",
      "--permission-mode",
      "auto",
      "--max-iterations",
      String(maxIterations),
      "--timeout",
      String(timeoutS),
      "-o",
      brief
    ],
    eventsPath
  );
  await writeFile(join(dir, "answer.md"), answer);

  const eventsRaw = await readFile(eventsPath, "utf8");
  const lines = eventsRaw.split("\n");
  const { timelineId: eventsTimelineId, toolCallCounts, errors, eventCount } =
    parseTimelineRunEvents(lines);
  if (agentCode !== 0) {
    errors.push(`agent run exited ${agentCode}`);
  }

  // The one place stderr capture failing is treated as a hard failure of the
  // *harness*, not as "the agent found no timeline" — an empty event file
  // usually means the trace never reached it (docs/agent-cli.md: the trace is
  // on stderr, the final answer on stdout).
  const hardFailure = eventCount === 0;
  if (hardFailure) {
    errors.push(
      "events.jsonl has no parseable JSON events — agent run's --json trace did not reach stderr."
    );
  }

  let timelineId = eventsTimelineId;
  let usedFallback = false;
  if (!timelineId) {
    const fallbackId = extractTimelineIdFromAnswer(answer);
    if (fallbackId) {
      timelineId = fallbackId;
      usedFallback = true;
    }
  }

  let score = null;
  const sheetPath = timelineId ? join(dir, "sheet.png") : null;
  if (timelineId) {
    const scoreResult = await runNodetoolCli([
      "timeline",
      "score",
      timelineId,
      "--json",
      "--sheet",
      sheetPath
    ]);
    score = lastJsonObject(scoreResult.stdout);
    await writeFile(join(dir, "score.json"), scoreResult.stdout);
  }

  const report = formatReport({
    brief,
    provider,
    model,
    toolCallCounts,
    errors,
    eventCount,
    timelineId,
    usedFallback,
    score,
    sheetPath,
    finalAnswer: answer
  });
  await writeFile(join(dir, "report.md"), report);

  return { timelineId, usedFallback, hardFailure, score, toolCallCounts, errors };
}

// ── main ────────────────────────────────────────────────────────────────

function parseArgv(argv) {
  const opts = {
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL,
    brief: DEFAULT_BRIEF,
    runs: 1,
    maxIterations: DEFAULT_MAX_ITERATIONS,
    timeoutS: DEFAULT_TIMEOUT_S,
    briefFile: null
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--provider":
      case "-p":
        opts.provider = next();
        break;
      case "--model":
      case "-m":
        opts.model = next();
        break;
      case "--brief-file":
        opts.briefFile = next();
        break;
      case "--runs":
        opts.runs = Number(next());
        break;
      case "--max-iterations":
        opts.maxIterations = Number(next());
        break;
      case "--timeout":
        opts.timeoutS = Number(next());
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgv(process.argv.slice(2));
  const brief = opts.briefFile
    ? (await readFile(opts.briefFile, "utf8")).trim()
    : opts.brief;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseDir = join(root, "nodetool-debug/motion-craft", timestamp);

  const results = [];
  for (let i = 1; i <= opts.runs; i += 1) {
    const dir = opts.runs > 1 ? join(baseDir, `run-${i}`) : baseDir;
    console.log(`Run ${i}/${opts.runs} -> ${dir}`);
    const result = await runOnce({
      provider: opts.provider,
      model: opts.model,
      brief,
      maxIterations: opts.maxIterations,
      timeoutS: opts.timeoutS,
      dir
    });
    results.push(result);
    console.log(
      `  timeline ${result.timelineId ?? "(none)"}${result.usedFallback ? " (fallback)" : ""} score ${result.score ? result.score.score.toFixed(1) : "n/a"}`
    );
    if (result.hardFailure) {
      console.error(`  event capture failed for run ${i} — see ${dir}/report.md`);
    }
  }

  const anyHardFailure = results.some((r) => r.hardFailure);

  if (opts.runs > 1) {
    const scores = results.map((r) => r.score?.score).filter((s) => typeof s === "number");
    const summary =
      scores.length > 0
        ? {
            mean: scores.reduce((a, b) => a + b, 0) / scores.length,
            min: Math.min(...scores),
            max: Math.max(...scores)
          }
        : null;
    console.log(
      summary
        ? `mean=${summary.mean.toFixed(1)} min=${summary.min.toFixed(1)} max=${summary.max.toFixed(1)}`
        : "No run produced a score."
    );
    await writeFile(join(baseDir, "summary.json"), JSON.stringify({ results, summary }, null, 2));
  }

  if (anyHardFailure) {
    throw new Error(
      "One or more runs failed to capture the agent's event trace — see each run's report.md."
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
