# npm install Failures

**Problem**: `npm install` fails with peer dependency errors.

**Solution**: Use `npm ci` instead (uses lock file):
```bash
rm -rf node_modules
npm ci
```

**Date**: 2026-01-10
