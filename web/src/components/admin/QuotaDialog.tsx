import React, {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState
} from "react";
import { useTranslation } from "react-i18next";

import type { AdminQuotaLimits } from "../../serverState/useAdminUsers";
import {
  AlertBanner,
  Caption,
  Dialog,
  FlexColumn,
  GAP,
  LabeledSwitch,
  SelectField,
  TextInput
} from "../ui_primitives";

export interface QuotaDialogProps {
  open: boolean;
  title: string;
  /** The limits the form starts from. */
  initial: AdminQuotaLimits;
  /**
   * For one user: whether they follow the default. Shows a switch that puts
   * them back on it. Left out for the default limits themselves.
   */
  usesDefault?: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  /** The new limits, or null to put the user back on the default. */
  onSave: (limits: AdminQuotaLimits | null) => void;
}

const toField = (value: number | null): string =>
  value === null ? "" : String(value);

/** Empty is unlimited. Anything else must be a number of zero or more. */
const parseLimit = (
  raw: string,
  integer: boolean
): { value: number | null; valid: boolean } => {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null, valid: true };
  const value = Number(trimmed.replace(/[\s,_]/g, ""));
  if (!Number.isFinite(value) || value < 0) return { value: null, valid: false };
  return { value: integer ? Math.round(value) : value, valid: true };
};

/**
 * Edit a token budget and a media budget over a day or a month. An empty
 * field is no limit. Used for the server default and for one user's own
 * limits, where a switch puts the user back on the default.
 */
const QuotaDialog: React.FC<QuotaDialogProps> = ({
  open,
  title,
  initial,
  usesDefault,
  saving,
  error,
  onClose,
  onSave
}) => {
  const { t } = useTranslation();
  const switchId = useId();
  const [followDefault, setFollowDefault] = useState(usesDefault ?? false);
  const [period, setPeriod] = useState(initial.period);
  const [tokens, setTokens] = useState(toField(initial.token_limit));
  const [media, setMedia] = useState(toField(initial.media_usd_limit));

  useEffect(() => {
    if (!open) return;
    setFollowDefault(usesDefault ?? false);
    setPeriod(initial.period);
    setTokens(toField(initial.token_limit));
    setMedia(toField(initial.media_usd_limit));
  }, [open, initial, usesDefault]);

  const tokenLimit = parseLimit(tokens, true);
  const mediaLimit = parseLimit(media, false);
  const fieldsDisabled = usesDefault !== undefined && followDefault;
  const valid = fieldsDisabled || (tokenLimit.valid && mediaLimit.valid);

  const periodOptions = useMemo(
    () => [
      { value: "day", label: t("admin.quotas.period.day") },
      { value: "month", label: t("admin.quotas.period.month") }
    ],
    [t]
  );

  const handlePeriod = useCallback((value: string) => {
    setPeriod(value === "day" ? "day" : "month");
  }, []);

  const handleSave = useCallback(() => {
    if (!valid) return;
    if (fieldsDisabled) {
      onSave(null);
      return;
    }
    onSave({
      period,
      token_limit: tokenLimit.value,
      media_usd_limit: mediaLimit.value
    });
  }, [valid, fieldsDisabled, onSave, period, tokenLimit.value, mediaLimit.value]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      showActions
      onConfirm={handleSave}
      confirmText={t("admin.quotas.save")}
      cancelText={t("admin.quotas.cancel")}
      confirmDisabled={!valid}
      isLoading={saving}
    >
      <FlexColumn gap={GAP.normal}>
        {usesDefault !== undefined ? (
          <LabeledSwitch
            id={switchId}
            label={t("admin.quotas.useDefault")}
            description={t("admin.quotas.useDefaultDescription")}
            checked={followDefault}
            onChange={setFollowDefault}
          />
        ) : null}
        <SelectField
          label={t("admin.quotas.period.label")}
          value={period}
          onChange={handlePeriod}
          options={periodOptions}
          disabled={fieldsDisabled}
        />
        <TextInput
          label={t("admin.quotas.tokenLimit")}
          value={tokens}
          onChange={(event) => setTokens(event.target.value)}
          placeholder={t("admin.quotas.noLimit")}
          slotProps={{ htmlInput: { inputMode: "numeric" } }}
          disabled={fieldsDisabled}
          fullWidth
          errorMessage={tokenLimit.valid ? undefined : t("admin.quotas.invalid")}
        />
        <TextInput
          label={t("admin.quotas.mediaLimit")}
          value={media}
          onChange={(event) => setMedia(event.target.value)}
          placeholder={t("admin.quotas.noLimit")}
          slotProps={{ htmlInput: { inputMode: "decimal" } }}
          disabled={fieldsDisabled}
          fullWidth
          errorMessage={mediaLimit.valid ? undefined : t("admin.quotas.invalid")}
        />
        <Caption>{t("admin.quotas.ownKeysNote")}</Caption>
        {error ? (
          <AlertBanner severity="error" compact>
            {error}
          </AlertBanner>
        ) : null}
      </FlexColumn>
    </Dialog>
  );
};

export default memo(QuotaDialog);
