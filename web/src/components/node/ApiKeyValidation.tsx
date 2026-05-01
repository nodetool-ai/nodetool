import React, { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Text, EditorButton } from "../ui_primitives";
import { useApiKeyValidation } from "../../hooks/useApiKeyValidation";

interface ApiKeyValidationProps {
  nodeNamespace: string;
}

const ApiKeyValidation: React.FC<ApiKeyValidationProps> = React.memo(
  ({ nodeNamespace }) => {
    const navigate = useNavigate();
    const missingAPIKey = useApiKeyValidation(nodeNamespace);

    const handleOpenSettings = useCallback(() => {
      navigate("/settings?tab=1");
    }, [navigate]);

    const content = useMemo(() => {
      if (!missingAPIKey || typeof missingAPIKey !== "string") {return null;}

      return (
        <>
          <Text
            className="node-status"
            size="tiny"
            sx={{
              width: "100%",
              textAlign: "center",
              textTransform: "uppercase",
              padding: ".5em !important",
              marginBottom: "0"
            }}
          >
            {String(missingAPIKey)} is missing!
          </Text>
          <EditorButton
            className="api-key-button"
            variant="contained"
            color="primary"
            size="small"
            onClick={handleOpenSettings}
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
          </EditorButton>
        </>
      );
    }, [missingAPIKey, handleOpenSettings]);

    return content;
  }
);

ApiKeyValidation.displayName = "ApiKeyValidation";

export default ApiKeyValidation;
