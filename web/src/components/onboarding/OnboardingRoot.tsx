/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { Outlet } from "react-router-dom";
import OnboardingOverlay from "./OnboardingOverlay";
import { useOnboardingDetectors } from "./useOnboardingDetectors";

/**
 * Layout route that wraps the entire app. Mounts the onboarding overlay so
 * it can be shown on top of any page, and registers the global detector
 * subscriptions so completion of each step is recorded as the user uses the
 * real product.
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
