# @nodetool-ai/cli-local

Local single-user database and secret access for commands that run in process
instead of against a running server. The package root exports nothing. Import
the modules by subpath.

| Module | Export | Behavior |
|---|---|---|
| `local-db` | `LOCAL_USER_ID` | The local user id, `"1"`. |
| `local-db` | `setupLocalDb()` | Opens the local SQLite database, applies migrations, and tries to unlock the secret store. If the store cannot be unlocked it warns on stderr and still resolves, so commands that need no secret keep working. Idempotent. |
| `local-secrets` | `resolveLocalSecret(key)` | Looks the key up in the encrypted store for the local user, then in `process.env`. |

Use `resolveLocalSecret` rather than a bare `getSecret(key)`. Without a user id,
`getSecret` reads `process.env` only, so a key saved with `nodetool secrets store`
is invisible and the provider answers 401.

```ts
import { setupLocalDb } from "@nodetool-ai/cli-local/local-db";
import { resolveLocalSecret } from "@nodetool-ai/cli-local/local-secrets";

await setupLocalDb();
const key = await resolveLocalSecret("OPENAI_API_KEY");
```

Depends on `@nodetool-ai/cli-common`, `config`, `models` and `security`.
