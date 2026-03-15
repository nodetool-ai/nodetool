"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

// ── Types ──────────────────────────────────────────────────────────────────

interface RunResult {
  status: "completed" | "failed" | "cancelled";
  outputs: Record<string, unknown[]>;
  error?: string;
}

type WorkflowId = "support-triage" | "content-summarizer";

// ── Helper to call the API route ───────────────────────────────────────────

async function runWorkflow(
  workflow: WorkflowId,
  params: Record<string, unknown>
): Promise<RunResult> {
  const res = await fetch("/api/run-workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workflow, params }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error ?? "Unknown error");
  }
  return res.json() as Promise<RunResult>;
}

// ── Priority styling ────────────────────────────────────────────────────────

const PRIORITY_CLASSES: Record<string, { text: string; bg: string; border: string; glow: string }> = {
  Critical: { text: "text-red-400", bg: "bg-red-950/80", border: "border-red-500/60", glow: "shadow-[0_0_15px_-3px_rgba(239,68,68,0.2)]" },
  High:     { text: "text-orange-400", bg: "bg-orange-950/80", border: "border-orange-500/60", glow: "shadow-[0_0_15px_-3px_rgba(249,115,22,0.2)]" },
  Medium:   { text: "text-yellow-400", bg: "bg-yellow-950/80", border: "border-yellow-500/60", glow: "shadow-[0_0_15px_-3px_rgba(234,179,8,0.2)]" },
  Low:      { text: "text-green-400", bg: "bg-green-950/80", border: "border-green-500/60", glow: "shadow-[0_0_15px_-3px_rgba(34,197,94,0.2)]" },
};

const CATEGORY_ICON: Record<string, string> = {
  Billing: "💳",
  Technical: "🔧",
  "Feature Request": "✨",
  Bug: "🐛",
  "General Inquiry": "💬",
};

// ── Sample tickets ─────────────────────────────────────────────────────────

const TRIAGE_SAMPLES = [
  {
    label: "Billing issue",
    text: "I was charged twice for my subscription this month. Please refund the duplicate payment ASAP — my account shows two charges of $29 on March 3rd.",
  },
  {
    label: "Critical outage",
    text: "Our entire production environment is down. The API is returning 503 errors for all requests. We are losing customers right now. This needs to be fixed immediately!",
  },
  {
    label: "Feature request",
    text: "It would be great if the dashboard had a dark mode. Many of our team members work late and the bright white screen is really uncomfortable.",
  },
  {
    label: "Bug report",
    text: "The export to CSV button doesn't work on Firefox 120. Clicking it does nothing — no download, no error message. Works fine on Chrome.",
  },
];

// ── Step indicator ─────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

