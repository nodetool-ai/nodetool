import HistoryIcon from "@mui/icons-material/History";
import {
  Box,
  FlexRow,
  SaveState,
  Text,
  Tooltip,
  SPACING
} from "../ui_primitives";
import type { SaveStateValue } from "../ui_primitives";
import { useScriptSaveStatus } from "../../stores/script/ScriptStore";

interface ScriptSaveIndicatorProps {
  scriptId: string;
}

const SAVE_STATE: Record<string, SaveStateValue> = {
  unsaved: "dirty",
  saving: "saving",
  error: "error"
};

/**
 * Toolbar readout of the autosave lifecycle. The server sync is otherwise
 * invisible: edits save silently and a CAS conflict silently replaces local
 * work with the server copy. This surfaces those transitions so the author
 * knows whether their changes are safe.
 *
 * The lifecycle is drawn by the shared `SaveState`. "Reloaded" has no
 * counterpart there, so it stays a warning readout of its own.
 */
const ScriptSaveIndicator = ({ scriptId }: ScriptSaveIndicatorProps) => {
  const { t } = useTranslation("translation", { keyPrefix: "screen_scripts_text" });
  const status = useScriptSaveStatus(scriptId);

  if (status === "reloaded") {
    return (
      <Tooltip title={t("script.save.reloadedTooltip")}>
        <FlexRow align="center" gap={SPACING.xs} aria-live="polite">
          <HistoryIcon color="warning" fontSize="small" />
          <Text size="smaller" color="warning">
            {t("script.save.reloaded")}
          </Text>
        </FlexRow>
      </Tooltip>
    );
  }

  const tooltipKey =
    status === "unsaved" ? "unsaved" : status === "error" ? "error" : "saved";
  const tooltip = t(`script.save.${tooltipKey}`);
  const readout = <SaveState state={SAVE_STATE[status] ?? "saved"} />;
  return tooltip ? (
    <Tooltip title={tooltip}>
      <Box component="span" sx={{ display: "inline-flex" }}>
        {readout}
      </Box>
    </Tooltip>
  ) : (
    readout
  );
};

export default ScriptSaveIndicator;
import { useTranslation } from "react-i18next";
