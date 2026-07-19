/** @jsxImportSource @emotion/react */
import { useCallback, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import HistoryIcon from "@mui/icons-material/History";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
  FlexColumn,
  FlexRow,
  Text,
  TextInput,
  Chip,
  Tooltip,
  ToolbarIconButton,
  LoadingSpinner,
  Popover,
  SPACING,
  BORDER_RADIUS,
  MOTION
} from "../ui_primitives";
import {
  useScriptStore,
  useLineVoicing,
  lineStatus,
  effectiveVoice,
  type ScriptLine,
  type ScriptSpeaker
} from "../../stores/script/ScriptStore";
import { voiceLine } from "../../stores/script/scriptVoicing";
import { useAssetStore } from "../../stores/AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";
import ScriptTakeGallery from "./ScriptTakeGallery";

interface ScriptLineRowProps {
  scriptId: string;
  line: ScriptLine;
  cast: ScriptSpeaker[];
  highlighted: boolean;
  readOnly: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  voiced: "Voiced",
  stale: "Stale"
};

const STATUS_COLOR: Record<string, "default" | "success" | "warning"> = {
  draft: "default",
  voiced: "success",
  stale: "warning"
};

const ScriptLineRow = ({
  scriptId,
  line,
  cast,
  highlighted,
  readOnly
}: ScriptLineRowProps) => {
  const patchLine = useScriptStore((s) => s.patchLine);
  const removeLine = useScriptStore((s) => s.removeLine);
  const voicing = useLineVoicing(line.id);
  const [galleryAnchor, setGalleryAnchor] = useState<HTMLElement | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const voice = effectiveVoice(line, cast);
  const status = lineStatus(line, voice);
  const speaker = cast.find((s) => s.id === line.speakerId) ?? null;

  const onTextChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      patchLine(scriptId, line.id, { text: e.target.value }),
    [patchLine, scriptId, line.id]
  );

  const onDirectionChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      patchLine(scriptId, line.id, { direction: e.target.value }),
    [patchLine, scriptId, line.id]
  );

  const cycleSpeaker = useCallback(() => {
    if (cast.length === 0) return;
    const idx = cast.findIndex((s) => s.id === line.speakerId);
    // Cycle: none → first → … → last → none.
    const next = idx < 0 ? cast[0] : (cast[idx + 1] ?? null);
    patchLine(scriptId, line.id, { speakerId: next?.id ?? null });
  }, [cast, line.speakerId, patchLine, scriptId, line.id]);

  const onVoice = useCallback(async () => {
    setVoiceError(null);
    try {
      await voiceLine(scriptId, line.id);
    } catch (error) {
      setVoiceError((error as Error).message ?? "Voicing failed");
    }
  }, [scriptId, line.id]);

  const playCurrent = useCallback(async () => {
    if (typeof Audio === "undefined") return;
    const take = line.takes.find((t) => t.id === line.currentTakeId);
    if (!take) return;
    try {
      const asset = await useAssetStore.getState().get(take.assetId);
      const url = getAssetUrl(asset);
      if (url) void new Audio(url).play().catch(() => undefined);
    } catch {
      // Asset unavailable.
    }
  }, [line.takes, line.currentTakeId]);

  const hasCurrentTake = !!line.takes.find((t) => t.id === line.currentTakeId);

  return (
    <FlexRow
      align="flex-start"
      gap={SPACING.sm}
      fullWidth
      sx={{
        padding: SPACING.sm,
        borderRadius: BORDER_RADIUS.sm,
        backgroundColor: highlighted ? "action.selected" : "transparent",
        transition: MOTION.background
      }}
    >
      <Tooltip title={cast.length ? "Change speaker" : "Add a speaker first"}>
        <span>
          <Chip
            label={speaker?.name ?? "No speaker"}
            size="small"
            onClick={readOnly ? undefined : cycleSpeaker}
            sx={{
              minWidth: 84,
              cursor: readOnly || !cast.length ? "default" : "pointer",
              backgroundColor: speaker?.color ?? undefined
            }}
          />
        </span>
      </Tooltip>

      <FlexColumn gap={SPACING.micro} style={{ flex: 1, minWidth: 0 }}>
        <TextInput
          value={line.text}
          onChange={onTextChange}
          placeholder="Write a line…"
          multiline
          hideLabel
          label="Line text"
          compact
          fullWidth
          disabled={readOnly}
        />
        <TextInput
          value={line.direction ?? ""}
          onChange={onDirectionChange}
          placeholder="Direction (e.g. whispering, tired)…"
          hideLabel
          label="Direction"
          compact
          fullWidth
          disabled={readOnly}
        />
        {voiceError && (
          <Text size="smaller" color="error">
            {voiceError}
          </Text>
        )}
      </FlexColumn>

      <FlexColumn align="center" gap={SPACING.micro}>
        <Chip
          label={STATUS_LABEL[status]}
          size="small"
          color={STATUS_COLOR[status]}
          compact
        />
        <FlexRow gap={SPACING.none} align="center">
          {voicing ? (
            <LoadingSpinner size={20} />
          ) : (
            <Tooltip
              title={
                voice
                  ? status === "stale"
                    ? "Re-voice line"
                    : "Voice line"
                  : "Assign a voice to this speaker first"
              }
            >
              <span>
                <ToolbarIconButton
                  tooltip=""
                  disabled={readOnly || !voice}
                  onClick={() => void onVoice()}
                  icon={<GraphicEqIcon fontSize="small" />}
                />
              </span>
            </Tooltip>
          )}
          <ToolbarIconButton
            tooltip="Play current take"
            disabled={!hasCurrentTake}
            onClick={() => void playCurrent()}
            icon={<PlayArrowIcon fontSize="small" />}
          />
          <ToolbarIconButton
            tooltip={`Takes (${line.takes.length})`}
            onClick={(e: MouseEvent<HTMLElement>) =>
              setGalleryAnchor(e.currentTarget)
            }
            icon={<HistoryIcon fontSize="small" />}
          />
          {!readOnly && (
            <ToolbarIconButton
              tooltip="Delete line"
              onClick={() => removeLine(scriptId, line.id)}
              icon={<DeleteOutlineIcon fontSize="small" />}
            />
          )}
        </FlexRow>
      </FlexColumn>

      <Popover
        open={!!galleryAnchor}
        anchorEl={galleryAnchor}
        onClose={() => setGalleryAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <ScriptTakeGallery
          scriptId={scriptId}
          lineId={line.id}
          takes={line.takes}
          currentTakeId={line.currentTakeId ?? null}
        />
      </Popover>
    </FlexRow>
  );
};

export default ScriptLineRow;
