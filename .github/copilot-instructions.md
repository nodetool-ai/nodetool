# GitHub Copilot Instructions for NodeTool

This file provides specific guidance for GitHub Copilot when generating code suggestions and completions for the NodeTool project.

## Project Context

NodeTool is a React/TypeScript application for building AI workflows visually. Key technologies:

- **Frontend**: React 18.2, TypeScript 5.7, Vite, Material-UI (MUI) v7
- **State Management**: Zustand 4.5 with temporal (undo/redo) support
- **Flow Editor**: ReactFlow (@xyflow/react) v12
- **Data Fetching**: TanStack Query (React Query) v5
- **Testing**: Jest 29 + React Testing Library 16
- **Routing**: React Router v7

## Code Generation Guidelines

### TypeScript Patterns

Always use TypeScript with explicit types. Avoid `any` types.

```typescript
// ✅ Good
interface NodeData {
  properties: Record<string, unknown>;
  workflow_id: string;
}

const updateNode = (id: string, data: NodeData): void => {
  // implementation
};

// ❌ Bad
const updateNode = (id: any, data: any) => {
  // implementation
};
```

### React Component Patterns

Use functional components with TypeScript interfaces for props:

```typescript
// ✅ Good
interface MyComponentProps {
  title: string;
  onSave?: (data: string) => void;
  isLoading?: boolean;
}

export const MyComponent: React.FC<MyComponentProps> = ({ 
  title, 
  onSave, 
  isLoading = false 
}) => {
  return <div>{title}</div>;
};

// ❌ Bad
export const MyComponent = (props) => {
  return <div>{props.title}</div>;
};
```

### Hooks Usage

#### Custom Hooks

Prefix with `use` and include TypeScript return types:

```typescript
// ✅ Good
export const useNodeSelection = (nodeId: string): {
  isSelected: boolean;
  select: () => void;
  deselect: () => void;
} => {
  const [isSelected, setIsSelected] = useState(false);
  
  return {
    isSelected,
    select: () => setIsSelected(true),
    deselect: () => setIsSelected(false)
  };
};
```

#### useCallback and useMemo

Use for optimization when passing to child components or expensive calculations:

```typescript
// ✅ Good
const handleClick = useCallback((nodeId: string) => {
  // handler logic
}, [dependencies]);

const expensiveValue = useMemo(() => 
  computeExpensiveValue(data), 
  [data]
);
```

### Zustand Store Patterns

Follow the existing pattern for store creation:

```typescript
// ✅ Good
interface MyStoreState {
  items: Item[];
  selectedId: string | null;
  setItems: (items: Item[]) => void;
  selectItem: (id: string) => void;
}

export const useMyStore = create<MyStoreState>((set, get) => ({
  items: [],
  selectedId: null,
  
  setItems: (items) => set({ items }),
  
  selectItem: (id) => set({ selectedId: id }),
}));

// Use selectors to prevent unnecessary re-renders
const items = useMyStore(state => state.items);
const setItems = useMyStore(state => state.setItems);
```

### Material-UI (MUI) Patterns

Use MUI components consistently with theme values:

```typescript
// ✅ Good
import { Button, Typography, Box } from '@mui/material';
import { styled } from '@mui/material/styles';

const StyledButton = styled(Button)(({ theme }) => ({
  borderRadius: theme.spacing(1),
  padding: theme.spacing(1, 2),
  backgroundColor: theme.vars.palette.primary.main,
}));

// Use sx prop for one-off styles
<Box sx={{ p: 2, mb: 1, bgcolor: 'background.paper' }}>
  <Typography variant="h6">Title</Typography>
</Box>
```

### Test Patterns

Generate tests following the React Testing Library approach:

```typescript
// ✅ Good
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('handles user interaction', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    
    render(<MyComponent onSave={onSave} />);
    
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalled();
  });
  
  it('displays error state', async () => {
    render(<MyComponent error="Failed to load" />);
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });
});
```

### API Client Patterns

Use the existing ApiClient for HTTP requests:

