import useBudgetStore from "../BudgetStore";

beforeEach(() => {
  useBudgetStore.setState({ spent: 0, cap: 5, currency: "USD" });
});

describe("BudgetStore.setSpent", () => {
  it("sets spent to an absolute finite total", () => {
    useBudgetStore.getState().setSpent(1.25);
    expect(useBudgetStore.getState().spent).toBeCloseTo(1.25);

    // Absolute, not additive: a smaller total overwrites the larger one.
    useBudgetStore.getState().setSpent(0.5);
    expect(useBudgetStore.getState().spent).toBeCloseTo(0.5);
  });

  it("accepts zero", () => {
    useBudgetStore.getState().setSpent(3);
    useBudgetStore.getState().setSpent(0);
    expect(useBudgetStore.getState().spent).toBe(0);
  });

  it("ignores negative and non-finite totals", () => {
    useBudgetStore.getState().setSpent(2);
    useBudgetStore.getState().setSpent(-1);
    expect(useBudgetStore.getState().spent).toBeCloseTo(2);

    useBudgetStore.getState().setSpent(Number.NaN);
    expect(useBudgetStore.getState().spent).toBeCloseTo(2);

    useBudgetStore.getState().setSpent(Number.POSITIVE_INFINITY);
    expect(useBudgetStore.getState().spent).toBeCloseTo(2);
  });

  it("reset() clears spent back to zero", () => {
    useBudgetStore.getState().setSpent(4);
    useBudgetStore.getState().reset();
    expect(useBudgetStore.getState().spent).toBe(0);
  });
});
