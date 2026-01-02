# UI Primitives Usage Examples

This document provides practical examples of using the UI primitives from `src/components/ui_primitives/`.

## Basic Usage Examples

### Example 1: Simple Property Input

A property input component that uses NodeTextField with semantic props:

```tsx
import React from "react";
import { NodeTextField, EditorUiProvider } from "../ui_primitives";
import PropertyLabel from "../node/PropertyLabel";

interface SimplePropertyProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  defaultValue?: string;
  error?: string;
}

export const SimpleProperty: React.FC<SimplePropertyProps> = ({
  name,
  value,
  onChange,
  defaultValue,
  error
}) => {
  const hasChanged = defaultValue !== undefined && value !== defaultValue;
  const hasError = Boolean(error);

  return (
    <EditorUiProvider scope="node">
      <div className="simple-property">
        <PropertyLabel name={name} id={`prop-${name}`} />
        <NodeTextField
          value={value}
          onChange={(e) => onChange(e.target.value)}
          changed={hasChanged}
          invalid={hasError}
          placeholder={`Enter ${name}`}
        />
        {error && <span className="error-text">{error}</span>}
      </div>
    </EditorUiProvider>
  );
};
```

### Example 2: Number Range Property

A numeric property with a slider using NodeNumberInput and NodeSlider:

```tsx
import React from "react";
import { 
  NodeNumberInput, 
  NodeSlider, 
  EditorUiProvider 
} from "../ui_primitives";
import PropertyLabel from "../node/PropertyLabel";

interface RangePropertyProps {
  name: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  defaultValue?: number;
}

export const RangeProperty: React.FC<RangePropertyProps> = ({
  name,
  value,
  onChange,
  min,
  max,
  defaultValue
}) => {
  const hasChanged = defaultValue !== undefined && value !== defaultValue;

  return (
    <EditorUiProvider scope="node">
      <div className="range-property">
        <PropertyLabel name={name} id={`range-${name}`} />
        
        {/* Number input for precise control */}
        <NodeNumberInput
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={1}
          changed={hasChanged}
        />
        
        {/* Slider for visual feedback */}
        <NodeSlider
          value={value}
          onChange={(_, val) => onChange(val as number)}
          min={min}
          max={max}
          changed={hasChanged}
        />
      </div>
    </EditorUiProvider>
  );
};
```

### Example 3: Select with Options

A select dropdown using NodeSelectPrimitive and NodeMenuItem:

```tsx
import React from "react";
import { 
  NodeSelectPrimitive, 
  NodeMenuItem, 
  EditorUiProvider 
} from "../ui_primitives";
import PropertyLabel from "../node/PropertyLabel";

interface Option {
  value: string;
  label: string;
}

interface SelectPropertyProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  defaultValue?: string;
}

export const SelectProperty: React.FC<SelectPropertyProps> = ({
  name,
  value,
  onChange,
  options,
  defaultValue
}) => {
  const hasChanged = defaultValue !== undefined && value !== defaultValue;

  return (
    <EditorUiProvider scope="node">
      <div className="select-property">
        <PropertyLabel name={name} id={`select-${name}`} />
        <NodeSelectPrimitive
          value={value}
          onChange={(e) => onChange(e.target.value as string)}
          changed={hasChanged}
        >
          {options.map((option) => (
            <NodeMenuItem key={option.value} value={option.value}>
              {option.label}
            </NodeMenuItem>
          ))}
        </NodeSelectPrimitive>
      </div>
    </EditorUiProvider>
  );
};
```

### Example 4: Multi-Field Form

A form combining multiple primitives with consistent styling:

