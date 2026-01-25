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

## Button Primitives Examples

### DialogActionButtons

Standardized confirm/cancel button pairs for dialogs:

```tsx
import React from "react";
import { DialogActionButtons } from "../ui_primitives";

export const DeleteConfirmDialog: React.FC = () => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    await deleteItem();
    setIsDeleting(false);
  };

  return (
    <Dialog open={true}>
      <DialogTitle>Delete Item?</DialogTitle>
      <DialogContent>Are you sure?</DialogContent>
      <DialogActionButtons
        onConfirm={handleConfirm}
        onCancel={handleClose}
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={isDeleting}
        destructive={true}
      />
    </Dialog>
  );
};
```

### ToolbarIconButton

Icon buttons with tooltips for toolbars:

```tsx
import React from "react";
import { ToolbarIconButton } from "../ui_primitives";
import SaveIcon from "@mui/icons-material/Save";
import DeleteIcon from "@mui/icons-material/Delete";

export const EditorToolbar: React.FC = () => (
  <div className="toolbar">
    <ToolbarIconButton
      icon={<SaveIcon />}
      tooltip="Save (Ctrl+S)"
      onClick={handleSave}
      variant="primary"
    />
    <ToolbarIconButton
      icon={<DeleteIcon />}
      tooltip="Delete"
      onClick={handleDelete}
      variant="error"
    />
  </div>
);
```

### PlaybackButton

Audio/video playback controls:

```tsx
import React, { useState } from "react";
import { PlaybackButton } from "../ui_primitives";

export const AudioPlayer: React.FC = () => {
  const [playState, setPlayState] = useState<"stopped" | "playing" | "paused">("stopped");

  return (
    <div className="audio-controls">
      <PlaybackButton
        state={playState}
        onPlay={() => setPlayState("playing")}
        onPause={() => setPlayState("paused")}
      />
      <PlaybackButton
        state={playState}
        playbackAction="stop"
        onStop={() => setPlayState("stopped")}
      />
    </div>
  );
};
```

### RunWorkflowButton

Run/stop workflow controls:

```tsx
import React from "react";
import { RunWorkflowButton } from "../ui_primitives";

export const WorkflowControls: React.FC = () => {
  const { isRunning, run, stop, isLoading } = useWorkflow();

  return (
    <RunWorkflowButton
      isRunning={isRunning}
      onRun={run}
      onStop={stop}
      isLoading={isLoading}
      variant="fab"
      showLabel
    />
  );
};
```

### SelectionControls

Bulk selection controls:

```tsx
import React from "react";
import { SelectionControls } from "../ui_primitives";

export const AssetList: React.FC = () => {
  const { selectedIds, selectAll, clearSelection, assets } = useAssetSelection();

  return (
    <div>
      <SelectionControls
        selectedCount={selectedIds.length}
        totalCount={assets.length}
        onSelectAll={selectAll}
        onClear={clearSelection}
      />
      {/* Asset list */}
    </div>
  );
};
```

### ViewModeToggle

View mode toggle buttons:

```tsx
import React, { useState } from "react";
import { ViewModeToggle } from "../ui_primitives";
import GridViewIcon from "@mui/icons-material/GridView";
import ListIcon from "@mui/icons-material/List";

export const AssetView: React.FC = () => {
  const [viewMode, setViewMode] = useState("grid");

  return (
    <ViewModeToggle
      value={viewMode}
      onChange={setViewMode}
      options={[
        { value: "grid", icon: <GridViewIcon />, tooltip: "Grid view" },
        { value: "list", icon: <ListIcon />, tooltip: "List view" }
      ]}
    />
  );
};
```

### ExpandCollapseButton

Expand/collapse content:

```tsx
import React, { useState } from "react";
import { ExpandCollapseButton } from "../ui_primitives";

export const CollapsibleSection: React.FC = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div className="header">
        <span>Section Title</span>
        <ExpandCollapseButton
          expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        />
      </div>
      {expanded && <div className="content">...</div>}
    </div>
  );
};
```

### RefreshButton

Refresh/reset actions:

```tsx
import React from "react";
import { RefreshButton } from "../ui_primitives";

export const DataTable: React.FC = () => {
  const { refetch, isRefetching } = useData();

  return (
    <div>
      <RefreshButton
        tooltip="Refresh data"
        onClick={refetch}
        isLoading={isRefetching}
      />
      {/* Table content */}
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

## New State & Toggle Components

### StateIconButton

A versatile icon button that handles multiple states (loading, active, disabled):

```tsx
import React, { useState } from "react";
import { StateIconButton } from "../ui_primitives";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SaveIcon from "@mui/icons-material/Save";
import FilterIcon from "@mui/icons-material/FilterList";
import FilterOffIcon from "@mui/icons-material/FilterListOff";

// Simple action button
export const RunButton: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);

  return (
    <StateIconButton
      icon={<PlayArrowIcon />}
      tooltip="Run workflow"
      onClick={() => setIsRunning(true)}
      isLoading={isRunning}
    />
  );
};

// Toggle button with active state
export const FilterButton: React.FC = () => {
  const [isActive, setIsActive] = useState(false);

  return (
    <StateIconButton
      icon={<FilterIcon />}
      activeIcon={<FilterOffIcon />}
      tooltip={isActive ? "Disable filter" : "Enable filter"}
      isActive={isActive}
      onClick={() => setIsActive(!isActive)}
      color="primary"
    />
  );
};

