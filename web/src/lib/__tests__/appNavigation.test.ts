import { navigateTo, registerAppRouter } from "../appNavigation";

describe("appNavigation", () => {
  it("navigates through the registered router", () => {
    const navigate = jest.fn();
    registerAppRouter({ navigate });
    navigateTo("/settings");
    expect(navigate).toHaveBeenCalledWith("/settings");
  });

  it("uses the most recently registered router", () => {
    const first = jest.fn();
    const second = jest.fn();
    registerAppRouter({ navigate: first });
    registerAppRouter({ navigate: second });
    navigateTo("/x");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("/x");
  });
});
