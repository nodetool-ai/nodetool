# E2E Test Strategy

**Insight**: Playwright's webServer config auto-manages backend/frontend lifecycle.

**Benefits**:
1. No manual server startup needed
2. Tests are portable (work on any machine)
3. Automatic cleanup prevents port conflicts
4. Retry logic handles slow starts

**Configuration**: `web/playwright.config.ts`

**Date**: 2026-01-10
