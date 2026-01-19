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
  "express": ">=4.21.2",
  "glob": ">=10.5.0",
  "tar": ">=7.5.3"
}
```

**CSP Implementation**:
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' http://localhost:* ws://localhost:* https:; media-src 'self' blob:; frame-src 'self';">
```

**Impact**: 
- 2026-01-12: Comprehensive security patching reduced web vulnerabilities from 8 to 2 and electron from 12 to 0
- 2026-01-19: Added overrides for glob and tar vulnerabilities; reduced web from 10 to 9, electron from 23 to 9, mobile from 10 to 0

**Date**: 2026-01-19 (updated from 2026-01-12)