const STEPS = [
  { num: 1 as Step, label: "Input" },
  { num: 2 as Step, label: "Analyze" },
  { num: 3 as Step, label: "Result" },
];

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((s, i) => {
        const isActive = s.num === current;
        const isDone = s.num < current;
        return (
          <div key={s.num} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                  isActive
                    ? "bg-indigo-500 text-white shadow-[0_0_20px_-3px_rgba(99,102,241,0.5)]"
                    : isDone
                    ? "bg-green-500/20 text-green-400 border border-green-500/50"
                    : "bg-muted text-slate-500 border border-border"
                }`}
              >
                {isDone ? "✓" : s.num}
              </div>
              <span
                className={`text-[0.65rem] font-semibold uppercase tracking-wider ${
                  isActive ? "text-indigo-300" : isDone ? "text-green-400" : "text-slate-600"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-16 h-px mx-3 mb-5 transition-colors duration-300 ${
                  isDone ? "bg-green-500/50" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────

export default function Home() {
  const [step, setStep] = useState<Step>(1);
  const [text, setText] = useState(TRIAGE_SAMPLES[0].text);
  const [category, setCategory] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    setStep(2);
    setLoading(true);
    setCategory(null);
    setPriority(null);
    setError(null);
    try {
      const res = await runWorkflow("support-triage", { text });
      if (res.status === "completed") {
        setCategory(String(res.outputs["category"]?.[0] ?? "Unknown"));
        setPriority(String(res.outputs["priority"]?.[0] ?? "Unknown"));
        setStep(3);
      } else {
        setError(res.error ?? "Workflow failed");
        setStep(1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setCategory(null);
    setPriority(null);
    setError(null);
  };

  const priClasses = priority
    ? (PRIORITY_CLASSES[priority] ?? PRIORITY_CLASSES["Low"])
    : null;

  return (
    <main className="mx-auto max-w-[640px] px-6 pb-16 pt-8 min-h-screen flex flex-col">
      {/* Header */}
      <header className="relative overflow-hidden text-center pt-10 pb-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.12),transparent_70%)]" />
        <div className="relative">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <span className="text-3xl">🎫</span>
            <h1 className="text-2xl font-bold tracking-tight">
              Support Triage
            </h1>
          </div>
          <p className="text-slate-500 text-sm">
            AI-powered ticket classification using{" "}
            <code className="rounded border border-border bg-muted px-1 py-0.5 text-xs text-indigo-300">
              @nodetool/kernel
            </code>
          </p>
        </div>
      </header>

      {/* Step indicator */}
      <div className="mb-6">
        <StepIndicator current={step} />
      </div>

      {/* Step content */}
      <div className="flex-1" data-testid="support-triage-demo">
        {/* ── Step 1: Input ──────────────────────────────────── */}
        {step === 1 && (
          <Card className="overflow-hidden transition-all duration-300 border-border/60">
            <CardHeader className="relative pb-4">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
              <CardTitle className="text-base font-semibold">
                Paste a customer message
              </CardTitle>
              <CardDescription className="text-sm">
                Choose a sample below or write your own. The AI will classify its
                category and priority.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-5">
              {/* Sample chips */}
              <div className="flex flex-wrap gap-2">
                {TRIAGE_SAMPLES.map((s) => (
                  <Badge
                    key={s.label}
                    variant="outline"
                    className={`cursor-pointer transition-all hover:bg-indigo-500/5 hover:border-indigo-500 hover:text-slate-200 ${
                      text === s.text
                        ? "bg-indigo-500/10 border-indigo-400 text-indigo-200 shadow-[0_0_8px_-2px_rgba(99,102,241,0.3)]"
                        : "text-slate-400"
                    }`}
                    onClick={() => setText(s.text)}
                  >
                    {s.label}
                  </Badge>
                ))}
              </div>

              {/* Textarea */}
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                data-testid="triage-text-input"
                rows={5}
                placeholder="Paste a support message…"
                className="resize-y focus:border-indigo-500/50 focus:shadow-[0_0_12px_-4px_rgba(99,102,241,0.2)]"
              />

              {/* Error from previous attempt */}
              {error !== null && (
                <Alert variant="destructive" data-testid="triage-error">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Next button */}
              <Button
                className="w-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-semibold shadow-[0_0_20px_-4px_rgba(99,102,241,0.4)] hover:opacity-90 hover:-translate-y-px hover:shadow-[0_0_25px_-4px_rgba(99,102,241,0.5)] transition-all"
                onClick={handleAnalyze}
                disabled={!text.trim()}
                data-testid="run-support-triage"
                size="lg"
              >
                Analyze with AI →
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Analyzing ─────────────────────────────── */}
        {step === 2 && loading && (
          <Card className="overflow-hidden border-indigo-500/30 shadow-[0_0_40px_-8px_rgba(99,102,241,0.2)]">
            <CardContent className="py-16 flex flex-col items-center gap-6">
              {/* Spinner */}
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 animate-spin" />
                <div className="absolute inset-3 rounded-full border-2 border-transparent border-t-violet-500 animate-spin [animation-direction:reverse] [animation-duration:1.5s]" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-slate-200 mb-1">
                  Analyzing ticket...
                </p>
                <p className="text-sm text-slate-500">
                  Running two classifiers in parallel via{" "}
                  <code className="text-indigo-300 text-xs">gpt-5-mini</code>
                </p>
              </div>

              {/* Workflow visualization */}
              <div className="w-full mt-2 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-black/20 backdrop-blur-sm px-4 py-3 text-xs">
                <span className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 font-mono text-slate-400 whitespace-nowrap">
                  Message
                </span>
                <span className="text-slate-500 text-sm">→</span>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-indigo-700 bg-indigo-950 px-2.5 py-1 font-mono text-indigo-300 whitespace-nowrap animate-pulse">
                      Classifier (Category)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md border border-indigo-700 bg-indigo-950 px-2.5 py-1 font-mono text-indigo-300 whitespace-nowrap animate-pulse [animation-delay:300ms]">
                      Classifier (Priority)
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Results ───────────────────────────────── */}
        {step === 3 && category !== null && priority !== null && (
          <div className="flex flex-col gap-5" data-testid="support-triage-result">
            {/* Results card */}
            <Card className="overflow-hidden border-green-500/20 shadow-[0_0_30px_-8px_rgba(34,197,94,0.1)]">
              <CardHeader className="relative pb-3">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green-500/50 to-transparent" />
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Classification Complete
                </CardTitle>
              </CardHeader>

              <CardContent className="flex flex-col gap-4">
                {/* Category result */}
                <div className="rounded-xl border border-green-500/40 bg-green-950/60 px-5 py-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">
                      {CATEGORY_ICON[category] ?? "📋"}
                    </span>
                    <div className="flex-1">
                      <span className="block text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                        Category
                      </span>
                      <span
                        className="block text-xl font-bold text-green-400"
                        data-testid="triage-category"
                      >
                        {category}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Priority result */}
                {priClasses && (
                  <div className={`rounded-xl border px-5 py-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] ${priClasses.bg} ${priClasses.border} ${priClasses.glow}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">⚡</span>
                      <div className="flex-1">
                        <span className="block text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                          Priority
                        </span>
                        <span
                          className={`block text-xl font-bold ${priClasses.text}`}
                          data-testid="triage-priority"
                        >
                          {priority}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Original message preview */}
                <div className="rounded-lg border border-border bg-black/20 px-4 py-3">
                  <span className="block text-[0.65rem] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Original message
                  </span>
                  <p className="text-sm text-slate-400 leading-relaxed line-clamp-3">
                    {text}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleReset}
                size="lg"
              >
                ← Triage another
              </Button>
              <Button
                className="flex-1 bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-semibold shadow-[0_0_20px_-4px_rgba(99,102,241,0.4)] hover:opacity-90 transition-all"
                onClick={() => {
                  setText("");
                  handleReset();
                }}
                size="lg"
              >
                New ticket
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="text-center mt-12 pt-6 border-t border-border/30 text-xs text-slate-600">
        <p>
          Powered by{" "}
          <a
            href="https://github.com/nodetool-ai/nodetool"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-500 underline underline-offset-2"
          >
            NodeTool
          </a>
          {" · "}
          <code className="text-slate-500">@nodetool/kernel</code>
          {" · "}
          <code className="text-slate-500">gpt-5-mini</code>
        </p>
      </footer>
    </main>
  );
}
