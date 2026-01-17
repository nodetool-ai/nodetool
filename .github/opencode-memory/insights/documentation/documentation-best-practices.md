# Documentation Best Practices

This file contains guidelines and patterns for writing high-quality documentation in the NodeTool project.

## Core Principles

### 1. User-Focused Content

Documentation should always be written from the user's perspective:
- Answer the question "What can I do with this?"
- Include practical examples and use cases
- Assume minimal prior knowledge
- Explain complex concepts clearly

### 2. Consistency

Maintain consistent terminology, formatting, and structure:
- Use the same terms throughout (e.g., "workflow" not "flow" or "pipeline")
- Follow markdown style guide (see docs/AGENTS.md)
- Use code block language specifiers consistently
- Maintain similar structure across related pages

### 3. Accuracy

Documentation must match the current implementation:
- Test all code examples
- Verify command syntax against package.json
- Check port numbers (7777 for dev, 8000 for production)
- Update documentation when code changes

## Documentation Types

### API Documentation

API docs should include:
- Endpoint description
- HTTP method and URL
- Request parameters and body
- Response format (success and error)
- Working code examples

```markdown
## API Endpoint: /api/resource

### Description

Brief description of what this endpoint does.

### Request

**Method**: POST
**URL**: `/api/resource`

**Headers**:
```
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body**:
```json
{
  "parameter": "value"
}
```

### Response

**Success (200)**:
```json
{
  "success": true,
  "data": {}
}
```

### Example

```typescript
const response = await fetch('/api/resource', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ parameter: 'value' })
});
```

### Tutorial Documentation

Tutorials should follow this structure:

1. **Prerequisites** - What users need before starting
2. **Step-by-step instructions** - Numbered, clear steps
3. **Code examples** - Working code at each step
4. **Expected output** - What users should see
5. **Next steps** - Where to go after completing

### Troubleshooting Documentation

Include:
- Clear problem description
- Symptoms (bullet points)
- Cause explanation
- Step-by-step solution
- Alternative solutions if available

## Code Examples

### Always Include Language Specifier

```markdown
```typescript
const example = "Hello";
```
```

### Working Code Only

- Test all examples before publishing
- Include necessary imports
- Show expected output when relevant
- Add comments for complex logic

### Avoid Pseudo-Code

Use real, working code examples that users can copy and run.

## Port Consistency

### Development vs Production

- **Development**: `nodetool serve` → port 7777
- **Production**: `nodetool serve --production` → port 8000
- **Web UI**: `npm start` → port 3000

Always specify the port in documentation examples:

```markdown
# Development server
nodetool serve --port 7777

# Web UI
npm start  # Runs on http://localhost:3000
```

## Package Manager Commands

### Install Dependencies

Use `npm install` for development (allows package.json updates):
```bash
npm install
```

Use `npm ci` for CI/CD and reproducible builds:
```bash
npm ci
```

### Running Commands

Document commands that match package.json scripts:

```markdown
# Run development server
npm start

# Run tests
npm test

# Build for production
npm run build
```

## File Naming

### Documentation Files

- Use kebab-case: `getting-started.md`, `workflow-editor.md`
- Descriptive names: `custom-nodes.md` not `nodes.md`
- Consistent with navigation structure

### AGENTS.md Files

- Located in each major directory
- Named exactly `AGENTS.md`
- Cross-reference other AGENTS.md files

## Cross-References

### Internal Links

Use relative paths for internal documentation:

```markdown
- [Web UI Overview](web/src/AGENTS.md)
- [Components](../components/AGENTS.md)
- [Getting Started](../getting-started.md)
```

### External Links

- Use full URLs for external resources
- Verify links work before publishing
- Prefer HTTPS when available

## Formatting Standards

### Heading Hierarchy

```markdown
# Level 1 - Page title (one per file)
## Level 2 - Major sections
### Level 3 - Subsections
#### Level 4 - Details (use sparingly)
```

### Emphasis

- **Bold**: `**text**` for emphasis and UI elements
- *Italic*: `*text*` for terms and foreign words
- `Code`: `` `code` `` for inline code and commands

### Lists

- Use bullets for unordered lists
- Use numbers for ordered lists
- Keep items concise
- Limit to 4-5 items per section

## Images and Media

### Screenshots

- Include screenshots for UI-heavy documentation
- Use descriptive alt text
- Keep images updated when UI changes
- Consider using annotations to highlight key areas

### Diagrams

Use diagrams for:
- Architecture overviews
- Flowcharts
- Data models
- Sequence diagrams

## Versioning

### Breaking Changes

Document breaking changes clearly:
```markdown
## Breaking Changes in v0.6.0

### Changed
- Old behavior description
- New behavior description
- Migration steps
```

### New Features

Document new features with:
- Feature description
- Use cases
- Code examples
- Related documentation links

## Review Checklist

Before publishing documentation:

- [ ] Code examples compile and work
- [ ] Commands match package.json scripts
- [ ] Port numbers are correct (7777 for dev)
- [ ] Links are valid
- [ ] Formatting is consistent
- [ ] Cross-references work
- [ ] Tests cover the documented functionality
- [ ] No typos or grammar errors

## Related Documentation

- [Root AGENTS.md](../AGENTS.md) - Project overview
- [docs/AGENTS.md](../../docs/AGENTS.md) - Jekyll documentation guide
- [Documentation Audit](../issues/documentation/documentation-audit-2026-01-16.md) - Latest audit results
