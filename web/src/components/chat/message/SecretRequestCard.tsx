/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { EditorButton } from "../../editor_ui";
import ErrorBanner from "../../support/ErrorBanner";
import {
  FlexRow,
  Text,
  TextInput,
  Card,
  CardBody,
  CardHeader,
  TYPOGRAPHY
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
    ".secret-request-key": {
      ...TYPOGRAPHY.mono.code,
      color: theme.vars.palette.text.secondary,
      whiteSpace: "nowrap"
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
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      button: {
        ...TYPOGRAPHY.sans.label
      }
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
  const { t } = useTranslation();
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
      setError(
        err instanceof Error
          ? err.message
          : t("i18n-next108.secretRequestCard.couldNotSaveKey")
      );
      setSaving(false);
    }
  }, [approvalId, onResolve, request.key, t, updateSecret, value]);

  const handleDecline = useCallback(() => {
    setValue("");
    onResolve(approvalId, "declined");
  }, [approvalId, onResolve]);

  return (
    <Card
      variant="inline"
      css={cssStyles}
      className="secret-request-card"
      role="group"
    >
      <CardHeader
        divided
        icon={<KeyRoundedIcon fontSize="small" />}
        title={t("i18n-next108.secretRequestCard.enterCredential")}
        subtitle={t("i18n-next108.secretRequestCard.credentialSubtitle")}
        trailing={<span className="secret-request-key">{request.key}</span>}
      />
      <CardBody className="secret-request-body">
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
            {t("i18n-next108.secretRequestCard.whereToGetKey")}
          </a>
        )}
      </CardBody>
      <div className="secret-request-footer">
        <TextInput
          size="small"
          compact
          type="password"
          autoComplete="off"
          label={request.key}
          placeholder={t("i18n-next108.secretRequestCard.pasteKey")}
          value={value}
          onChange={handleChange}
          disabled={saving}
        />
        {error && (
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: t("i18n-next108.secretRequestCard.saveFailed"),
              errorText: error
            }}
          >
            {error}
          </ErrorBanner>
        )}
        <FlexRow gap={1} align="center" justify="flex-end">
          <EditorButton
            variant="outlined"
            density="normal"
            onClick={handleDecline}
            startIcon={<CloseOutlinedIcon />}
          >
            {t("i18n-next108.secretRequestCard.notNow")}
          </EditorButton>
          <EditorButton
            variant="contained"
            color="primary"
            density="normal"
            disabled={!canSave}
            onClick={handleSave}
            startIcon={<KeyRoundedIcon />}
          >
            {saving
              ? t("i18n-next108.secretRequestCard.saving")
              : t("i18n-next108.secretRequestCard.saveKey")}
          </EditorButton>
        </FlexRow>
      </div>
    </Card>
  );
};

export default memo(SecretRequestCard);
