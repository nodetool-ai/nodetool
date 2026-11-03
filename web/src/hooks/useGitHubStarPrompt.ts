/**
 * Invite the user once, ever, to star the NodeTool repository on GitHub.
 *
 * The invitation waits until the user has spent GITHUB_STAR_PROMPT_AFTER_MS
 * with the app open and focused, summed across sessions, so it reaches people
 * who have actually used NodeTool rather than anyone who just opened it. It is
 * a regular toast with a "Star on GitHub" action and a close button, and it is
 * marked as shown the moment it appears, so dismissing it or ignoring it until
 * it fades both count. Both values persist in the onboarding store.
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import {
  GITHUB_REPO_URL,
  GITHUB_STAR_PROMPT_AFTER_MS,
  GITHUB_STAR_PROMPT_TICK_MS,
  GITHUB_STAR_PROMPT_TIMEOUT
} from "../config/constants";
import useOnboardingStore from "../stores/OnboardingStore";
import { useNotificationStore } from "../stores/NotificationStore";

/** Whether the window counts as in use right now. */
export const isAppInUse = (): boolean =>
  document.visibilityState === "visible" && document.hasFocus();

/** Whether the prompt should show, given the stored progress. */
export const shouldShowGitHubStarPrompt = ({
  shown,
  activeUsageMs
}: {
  shown: boolean;
  activeUsageMs: number;
}): boolean => !shown && activeUsageMs >= GITHUB_STAR_PROMPT_AFTER_MS;

export const useGitHubStarPrompt = (): void => {
  const { t } = useTranslation();
  const shown = useOnboardingStore((state) => state.githubStarPromptShown);

  useEffect(() => {
    if (shown) {
      return;
    }
    const tick = () => {
      const store = useOnboardingStore.getState();
      if (isAppInUse()) {
        store.addActiveUsage(GITHUB_STAR_PROMPT_TICK_MS);
      }
      const { githubStarPromptShown, activeUsageMs } =
        useOnboardingStore.getState();
      if (
        !shouldShowGitHubStarPrompt({
          shown: githubStarPromptShown,
          activeUsageMs
        })
      ) {
        return;
      }
      store.markGithubStarPromptShown();
      useNotificationStore.getState().addNotification({
        type: "info",
        alert: true,
        dismissable: true,
        dedupeKey: "github-star-prompt",
        timeout: GITHUB_STAR_PROMPT_TIMEOUT,
        content: t("screen_shell.githubStar.message"),
        action: {
          label: t("screen_shell.githubStar.action"),
          onClick: () => {
            window.open(GITHUB_REPO_URL, "_blank", "noopener,noreferrer");
          }
        }
      });
    };
    const interval = setInterval(tick, GITHUB_STAR_PROMPT_TICK_MS);
    return () => clearInterval(interval);
  }, [shown, t]);
};

export default useGitHubStarPrompt;
