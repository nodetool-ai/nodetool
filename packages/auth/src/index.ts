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
  OidcSessionTokenProvider,
  mintOidcSessionToken,
  isOidcSessionToken,
  OIDC_SESSION_TOKEN_PREFIX,
  type OidcSessionTokenProviderOptions,
  type OidcSessionSigningKey,
  type OidcSessionIdentity,
  type MintedOidcSessionToken
} from "./providers/oidc-session-token-provider.js";
export {
  OidcClient,
  OidcSignInError,
  readOidcConfig,
  oidcUserId,
  createOidcLoginState,
  sealOidcLoginState,
  openOidcLoginState,
  pkceChallenge,
  safeEqual,
  OIDC_CALLBACK_PATH,
  OIDC_LOGIN_PATH,
  OIDC_LOGIN_STATE_TTL_SECONDS,
  type OidcConfig,
  type OidcClientOptions,
  type OidcIdentity,
  type OidcLoginState
} from "./oidc.js";
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
