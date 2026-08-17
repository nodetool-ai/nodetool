import useOnboardingStore, {
  isOnboardingFinished
} from "../stores/OnboardingStore";

export type DashboardMode = "first-run" | "returning";

/** The answer is not knowable yet — nothing mode-dependent may render. */
export type DashboardModeState = DashboardMode | "pending";

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
 * Onboarding is persisted, so a finished user is answered synchronously. An
 * unfinished one depends on the workflow count, which arrives over the network:
 * until it does the answer is "pending" rather than a guess. Guessing put the
 * first-run page on screen and then replaced it with the returning one — the
 * same sections re-appearing in a different order, which reads as duplicated
 * content rather than as loading.
 */
export const useDashboardMode = ({
  workflowCount,
  isLoadingWorkflows
}: UseDashboardModeArgs): DashboardModeState => {
  const onboardingFinished = useOnboardingStore(isOnboardingFinished);

  if (onboardingFinished) {
    return "returning";
  }
  if (isLoadingWorkflows) {
    return "pending";
  }
  return workflowCount > 0 ? "returning" : "first-run";
};

export default useDashboardMode;
