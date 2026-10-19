import { memo } from "react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  FlexColumn,
  FlexRow,
  SectionHeader,
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
const ShortcutsDialog = ({ open, onClose }: ShortcutsDialogProps) => {
  const { t } = useTranslation();
  return (
    <Dialog
    open={open}
    onClose={onClose}
    title={t("i18n-next38.shortcuts.title")}
    maxWidth="sm"
    fullWidth
  >
    <FlexRow gap={SPACING.xl} wrap align="flex-start">
      {GROUPS.map((group) => (
        <FlexColumn key={group} gap={SPACING.xs} sx={{ flex: "1 1 220px", minWidth: 0 }}>
          <SectionHeader title={t(`i18n-next38.shortcuts.groups.${group}`)} size="small" />
          {EDITOR_SHORTCUTS.filter((s) => s.group === group).map((s) => (
            <FlexRow key={s.action} justify="space-between" align="center" gap={SPACING.md}>
              <Text size="small">{t(`i18n-next38.shortcuts.actions.${s.action}`)}</Text>
              <ShortcutHint shortcut={s.keys} size="small" />
            </FlexRow>
          ))}
          {group === "View" && (
            <FlexRow justify="space-between" align="center" gap={SPACING.md}>
              <Text size="small">{t("i18n-next38.shortcuts.orbitPanZoom")}</Text>
              <Text size="smaller" color="secondary">{t("i18n-next38.shortcuts.orbitPanZoomHint")}</Text>
            </FlexRow>
          )}
          {group === "Transform" && (
            <FlexRow justify="space-between" align="center" gap={SPACING.md}>
              <Text size="small">{t("i18n-next38.shortcuts.scrubValue")}</Text>
              <Text size="smaller" color="secondary">{t("i18n-next38.shortcuts.scrubValueHint")}</Text>
            </FlexRow>
          )}
        </FlexColumn>
      ))}
    </FlexRow>
    </Dialog>
  );
};

export default memo(ShortcutsDialog);
