/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { EditorButton } from "../../editor_ui";
import {
  FlexColumn,
  FlexRow,
  Text,
  TextInput,
  BORDER_RADIUS
} from "../../ui_primitives";
import useSecretsStore from "../../../stores/SecretsStore";
import type {
  PendingSecretRequest,
  SecretRequestOutcome
} from "../../../stores/GlobalChatStore";

interface SecretRequestCardProps {
  approvalId: string;
  request: PendingSecretRequest;
  onResolve: (approvalId: string, outcome: SecretRequestOutcome) => void;
}

const styles = (theme: Theme) =>
  css({
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden",
    ".secret-request-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(2),
      padding: theme.spacing(1.5, 2),
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".secret-request-key": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      whiteSpace: "nowrap",
      marginLeft: "auto"
    },
    ".secret-request-body": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1.5),
      padding: theme.spacing(1.5, 2)
    },
    ".secret-request-link": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.primary.main
    },
    ".secret-request-footer": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1.5),
      padding: theme.spacing(1.5, 2),
      borderTop: `1px solid ${theme.vars.palette.divider}`
    }
  });

/** Only an https link is rendered as one; anything else stays inert text. */
function safeHelpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * The bespoke dialog behind the `request_secret` capability.
 *
 * Sandboxed code can ask for a credential but cannot supply one. What it sends
 * is a name and a reason; the user types the value here, and this card saves it
 * with the ordinary `settings.secrets.upsert` call before answering the request
 * with `saved` or `declined`. The value goes to the secret store and nowhere
 * else — not into the websocket frame, the thread, or the model's context.
 */
const SecretRequestCard: React.FC<SecretRequestCardProps> = ({
  approvalId,
  request,
  onResolve
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const updateSecret = useSecretsStore((s) => s.updateSecret);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const helpUrl = safeHelpUrl(request.help_url);
  const canSave = value.trim().length > 0 && !saving;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value);
      setError(null);
    },
    []
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateSecret(request.key, value.trim());
      setValue("");
      onResolve(approvalId, "saved");
    } catch (err) {
      // The request stays open: the run is still waiting, and the user can
      // correct a paste and try again rather than losing the turn.
      setError(err instanceof Error ? err.message : "Could not save the key.");
      setSaving(false);
    }
  }, [approvalId, onResolve, request.key, updateSecret, value]);

  const handleDecline = useCallback(() => {
    setValue("");
    onResolve(approvalId, "declined");
  }, [approvalId, onResolve]);

  return (
    <div css={cssStyles} className="secret-request-card" role="group">
      <div className="secret-request-header">
        <KeyRoundedIcon fontSize="small" />
        <FlexColumn gap={0}>
          <Text size="small" weight={500}>
            Enter a credential
          </Text>
          <Text size="smaller" color="secondary">
            Saved to your secret store. The agent never sees the value.
          </Text>
        </FlexColumn>
        <span className="secret-request-key">{request.key}</span>
      </div>
      <div className="secret-request-body">
        {request.reason && (
          <Text size="small" color="secondary">
            {request.reason}
          </Text>
        )}
        {request.description && (
          <Text size="smaller" color="secondary">
            {request.description}
          </Text>
        )}
        {helpUrl && (
          <a
            className="secret-request-link"
            href={helpUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            Where to get this key
          </a>
        )}
      </div>
      <div className="secret-request-footer">
        <TextInput
          size="small"
          compact
          type="password"
          autoComplete="off"
          label={request.key}
          placeholder="Paste the key"
          value={value}
          onChange={handleChange}
          disabled={saving}
        />
        {error && (
          <Text size="smaller" color="error">
            {error}
          </Text>
        )}
        <FlexRow gap={1} align="center" justify="flex-end">
          <EditorButton
            variant="outlined"
            density="normal"
            onClick={handleDecline}
            startIcon={<CloseRoundedIcon />}
          >
            Not now
          </EditorButton>
          <EditorButton
            variant="contained"
            color="primary"
            density="normal"
            disabled={!canSave}
            onClick={handleSave}
            startIcon={<KeyRoundedIcon />}
          >
            {saving ? "Saving…" : "Save key"}
          </EditorButton>
        </FlexRow>
      </div>
    </div>
  );
};

export default memo(SecretRequestCard);
