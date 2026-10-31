/**
 * EffectsGallery
 *
 * One picture, one effect, one result. A grid of effect cards, a picture drop
 * target, the model the effect runs on, and the result in place. The request
 * goes through `generate_media` with `preset_ids`, so the server compiles the
 * effect for the chosen model and the run also appears in Generations.
 */

import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import type { Preset } from "@nodetool-ai/presets";

import {
  AutoGrid,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  PageHeader,
  PADDING,
  ScrollArea,
  SectionHeader,
  Text
} from "../ui_primitives";
import ModeProviderSetupBanner from "../chat/composer/ModeProviderSetupBanner";
import { useModeProviderSetup } from "../chat/composer/useModeProviderSetup";
import { EFFECT_PRESETS } from "../../lib/presets/catalog";
import { useOpenPresetAsWorkflow } from "../../hooks/presets/useOpenPresetAsWorkflow";
import { useEffectsGalleryStore } from "../../stores/EffectsGalleryStore";
import estimateGenerationCost from "../../utils/generationCostEstimate";
import { presetText } from "../../utils/presetText";
import EffectCard from "./EffectCard";
import EffectModelField from "./EffectModelField";
import EffectResult from "./EffectResult";
import EffectSourcePicker from "./EffectSourcePicker";
import {
  buildEffectRequest,
  composerModeOf,
  effectModeOf,
  resultKindOf,
  type EffectMode
} from "./effectsRun";
import { useEffectModel } from "./useEffectModel";

/** The mode the gallery shows before an effect is chosen. */
const DEFAULT_MODE: EffectMode = "image_to_video";
const CARD_MIN_WIDTH = 200;
const SOURCE_COLUMN_WIDTH = 320;
const ESTIMATE_SECONDS = 5;

