import React from "react";
import { asMock, stub } from "../../test-utils/doubles";
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
  stub<Response>({ ok, json: async () => body });

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

/** Stand-in for the window connect() claims in the click's own tick. */
const fakeAuthWindow = () =>
  stub<Window>({
    opener: {},
    document: { title: "" },
    location: { replace: jest.fn() },
    close: jest.fn()
  });

describe("useOAuthConnection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, "open").mockReturnValue(fakeAuthWindow());
    asMock(useNotificationStore).mockImplementation(
      <T,>(selector: (state: unknown) => T) =>
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

  afterEach(() => {
    jest.restoreAllMocks();
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

  it("claims a window before /start, then navigates it to the auth URL", async () => {
    const authWindow = fakeAuthWindow();
    (window.open as jest.MockedFunction<typeof window.open>).mockReturnValue(
      authWindow
    );

    const { result } = renderHook(() => useOAuthConnection("hf"), {
      wrapper: createWrapper()
    });

    await act(async () => {
      await result.current.connect();
    });

    // Opened blank so the click's own tick pays for it — a window opened after
    // the /start round-trip is blocked on mobile.
    expect(window.open).toHaveBeenCalledWith(
      "",
      "_blank",
      "width=600,height=700"
    );
    expect(mockRestFetch).toHaveBeenCalledWith("/api/oauth/hf/start");
    expect(authWindow.location.replace).toHaveBeenCalledWith(
      "https://example.com/auth"
    );
    expect(authWindow.opener).toBeNull();
  });

  it("falls back to a same-tab navigation when the pop-up is blocked", async () => {
    const open = (
      window.open as jest.MockedFunction<typeof window.open>
    ).mockReturnValue(null);

    const { result } = renderHook(() => useOAuthConnection("hf"), {
      wrapper: createWrapper()
    });

    await act(async () => {
      await result.current.connect();
    });

    expect(open).toHaveBeenCalledWith("https://example.com/auth", "_self");
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

  describe("connect polling", () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it("polls until connected, then fires a success notification", async () => {
      jest.useFakeTimers();
      let tokenCalls = 0;
      mockRestFetch.mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith("/tokens")) {
          tokenCalls += 1;
          // Initial fetch + early polls report no token; a later poll lands
          // the token once the (simulated) OAuth round-trip completes.
          return jsonResponse({ tokens: tokenCalls > 2 ? ["token-1"] : [] });
        }
        if (url.endsWith("/start"))
          return jsonResponse({ auth_url: "https://example.com/auth" });
        return jsonResponse({});
      });

      const { result } = renderHook(() => useOAuthConnection("openai"), {
        wrapper: createWrapper()
      });

      // Let the initial token fetch settle before starting the flow.
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.isConnected).toBe(false);

      await act(async () => {
        await result.current.connect();
      });
      expect(result.current.isConnecting).toBe(true);

      // Drive the 2s refetchInterval until the backend reports a token. Each
      // advance lets react-query fire one poll and flush its async result.
      for (let i = 0; i < 10 && !result.current.isConnected; i += 1) {
        await act(async () => {
          jest.advanceTimersByTime(2000);
        });
      }

      expect(result.current.isConnected).toBe(true);
      expect(result.current.isConnecting).toBe(false);
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "Successfully connected to OpenAI",
          type: "success",
          alert: true
        })
      );
    });
  });
});
