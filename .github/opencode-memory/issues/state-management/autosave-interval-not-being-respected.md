# Auto-save Interval Not Being Respected

**Problem**: When users changed the auto-save interval in Settings, the new interval was not being applied. The auto-save would continue to use the original interval.

**Root Cause**: In `useAutosave.ts`, the interval `useEffect` used `setInterval` which didn't properly reset when the interval setting changed. The effect had `autosaveSettings?.enabled` in its dependency array, and when this value remained `true` (unchanged), React's effect optimization would not re-run the effect even when `intervalMinutes` changed.

Additionally, the hardcoded default in the interval calculation was `5` minutes instead of the actual default of `10` minutes from `SettingsStore.ts`.

**Solution**: Changed from `setInterval` to recursive `setTimeout` pattern and ensured proper cleanup:

1. Replaced `setInterval` with recursive `setTimeout` that schedules the next autosave after each successful save
2. Changed the default value from `5` to `10` to match `SettingsStore.ts`
3. Added proper cleanup of the timeout ref when settings change or component unmounts

**Files Changed**:
- `web/src/hooks/useAutosave.ts` - Fixed interval handling logic

**Date**: 2026-01-16
