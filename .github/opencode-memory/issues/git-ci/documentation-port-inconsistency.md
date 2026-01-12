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
