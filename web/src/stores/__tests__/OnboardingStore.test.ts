import useOnboardingStore, {
  ONBOARDING_STEP_IDS,
  isOnboardingFinished,
  startRouteFor
} from "../OnboardingStore";

describe("OnboardingStore", () => {
  beforeEach(() => {
    useOnboardingStore.setState({ completedSteps: [], dismissed: false });
  });

  it("marks a step as completed once", () => {
    const { markStep } = useOnboardingStore.getState();
    markStep("run-workflow");
    markStep("run-workflow");
    expect(useOnboardingStore.getState().completedSteps).toEqual([
      "run-workflow"
    ]);
  });

  it("accumulates distinct steps", () => {
    const { markStep } = useOnboardingStore.getState();
    markStep("open-template");
    markStep("create-workflow");
    expect(useOnboardingStore.getState().completedSteps).toEqual([
      "open-template",
      "create-workflow"
    ]);
  });

  it("dismisses the checklist", () => {
    useOnboardingStore.getState().dismiss();
    expect(useOnboardingStore.getState().dismissed).toBe(true);
  });

  describe("isOnboardingFinished", () => {
    it("is false while steps remain", () => {
      expect(
        isOnboardingFinished({
          completedSteps: ["open-template"],
          dismissed: false
        })
      ).toBe(false);
    });

    it("is true once every step is done", () => {
      expect(
        isOnboardingFinished({
          completedSteps: [...ONBOARDING_STEP_IDS],
          dismissed: false
        })
      ).toBe(true);
    });

    it("is true when dismissed", () => {
      expect(isOnboardingFinished({ completedSteps: [], dismissed: true })).toBe(
        true
      );
    });
  });

  describe("startRouteFor", () => {
    it("sends a new user to the dashboard", () => {
      expect(startRouteFor({ completedSteps: [], dismissed: false }, true)).toBe(
        "/dashboard"
      );
    });

    it("sends a user who finished onboarding to the workspace", () => {
      expect(
        startRouteFor(
          { completedSteps: [...ONBOARDING_STEP_IDS], dismissed: false },
          true
        )
      ).toBe("/workspace");
    });

    it("sends a user who dismissed onboarding to the workspace", () => {
      expect(startRouteFor({ completedSteps: [], dismissed: true }, true)).toBe(
        "/workspace"
      );
    });

    it("honours showWelcomeOnStartup being off", () => {
      expect(
        startRouteFor({ completedSteps: [], dismissed: false }, false)
      ).toBe("/workspace");
    });
  });
});
