/**
 * The three options a viewer link or a viewer invitation carries: history,
 * download and duplicate. Editors have all three, so the switches are only
 * shown for viewer grants.
 */
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { FlexColumn, LabeledSwitch, SPACING } from "../ui_primitives";
import type { workflows } from "@nodetool-ai/protocol/api-schemas";
import type { ShareOptionsPatch } from "../../serverState/useWorkflowSharing";

export type ShareOptionsValue = workflows.ShareOptionsValue;

export const NO_SHARE_OPTIONS: ShareOptionsValue = {
  allow_history: false,
  allow_download: false,
  allow_duplicate: false
};

export const SHARE_OPTION_KEYS = [
  "allow_history",
  "allow_download",
  "allow_duplicate"
] as const satisfies ReadonlyArray<keyof ShareOptionsValue>;

/** The translation keys of each option's label. */
export const SHARE_OPTION_LABEL_KEYS: Record<
  keyof ShareOptionsValue,
  `shareDocument.options.${string}`
> = {
  allow_history: "shareDocument.options.history",
  allow_download: "shareDocument.options.download",
  allow_duplicate: "shareDocument.options.duplicate"
};

const DESCRIPTION_KEYS: Record<
  keyof ShareOptionsValue,
  `shareDocument.options.${string}`
> = {
  allow_history: "shareDocument.options.historyDescription",
  allow_download: "shareDocument.options.downloadDescription",
  allow_duplicate: "shareDocument.options.duplicateDescription"
};

interface ShareOptionSwitchesProps {
  options: ShareOptionsValue;
  disabled?: boolean;
  /** Prefix for the switch ids, unique within the dialog. */
  idPrefix: string;
  onChange: (patch: ShareOptionsPatch) => void;
}

const ShareOptionSwitches = ({
  options,
  disabled,
  idPrefix,
  onChange
}: ShareOptionSwitchesProps) => {
  const { t } = useTranslation();
  return (
    <FlexColumn gap={SPACING.none}>
      {SHARE_OPTION_KEYS.map((key) => (
        <LabeledSwitch
          key={key}
          id={`${idPrefix}-${key}`}
          size="small"
          label={t(SHARE_OPTION_LABEL_KEYS[key])}
          description={t(DESCRIPTION_KEYS[key])}
          checked={options[key]}
          disabled={disabled}
          onChange={(checked) => onChange({ [key]: checked })}
        />
      ))}
    </FlexColumn>
  );
};

export default memo(ShareOptionSwitches);
