# Console Log to Loglevel Replacement

**Problem**: Multiple files used `console.log` instead of the project's standard `loglevel` library for logging, making debugging output inconsistent and harder to control.

**Solution**: Replaced all `console.log` statements with `log.debug` from the `loglevel` library across multiple files.

**Files Fixed**:
- `web/src/stores/GlobalChatStore.ts` - Removed debug console.log in useThreadsQuery
- `web/src/components/color_picker/EyedropperButton.tsx` - Replaced error logging with log.debug
- `web/src/components/node/OutputRenderer.tsx` - Replaced onImageEdited callback logging with log.debug
- `web/src/components/terminal/Terminal.tsx` - Replaced resize debug logging with log.debug

**Date**: 2026-01-16