```typescript
// ✅ Good
import { ApiClient } from '../stores/ApiClient';

const fetchWorkflow = async (id: string): Promise<Workflow> => {
  const response = await ApiClient.get(`/api/workflows/${id}`);
  return response.data;
};
```

### TanStack Query Patterns

Use React Query for server state management:

```typescript
// ✅ Good
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const useWorkflow = (workflowId: string) => {
  return useQuery({
    queryKey: ['workflows', workflowId],
    queryFn: () => fetchWorkflow(workflowId),
    staleTime: 5000,
    enabled: !!workflowId
  });
};

export const useUpdateWorkflow = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: UpdateWorkflowData) => updateWorkflow(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
    }
  });
};
```

## File Structure Conventions

### Component Files

```
MyComponent/
├── MyComponent.tsx          # Main component
├── MyComponent.test.tsx     # Tests
├── MyComponentStyles.tsx    # Styled components (if needed)
└── index.ts                 # Re-export
```

### Store Files

```
stores/
├── MyStore.ts
└── __tests__/
    └── MyStore.test.ts
```

## Naming Conventions

- **Components**: PascalCase (`MyComponent`)
- **Hooks**: camelCase with `use` prefix (`useMyHook`)
- **Stores**: camelCase with `use` prefix (`useMyStore`)
- **Utilities**: camelCase (`formatDate`, `validateInput`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_NODES`, `DEFAULT_TIMEOUT`)
- **Types/Interfaces**: PascalCase (`NodeData`, `WorkflowState`)
- **Test files**: Same as source + `.test.ts(x)`

## Import Order

Follow this order for imports:

```typescript
// 1. React and core libraries
import React, { useState, useEffect } from 'react';

// 2. Third-party libraries
import { Button, Box } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

// 3. Internal stores and contexts
import { useNodeStore } from '../stores/NodeStore';
import { useWorkflowContext } from '../contexts/WorkflowContext';

// 4. Internal components
import { MyComponent } from '../components/MyComponent';

// 5. Internal utilities and types
import { formatDate } from '../utils/formatDate';
import type { NodeData } from '../types';

// 6. Styles
import './styles.css';
```

## Error Handling

Always handle errors appropriately:

```typescript
// ✅ Good
const MyComponent: React.FC = () => {
  const { data, error, isLoading } = useQuery({
    queryKey: ['data'],
    queryFn: fetchData
  });
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  if (error) {
    return <ErrorMessage error={error} />;
  }
  
  return <div>{data}</div>;
};

// ✅ Good for async functions
const saveData = async (data: Data): Promise<void> => {
  try {
    await ApiClient.post('/api/data', data);
  } catch (error) {
    console.error('Failed to save data:', error);
    throw error; // Re-throw for caller to handle
  }
};

// ✅ Good - Always add comments for intentionally empty catch blocks
try {
  const parsed = JSON.parse(jsonString);
  return parsed;
} catch (error) {
  // JSON parse failed, return original string
  return jsonString;
}

// ❌ Bad - Empty catch blocks without explanation
try {
  JSON.parse(jsonString);
} catch (error) {}

// ✅ Good - Throw proper Error objects, not strings
if (!data) {
  throw new Error("Data is required");
}

// ❌ Bad - Throwing non-Error objects
if (!data) {
  throw "Data is required";
}
```

## Code Quality Best Practices

### Equality Checks

Always use strict equality (`===` and `!==`) instead of loose equality (`==` and `!=`):

```typescript
// ✅ Good
if (value === null) { }
if (count === 0) { }
if (nodeType === "nodetool.group.Loop") { }

// ❌ Bad
if (value == null) { }
if (count == 0) { }
if (nodeType == "nodetool.group.Loop") { }

// Exception: null checks can use == for brevity (checks both null and undefined)
if (value == null) { } // Acceptable for null/undefined check
```

### Control Flow

Always use curly braces for control statements, even single-line ones:

```typescript
// ✅ Good
if (condition) {
  doSomething();
}

// ⚠️ Acceptable but discouraged
if (condition) doSomething();

// ❌ Never do this
if (condition)
  doSomething();
```

### Array Type Checking

Use `Array.isArray()` instead of typeof when checking for arrays:

```typescript
// ✅ Good
if (Array.isArray(message.content)) {
  message.content.map(item => /* ... */);
}

// ❌ Bad - typeof returns "object" for arrays
if (typeof message.content === "object") {
  message.content.map(item => /* ... */); // TypeScript error
}
```

### Variable Declarations

Use `const` by default, `let` when reassignment is needed. Never use `var`:

```typescript
// ✅ Good
const maxRetries = 3;
let retryCount = 0;

// ❌ Bad
var maxRetries = 3;
var retryCount = 0;
```

## Accessibility

Always consider accessibility:

```typescript
// ✅ Good
<Button 
  onClick={handleClick}
  aria-label="Save workflow"
  disabled={isLoading}
>
  {isLoading ? 'Saving...' : 'Save'}
</Button>

<TextField
  label="Workflow Name"
  aria-describedby="name-helper-text"
  error={!!error}
  helperText={error || "Enter a unique name"}
/>
```

## Performance Considerations

### Avoid Unnecessary Re-renders

```typescript
// ✅ Good - selective subscription
const nodeName = useNodeStore(state => state.nodes[nodeId]?.name);

// ❌ Bad - subscribes to all nodes
const nodes = useNodeStore(state => state.nodes);
const nodeName = nodes[nodeId]?.name;

// ✅ Good - memoize expensive calculations
const sortedNodes = useMemo(() => 
  nodes.sort((a, b) => a.position.x - b.position.x),
  [nodes]
);

// ✅ Good - stable callbacks
const handleNodeClick = useCallback((nodeId: string) => {
  selectNode(nodeId);
}, [selectNode]);
```

### Code Splitting

Use dynamic imports for large components:

```typescript
// ✅ Good
const HeavyComponent = React.lazy(() => import('./HeavyComponent'));

<Suspense fallback={<LoadingSpinner />}>
  <HeavyComponent />
</Suspense>
```

## Security

### Sanitize User Input

```typescript
// ✅ Good
import DOMPurify from 'dompurify';

const sanitizedHtml = DOMPurify.sanitize(userInput);
```

### Avoid Dangerous Props

```typescript
// ❌ Bad
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// ✅ Good
<div>{userInput}</div>
// or use a markdown library with XSS protection
```

## Common Patterns in This Project

### Node Operations

```typescript
// Adding a node
const addNode = useNodeStore(state => state.addNode);
addNode({
  id: generateId(),
  type: 'custom_node',
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    workflow_id: workflowId
  }
});

