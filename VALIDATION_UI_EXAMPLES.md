# Visual Examples of Validation

## Add Dynamic Input Dialog

### Before User Input
```
┌─────────────────────────────────────┐
│          Add Input              [X] │
├─────────────────────────────────────┤
│                                     │
│  Name: [_________________]          │
│        Cannot start with a number   │
│                                     │
│               [Cancel]  [Add]       │
└─────────────────────────────────────┘
```

### Valid Input Example
```
┌─────────────────────────────────────┐
│          Add Input              [X] │
├─────────────────────────────────────┤
│                                     │
│  Name: [myProperty________]         │
│        Cannot start with a number   │
│                                     │
│               [Cancel]  [Add]       │
└─────────────────────────────────────┘
```
✅ Clicking "Add" succeeds - property is created

### Invalid Input Example #1
```
┌─────────────────────────────────────┐
│          Add Input              [X] │
├─────────────────────────────────────┤
│                                     │
│  Name: [1invalidName______] ⚠️      │
│        Name cannot start with a     │
│        number. Use a letter or      │
│        underscore instead.          │
│                                     │
│               [Cancel]  [Add]       │
└─────────────────────────────────────┘
```
❌ Error shown after clicking "Add" with invalid input

### Invalid Input Example #2
```
┌─────────────────────────────────────┐
│          Add Input              [X] │
├─────────────────────────────────────┤
│                                     │
│  Name: [__________________] ⚠️      │
│        Name cannot be empty         │
│                                     │
│               [Cancel]  [Add]       │
└─────────────────────────────────────┘
```
❌ Error shown when trying to add empty name

## Add Dynamic Output Dialog

### Before User Input
```
┌─────────────────────────────────────┐
│         Add Output              [X] │
├─────────────────────────────────────┤
│                                     │
│  Name: [_________________]          │
│        Cannot start with a number   │
│                                     │
│  Type: [string ▼]                   │
│                                     │
│               [Cancel]  [Add]       │
└─────────────────────────────────────┘
```

### Valid Input Example
```
┌─────────────────────────────────────┐
│         Add Output              [X] │
├─────────────────────────────────────┤
│                                     │
│  Name: [output1___________]         │
│        Cannot start with a number   │
│                                     │
│  Type: [int ▼]                      │
│                                     │
│               [Cancel]  [Add]       │
└─────────────────────────────────────┘
```
✅ Clicking "Add" succeeds - output is created

### Invalid Input Example
```
┌─────────────────────────────────────┐
│         Add Output              [X] │
├─────────────────────────────────────┤
│                                     │
│  Name: [99problems________] ⚠️      │
│        Name cannot start with a     │
│        number. Use a letter or      │
│        underscore instead.          │
│                                     │
│  Type: [string ▼]                   │
│                                     │
│               [Cancel]  [Add]       │
└─────────────────────────────────────┘
```
❌ Error shown after clicking "Add" with invalid input

## Rename Dynamic Output Dialog

### Before User Input (Editing existing output)
```
┌─────────────────────────────────────┐
│       Rename Output             [X] │
├─────────────────────────────────────┤
│                                     │
│  Name: [oldName___________]         │
│        Cannot start with a number   │
│                                     │
│  Type: [string ▼]                   │
│                                     │
│               [Cancel]  [Save]      │
└─────────────────────────────────────┘
```

### Valid Rename Example
```
┌─────────────────────────────────────┐
│       Rename Output             [X] │
├─────────────────────────────────────┤
│                                     │
│  Name: [newValidName______]         │
│        Cannot start with a number   │
│                                     │
│  Type: [float ▼]                    │
│                                     │
│               [Cancel]  [Save]      │
└─────────────────────────────────────┘
```
✅ Clicking "Save" succeeds - output is renamed

### Invalid Rename Example
```
┌─────────────────────────────────────┐
│       Rename Output             [X] │
├─────────────────────────────────────┤
│                                     │
│  Name: [0newName__________] ⚠️      │
│        Name cannot start with a     │
│        number. Use a letter or      │
│        underscore instead.          │
│                                     │
│  Type: [bool ▼]                     │
│                                     │
│               [Cancel]  [Save]      │
└─────────────────────────────────────┘
```
❌ Error shown after clicking "Save" with invalid input

## User Interaction Flow

### Scenario 1: User Makes a Mistake and Corrects It

```
Step 1: User opens "Add Input" dialog
┌─────────────────────────────────────┐
│  Name: [_________________]          │
│        Cannot start with a number   │ ← Helper text visible
└─────────────────────────────────────┘

Step 2: User types invalid name
┌─────────────────────────────────────┐
│  Name: [1firstInput_______]         │
│        Cannot start with a number   │
└─────────────────────────────────────┘

Step 3: User clicks "Add"
┌─────────────────────────────────────┐
│  Name: [1firstInput_______] ⚠️      │
│        Name cannot start with a     │ ← Error replaces helper
│        number. Use a letter or      │
│        underscore instead.          │
└─────────────────────────────────────┘

Step 4: User starts typing to fix
┌─────────────────────────────────────┐
│  Name: [f_________________]         │
│        Cannot start with a number   │ ← Error clears, helper returns
└─────────────────────────────────────┘

Step 5: User completes valid name
┌─────────────────────────────────────┐
│  Name: [firstInput________]         │
│        Cannot start with a number   │
└─────────────────────────────────────┘

Step 6: User clicks "Add" → Success! ✅
```

### Scenario 2: User Follows Guidance and Gets It Right

```
Step 1: User opens "Add Output" dialog
┌─────────────────────────────────────┐
│  Name: [_________________]          │
│        Cannot start with a number   │ ← Sees guidance
└─────────────────────────────────────┘

Step 2: User types valid name (following guidance)
┌─────────────────────────────────────┐
│  Name: [myOutput__________]         │
│        Cannot start with a number   │
└─────────────────────────────────────┘

Step 3: User clicks "Add" → Success! ✅
```

## Key UX Benefits Illustrated

1. **Proactive**: Helper text is ALWAYS visible, educating before mistakes
2. **Clear**: Error messages are specific and suggest solutions
3. **Forgiving**: Errors disappear when user starts fixing
4. **Fast**: Validation is instant, no network delay
5. **Consistent**: Same pattern across all three dialogs

## Validation Examples Summary

### ✅ Valid Names (Will Be Accepted)
- `myProperty`
- `output1`
- `result123`
- `_privateVar`
- `_123`
- `userName`
- `data2process`

### ❌ Invalid Names (Will Show Error)
- `1stPlace` → "Name cannot start with a number..."
- `2ndAttempt` → "Name cannot start with a number..."
- `99problems` → "Name cannot start with a number..."
- `0value` → "Name cannot start with a number..."
- `` (empty) → "Name cannot be empty"
- `   ` (spaces) → "Name cannot be empty"
