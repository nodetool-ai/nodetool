/**
 * One operation's run as a vertical stepper. Each step is bound to a node of
 * the operation's graph and shows the status and progress the run reports for
 * that node. Without configured steps, the widget lists the graph's
 * generative nodes in dependency order.
 */
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { keyframes } from "@emotion/react";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import PriorityHighRoundedIcon from "@mui/icons-material/PriorityHighRounded";
import type { Theme } from "@mui/material/styles";
import {
  isOperationRunning,
  operationNodeRuns,
  operationProgress,
  type NodeRunState
} from "@nodetool-ai/app-runtime";

import {
  Box,
  Caption,
  FlexColumn,
  FlexRow,
  Label,
  Text,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  reducedMotion
} from "../../ui_primitives";
import type { Workflow } from "../../../stores/ApiTypes";
import useMetadataStore from "../../../stores/MetadataStore";
import { isHeavyNode } from "../../../utils/heavyNodes";
import {
  useAppRuntimeContext,
  useRuntimeSelector
} from "../runtime/AppRuntimeContext";

type Graph = NonNullable<Workflow["graph"]>;
type GetMetadata = ReturnType<typeof useMetadataStore.getState>["getMetadata"];

export interface WorkflowStep {
  id: string;
  title: string;
  description?: string;
}

/** A step as the widget's `steps` prop stores it. */
export interface WorkflowStepConfig {
  nodeId?: string;
  title?: string;
  description?: string;
}

export type StepState = "pending" | "running" | "done" | "failed";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The nodes of a graph in dependency order. A cycle keeps its nodes last. */
const orderedNodes = (graph: Graph | undefined): Graph["nodes"] => {
  const nodes = graph?.nodes ?? [];
  const pending = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  const next = new Map<string, string[]>();
  for (const edge of graph?.edges ?? []) {
    if (!pending.has(edge.source) || !pending.has(edge.target)) continue;
    pending.set(edge.target, (pending.get(edge.target) ?? 0) + 1);
    next.set(edge.source, [...(next.get(edge.source) ?? []), edge.target]);
  }
  const queue = nodes.filter((node) => pending.get(node.id) === 0);
  const ordered: typeof nodes = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index];
    ordered.push(node);
    for (const target of next.get(node.id) ?? []) {
      const left = (pending.get(target) ?? 0) - 1;
      pending.set(target, left);
      const targetNode = byId.get(target);
      if (left === 0 && targetNode) queue.push(targetNode);
    }
  }
  const seen = new Set(ordered.map((node) => node.id));
  ordered.push(...nodes.filter((node) => !seen.has(node.id)));
  return ordered;
};

const nodeTitle = (node: Graph["nodes"][number], getMetadata: GetMetadata): string => {
  const ui = isRecord(node.ui_properties) ? node.ui_properties : {};
  const data = isRecord(node.data) ? node.data : {};
  const custom = [ui.title, data.title].find(
    (value): value is string => typeof value === "string" && value !== ""
  );
  return custom ?? getMetadata(node.type)?.title ?? node.id;
};

/**
 * The generative nodes of a graph in dependency order. A node counts when its
 * metadata marks it as a provider or model node, or it declares a model
 * property such as `language_model`.
 */
export const generativeSteps = (
  graph: Graph | undefined,
  getMetadata: GetMetadata
): WorkflowStep[] =>
  orderedNodes(graph).flatMap((node) => {
    const metadata = getMetadata(node.type);
    const hasModel = metadata?.properties?.some((property) =>
      property.type?.type?.endsWith("_model")
    );
    if (!isHeavyNode(metadata) && !hasModel) return [];
    return [{ id: node.id, title: nodeTitle(node, getMetadata) }];
  });

/**
 * The configured steps, each bound to a node of the graph. A step whose node
 * is not in the graph is dropped. A step with no title takes the node's title.
 */
