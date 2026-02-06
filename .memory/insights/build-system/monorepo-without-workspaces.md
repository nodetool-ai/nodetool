# Monorepo Without Workspaces

**Insight**: Project uses separate package.json files without npm workspaces.

**Why**: 
- Simpler dependency management
- Independent versioning
- Clear separation of concerns

**Structure**:
```
/web/package.json       - Web app dependencies
/electron/package.json  - Electron dependencies
/mobile/package.json    - Mobile app dependencies
```

**Date**: 2026-01-10
