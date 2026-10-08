import { memo } from "react";

import {
  Dialog,
  FlexColumn,
  FlexRow,
  ShortcutHint,
  Text,
  SPACING
} from "../ui_primitives";
import { EDITOR_SHORTCUTS, type EditorShortcut } from "./editorShortcuts";

const GROUPS: EditorShortcut["group"][] = ["General", "Transform", "Selection", "View"];

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Every editor shortcut, grouped, read from the same table the editor binds. */
const ShortcutsDialog = ({ open, onClose }: ShortcutsDialogProps) => (
  <Dialog
    open={open}
    onClose={onClose}
    title="3D editor shortcuts"
    showCloseButton
    minWidth={560}
  >
    <FlexRow gap={SPACING.xl} wrap align="flex-start">
      {GROUPS.map((group) => (
        <FlexColumn key={group} gap={SPACING.xs} sx={{ flex: "1 1 220px", minWidth: 0 }}>
          <Text size="smaller" weight={600} color="secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.06em", mb: SPACING.xs }}>
            {group}
          </Text>
          {EDITOR_SHORTCUTS.filter((s) => s.group === group).map((s) => (
            <FlexRow key={s.action} justify="space-between" align="center" gap={SPACING.md}>
              <Text size="small">{s.label}</Text>
              <ShortcutHint shortcut={s.keys} size="small" />
            </FlexRow>
          ))}
          {group === "View" && (
            <FlexRow justify="space-between" align="center" gap={SPACING.md}>
              <Text size="small">Orbit / pan / zoom</Text>
              <Text size="smaller" color="secondary">Left / right drag, wheel</Text>
            </FlexRow>
          )}
          {group === "Transform" && (
            <FlexRow justify="space-between" align="center" gap={SPACING.md}>
              <Text size="small">Scrub a value</Text>
              <Text size="smaller" color="secondary">Drag the X / Y / Z label</Text>
            </FlexRow>
          )}
        </FlexColumn>
      ))}
    </FlexRow>
  </Dialog>
);

export default memo(ShortcutsDialog);