export const configuredSteps = (
  config: readonly WorkflowStepConfig[] | undefined,
  graph: Graph | undefined,
  getMetadata: GetMetadata
): WorkflowStep[] => {
  const byId = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  return (config ?? []).flatMap((step) => {
    const node = step.nodeId ? byId.get(step.nodeId) : undefined;
    if (!node) return [];
    const title = step.title?.trim() || nodeTitle(node, getMetadata);
    const description = step.description?.trim();
    return [description ? { id: node.id, title, description } : { id: node.id, title }];
  });
};

export const stepState = (run: NodeRunState | undefined): StepState => {
  if (!run) return "pending";
  if (run.error || run.status === "error" || run.status === "failed") return "failed";
  if (run.status === "completed") return "done";
  return "running";
};

const MARKER = (theme: Theme): string => theme.spacing(SPACING.xxl);
const RAIL = (theme: Theme): string => theme.spacing(SPACING.micro);

const spin = keyframes`
  to { transform: rotate(360deg); }
`;
const halo = keyframes`
  0% { transform: scale(1); opacity: 0.45; }
  100% { transform: scale(1.9); opacity: 0; }
`;
const pop = keyframes`
  0% { transform: scale(0.4); opacity: 0; }
  60% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
`;
const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;
const rise = keyframes`
  from { transform: translateY(4px); opacity: 0; }
  to { transform: none; opacity: 1; }
`;

const StepMarker: React.FC<{ state: StepState; index: number }> = ({ state, index }) => (
  <Box
    aria-hidden
    sx={(theme) => ({
      position: "relative",
      flexShrink: 0,
      width: MARKER(theme),
      height: MARKER(theme),
      borderRadius: BORDER_RADIUS.circle,
      display: "grid",
      placeItems: "center",
      ...theme.typography.caption,
      fontWeight: 600,
      transition: `${MOTION.background}, ${MOTION.border}, ${MOTION.shadow}`,
      border: "2px solid",
      borderColor:
        state === "done"
          ? "success.main"
          : state === "failed"
            ? "error.main"
            : state === "running"
              ? "primary.main"
              : "divider",
      bgcolor:
        state === "done" ? "success.main" : state === "failed" ? "error.main" : "background.paper",
      color:
        state === "done"
          ? "success.contrastText"
          : state === "failed"
            ? "error.contrastText"
            : state === "running"
              ? "primary.main"
              : "text.secondary",
      ...reducedMotion({ transition: MOTION.none })
    })}
  >
    {state === "running" ? (
      <>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            borderRadius: BORDER_RADIUS.circle,
            bgcolor: "primary.main",
            animation: `${halo} ${MOTION.pulse} infinite`,
            ...reducedMotion({ animation: "none", opacity: 0 })
          }}
        />
        <Box
          sx={(theme) => ({
            position: "absolute",
            inset: `calc(-1 * ${RAIL(theme)} - 2px)`,
            borderRadius: BORDER_RADIUS.circle,
            border: "2px solid transparent",
            borderTopColor: "primary.main",
            animation: `${spin} ${MOTION.spin} infinite`,
            ...reducedMotion({ animation: "none" })
          })}
        />
      </>
    ) : null}
    {state === "done" || state === "failed" ? (
      <Box
        component="span"
        sx={{
          display: "grid",
          placeItems: "center",
          animation: `${pop} ${MOTION.slow} both`,
          ...reducedMotion({ animation: "none" })
        }}
      >
        {state === "done" ? (
          <CheckRoundedIcon sx={{ fontSize: "inherit", transform: "scale(1.4)" }} />
        ) : (
          <PriorityHighRoundedIcon sx={{ fontSize: "inherit", transform: "scale(1.3)" }} />
        )}
      </Box>
    ) : (
      <Box component="span" sx={{ position: "relative" }}>
        {index + 1}
      </Box>
    )}
  </Box>
);

