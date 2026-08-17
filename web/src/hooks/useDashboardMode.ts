import useOnboardingStore, {
  isOnboardingFinished
} from "../stores/OnboardingStore";

export type DashboardMode = "first-run" | "returning";

interface UseDashboardModeArgs {
  workflowCount: number;
  isLoadingWorkflows: boolean;
}

/**
 * Which dashboard a user gets.
 *
 * A user with no workflows of their own and unfinished onboarding came here to
 * start something: the page leads with the hero and the learning material.
 * Everyone else came back for work they already have, so that leads instead.
 *
 * The workflow count arrives over the network, so until it does the answer
 * comes from onboarding alone (which is persisted, and therefore synchronous).
 * A user who has both unfinished onboarding and a full library sees the
 * first-run order for as long as the list takes to load, once per cold cache.
 */
export const useDashboardMode = ({
  workflowCount,
  isLoadingWorkflows
}: UseDashboardModeArgs): DashboardMode => {
  const onboardingFinished = useOnboardingStore(isOnboardingFinished);

  if (onboardingFinished) {
    return "returning";
  }
  if (isLoadingWorkflows) {
    return "first-run";
  }
  return workflowCount > 0 ? "returning" : "first-run";
};

export default useDashboardMode;
