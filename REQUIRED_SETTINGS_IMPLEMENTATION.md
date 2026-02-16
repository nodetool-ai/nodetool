# Required Settings Warning Implementation

## Overview

This implementation adds real-time validation for required node settings, displaying a warning banner when settings are not configured.

## Visual Behavior

### When Required Settings Are Missing

The warning appears directly below the node header, between the execution status and the node content:

```
┌─────────────────────────────────────┐
│  Node Header (Title, Icons, etc.)   │
├─────────────────────────────────────┤
│  [Error Messages - if any]          │
│  [Node Status - running/completed]  │
│  [Execution Time]                   │
│  [Model Recommendations]             │
│  [API Key Validation]                │
│ ⚠ [REQUIRED SETTINGS WARNING] ⚠     │  ← NEW
│  [Input Node Name Warning]           │
├─────────────────────────────────────┤
│                                      │
│  Node Content (Inputs/Outputs)       │
│                                      │
└─────────────────────────────────────┘
```

### Warning Appearance

The warning component displays:
- **Text**: "Required setting X is not configured!" (singular) or "Required settings X, Y are not configured!" (plural)
- **Button**: Yellow "Configure in Settings" button
- **Style**: Uppercase text, centered, warning color scheme

### Real-Time Updates

The warning:
- ✅ Appears immediately when a node is added that requires settings
- ✅ Disappears automatically when all required settings are configured
- ✅ Updates instantly when settings are changed in the Settings dialog
- ✅ Shows/hides without page refresh (real-time via Zustand stores)

## User Flow

1. **User adds a node** that requires settings (e.g., OpenAI node requiring OPENAI_API_KEY)
2. **Warning appears** at the top of the node: "Required setting OPENAI_API_KEY is not configured!"
3. **User clicks** "Configure in Settings" button
4. **Settings dialog opens** to the appropriate section
5. **User enters** the API key/setting value
6. **User saves** settings
7. **Warning disappears** automatically from the node

## Component Architecture

### Hook: useRequiredSettings
```typescript
// Input: nodeType (e.g., "openai.ChatCompletion")
// Output: string[] of missing setting names

const missingSettings = useRequiredSettings(nodeType);
// Returns: ["OPENAI_API_KEY", "ANOTHER_SETTING"] or []
```

### Component: RequiredSettingsWarning
```typescript
// Props: nodeType
// Renders: Warning banner + button, or null if no warnings

<RequiredSettingsWarning nodeType="openai.ChatCompletion" />
```

## Data Flow

```
Backend Server
    ↓
    (OpenAPI Schema with required_settings)
    ↓
npm run openapi
    ↓
api.ts (NodeMetadata.required_settings: string[])
    ↓
MetadataStore (stores node metadata)
    ↓
useRequiredSettings hook
    ↓
    (checks against RemoteSettingsStore)
    ↓
RequiredSettingsWarning component
    ↓
Display warning if settings missing
```

## Example Scenarios

### Scenario 1: Single Missing Setting
```
Node: openai.ChatCompletion
Required Settings: ["OPENAI_API_KEY"]
Configured: []

Warning: "Required setting OPENAI_API_KEY is not configured!"
```

### Scenario 2: Multiple Missing Settings
```
Node: custom.MultiProvider
Required Settings: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]
Configured: []

Warning: "Required settings OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY are not configured!"
```

### Scenario 3: Partially Configured
```
Node: custom.MultiProvider
Required Settings: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]
Configured: ["OPENAI_API_KEY"]

Warning: "Required setting ANTHROPIC_API_KEY is not configured!"
```

### Scenario 4: All Configured
```
Node: openai.ChatCompletion
Required Settings: ["OPENAI_API_KEY"]
Configured: ["OPENAI_API_KEY"]

Warning: (no warning displayed)
```

## Backend Integration

When the backend is ready with required_settings in node metadata:

1. Start the nodetool server:
   ```bash
   nodetool serve --port 7777
   ```

2. Regenerate the TypeScript types:
   ```bash
   cd web
   npm run openapi
   ```

3. The api.ts file will be regenerated with the actual required_settings from the backend

4. Nodes will automatically start showing warnings based on their metadata

## Testing

### Unit Tests
- ✅ Hook returns empty array when no metadata
- ✅ Hook returns empty array when no required settings
- ✅ Hook returns missing settings correctly
- ✅ Hook handles partially configured settings
- ✅ Hook treats empty strings as missing
- ✅ Hook returns empty array during loading
- ✅ All 7 tests passing

### Integration Testing
To test manually:
1. Add a node that has required_settings in its metadata
2. Verify warning appears
3. Open Settings and configure the setting
4. Verify warning disappears
5. Clear the setting value
6. Verify warning reappears

## Code Quality

- ✅ TypeScript: Zero type errors
- ✅ ESLint: Zero linting errors
- ✅ Tests: 669/669 passing (7 new tests added)
- ✅ Security: Zero CodeQL alerts
- ✅ Patterns: Follows existing component patterns (ApiKeyValidation)
- ✅ Performance: Optimized with useMemo
- ✅ Backward Compatible: Optional field, no breaking changes

## Files Changed

### Created
1. `web/src/hooks/useRequiredSettings.ts` (42 lines)
   - Custom hook for checking missing settings
   
2. `web/src/components/node/RequiredSettingsWarning.tsx` (74 lines)
   - Warning component with button to open settings
   
3. `web/src/hooks/__tests__/useRequiredSettings.test.ts` (467 lines)
   - Comprehensive test suite

### Modified
1. `web/src/api.ts` (added 5 lines)
   - Added `required_settings?: string[]` to NodeMetadata
   
2. `web/src/components/node/BaseNode.tsx` (added 2 lines)
   - Imported and rendered RequiredSettingsWarning component

## Total Impact
- **Lines Added**: 590
- **Lines Modified**: 7
- **Files Changed**: 5
- **Tests Added**: 7
- **Breaking Changes**: 0
