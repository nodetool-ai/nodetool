import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { AlertBanner, EditorButton } from "../../ui_primitives";

interface SelectModelBannerProps {
  reason: string;
  onSelect: () => void;
}

/**
 * Inline callout shown in the composer when the current mode has no model
 * picked. Sending is refused until one is, so the banner carries the picker.
 */
const SelectModelBanner: React.FC<SelectModelBannerProps> = ({
  reason,
  onSelect
}) => {
  const { t } = useTranslation();
  return <AlertBanner
    severity="info"
    compact
    icon={<AutoAwesomeIcon fontSize="small" />}
    action={
      <EditorButton
        variant="outlined"
        color="primary"
        size="small"
        onClick={onSelect}
      >
        {t("i18n-next18.chat.composer.selectModel")}
      </EditorButton>
    }
    sx={{ mx: 1, mb: 0.5, alignItems: "center" }}
  >
    {reason}
  </AlertBanner>
  </AlertBanner>;
};

export default memo(SelectModelBanner);
