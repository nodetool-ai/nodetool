import useOnboardingStore, {
  ONBOARDING_STEP_IDS,
  isOnboardingFinished
} from "../OnboardingStore";

describe("OnboardingStore", () => {
  beforeEach(() => {
    useOnboardingStore.setState({
      completedSteps: [],
      dismissed: false,
      providerSignInOffered: false
    });
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

  it("records that the first-run provider sign-in was offered", () => {
    expect(useOnboardingStore.getState().providerSignInOffered).toBe(false);
    useOnboardingStore.getState().markProviderSignInOffered();
    expect(useOnboardingStore.getState().providerSignInOffered).toBe(true);
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
});
