### npm install Failures

**Issue**: `npm install` fails with peer dependency errors.

**Solution**: Use `npm ci` instead (uses lock file):
```bash
rm -rf node_modules
npm ci
```
