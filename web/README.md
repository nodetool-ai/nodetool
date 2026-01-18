# NodeTool Web UI

React/TypeScript visual AI workflow builder. Built with Vite, ReactFlow, and Material-UI for drag-and-drop workflow creation.

## Technology Stack

- **React 18.2** - UI framework with TypeScript
- **Vite 6** - Build tool and dev server
- **ReactFlow (XYFlow)** - Visual node graph editor
- **Material UI v7** - Component library with Emotion styling
- **Zustand** - Client state management
- **TanStack React Query** - Server state management
- **Supabase** - Authentication and persistence
- **Dockview** - Dashboard layout system
- **Lexical** - Rich text editing
- **Xterm.js** - Terminal emulation
- **Wavesurfer.js** - Audio waveform visualization
- **ELK.js** - Graph auto-layout algorithm

## Project Structure

```
web/
├── src/
│   ├── components/         # UI components (organized by feature)
│   │   ├── asset_viewer/   # Asset preview components
│   │   ├── assets/         # Asset management
│   │   ├── chat/           # Chat interfaces
│   │   ├── node/           # Node visualization
│   │   ├── node_editor/    # Workflow editor
│   │   ├── node_menu/      # Node selection menu
│   │   ├── panels/         # UI panels
│   │   ├── properties/     # Property editors
│   │   └── workflows/      # Workflow management
│   ├── stores/             # Zustand state stores
│   ├── hooks/              # Custom React hooks
│   ├── contexts/           # React contexts
│   ├── utils/              # Utility functions
│   ├── serverState/        # TanStack Query hooks
│   ├── lib/                # Third-party integrations
│   ├── core/               # Core functionality
│   ├── config/             # Configuration
│   └── styles/             # Global styles
├── public/                 # Static assets
├── tests/
│   ├── e2e/                # Playwright E2E tests
│   └── unit/               # Unit tests
└── package.json
```

## Development

### Commands

```bash
# Install dependencies
npm install

# Run development server (port 3000)
npm start

# Run in production mode (for testing)
npm run build
npm run preview

# Type checking
npm run typecheck

# Linting
npm run lint              # Run ESLint
npm run lint:fix          # Auto-fix linting issues

# Testing
npm test                  # Run all tests
npm run test:watch        # Watch mode for development
npm run test:coverage     # Generate coverage report
npm run test:summary      # Summary output only

# End-to-end testing
npm run test:e2e          # Run all E2E tests
npm run test:e2e:ui       # Interactive UI mode
npm run test:e2e:headed   # See browser
```

### Mini App Routes

Two ways to run workflows:

#### Full Mini App (`/apps/:workflowId`)

Standard app with header, panels, navigation:
- Access: `http://localhost:3000/apps/{workflow-id}`
- Part of main bundle
- Full UI features

#### Standalone Mini App (`/miniapp/:workflowId`)

Lightweight standalone version:
- Access: `/miniapp/{workflow-id}`
- Code-split lazy component
- No header, panels, or navigation
- Fast loading
- Good for sharing

### API Configuration

- **Development API**: `http://localhost:7777`
- **WebSocket**: `ws://localhost:7777/ws`

Configure via environment variables (see `.env.example`).

## Testing

The web application uses:
- **Jest** - Unit and integration tests
- **React Testing Library** - Component testing
- **Playwright** - E2E testing

See [TESTING.md](TESTING.md) for comprehensive testing guide.
See [TEST_HELPERS.md](TEST_HELPERS.md) for test utilities and patterns.

## Build

```bash
# Production build
npm run build

# Output in dist/ directory
```

## Related Documentation

- **[Root AGENTS.md](../AGENTS.md)** - Project overview and guidelines
- **[Web AGENTS.md](src/AGENTS.md)** - Web application structure
- **[Components Guide](src/components/AGENTS.md)** - Component patterns
- **[Stores Guide](src/stores/AGENTS.md)** - State management
- **[Hooks Guide](src/hooks/AGENTS.md)** - Custom hooks
- **[Testing Guide](TESTING.md)** - Testing documentation
- **[NodeTool Docs](https://docs.nodetool.ai)** - User documentation
