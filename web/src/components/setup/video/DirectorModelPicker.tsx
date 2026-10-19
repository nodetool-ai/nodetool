/**
 * The model that drafts the beats, in the format step's footer.
 *
 * One dropdown over the language models a configured provider reports. It
 * shows the curated NodeTool director when this server can serve it and every
 * other configured model beside it, so an install without the platform key
 * behind the director has somewhere to go instead of a dead plan button.
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";

import { Caption, EditorButton, FlexRow, GAP } from "../../ui_primitives";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import ReportBugButton from "../../support/ReportBugButton";
import { SetupFooterField } from "../SetupFooterField";
import { directorModelKey, useDirectorModel } from "./directorModel";

const DirectorModelPickerInternal: React.FC<{ readOnly?: boolean }> = ({
  readOnly = false
}) => {
  const { t } = useTranslation();
  const { model, options, select, loading, error, noProvider, refetch } =
    useDirectorModel();

  // The footer has one line to spare, so a list that cannot be offered says
  // why in that line rather than in a banner.
  if (error) {
    return (
      <FlexRow gap={GAP.tight} align="center" wrap>
        <Caption color="error" role="alert">
          {t("pass3_12.video.director.modelListError", { error })}
        </Caption>
        <EditorButton size="small" variant="text" onClick={refetch}>
          {t("pass3_12.video.director.tryAgain")}
        </EditorButton>
        <ReportBugButton
          context={{
            source: "provider-call",
            summary: t("pass3_12.video.director.reportSummary"),
            errorText: error
          }}
        />
      </FlexRow>
    );
  }
  if (noProvider) {
    return (
      <Caption color="warning" role="alert">
        {t("pass3_12.video.director.noProvider")}
      </Caption>
    );
  }

  return (
    <SetupFooterField label={t("pass3_12.video.director.modelLabel")}>
      <LanguageModelSelect
        value={model?.id ?? ""}
        provider={model?.provider}
        placeholder={
          loading
            ? t("pass3_12.video.director.loadingProviders")
            : t("pass3_12.video.director.modelPlaceholder")
        }
        onChange={(value) => select(directorModelKey(value))}
        disabled={readOnly || loading || options.length === 0}
      />
    </SetupFooterField>
  );
};

export const DirectorModelPicker = memo(DirectorModelPickerInternal);
DirectorModelPicker.displayName = "DirectorModelPicker";

export default DirectorModelPicker;
