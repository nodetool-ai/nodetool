import { renderHook } from "@testing-library/react";

import { useOpenPackageManager } from "../useOpenPackageManager";

const navigate = jest.fn();
jest.mock("react-router-dom", () => ({
  useNavigate: () => navigate
}));

describe("useOpenPackageManager", () => {
  beforeEach(() => {
    navigate.mockClear();
  });

  it("navigates to the Package Manager route", () => {
    const { result } = renderHook(() => useOpenPackageManager());
    result.current();
    expect(navigate).toHaveBeenCalledWith("/packages");
  });

  it("returns a stable callback across renders", () => {
    const { result, rerender } = renderHook(() => useOpenPackageManager());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
