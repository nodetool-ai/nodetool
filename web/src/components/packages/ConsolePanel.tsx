/**
 * ConsolePanel — collapsible view of the live conda/uv/npm output streamed from
 * the desktop app during package install/uninstall.
 */
import { memo, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { EditorButton, FlexColumn, FlexRow, LogView } from "../ui_primitives";

interface ConsolePanelProps {
  lines: string[];
  onClear: () => void;
  /** Reveal the console when an install/uninstall is in flight. */
  busy?: boolean;
}

const ConsolePanel = ({ lines, onClear, busy = false }: ConsolePanelProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auto-open when an operation begins so its live output is visible without a
  // manual toggle; the user can still hide it mid-run.
  useEffect(() => {
    if (busy) setOpen(true);
  }, [busy]);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(lines.join("\n")).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  };

  return (
    <FlexColumn gap={1}>
      <FlexRow gap={1.5} align="center" justify="space-between">
        <EditorButton
          variant="text"
          density="compact"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open
            ? t("screen_models.packages.hideConsole")
            : t("screen_models.packages.showConsole")}
          {lines.length > 0 ? ` (${lines.length})` : ""}
        </EditorButton>
        {open && lines.length > 0 && (
          <FlexRow gap={0.5} align="center">
            <EditorButton variant="text" density="compact" onClick={handleCopy}>
              {copied
                ? t("screen_models.packages.copied")
                : t("screen_models.packages.copy")}
            </EditorButton>
            <EditorButton variant="text" density="compact" onClick={onClear}>
              {t("screen_models.packages.clear")}
            </EditorButton>
          </FlexRow>
        )}
      </FlexRow>
      {open && (
        <LogView
          lines={lines}
          autoScroll
          emptyText={t("screen_models.packages.noOutput")}
        />
      )}
    </FlexColumn>
  );
};

export default memo(ConsolePanel);
