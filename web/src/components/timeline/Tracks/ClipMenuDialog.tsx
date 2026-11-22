/**
 * ClipMenuDialog
 *
 * The small dialogs behind three clip menu items: repeat (copy count, D51),
 * rename and color (CE8, D55). One component, one mode per item.
 */

import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ColorSwatch,
  Dialog,
  FlexRow,
  ICON_SIZE,
  SPACING,
  NumberField,
  TextInput
} from "../../ui_primitives";
import CheckIcon from "@mui/icons-material/Check";
import { CLIP_LABEL_COLORS, CLIP_LABEL_COLUMNS } from "./clipLabelColors";

export const MAX_REPEAT_COUNT = 64;
/** One palette cell: big enough to read the color at a glance. */
const SWATCH_SIZE_PX = ICON_SIZE.lg + 4;

export type ClipMenuDialogApply =
  | { count: number }
  | { name: string }
  | { labelColor: string | null };

interface ClipMenuDialogProps {
  mode: "repeat" | "rename" | "color";
  clipName: string;
  currentColor?: string;
  onApply: (result: ClipMenuDialogApply) => void;
  onClose: () => void;
}

const clampCount = (raw: string): number => {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_REPEAT_COUNT, Math.max(1, n));
};

export const ClipMenuDialog = memo(function ClipMenuDialog({
  mode,
  clipName,
  currentColor,
  onApply,
  onClose
}: ClipMenuDialogProps) {
  const { t } = useTranslation();
  const [countText, setCountText] = useState("2");
  const [name, setName] = useState(clipName);

  const trimmed = name.trim();
  const confirm = useCallback(() => {
    if (mode === "repeat") onApply({ count: clampCount(countText) });
    else if (mode === "rename" && trimmed) onApply({ name: trimmed });
  }, [countText, mode, onApply, trimmed]);

  if (mode === "color") {
    return (
      <Dialog
        open
        onClose={onClose}
        title={t("i18n-next59.clipMenu.colorTitle")}
        minWidth={0}
        onConfirm={() => onApply({ labelColor: null })}
        confirmText={t("i18n-next59.clipMenu.noColor")}
        actionButtonsProps={{ confirmButtonProps: { variant: "outlined" } }}
      >
        <FlexRow
          role="group"
          aria-label={t("i18n-next59.clipMenu.colorTitle")}
          sx={{
            display: "grid",
            gridTemplateColumns: `repeat(${CLIP_LABEL_COLUMNS}, max-content)`,
            gap: SPACING.xs
          }}
        >
          {CLIP_LABEL_COLORS.map((color) => {
            const selected =
              color.toLowerCase() === currentColor?.toLowerCase();
            return (
              <FlexRow
                key={color}
                sx={{ position: "relative" }}
                aria-current={selected || undefined}
              >
                <ColorSwatch
                  color={color}
                  size={SWATCH_SIZE_PX}
                  shape="square"
                  selected={selected}
                  onClick={(c) => onApply({ labelColor: c })}
                />
                {selected && (
                  <CheckIcon
                    aria-hidden
                    sx={{
                      position: "absolute",
                      inset: 0,
                      margin: "auto",
                      fontSize: ICON_SIZE.sm,
                      color: "common.white",
                      pointerEvents: "none",
                      filter: (theme) =>
                        `drop-shadow(0 0 1px ${theme.vars.palette.c_scrim})`
                    }}
                  />
                )}
              </FlexRow>
            );
          })}
        </FlexRow>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t(
        mode === "repeat"
          ? "i18n-next59.clipMenu.repeatTitle"
          : "i18n-next59.clipMenu.renameTitle"
      )}
      minWidth={0}
      onConfirm={confirm}
      confirmText={t(
        mode === "repeat"
          ? "i18n-next59.clipMenu.repeatConfirm"
          : "i18n-next59.clipMenu.renameConfirm"
      )}
      confirmDisabled={mode === "rename" && trimmed === ""}
    >
      {mode === "repeat" ? (
        <NumberField
          autoFocus
          label={t("i18n-next59.clipMenu.copies")}
          ariaLabel={t("i18n-next59.clipMenu.copies")}
          value={countText}
          onValueChange={setCountText}
          min={1}
          max={MAX_REPEAT_COUNT}
          step={1}
        />
      ) : (
        <TextInput
          autoFocus
          label={t("i18n-next59.clipMenu.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirm();
          }}
        />
      )}
    </Dialog>
  );
});
