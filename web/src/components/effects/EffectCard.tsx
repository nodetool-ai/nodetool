import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import type { Preset } from "@nodetool-ai/presets";

import {
  Box,
  ContextMenu,
  MenuItemPrimitive,
  PresetCard,
  SPACING,
  ToolbarIconButton
} from "../ui_primitives";
import { presetText } from "../../utils/presetText";

interface EffectCardProps {
  preset: Preset;
  selected: boolean;
  onSelect: (preset: Preset) => void;
  onOpenAsWorkflow: (preset: Preset) => void;
}

/** A preset card with its actions on the card (UX Guidelines 6.1). */
const EffectCard = ({
  preset,
  selected,
  onSelect,
  onOpenAsWorkflow
}: EffectCardProps) => {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { name } = presetText(t, preset);
  const closeMenu = useCallback(() => setAnchor(null), []);

  return (
    <Box sx={{ position: "relative" }} data-effect-id={preset.id}>
      <PresetCard preset={preset} selected={selected} onClick={onSelect} />
      <Box sx={{ position: "absolute", top: SPACING.xs, right: SPACING.xs }}>
        <ToolbarIconButton
          icon={<MoreVertIcon fontSize="inherit" />}
          tooltip={t("effectsGallery.card.actions", { name })}
          ariaLabel={t("effectsGallery.card.actions", { name })}
          onClick={(event: React.MouseEvent<HTMLElement>) =>
            setAnchor(event.currentTarget)
          }
        />
      </Box>
      <ContextMenu open={Boolean(anchor)} anchorEl={anchor} onClose={closeMenu}>
        <MenuItemPrimitive
          icon={<AccountTreeOutlinedIcon fontSize="small" />}
          label={t("effectsGallery.card.openAsWorkflow")}
          onClick={() => {
            closeMenu();
            onOpenAsWorkflow(preset);
          }}
        />
      </ContextMenu>
    </Box>
  );
};

export default memo(EffectCard);
