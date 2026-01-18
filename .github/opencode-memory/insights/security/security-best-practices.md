# Security Best Practices - January 2026

## Dependency Management

### Use npm Overrides for Transitive Dependencies
When a transitive dependency has a vulnerability, use npm overrides in `package.json`:

```json
{
  "overrides": {
    "package-name": ">=version-number"
  }
}
```

This forces npm to use the patched version even for nested dependencies.

### Keep Dependencies Updated
- Run `npm audit` regularly (after every `npm install`)
- Prioritize fixing Critical and High severity vulnerabilities
- Test after updating dependencies, especially major versions

## Electron Security

### CORS Headers
Never use wildcard `Access-Control-Allow-Origin: *` in production. Instead:
- Restrict to specific origins (e.g., `http://localhost:7777`)
- Use the requesting origin from headers when possible

```typescript
// Good: Restrict to localhost
responseHeaders["Access-Control-Allow-Origin"] = ["http://localhost:7777"];
```

### BrowserWindow Configuration
Always use secure webPreferences:
```typescript
webPreferences: {
  preload: path.join(__dirname, "preload.js"),
  contextIsolation: true,
  nodeIntegration: false,
  devTools: true, // Only in development
  webSecurity: true,
}
```

## XSS Prevention

### dangerouslySetInnerHTML
When using `dangerouslySetInnerHTML`, always sanitize first:

```typescript
// Use DOMPurify for HTML content
import DOMPurify from "dompurify";
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }} />

// Or escape HTML entities for plain text
import { escapeHtml } from "./utils/highlightText";
<div dangerouslySetInnerHTML={{ __html: escapeHtml(text) }} />
```

### Sanitization Functions
- `escapeHtml()` in `web/src/utils/highlightText.ts` - Escapes `<>"'&` characters
- `sanitizeSvgContent()` in `web/src/components/node/output/svg.tsx` - Uses DOMPurify with SVG profiles
- `DOMPurify.sanitize()` in various components - Full HTML sanitization

## Content Security Policy

Add CSP meta tag to `web/index.html`:
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; script-src 'self' 'unsafe-inline'; 
               style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;" />
```

## Audit Results Summary

| Package | Before | After | Critical/High Fixed |
|---------|--------|-------|---------------------|
| Web     | 10 (1 high) | 0 | glob CLI injection |
| Electron| 23 (6 high) | 0 | tar file overwrite, CORS wildcard |
| Mobile  | 10 (2 high) | 0 | tar, undici |

## Files Changed in This Audit

1. `web/package.json` - Added glob override
2. `electron/package.json` - Updated electron-builder to 26.4.1
3. `electron/src/window.ts` - Fixed CORS origin restriction
4. `mobile/package.json` - Ran npm audit fix

## Prevention Checklist

- [ ] Run `npm audit` after every dependency change
- [ ] Use `npm audit --production` to check production deps only
- [ ] Fix Critical/High vulnerabilities within 24-48 hours
- [ ] Review CORS settings in Electron apps
- [ ] Always sanitize user input before `dangerouslySetInnerHTML`
- [ ] Keep CSP policy updated as new features are added
