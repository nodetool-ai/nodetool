import { memo } from "react";
import { useTranslation } from "react-i18next";
import { StatusPill } from "../ui_primitives";
import type { ExampleNeeds } from "../../utils/exampleNeeds";

interface ExampleNeedsPillProps {
  /** What the example asks for. Nothing renders when it is unknown. */
  needs: ExampleNeeds | null | undefined;
}

/** "Runs as is", or the model or key an example card needs before it runs. */
const ExampleNeedsPill = ({ needs }: ExampleNeedsPillProps) => {
  const { t } = useTranslation();
  if (!needs) {
    return null;
  }
  const modelLabels: Record<string, string> = {
    language_model: t("pass3_18.examples.needs.modelKinds.language"),
    llama_model: t("pass3_18.examples.needs.modelKinds.language"),
    image_model: t("pass3_18.examples.needs.modelKinds.image"),
    video_model: t("pass3_18.examples.needs.modelKinds.video"),
    tts_model: t("pass3_18.examples.needs.modelKinds.voice"),
    asr_model: t("pass3_18.examples.needs.modelKinds.transcription"),
    music_model: t("pass3_18.examples.needs.modelKinds.music"),
    embedding_model: t("pass3_18.examples.needs.modelKinds.embedding")
  };
  const labels = [
    ...new Set(needs.modelKinds.map((kind) => modelLabels[kind]).filter(Boolean))
  ];
  const runsAsIs =
    needs.modelKinds.length === 0 && needs.requiredSettings.length === 0;
  const label = runsAsIs
    ? t("pass3_18.examples.needs.runsAsIs")
    : needs.modelKinds.length > 0
      ? labels.length > 1
        ? t("pass3_18.examples.needs.models")
        : labels[0]
          ? t("pass3_18.examples.needs.oneModel", {
              article:
                labels[0].startsWith("image") ||
                labels[0].startsWith("embedding")
                  ? "an"
                  : "a",
              kind: labels[0]
            })
          : t("pass3_18.examples.needs.model")
      : t("pass3_18.examples.needs.apiKey");
  return (
    <StatusPill
      tone={runsAsIs ? "done" : "neutral"}
      data-testid="example-needs"
      sx={{ alignSelf: "flex-start" }}
    >
      {label}
    </StatusPill>
  );
};

export default memo(ExampleNeedsPill);
