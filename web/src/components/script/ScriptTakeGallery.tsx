/** @jsxImportSource @emotion/react */
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
  FlexColumn,
  FlexRow,
  Box,
  Text,
  Divider,
  ToolbarIconButton,
  EmptyState,
  SPACING,
  selectableRowStyles
} from "../ui_primitives";
import {
  useScriptStore,
  type ScriptTake
} from "../../stores/script/ScriptStore";
import { syncLineClipToTimeline } from "../../stores/script/timelineSync";
import { useAssetStore } from "../../stores/AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";
import { SendToWorkflowButton } from "../workflows/SendToWorkflowMenu";
import { takeWorkflowMedia } from "./scriptWorkflowMedia";

interface ScriptTakeGalleryProps {
  scriptId: string;
  lineId: string;
  takes: ScriptTake[];
  currentTakeId: string | null;
}

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
  const { t } = useTranslation();
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

  const workflowMedia = useMemo(() => [takeWorkflowMedia(take)], [take]);

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
    <FlexRow
      align="center"
      gap={SPACING.sm}
      fullWidth
      aria-current={isCurrent ? "true" : undefined}
      sx={(theme) => ({
        ...selectableRowStyles(theme, { selected: isCurrent }),
        px: SPACING.xs
      })}
    >
      <ToolbarIconButton
        tooltip={t(
          isCurrent
            ? "i18n-next62.scriptTakeGallery.currentTake"
            : "i18n-next62.scriptTakeGallery.useTake"
        )}
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
          {take.textSnapshot || t("i18n-next62.scriptTakeGallery.empty")}
        </Text>
        <Text size="smaller" color="secondary">
          {t("i18n-next62.scriptTakeGallery.duration", {
            seconds: (take.durationMs / 1000).toFixed(1)
          })}
          {take.voiceSnapshot ? ` · ${take.voiceSnapshot.voice}` : ""}
          {take.costCredits != null
            ? ` · ${t("i18n-next62.scriptTakeGallery.credits", {
                credits: take.costCredits
              })}`
            : ""}
        </Text>
      </FlexColumn>
      <ToolbarIconButton
        tooltip={t("i18n-next62.scriptTakeGallery.playTake")}
        onClick={() => void play()}
        icon={<PlayArrowIcon fontSize="small" />}
      />
      <SendToWorkflowButton
        items={workflowMedia}
        tooltip={t("i18n-next62.scriptTakeGallery.sendToWorkflow")}
      />
      <ToolbarIconButton
        tooltip={t(
          take.favorite
            ? "i18n-next62.scriptTakeGallery.unfavorite"
            : "i18n-next62.scriptTakeGallery.favorite"
        )}
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
        tooltip={t("i18n-next62.scriptTakeGallery.deleteTake")}
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
  const { t } = useTranslation();
  if (takes.length === 0) {
    return (
      <Box sx={{ minWidth: 260, padding: SPACING.md }}>
        <EmptyState
          title={t("i18n-next62.scriptTakeGallery.noTakes")}
          description={t("i18n-next62.scriptTakeGallery.noTakesDescription")}
        />
      </Box>
    );
  }
  return (
    <FlexColumn
      gap={SPACING.xs}
      sx={{ minWidth: 320, padding: SPACING.md }}
    >
      <Text size="smaller" color="secondary">
        {t("i18n-next62.scriptTakeGallery.takeCount", { count: takes.length })}
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
