/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  ONBOARDING_STEP_ORDER,
  useOnboardingStore,
  type OnboardingStepId
} from "../../stores/OnboardingStore";
import { ONBOARDING_STEPS } from "./steps";
import OnboardingHint from "./OnboardingHint";
import OnboardingTargetHighlight from "./OnboardingTargetHighlight";
import { useSettingsStore } from "../../stores/SettingsStore";

/**
 * Ambient onboarding hints. Each hint stands alone — no step counter, no
 * tour chrome — and floats next to its anchor element until that step is
 * completed (via useOnboardingDetectors) or the user dismisses it. Picks
 * the first incomplete step (canonical order) whose target is currently
 * rendered in the DOM. MutationObserver keeps the anchor in sync as the
 * user navigates.
 */

interface ResolvedTarget {
  stepId: OnboardingStepId;
  el: HTMLElement;
}

const useFirstVisibleStep = (
  candidates: OnboardingStepId[]
): ResolvedTarget | null => {
  const [resolved, setResolved] = useState<ResolvedTarget | null>(null);

  useEffect(() => {
    const sync = (): void => {
      for (const id of candidates) {
        const selector = ONBOARDING_STEPS[id].targetSelector;
        if (!selector) continue;
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el) {
          setResolved((prev) =>
            prev?.stepId === id && prev.el === el ? prev : { stepId: id, el }
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
  }, [candidates]);

  return resolved;
};

const OnboardingOverlay: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const completed = useOnboardingStore((s) => s.completed);
  const dismissed = useOnboardingStore((s) => s.dismissed);
  const markComplete = useOnboardingStore((s) => s.markComplete);

  const onWelcomePage = pathname === "/welcome";

  const incompleteSteps = useMemo(
    () => ONBOARDING_STEP_ORDER.filter((id) => !completed[id]),
    [completed]
  );

  const visible = useFirstVisibleStep(incompleteSteps);
  const step = visible ? ONBOARDING_STEPS[visible.stepId] : null;

  const handleDismiss = useCallback(() => {
    if (visible) markComplete(visible.stepId);
  }, [visible, markComplete]);

  const handleOpenSettings = useCallback(() => {
    if (step?.settingsTab !== undefined) {
      useSettingsStore.getState().setMenuOpen(true, step.settingsTab);
    }
  }, [step?.settingsTab]);

  const handleOpenModels = useCallback(() => {
    if (step?.modelsRoute) navigate(step.modelsRoute);
  }, [step?.modelsRoute, navigate]);

  if (dismissed || onWelcomePage || !visible || !step) return null;

  return createPortal(
    <>
      <OnboardingTargetHighlight target={visible.el} accent={step.accent} />
      <OnboardingHint
        step={step}
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
