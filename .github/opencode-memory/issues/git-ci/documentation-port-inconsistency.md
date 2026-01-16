### Documentation Port Consistency Fix (2026-01-16)

**Issue**: Multiple documentation files still had port 8000 instead of the correct port 7777 for development scenarios.

**Files Fixed**:
- `mobile/QUICKSTART.md`: Android emulator URL, iOS Simulator URL, and firewall port reference
- `mobile/README.md`: Android emulator URL in troubleshooting section

**Key Distinction**:
- Development: `nodetool serve` → port 7777
- Production: `nodetool worker` / `nodetool serve --production` → port 8000

**Prevention**: When updating port configurations in the future:
1. Update vite.config.ts proxy targets
2. Update Playwright and GitHub workflow configurations
3. Update all documentation files mentioning the port
4. Update .env example
5. Update BASE_URL.ts comments
6. Update mobile app settings screens and documentation

### Documentation Backtick Escaping Fix (2026-01-16)

**Issue**: `docs/AGENTS.md` had incorrectly escaped markdown code block syntax (`\```python` instead of ` ```python`), causing rendering issues.

**Files Fixed**:
- `docs/AGENTS.md`: Fixed 4 code block examples and 1 malformed closing tag

**Example of Fix**:
```markdown
# Before (incorrect)
\```python
def example():
    pass
\```

# After (correct)
```python
def example():
    pass
```
```

**Impact**: Documentation code examples now render correctly in markdown viewers and GitHub.

---

### Documentation Port Inconsistency (2026-01-12)

**Issue**: The codebase had an inconsistent port configuration across documentation files. The vite.config.ts, Playwright config, and GitHub workflows all use port **7777** for the backend server, but several documentation files incorrectly referenced port **8000**:

- `mobile/README.md` (already fixed to 7777)
- `mobile/QUICKSTART.md` - referenced 8000 in multiple places
- `web/src/stores/BASE_URL.ts` - comment incorrectly said "proxied by Vite to localhost:8000"
- `web/.env.example` - showed VITE_API_URL=http://localhost:8000

**Root Cause**: Legacy documentation and defaults from an older version of the system that used port 8000, not updated when the port was changed to 7777.

**Solution**: Updated all affected documentation to use port 7777:
- `mobile/QUICKSTART.md`: Fixed 5 port references (lines 33, 78, 84, 89, 116)
- `web/src/stores/BASE_URL.ts`: Fixed comment to say "proxied by Vite to localhost:7777"
- `web/.env.example`: Changed VITE_API_URL to http://localhost:7777

**Verification**: Confirmed port 7777 is correct by checking:
- `vite.config.ts` proxies /api, /ws, /storage to http://localhost:7777
- `playwright.config.ts` starts nodetool serve --port 7777
- `.github/workflows/e2e.yml` uses nodetool serve --port 7777
- Root `AGENTS.md` documents port 7777

**Prevention**: When updating port configurations in the future:
1. Update vite.config.ts proxy targets
2. Update Playwright and GitHub workflow configurations
3. Update all documentation files mentioning the port
4. Update .env example
5. Update BASE_URL.ts comments
6. Update mobile app settings screens and documentation

### Additional Port Documentation Fixes (2026-01-16)

**Issue**: Additional documentation files were found referencing the wrong port for development scenarios:

Fixed files:
- `web/TEST_HELPERS.md`: Mock WebSocket URL default (8000 → 7777)
- `web/src/config/AGENTS.md`: API_URL default value examples (8000 → 7777)
- `web/src/lib/AGENTS.md`: WebSocketManager example URL (8000 → 7777)
- `web/TESTING.md`: Environment variable comment (8000 → 7777)
- `docs/workflow-debugging.md`: Error message example (8000 → 7777)
- `docs/api-reference.md`: cURL example (8000 → 7777)
- `docs/chat-api.md`: Added clarification about port differences (7777 for dev, 8000 for production) and updated examples to show both ports

**Files NOT changed** (correctly use port 8000 for production):
- `docs/proxy.md`: Docker internal_port configuration (8000 is correct for containers)
- `docs/chat-api.md`: Worker/Chat Server API endpoints (8000 is correct for production)

**Key Distinction**:
- Development: `nodetool serve` → port 7777
- Production: `nodetool worker` / `nodetool serve --production` → port 8000

**Documentation Pattern**: When documenting URLs:
- For development scenarios: Use port 7777
- For production/Worker scenarios: Use port 8000 or a configurable server URL
- For Docker/proxy configs: Use the internal port (8000) for container-to-container communication
