/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  ONBOARDING_STEP_ORDER,
  useOnboardingStore,
  type OnboardingStepId
} from "../../stores/OnboardingStore";
import {
  ONBOARDING_STEPS,
  resolveActiveVariant,
  type OnboardingStepDefinition,
  type VariantContext
} from "./steps";
import OnboardingHint from "./OnboardingHint";
import OnboardingTargetHighlight from "./OnboardingTargetHighlight";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useWorkflowManagerStore } from "../../contexts/WorkflowManagerContext";
import type { WorkflowManagerState } from "../../stores/WorkflowManagerStore";

/**
 * Ambient onboarding hints. Each hint stands alone — no step counter, no
 * tour chrome — and floats next to its anchor element until that step is
 * completed (via useOnboardingDetectors) or the user dismisses it. Picks
 * the first incomplete step (canonical order) whose target is currently
 * rendered in the DOM. MutationObserver keeps the anchor in sync as the
 * user navigates.
 *
 * Each step may declare `variants` — sub-beats that swap the anchor and
 * copy based on live state (e.g. NodeMenu open vs closed). Variants are
 * resolved here so steps.tsx stays declarative.
 */

interface ResolvedTarget {
  stepId: OnboardingStepId;
  el: HTMLElement;
  /** Effective target selector after variant resolution. */
  selector: string;
}

/**
 * Given the list of incomplete steps and a way to resolve each step's
 * effective target selector, walk the list in order and return the first
 * step whose selector resolves to a live element.
 */
const useFirstVisibleStep = (
  candidates: OnboardingStepId[],
  resolveSelector: (id: OnboardingStepId) => string | undefined,
  /** Bumped when variant context changes, so the effect re-syncs. */
  resolverVersion: number
): ResolvedTarget | null => {
  const [resolved, setResolved] = useState<ResolvedTarget | null>(null);

  useEffect(() => {
    const sync = (): void => {
      for (const id of candidates) {
        const selector = resolveSelector(id);
        if (!selector) continue;
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el) {
          setResolved((prev) =>
            prev?.stepId === id && prev.el === el && prev.selector === selector
              ? prev
              : { stepId: id, el, selector }
          );
          return;
        }
      }
      setResolved((prev) => (prev === null ? prev : null));
    };
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [candidates, resolveSelector, resolverVersion]);

  return resolved;
};

interface NodeStats {
  maxNodeCount: number;
  hasStringNode: boolean;
  hasAgentNode: boolean;
}

const STRING_NODE_TYPE = "nodetool.constant.String";
const AGENT_NODE_TYPE = "nodetool.agents.Agent";

/**
 * Subscribe to node stats across any open workflow. Drives the `connect`
 * step's variant switch — we need to know not just node counts but whether
 * the specific String + Agent nodes are present before showing the
 * "Connect String → Agent" hint.
 */
const useNodeStats = (): NodeStats => {
  const managerStore = useWorkflowManagerStore();
  const [stats, setStats] = useState<NodeStats>({
    maxNodeCount: 0,
    hasStringNode: false,
    hasAgentNode: false
  });

  useEffect(() => {
    interface NodeLike {
      type?: string;
    }
    interface NodeStoreLike {
      getState: () => { nodes?: NodeLike[] };
      subscribe: (l: () => void) => () => void;
    }

    const subs = new Map<string, () => void>();

    const recompute = (): void => {
      const stores = (managerStore.getState().nodeStores ?? {}) as Record<
        string,
        NodeStoreLike
      >;
      let max = 0;
      let hasString = false;
      let hasAgent = false;
      for (const ns of Object.values(stores)) {
        const nodes = ns.getState().nodes ?? [];
        if (nodes.length > max) max = nodes.length;
        for (const n of nodes) {
          if (n?.type === STRING_NODE_TYPE) hasString = true;
          else if (n?.type === AGENT_NODE_TYPE) hasAgent = true;
        }
      }
      setStats((prev) =>
        prev.maxNodeCount === max &&
        prev.hasStringNode === hasString &&
        prev.hasAgentNode === hasAgent
          ? prev
          : { maxNodeCount: max, hasStringNode: hasString, hasAgentNode: hasAgent }
      );
    };

    const reconcile = (state: WorkflowManagerState): void => {
      const stores = (state.nodeStores ?? {}) as Record<string, NodeStoreLike>;
      for (const [id, ns] of Object.entries(stores)) {
        if (subs.has(id) || !ns) continue;
        subs.set(id, ns.subscribe(recompute));
      }
      for (const id of Array.from(subs.keys())) {
        if (!stores[id]) {
          subs.get(id)?.();
          subs.delete(id);
        }
      }
      recompute();
    };

    reconcile(managerStore.getState());
    const unsubMgr = managerStore.subscribe(reconcile);

    return () => {
      unsubMgr();
      for (const u of subs.values()) u();
      subs.clear();
    };
  }, [managerStore]);

  return stats;
};

