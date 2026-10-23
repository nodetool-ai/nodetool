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
  SPACING
} from "../ui_primitives";
import ollamaIcon from "../../icons/providers/ollama.svg";

/** The local route: Ollama runs models on this machine with no account. */
const LocalModelsRow: React.FC = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <FlexRow align="center" gap={SPACING.lg} wrap>
      <Box
        component="img"
        src={ollamaIcon}
        alt=""
        sx={{ width: 28, height: 28, ...theme.applyStyles("dark", { filter: "invert(1)" }) }}
      />
      <FlexColumn gap={SPACING.xs} sx={{ flex: "1 1 180px" }}>
        <Text size="small">{t("batch2_7.providerOnboarding.localTitle")}</Text>
        <Caption>{t("batch2_7.providerOnboarding.localDescription")}</Caption>
      </FlexColumn>
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
    </FlexRow>
  );
};

export default memo(LocalModelsRow);