// Updating node data
const updateNode = useNodeStore(state => state.updateNode);
updateNode(nodeId, { 
  data: { properties: { ...newProperties } } 
});
```

### Edge/Connection Operations

```typescript
const addEdge = useNodeStore(state => state.addEdge);
addEdge({
  id: `${sourceId}-${targetId}`,
  source: sourceId,
  target: targetId,
  sourceHandle: 'output',
  targetHandle: 'input'
});
```

### Asset Upload

```typescript
const { uploadAsset } = useAssetUpload();

const handleFileUpload = async (file: File) => {
  try {
    const asset = await uploadAsset(file, workflowId);
    console.log('Uploaded:', asset);
  } catch (error) {
    console.error('Upload failed:', error);
  }
};
```

## What NOT to Do

### ❌ Don't use deprecated React patterns

```typescript
// ❌ Bad
class MyComponent extends React.Component { }

// ❌ Bad
componentWillMount() { }

// ✅ Good - use functional components and hooks
const MyComponent: React.FC = () => { };
```

### ❌ Don't mutate state directly

```typescript
// ❌ Bad
state.nodes.push(newNode);

// ✅ Good
setState({ nodes: [...state.nodes, newNode] });
```

### ❌ Don't use inline functions in JSX (when passed to child components)

```typescript
// ❌ Bad - creates new function on every render
<Button onClick={() => handleClick(id)} />

