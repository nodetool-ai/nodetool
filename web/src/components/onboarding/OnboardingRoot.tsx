/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { Outlet } from "react-router-dom";
import OnboardingOverlay from "./OnboardingOverlay";
import { useOnboardingDetectors } from "./useOnboardingDetectors";

/**
 * Layout route that wraps the entire app. Mounts the ambient onboarding
 * overlay so hints can render on top of any page, and registers the global
 * detector subscriptions so each step is recorded complete as the user
 * uses the real product.
 *
 * The /welcome page (GettingStartedPanel) is the canonical checklist;
 * hints are just contextual overlays that anchor to the relevant UI until
 * each step is done.
 */
const OnboardingRoot: React.FC = () => {
  useOnboardingDetectors();

  return (
    <>
      <Outlet />
      <OnboardingOverlay />
    </>
  );
};

export default memo(OnboardingRoot);
