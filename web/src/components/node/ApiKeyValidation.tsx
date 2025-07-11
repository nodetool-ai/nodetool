import React, { useMemo } from "react";
import { Typography, Button } from "@mui/material";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

interface ApiKeyValidationProps {
  nodeNamespace: string;
}

const ApiKeyValidation: React.FC<ApiKeyValidationProps> = React.memo(
  ({ nodeNamespace }) => {
    const theme = useTheme();
    const secrets = useRemoteSettingsStore((state) => state.secrets);
    const setMenuOpen = useSettingsStore((state) => state.setMenuOpen);

    const missingAPIKeys = useMemo(() => {
      if (
        nodeNamespace.startsWith("openai.") &&
        (!secrets.OPENAI_API_KEY || secrets.OPENAI_API_KEY.trim() === "")
      ) {
        return "OpenAI API Key";
      }
      if (
        nodeNamespace.startsWith("replicate.") &&
        (!secrets.REPLICATE_API_TOKEN ||
          secrets.REPLICATE_API_TOKEN.trim() === "")
      ) {
        return "Replicate API Token";
      }
      if (
        nodeNamespace.startsWith("anthropic.") &&
        (!secrets.ANTHROPIC_API_KEY || secrets.ANTHROPIC_API_KEY.trim() === "")
      ) {
        return "Anthropic API Key";
      }
      if (
        nodeNamespace.startsWith("aime.") &&
        (!secrets.AIME_API_KEY ||
          secrets.AIME_API_KEY.trim() === "" ||
          !secrets.AIME_USER ||
          secrets.AIME_USER.trim() === "")
      ) {
        return "Aime API Key and User";
      }
      return null;
    }, [nodeNamespace, secrets]);

    const content = useMemo(() => {
      if (!missingAPIKeys) return null;

      return (
        <>
          <Typography
            className="node-status"
            sx={{
              width: "100%",
              textAlign: "center",
              fontSize: "var(--fontSizeTiny)",
              textTransform: "uppercase",
              padding: ".5em !important",
              marginBottom: "0"
            }}
          >
            {missingAPIKeys} is missing!
          </Typography>
          <Button
            className="api-key-button"
            variant="contained"
            color="primary"
            size="small"
            onClick={() => setMenuOpen(true, 1)}
            sx={{
              margin: "0 1em",
              padding: ".2em 0 0",
              height: "1.8em",
              lineHeight: "1.2em",
              color: "var(--palette-grey-1000)",
              backgroundColor: "var(--palette-warning-main)",
              fontSize: "var(--fontSizeSmaller)",
              borderRadius: ".1em"
            }}
          >
            Add key in Settings
          </Button>
        </>
      );
    }, [missingAPIKeys, setMenuOpen]);

    return content;
  }
);

ApiKeyValidation.displayName = "ApiKeyValidation";

export default ApiKeyValidation;
