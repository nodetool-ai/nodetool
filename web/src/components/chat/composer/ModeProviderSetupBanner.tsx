import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import { AlertBanner, EditorButton } from "../../ui_primitives";

interface ModeProviderSetupBannerProps {
  reason: string;
  onConnect: () => void;
}

/**
 * Inline callout shown in the composer when the selected mode has no
 * configured provider behind it. Offers the provider-onboarding dialog so the
 * user can connect a provider and add an API key without leaving the chat.
 */
const ModeProviderSetupBanner: React.FC<ModeProviderSetupBannerProps> = ({
  reason,
  onConnect
}) => {
  const { t } = useTranslation();
  return (
    <AlertBanner
      severity="info"
      compact
      icon={<KeyRoundedIcon fontSize="small" />}
      action={
        <EditorButton
          variant="outlined"
          color="primary"
          size="small"
          onClick={onConnect}
        >
          {t("i18n-next18.chat.composer.connectProvider")}
        </EditorButton>
      }
      sx={{ mx: 1, mb: 0.5, alignItems: "center" }}
    >
      {reason}
    </AlertBanner>
  );
};

export default memo(ModeProviderSetupBanner);
