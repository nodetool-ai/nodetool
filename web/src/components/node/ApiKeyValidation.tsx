import React, { useMemo } from "react";
import { Typography, Button } from "@mui/material";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useApiKeyValidation } from "../../hooks/useApiKeyValidation";

interface ApiKeyValidationProps {
  nodeNamespace: string;
}

const ApiKeyValidation: React.FC<ApiKeyValidationProps> = React.memo(
  ({ nodeNamespace }) => {
    const setMenuOpen = useSettingsStore((state) => state.setMenuOpen);
    const missingAPIKey = useApiKeyValidation(nodeNamespace);

    const content = useMemo(() => {
      if (!missingAPIKey) {return null;}

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
            {missingAPIKey} is missing!
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
    }, [missingAPIKey, setMenuOpen]);

    return content;
  }
);

ApiKeyValidation.displayName = "ApiKeyValidation";

export default ApiKeyValidation;
