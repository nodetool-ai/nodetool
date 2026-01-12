### Native Module Issues

**Issue**: Native modules don't work in Electron.

**Solution**: Rebuild for Electron:
```bash
cd electron
npm run postinstall  # Rebuilds native modules
```
