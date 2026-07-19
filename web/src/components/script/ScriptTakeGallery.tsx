/** @jsxImportSource @emotion/react */
import { useCallback } from "react";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import {
  FlexColumn,
  FlexRow,
  Text,
  Divider,
  ToolbarIconButton,
  EmptyState,
  SPACING
} from "../ui_primitives";
import {
  useScriptStore,
  type ScriptTake
} from "../../stores/script/ScriptStore";
import { syncLineClipToTimeline } from "../../stores/script/timelineSync";
import { useAssetStore } from "../../stores/AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";

interface ScriptTakeGalleryProps {
  scriptId: string;
  lineId: string;
  takes: ScriptTake[];
  currentTakeId: string | null;
}

const formatDuration = (ms: number): string => {
  const s = ms / 1000;
  return `${s.toFixed(1)}s`;
};

const TakeRow = ({
  scriptId,
  lineId,
  take,
  isCurrent
}: {
  scriptId: string;
  lineId: string;
  take: ScriptTake;
  isCurrent: boolean;
}) => {
  const setCurrentTake = useScriptStore((s) => s.setCurrentTake);
  const toggleFavorite = useScriptStore((s) => s.toggleTakeFavorite);
  const removeTake = useScriptStore((s) => s.removeTake);

  const useTake = useCallback(() => {
    setCurrentTake(scriptId, lineId, take.id);
    // Round-trip the newly-selected take into the assembled timeline, if any.
    void syncLineClipToTimeline(scriptId, lineId, take);
  }, [setCurrentTake, scriptId, lineId, take]);

  const deleteTake = useCallback(() => {
    removeTake(scriptId, lineId, take.id);
    const line = useScriptStore
      .getState()
      .getScript(scriptId)
      ?.sections.flatMap((section) => section.lines)
      .find((candidate) => candidate.id === lineId);
    const currentTake = line?.takes.find(
      (candidate) => candidate.id === line.currentTakeId
    );
    void syncLineClipToTimeline(scriptId, lineId, currentTake ?? null);
  }, [removeTake, scriptId, lineId, take.id]);

  const play = useCallback(async () => {
    if (typeof Audio === "undefined") return;
    try {
      const asset = await useAssetStore.getState().get(take.assetId);
      const url = getAssetUrl(asset);
      if (url) void new Audio(url).play().catch(() => undefined);
    } catch {
      // Asset unavailable — nothing to play.
    }
  }, [take.assetId]);

  return (
    <FlexRow align="center" gap={SPACING.sm} fullWidth>
      <ToolbarIconButton
        tooltip={isCurrent ? "Current take" : "Use this take"}
        onClick={useTake}
        icon={
          <CheckCircleIcon
            fontSize="small"
            color={isCurrent ? "primary" : "disabled"}
          />
        }
      />
      <FlexColumn gap={SPACING.none} style={{ flex: 1, minWidth: 0 }}>
        <Text
          size="small"
          truncate
          title={take.textSnapshot}
          sx={{ fontStyle: "italic" }}
        >
          {take.textSnapshot || "(empty)"}
        </Text>
        <Text size="smaller" color="secondary">
          {formatDuration(take.durationMs)}
          {take.voiceSnapshot ? ` · ${take.voiceSnapshot.voice}` : ""}
          {typeof take.costCredits === "number"
            ? ` · ${take.costCredits} cr`
            : ""}
        </Text>
      </FlexColumn>
      <ToolbarIconButton
        tooltip="Play take"
        onClick={() => void play()}
        icon={<span aria-hidden>▶</span>}
      />
      <ToolbarIconButton
        tooltip={take.favorite ? "Unfavorite" : "Favorite"}
        onClick={() => toggleFavorite(scriptId, lineId, take.id)}
        icon={
          take.favorite ? (
            <StarIcon fontSize="small" color="warning" />
          ) : (
            <StarBorderIcon fontSize="small" />
          )
        }
      />
      <ToolbarIconButton
        tooltip="Delete take"
        onClick={deleteTake}
        icon={<DeleteOutlineIcon fontSize="small" />}
      />
    </FlexRow>
  );
};

/** Popover body: the ordered take history for one line. */
const ScriptTakeGallery = ({
  scriptId,
  lineId,
  takes,
  currentTakeId
}: ScriptTakeGalleryProps) => {
  if (takes.length === 0) {
    return (
      <div style={{ minWidth: 260, padding: 8 }}>
        <EmptyState
          title="No takes yet"
          description="Voice this line to create the first take."
        />
      </div>
    );
  }
  return (
    <FlexColumn gap={SPACING.xs} style={{ minWidth: 320, padding: 8 }}>
      <Text size="smaller" color="secondary">
        {takes.length} take{takes.length === 1 ? "" : "s"}
      </Text>
      <Divider />
      {takes
        .slice()
        .reverse()
        .map((take) => (
          <TakeRow
            key={take.id}
            scriptId={scriptId}
            lineId={lineId}
            take={take}
            isCurrent={take.id === currentTakeId}
          />
        ))}
    </FlexColumn>
  );
};

export default ScriptTakeGallery;
