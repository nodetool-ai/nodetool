# Initial Coverage Report

## Overall Coverage Summary
- **Statements**: 3.38% (495/14641)
- **Branches**: 1.88% (86/4567)
- **Functions**: 2.57% (105/4085)
- **Lines**: 3.39% (494/14549)

## Areas with Low/No Coverage

### Priority 1: Core Utilities (100% coverage but more tests needed)
- src/utils/formatDateAndTime.ts - 100% covered
- src/utils/formatUtils.ts - 100% covered
- src/utils/getFileExtension.ts - 100% covered
- src/utils/titleizeString.ts - 100% covered
- src/utils/truncateString.ts - 100% covered

### Priority 2: Partially Covered Utils
- src/utils/ColorUtils.ts - 86.27% statements (missing lines: 24,98,101-103,123-127)

### Priority 3: Critical Zero Coverage Areas
- src/hooks/ - Most hooks have 0% coverage
- src/stores/ - Most stores have 0% coverage  
- src/components/ - Most components have low coverage
- src/utils/ - Many utilities have 0% coverage

### Test Files Failing
- Multiple test files failing due to canvas.node module issue