import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTranslation } from "react-i18next";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import {
  AlertBanner,
  Caption,
  Checkbox,
  EditorButton,
  FlexColumn,
  FlexRow,
  FormField,
  GAP,
  LoadingSpinner,
  MediaThumbnail,
  PageHeader,
  PADDING,
  ScrollArea,
  TextArea
} from "../ui_primitives";
import estimateGenerationCost from "../../utils/generationCostEstimate";
import EffectSourcePicker from "../effects/EffectSourcePicker";
import EntityPickerDialog from "../entities/EntityPickerDialog";
import VideoModelSelect from "../properties/VideoModelSelect";
import ModeChips from "../chat/composer/ModeChips";
import ModeProviderSetupBanner from "../chat/composer/ModeProviderSetupBanner";
import { useModeProviderSetup } from "../chat/composer/useModeProviderSetup";
import { audioModelPatch } from "../chat/composer/modelSelection";
import { useLipsyncStudioStore } from "../../stores/LipsyncStudioStore";
import useMediaGenerationStore from "../../stores/MediaGenerationStore";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import {
  getRememberedModel,
  getRememberedModelForTask
} from "../../stores/lastModelStore";
import {
  useTTSModelsByProvider,
  useVideoModelsByProvider
} from "../../hooks/useModelsByProvider";

const REFERENCE_WIDTH = 320;

