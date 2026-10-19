import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, EditorButton, getSpacingPx, SPACING } from "../ui_primitives";
import { useApiKeyValidation } from "../../hooks/useApiKeyValidation";
import { getRequiredSecretKeyForNamespace } from "../../utils/nodeProvider";
import { openProviderOnboarding } from "../../stores/ProviderOnboardingStore";
import { isString } from "../../utils/typePredicates";

interface ApiKeyValidationProps {
  nodeNamespace: string;
}

const ApiKeyValidation: React.FC<ApiKeyValidationProps> = React.memo(
  ({ nodeNamespace }) => {
    const { t } = useTranslation();
    const missingAPIKey = useApiKeyValidation(nodeNamespace);

    const handleConnectProvider = useCallback(() => {
      openProviderOnboarding({
        highlightSecretKey:
          getRequiredSecretKeyForNamespace(nodeNamespace) ?? undefined,
        reason: t("i18n-next61.apiKeyValidation.connectReason")
      });
    }, [nodeNamespace, t]);

    const content = useMemo(() => {
      if (!missingAPIKey || !isString(missingAPIKey)) {return null;}

      return (
        <>
          <Text
            className="node-status"
            size="smaller"
            sx={{
              width: "100%",
              textAlign: "center",
              textTransform: "uppercase",
              padding: `${getSpacingPx(SPACING.md)} !important`,
              marginBottom: "0"
            }}
          >
            {t("i18n-next61.apiKeyValidation.missing", {
              key: String(missingAPIKey)
            })}
          </Text>
          <EditorButton
            className="api-key-button"
            variant="contained"
            color="primary"
            size="small"
            onClick={handleConnectProvider}
            sx={{
              margin: `0 ${getSpacingPx(SPACING.xl)}`,
              padding: `${getSpacingPx(SPACING.xs)} 0 0`,
              height: "1.8em",
              lineHeight: "1.2em",
              color: "var(--palette-grey-1000)",
              backgroundColor: "var(--palette-warning-main)",
              fontSize: "var(--fontSizeSmaller)",
              borderRadius: ".1em"
            }}
          >
            {t("i18n-next61.apiKeyValidation.connectProvider")}
          </EditorButton>
        </>
      );
    }, [missingAPIKey, handleConnectProvider, t]);

    return content;
  }
);

ApiKeyValidation.displayName = "ApiKeyValidation";

export default ApiKeyValidation;
