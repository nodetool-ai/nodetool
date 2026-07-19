import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import { useBudgetStore, selectBudget } from "../BudgetStore";

describe("BudgetStore", () => {
  beforeEach(() => {
    act(() => {
      useBudgetStore.setState({
        cap: 5,
        currency: "USD",
        spent: 0,
        draftMode: "draft"
      });
    });
  });

  describe("setCap", () => {
    it("should set a valid cap", () => {
      act(() => {
        useBudgetStore.getState().setCap(10);
      });
      expect(useBudgetStore.getState().cap).toBe(10);
    });

    it("should accept zero as a cap", () => {
      act(() => {
        useBudgetStore.getState().setCap(0);
      });
      expect(useBudgetStore.getState().cap).toBe(0);
    });

    it("should clamp negative values to 0", () => {
      act(() => {
        useBudgetStore.getState().setCap(-5);
      });
      expect(useBudgetStore.getState().cap).toBe(0);
    });

    it("should clamp NaN to 0", () => {
      act(() => {
        useBudgetStore.getState().setCap(NaN);
      });
      expect(useBudgetStore.getState().cap).toBe(0);
    });

    it("should clamp Infinity to 0", () => {
      act(() => {
        useBudgetStore.getState().setCap(Infinity);
      });
      expect(useBudgetStore.getState().cap).toBe(0);
    });
  });

  describe("addSpent", () => {
    it("should accumulate spending", () => {
      act(() => {
        useBudgetStore.getState().addSpent(1.5);
        useBudgetStore.getState().addSpent(2.5);
      });
      expect(useBudgetStore.getState().spent).toBe(4);
    });

    it("should ignore non-positive amounts", () => {
      act(() => {
        useBudgetStore.getState().addSpent(0);
      });
      expect(useBudgetStore.getState().spent).toBe(0);

      act(() => {
        useBudgetStore.getState().addSpent(-1);
      });
      expect(useBudgetStore.getState().spent).toBe(0);
    });

    it("should ignore NaN", () => {
      act(() => {
        useBudgetStore.getState().addSpent(NaN);
      });
      expect(useBudgetStore.getState().spent).toBe(0);
    });

    it("should ignore Infinity", () => {
      act(() => {
        useBudgetStore.getState().addSpent(Infinity);
      });
      expect(useBudgetStore.getState().spent).toBe(0);
    });
  });

  describe("setDraftMode", () => {
    it("should switch to final", () => {
      act(() => {
        useBudgetStore.getState().setDraftMode("final");
      });
      expect(useBudgetStore.getState().draftMode).toBe("final");
    });

    it("should switch back to draft", () => {
      act(() => {
        useBudgetStore.getState().setDraftMode("final");
        useBudgetStore.getState().setDraftMode("draft");
      });
      expect(useBudgetStore.getState().draftMode).toBe("draft");
    });
  });

  describe("reset", () => {
    it("should reset spent to 0 while preserving cap", () => {
      act(() => {
        useBudgetStore.getState().setCap(20);
        useBudgetStore.getState().addSpent(10);
        useBudgetStore.getState().reset();
      });
      expect(useBudgetStore.getState().spent).toBe(0);
      expect(useBudgetStore.getState().cap).toBe(20);
    });
  });

  describe("selectBudget", () => {
    it("should return a protocol Budget snapshot", () => {
      act(() => {
        useBudgetStore.getState().setCap(15);
        useBudgetStore.getState().addSpent(3);
      });

      const budget = selectBudget(useBudgetStore.getState());
      expect(budget).toEqual({
        currency: "USD",
        cap: 15,
        spent: 3
      });
    });
  });
});