/** The line from one marker to the next. It fills once its step is done. */
const StepRail: React.FC<{ state: StepState }> = ({ state }) => (
  <Box
    aria-hidden
    sx={(theme) => ({
      position: "relative",
      flex: 1,
      width: RAIL(theme),
      minHeight: theme.spacing(SPACING.lg),
      my: SPACING.xs,
      borderRadius: BORDER_RADIUS.pill,
      bgcolor: "divider",
      overflow: "hidden"
    })}
  >
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        bgcolor: state === "failed" ? "error.main" : "success.main",
        transformOrigin: "top",
        transform: state === "done" || state === "failed" ? "scaleY(1)" : "scaleY(0)",
        transition: `transform ${MOTION.slow}`,
        ...reducedMotion({ transition: MOTION.none })
      }}
    />
  </Box>
);

const StepProgress: React.FC<{ value?: number }> = ({ value }) => {
  const known = value !== undefined && Number.isFinite(value);
  return (
    <Box
      sx={(theme) => ({
        position: "relative",
        height: RAIL(theme),
        borderRadius: BORDER_RADIUS.pill,
        bgcolor: "action.hover",
        overflow: "hidden"
      })}
    >
      <Box
        sx={(theme) => ({
          position: "absolute",
          inset: 0,
          borderRadius: BORDER_RADIUS.pill,
          transformOrigin: "left",
          transform: known ? `scaleX(${Math.min(1, Math.max(0, value))})` : "none",
          transition: `transform ${MOTION.slow}`,
          backgroundImage: known
            ? `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.light})`
            : `linear-gradient(90deg, transparent, ${theme.palette.primary.main}, transparent)`,
          backgroundSize: known ? "100% 100%" : "200% 100%",
          animation: known ? "none" : `${shimmer} ${MOTION.pulse} infinite linear`,
          ...reducedMotion({ transition: MOTION.none, animation: "none" })
        })}
      />
    </Box>
  );
};

const StepRow: React.FC<{
  step: WorkflowStep;
  index: number;
  last: boolean;
  run?: NodeRunState;
}> = ({ step, index, last, run }) => {
  const { t } = useTranslation();
  const state = stepState(run);
  const status =
    state === "done"
      ? t("workflowSteps.done")
      : state === "failed"
        ? t("workflowSteps.failed")
        : state === "running"
          ? run?.progress !== undefined
            ? `${Math.round(run.progress * 100)}%`
            : t("workflowSteps.running")
          : t("workflowSteps.waiting");
  return (
    <FlexRow
      component="li"
      gap={SPACING.lg}
      align="stretch"
      fullWidth
      data-state={state}
      sx={{
        listStyle: "none",
        animation: `${rise} ${MOTION.slow} both`,
        animationDelay: `${index * 60}ms`,
        ...reducedMotion({ animation: "none" })
      }}
    >
      <FlexColumn align="center" sx={{ flexShrink: 0 }}>
        <StepMarker state={state} index={index} />
        {last ? null : <StepRail state={state} />}
      </FlexColumn>
      <FlexColumn
        gap={SPACING.xs}
        sx={(theme) => ({
          minWidth: 0,
          flex: 1,
          pb: last ? 0 : SPACING.lg,
          minHeight: MARKER(theme)
        })}
      >
        <FlexRow align="center" gap={SPACING.md} fullWidth sx={(theme) => ({ minHeight: MARKER(theme) })}>
          <Text
            size="small"
            truncate
            sx={{
              minWidth: 0,
              flex: 1,
              fontWeight: state === "running" ? 600 : 500,
              color: state === "pending" ? "text.secondary" : "text.primary",
              transition: MOTION.all,
              ...reducedMotion({ transition: MOTION.none })
            }}
          >
            {step.title}
          </Text>
          <Caption
            component="span"
            sx={{
              flexShrink: 0,
              color:
                state === "done"
                  ? "success.main"
                  : state === "failed"
                    ? "error.main"
                    : state === "running"
                      ? "primary.main"
                      : "text.disabled"
            }}
          >
            {status}
          </Caption>
        </FlexRow>
        {step.description ? (
          <Caption component="span" sx={{ color: "text.secondary" }}>
            {step.description}
          </Caption>
        ) : null}
        {state === "running" ? <StepProgress value={run?.progress} /> : null}
        {run?.error ? (
          <Caption component="span" sx={{ color: "error.main" }}>
            {run.error}
          </Caption>
        ) : null}
      </FlexColumn>
    </FlexRow>
  );
};

