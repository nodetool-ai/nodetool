# AI Agent Instructions for NodeTool

This directory contains instructions for various AI coding agents working with the NodeTool codebase.

## Available Instruction Files

- **[copilot-instructions.md](../copilot-instructions.md)** - GitHub Copilot specific patterns and code generation guidelines
- **[Main AGENTS.md](../../AGENTS.md)** - Comprehensive project documentation and agent rules

## Quick E2E Test Setup

All AI agents should follow these steps to set up and run E2E tests:

### 1. Build Backend

```bash
nvm use                    # Activate Node 22
npm install
npm run build:packages     # Build all TS packages in dependency order
```

### 2. Web Dependencies

```bash
cd web
npm install
npx playwright install chromium
```

### 3. Run E2E Tests

```bash
cd web
npm run test:e2e
```

The Playwright configuration automatically:
- Starts a mock API server on port 4444
- Starts the frontend dev server on port 3000
- Runs all e2e tests
- Cleans up servers after tests complete

### 4. Test Structure

- **Unit/Integration Tests**: `web/src/**/__tests__/**/*.test.ts(x)`
- **E2E Tests**: `web/tests/e2e/**/*.spec.ts`

Current E2E tests:
- `app-loads.spec.ts` - ✅ Basic page loading, navigation, API connectivity

### 5. Debugging

```bash
# Interactive UI mode
cd web && npm run test:e2e:ui

# Headed mode (see browser)
cd web && npm run test:e2e:headed

# View trace files
npx playwright show-trace test-results/path/trace.zip
```

## For Specific AI Agents

### GitHub Copilot
See [copilot-instructions.md](../copilot-instructions.md) for:
- TypeScript patterns
- React component guidelines
- Testing patterns
- Code quality standards

### Other Agents
Refer to the main [AGENTS.md](../../AGENTS.md) for:
- Project architecture
- Directory structure
- Development commands
- Best practices

## Common Issues

### Issue: Playwright browsers not installed
**Solution**: Run `npx playwright install chromium` from the `web` directory

### Issue: E2E tests fail with connection errors
**Solution**: The Playwright webServer config should auto-start servers. If manual setup is needed:
```bash
# Terminal 1: Start backend
npm run build:packages && node packages/websocket/dist/server.js

# Terminal 2: Start frontend
cd web && npm start
```

### Issue: Port 7777 already in use
**Solution**: Kill existing process: `lsof -ti:7777 | xargs kill -9`

## CI/CD

The GitHub Actions workflow `.github/workflows/e2e.yml` runs integration tests automatically on:
- Push to main (when packages/ files change)
- Pull requests to main (when packages/ files change)

The workflow:
1. Sets up Node.js 22
2. Installs npm dependencies
3. Rebuilds native modules (better-sqlite3)
4. Builds backend packages
5. Runs integration tests

## Resources

- **Testing Documentation**: `/web/TESTING.md`
- **Component Guide**: `/web/src/components/AGENTS.md`
- **Store Patterns**: `/web/src/stores/AGENTS.md`
- **Web README**: `/web/README.md`

---

**Remember**: Always verify your changes work locally before pushing by running `npm run test:e2e`!
