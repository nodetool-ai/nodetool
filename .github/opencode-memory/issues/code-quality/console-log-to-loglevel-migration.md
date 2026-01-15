# Console.log to Loglevel Migration

**Problem**: Multiple files used `console.log` for debug logging instead of the project's standard `loglevel` library.

**Solution**: Replaced `console.log` with `log.debug()` from the `loglevel` library in the following files:

- `web/src/stores/GlobalChatStore.ts:1104` - Threads fetch logging
- `web/src/components/color_picker/EyedropperButton.tsx:80` - Eyedropper error logging
- `web/src/components/terminal/Terminal.tsx:91` - Terminal resize logging
- `web/src/components/version/VersionHistoryPanel.tsx:176` - Version restore logging
- `web/src/components/node/OutputRenderer.tsx:349,365` - Image edited logging

**Files**: 
- web/src/stores/GlobalChatStore.ts
- web/src/components/color_picker/EyedropperButton.tsx
- web/src/components/terminal/Terminal.tsx
- web/src/components/version/VersionHistoryPanel.tsx
- web/src/components/node/OutputRenderer.tsx

**Date**: 2026-01-15
