import React from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRunningJobs } from "../useRunningJobs";

const createQueryClient = () => new QueryClient();

jest.mock("../../stores/ApiClient", () => ({
  client: {
    GET: jest.fn()
  }
}));

jest.mock("../../stores/useAuth", () => ({
  useAuth: jest.fn((selector?: any) => {
    if (typeof selector === "function") {
      return selector({
        user: { id: "user-123" },
        state: "logged_in"
      });
    }
    return {
      user: { id: "user-123" },
      state: "logged_in"
    };
  })
}));

describe("useRunningJobs", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createQueryClient();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  it("is defined and returns expected interface", () => {
    const { result } = renderHook(() => useRunningJobs(), { wrapper });
    
    expect(result.current).toHaveProperty("data");
    expect(result.current).toHaveProperty("error");
    expect(result.current).toHaveProperty("isLoading");
    expect(result.current).toHaveProperty("isSuccess");
    expect(result.current).toHaveProperty("isError");
    expect(result.current).toHaveProperty("refetch");
  });
});
