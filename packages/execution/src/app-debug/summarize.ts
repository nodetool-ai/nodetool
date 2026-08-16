/**
 * `AppDebugReport` → what fits in a chat turn.
 *
 * The full report carries every message, every run, and the whole widget spec —
 * bundle-sized, written to disk by the CLI harness. An agent asking "is this app
 * wired right?" needs the verdict, what each widget ended up showing, how each
 * invocation went, and what a headless run could not answer. This reducer is
 * the one place that decides that, so every surface returning a summary — the
 * `POST /api/applications/debug` route, the `debug_app` tool, the frontend
 * `ui_app_debug` tool — returns the same shape.
 */
import type { AppDebugReport } from "./types.js";

/** One widget's end state, as a reader needs it. */
export interface AppWidgetSummary {
  id: string;
  type: string;
  binding: string | null;
  /** True when the widget shows something once the simulation settled. */
  hasValue: boolean;
  visible: boolean;
  disabled: boolean;
  /** The rendered `format` template, when the widget has one. */
  display?: string;
}

/** One invocation's outcome. */
export interface AppInvocationSummary {
  id: string;
  operationId: string;
  status: string;
  decision: string;
  error?: string;
  /** The timeout that elapsed, when the harness stopped waiting. */
  timedOutMs?: number;
}

export interface AppDebugSummary {
  target: { ref: string; source: string; workflowId: string | null };
  app: { title: string | null; widgetCount: number } | null;
  verdict: {
    ok: boolean;
    headline: string;
    issues: string[];
    warnings: string[];
  };
  widgets: AppWidgetSummary[];
  invocations: AppInvocationSummary[];
  /** Final reactive values, already preview-truncated by the simulator. */
  values: Record<string, unknown>;
  /** Interaction steps that failed, with the reason. */
  interactionErrors: Array<{ step: string; error: string }>;
  /** What a headless run cannot answer. */
  notSimulated: string[];
}

export function summarizeAppReport(report: AppDebugReport): AppDebugSummary {
  // The verdict folds in the static check's errors but not its warnings — an
  // unbound output or a local-only input would otherwise be dropped here, and
  // they are exactly what a static check is for.
  const warnings = [
    ...new Set([
      ...(report.verdict.warnings ?? []),
      ...report.validation.warnings
    ])
  ];
  return {
    target: {
      ref: report.target.ref,
      source: report.target.source,
      workflowId: report.target.workflowId
    },
    app: report.app
      ? { title: report.app.title, widgetCount: report.app.widgetCount }
      : null,
    verdict: {
      ok: report.verdict.ok,
      headline: report.verdict.headline,
      issues: report.verdict.issues,
      warnings
    },
    widgets: report.widgets.map((widget) => {
      type SummaryFields = {
        id: string;
        type: string;
        binding: string | null;
        hasValue: boolean;
        visible: boolean;
        disabled: boolean;
        display?: string;
      };
      const summary: SummaryFields = {
        id: widget.id,
        type: widget.type,
        binding: widget.binding,
        hasValue: widget.hasValue,
        visible: widget.visible,
        disabled: widget.disabled
      };
      if (widget.display != null) {
        summary.display = widget.display;
      }
      return summary;
    }),
    invocations: report.invocations.map((invocation) => {
      type SummaryFields2 = {
        id: string;
        operationId: string;
        status: typeof invocation.status;
        decision: typeof invocation.decision;
        error?: string;
        timedOutMs?: number;
      };
      const summary: SummaryFields2 = {
        id: invocation.id,
        operationId: invocation.operationId,
        status: invocation.status,
        decision: invocation.decision
      };
      if (invocation.error) {
        summary.error = invocation.error;
      }
      if (invocation.timedOutMs != null) {
        summary.timedOutMs = invocation.timedOutMs;
      }
      return summary;
    }),
    values: report.values,
    interactionErrors: report.interactions
      .filter((interaction) => interaction.error !== null)
      .map((interaction) => ({
        step: interaction.step,
        error: interaction.error as string
      })),
    notSimulated: report.notSimulated
  };
}
