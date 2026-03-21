# Deprecated Expo Build Commands

**Issue**: Mobile documentation referenced deprecated `expo build` commands that are no longer supported by Expo.

**Affected File**: `mobile/README.md`

**Original (Deprecated)**:
```bash
expo build:android
expo build:ios
```

**Updated (Current)**:
```bash
# Prerequisites
npm install -g eas-cli
eas login

# Build for Android
eas build --platform android --profile preview

# Build for iOS
eas build --platform ios --profile preview

# Build for all platforms
eas build --platform all --profile preview
```

**Root Cause**: Expo deprecated the `expo build` command in favor of EAS Build for cloud builds.

**Resolution**: Updated mobile/README.md with:
- EAS CLI installation instructions
- EAS login steps
- Platform-specific build commands
- EAS Build profiles documentation
- App store submission instructions
- Local build alternatives
- Troubleshooting guidance

**Verification**: The new commands follow current Expo documentation standards and use EAS Build.

**Date Fixed**: 2026-01-16
