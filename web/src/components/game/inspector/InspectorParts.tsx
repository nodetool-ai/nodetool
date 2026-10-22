import type { KeyboardEvent, ReactNode } from "react";
import AddIcon from "@mui/icons-material/AddOutlined";

import { CollapsibleSection, CONTROL, EditorButton, FlexColumn, FlexRow, Label, SPACING, ToolbarIconButton } from "../../ui_primitives";

const FIELD_WIDTH = { width: "100%", minWidth: 0 } as const;
const ACTION_SX = { width: CONTROL.height.xs, height: CONTROL.height.xs, p: SPACING.none, flexShrink: 0, color: "text.secondary", "& svg": { fontSize: "1.1em" } } as const;
const ADD_BUTTON_SX = { alignSelf: "flex-start", color: "text.secondary", "&:hover": { color: "text.primary" } } as const;

// A row action can sit inside a collapsible header, which toggles on click and on Enter or Space.
const stopKeyToggle = (event: KeyboardEvent): void => {
  if (event.key === "Enter" || event.key === " ") event.stopPropagation();
};

interface RowActionProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

/** A 24px icon action aligned to the end of a value row or a group header. */
export function RowAction({ icon, label, onClick, disabled }: RowActionProps) {
  // A disabled button cannot show a tooltip, so it keeps only its accessible name.
  return <ToolbarIconButton icon={icon} tooltip={disabled ? "" : label} ariaLabel={label} disabled={disabled} sx={ACTION_SX} onKeyDown={stopKeyToggle}
    onClick={(event) => { event.stopPropagation(); onClick(); }} />;
}

interface FieldGroupProps {
  readonly title: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

/** A nested group inside a component section: a folding header with the group name and its actions at the right. */
export function FieldGroup({ title, actions, children }: FieldGroupProps) {
  return <CollapsibleSection compact sx={FIELD_WIDTH} title={<FlexRow align="center" gap={SPACING.xs} sx={{ minWidth: 0, minHeight: CONTROL.height.xs }}>
    <Label component="span" sx={{ mb: 0, flex: 1, minWidth: 0, color: "text.primary" }}>{title}</Label>
    {actions}
  </FlexRow>}>
    <FlexColumn gap={SPACING.xs} sx={{ ...FIELD_WIDTH, pb: SPACING.xs }}>{children}</FlexColumn>
  </CollapsibleSection>;
}

interface AddButtonProps {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

/** A compact text button that adds one item to the group above it, aligned to the label column. */
export function AddButton({ children, onClick, disabled }: AddButtonProps) {
  return <EditorButton variant="text" startIcon={<AddIcon />} sx={ADD_BUTTON_SX} disabled={disabled} onClick={onClick}>{children}</EditorButton>;
}
