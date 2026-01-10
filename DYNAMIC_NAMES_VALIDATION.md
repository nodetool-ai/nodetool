# Validation for Dynamic Property and Output Names

## Summary

This implementation adds validation to prevent users from creating dynamic properties and outputs with names that start with numbers. This is important because such names would be invalid identifiers in most programming languages and could cause issues in the backend processing.

## Changes Made

### 1. Created Validation Utility (`web/src/utils/identifierValidation.ts`)

A new utility module that provides:
- `validateIdentifierName()`: Validates that a name is a valid identifier
- `startsWithNumber()`: Helper function to check if a name starts with a number

The validation checks:
- ✅ Names starting with letters (a-z, A-Z)
- ✅ Names starting with underscore (_)
- ✅ Names with numbers after the first character
- ❌ Names starting with numbers (0-9)
- ❌ Empty or whitespace-only names

### 2. Updated Dynamic Input Dialog (`web/src/components/node/NodePropertyForm.tsx`)

Added validation to the "Add Input" dialog:
- Real-time error display when user attempts to add invalid names
- Helper text showing "Cannot start with a number" by default
- Error message changes to specific feedback when validation fails
- Error clears as user types to fix the issue

### 3. Updated Dynamic Output Dialogs (`web/src/components/node/NodePropertyForm.tsx` and `web/src/components/node/NodeOutputs.tsx`)

Added validation to both:
- "Add Output" dialog - when creating new outputs
- "Rename Output" dialog - when renaming existing outputs

Same validation behavior as inputs with appropriate error messages.

### 4. Comprehensive Tests (`web/src/utils/__tests__/identifierValidation.test.ts`)

17 tests covering:
- Valid identifier patterns
- Invalid identifier patterns  
- Error message quality
- Edge cases (whitespace, special characters)

## User Experience

### Before
Users could create dynamic properties/outputs with names like "1output", "99problems", etc., which would potentially cause backend errors.

### After
Users receive immediate, clear feedback:

**Helper Text (always visible):**
- "Cannot start with a number"

**Error Messages (on validation failure):**
- "Name cannot start with a number. Use a letter or underscore instead."
- "Name cannot be empty"

**UX Features:**
1. **Proactive Guidance**: Helper text is always visible, educating users before they make a mistake
2. **Immediate Feedback**: Validation occurs when clicking "Add" button
3. **Clear Error Messages**: Specific, actionable error messages
4. **Error Recovery**: Error clears when user starts typing, providing a smooth correction flow
5. **No Blocking**: Users can still cancel and try again

## Testing

All tests pass:
- ✅ 17 validation logic tests
- ✅ 2096 total application tests  
- ✅ No regressions introduced

## Files Changed

1. `web/src/utils/identifierValidation.ts` (new)
2. `web/src/utils/__tests__/identifierValidation.test.ts` (new)
3. `web/src/components/node/NodePropertyForm.tsx` (modified)
4. `web/src/components/node/NodeOutputs.tsx` (modified)

## Technical Details

### Validation Rules

The validation follows standard identifier naming conventions:
- First character must be a letter (a-z, A-Z) or underscore (_)
- Subsequent characters can include numbers
- Whitespace is trimmed before validation

### Implementation Notes

- Validation is performed client-side for immediate feedback
- No changes required to backend API
- Minimal, surgical changes to existing components
- Backward compatible - existing valid names remain valid

## Future Enhancements (Optional)

Could be extended to validate:
- Reserved keywords
- Maximum length limits
- Special character restrictions
- Duplicate name checking

However, these are out of scope for the current requirement.
