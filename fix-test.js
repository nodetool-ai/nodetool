const fs = require('fs');
const path = 'packages/websocket/tests/trpc-collections.test.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
`import { Workflow, getDb } from "@nodetool-ai/models";`,
`import { getDb } from "@nodetool-ai/models";`
);

code = code.replace(
`    Workflow: { ...actual.Workflow, get: vi.fn() },
    getDb: vi.fn(),`,
`    getDb: vi.fn(),`
);

fs.writeFileSync(path, code);
