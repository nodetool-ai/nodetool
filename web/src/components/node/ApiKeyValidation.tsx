import React, { useMemo } from "react";
import { Typography, Button } from "@mui/material";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useSettingsStore } from "../../stores/SettingsStore";

interface ApiKeyValidationProps {
  nodeNamespace: string;
}

const ApiKeyValidation: React.FC<ApiKeyValidationProps> = React.memo(
  ({ nodeNamespace }) => {
    const secrets = useRemoteSettingsStore((state) => state.secrets);
    const setMenuOpen = useSettingsStore((state) => state.setMenuOpen);

    const missingAPIKeys = useMemo(() => {
      if (nodeNamespace.startsWith("openai.") && !secrets.OPENAI_API_KEY) {
        return "OpenAI API Key";
      }
      if (
        nodeNamespace.startsWith("replicate.") &&
        !secrets.REPLICATE_API_TOKEN
      ) {
        return "Replicate API Token";
      }
      if (
        nodeNamespace.startsWith("anthropic.") &&
        !secrets.ANTHROPIC_API_KEY
      ) {
        return "Anthropic API Key";
      }
      return null;
    }, [nodeNamespace, secrets]);

    const content = useMemo(() => {
      if (!missingAPIKeys) return null;

      return (
        <Typography className="node-status">
          {missingAPIKeys} is missing!
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={() => setMenuOpen(true)}
          >
            Add key in Settings
          </Button>
        </Typography>
      );
    }, [missingAPIKeys, setMenuOpen]);

    return content;
  }
);

ApiKeyValidation.displayName = "ApiKeyValidation";

export default ApiKeyValidation;
