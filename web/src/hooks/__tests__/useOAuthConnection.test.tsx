import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useOAuthConnection } from "../useOAuthConnection";
import { restFetch } from "../../lib/rest-fetch";
import { useNotificationStore } from "../../stores/NotificationStore";

jest.mock("../../lib/rest-fetch");
jest.mock("../../lib/env", () => ({ isElectron: false }));
jest.mock("../../stores/NotificationStore");

const mockRestFetch = restFetch as jest.MockedFunction<typeof restFetch>;
const mockAddNotification = jest.fn();

const jsonResponse = (body: unknown, ok = true): Response =>
  ({ ok, json: async () => body }) as unknown as Response;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

describe("useOAuthConnection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNotificationStore as unknown as jest.Mock).mockImplementation(
      (selector: (state: unknown) => unknown) =>
        selector({ addNotification: mockAddNotification })
    );
    mockRestFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/tokens")) return jsonResponse({ tokens: [] });
      if (url.endsWith("/start"))
        return jsonResponse({ auth_url: "https://example.com/auth" });
      if (url.endsWith("/disconnect")) return jsonResponse({});
      return jsonResponse({});
    });
  });

  it("stays inert and issues no request when provider is null", async () => {
    const { result } = renderHook(() => useOAuthConnection(null), {
      wrapper: createWrapper()
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.canDisconnect).toBe(false);
    expect(result.current.label).toBe("");
    // Give any (unexpected) query a tick to fire.
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockRestFetch).not.toHaveBeenCalled();
  });

  it("reports connected once the backend returns a token", async () => {
    mockRestFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/tokens"))
        return jsonResponse({ tokens: ["token-1"] });
      return jsonResponse({});
    });

    const { result } = renderHook(() => useOAuthConnection("openai"), {
      wrapper: createWrapper()
    });

    await waitFor(() => expect(result.current.isConnected).toBe(true));
    expect(result.current.label).toBe("OpenAI");
    expect(result.current.canDisconnect).toBe(true);
  });

  it("opens the auth URL when connect() is called", async () => {
    const openSpy = jest
      .spyOn(window, "open")
      .mockReturnValue(null as unknown as Window);

    const { result } = renderHook(() => useOAuthConnection("hf"), {
      wrapper: createWrapper()
    });

    await act(async () => {
      await result.current.connect();
    });

    expect(mockRestFetch).toHaveBeenCalledWith("/api/oauth/hf/start");
    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/auth",
      "_blank",
      expect.stringContaining("noopener")
    );
    openSpy.mockRestore();
  });

  it("calls the disconnect endpoint for a provider that supports it", async () => {
    mockRestFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/tokens"))
        return jsonResponse({ tokens: ["token-1"] });
      if (url.endsWith("/disconnect")) return jsonResponse({});
      return jsonResponse({});
    });

    const { result } = renderHook(() => useOAuthConnection("openai"), {
      wrapper: createWrapper()
    });

    await waitFor(() => expect(result.current.isConnected).toBe(true));

    await act(async () => {
      await result.current.disconnect();
    });

    expect(mockRestFetch).toHaveBeenCalledWith("/api/oauth/openai/disconnect", {
      method: "POST"
    });
  });

  it("does not support disconnect for HuggingFace", async () => {
    const { result } = renderHook(() => useOAuthConnection("hf"), {
      wrapper: createWrapper()
    });

    expect(result.current.canDisconnect).toBe(false);

    await act(async () => {
      await result.current.disconnect();
    });

    // Only the token poll may have fired; no disconnect request.
    expect(
      mockRestFetch.mock.calls.some(([input]) =>
        String(input).endsWith("/disconnect")
      )
    ).toBe(false);
  });
});
