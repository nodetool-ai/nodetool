# NodeTool Port Configuration

**Insight**: NodeTool uses different default ports for development vs production modes, which can cause confusion if documentation is inconsistent.

**Port Assignments**:
- **Development server** (`nodetool serve`): Port **7777**
  - Used by Vite dev server proxy
  - Used by Playwright E2E tests
  - Documented in AGENTS.md and TESTING.md
- **Production deployment** (`nodetool serve --production`): Port **8000**
  - Used by desktop application
  - Used by worker deployment
  - Documented in CLI docs and installation guide

**Pattern**: When writing documentation:
- Development guides → Use port 7777
- Production/deployment guides → Use port 8000
- Mobile app → Uses port 7777 (connects to development server)

**Files Verified**:
- `vite.config.ts` → proxies to localhost:7777
- `playwright.config.ts` → starts nodetool serve --port 7777
- `.github/workflows/e2e.yml` → uses port 7777
- Root `AGENTS.md` → documents port 7777

**Date**: 2026-01-12
