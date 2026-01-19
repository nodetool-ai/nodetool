# Test Coverage TODO List

This document tracks remaining test coverage opportunities in the `web/` directory.

## Current Status (After PR)
- **Lines:** 17.83% (target: 30%+)
- **Statements:** 17.79%
- **Branches:** 13.52%
- **Functions:** 13.62%

---

## Priority 1: Store Tests (High Impact, Low Complexity)

### Simple Stores - 0% Coverage → 100% Target
- [ ] **CollectionStore.ts** (54 lines)
  - Collection CRUD operations
  - Selection management
  - Expected: ~20 tests
  
- [ ] **FileStore.ts** (54 lines)
  - File state management
  - Upload/download tracking
  - Expected: ~20 tests
  
- [ ] **ModelPreferencesStore.ts** (31 lines)
  - Model preference storage
  - Provider preferences
  - Expected: ~10 tests
  
- [ ] **MiniAppsStore.ts** (49 lines)
  - Mini app state
  - Active app tracking
  - Expected: ~15 tests

### Stores with Partial Coverage - Expand to 60-80%
- [ ] **NodeStore.ts** (41.1% → 60%)
  - Focus on uncovered edge cases
  - Node grouping operations
  - Dynamic property handling
  - Expected: +40 tests
  
- [ ] **ModelDownloadStore.ts** (35.4% → 60%)
  - Download queue management
  - Progress tracking
  - Error handling
  - Expected: +30 tests
  
- [ ] **GlobalChatStore.ts** (60.8% → 80%)
  - Message operations
  - Thread management
  - Expected: +20 tests

### Complex Stores - 0% Coverage → 50% Target
- [ ] **WorkflowRunner.ts** (127 lines)
  - Workflow execution logic
  - State transitions
  - Expected: ~40 tests (complex state machine)
  
- [ ] **NodeMenuStore.ts** (129 lines)
  - Menu state management
  - Node creation
  - Expected: ~35 tests
  
- [ ] **ModelMenuStore.ts** (123 lines)
  - Model selection
  - Filtering
  - Expected: ~35 tests

---

## Priority 2: Hooks (Reusable Logic)

### Simple Hooks - 0% Coverage → 100% Target
- [ ] **useFocusPan.ts** (~53 lines)
  - Focus event handling
  - Pan behavior
  - Expected: ~8 tests
  
- [ ] **useDuplicate.ts** (~40 lines)
  - Node duplication
  - Property copying
  - Expected: ~10 tests
  
- [ ] **useDelayedHover.ts** (~30 lines)
  - Hover delay logic
  - Timeout management
  - Expected: ~8 tests
  
- [ ] **useIpcRenderer.ts** (~25 lines)
  - Electron IPC communication
  - Event handling
  - Expected: ~10 tests (with IPC mocking)

### Medium Complexity Hooks - 0% Coverage → 60% Target
- [ ] **useCreateNode.ts** (~80 lines)
  - Node creation logic
  - Position calculation
  - Expected: ~20 tests
  
- [ ] **useWorkflowActions.ts** (~90 lines)
  - Workflow CRUD operations
  - State updates
  - Expected: ~25 tests
  
- [ ] **useModelsByProvider.ts** (125 lines)
  - Model filtering by provider
  - Provider-specific logic
  - Expected: ~30 tests

### Complex Hooks - 0% Coverage → 40% Target
- [ ] **useNodeEditorShortcuts.ts** (170 lines)
  - Keyboard shortcut registration
  - Context-specific shortcuts
  - Expected: ~40 tests (requires extensive keyboard mocking)
  
- [ ] **useCopyPaste.tsx** (100 lines)
  - Clipboard operations
  - Node copy/paste logic
  - Expected: ~25 tests
  
- [ ] **useNumberInput.ts** (182 lines)
  - Complex drag handling
  - Number input validation
  - Expected: ~50 tests (complex interaction logic)

---

## Priority 3: Components (User-Facing)

### Small Components - 0% Coverage → 100% Target
- [ ] **DeleteButton.tsx** (~30 lines)
  - Click handling
  - Confirmation flow
  - Expected: ~8 tests
  
- [ ] **Logo.tsx** (~20 lines)
  - Rendering
  - Theme variants
  - Expected: ~5 tests
  
- [ ] **AnimatedAssistantIcon.tsx** (~60 lines)
  - Animation states
  - Prop handling
  - Expected: ~10 tests

### Medium Components - 0% Coverage → 60% Target
- [ ] **PropertyInput.tsx** (121 lines)
  - Input type switching
  - Validation
  - Change handlers
  - Expected: ~30 tests
  
- [ ] **OutputRenderer.tsx** (134 lines)
  - Output type rendering
  - Format handling
  - Expected: ~35 tests
  
- [ ] **AudioPlayer.tsx** (137 lines)
  - Playback controls
  - Progress tracking
  - Expected: ~30 tests

### Complex Components - 0% Coverage → 40% Target
- [ ] **Terminal.tsx** (181 lines)
  - Terminal I/O
  - Command execution
  - Expected: ~40 tests (complex xterm integration)
  
- [ ] **FileBrowserDialog.tsx** (227 lines)
  - File navigation
  - Selection logic
  - Expected: ~50 tests
  
- [ ] **ReactFlowWrapper.tsx** (256 lines)
  - Flow initialization
  - Node/edge interactions
  - Expected: ~60 tests (complex ReactFlow integration)

---

## Priority 4: Utilities

