# Security Best Practices

**Insight**: Regular dependency audits and prompt patching are essential for maintaining application security.

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
  "qs": ">=6.14.1",
  "express": ">=4.21.2"
}
```

**CSP Implementation**:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';">
```

**Impact**: Comprehensive security patching reduced web vulnerabilities from 8 to 2 and electron from 12 to 0.

**Date**: 2026-01-12
