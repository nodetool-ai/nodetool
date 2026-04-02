/**
 * UserManager — T-SEC-6.
 *
 * In-memory user management with create, findById, and setRole.
 */

import { randomUUID } from "node:crypto";

export interface ManagedUser {
  id: string;
  username: string;
  email: string;
  role: string;
}

export interface CreateUserOptions {
  username: string;
  email: string;
  role?: string;
}

export class UserManager {
  private _users = new Map<string, ManagedUser>();

  create(opts: CreateUserOptions): ManagedUser {
    const user: ManagedUser = {
      id: randomUUID(),
      username: opts.username,
      email: opts.email,
      role: opts.role ?? "user"
    };
    this._users.set(user.id, user);
    return user;
  }

  findById(id: string): ManagedUser | null {
    return this._users.get(id) ?? null;
  }

  setRole(userId: string, role: string): void {
    const user = this._users.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }
    user.role = role;
  }
}
