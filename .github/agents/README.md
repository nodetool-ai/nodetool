# AI Agent Instructions for NodeTool

This directory contains instructions for various AI coding agents working with the NodeTool codebase.

## Available Instruction Files

- **[copilot-instructions.md](../copilot-instructions.md)** - GitHub Copilot specific patterns and code generation guidelines
- **[claude-instructions.md](../claude-instructions.md)** - Claude AI instructions for setup, testing, and development
- **[Main AGENTS.md](../../AGENTS.md)** - Comprehensive project documentation and agent rules

## Quick E2E Test Setup

All AI agents should follow these steps to set up and run E2E tests:

### 1. Python Environment Setup

```bash
# Create environment (first time only)
conda env create -f environment.yml -n nodetool

# Activate environment
conda activate nodetool

# Install packages
uv pip install git+https://github.com/nodetool-ai/nodetool-core git+https://github.com/nodetool-ai/nodetool-base

# Verify
nodetool --help
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
- Starts the nodetool backend server on port 7777
- Starts the frontend dev server on port 3000
- Runs all e2e tests
- Cleans up servers after tests complete

### 4. Test Structure

- **Unit/Integration Tests**: `web/src/**/__tests__/**/*.test.ts(x)`
- **E2E Tests**: `web/tests/e2e/**/*.spec.ts`

Current E2E tests:
- `app-loads.spec.ts` - ✅ Basic page loading, navigation, API connectivity
- `download_websocket.spec.ts` - ⚠️ Advanced WebSocket test (may fail without models)

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

### Claude AI
See [claude-instructions.md](../claude-instructions.md) for:
- Quick setup guide
- Code patterns
- Testing guidelines
- Debugging tips

### Other Agents
Refer to the main [AGENTS.md](../../AGENTS.md) for:
- Project architecture
- Directory structure
- Development commands
- Best practices

## Common Issues

### Issue: Conda environment not found
**Solution**: Create the environment first with `conda env create -f environment.yml -n nodetool`

### Issue: nodetool command not found
**Solution**: Make sure you activated the conda environment: `conda activate nodetool`

### Issue: Playwright browsers not installed
**Solution**: Run `npx playwright install chromium` from the `web` directory

### Issue: E2E tests fail with connection errors
**Solution**: The Playwright webServer config should auto-start servers. If manual setup is needed:
```bash
# Terminal 1
conda activate nodetool && nodetool serve --port 7777

# Terminal 2
cd web && npm start
```

### Issue: Port 7777 already in use
**Solution**: Kill existing process: `lsof -ti:7777 | xargs kill -9`

## CI/CD

The GitHub Actions workflow `.github/workflows/e2e.yml` runs e2e tests automatically on:
- Push to main (when web files change)
- Pull requests to main (when web files change)

The workflow:
1. Sets up conda environment
2. Installs Python packages
3. Sets up Node.js
4. Installs web dependencies
5. Installs Playwright browsers
6. Starts nodetool server
7. Runs e2e tests
8. Uploads artifacts on failure

## Resources

- **Testing Documentation**: `/web/TESTING.md`
- **Component Guide**: `/web/src/components/AGENTS.md`
- **Store Patterns**: `/web/src/stores/AGENTS.md`
- **Web README**: `/web/README.md`

---

**Remember**: Always verify your changes work locally before pushing by running `npm run test:e2e`!
