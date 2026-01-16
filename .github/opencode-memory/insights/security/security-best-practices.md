# Security Best Practices (2026-01-16)

## XSS Prevention

### Do: Use CSS for Text Wrapping Instead of dangerouslySetInnerHTML

**Problem**: Using `dangerouslySetInnerHTML` with incomplete sanitization creates XSS vulnerabilities.

**Bad**:
```typescript
const addBreaks = (text: string) => {
  return escapeHtml(text).replace(/([-_.])/g, "$1<wbr>");
};
// ...
<div dangerouslySetInnerHTML={{ __html: addBreaks(workflow.name) }} />
```

**Good**:
```typescript
<div sx={{ wordBreak: "break-word" }}>
  {workflow.name}
</div>
```

### Do: Use DOMPurify for HTML Content

When HTML rendering is necessary, always use DOMPurify with appropriate configuration:

```typescript
import DOMPurify from "dompurify";

const sanitizeSvgContent = (html: string): string => {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use", "symbol", "defs", "clipPath", "mask", "pattern", "marker", "linearGradient", "radialGradient", "stop"],
    ADD_ATTR: ["xlink:href", "clip-path", "mask", "fill", "stroke", "transform", "viewBox", "preserveAspectRatio"]
  });
};
```

### Don't: Rely on Basic HTML Escaping

The `escapeHtml` function (which uses `sanitizeText`) is NOT sufficient for XSS prevention:

```typescript
// This is NOT safe for dangerouslySetInnerHTML
export function sanitizeText(str: string): string {
  const map: Record<string, string> = {
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "&": "&amp;"
  };
  return str.replace(/[<>"'&]/g, (char) => map[char] ?? char);
}
```

## Content Security Policy (CSP)

### Do: Use Strict CSP

**Bad** (allows eval and similar dangerous functions):
```html
<meta http-equiv="Content-Security-Policy"
      content="script-src 'self' 'unsafe-inline' 'unsafe-eval'; ..." />
```

**Good**:
```html
<meta http-equiv="Content-Security-Policy"
      content="script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; ..." />
```

### CSP Best Practices

1. **Avoid 'unsafe-eval'**: This allows `eval()`, `setTimeout(string)`, `Function()`, etc.
2. **Avoid 'unsafe-inline' for scripts**: Only use for styles if necessary
3. **Specify exact sources**: Use `'self'` and specific domains instead of `*`
4. **Use nonce-based scripts**: For dynamic script loading in production

## Electron Security

### Do: Configure WebPreferences Securely

**Good**:
```typescript
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  preload: path.join(__dirname, 'preload.js')
}
```

### Electron Security Checklist

- [ ] `nodeIntegration: false` - Prevents renderer from accessing Node.js
- [ ] `contextIsolation: true` - Isolates context between renderer and main process
- [ ] `sandbox: true` - Enables OS-level sandboxing
- [ ] `webSecurity: true` - Enforces same-origin policy
- [ ] No `remote` module usage - Use IPC instead
- [ ] Validate IPC messages - Don't trust any communication from renderer

## Environment Variables

### Do: Use Vite's import.meta.env Pattern

**Good**:
```typescript
const apiUrl = import.meta.env.VITE_API_URL;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
```

### Don't: Hardcode Secrets

**Bad**:
```typescript
const apiKey = "sk-1234567890abcdef";
```

### Environment Variable Naming

- Use `VITE_` prefix for Vite-exposed variables in web app
- Use `REACT_APP_` prefix for Create React App
- Never commit `.env` files to version control
- Use `.env.example` to document required variables

## Dependency Management

### Do: Run npm audit Regularly

```bash
npm audit --production
```

### Do: Use npm overrides for Transitive Dependencies

When a transitive dependency has a vulnerability:

```json
{
  "overrides": {
    "qs": ">=6.9.7",
    "express": ">=4.18.2"
  }
}
```

### Severity Guidelines

- **Critical/High**: Fix immediately
- **Moderate**: Fix within days
- **Low**: Fix when convenient
- **Info**: Acknowledge and monitor

## Local Storage Security

### Use localStorage Only for Non-Sensitive Data

**Safe**:
- UI preferences (theme, layout)
- Cached non-sensitive metadata
- Workflow layout preferences

**Unsafe** (use secure storage instead):
- API keys and tokens
- User credentials
- Personal identifiable information (PII)

## File Upload Validation

### Do: Validate File Types and Sizes

```typescript
const validateFile = (file: File): boolean => {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/gif'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type');
  }

  if (file.size > maxSize) {
    throw new Error('File too large');
  }

  return true;
};
```

## Error Handling

### Do: Use TypeScript's unknown Type

**Good**:
```typescript
try {
  // operation
} catch (error: unknown) {
  if (error instanceof Error) {
    console.error(error.message);
  }
}
```

**Bad**:
```typescript
try {
  // operation
} catch (error: any) {
  // Masks potential type issues
  console.error(error.message);
}
```

## Testing Security

### Include Security Tests

1. Test XSS vectors in user input fields
2. Test file upload validation
3. Test authentication/authorization flows
4. Test CSP header enforcement

## Related Memory

- `.github/opencode-memory/issues/security/security-vulnerability-fixes.md` - Vulnerability tracking
