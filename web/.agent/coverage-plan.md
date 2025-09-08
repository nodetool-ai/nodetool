# Test Coverage Improvement Plan

## Current Coverage Status
- Overall: ~12% coverage
- Utils: 18.63% coverage
- Components: ~5% coverage 
- Stores: 0% coverage
- Hooks: ~5% coverage

## High Priority Areas (Currently 0% Coverage)

### 1. Utils (Simple functions, easy to test):
- providerDisplay.ts (0%)
- sentry.ts (0%)
- fileExplorer.ts (0%)
- workflowSearch.ts (0%)
- sanitize.ts (0%)
- highlightText.ts (0%)
- browser.ts (0%)
- errorHandling.ts (0%)
- createAssetFile.ts (0%)
- NodeTypeMapping.ts (0%)
- modelFilters.ts (0%)
- huggingFaceUtils.ts (0%)

### 2. Stores (State management):
- All stores have 0% coverage
- Start with simpler stores like:
  - NotificationStore.ts
  - ErrorStore.ts
  - PanelStore.ts
  - AppHeaderStore.ts

### 3. Hooks (React hooks):
- Most hooks have 0% coverage
- Start with simpler hooks first

## Current Issues
- Canvas module issue affecting some tests (particularly component tests)
- But utility tests work fine

## Strategy
1. Focus on utilities first (easier to test, no React dependencies)
2. Then move to stores (state management)
3. Finally tackle components and hooks

## Next Steps
1. Write tests for providerDisplay.ts
2. Write tests for sentry.ts
3. Write tests for fileExplorer.ts
4. Write tests for workflowSearch.ts
5. Write tests for sanitize.ts