const EffectsGallery = () => {
  const { t, i18n } = useTranslation();
  const sourceAssetId = useEffectsGalleryStore((state) => state.sourceAssetId);
  const effectId = useEffectsGalleryStore((state) => state.effectId);
  const run = useEffectsGalleryStore((state) => state.run);
  const setSourceAssetId = useEffectsGalleryStore(
    (state) => state.setSourceAssetId
  );
  const selectEffect = useEffectsGalleryStore((state) => state.selectEffect);
  const start = useEffectsGalleryStore((state) => state.start);
  const openAsWorkflow = useOpenPresetAsWorkflow();

  const effect = useMemo(
    () => EFFECT_PRESETS.find((preset) => preset.id === effectId) ?? null,
    [effectId]
  );
  const mode = effect ? effectModeOf(effect) : DEFAULT_MODE;
  const kind = resultKindOf(mode);
  const { model, pick } = useEffectModel(mode);
  const providerSetup = useModeProviderSetup(composerModeOf(mode));
  const running = run.status === "running";
  const effectName = effect ? presetText(t, effect).name : null;

  const estimate = useMemo(() => {
    if (!model) {
      return null;
    }
    return estimateGenerationCost(
      kind === "video"
        ? {
            kind: "video",
            provider: model.provider,
            model: model.id,
            seconds: ESTIMATE_SECONDS
          }
        : { kind: "image", provider: model.provider, model: model.id }
    );
  }, [kind, model]);

  const blockedReason = !sourceAssetId
    ? t("effectsGallery.reason.needPicture")
    : !effect
      ? t("effectsGallery.reason.needEffect")
      : providerSetup.needsSetup
        ? null
        : !model
          ? t(
              kind === "video"
                ? "effectsGallery.reason.needVideoModel"
                : "effectsGallery.reason.needImageModel"
            )
          : null;
  const canApply =
    !running &&
    sourceAssetId !== null &&
    effect !== null &&
    model !== null &&
    !providerSetup.needsSetup;

  const apply = useCallback(() => {
    if (!canApply || !sourceAssetId || !effect || !model) {
      return;
    }
    void start(buildEffectRequest(effect, model, sourceAssetId), {
      kind,
      task: mode === "image_to_video" ? "image_to_video" : "image_edit"
    });
  }, [canApply, effect, kind, mode, model, sourceAssetId, start]);

  const handleSelect = useCallback(
    (preset: Preset) => selectEffect(preset.id),
    [selectEffect]
  );
  const handleOpenAsWorkflow = useCallback(
    (preset: Preset) => {
      const presetMode = effectModeOf(preset);
      void openAsWorkflow([preset.id], {
        kind: resultKindOf(presetMode),
        model: presetMode === mode ? model : null
      });
    },
    [mode, model, openAsWorkflow]
  );

  const modelHelper = estimate
    ? t("effectsGallery.model.estimated", {
        estimate: new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
          style: "currency",
          currency: "USD"
        }).format(estimate.total)
      })
    : model
      ? t("effectsGallery.model.noEstimate")
      : t("effectsGallery.model.choose");

  return (
    <FlexColumn fullHeight sx={{ minHeight: 0 }} data-testid="effects-gallery">
      <PageHeader
        variant="bar"
        icon={<AutoAwesomeOutlinedIcon />}
        title={t("effectsGallery.title")}
        subtitle={t("effectsGallery.subtitle")}
      />
      <ScrollArea sx={{ flex: 1, minHeight: 0 }}>
        <FlexColumn gap={GAP.comfortable} sx={{ p: PADDING.comfortable }}>
          {providerSetup.needsSetup && providerSetup.reason ? (
            <ModeProviderSetupBanner
              reason={providerSetup.reason}
              onConnect={providerSetup.openSetup}
            />
          ) : null}

          <FlexRow gap={GAP.comfortable} wrap align="flex-start">
            <FlexColumn sx={{ width: SOURCE_COLUMN_WIDTH, maxWidth: "100%" }}>
              <EffectSourcePicker
                assetId={sourceAssetId}
                onChange={setSourceAssetId}
                disabled={running}
              />
            </FlexColumn>
            <FlexColumn
              gap={GAP.normal}
              sx={{ flex: 1, minWidth: SOURCE_COLUMN_WIDTH }}
            >
              <Text size="small" weight={500}>
                {effectName ?? t("effectsGallery.noEffect")}
              </Text>
              <EffectModelField
                mode={mode}
                model={model}
                onPick={pick}
                helperText={modelHelper}
              />
              <FlexRow gap={GAP.normal} align="center" wrap>
                <EditorButton
                  variant="contained"
                  color="primary"
                  disabled={!canApply}
                  onClick={apply}
                >
                  {running
                    ? t("effectsGallery.applying")
                    : t("effectsGallery.apply")}
                </EditorButton>
                {blockedReason && !running ? (
                  <Caption color="secondary" role="status">
                    {blockedReason}
                  </Caption>
                ) : null}
              </FlexRow>
              <EffectResult
                run={run}
                effectName={
                  run.effectId
                    ? presetText(
                        t,
                        EFFECT_PRESETS.find((p) => p.id === run.effectId) ?? {
                          id: run.effectId,
                          name: "",
                          description: ""
                        }
                      ).name
                    : effectName
                }
                kind={kind}
                hasPicture={sourceAssetId !== null}
                canRetry={canApply}
                onRetry={apply}
              />
            </FlexColumn>
          </FlexRow>

          <FlexColumn gap={GAP.normal}>
            <SectionHeader title={t("effectsGallery.effects")} />
            <AutoGrid
              minItemWidth={CARD_MIN_WIDTH}
              gap={GAP.comfortable}
              role="group"
              aria-label={t("effectsGallery.effects")}
            >
              {EFFECT_PRESETS.map((preset) => (
                <EffectCard
                  key={preset.id}
                  preset={preset}
                  selected={preset.id === effectId}
                  onSelect={handleSelect}
                  onOpenAsWorkflow={handleOpenAsWorkflow}
                />
              ))}
            </AutoGrid>
          </FlexColumn>
        </FlexColumn>
      </ScrollArea>
    </FlexColumn>
  );
};

export default memo(EffectsGallery);
