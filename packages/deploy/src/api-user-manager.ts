/**
 * API-based user management for remote deployments.
 *
 * This module provides client-side user management via API.
 * Works with all deployment types: Docker, Root, GCP, RunPod.
 */

// ============================================================================
// Response types
// ============================================================================

export interface UserRecord {
  user_id: string;
  username: string;
  role: string;
  token_hash?: string;
  token?: string;
  created_at: string;
}

export interface UserListResponse {
  users: UserRecord[];
}

export interface RemoveUserResponse {
  message: string;
}

// ============================================================================
// APIUserManager
// ============================================================================

/**
 * Manages users via API (works with ALL deployment types).
 */
export class APIUserManager {
  private readonly serverUrl: string;
  private readonly adminToken: string;

  /**
   * @param serverUrl - Base URL of the deployment (e.g., http://example.com:7777).
   * @param adminToken - Bearer token of an admin user.
   */
  constructor(serverUrl: string, adminToken: string) {
    this.serverUrl = serverUrl.replace(/\/+$/, "");
    this.adminToken = adminToken;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.adminToken}`,
      "Content-Type": "application/json"
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.serverUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: this.headers
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
    }

    return (await response.json()) as T;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * List all users via API.
   *
   * @returns Array of user records (with masked tokens).
   */
  async listUsers(): Promise<UserRecord[]> {
    const data = await this.request<UserListResponse>("GET", "/api/users/");
    return data.users ?? [];
  }

  /**
   * Add a user via API.
   *
   * @param username - Username for the new user.
   * @param role - User role ("admin" or "user").
   * @returns User record with plaintext token (only shown on creation).
   */
  async addUser(username: string, role: string = "user"): Promise<UserRecord> {
    return this.request<UserRecord>("POST", "/api/users/", {
      username,
      role
    });
  }

  /**
   * Generate a new token for a user via API.
   *
   * @param username - Username to reset token for.
   * @returns User record with new plaintext token.
   */
  async resetToken(username: string): Promise<UserRecord> {
    return this.request<UserRecord>("POST", "/api/users/reset-token", {
      username
    });
  }

  /**
   * Remove a user via API.
   *
   * @param username - Username to remove.
   * @returns Success message.
   */
  async removeUser(username: string): Promise<RemoveUserResponse> {
    return this.request<RemoveUserResponse>(
      "DELETE",
      `/api/users/${encodeURIComponent(username)}`
    );
  }
}
