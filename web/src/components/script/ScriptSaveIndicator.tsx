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

const TOOLTIPS: Record<string, string> = {
  unsaved: "Unsaved changes — saving shortly",
  error: "Couldn't sync with the server. Your changes are kept locally.",
  saved: "All changes saved"
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
  const status = useScriptSaveStatus(scriptId);

  if (status === "reloaded") {
    return (
      <Tooltip title="This script was edited elsewhere, so the newer server version was loaded.">
        <FlexRow align="center" gap={SPACING.xs} aria-live="polite">
          <HistoryIcon color="warning" fontSize="small" />
          <Text size="smaller" color="warning">
            Reloaded newer version
          </Text>
        </FlexRow>
      </Tooltip>
    );
  }

  const tooltip = TOOLTIPS[status];
  const readout = <SaveState state={SAVE_STATE[status] ?? "saved"} />;
  return tooltip ? (
    <Tooltip title={tooltip}>
      <Box component="span" sx={{ display: "inline-flex" }}>{readout}</Box>
    </Tooltip>
  ) : (
    readout
  );
};

export default ScriptSaveIndicator;
