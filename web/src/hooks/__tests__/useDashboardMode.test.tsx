import { act, renderHook } from "@testing-library/react";
import { useDashboardMode } from "../useDashboardMode";
import useOnboardingStore from "../../stores/OnboardingStore";

const resetOnboarding = () =>
  useOnboardingStore.setState({ completedSteps: [], dismissed: false });

describe("useDashboardMode", () => {
  beforeEach(resetOnboarding);

  it("leads with the first-run material for a new user with no workflows", () => {
    const { result } = renderHook(() =>
      useDashboardMode({ workflowCount: 0, isLoadingWorkflows: false })
    );
    expect(result.current).toBe("first-run");
  });

  it("leads with the user's own work once they have a workflow", () => {
    const { result } = renderHook(() =>
      useDashboardMode({ workflowCount: 20, isLoadingWorkflows: false })
    );
    expect(result.current).toBe("returning");
  });

  it("leads with the user's own work once onboarding is finished", () => {
    useOnboardingStore.setState({ dismissed: true });
    const { result } = renderHook(() =>
      useDashboardMode({ workflowCount: 0, isLoadingWorkflows: false })
    );
    expect(result.current).toBe("returning");
  });

  it("holds the answer back while the workflow list loads", () => {
    const { result: newUser } = renderHook(() =>
      useDashboardMode({ workflowCount: 0, isLoadingWorkflows: true })
    );
    expect(newUser.current).toBe("pending");

    act(() => useOnboardingStore.setState({ dismissed: true }));
    const { result: knownUser } = renderHook(() =>
      useDashboardMode({ workflowCount: 0, isLoadingWorkflows: true })
    );
    expect(knownUser.current).toBe("returning");
  });

  it("never answers first-run and then returning for one user", () => {
    const { result, rerender } = renderHook(
      (props: { workflowCount: number; isLoadingWorkflows: boolean }) =>
        useDashboardMode(props),
      { initialProps: { workflowCount: 0, isLoadingWorkflows: true } }
    );
    expect(result.current).toBe("pending");

    rerender({ workflowCount: 7, isLoadingWorkflows: false });
    expect(result.current).toBe("returning");
  });

  it("treats every step completed as finished, without a dismissal", () => {
    useOnboardingStore.setState({
      completedSteps: ["open-template", "run-workflow", "create-workflow"]
    });
    const { result } = renderHook(() =>
      useDashboardMode({ workflowCount: 0, isLoadingWorkflows: false })
    );
    expect(result.current).toBe("returning");
  });
});
