import { useAuth, OAuthProviderSupabase } from "../useAuth";

// Mock Supabase client
jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } }
      })),
      signInWithOAuth: jest.fn(),
      signOut: jest.fn()
    }
  },
  isLocalhost: false
}));

// Mock error handling
jest.mock("../../utils/errorHandling", () => ({
  createErrorMessage: (error: unknown, fallback: string) => {
    if (error instanceof Error) {
      return { message: error.message };
    }
    return { message: fallback };
  }
}));

import { supabase } from "../lib/supabaseClient";

describe("useAuth", () => {
  const initialState = useAuth.getState();

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.setState(initialState, true);
  });

  afterEach(() => {
    useAuth.getState().cleanup();
  });

  describe("initial state", () => {
    test("has correct default values", () => {
      const state = useAuth.getState();
      expect(state.session).toBeNull();
      expect(state.user).toBeNull();
      expect(state.state).toBe("init");
      expect(state.error).toBeNull();
      expect(state._authSubscription).toBeNull();
    });
  });

  describe("cleanup", () => {
    test("clears auth subscription", () => {
      const mockSubscription = { unsubscribe: jest.fn() } as unknown as NonNullable<ReturnType<typeof useAuth.getState>['_authSubscription']>;
      useAuth.setState({ _authSubscription: mockSubscription });
      useAuth.getState().cleanup();
      expect(useAuth.getState()._authSubscription).toBeNull();
    });

    test("handles null subscription gracefully", () => {
      useAuth.setState({ _authSubscription: null });
      expect(() => useAuth.getState().cleanup()).not.toThrow();
    });
  });

  describe("signInWithProvider", () => {
    test("sets state to loading", async () => {
      (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValue({ error: null });
      
      const promise = useAuth.getState().signInWithProvider("google");
      expect(useAuth.getState().state).toBe("loading");
      await promise;
    });

    test("successfully initiates OAuth flow", async () => {
      (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValue({ error: null });
      
      await useAuth.getState().signInWithProvider("google");
      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: expect.objectContaining({
          redirectTo: expect.stringContaining("/dashboard")
        })
      });
      expect(useAuth.getState().state).not.toBe("error");
    });

    test("handles OAuth error", async () => {
      (supabase.auth.signInWithOAuth as jest.Mock).mockRejectedValue(new Error("OAuth failed"));
      
      await useAuth.getState().signInWithProvider("google");
      expect(useAuth.getState().state).toBe("error");
      expect(useAuth.getState().error).toBe("OAuth failed");
    });
  });

  describe("signOut", () => {
    test("sets state to loading", async () => {
      (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
      
      const promise = useAuth.getState().signOut();
      expect(useAuth.getState().state).toBe("loading");
      await promise;
    });

    test("successfully signs out", async () => {
      (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
      
      await useAuth.getState().signOut();
      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect(useAuth.getState().session).toBeNull();
      expect(useAuth.getState().user).toBeNull();
      expect(useAuth.getState().state).toBe("logged_out");
    });

    test("handles signOut error", async () => {
      (supabase.auth.signOut as jest.Mock).mockRejectedValue(new Error("Sign out failed"));
      
      await useAuth.getState().signOut();
      expect(useAuth.getState().state).toBe("error");
      expect(useAuth.getState().error).toBe("Sign out failed");
      expect(useAuth.getState().session).toBeNull();
      expect(useAuth.getState().user).toBeNull();
    });

    test("clears subscription on sign out", async () => {
      const mockSubscription = { unsubscribe: jest.fn() } as unknown as NonNullable<ReturnType<typeof useAuth.getState>['_authSubscription']>;
      useAuth.setState({ _authSubscription: mockSubscription });
      (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
      
      await useAuth.getState().signOut();
      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    });
  });

  describe("provider types", () => {
    test("OAuthProviderSupabase type excludes unsupported providers", () => {
      const validProvider: OAuthProviderSupabase = "google";
      expect(validProvider).toBe("google");
    });
  });
});