export default function LipsyncStudio() {
  const { t } = useTranslation();
  const state = useLipsyncStudioStore(
    useShallow((s) => ({
      sourceAssetId: s.sourceAssetId,
      text: s.text,
      realPerson: s.realPerson,
      confirmed: s.confirmed,
      status: s.status,
      assetIds: s.assetIds,
      error: s.error,
      setSource: s.setSource,
      setText: s.setText,
      setRealPerson: s.setRealPerson,
      setConfirmed: s.setConfirmed,
      start: s.start
    }))
  );
  const audio = useMediaGenerationStore((s) => s.audio);
  const videos = useVideoModelsByProvider({ task: "audio_to_video" });
  const voices = useTTSModelsByProvider();
  const defaults = useModelPreferencesStore((s) => s.defaults);
  const [picked, setPicked] = useState<{ id: string; provider: string } | null>(
    null
  );
  const [entityOpen, setEntityOpen] = useState(false);
  const [entityError, setEntityError] = useState(false);
  const setup = useModeProviderSetup("audio_to_video");
  const speechSetup = useModeProviderSetup("audio");
  const remembered =
    getRememberedModelForTask("video", "audio_to_video") ??
    getRememberedModel("video");
  const candidates = [
    picked,
    remembered?.model
      ? { id: remembered.model, provider: remembered.provider }
      : null,
    defaults.video_model
  ];
  const model = candidates.flatMap((ref) =>
    ref
      ? videos.models.filter(
          (m) => m.id === ref.id && m.provider === ref.provider
        )
      : []
  )[0];
  useEffect(() => {
    if (
      voices.isLoading ||
      voices.models.some(
        (model) =>
          model.id === audio.model?.id &&
          model.provider === audio.model.provider
      )
    ) {
      return;
    }
    const last = getRememberedModel("audio");
    const refs = [
      last?.model ? { id: last.model, provider: last.provider } : null,
      defaults.tts_model
    ];
    const listed = refs.flatMap((ref) =>
      ref
        ? voices.models.filter(
            (m) => m.id === ref.id && m.provider === ref.provider
          )
        : []
    )[0];
    if (listed) {
      useMediaGenerationStore
        .getState()
        .setAudioParams(audioModelPatch(listed, last?.voice ?? audio.voice));
    }
  }, [
    audio.model,
    audio.voice,
    defaults.tts_model,
    voices.isLoading,
    voices.models
  ]);
  const running = state.status === "speech" || state.status === "video";
  const speechAvailable = voices.models.some(
    (m) => m.id === audio.model?.id && m.provider === audio.model.provider
  );
  const estimate = model
    ? estimateGenerationCost({
        kind: "video",
        model: model.id,
        provider: model.provider
      })
    : null;
  const canRun =
    !running &&
    Boolean(
      state.sourceAssetId &&
      state.text.trim() &&
      model &&
      audio.model &&
      audio.voice &&
      speechAvailable
    ) &&
    (!state.realPerson || state.confirmed) &&
    !setup.needsSetup &&
    !speechSetup.needsSetup;
  return (
    <FlexColumn fullHeight data-testid="lipsync-studio" sx={{ minHeight: 0 }}>
      <PageHeader
        variant="bar"
        icon={<RecordVoiceOverIcon />}
        title={t("lipsync.title")}
        subtitle={t("lipsync.subtitle")}
      />
      <ScrollArea sx={{ flex: 1, minHeight: 0 }}>
        <FlexColumn gap={GAP.comfortable} sx={{ p: PADDING.comfortable }}>
          {[setup, speechSetup].map((item, index) =>
            item.needsSetup && item.reason ? (
              <ModeProviderSetupBanner
                key={index}
                reason={item.reason}
                onConnect={item.openSetup}
              />
            ) : null
          )}
          <FlexColumn sx={{ width: REFERENCE_WIDTH, maxWidth: "100%" }}>
            <EffectSourcePicker
              assetId={state.sourceAssetId}
              onChange={state.setSource}
              disabled={running}
            />
          </FlexColumn>
          <EditorButton disabled={running} onClick={() => setEntityOpen(true)}>
            {t("lipsync.entity")}
          </EditorButton>
          {entityError && (
            <AlertBanner severity="warning">
              {t("lipsync.entityImage")}
            </AlertBanner>
          )}
          <Checkbox
            label={t("lipsync.realPerson")}
            checked={state.realPerson}
            disabled={running}
            onChange={(_, value) => state.setRealPerson(value)}
          />
          {state.realPerson && (
            <Checkbox
              label={t("lipsync.consent")}
              checked={state.confirmed}
              disabled={running}
              onChange={(_, value) => state.setConfirmed(value)}
            />
          )}
          <TextArea
            label={t("lipsync.line")}
            value={state.text}
            onChange={state.setText}
            minRows={3}
            disabled={running}
            assist={false}
          />
          <FlexRow gap={GAP.normal} wrap>
            <ModeChips mode="audio" openModelPickerRef={null} />
          </FlexRow>
          <FormField
            label={t("lipsync.model")}
            helperText={
              estimate
                ? t("lipsync.estimate", { amount: estimate.label })
                : t("lipsync.noEstimate")
            }
          >
            <VideoModelSelect
              task="audio_to_video"
              value={model?.id ?? ""}
              provider={model?.provider}
              onChange={(value) =>
                setPicked({ id: value.id, provider: value.provider })
              }
            />
          </FormField>
          <Caption>{t("lipsync.requirements")}</Caption>
          <EditorButton
            variant="contained"
            disabled={!canRun}
            onClick={() =>
              void state.start(
                {
                  model: audio.model?.id,
                  provider: audio.model?.provider,
                  voice: audio.voice,
                  speed: audio.speed
                },
                { model: model?.id, provider: model?.provider }
              )
            }
          >
            {t("lipsync.render")}
          </EditorButton>
          {running && (
            <LoadingSpinner
              text={t(
                state.status === "speech" ? "lipsync.speech" : "lipsync.video"
              )}
            />
          )}
          {state.status === "failed" && (
            <AlertBanner severity="error">
              {t("lipsync.failed", { reason: state.error })}
            </AlertBanner>
          )}
          {state.assetIds[0] && (
            <MediaThumbnail
              locator={{ asset_id: state.assetIds[0] }}
              kind="video"
              interactive
              alt={t("lipsync.result")}
            />
          )}
        </FlexColumn>
      </ScrollArea>
      <EntityPickerDialog
        open={entityOpen}
        onClose={() => setEntityOpen(false)}
        onSelect={(entity) => {
          const id = entity.reference_images?.[0]?.asset_id;
          setEntityError(!id);
          if (id) {
            state.setSource(id);
          }
        }}
      />
    </FlexColumn>
  );
}
