import { create } from "zustand";
import { client, useRemoteAuth } from "./ApiClient";
import { OAuthAuthorizeRequest, User } from "./ApiTypes";
import { devLog } from "../utils/DevLog";

export type OAuthProvider = "google" | "facebook";

export interface LoginStore {
  oauthLogin: (provider: OAuthProvider, redirect_uri: string) => Promise<void>;
  oauthCallback: (req: OAuthAuthorizeRequest) => Promise<User>;
  oauthState: () => string | null;
  readFromStorage: () => User | null;
  saveToStorage: (user: User) => void;
  signout: () => Promise<void>;
}

export const useLoginStore = create<LoginStore>((set, get) => ({
  /**
   * Redirect the user to the OAuth provider's login page.
   *
   * @param provider The OAuth provider to use.
   * @returns A promise that resolves when the user is redirected.
   */
  oauthLogin: async (provider: OAuthProvider, redirect_uri: string) => {
    const { error, data } = await client.POST("/api/auth/oauth/login", {
      body: {
        provider: provider,
        redirect_uri: redirect_uri
      }
    });
    if (error) {
      throw error;
    }
    localStorage.setItem("oauth_state", data.state);
    window.location.href = data.url;
  },

  /**
   * Handle the OAuth callback from the OAuth provider.
   *
   * @param req The OAuth callback request.
   */
  oauthCallback: async (req: OAuthAuthorizeRequest) => {
    if (req.state !== localStorage.getItem("oauth_state")) {
      throw new Error("Invalid OAuth state");
    }
    localStorage.removeItem("oauth_state");
    const { error, data } = await client.POST("/api/auth/oauth/callback", {
      body: req
    });
    if (error) {
      throw error;
    }
    return data;
  },

  /**
   * Get the OAuth state from local storage.
   */
  oauthState: () => {
    return localStorage.getItem("oauth_state");
  },

  /**
   * Save the user to local storage.
   */
  saveToStorage: (user: User) => {
    devLog("saveToStorage", user);
    localStorage.setItem("user", JSON.stringify(user));
  },

  /**
   * Read the user from local storage.
   */
  readFromStorage: () => {
    if (!useRemoteAuth) {
      return {
        id: "1",
        email: ""
      };
    }
    const user = localStorage.getItem("user");
    if (user) {
      return JSON.parse(user);
    }
    return null;
  },

  /**
   * Sign the user out and remove the user from local storage.
   */
  signout: async () => {
    localStorage.removeItem("user");
    window.history.pushState({}, "", "/");
  }
}));
