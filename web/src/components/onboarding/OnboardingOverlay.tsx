/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  ONBOARDING_STEP_ORDER,
  useOnboardingStore
} from "../../stores/OnboardingStore";
import { useWorkflowManagerStore } from "../../contexts/WorkflowManagerContext";
import type { WorkflowManagerState } from "../../stores/WorkflowManagerStore";
import { ONBOARDING_STEPS } from "./steps";
import OnboardingScreen from "./OnboardingScreen";
import OnboardingHint from "./OnboardingHint";
import OnboardingSpotlight from "./OnboardingSpotlight";

const EDITOR_ROUTE_PREFIX = "/editor/";

/**
 * Resolves a workflow id we can route to for the editor-based steps.
 * Mirrors NavigateToStart's logic: prefer the current/open workflow,
 * otherwise create a fresh one.
 */
const resolveEditorRoute = async (
  manager: WorkflowManagerState
): Promise<string> => {
  const stored = localStorage.getItem("currentWorkflowId");
  if (stored) return `${EDITOR_ROUTE_PREFIX}${stored}`;

  try {
    const open = JSON.parse(
      localStorage.getItem("openWorkflows") ?? "[]"
    ) as string[];
    if (open.length > 0) return `${EDITOR_ROUTE_PREFIX}${open[0]}`;
  } catch {
    // fall through and create a new workflow
  }

  const wf = await manager.createNew();
  return `${EDITOR_ROUTE_PREFIX}${wf.id}`;
};

/**
 * Find the element matching `selector` and update if it appears, disappears,
 * or is replaced. Event-driven: a MutationObserver watches the document for
 * subtree mutations rather than polling on a timer. The target may not be
 * mounted yet right after navigation, so we re-query on every mutation.
 */
const useTargetElement = (selector: string | undefined): HTMLElement | null => {
  const [el, setEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!selector) {
      setEl(null);
      return;
    }

    let current: HTMLElement | null = null;
    const sync = (): void => {
      const found = document.querySelector(selector) as HTMLElement | null;
      if (found !== current) {
        current = found;
        setEl(found);
      }
    };
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    return () => observer.disconnect();
  }, [selector]);

  return el;
};

const OnboardingOverlay: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const managerStore = useWorkflowManagerStore();

  const active = useOnboardingStore((s) => s.active);
  const phase = useOnboardingStore((s) => s.phase);
  const currentIdx = useOnboardingStore((s) => s.currentStep);
  const completed = useOnboardingStore((s) => s.completed);
  const beginAction = useOnboardingStore((s) => s.beginAction);
  const next = useOnboardingStore((s) => s.next);
  const prev = useOnboardingStore((s) => s.prev);
  const skip = useOnboardingStore((s) => s.skip);
  const finish = useOnboardingStore((s) => s.finish);

  const stepId = ONBOARDING_STEP_ORDER[currentIdx];
  const step = ONBOARDING_STEPS[stepId];
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === ONBOARDING_STEP_ORDER.length - 1;

  const routedRef = useRef<string | null>(null);

  const navigateForStep = useCallback(async () => {
    if (!step.route) return;
    const target = step.route;

    // Editor route resolves to a real workflow id.
    if (target === "/editor") {
      try {
        const path = await resolveEditorRoute(managerStore.getState());
        if (location.pathname !== path) navigate(path);
      } catch {
        // If we can't create a workflow we just stay where we are; the
        // user can navigate manually and the hint still shows.
      }
      return;
    }

    if (location.pathname !== target) navigate(target);
  }, [step.route, location.pathname, navigate, managerStore]);

  // When entering the action phase for a new step, route the user to
  // the right surface. We track stepId so this fires once per step.
  useEffect(() => {
    if (!active || phase !== "action") return;
    const key = `${stepId}:action`;
    if (routedRef.current === key) return;
    routedRef.current = key;
    void navigateForStep();
  }, [active, phase, stepId, navigateForStep]);

  // Reset the routing guard when the user goes back to an intro screen.
  useEffect(() => {
    if (phase === "intro") routedRef.current = null;
  }, [phase, currentIdx]);

  const target = useTargetElement(
    phase === "action" ? step.targetSelector : undefined
  );

  const handlePrimary = useCallback(() => {
    // Intro → enter action phase (which will navigate)
    beginAction();
  }, [beginAction]);

  const handleContinue = useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    next();
  }, [isLast, finish, next]);

  const handleJump = useCallback(
    (idx: number) => {
      // Restart at the chosen step's intro screen.
      useOnboardingStore.setState({ currentStep: idx, phase: "intro" });
    },
    []
  );

  const overlayDom = useMemo(() => {
    if (!active) return null;

    if (phase === "intro") {
      return (
        <OnboardingScreen
          step={step}
          index={currentIdx}
          total={ONBOARDING_STEP_ORDER.length}
          completed={completed}
          isFirst={isFirst}
          isLast={isLast}
          onPrimary={handlePrimary}
          onPrev={prev}
          onSkip={skip}
          onJump={handleJump}
        />
      );
    }

    return (
      <>
        <OnboardingSpotlight target={target} />
        <OnboardingHint
          step={step}
          target={target}
          isCompleted={completed[step.id]}
          onSkipStep={handleContinue}
          onContinue={handleContinue}
          onClose={skip}
        />
      </>
    );
  }, [
    active,
    phase,
    step,
    currentIdx,
    completed,
    isFirst,
    isLast,
    handlePrimary,
    prev,
    skip,
    handleJump,
    target,
    handleContinue
  ]);

  if (!overlayDom) return null;
  return createPortal(overlayDom, document.body);
};

export default memo(OnboardingOverlay);
