import type React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiErrorCode } from "@nodetool-ai/protocol/api-schemas";

const mockVersionsQuery = jest.fn();
const mockSwitchVersion = jest.fn();
const mockLoadMessages = jest.fn();

jest.mock("../../trpc/client", () => ({
  __esModule: true,
  trpcClient: {
    messages: {
      versions: { query: (...args: unknown[]) => mockVersionsQuery(...args) },
      switchVersion: {
        mutate: (...args: unknown[]) => mockSwitchVersion(...args)
      }
    }
  }
}));

jest.mock("../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: <T,>(selector: (state: { loadMessages: jest.Mock }) => T) =>
    selector({ loadMessages: mockLoadMessages })
}));

import { useThreadVersions } from "../useThreadVersions";

const wrapperFor = (client: QueryClient) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("useThreadVersions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVersionsQuery.mockResolvedValue({
      forks: [
        {
          after: "m1",
          first_message_id: "m4",
          versions: ["branch-a", "branch-b", null],
          active: 2
        },
        // Nothing live follows this fork, so no message carries it.
        { after: "m4", first_message_id: null, versions: ["branch-c"], active: -1 }
      ]
    });
    mockSwitchVersion.mockResolvedValue({ ok: true });
    mockLoadMessages.mockResolvedValue([]);
  });

  it("puts a switcher on the first message after each fork", async () => {
    const { result } = renderHook(
      () => useThreadVersions("thread-1", "m1,m4", true),
      { wrapper: wrapperFor(newClient()) }
    );

    await waitFor(() =>
      expect(Object.keys(result.current.navByMessageId)).toEqual(["m4"])
    );
    expect(mockVersionsQuery).toHaveBeenCalledWith({ thread_id: "thread-1" });
    expect(result.current.navByMessageId.m4).toMatchObject({
      index: 3,
      count: 3
    });
  });

  it("switches to the chosen version and reloads the thread", async () => {
    const { result } = renderHook(
      () => useThreadVersions("thread-1", "m1,m4", true),
      { wrapper: wrapperFor(newClient()) }
    );
    await waitFor(() => expect(result.current.navByMessageId.m4).toBeDefined());

    act(() => result.current.navByMessageId.m4.select(1));

    await waitFor(() => expect(mockLoadMessages).toHaveBeenCalledWith("thread-1"));
    expect(mockSwitchVersion).toHaveBeenCalledWith({
      thread_id: "thread-1",
      after: "m1",
      branch_id: "branch-a"
    });
  });

  it("reports a switch the server refused", async () => {
    mockSwitchVersion.mockRejectedValue(new Error("Version not found"));
    const onError = jest.fn();
    const { result } = renderHook(
      () => useThreadVersions("thread-1", "m1,m4", true, onError),
      { wrapper: wrapperFor(newClient()) }
    );
    await waitFor(() => expect(result.current.navByMessageId.m4).toBeDefined());

    act(() => result.current.navByMessageId.m4.select(2));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(mockLoadMessages).not.toHaveBeenCalled();
  });

  it("does not ask while a turn runs", () => {
    renderHook(() => useThreadVersions("thread-1", "m1", false), {
      wrapper: wrapperFor(newClient())
    });

    expect(mockVersionsQuery).not.toHaveBeenCalled();
  });

  it("does not ask when the thread has no stored messages", () => {
    renderHook(() => useThreadVersions("thread-new", "", true), {
      wrapper: wrapperFor(newClient())
    });
    renderHook(() => useThreadVersions("thread-new", ",", true), {
      wrapper: wrapperFor(newClient())
    });

    expect(mockVersionsQuery).not.toHaveBeenCalled();
  });

  it("treats a missing thread as having no forks without retrying", async () => {
    mockVersionsQuery.mockRejectedValue({
      data: { apiCode: ApiErrorCode.NOT_FOUND }
    });
    const retryingClient = new QueryClient({
      defaultOptions: { queries: { retry: 2, retryDelay: 0 } }
    });
    const { result } = renderHook(
      () => useThreadVersions("thread-missing", "m1", true),
      { wrapper: wrapperFor(retryingClient) }
    );

    await waitFor(() => expect(mockVersionsQuery).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockVersionsQuery).toHaveBeenCalledTimes(1);
    expect(result.current.navByMessageId).toEqual({});
  });
});
