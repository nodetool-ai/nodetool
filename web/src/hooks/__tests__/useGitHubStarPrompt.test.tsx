import { act, renderHook } from "@testing-library/react";

import {
  shouldShowGitHubStarPrompt,
  useGitHubStarPrompt
} from "../useGitHubStarPrompt";
import useOnboardingStore from "../../stores/OnboardingStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  GITHUB_REPO_URL,
  GITHUB_STAR_PROMPT_AFTER_MS,
  GITHUB_STAR_PROMPT_TICK_MS
} from "../../config/constants";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

const starNotifications = () =>
  useNotificationStore
    .getState()
    .notifications.filter((n) => n.dedupeKey === "github-star-prompt");

let focused = true;

beforeEach(() => {
  jest.useFakeTimers();
  focused = true;
  jest.spyOn(document, "hasFocus").mockImplementation(() => focused);
  useOnboardingStore.setState({
    activeUsageMs: 0,
    githubStarPromptShown: false
  });
  useNotificationStore.setState({ notifications: [] });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("shouldShowGitHubStarPrompt", () => {
  it("waits for the usage threshold", () => {
    expect(
      shouldShowGitHubStarPrompt({
        shown: false,
        activeUsageMs: GITHUB_STAR_PROMPT_AFTER_MS - 1
      })
    ).toBe(false);
    expect(
      shouldShowGitHubStarPrompt({
        shown: false,
        activeUsageMs: GITHUB_STAR_PROMPT_AFTER_MS
      })
    ).toBe(true);
  });

  it("never shows twice", () => {
    expect(
      shouldShowGitHubStarPrompt({
        shown: true,
        activeUsageMs: GITHUB_STAR_PROMPT_AFTER_MS * 10
      })
    ).toBe(false);
  });
});

describe("useGitHubStarPrompt", () => {
  it("shows one toast after enough active use", () => {
    renderHook(() => useGitHubStarPrompt());

    act(() => {
      jest.advanceTimersByTime(
        GITHUB_STAR_PROMPT_AFTER_MS - GITHUB_STAR_PROMPT_TICK_MS
      );
    });
    expect(starNotifications()).toHaveLength(0);

    act(() => {
      jest.advanceTimersByTime(GITHUB_STAR_PROMPT_TICK_MS);
    });
    expect(starNotifications()).toHaveLength(1);
    expect(useOnboardingStore.getState().githubStarPromptShown).toBe(true);

    act(() => {
      jest.advanceTimersByTime(GITHUB_STAR_PROMPT_AFTER_MS * 2);
    });
    expect(starNotifications()).toHaveLength(1);
  });

  it("opens the repository from the toast action", () => {
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    useOnboardingStore.setState({
      activeUsageMs: GITHUB_STAR_PROMPT_AFTER_MS
    });
    renderHook(() => useGitHubStarPrompt());
    act(() => {
      jest.advanceTimersByTime(GITHUB_STAR_PROMPT_TICK_MS);
    });

    const [toast] = starNotifications();
    expect(toast.alert).toBe(true);
    void toast.action?.onClick();
    expect(open).toHaveBeenCalledWith(
      GITHUB_REPO_URL,
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("does not count time while the window is unfocused", () => {
    focused = false;
    renderHook(() => useGitHubStarPrompt());
    act(() => {
      jest.advanceTimersByTime(GITHUB_STAR_PROMPT_AFTER_MS * 2);
    });
    expect(useOnboardingStore.getState().activeUsageMs).toBe(0);
    expect(starNotifications()).toHaveLength(0);
  });

  it("carries usage over from earlier sessions", () => {
    useOnboardingStore.setState({
      activeUsageMs: GITHUB_STAR_PROMPT_AFTER_MS - GITHUB_STAR_PROMPT_TICK_MS
    });
    renderHook(() => useGitHubStarPrompt());
    act(() => {
      jest.advanceTimersByTime(GITHUB_STAR_PROMPT_TICK_MS);
    });
    expect(starNotifications()).toHaveLength(1);
  });

  it("does nothing once the prompt was shown", () => {
    useOnboardingStore.setState({
      githubStarPromptShown: true,
      activeUsageMs: GITHUB_STAR_PROMPT_AFTER_MS
    });
    renderHook(() => useGitHubStarPrompt());
    act(() => {
      jest.advanceTimersByTime(GITHUB_STAR_PROMPT_AFTER_MS);
    });
    expect(starNotifications()).toHaveLength(0);
    expect(useOnboardingStore.getState().activeUsageMs).toBe(
      GITHUB_STAR_PROMPT_AFTER_MS
    );
  });
});
