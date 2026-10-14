import { memo, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import AddIcon from "@mui/icons-material/Add";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

import { CONTROL, EditorButton, EditorMenu, EditorMenuItem, SPACING, ToolbarIconButton } from "../../ui_primitives";

const ICON_SX = { width: CONTROL.height.xs, height: CONTROL.height.xs, p: SPACING.none, flexShrink: 0, color: "text.secondary", "& svg": { fontSize: "1.1em" } } as const;

export interface InspectorAddOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

interface InspectorAddMenuProps {
  /** Button text, such as "Add component". It is also the button's accessible name. */
  readonly label: string;
  readonly options: readonly InspectorAddOption[];
  readonly onSelect: (value: string) => void;
  readonly disabled?: boolean;
  /** `icon` draws a 24px plus button for a group header, with the label as its tooltip. */
  readonly variant?: "button" | "icon";
}

// The icon variant sits in a collapsible header. React events bubble out of the menu
// portal to that header, so the menu keeps clicks and toggle keys to itself.
const stopToggle = (event: SyntheticEvent): void => { event.stopPropagation(); };
const stopKeyToggle = (event: KeyboardEvent): void => {
  if (event.key === "Enter" || event.key === " ") event.stopPropagation();
};

/** One compact menu button that lists every optional item an inspector group can add. */
function InspectorAddMenu({ label, options, onSelect, disabled, variant = "button" }: InspectorAddMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const inactive = disabled || options.length === 0;
  return <>
    {variant === "icon" ? <ToolbarIconButton icon={<AddIcon />} tooltip={inactive ? "" : label} ariaLabel={label} disabled={inactive} aria-haspopup="menu" aria-expanded={Boolean(anchor)}
      sx={ICON_SX} onKeyDown={stopKeyToggle} onClick={(event) => { event.stopPropagation(); setAnchor(event.currentTarget); }} /> : <EditorButton variant="text" disabled={inactive} aria-haspopup="menu" aria-expanded={Boolean(anchor)}
      startIcon={<AddIcon />} endIcon={<ArrowDropDownIcon />}
      sx={{ alignSelf: "flex-start", color: "text.secondary", "&:hover": { color: "text.primary" } }}
      onClick={(event) => setAnchor(event.currentTarget)}>{label}</EditorButton>}
    <EditorMenu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} onClick={stopToggle} onKeyDown={stopKeyToggle}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }} transformOrigin={{ vertical: "top", horizontal: "left" }}>
      {options.map((option) => <EditorMenuItem key={option.value} disabled={option.disabled} onClick={() => {
        setAnchor(null);
        onSelect(option.value);
      }}>{option.label}</EditorMenuItem>)}
    </EditorMenu>
  </>;
}

export default memo(InspectorAddMenu);
