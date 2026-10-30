# PostgreSQL persistence

Independently installed PostgreSQL adapter for the execution server repository.
Uses postgres.js, Drizzle, and the PostgreSQL schemas shared by full NodeTool.
The SQLite executable does not depend on this package.

```typescript
import { createPostgresRepository } from "@nodetool-ai/database-postgres";

const repository = await createPostgresRepository(process.env.DATABASE_URL ?? "");
const workflows = await repository.list("workflows", "user-id");
await repository.close();
```

Startup applies only the execution-table migrations in the public schema. Full
feature migrations keep their own tracking. Secrets must be encrypted by the
caller. Tests run against PGlite's embedded PostgreSQL engine and persist data
across engine restarts.

See [backend standards](../AGENTS.md).
