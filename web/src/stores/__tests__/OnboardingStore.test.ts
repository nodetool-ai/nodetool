import useOnboardingStore from "../OnboardingStore";

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
});
