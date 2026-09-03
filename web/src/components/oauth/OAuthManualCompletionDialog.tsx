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

import {
  Caption,
  Dialog,
  FlexColumn,
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
      title={`Finish signing in with ${label}`}
      showActions
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      confirmText={isSubmitting ? "Connecting…" : "Connect"}
      confirmDisabled={value.trim().length === 0 || isSubmitting}
      isLoading={isSubmitting}
      minWidth="520px"
    >
      <FlexColumn gap={2}>
        {prompt.input === "code" ? (
          <Text size="small">
            This server cannot receive the sign-in callback, so {label} shows
            you a code instead. Approve the sign-in, then copy the code the page
            displays and paste it below.
          </Text>
        ) : (
          <Text size="small">
            {label} sends the browser to{" "}
            <code>{prompt.redirectUri ?? "a local address"}</code>, which only
            exists on your own machine — so this server never sees it. Approve
            the sign-in, then copy the whole address the browser ends up on (an
            error page is expected) and paste it below.
          </Text>
        )}
        <TextInput
          label={prompt.input === "code" ? "Authorization code" : "Redirect address"}
          placeholder={
            prompt.input === "code"
              ? "code#state"
              : "http://localhost:1455/auth/callback?code=…&state=…"
          }
          value={value}
          onChange={(event) => setValue(event.target.value)}
          multiline
          rows={3}
          autoFocus
        />
        <Caption sx={{ opacity: 0.6 }}>
          Sign-in window closed?{" "}
          <TextLink href={prompt.authUrl} external>
            Open it again
          </TextLink>
          . The link expires after 10 minutes.
        </Caption>
      </FlexColumn>
    </Dialog>
  );
};