export const WorkflowStepsWidget: React.FC<{
  id: string;
  label?: string;
  operationId?: string;
  steps?: WorkflowStepConfig[];
}> = ({ label, operationId, steps: config }) => {
  const { t } = useTranslation();
  const { getOperationGraph, scope } = useAppRuntimeContext();
  const target = operationId || scope.defaultOperationId;
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const graph = getOperationGraph(target);
  const steps = useMemo(() => {
    const chosen = configuredSteps(config, graph, getMetadata);
    return chosen.length > 0 ? chosen : generativeSteps(graph, getMetadata);
  }, [config, graph, getMetadata]);
  const runs = useRuntimeSelector((state) => operationNodeRuns(state, target));
  const running = useRuntimeSelector((state) => isOperationRunning(state, target));
  const overall = useRuntimeSelector((state) => operationProgress(state, target));
  if (steps.length === 0) {
    // A graph with no generative node still shows that it runs.
    if (!running) return null;
    return (
      <FlexColumn gap={SPACING.sm} fullWidth>
        {label ? <Label>{label}</Label> : null}
        <StepProgress value={overall} />
      </FlexColumn>
    );
  }

  const states = steps.map((step) => stepState(runs[step.id]));
  const done = states.filter((state) => state === "done").length;
  const started = states.some((state) => state !== "pending");
  const activeIndex = states.findIndex((state) => state === "running" || state === "failed");
  const current = activeIndex >= 0 ? activeIndex + 1 : Math.min(done + 1, steps.length);
  const activeProgress = runs[steps[activeIndex]?.id ?? ""]?.progress;
  const fraction =
    (done + (activeIndex >= 0 && activeProgress !== undefined ? activeProgress : 0)) / steps.length;
  const summary =
    done === steps.length
      ? t("workflowSteps.allDone", { total: steps.length })
      : t("workflowSteps.stepOf", { current, total: steps.length });

  return (
    <FlexColumn gap={SPACING.md} fullWidth>
      <FlexRow align="center" gap={SPACING.md} fullWidth>
        {label ? <Label sx={{ flex: 1, minWidth: 0 }}>{label}</Label> : <Box sx={{ flex: 1 }} />}
        {started ? (
          <Caption component="span" aria-live="polite">
            {summary}
          </Caption>
        ) : null}
      </FlexRow>
      {started ? (
        <Box
          role="progressbar"
          aria-label={t("workflowSteps.progressLabel")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          sx={(theme) => ({
            height: RAIL(theme),
            borderRadius: BORDER_RADIUS.pill,
            bgcolor: "action.hover",
            overflow: "hidden"
          })}
        >
          <Box
            sx={{
              height: "100%",
              borderRadius: BORDER_RADIUS.pill,
              bgcolor: states.includes("failed") ? "error.main" : "success.main",
              transformOrigin: "left",
              transform: `scaleX(${fraction})`,
              transition: `transform ${MOTION.slow}`,
              ...reducedMotion({ transition: MOTION.none })
            }}
          />
        </Box>
      ) : null}
      <Box component="ol" sx={{ m: 0, p: 0 }}>
        {steps.map((step, index) => (
          <StepRow
            key={`${step.id}-${index}`}
            step={step}
            index={index}
            last={index === steps.length - 1}
            run={runs[step.id]}
          />
        ))}
      </Box>
    </FlexColumn>
  );
};
