import { memo, useCallback } from "react";

import { Caption, Dialog, FlexColumn, Text } from "../ui_primitives";
import { useOAuthConnection } from "../../hooks/useOAuthConnection";
import useProviderSignInStore from "../../stores/ProviderSignInStore";
import { OAuthManualCompletionDialog } from "../oauth/OAuthManualCompletionDialog";

/**
 * Renews an expired account sign-in (Codex, Claude) after a run fails on it.
 * The dialog starts the same OAuth flow as the provider settings and closes
 * itself once a fresh token is stored.
 */
const ProviderSignInDialog: React.FC = () => {
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
        title={`Sign in to ${provider.label} again`}
        showActions
        onConfirm={oauth.connect}
        onCancel={handleClose}
        confirmText={
          oauth.isConnecting
            ? "Waiting for sign-in…"
            : `Sign in with ${provider.account}`
        }
        cancelText="Not now"
        confirmDisabled={oauth.isConnecting}
        isLoading={oauth.isConnecting}
        minWidth="440px"
      >
        <FlexColumn gap={2}>
          <Text size="small">
            Your {provider.account} sign-in expired, so {provider.label} refused
            the request. Sign in again, then run the workflow again.
          </Text>
          <Caption sx={{ opacity: 0.6 }}>
            The sign-in opens in a new window. This dialog closes when it
            finishes.
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