const OnboardingOverlay: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const completed = useOnboardingStore((s) => s.completed);
  const dismissed = useOnboardingStore((s) => s.dismissed);
  const markComplete = useOnboardingStore((s) => s.markComplete);

  const isNodeMenuOpen = useNodeMenuStore((s) => s.isMenuOpen);
  const { maxNodeCount, hasStringNode, hasAgentNode } = useNodeStats();

  const onWelcomePage = pathname === "/welcome";

  const incompleteSteps = useMemo(
    () => ONBOARDING_STEP_ORDER.filter((id) => !completed[id]),
    [completed]
  );

  const ctx: VariantContext = useMemo(
    () => ({ isNodeMenuOpen, maxNodeCount, hasStringNode, hasAgentNode }),
    [isNodeMenuOpen, maxNodeCount, hasStringNode, hasAgentNode]
  );

  const resolveSelector = useCallback(
    (id: OnboardingStepId): string | undefined => {
      const step = ONBOARDING_STEPS[id];
      const variant = resolveActiveVariant(step, ctx);
      return variant?.targetSelector ?? step.targetSelector;
    },
    [ctx]
  );

  // The version key forces the visibility effect to re-run when ctx changes
  // even though `resolveSelector` would re-create on its own — using a
  // numeric key keeps the effect dependency list stable in shape.
  const resolverVersion = useMemo(
    () =>
      Number(isNodeMenuOpen) +
      maxNodeCount * 2 +
      (hasStringNode ? 1024 : 0) +
      (hasAgentNode ? 2048 : 0),
    [isNodeMenuOpen, maxNodeCount, hasStringNode, hasAgentNode]
  );

  const visible = useFirstVisibleStep(
    incompleteSteps,
    resolveSelector,
    resolverVersion
  );

  const step: OnboardingStepDefinition | null = visible
    ? ONBOARDING_STEPS[visible.stepId]
    : null;
  const variant = step ? resolveActiveVariant(step, ctx) : null;

  /** The hint props with variant overrides applied. */
  const effectiveStep = useMemo<OnboardingStepDefinition | null>(() => {
    if (!step) return null;
    if (!variant) return step;
    return {
      ...step,
      hintTitle: variant.hintTitle,
      hintBody: variant.hintBody,
      targetSelector: variant.targetSelector,
      hintPlacement: variant.hintPlacement ?? step.hintPlacement
    };
  }, [step, variant]);

  const handleDismiss = useCallback(() => {
    if (visible) markComplete(visible.stepId);
  }, [visible, markComplete]);

  const handleOpenSettings = useCallback(() => {
    if (effectiveStep?.settingsTab !== undefined) {
      navigate(`/settings?tab=${effectiveStep.settingsTab}`);
    }
  }, [effectiveStep?.settingsTab, navigate]);

  const handleOpenModels = useCallback(() => {
    if (effectiveStep?.modelsRoute) navigate(effectiveStep.modelsRoute);
  }, [effectiveStep?.modelsRoute, navigate]);

  if (dismissed || onWelcomePage || !visible || !effectiveStep) return null;

  return createPortal(
    <>
      <OnboardingTargetHighlight
        target={visible.el}
        accent={effectiveStep.accent}
      />
      <OnboardingHint
        step={effectiveStep}
        target={visible.el}
        onDismiss={handleDismiss}
        onOpenSettings={handleOpenSettings}
        onOpenModels={handleOpenModels}
      />
    </>,
    document.body
  );
};

export default memo(OnboardingOverlay);