// Button with custom colors and sizes
export const SaveButton: React.FC = () => {
  const { save, isSaving } = useSave();

  return (
    <StateIconButton
      icon={<SaveIcon />}
      tooltip="Save changes"
      onClick={save}
      isLoading={isSaving}
      size="medium"
      color="success"
    />
  );
};
```

### LabeledToggle

A toggle button with icon, label, and expand/collapse indicator:

```tsx
import React, { useState } from "react";
import { LabeledToggle } from "../ui_primitives";
import LightbulbIcon from "@mui/icons-material/Lightbulb";
import PsychologyIcon from "@mui/icons-material/Psychology";
import InfoIcon from "@mui/icons-material/Info";

// Collapsible section toggle
export const ReasoningSection: React.FC = () => {
  const [showReasoning, setShowReasoning] = useState(false);

  return (
    <div>
      <LabeledToggle
        isOpen={showReasoning}
        onToggle={() => setShowReasoning(!showReasoning)}
        showLabel="Show reasoning"
        hideLabel="Hide reasoning"
        icon={<LightbulbIcon fontSize="inherit" />}
      />
      {showReasoning && <div>Reasoning content...</div>}
    </div>
  );
};

// Mode toggle without expand icon
export const AgentModeToggle: React.FC = () => {
  const [agentMode, setAgentMode] = useState(false);

  return (
    <LabeledToggle
      isOpen={agentMode}
      onToggle={() => setAgentMode(!agentMode)}
      showLabel="Enable agent mode"
      hideLabel="Disable agent mode"
      icon={<PsychologyIcon fontSize="small" />}
      showExpandIcon={false}
    />
  );
};

// Simple info toggle
export const InfoToggle: React.FC = () => {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <LabeledToggle
      isOpen={showInfo}
      onToggle={() => setShowInfo(!showInfo)}
      label="More information"
      icon={<InfoIcon />}
      size="medium"
    />
  );
};
```

### CircularActionButton

A circular action button with consistent styling for primary actions:

```tsx
import React, { useState } from "react";
import { CircularActionButton } from "../ui_primitives";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import AddIcon from "@mui/icons-material/Add";

// Primary workflow action
export const RunWorkflowButton: React.FC = () => {
  const { run, isRunning } = useWorkflow();

  return (
    <CircularActionButton
      icon={<PlayArrowIcon />}
      onClick={run}
      tooltip="Run workflow"
      isLoading={isRunning}
      backgroundColor="primary"
      size={32}
    />
  );
};

// Scroll to bottom button (fixed position)
export const ScrollToBottomButton: React.FC<{ isVisible: boolean }> = ({
  isVisible
}) => {
  const scrollToBottom = () => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  return (
    <CircularActionButton
      icon={<ArrowDownwardIcon />}
      onClick={scrollToBottom}
      tooltip="Scroll to bottom"
      position="fixed"
      bottom={120}
      left="50%"
      transform="translateX(-50%)"
      zIndex={1000}
      isVisible={isVisible}
      backgroundColor="grey.500"
      hoverBackgroundColor="grey.400"
    />
  );
};

// Create/add action with custom styling
export const CreateButton: React.FC = () => {
  const handleCreate = () => {
    console.log("Create new item");
  };

  return (
    <CircularActionButton
      icon={<AddIcon />}
      onClick={handleCreate}
      tooltip="Create new"
      size={48}
      backgroundColor="success.main"
      color="common.white"
      opacity={0.9}
    />
  );
};

// Bypass/toggle button with state-based colors
export const BypassButton: React.FC = () => {
  const [isBypassed, setIsBypassed] = useState(false);

  return (
    <CircularActionButton
      icon={isBypassed ? <VisibilityIcon /> : <VisibilityOffIcon />}
      onClick={() => setIsBypassed(!isBypassed)}
      tooltip={isBypassed ? "Enable" : "Bypass"}
      size={28}
      backgroundColor={isBypassed ? "warning.dark" : "transparent"}
      hoverBackgroundColor={isBypassed ? "warning.main" : "grey.800"}
      color={isBypassed ? "warning.contrastText" : "grey.400"}
    />
  );
};
```

## Composite Example: Using New Primitives Together

```tsx
import React, { useState } from "react";
import {
  StateIconButton,
  LabeledToggle,
  CircularActionButton
} from "../ui_primitives";
import SaveIcon from "@mui/icons-material/Save";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SettingsIcon from "@mui/icons-material/Settings";
import FilterIcon from "@mui/icons-material/FilterList";

export const WorkflowControls: React.FC = () => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filterActive, setFilterActive] = useState(false);
  const { save, run, isRunning, isSaving } = useWorkflow();

  return (
    <div className="workflow-controls">
      {/* Primary action */}
      <CircularActionButton
        icon={<PlayArrowIcon />}
        onClick={run}
        tooltip="Run workflow"
        isLoading={isRunning}
        size={40}
      />

      {/* Secondary actions */}
      <div className="secondary-actions">
        <StateIconButton
          icon={<SaveIcon />}
          tooltip="Save"
          onClick={save}
          isLoading={isSaving}
          color="success"
        />

        <StateIconButton
          icon={<FilterIcon />}
          tooltip="Toggle filter"
          isActive={filterActive}
          onClick={() => setFilterActive(!filterActive)}
          color="primary"
        />

        <StateIconButton
          icon={<SettingsIcon />}
          tooltip="Settings"
          onClick={() => console.log("Open settings")}
        />
      </div>

      {/* Advanced options toggle */}
      <LabeledToggle
        isOpen={showAdvanced}
        onToggle={() => setShowAdvanced(!showAdvanced)}
        showLabel="Show advanced options"
        hideLabel="Hide advanced options"
      />

      {showAdvanced && (
        <div className="advanced-options">
          {/* Advanced options content */}
        </div>
      )}
    </div>
  );
};
```