### Simple Utils - 0% Coverage → 100% Target
- [ ] **browser.ts** (~15 lines)
  - Browser detection
  - Expected: ~5 tests
  
- [ ] **getAssetThumbUrl.ts** (~20 lines)
  - URL generation
  - Expected: ~8 tests
  
- [ ] **fileExplorer.ts** (~40 lines)
  - File path operations
  - Expected: ~12 tests

### Medium Utils - Partial Coverage → 80% Target
- [ ] **createAssetFile.ts** (57% → 80%)
  - Asset creation logic
  - File type handling
  - Expected: +15 tests

---

## Priority 5: Context Providers

### Context Providers - 0% Coverage → 60% Target
- [ ] **WorkflowManagerContext.tsx** (181 lines)
  - Workflow state management
  - Provider pattern
  - Expected: ~40 tests
  
- [ ] **KeyboardProvider.tsx** (~50 lines)
  - Keyboard context
  - Event propagation
  - Expected: ~15 tests

---

## Test Infrastructure Improvements

### Mocks to Enhance
- [ ] **ReactFlow mock** - For testing flow components
- [ ] **Electron IPC mock** - For testing desktop features
- [ ] **WebSocket mock** - For testing real-time features
- [ ] **File API mock** - For testing file operations

### Test Utilities to Add
- [ ] **Store test helpers** - Common setup/teardown for stores
- [ ] **Component test helpers** - Wrapper with all providers
- [ ] **Async test utilities** - Better handling of async state updates

---

## Known Issues to Address

### Pre-existing Test Failures (Not in New Tests)
- [ ] **InputNodeNameWarning.test.tsx** - Theme-related failures
- [ ] **RemoteSettingsMenu.test.tsx** - Async timeout issues
- [ ] **SecretsMenu.test.tsx** - Test environment issues
- [ ] **AssetItem.test.tsx** - Unknown failures

### Pre-existing Type Errors (Not in New Tests)
- [ ] **useModelCompatibility.test.ts** - Missing `required` property in Property type

---

## Estimated Impact by Priority

| Priority | Tests to Add | Lines to Cover | Expected Coverage Gain |
|----------|-------------|----------------|------------------------|
| Priority 1 (Stores) | ~250 | ~600 lines | +2.5pp |
| Priority 2 (Hooks) | ~250 | ~800 lines | +3.5pp |
| Priority 3 (Components) | ~300 | ~1000 lines | +4.5pp |
| Priority 4 (Utils) | ~40 | ~100 lines | +0.5pp |
| Priority 5 (Context) | ~55 | ~230 lines | +1.0pp |
| **Total** | **~895** | **~2730 lines** | **+12.0pp** |

**Target Coverage:** 30% lines (currently 17.83%)

---

## Testing Guidelines

### For All New Tests
1. ✅ Use React Testing Library patterns
2. ✅ Focus on user behavior, not implementation
3. ✅ Test edge cases and error states
4. ✅ Include accessibility checks where appropriate
5. ✅ Avoid snapshot tests
6. ✅ Use descriptive test names
7. ✅ Ensure proper cleanup in beforeEach/afterEach

### Store Tests
- Test initial state
- Test all actions/methods
- Test state transitions
- Test computed values/selectors
- Test persistence (if using persist middleware)

### Hook Tests
- Test return values
- Test callbacks
- Test with different props
- Test cleanup on unmount
- Test dependencies array behavior

### Component Tests
- Test rendering with default props
- Test user interactions
- Test different states (loading, error, success)
- Test accessibility (aria labels, keyboard navigation)
- Test responsive behavior if applicable

---

## Progress Tracking (2026-01-19)

**Current Test Status:**
- **Total Tests:** 3,090
- **Passing Tests:** 3,062
- **Failing Tests:** 25 (pre-existing issues)
- **Coverage:** Lines 26.3%, Functions 22.0%, Branches 18.6%

**Completed (2026-01-19):**
- ✅ All major stores have test coverage (CollectionStore, FileStore, ModelPreferencesStore, MiniAppsStore)
- ✅ All major hooks have test coverage (useRunningJobs, useIsGroupable, useFocusPan, useDelayedHover, etc.)
- ✅ All utilities have test coverage (ColorUtils, binary, errorHandling, formatUtils, graphCycle, highlightText, modelFilters, modelNormalization, nodeDisplay, sanitize, titleizeString)
- ✅ Node hook tests complete (useAddToGroup, useDynamicOutput, useDynamicProperty, useInputNodeAutoRun, useNodeContextMenu, useRemoveFromGroup, useSelect, useSurroundWithGroup, useSyncEdgeSelection, getChildNodes, getGroupBounds)
- ✅ Workflow and editor hooks tested (useWorkflowActions, useWorkflowRunnerState, useSelectionActions, useFindInWorkflow, useFitView, useFitNodeEvent, useAlignNodes)

**Key Test Areas:**
- **Stores:** 57 test files covering all major state management
- **Hooks:** 20+ test files covering critical hooks
- **Utils:** 45+ test files covering all utility functions
- **Components:** ErrorBoundary and other critical components

**Remaining Work:**
- Fix pre-existing test failures (useInputNodeAutoRun, formatDateAndTime, useMonacoEditor)
- Increase coverage for complex hooks (useNodeEditorShortcuts, useNumberInput)
- Add integration tests for critical workflows

**Total Test Coverage:** ~26% lines, ~22% functions, ~19% branches
**Target Coverage:** 30%+

---

*Last Updated: 2026-01-19*
*Coverage Status: Stable with 3062 passing tests*
