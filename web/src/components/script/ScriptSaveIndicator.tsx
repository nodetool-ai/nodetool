import CloudDoneOutlinedIcon from "@mui/icons-material/CloudDoneOutlined";
import SyncProblemIcon from "@mui/icons-material/SyncProblem";
import HistoryIcon from "@mui/icons-material/History";
import CircleIcon from "@mui/icons-material/Circle";
import {
  FlexRow,
  Text,
  Tooltip,
  LoadingSpinner,
  SPACING
} from "../ui_primitives";
import { useScriptSaveStatus } from "../../stores/script/ScriptStore";

interface ScriptSaveIndicatorProps {
  scriptId: string;
}

/**
 * Toolbar readout of the autosave lifecycle. The server sync is otherwise
 * invisible: edits save silently and a CAS conflict silently replaces local
 * work with the server copy. This surfaces those transitions so the author
 * knows whether their changes are safe.
 */
const ScriptSaveIndicator = ({ scriptId }: ScriptSaveIndicatorProps) => {
  const status = useScriptSaveStatus(scriptId);

  if (status === "unsaved") {
    return (
      <Tooltip title="Unsaved changes — saving shortly">
        <FlexRow align="center" gap={SPACING.xs}>
          <CircleIcon sx={{ fontSize: 10, color: "text.disabled" }} />
          <Text size="smaller" sx={{ color: "text.secondary" }}>
            Unsaved changes
          </Text>
        </FlexRow>
      </Tooltip>
    );
  }

  if (status === "saving") {
    return (
      <FlexRow align="center" gap={SPACING.xs} aria-live="polite">
        <LoadingSpinner inline size={14} />
        <Text size="smaller" sx={{ color: "text.secondary" }}>
          Saving…
        </Text>
      </FlexRow>
    );
  }

  if (status === "error") {
    return (
      <Tooltip title="Couldn't sync with the server. Your changes are kept locally.">
        <FlexRow align="center" gap={SPACING.xs} aria-live="polite">
          <SyncProblemIcon color="warning" sx={{ fontSize: 16 }} />
          <Text size="smaller" color="warning">
            Save failed
          </Text>
        </FlexRow>
      </Tooltip>
    );
  }

  if (status === "reloaded") {
    return (
      <Tooltip title="This script was edited elsewhere, so the newer server version was loaded.">
        <FlexRow align="center" gap={SPACING.xs} aria-live="polite">
          <HistoryIcon color="warning" sx={{ fontSize: 16 }} />
          <Text size="smaller" color="warning">
            Reloaded newer version
          </Text>
        </FlexRow>
      </Tooltip>
    );
  }

  return (
    <Tooltip title="All changes saved">
      <FlexRow align="center" gap={SPACING.xs} aria-live="polite">
        <CloudDoneOutlinedIcon
          sx={{ fontSize: 16, color: "text.disabled" }}
        />
        <Text size="smaller" sx={{ color: "text.secondary" }}>
          Saved
        </Text>
      </FlexRow>
    </Tooltip>
  );
};

export default ScriptSaveIndicator;