```tsx
import React, { useState } from "react";
import { 
  NodeTextField, 
  NodeNumberInput,
  NodeSwitch,
  NodeSelectPrimitive,
  NodeMenuItem,
  EditorButton,
  EditorUiProvider 
} from "../ui_primitives";

interface FormData {
  name: string;
  age: number;
  enabled: boolean;
  role: string;
}

export const MultiFieldForm: React.FC = () => {
  const [data, setData] = useState<FormData>({
    name: "",
    age: 0,
    enabled: true,
    role: "user"
  });

  const [defaults] = useState<FormData>({
    name: "",
    age: 0,
    enabled: false,
    role: "user"
  });

  const handleSubmit = () => {
    console.log("Form submitted:", data);
  };

  return (
    <EditorUiProvider scope="inspector">
      <form onSubmit={handleSubmit}>
        {/* Text input */}
        <div className="form-field">
          <label>Name</label>
          <NodeTextField
            value={data.name}
            onChange={(e) => setData({ ...data, name: e.target.value })}
            changed={data.name !== defaults.name}
            placeholder="Enter name"
          />
        </div>

        {/* Number input */}
        <div className="form-field">
          <label>Age</label>
          <NodeNumberInput
            value={data.age}
            onChange={(e) => setData({ ...data, age: Number(e.target.value) })}
            min={0}
            max={120}
            changed={data.age !== defaults.age}
          />
        </div>

        {/* Switch */}
        <div className="form-field">
          <label>Enabled</label>
          <NodeSwitch
            checked={data.enabled}
            onChange={(e) => setData({ ...data, enabled: e.target.checked })}
            changed={data.enabled !== defaults.enabled}
          />
        </div>

        {/* Select */}
        <div className="form-field">
          <label>Role</label>
          <NodeSelectPrimitive
            value={data.role}
            onChange={(e) => setData({ ...data, role: e.target.value as string })}
            changed={data.role !== defaults.role}
          >
            <NodeMenuItem value="user">User</NodeMenuItem>
            <NodeMenuItem value="admin">Admin</NodeMenuItem>
            <NodeMenuItem value="guest">Guest</NodeMenuItem>
          </NodeSelectPrimitive>
        </div>

        {/* Submit button */}
        <EditorButton onClick={handleSubmit} density="normal">
          Submit
        </EditorButton>
      </form>
    </EditorUiProvider>
  );
};
```

## Advanced Patterns

### Pattern 1: Context-Aware Density

Components automatically adapt to their context (node vs inspector):

```tsx
import React from "react";
import { NodeTextField, EditorUiProvider } from "../ui_primitives";

// In a node editor (compact density)
export const NodeField: React.FC = () => (
  <EditorUiProvider scope="node">
    <NodeTextField value="Compact" onChange={() => {}} />
  </EditorUiProvider>
);

// In an inspector panel (normal density)
export const InspectorField: React.FC = () => (
  <EditorUiProvider scope="inspector">
    <NodeTextField value="Normal" onChange={() => {}} />
  </EditorUiProvider>
);
```

### Pattern 2: Validation with Semantic Props

Use the `invalid` prop to show validation errors:

```tsx
import React, { useState } from "react";
import { NodeTextField } from "../ui_primitives";

export const ValidatedInput: React.FC = () => {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const validate = (val: string) => {
    if (val.length < 3) {
      setError("Minimum 3 characters required");
      return false;
    }
    setError("");
    return true;
  };

  return (
    <div>
      <NodeTextField
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          validate(e.target.value);
        }}
        invalid={Boolean(error)}
        placeholder="Enter value"
      />
      {error && <span className="error">{error}</span>}
    </div>
  );
};
```

### Pattern 3: Theme Integration

All primitives use `useTheme()` for consistent styling:

```tsx
import React from "react";
import { NodeSlider } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";

export const ThemedSlider: React.FC = () => {
  const theme = useTheme();
  const [value, setValue] = useState(50);

  return (
    <div style={{ padding: theme.spacing(2) }}>
      <NodeSlider
        value={value}
        onChange={(_, val) => setValue(val as number)}
        min={0}
        max={100}
        changed={value !== 50}
        sx={{
          // Additional custom styling if needed
          marginTop: theme.spacing(1)
        }}
      />
    </div>
  );
};
```

## Migration Checklist

When migrating existing components to use primitives:

1. **Replace raw MUI components**
   - `TextField` → `NodeTextField`
   - `Switch` → `NodeSwitch`
   - `Select` → `NodeSelectPrimitive`
   - `MenuItem` → `NodeMenuItem`
   - `Slider` → `NodeSlider`

2. **Add semantic props**
   - Add `changed` prop when tracking value changes
   - Add `invalid` prop for validation state
   - Consider `density` prop for size variants

3. **Remove DOM reach-in patterns**
   - Replace `"& fieldset"` with `"& .MuiOutlinedInput-notchedOutline"`
   - Move styling from parent to component props
   - Use `sx` prop for component-specific overrides

4. **Add EditorUiProvider**
   - Wrap component tree with appropriate scope
   - Use "node" for compact editor UI
   - Use "inspector" for normal inspector UI

5. **Test in context**
   - Verify in both node and inspector contexts
   - Check semantic prop behavior
   - Ensure ReactFlow compatibility (nodrag class)

## Best Practices

1. **Always use semantic props** instead of inline styling for state
2. **Reference `useTheme()`** for all visual values
3. **Keep parent components clean** - push styling to primitives
4. **Use EditorUiProvider** for consistent context
5. **Test with keyboard navigation** and accessibility tools
6. **Document custom patterns** in component comments