// ✅ Good - stable reference
const onClick = useCallback(() => handleClick(id), [id]);
<Button onClick={onClick} />
```

### ❌ Don't test implementation details

```typescript
// ❌ Bad
expect(component.state.count).toBe(1);

// ✅ Good
expect(screen.getByText('Count: 1')).toBeInTheDocument();
```

## Testing Checklist

When generating test code:

- [ ] Use React Testing Library queries (getByRole, getByLabelText, etc.)
- [ ] Use userEvent for interactions (not fireEvent)
- [ ] Use waitFor for async assertions
- [ ] Mock external dependencies
- [ ] Test user-facing behavior, not implementation
- [ ] Use descriptive test names
- [ ] Clean up subscriptions/timers in afterEach
- [ ] Test error states
- [ ] Test loading states
- [ ] Test edge cases

## Documentation

Add JSDoc comments for complex functions:

```typescript
/**
 * Calculates the optimal layout for nodes in the workflow.
 * 
 * @param nodes - Array of nodes to layout
 * @param edges - Array of edges connecting nodes
 * @param direction - Layout direction ('TB' | 'LR')
 * @returns Promise resolving to positioned nodes
 * 
 * @example
 * const positioned = await calculateLayout(nodes, edges, 'TB');
 */
export async function calculateLayout(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR'
): Promise<Node[]> {
  // implementation
}
```

## Resources

- Main AGENTS.md: `/AGENTS.md` - Complete project documentation
- Web README: `/web/README.md` - Web-specific documentation  
- Testing Guide: `/web/TESTING.md` - Comprehensive test documentation
- Component Guide: `/web/src/components/AGENTS.md` - Component architecture
- Store Guide: `/web/src/stores/AGENTS.md` - State management patterns

## Mandatory Post-Change Verification

After making any code changes, you MUST run the following commands to ensure code quality:

```bash
make typecheck  # Type check all packages
make lint       # Lint all packages
make test       # Run all tests
```

**Keep it green** - All three commands must pass with exit code 0 before considering the task complete.

If any of these commands fail:
1. Fix the errors reported
2. Re-run the failing command(s)
3. Continue until all three pass

This ensures:
- Type safety across the codebase
- Consistent code style and patterns
- No regressions in existing functionality

---

## Quick Reference Commands (Make)

```bash
# Quality Checks (run after every change)
make typecheck        # Type check all packages
make lint             # Lint all packages
make test             # Run all tests
make check            # Run all checks (typecheck, lint, test)

# Fix issues
make lint-fix         # Auto-fix linting issues
make format           # Alias for lint-fix

# Development
make electron         # Build web and start electron app
make build            # Build all packages
```

## Quick Reference Commands (Individual Packages)

### Web Package

```bash
cd web && npm start              # Start dev server
cd web && npm test               # Run tests
cd web && npm run test:watch     # Watch mode
cd web && npm run test:coverage  # With coverage
cd web && npm run typecheck      # TypeScript check
cd web && npm run lint           # ESLint
cd web && npm run lint:fix       # Auto-fix lint issues
cd web && npm run build          # Production build
cd web && npm run test:e2e       # Run e2e tests
```

### Electron Package

```bash
cd electron && npm start         # Start electron dev server
cd electron && npm test          # Run tests
cd electron && npm run typecheck # TypeScript check
cd electron && npm run lint      # ESLint
cd electron && npm run lint:fix  # Auto-fix lint issues
cd electron && npm run build     # Production build
```

---

## Setting Up for E2E Tests

E2E tests require both the Python backend and Node.js frontend to be running. Follow these steps:

### 1. Set Up Python Environment

```bash
# Create conda environment (first time only)
conda env create -f environment.yml -n nodetool

# Activate the environment
conda activate nodetool

# Install nodetool packages
uv pip install git+https://github.com/nodetool-ai/nodetool-core git+https://github.com/nodetool-ai/nodetool-base

