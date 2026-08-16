# @nodetool-ai/auth

Authentication and authorization for [NodeTool](https://nodetool.ai) — pluggable auth providers (local, static token, Supabase), user management, and Fastify HTTP middleware.

This package owns the auth surface for the NodeTool backend: token verification, user records, admin/role checks, and the request middleware that gates the HTTP and WebSocket API. Providers are swappable, so the same server runs single-user local, static-token, or multi-user Supabase auth.

## Install

```bash
npm install @nodetool-ai/auth
```

## Exported symbols

| Symbol | Kind | Description |
| --- | --- | --- |
| `AuthProvider` | class | Base contract every auth provider implements |
| `AuthResult` | type | Result of a token verification attempt |
| `TokenType` | enum | Distinguishes static and user tokens |
| `LocalAuthProvider` | class | Single-user local auth (no external service) |
| `StaticTokenProvider` | class | Shared static bearer token |
| `MultiUserAuthProvider` | class | Multi-user auth backed by a user store |
| `SupabaseAuthProvider` | class | Verifies Supabase-issued JWTs |
| `createAuthMiddleware` | function | Builds request middleware returning an `AuthenticatedUser` |
| `getUserId` | function | Reads the authenticated user id off a request |
| `authenticateRequest` | function | Low-level request authentication |
| `requireAuth` | function | Guard that rejects unauthenticated requests |
| `extractBearerToken` | function | Pulls the bearer token from request headers |
| `HttpError` | class | Error carrying an HTTP status code |
| `isAdmin` | function | Role check for `{ role: "admin" }` users |
| `UserManager` | class | In-memory user management |
| `FileUserManager` | class | File-backed user store |
| `User` / `ManagedUser` / `UserRecord` | interface | User record shapes |

## Usage

```ts
import {
  StaticTokenProvider,
  MultiUserAuthProvider,
  createAuthMiddleware
} from "@nodetool-ai/auth";

const authenticate = createAuthMiddleware({
  // Omit the argument to read STATIC_AUTH_TOKEN / STATIC_AUTH_TOKENS from the
  // environment, or pass a { token: userId } record directly.
  staticProvider: new StaticTokenProvider({ [process.env.MY_TOKEN!]: "1" }),
  userProvider: new MultiUserAuthProvider({ /* ... */ }),
  enforceAuth: true
});

// In a request handler:
const user = await authenticate(request);
console.log(user.userId);
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
