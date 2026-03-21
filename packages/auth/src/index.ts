export {
  TokenType,
  AuthProvider,
  type AuthResult,
} from "./auth-provider.js";

export { LocalAuthProvider } from "./providers/local-provider.js";
export { StaticTokenProvider } from "./providers/static-token-provider.js";
export { MultiUserAuthProvider, type MultiUserAuthProviderOptions } from "./providers/multi-user-provider.js";
export { SupabaseAuthProvider, type SupabaseAuthProviderOptions } from "./providers/supabase-provider.js";

export {
  createAuthMiddleware,
  getUserId,
  HttpError,
  type AuthenticatedUser,
  type AuthMiddlewareOptions,
} from "./middleware.js";

export {
  extractBearerToken,
  authenticateRequest,
  requireAuth,
  type HttpAuthOptions,
} from "./http-auth.js";

// ── User type & helpers ─────────────────────────────────────────────

export interface User {
  id: string;
  role?: string;
}

export function isAdmin(user: User): boolean {
  return user.role === "admin";
}

export { UserManager, type ManagedUser, type CreateUserOptions } from "./user-manager.js";
export {
  FileUserManager,
  type UserRecord,
  type UsersFile,
  type CreateUserResult,
} from "./file-user-manager.js";
