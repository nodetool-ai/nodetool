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
    markStep("describe-idea");
    markStep("describe-idea");
    expect(useOnboardingStore.getState().completedSteps).toEqual([
      "describe-idea"
    ]);
  });

  it("accumulates distinct steps", () => {
    const { markStep } = useOnboardingStore.getState();
    markStep("start-guided-flow");
    markStep("keep-creating");
    expect(useOnboardingStore.getState().completedSteps).toEqual([
      "start-guided-flow",
      "keep-creating"
    ]);
  });

  it("dismisses the checklist", () => {
    useOnboardingStore.getState().dismiss();
    expect(useOnboardingStore.getState().dismissed).toBe(true);
  });

  it("migrates workflow-era steps to the project-surface steps", () => {
    const { migrate } = (useOnboardingStore as unknown as {
      persist: { getOptions: () => { migrate?: unknown } };
    }).persist.getOptions();
    expect(typeof migrate).toBe("function");
    const next = (
      migrate as (
        state: unknown,
        version: number
      ) => { completedSteps: string[] }
    )(
      {
        completedSteps: ["open-template", "run-workflow", "create-workflow"],
        dismissed: false
      },
      1
    );
    expect(next.completedSteps).toEqual([]);
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
          completedSteps: ["start-guided-flow"],
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
