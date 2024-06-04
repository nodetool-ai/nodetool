import { create } from "zustand";
import { client, useRemoteAuth } from "./ApiClient";
import { OAuthAuthorizeRequest, User } from "./ApiTypes";
import { devLog } from "../utils/DevLog";

export type OAuthProvider = "google" | "facebook";

export interface LoginStore {
  user: User | null;
  getUser: () => User | null;
  setUser: (user: User | null) => void;
  oauthLogin: (provider: OAuthProvider, redirect_uri?: string) => Promise<void>;
  oauthCallback: (req: OAuthAuthorizeRequest) => Promise<User>;
  oauthState: () => string | null;
  saveToStorage: (user: User | null) => void;
  readFromStorage: () => User | null;
  signout: () => Promise<void>;
}

export const useAuth = create<LoginStore>((set, get) => ({
  user: null,

  /**
   * Get user
   */
  getUser: () => {
    const user = get().user;
    if (user) {
      return user;
    } else {
      const u = get().readFromStorage();
      set({ user: u });
      return u;
    }
  },

  /**
   * Set user
   */
  setUser: (user: User | null) => {
    set({ user });
    get().saveToStorage(user);
  },

  /**
   * Redirect the user to the OAuth provider's login page.
   *
   * @param provider The OAuth provider to use.
   * @returns A promise that resolves when the user is redirected.
   */
  oauthLogin: async (provider: OAuthProvider, redirect_uri?: string) => {
    if (redirect_uri === undefined) {
      redirect_uri = window.location.origin + "/oauth/callback";
    }
    const { error, data } = await client.POST("/api/auth/oauth/login", {
      body: {
        provider: provider,
        redirect_uri: redirect_uri
      }
    });
    if (error) {
      throw error;
    }
    sessionStorage.setItem("oauth_state", data.state);
    window.location.href = data.url;
  },

  /**
   * Handle the OAuth callback from the OAuth provider.
   *
   * @param req The OAuth callback request.
   */
  oauthCallback: async (req: OAuthAuthorizeRequest) => {
    if (req.state !== get().oauthState()) {
      throw new Error("Invalid OAuth state");
    }
    sessionStorage.removeItem("oauth_state");
    const { data } = await client.POST("/api/auth/oauth/callback", {
      body: req
    });
    return data as User;
  },

  /**
   * Get the OAuth state from local storage.
   */
  oauthState: () => {
    return sessionStorage.getItem("oauth_state");
  },

  /**
   * Save the user to local storage.
   */
  saveToStorage: (user: User | null) => {
    devLog("saveToStorage", user);
    if (user === null) {
      localStorage.removeItem("user");
    } else {
      localStorage.setItem("user", JSON.stringify(user));
    }
  },

  /**
   * Read the user from local storage.
   */
  readFromStorage: () => {
    if (!useRemoteAuth) {
      return {
        id: "1",
        email: "",
        auth_token: "local_token"
      };
    }
    const user = localStorage.getItem("user");
    if (user) {
      const parsed = JSON.parse(user);
      set({ user: parsed });
      return parsed;
    }
    return null;
  },

  /**
   * Sign the user out and remove the user from local storage.
   */
  signout: async () => {
    localStorage.removeItem("user");
    set({ user: null });
    // window.history.pushState({}, "", "/");
  }
}));

export default useAuth;
