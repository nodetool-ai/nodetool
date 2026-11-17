/**
 * Settings → Workspace → Cloud account. Desktop only.
 *
 * One cloud sign-in serves this app, the node editor and the timeline on one
 * computer. Electron main runs the account helper and sends this section the
 * account state over `window.api.cloudAccount`. The state holds no token.
 * Renders nothing when that bridge is absent, as in the browser build.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CloudAccountState } from "../../window";
import ErrorBanner from "../support/ErrorBanner";
import {
  AlertBanner,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  Text
} from "../ui_primitives";

const CloudAccountSettings: React.FC = () => {
  const { t } = useTranslation();
  const accountApi =
    typeof window !== "undefined" ? window.api?.cloudAccount : undefined;

  const [account, setAccount] = useState<CloudAccountState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accountApi) {
      return undefined;
    }
    let active = true;
    const unsubscribe = accountApi.onChange((next) => {
      if (active) {
        setAccount(next);
      }
    });
    accountApi
      .state()
      .then((next) => {
        if (active) {
          setAccount(next);
        }
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [accountApi]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const handleSignIn = useCallback(() => {
    if (accountApi) {
      void run(accountApi.signIn);
    }
  }, [accountApi, run]);
  const handleCancel = useCallback(() => {
    if (accountApi) {
      void run(accountApi.cancelSignIn);
    }
  }, [accountApi, run]);
  const handleSignOut = useCallback(() => {
    if (accountApi) {
      void run(accountApi.signOut);
    }
  }, [accountApi, run]);

  if (!accountApi) {
    return null;
  }

  const status = (() => {
    if (!account) {
      return null;
    }
    if (account.state === "signedIn") {
      return t("cloudAccount.signedInAs", { name: account.displayName });
    }
    if (account.state === "signingIn") {
      return t("cloudAccount.signingIn");
    }
    return account.serverEndPending
      ? t("cloudAccount.serverEndPending")
      : t("cloudAccount.signedOut");
  })();

  const canUse = account !== null && account.available && account.cloudAvailable;

  return (
    <div className="settings-section">
      <Text size="big" id="cloud-account" className="settings-heading">
        {t("cloudAccount.title")}
      </Text>
      <FlexColumn gap={SPACING.lg}>
        <Text className="description">{t("cloudAccount.description")}</Text>

        {account && !account.available && (
          <AlertBanner severity="info">{t("cloudAccount.unavailable")}</AlertBanner>
        )}
        {account && account.available && !account.cloudAvailable && (
          <AlertBanner severity="info">
            {account.message || t("cloudAccount.cloudOff")}
          </AlertBanner>
        )}
        {account && account.available && !account.keychainAvailable && (
          <AlertBanner severity="warning">{t("cloudAccount.noKeychain")}</AlertBanner>
        )}

        {account && account.available && (
          <FlexColumn gap={SPACING.xs}>
            <Text>{status}</Text>
            {account.serverOrigin && (
              <Caption>
                {t("cloudAccount.server", { server: account.serverOrigin })}
              </Caption>
            )}
            {account.cloudAvailable &&
              account.state !== "signedIn" &&
              account.message && <Caption>{account.message}</Caption>}
          </FlexColumn>
        )}

        {canUse && (
          <FlexRow gap={SPACING.sm} align="center">
            {account.state === "signedOut" && (
              <EditorButton variant="contained" onClick={handleSignIn}>
                {t("cloudAccount.signIn")}
              </EditorButton>
            )}
            {account.state === "signingIn" && (
              <EditorButton variant="outlined" onClick={handleCancel}>
                {t("cloudAccount.cancel")}
              </EditorButton>
            )}
            {account.state === "signedIn" && (
              <EditorButton variant="outlined" onClick={handleSignOut}>
                {t("cloudAccount.signOut")}
              </EditorButton>
            )}
          </FlexRow>
        )}
        {canUse && account.state === "signedIn" && (
          <Caption>{t("cloudAccount.signOutNote")}</Caption>
        )}

        {error && (
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: "Cloud account action failed",
              errorText: error
            }}
          >
            {error}
          </ErrorBanner>
        )}
      </FlexColumn>
    </div>
  );
};

export default CloudAccountSettings;
