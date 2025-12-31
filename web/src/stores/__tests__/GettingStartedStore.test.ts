import { act } from "@testing-library/react";
import { useGettingStartedStore } from "../GettingStartedStore";

describe("GettingStartedStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useGettingStartedStore.setState({
      progress: {
        hasCreatedWorkflow: false,
        hasTriedTemplate: false
      }
    });
  });

  describe("initial state", () => {
    it("has hasCreatedWorkflow set to false", () => {
      const { progress } = useGettingStartedStore.getState();
      expect(progress.hasCreatedWorkflow).toBe(false);
    });

    it("has hasTriedTemplate set to false", () => {
      const { progress } = useGettingStartedStore.getState();
      expect(progress.hasTriedTemplate).toBe(false);
    });
  });

  describe("setHasCreatedWorkflow", () => {
    it("sets hasCreatedWorkflow to true", () => {
      act(() => {
        useGettingStartedStore.getState().setHasCreatedWorkflow(true);
      });

      const { progress } = useGettingStartedStore.getState();
      expect(progress.hasCreatedWorkflow).toBe(true);
    });

    it("sets hasCreatedWorkflow to false", () => {
      act(() => {
        useGettingStartedStore.getState().setHasCreatedWorkflow(true);
        useGettingStartedStore.getState().setHasCreatedWorkflow(false);
      });

      const { progress } = useGettingStartedStore.getState();
      expect(progress.hasCreatedWorkflow).toBe(false);
    });

    it("does not affect hasTriedTemplate", () => {
      act(() => {
        useGettingStartedStore.getState().setHasTriedTemplate(true);
        useGettingStartedStore.getState().setHasCreatedWorkflow(true);
      });

      const { progress } = useGettingStartedStore.getState();
      expect(progress.hasCreatedWorkflow).toBe(true);
      expect(progress.hasTriedTemplate).toBe(true);
    });
  });

  describe("setHasTriedTemplate", () => {
    it("sets hasTriedTemplate to true", () => {
      act(() => {
        useGettingStartedStore.getState().setHasTriedTemplate(true);
      });

      const { progress } = useGettingStartedStore.getState();
      expect(progress.hasTriedTemplate).toBe(true);
    });

    it("sets hasTriedTemplate to false", () => {
      act(() => {
        useGettingStartedStore.getState().setHasTriedTemplate(true);
        useGettingStartedStore.getState().setHasTriedTemplate(false);
      });

      const { progress } = useGettingStartedStore.getState();
      expect(progress.hasTriedTemplate).toBe(false);
    });

    it("does not affect hasCreatedWorkflow", () => {
      act(() => {
        useGettingStartedStore.getState().setHasCreatedWorkflow(true);
        useGettingStartedStore.getState().setHasTriedTemplate(true);
      });

      const { progress } = useGettingStartedStore.getState();
      expect(progress.hasCreatedWorkflow).toBe(true);
      expect(progress.hasTriedTemplate).toBe(true);
    });
  });

  describe("resetProgress", () => {
    it("resets all progress to defaults", () => {
      act(() => {
        useGettingStartedStore.getState().setHasCreatedWorkflow(true);
        useGettingStartedStore.getState().setHasTriedTemplate(true);
      });

      // Verify both are true
      let { progress } = useGettingStartedStore.getState();
      expect(progress.hasCreatedWorkflow).toBe(true);
      expect(progress.hasTriedTemplate).toBe(true);

      act(() => {
        useGettingStartedStore.getState().resetProgress();
      });

      progress = useGettingStartedStore.getState().progress;
      expect(progress.hasCreatedWorkflow).toBe(false);
      expect(progress.hasTriedTemplate).toBe(false);
    });

    it("works when already in default state", () => {
      act(() => {
        useGettingStartedStore.getState().resetProgress();
      });

      const { progress } = useGettingStartedStore.getState();
      expect(progress.hasCreatedWorkflow).toBe(false);
      expect(progress.hasTriedTemplate).toBe(false);
    });
  });

  describe("progress tracking scenarios", () => {
    it("tracks user onboarding completion", () => {
      const store = useGettingStartedStore.getState();

      // User starts with no progress
      expect(store.progress.hasCreatedWorkflow).toBe(false);
      expect(store.progress.hasTriedTemplate).toBe(false);

      // User tries a template
      act(() => {
        useGettingStartedStore.getState().setHasTriedTemplate(true);
      });

      let progress = useGettingStartedStore.getState().progress;
      expect(progress.hasTriedTemplate).toBe(true);
      expect(progress.hasCreatedWorkflow).toBe(false);

      // User creates their own workflow
      act(() => {
        useGettingStartedStore.getState().setHasCreatedWorkflow(true);
      });

      progress = useGettingStartedStore.getState().progress;
      expect(progress.hasTriedTemplate).toBe(true);
      expect(progress.hasCreatedWorkflow).toBe(true);
    });

    it("allows independent completion of steps", () => {
      // User creates workflow without trying template
      act(() => {
        useGettingStartedStore.getState().setHasCreatedWorkflow(true);
      });

      let progress = useGettingStartedStore.getState().progress;
      expect(progress.hasCreatedWorkflow).toBe(true);
      expect(progress.hasTriedTemplate).toBe(false);
    });
  });
});
