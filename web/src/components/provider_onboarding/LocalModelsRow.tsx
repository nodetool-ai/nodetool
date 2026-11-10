import { memo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

import {
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text,
  SPACING,
  ICON_SIZE
} from "../ui_primitives";
import ollamaIcon from "../../icons/providers/ollama.svg";
import { useOllamaStatus } from "../../serverState/useOllamaStatus";

/** The local route: Ollama runs models on this machine with no account. */
const LocalModelsRow: React.FC = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { data: status, isPending, isError, isFetching, refetch } = useOllamaStatus();
  const connected = status === "connected";
  const description = isPending
    ? t("batch2_7.providerOnboarding.ollamaChecking", "Checking the Ollama connection…")
    : isError
      ? t("batch2_7.providerOnboarding.ollamaCheckFailed", "Could not check Ollama. Try again.")
      : connected
        ? t("batch2_7.providerOnboarding.ollamaConnected", "Ollama is connected. Choose or download a model in the model manager.")
        : status === "unavailable"
          ? t("batch2_7.providerOnboarding.ollamaUnavailable", "Use the NodeTool desktop app to connect to Ollama on your computer.")
          : t("batch2_7.providerOnboarding.ollamaUnreachable", "Cannot reach Ollama. If it’s installed, open it. Otherwise, download it to get started.");
  return (
    <FlexRow align="center" gap={SPACING.lg} wrap>
      <Box
        component="img"
        src={ollamaIcon}
        alt=""
        sx={{ width: ICON_SIZE.lg, height: ICON_SIZE.lg, ...theme.applyStyles("dark", { filter: "invert(1)" }) }}
      />
      <FlexColumn gap={SPACING.xs} sx={{ flex: 1, minWidth: 0 }}>
        <Text size="small">{t("batch2_7.providerOnboarding.localTitle")}</Text>
        <Caption role="status">{description}</Caption>
      </FlexColumn>
      <FlexRow gap={SPACING.xs} wrap>
        <EditorButton variant="text" disabled={isFetching} onClick={() => void refetch()}>
          {t("batch2_7.providerOnboarding.checkOllamaAgain", "Check again")}
        </EditorButton>
        {!isPending && !isError && status === "unreachable" && (
          <EditorButton
            component="a"
            href="https://ollama.com/download"
            target="_blank"
            rel="noopener noreferrer"
            variant="text"
            endIcon={<OpenInNewIcon />}
          >
            {t("batch2_7.providerOnboarding.getOllama")}
          </EditorButton>
        )}
      </FlexRow>
    </FlexRow>
  );
};

export default memo(LocalModelsRow);
