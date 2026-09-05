# @nodetool-ai/auth

Authentication and authorization for [NodeTool](https://nodetool.ai) — pluggable auth providers (local, Supabase, delegated and app-session tokens) and a file-backed user store.

This package owns the auth surface for the NodeTool backend: token verification, user records and admin/role checks. The server (`packages/websocket`) picks a provider at startup and gates HTTP and WebSocket requests in its own `onRequest` hook.

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
| `SupabaseAuthProvider` | class | Verifies Supabase-issued JWTs |
| `DelegatedTokenProvider` | class | Verifies tokens minted for an external integration |
| `AppSessionTokenProvider` | class | Verifies scoped tokens minted for a deployed app session |
| `mintDelegatedToken` / `mintAppSessionToken` | function | Mint the two token kinds above |
| `isDelegatedToken` / `isAppSessionToken` | function | Prefix checks used to route a token to its provider |
| `isAdmin` | function | Role check for `{ role: "admin" }` users |
| `FileUserManager` | class | File-backed user store |
| `User` / `UserRecord` | interface | User record shapes |

## Usage

```ts
import { LocalAuthProvider, SupabaseAuthProvider } from "@nodetool-ai/auth";

const provider = process.env.SUPABASE_JWT_SECRET
  ? new SupabaseAuthProvider({ supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET })
  : new LocalAuthProvider();

const token = provider.extractTokenFromHeaders(request.headers);
const result = await provider.verifyToken(token ?? "");
if (!result.ok) throw new Error(result.error);
console.log(result.userId);
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
