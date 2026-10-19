import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { Caption, Dialog, FlexColumn, SPACING, Text } from "../ui_primitives";
import { useOAuthConnection } from "../../hooks/useOAuthConnection";
import useProviderSignInStore from "../../stores/ProviderSignInStore";
import { OAuthManualCompletionDialog } from "../oauth/OAuthManualCompletionDialog";

/**
 * Renews an expired account sign-in (Codex, Claude) after a run fails on it.
 * The dialog starts the same OAuth flow as the provider settings and closes
 * itself once a fresh token is stored.
 */
const ProviderSignInDialog: React.FC = () => {
  const { t } = useTranslation();
  const provider = useProviderSignInStore((state) => state.provider);
  const dismiss = useProviderSignInStore((state) => state.dismiss);
  const oauth = useOAuthConnection(provider?.oauth ?? null, {
    onConnected: dismiss
  });
  const { cancelManual } = oauth;

  const handleClose = useCallback(() => {
    cancelManual();
    dismiss();
  }, [cancelManual, dismiss]);

  if (!provider) {
    return null;
  }

  return (
    <>
      <Dialog
        open
        onClose={handleClose}
        title={t("batch2_7.providerOnboarding.signInAgain", { provider: provider.label })}
        onConfirm={oauth.connect}
        confirmText={
          oauth.isConnecting
            ? t("batch2_7.providerOnboarding.waitingSignIn")
            : t("batch2_7.providerOnboarding.signInWith", { account: provider.account })
        }
        cancelText={t("batch2_7.providerOnboarding.notNow")}
        confirmDisabled={oauth.isConnecting}
        isLoading={oauth.isConnecting}
        maxWidth="xs"
        fullWidth
      >
        <FlexColumn gap={SPACING.md}>
          <Text size="small">
            {t("batch2_7.providerOnboarding.expiredDescription", { account: provider.account, provider: provider.label })}
          </Text>
          <Caption color="secondary">
            {t("batch2_7.providerOnboarding.signInWindowNote")}
          </Caption>
        </FlexColumn>
      </Dialog>
      <OAuthManualCompletionDialog
        prompt={oauth.manualPrompt}
        label={oauth.label}
        isSubmitting={oauth.isSubmittingManual}
        onSubmit={oauth.submitManualCode}
        onCancel={oauth.cancelManual}
      />
    </>
  );
};

export default memo(ProviderSignInDialog);
