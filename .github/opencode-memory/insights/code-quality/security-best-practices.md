# Security Best Practices

**Insight**: Regular dependency audits and prompt patching are essential for maintaining application security. Nested/transitive dependency vulnerabilities require npm `overrides` to force patched versions.

**Key Practices**:
1. **Dependency Management**: Use `npm audit` regularly to identify vulnerabilities
2. **Direct vs Transitive Dependencies**: Update direct dependencies directly; use `overrides` in package.json for transitive dependencies
3. **Content Security Policy**: Always implement CSP to mitigate XSS attacks
4. **Sanitization**: Use DOMPurify for rendering HTML content; escape user input for text rendering
5. **Electron Security**: Keep `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`

**Vulnerability Patching**:
```json
// Direct dependencies - update version
"dompurify": "^3.2.4"

// Transitive dependencies - use overrides
"overrides": {
  "glob": ">=10.5.0",
  "qs": ">=6.14.1",
  "express": ">=4.21.2"
}
```

**CSP Implementation**:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';">
```

**Input Sanitization**:
```typescript
// Safe HTML rendering with DOMPurify
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(userContent);

// Safe text rendering with escapeHtml
import { escapeHtml } from '../utils/highlightText';
const safe = escapeHtml(userText);
```

**Electron Security Configuration**:
```typescript
const window = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    devTools: true,
    webSecurity: true,
  }
});
```

**Impact**: Comprehensive security patching reduced web vulnerabilities from 10 to 0 and electron from 17 to 0.

**Known Issues (No Fix Available)**:
- Mobile package has 9 vulnerabilities in transitive dependencies (react-native-syntax-highlighter, react-native-markdown-display)
- These require upstream fixes from the package maintainers

**Date**: 2026-01-16 (updated from 2026-01-12)
