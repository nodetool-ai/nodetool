/**
 * Finishes an OAuth login the server cannot receive a callback for.
 *
 * The OpenAI (Codex) client is registered against one redirect —
 * `http://localhost:1455/auth/callback` — which resolves in the browser's own
 * machine. When the server runs somewhere else, the browser lands on its own
 * localhost with nothing listening and the authorization code sitting in the
 * address bar. This dialog takes that address and hands it back to the server,
 * which does the code exchange.
 *
 * Claude's console has a page for exactly this case: it displays a
 * `code#state` string instead of redirecting, so the dialog asks for that
 * string rather than an address.
 */

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Code,
  Dialog,
  FlexColumn,
  SPACING,
  Text,
  TextInput,
  TextLink
} from "../ui_primitives";
import type { OAuthManualPrompt } from "../../hooks/useOAuthConnection";

interface OAuthManualCompletionDialogProps {
  /** The pending login, or null when nothing is waiting on a paste. */
  prompt: OAuthManualPrompt | null;
  /** Provider label for the copy (e.g. "OpenAI"). */
  label: string;
  isSubmitting: boolean;
  onSubmit: (input: string) => void;
  onCancel: () => void;
}

export const OAuthManualCompletionDialog = ({
  prompt,
  label,
  isSubmitting,
  onSubmit,
  onCancel
}: OAuthManualCompletionDialogProps) => {
  const { t } = useTranslation();
  const [value, setValue] = useState("");

  const handleCancel = useCallback(() => {
    setValue("");
    onCancel();
  }, [onCancel]);

  const handleConfirm = useCallback(() => {
    onSubmit(value);
    setValue("");
  }, [onSubmit, value]);

  if (!prompt) {
    return null;
  }

  return (
    <Dialog
      open
      onClose={handleCancel}
      title={t("screen_settings.oauth.finishSignInTitle", { provider: label })}
      onConfirm={handleConfirm}
      confirmText={
        isSubmitting
          ? t("screen_settings.oauth.connecting")
          : t("screen_settings.oauth.connect")
      }
      confirmDisabled={value.trim().length === 0 || isSubmitting}
      isLoading={isSubmitting}
      maxWidth="sm"
      fullWidth
    >
      <FlexColumn gap={SPACING.lg}>
        {prompt.input === "code" ? (
          <Text size="small">
            {t("screen_settings.oauth.codeInstructions", { provider: label })}
          </Text>
        ) : (
          <Text size="small">
            {t("screen_settings.oauth.redirectInstructionsStart", {
              provider: label
            })}{" "}
            <Code>
              {prompt.redirectUri ?? t("screen_settings.oauth.localAddress")}
            </Code>
            {t("screen_settings.oauth.redirectInstructionsEnd")}
          </Text>
        )}
        <TextInput
          label={
            prompt.input === "code"
              ? t("screen_settings.oauth.authorizationCode")
              : t("screen_settings.oauth.redirectAddress")
          }
          placeholder={
            prompt.input === "code"
              ? t("screen_settings.oauth.codeStatePlaceholder")
              : "http://localhost:1455/auth/callback?code=…&state=…"
          }
          value={value}
          onChange={(event) => setValue(event.target.value)}
          multiline
          rows={3}
          autoFocus
          helperText={
            <>
              {t("screen_settings.oauth.signInWindowClosed")}{" "}
              <TextLink href={prompt.authUrl} external>
                {t("screen_settings.oauth.openAgain")}
              </TextLink>
              {t("screen_settings.oauth.linkExpiry")}
            </>
          }
        />
      </FlexColumn>
    </Dialog>
  );
};