# Verify installation
nodetool --help
```

### 2. Install Web Dependencies

```bash
cd web
npm install

# Install Playwright browsers (first time only)
npx playwright install chromium
```

### 3. Run E2E Tests

**Option A: Automatic Setup (Recommended)**
The Playwright configuration automatically starts both servers:

```bash
cd web
npm run test:e2e
```

**Option B: Manual Setup**
Start servers manually for debugging:

```bash
# Terminal 1: Start backend
conda activate nodetool
nodetool serve --port 7777

# Terminal 2: Start frontend
cd web
npm start

# Terminal 3: Run tests
cd web
npx playwright test
```

### 4. E2E Test Structure

E2E tests are located in `web/tests/e2e/` and use Playwright:

- **app-loads.spec.ts**: Basic app loading, navigation, and API connectivity tests

### 5. Writing E2E Tests

Follow these patterns when creating new e2e tests:

```typescript
import { test, expect } from "@playwright/test";

// Skip when run by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Feature Name", () => {
    test("should do something", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      
      // Your test logic here
      expect(await page.title()).toBeTruthy();
    });
  });
}
```

### 6. Debugging E2E Tests

```bash
# Run with UI mode for interactive debugging
cd web
npm run test:e2e:ui

# Run in headed mode to see the browser
cd web
npm run test:e2e:headed

# View trace files after failure
npx playwright show-trace test-results/path-to-trace/trace.zip
```

For more details, see `web/TESTING.md`.

## Setting Up for Electron E2E Tests

Electron e2e tests verify the desktop application integration, IPC handlers, and native features.

### 1. Install Electron Dependencies

```bash
cd electron
npm install
```

### 2. Install Playwright Browsers

```bash
cd electron
npx playwright install chromium
```

### 3. Build the Electron App

The e2e tests require a built version of the Electron app:

```bash
cd electron
npm run vite:build
npx tsc
```

### 4. Run E2E Tests

```bash
cd electron
npm run test:e2e          # Run e2e tests
npm run test:e2e:ui       # Run with Playwright UI
npm run test:e2e:headed   # Run in headed mode (see window)
```

### 5. Electron E2E Test Structure

E2E tests are located in `electron/tests/e2e/` and use Playwright with Electron support:

- **app-loads.spec.ts**: Basic app loading, window creation, and IPC communication tests

### 6. Writing Electron E2E Tests

Follow these patterns when creating new Electron e2e tests:

```typescript
import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';

// Skip when run by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Feature Name", () => {
    test("should do something", async () => {
      // Launch Electron app
      const electronApp = await electron.launch({
        args: [
          path.join(__dirname, '../../dist-electron/main.js'),
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ],
        env: {
          ...process.env,
          ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
        }
      });

      const window = await electronApp.firstWindow();
      
      // Your test logic here
      expect(window).toBeTruthy();
      
      // Always close the app
      await electronApp.close();
    });
  });
}
```

### 7. Debugging Electron E2E Tests

```bash
# Run with UI mode for interactive debugging
cd electron
npm run test:e2e:ui

# Run in headed mode to see the Electron window
cd electron
npm run test:e2e:headed

# View trace files after failure
npx playwright show-trace test-results/path-to-trace/trace.zip
```

### 8. Electron E2E CI/CD

The `.github/workflows/electron-e2e.yml` workflow:
- Runs on Ubuntu, macOS, and Windows
- Installs dependencies and Playwright browsers
- Builds the Electron app
- Runs e2e tests
- Uploads artifacts on failure

For more details, see `electron/README.md`.

## Version Information

- React: 18.2.0
- TypeScript: 5.7.2
- Material-UI: 7.2.0
- Zustand: 4.5.7
- ReactFlow: 12.8.2
- TanStack Query: 5.62.3
- Jest: 29.7.0
- React Testing Library: 16.1.0

---

**Remember**: Follow the established patterns in the codebase. When in doubt, look at existing implementations in the same domain before creating new patterns.
