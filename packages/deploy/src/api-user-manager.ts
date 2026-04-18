/**
 * API-based user management for remote deployments.
 *
 * Client-side user management via tRPC (`/trpc/users.*`). Works with all
 * deployment types: Docker, Root, GCP, RunPod. The public `APIUserManager`
 * class preserves the legacy interface so existing deployment code that
 * imports it doesn't need to change.
 */

import {
  createTRPCClient,
  httpBatchLink,
  type TRPCClient
} from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@nodetool/websocket/trpc";

// ============================================================================
// Response types (kept for backward compatibility with existing deploy code)
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
 * Manages users via tRPC against the deployment's `/trpc/users.*` endpoints.
 *
 * The constructor accepts an optional third parameter — a pre-built
 * `TRPCClient<AppRouter>` — for dependency-injection in tests. When omitted,
 * a client is built on the fly using `serverUrl` + `adminToken`.
 */
export class APIUserManager {
  private readonly serverUrl: string;
  private readonly adminToken: string;
  private readonly client: TRPCClient<AppRouter>;

  /**
   * @param serverUrl - Base URL of the deployment (e.g., http://example.com:7777).
   * @param adminToken - Bearer token of an admin user.
   * @param client - Optional pre-built tRPC client (primarily for testing).
   */
  constructor(
    serverUrl: string,
    adminToken: string,
    client?: TRPCClient<AppRouter>
  ) {
    this.serverUrl = serverUrl.replace(/\/+$/, "");
    this.adminToken = adminToken;
    this.client = client ?? this.buildClient();
  }

  private buildClient(): TRPCClient<AppRouter> {
    return createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${this.serverUrl}/trpc`,
          transformer: superjson,
          headers: {
            Authorization: `Bearer ${this.adminToken}`
          }
        })
      ]
    });
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * List all users.
   *
   * @returns Array of user records (with masked token hashes).
   */
  async listUsers(): Promise<UserRecord[]> {
    const result = await this.client.users.list.query();
    return result.users;
  }

  /**
   * Add a user.
   *
   * @param username - Username for the new user.
   * @param role - User role ("admin" or "user"), default "user".
   * @returns User record with plaintext token (only shown on creation).
   */
  async addUser(username: string, role: string = "user"): Promise<UserRecord> {
    return this.client.users.create.mutate({ username, role });
  }

  /**
   * Generate a new token for an existing user.
   *
   * @param username - Username to reset token for.
   * @returns User record with new plaintext token.
   */
  async resetToken(username: string): Promise<UserRecord> {
    return this.client.users.resetToken.mutate({ username });
  }

  /**
   * Remove a user.
   *
   * @param username - Username to remove.
   * @returns Success message.
   */
  async removeUser(username: string): Promise<RemoveUserResponse> {
    return this.client.users.remove.mutate({ username });
  }
}
