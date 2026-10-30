# SQLite persistence

SQLite adapter for the shared NodeTool repository. Uses the existing NodeTool
table names and JSON column codecs. The caller encrypts secret values before
persistence and closes the repository during shutdown. Startup applies the frozen
execution-table baseline and subsequent execution-table migrations atomically.
Historical asset timestamps and sketch links are preserved. The adapter records
its selected migrations separately from the full feature migration chain.

```typescript
import { createSqliteRepository } from "@nodetool-ai/database-sqlite";

const repository = createSqliteRepository("nodetool.sqlite");
const workflows = await repository.list("workflows", "user-id");
repository.close();
```

See [backend standards](../AGENTS.md).
