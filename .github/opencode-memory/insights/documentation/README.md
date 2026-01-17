# Documentation Insights

This folder contains documentation best practices, patterns, and guidelines for NodeTool documentation.

## Contents

### Best Practices

- **[Documentation Best Practices](documentation-best-practices.md)** - Comprehensive guide for writing documentation

## Related Documentation

- **[Documentation Audit](../../issues/documentation/documentation-audit-2026-01-16.md)** - Latest audit results
- **[docs/AGENTS.md](../../docs/AGENTS.md)** - Jekyll documentation guide
- **[Root AGENTS.md](../../AGENTS.md)** - Project overview

## Quick Reference

### Documentation Standards

1. **User-Focused**: Write from the user's perspective
2. **Accurate**: Test code examples, verify commands
3. **Consistent**: Use same terminology throughout
4. **Complete**: Cover all features and use cases

### Port Standards

- **Development**: `nodetool serve` → port 7777
- **Production**: `nodetool serve --production` → port 8000
- **Web UI**: `npm start` → port 3000

### Package Manager

- **Development**: `npm install` (allows package.json updates)
- **CI/CD**: `npm ci` (deterministic, from lockfile)

## Contributing

When adding new documentation insights:

1. Create a new markdown file in this folder
2. Follow the best practices guide
3. Add to this index file
4. Update the documentation audit if significant
