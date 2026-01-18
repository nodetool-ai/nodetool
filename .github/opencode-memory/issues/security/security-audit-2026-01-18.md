# Security Vulnerability Audit Report

**Audit Date:** 2026-01-18
**Auditor:** OpenCode Security Agent

## Executive Summary

NodeTool has a good security posture overall with proper Electron security configurations, XSS prevention, and TypeScript strict mode. However, several dependency vulnerabilities were identified that need attention.

## Vulnerabilities by Severity

### Critical Severity: 0 ✅

### High Severity: 7

| Package | Location | Issue | CVE | CVSS | Status |
|---------|----------|-------|-----|------|--------|
| `tar` | electron | Arbitrary file overwrite and symlink poisoning via insufficient path sanitization | GHSA-8qq5-rm4j-mr97 | High | Fix available via electron-builder update |
| `glob` | web (transitive via esbuild-style-plugin) | Command injection via -c/--cmd executes matches with shell:true | GHSA-5j98-mcp5-4vw2 | 7.5 | Fix available |
| `electron-builder` | electron | High severity via tar dependency | - | High | Fix available (v23.0.6) |
| `@electron/rebuild` | electron | High severity via tar | - | High | Fix available |
| `app-builder-lib` | electron | High severity via tar | - | High | Fix available |
| `dmg-builder` | electron | High severity via app-builder-lib | - | High | Fix available |
| `electron-builder-squirrel-windows` | electron | High severity via app-builder-lib | - | High | Fix available |

### Moderate Severity: 5

| Package | Location | Issue | CVE | Status |
|---------|----------|-------|-----|--------|
| `highlight.js` | mobile | ReDOS vulnerabilities and Prototype Pollution | GHSA-7wwv-vh3v-89cq, GHSA-vfrc-7r7c-w9mx | No fix available (transitive) |
| `lowlight` | mobile | Via highlight.js | - | No fix available |
| `markdown-it` | mobile | Uncontrolled Resource Consumption | GHSA-6vfc-qv3f-vr6c | No fix available (transitive) |
| `esbuild` | electron | Development server allows arbitrary requests | GHSA-67mh-4wv8-2f99 | Fix available |
| `vite` | electron | Multiple file serving vulnerabilities | Multiple | Fix available |

### Low Severity: Multiple (20+)

- `@eslint/plugin-kit` - ReDoS
- `jest` and related packages
- `diff` - DoS vulnerability
- `aws-sdk` - Missing region validation
- Other development dependencies

## What is Already Secure ✅

### Electron Security Configuration
- `contextIsolation: true` ✅
- `nodeIntegration: false` ✅
- `webSecurity: true` ✅
- Preload script configured ✅
- Permission handlers properly configured ✅

### XSS Prevention
- SVG rendering uses `sanitizeSvgContent` with DOMPurify ✅
- Workflow names use `escapeHtml` (HTML entity escaping) ✅
- JSON rendering uses DOMPurify ✅
- Previous security fixes applied (2026-01-12):
  - DOMPurify updated to 3.2.4
  - React Router updated to 7.12.0
  - React Syntax Highlighter updated to 16.1.0

### TypeScript & Code Quality
- `strict: true` enabled ✅
- No `eval()` or `new Function()` usage found ✅
- No hardcoded API keys in source code ✅

### Secrets Management
- Secrets handled via secure backend API ✅
- `is_secret` flag for settings ✅
- Secrets not stored in localStorage ✅

### Content Security Policy
- CSP meta tag configured in index.html ✅

## Code Security Patterns Found

### Safe Patterns ✅
```typescript
// SVG sanitization with DOMPurify
const sanitizeSvgContent = (html: string): string => {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use", "symbol", "defs", ...],
  });
};

// HTML escaping for text content
const escapeHtml = (text: string): string => {
  return sanitizeText(text); // Escapes < > " ' &
};
```

## Recommendations

### Immediate Actions (High Priority)

1. **Update electron-builder** to version 23.0.6 to fix tar vulnerability:
   ```bash
   cd electron
   npm update electron-builder
   ```

2. **Fix glob vulnerability** in web package (transitive via esbuild-style-plugin):
   - This requires updating the parent package or adding an override

### Short-term Actions (Medium Priority)

1. **Update vite** in electron package to fix file serving vulnerabilities
2. **Update esbuild** in electron package
3. **Review mobile dependencies** for highlight.js and markdown-it alternatives

### Long-term Actions

1. Set up automated dependency scanning (Dependabot is already active)
2. Consider using `npm audit --fix` regularly in CI/CD
3. Review the high severity vulnerabilities and assess impact

## Files Reviewed

- `/web/package.json` - Dependencies
- `/electron/package.json` - Dependencies
- `/mobile/package.json` - Dependencies
- `/web/index.html` - CSP configuration
- `/electron/src/window.ts` - BrowserWindow security settings
- `/electron/src/main.ts` - Main process security
- `/web/src/utils/sanitize.ts` - XSS prevention
- `/web/src/components/node/output/svg.tsx` - SVG sanitization
- `/web/src/components/workflows/WorkflowTile.tsx` - HTML escaping
- TypeScript configurations

## Conclusion

NodeTool has a solid security foundation with proper Electron security configurations, XSS prevention mechanisms, and good code quality practices. The main security concerns are dependency vulnerabilities that can be addressed through regular updates. The previous security audit (2026-01-12) already addressed critical XSS and CSRF vulnerabilities.

**Overall Security Rating:** Good (with dependency maintenance needed)
