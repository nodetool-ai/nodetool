export { TokenType, AuthProvider, type AuthResult } from "./auth-provider.js";

export { LocalAuthProvider } from "./providers/local-provider.js";
export {
  DelegatedTokenProvider,
  mintDelegatedToken,
  isDelegatedToken,
  DELEGATED_TOKEN_PREFIX,
  type DelegatedTokenProviderOptions,
  type DelegatedSigningKey,
  type MintedDelegatedToken
} from "./providers/delegated-token-provider.js";
export {
  AppSessionTokenProvider,
  mintAppSessionToken,
  isAppSessionToken,
  APP_SESSION_TOKEN_PREFIX,
  type AppSessionTokenProviderOptions,
  type AppSessionScope,
  type AppSessionSigningKey,
  type MintedAppSessionToken
} from "./providers/app-session-token-provider.js";
export {
  SupabaseAuthProvider,
  type SupabaseAuthProviderOptions
} from "./providers/supabase-provider.js";

export interface User {
  id: string;
  role?: string;
}

export function isAdmin(user: User): boolean {
  return user.role === "admin";
}

export {
  FileUserManager,
  type UserRecord,
  type UsersFile,
  type CreateUserResult
} from "./file-user-manager.js";
