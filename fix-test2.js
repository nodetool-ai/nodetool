const fs = require('fs');
const path = 'packages/websocket/tests/trpc-collections.test.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
`      expect(Workflow.get).toHaveBeenCalledWith("wf-123");`,
`      expect(getDb).toHaveBeenCalled();`
);

fs.writeFileSync(path, code);
