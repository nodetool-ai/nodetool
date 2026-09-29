"use client";
import React, { useEffect, useRef, useState } from "react";
import { Check, Pause, Play, X } from "lucide-react";
import { usePrefersReducedMotion } from "../../lib/useGridParallax";

/**
 * The hero proof: a terminal session in which a coding agent builds a
 * workflow through the NodeTool MCP server, hits a failing node, reads the
 * log, and repairs it as a new version. The tool names are the ones the MCP
 * server exposes. The session itself is illustrative.
 *
 * Every line is in the DOM from the first render and only its visibility
 * changes, so the frame never reflows and the text is readable without
 * JavaScript. Reduced motion shows the finished session.
 */
const PROMPT =
  "Build a launch video for the Aurora Trail watch from product.jpg.";

type Line =
  | { kind: "call"; tool: string; arg?: string; result: string; failed?: boolean }
  | { kind: "note"; text: string }
  | { kind: "output" }
  | { kind: "done"; text: string };

const LINES: Line[] = [
  { kind: "call", tool: "search_nodes", arg: "image to video", result: "4 matches" },
  { kind: "call", tool: "create_workflow", arg: "aurora-launch", result: "7 nodes" },
  { kind: "call", tool: "validate_workflow", result: "no errors" },
  {
    kind: "call",
    tool: "run_workflow",
    result: "Image To Video: 4:3 input rejected",
    failed: true,
  },
  { kind: "call", tool: "get_job_logs", result: "1 failed node" },
  {
    kind: "note",
    text: "The video model takes 16:9. I will crop the photo before it.",
  },
  { kind: "call", tool: "create_workflow_version", arg: "v2", result: "8 nodes" },
  { kind: "call", tool: "run_workflow", result: "done in 43.9s" },
  { kind: "output" },
  {
    kind: "done",
    text: "Saved aurora-launch v2. Open it in Studio to change any node.",
  },
];

const TYPE_MS = 28;
const RUN_MS = 750;
const STEP_MS = 420;
const HOLD_MS = 6000;

/** Phase: characters typed, then lines revealed, with the last one running. */
interface Phase {
  typed: number;
  shown: number;
  running: boolean;
}

const FINAL: Phase = { typed: PROMPT.length, shown: LINES.length, running: false };
const START: Phase = { typed: 0, shown: 0, running: false };

function next(phase: Phase): [Phase, number] {
  if (phase.typed < PROMPT.length) {
    const typed = phase.typed + 1;
    return [{ ...phase, typed }, typed === PROMPT.length ? 500 : TYPE_MS];
  }
  if (phase.running) {
    return [{ ...phase, running: false }, STEP_MS];
  }
  if (phase.shown < LINES.length) {
    const shown = phase.shown + 1;
    const isCall = LINES[shown - 1].kind === "call";
    return [{ ...phase, shown, running: isCall }, isCall ? RUN_MS : STEP_MS * 2];
  }
  return [START, HOLD_MS];
}

function CallStatus({ running, failed }: { running: boolean; failed?: boolean }) {
  if (running) {
    return (
      <span
        className="block h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-blue-300"
        aria-hidden
      />
    );
  }
  if (failed) {
    return <X className="h-3.5 w-3.5 text-rose-400" aria-hidden />;
  }
  return <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden />;
}

function SessionLine({
  line,
  visible,
  running,
}: {
  line: Line;
  visible: boolean;
  running: boolean;
}) {
  const reveal = `transition-all duration-300 ${
    visible ? "opacity-100 translate-y-0" : "invisible opacity-0 translate-y-1"
  }`;

  if (line.kind === "call") {
    return (
      <li className={`grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-3 ${reveal}`}>
        <span className="flex h-[1.625em] items-center">
          <CallStatus running={running} failed={line.failed} />
        </span>
        <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4">
          <span className="text-slate-100">
            {line.tool}
            {line.arg && <span className="text-slate-500">({line.arg})</span>}
          </span>
          <span
            className={`transition-opacity duration-200 ${
              running ? "opacity-0" : "opacity-100"
            } ${line.failed ? "text-rose-300" : "text-slate-400"}`}
          >
            {line.result}
          </span>
        </span>
      </li>
    );
  }

  if (line.kind === "note") {
    return (
      <li className={`border-l-2 border-blue-400/60 py-0.5 pl-4 text-slate-300 ${reveal}`}>
        {line.text}
      </li>
    );
  }

  if (line.kind === "output") {
    return (
      <li className={`flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 ${reveal}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/smartwatch-800.webp"
          alt="The finished frame: the Aurora Trail watch on a grey backdrop"
          width={800}
          height={600}
          decoding="async"
          className="no-desaturate h-14 w-auto rounded-md object-cover sm:h-16"
        />
        <span className="min-w-0">
          <span className="block truncate text-slate-100">aurora-launch.mp4</span>
          <span className="block text-slate-500">saved to assets/</span>
        </span>
      </li>
    );
  }

  return <li className={`text-slate-200 ${reveal}`}>{line.text}</li>;
}

export default function AgentRunHero() {
  const reducedMotion = usePrefersReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>(START);
  const [inView, setInView] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      setInView(entries.some((entry) => entry.isIntersecting));
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setPhase(FINAL);
      return;
    }
    if (!inView || paused) return;
    const [upcoming, delay] = next(phase);
    const timer = window.setTimeout(() => setPhase(upcoming), delay);
    return () => window.clearTimeout(timer);
  }, [phase, inView, paused, reducedMotion]);

  const typing = phase.typed < PROMPT.length;

  return (
    <figure className="m-0">
      <div
        ref={frameRef}
        className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950 shadow-2xl shadow-black/60 ring-1 ring-white/5"
      >
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <span aria-hidden className="h-3 w-3 rounded-full bg-slate-700" />
          <span aria-hidden className="h-3 w-3 rounded-full bg-slate-700" />
          <span aria-hidden className="h-3 w-3 rounded-full bg-slate-700" />
          <span className="ml-3 font-jetbrains text-xs text-slate-500">
            ~/aurora-launch
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-jetbrains text-[11px] text-emerald-300">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            nodetool mcp
          </span>
          {!reducedMotion && (
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              aria-label={paused ? "Play the session" : "Pause the session"}
              className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus-ring"
            >
              {paused ? (
                <Play className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Pause className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
          )}
        </div>

        <div className="p-5 font-jetbrains text-[13px] leading-relaxed sm:p-6">
          <p className="text-slate-100">
            <span className="sr-only">{PROMPT}</span>
            <span className="select-none text-blue-300" aria-hidden>&gt; </span>
            <span aria-hidden>{PROMPT.slice(0, phase.typed)}</span>
            {typing && (
              <span
                aria-hidden
                className="inline-block h-4 w-2 translate-y-0.5 bg-blue-300/80"
              />
            )}
            <span className="text-transparent" aria-hidden>
              {PROMPT.slice(phase.typed)}
            </span>
          </p>

          <ol className="mt-5 space-y-2.5" aria-label="Agent tool calls">
            {LINES.map((line, index) => (
              <SessionLine
                key={index}
                line={line}
                visible={index < phase.shown}
                running={phase.running && index === phase.shown - 1}
              />
            ))}
          </ol>
        </div>
      </div>
      <figcaption className="px-2 pt-4 text-sm leading-relaxed text-slate-400">
        An illustrative session. The tool names are the ones the NodeTool MCP
        server gives your agent.
      </figcaption>
    </figure>
  );
}
