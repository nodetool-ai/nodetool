# Security Best Practices for NodeTool

## Dependency Management

### Using npm Overrides
Use the `overrides` field in `package.json` to fix transitive dependency vulnerabilities:

```json
{
  "overrides": {
    "package-name": ">=fixed.version"
  }
}
```

**When to use**:
- Fix transitive dependency vulnerabilities
- Avoid when upstream has released fixed version (update parent instead)
- Document why override was needed

### Version Update Strategy
- **Direct dependencies**: Update via `npm install package@version`
- **Transitive dependencies**: Use `overrides` field
- **Breaking changes**: Test thoroughly, consider feature flags

## Code Security

### Input Sanitization
Always sanitize user input before rendering:

```typescript
// ✅ Good - Using escapeHtml utility
import { escapeHtml } from "../../utils/highlightText";
<div dangerouslySetInnerHTML={{ __html: escapeHtml(userContent) }} />

// ✅ Good - Using DOMPurify for HTML content
import DOMPurify from "dompurify";
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlContent) }} />

// ✅ Better - Avoid dangerouslySetInnerHTML when possible
<div>{userContent}</div>
```

### Dangerous Patterns to Avoid
```typescript
// ❌ Never use - XSS vulnerability
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// ❌ Never use - Code injection
eval(userCode)
new Function(userCode)

// ❌ Never use in Electron renderer
nodeIntegration: true
```

## Electron Security

### Secure Window Configuration
```typescript
const window = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
    contextIsolation: true,    // ✅ Required
    nodeIntegration: false,    // ✅ Required
    sandbox: true,             // ✅ Recommended
    webSecurity: true,         // ✅ Recommended
  }
});
```

### Required Security Settings
1. **contextIsolation: true** - Isolates preload script context
2. **nodeIntegration: false** - Prevents renderer access to Node.js
3. **preload script** - Use for secure IPC communication

## Secrets Management

### Never Hardcode Secrets
```typescript
// ❌ Bad - Hardcoded API key
const apiKey = "sk-1234567890";

// ✅ Good - Environment variable
const apiKey = process.env.REACT_APP_API_KEY;

// ✅ Better - Server-side secrets management
const { apiKey } = await secretsStore.getSecret('api-key');
```

### Secure Storage Pattern
- Use server-side secrets storage
- Never log or expose secrets
- Use short-lived tokens when possible

## CSP Configuration

### Content Security Policy Meta Tag
```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self';
           script-src 'self' 'unsafe-inline';
           style-src 'self' 'unsafe-inline';
           img-src 'self' data: blob: https:;
           connect-src 'self' http://localhost:* ws://localhost:* https:;"
/>
```

**Best practices**:
- Minimize 'unsafe-inline' usage
- Restrict connect-src to necessary origins
- Use nonces for inline scripts in production

## Verification Checklist

### Before Commit
- [ ] Run `npm audit` on all packages
- [ ] Check for hardcoded secrets
- [ ] Verify input sanitization
- [ ] Review dangerouslySetInnerHTML usage
- [ ] Check Electron security settings

### Regular Maintenance
- [ ] Weekly `npm audit` checks
- [ ] Monthly dependency reviews
- [ ] Quarterly security audits
- [ ] Monitor CVE databases for used dependencies

## Tools

- `npm audit` - Dependency vulnerability scanner
- `npm outdated` - Check for outdated packages
- `npm explain <package>` - Understand dependency tree
- GitHub Dependabot - Automated security updates
