# Technology Stack

## Frontend Technologies

### Web Application (`/web`)

#### Core Framework
- **React**: 18.2.0 - UI framework
- **TypeScript**: 5.7.2 - Type safety
- **Vite**: 6.x - Build tool and dev server

#### UI Components & Styling
- **Material-UI (MUI)**: 7.2.0 - Component library
- **@emotion/react**: 11.14.0 - CSS-in-JS
- **@emotion/styled**: 11.13.5 - Styled components

#### State Management
- **Zustand**: 4.5.7 - Global state
  - With temporal middleware for undo/redo
- **React Context**: Component-tree state
- **TanStack Query (React Query)**: 5.62.3 - Server state

#### Flow Editor
- **@xyflow/react**: 12.9.3 - Node-based editor
- **ReactFlow**: Visual workflow canvas
- **elkjs**: 0.9.3 - Automatic layout

#### Data & Communication
- **axios**: 1.12.0 - HTTP client
- **WebSocket**: Real-time workflow execution
- **@msgpack/msgpack**: 3.0.0-beta2 - Binary serialization
- **openapi-fetch**: 0.14.0 - Type-safe API client

#### Additional Libraries
- **React Router**: 7.x - Routing
- **@tanstack/react-virtual**: 3.11.0 - Virtual scrolling
- **dockview-react**: 4.4.0 - Docking panels
- **@lexical/react**: 0.32.1 - Rich text editor
- **@monaco-editor/react**: 4.7.0 - Code editor
- **@react-three/fiber**: 8.18.0 - 3D rendering
- **plotly.js**: 1.0.6 - Data visualization
- **fuse.js**: 7.0.0 - Fuzzy search
- **luxon**: 3.5.0 - Date/time handling

### Electron Application (`/electron`)

#### Core
- **Electron**: 35.7.5 - Desktop app framework
- **Node.js**: 20.x - Runtime
- **TypeScript**: 5.3.3 - Type safety

#### Build Tools
- **Vite**: 6.4.1 - Build tool
- **electron-builder**: 26.3.4 - App packaging
- **vite-plugin-electron**: 0.29.0 - Vite integration

### Mobile Application (`/mobile`)

#### Core
- **React Native**: Latest via Expo
- **Expo**: Managed React Native platform
- **TypeScript**: 5.x - Type safety

## Testing Technologies

### Unit/Integration Testing
- **Jest**: 29.7.0 - Test framework
- **React Testing Library**: 16.1.0 - React component testing
- **@testing-library/user-event**: 14.5.2 - User interaction simulation
- **@testing-library/jest-dom**: 6.6.3 - DOM matchers
- **ts-jest**: 29.2.5 - TypeScript support for Jest

### E2E Testing
- **Playwright**: 1.57.0 - Browser automation
  - Chromium browser for tests
  - Automatic server management
  - Trace recording on failure

### Test Utilities
- **mock-socket**: 9.3.1 - WebSocket mocking
- **electron-mock**: 0.5.0 - Electron API mocking
- **jest-environment-node**: 29.7.0 - Node test environment

## Development Tools

### Code Quality
- **ESLint**: 9.16.0 - Linting
- **@typescript-eslint/parser**: 8.17.0 - TypeScript parsing
- **@typescript-eslint/eslint-plugin**: 8.17.0 - TypeScript rules
- **eslint-config-prettier**: 9.1.0 - Prettier integration
- **Prettier**: Code formatting (via eslint-config-prettier)

### Build & Bundling
- **Vite**: Fast dev server and build
- **esbuild**: Fast JavaScript bundler (via Vite)
- **browserslist**: Browser targeting
- **TypeScript Compiler**: Type checking

### Version Management
- **npm**: Package management
- **package-lock.json**: Dependency locking

## Backend Technologies (Separate Repository)

The backend is not part of this repository but uses:
- **Python**: 3.10+ - Core language
- **FastAPI**: Web framework
- **WebSocket**: Real-time communication
- **nodetool-core**: Core functionality
- **nodetool-base**: Base nodes
- **Conda/Micromamba**: Environment management

## CI/CD

### GitHub Actions
- **actions/checkout@v4**: Checkout code
- **actions/setup-node@v4**: Node.js setup
- **sst/opencode/github@latest**: OpenCode agent (manual trigger)
- **anomalyco/opencode/github@latest**: OpenCode agent (scheduled)

### Workflows
- `.github/workflows/test.yml` - PR testing
- `.github/workflows/e2e.yml` - E2E testing
- `.github/workflows/autofix.yml` - Auto-fix issues
- `.github/workflows/opencode*.y(a)ml` - AI agent workflows

## Browser Support

### Target Browsers
- Chrome/Chromium: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- Edge: Latest 2 versions

### Desktop App
- Windows: 10+
- macOS: 11+ (Big Sur)
- Linux: Ubuntu 20.04+, Debian 10+

## Node.js Versions

- **Development**: 20.x LTS
- **Production**: 20.x LTS
- **CI/CD**: 20.x LTS

## Python Environment (for E2E tests)

- **Python**: 3.10+
- **Conda**: Environment management
- **uv**: Fast pip replacement
- **nodetool-core**: Backend core
- **nodetool-base**: Base node library

## Key Version Constraints

### Critical
- **React**: Must stay at 18.2.0 (not React 19 yet)
  - Ecosystem compatibility
  - ReactFlow compatibility
  - Testing library compatibility

### Important
- **TypeScript**: 5.7+ for latest features
- **Node.js**: 20.x LTS for stability
- **MUI**: 7.x for latest features
- **Zustand**: 4.5+ for temporal middleware

## Dependency Management

### Installation
```bash
# Web
cd web && npm ci

# Electron
cd electron && npm ci

# Mobile
cd mobile && npm install
```

### Updates
- Regular updates via Dependabot
- Breaking changes reviewed carefully
- Version pinning in package-lock.json

## Performance Considerations

### Bundle Size
- Code splitting via Vite
- Dynamic imports for large components
- Tree shaking enabled

### Runtime Performance
- React 18 concurrent features
- Zustand selective subscriptions
- Virtual scrolling for large lists
- Memoization for expensive computations

## Security

### Dependencies
- Regular security audits
- Automated dependency updates
- Vulnerability scanning in CI

### Content Security
- DOMPurify for HTML sanitization
- No `dangerouslySetInnerHTML` without sanitization
- Strict CSP in production

## Known Version Issues

> OpenCode workflows should document version-specific issues here

_No known issues as of 2026-01-10_

## Upgrade Path

When upgrading major dependencies:

1. **React 18 → 19**: Not yet, wait for ecosystem
2. **MUI 7 → 8**: Follow MUI migration guide when available
3. **Node 20 → 22**: Test thoroughly, may need dependency updates
4. **TypeScript 5.7 → 6.x**: Wait for library compatibility

## Useful Commands

```bash
# Check versions
npm list react react-dom
npm list typescript
npm list @mui/material

# Update dependencies
npm outdated
npm update

# Audit security
npm audit
npm audit fix
```
