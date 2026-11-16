import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  Caption,
  Dialog,
  FlexColumn,
  Radio,
  RadioSet,
  SPACING,
  Text
} from "../ui_primitives";
import type { ImportMode } from "../../stores/AssetStore";
import { formatFileSize } from "../../utils/formatUtils";
import type { ImportModeRequest } from "./hooks/useImportModeChoice";

interface AssetImportDialogProps {
  readonly request: ImportModeRequest | null;
  readonly onImport: (mode: ImportMode) => void;
  readonly onCancel: () => void;
}

const isImportMode = (value: string): value is ImportMode =>
  value === "copy" || value === "link";

/** The choice a request opens with: Link when any file reaches the threshold. */
export const defaultImportMode = (request: ImportModeRequest): ImportMode =>
  request.files.some((file) => file.size >= request.thresholdBytes)
    ? "link"
    : "copy";

const ImportChoice = ({
  request,
  onImport,
  onCancel
}: AssetImportDialogProps & { readonly request: ImportModeRequest }) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ImportMode>(() => defaultImportMode(request));
  const handleChange = (_event: ChangeEvent<HTMLInputElement>, value: string) => {
    if (isImportMode(value)) {
      setMode(value);
    }
  };

  return (
    <Dialog
      open
      onClose={onCancel}
      onCancel={onCancel}
      onConfirm={() => onImport(mode)}
      title={t("pass3_33.assets.importMode.title")}
      confirmText={t("pass3_33.assets.importMode.confirm")}
      cancelText={t("common.cancel")}
      content={
        <FlexColumn gap={SPACING.md}>
          <Text>
            {request.files.map((file) => file.name).join(", ")}
          </Text>
          <RadioSet
            value={mode}
            onChange={handleChange}
            aria-label={t("pass3_33.assets.importMode.title")}
          >
            <Radio value="copy" label={t("pass3_33.assets.importMode.copy")} />
            <Caption sx={{ pl: SPACING.xl }}>
              {t("pass3_33.assets.importMode.copyHint")}
            </Caption>
            <Radio value="link" label={t("pass3_33.assets.importMode.link")} />
            <Caption sx={{ pl: SPACING.xl }}>
              {t("pass3_33.assets.importMode.linkHint")}
            </Caption>
          </RadioSet>
          <Caption>
            {t("pass3_33.assets.importMode.threshold", {
              size: formatFileSize(request.thresholdBytes, 0)
            })}
          </Caption>
        </FlexColumn>
      }
    />
  );
};

/**
 * Copy or Link for files imported on the desktop app. Copy writes each file
 * into the project folder. Link references it where it is, and "Collect
 * files" copies it in later.
 */
const AssetImportDialog = ({
  request,
  onImport,
  onCancel
}: AssetImportDialogProps) =>
  request ? (
    // Keyed by the request, so each import opens with its own default.
    <ImportChoice
      key={request.files.map((file) => file.name).join("\u0000")}
      request={request}
      onImport={onImport}
      onCancel={onCancel}
    />
  ) : null;

export default AssetImportDialog;
