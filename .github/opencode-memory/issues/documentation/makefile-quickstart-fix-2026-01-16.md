### Documentation Bug Fix: Makefile Quickstart Command (2026-01-16)

**Issue Found**: Makefile quickstart target referenced non-existent `npm run dev` command for web development.

**Root Cause**: The quickstart target in `/Makefile` incorrectly suggested `cd web && npm run dev`, but the web package.json only has a `start` script, not a `dev` script.

**Evidence**:
- Web package.json scripts: `"start": "vite..."` (no `dev` script)
- Electron package.json scripts: has both `"start"` and `"dev"` scripts
- Other documentation correctly uses `npm start` for web

**Files Verified**:
- `/README.md` ✅ uses `npm start`
- `/AGENTS.md` ✅ uses `npm start`
- `/web/README.md` ✅ uses `npm start`
- `.github/copilot-instructions.md` ✅ uses `npm start`

**Fix Applied**:
```makefile
# Before (incorrect):
@echo "  cd web && npm run dev   - Start web development server"

# After (correct):
@echo "  cd web && npm start    - Start web development server"
```

**Impact**: Developers following the `make quickstart` command will now get correct instructions to start the web development server using `npm start`.

**Verification**:
- Fixed in `/Makefile` line 183
- All other documentation already correct
- No other instances of this error found

**Related**:
- [Documentation Audit 2026-01-16](./documentation-audit-2026-01-16.md)
- [Documentation Best Practices](../code-quality/documentation-best-practices.md)
