# Web UI

React/TypeScript code for the NodeTool visual editor. Built with Vite and ReactFlow for drag-and-drop workflow building.

## Prerequisites

- Node.js 20.x or later
- npm 10.x or yarn
- Running NodeTool server (see root README.md)

## Installation

```bash
cd web
npm install
```

## Development

```bash
npm start
```

Access at http://localhost:3000. The server runs with host binding for external access.

## Production Build

```bash
npm run build
```

Output is in `dist/` directory for deployment.

## Project Structure

```
web/src/
├── __tests__/              # Integration tests
├── __mocks__/              # Test mocks and fixtures
├── components/             # React components
│   ├── assets/            # Asset management UI
│   ├── chat/              # Chat interface components
│   ├── dashboard/         # Dashboard layout
│   ├── editor/            # Editor UI (tabs, panels)
│   ├── node/              # Node rendering components
│   ├── node_editor/       # Node editor core
│   ├── node_menu/         # Node selection menu
│   ├── node_types/        # Specific node type implementations
│   ├── panels/            # Side panel components
│   ├── properties/        # Property editors
│   ├── textEditor/        # Rich text editor (Lexical)
│   ├── themes/            # MUI theme configuration
│   └── workflows/         # Workflow management UI
├── contexts/              # React contexts
├── core/                  # Core utilities (graph algorithms)
├── hooks/                 # Custom React hooks
├── lib/                   # Third-party integrations
├── serverState/           # TanStack Query hooks
├── stores/                # Zustand state stores
├── styles/                # Global CSS styles
├── types/                 # TypeScript type definitions
└── utils/                 # Utility functions
```

## Mini App Routes

Two ways to run workflows:

### Full Mini App (`/apps/:workflowId`)

Standard app with header, panels, navigation:
- Access: `http://localhost:3000/apps/{workflow-id}`
- Part of main bundle
- Full UI features

### Standalone Mini App (`/miniapp/:workflowId`)

Lightweight standalone version:
- Access: `/miniapp/{workflow-id}`
- Code-split lazy component
- No header, panels, or navigation
- Fast loading
- Good for sharing

## Testing

See [TESTING.md](TESTING.md) for comprehensive testing documentation.

```bash
npm test                    # Run unit tests
npm run test:watch          # Watch mode for development
npm run test:coverage       # Coverage report
npm run test:e2e            # End-to-end tests
npm run test:e2e:ui         # E2E tests with UI
npm run test:e2e:headed     # E2E tests in browser
```

## Linting & Type Checking

```bash
npm run lint                # Run ESLint
npm run lint:fix            # Auto-fix linting issues
npm run typecheck           # TypeScript type check
```

## Quality Commands

```bash
make typecheck              # Type check all packages
make lint                   # Lint all packages
make test                   # Run all tests
```

## Key Dependencies

- **React 18.2**: UI framework
- **Vite 6**: Build tool and dev server
- **ReactFlow (@xyflow/react)**: Visual node graph editor
- **MUI v7 + Emotion**: Component library and styling
- **Zustand**: State management
- **TanStack Query**: Server state management
- **Supabase**: Authentication
- **Dockview**: Dashboard layout

## Related Documentation

- [Root AGENTS.md](../../AGENTS.md) - Project overview and agent guidelines
- [Web AGENTS.md](AGENTS.md) - Detailed web application guide
- [Testing Guide](TESTING.md) - Testing patterns and practices
- [Component Guide](components/AGENTS.md) - Component architecture
- [Store Guide](stores/AGENTS.md) - State management patterns
- [Hook Guide](hooks/AGENTS.md) - Custom hooks documentation
