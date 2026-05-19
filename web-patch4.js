const fs = require('fs');
const file = 'web/src/components/node_types/editing/MasksExtractorBody.test.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  `mockUseNodes.mockReturnValue(undefined);`,
  `mockUseNodes.mockImplementation((selector) => selector({ edges: [] }));`
);

fs.writeFileSync(file, code);
