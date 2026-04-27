import { describe, expect, it, beforeEach } from "@jest/globals";
import {
  ONBOARDING_STEP_ORDER,
  useOnboardingStore
} from "../OnboardingStore";

describe("OnboardingStore", () => {
  beforeEach(() => {
    useOnboardingStore.getState().reset();
  });

  it("starts inactive at step 0", () => {
    const s = useOnboardingStore.getState();
    expect(s.active).toBe(false);
    expect(s.currentStep).toBe(0);
    expect(s.dismissed).toBe(false);
    for (const id of ONBOARDING_STEP_ORDER) {
      expect(s.completed[id]).toBe(false);
    }
  });

  it("start() activates the tour at step 0", () => {
    useOnboardingStore.getState().start();
    const s = useOnboardingStore.getState();
    expect(s.active).toBe(true);
    expect(s.currentStep).toBe(0);
  });

  it("startAt() jumps to a specific step id", () => {
    useOnboardingStore.getState().startAt("nodes");
    expect(useOnboardingStore.getState().currentStep).toBe(
      ONBOARDING_STEP_ORDER.indexOf("nodes")
    );
  });

  it("next() advances to the next step", () => {
    const { start, next } = useOnboardingStore.getState();
    start();
    next();
    const s = useOnboardingStore.getState();
    expect(s.currentStep).toBe(1);
  });

  it("next() on the last step finishes and dismisses the tour", () => {
    const last = ONBOARDING_STEP_ORDER.length - 1;
    useOnboardingStore.setState({ active: true, currentStep: last });
    useOnboardingStore.getState().next();
    const s = useOnboardingStore.getState();
    expect(s.active).toBe(false);
    expect(s.dismissed).toBe(true);
  });

  it("prev() steps back, never below 0", () => {
    useOnboardingStore.setState({ active: true, currentStep: 1 });
    useOnboardingStore.getState().prev();
    expect(useOnboardingStore.getState().currentStep).toBe(0);
    useOnboardingStore.getState().prev();
    expect(useOnboardingStore.getState().currentStep).toBe(0);
  });

  it("markComplete() records the step without advancing", () => {
    useOnboardingStore.getState().start();
    useOnboardingStore.getState().markComplete("chat");
    const s = useOnboardingStore.getState();
    expect(s.completed.chat).toBe(true);
    expect(s.currentStep).toBe(0);
  });

  it("skip() dismisses the tour", () => {
    useOnboardingStore.getState().start();
    useOnboardingStore.getState().skip();
    const s = useOnboardingStore.getState();
    expect(s.active).toBe(false);
    expect(s.dismissed).toBe(true);
  });

  it("finish() marks all steps complete", () => {
    useOnboardingStore.getState().finish();
    const s = useOnboardingStore.getState();
    for (const id of ONBOARDING_STEP_ORDER) {
      expect(s.completed[id]).toBe(true);
    }
    expect(s.dismissed).toBe(true);
  });

  describe("resume()", () => {
    it("activates the tour at step 0 when no progress", () => {
      useOnboardingStore.getState().resume();
      const s = useOnboardingStore.getState();
      expect(s.active).toBe(true);
      expect(s.currentStep).toBe(0);
    });

    it("jumps to the first incomplete step when progress exists", () => {
      const { markComplete, resume } = useOnboardingStore.getState();
      markComplete("providers");
      markComplete("chat");
      resume();
      expect(useOnboardingStore.getState().currentStep).toBe(
        ONBOARDING_STEP_ORDER.indexOf("image")
      );
    });

    it("resumes through gaps in completed steps", () => {
      const { markComplete, resume } = useOnboardingStore.getState();
      // Mark a non-contiguous step done; first incomplete is still "providers".
      markComplete("nodes");
      resume();
      expect(useOnboardingStore.getState().currentStep).toBe(0);
    });

    it("falls back to step 0 when every step is already complete", () => {
      useOnboardingStore.getState().finish();
      useOnboardingStore.getState().resume();
      expect(useOnboardingStore.getState().currentStep).toBe(0);
      expect(useOnboardingStore.getState().active).toBe(true);
    });
  });

  it("reset() returns to defaults", () => {
    const { start, markComplete, reset } = useOnboardingStore.getState();
    start();
    markComplete("providers");
    reset();
    const s = useOnboardingStore.getState();
    expect(s.active).toBe(false);
    expect(s.completed.providers).toBe(false);
  });
});
