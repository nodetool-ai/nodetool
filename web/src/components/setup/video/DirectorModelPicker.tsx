/**
 * The model that drafts the beats, in the format step's footer.
 *
 * One dropdown over the language models a configured provider reports. It
 * shows the curated NodeTool director when this server can serve it and every
 * other configured model beside it, so an install without the platform key
 * behind the director has somewhere to go instead of a dead plan button.
 */

import React, { memo } from "react";

import { Caption } from "../../ui_primitives";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import { SetupFooterField } from "../SetupFooterField";
import { directorModelKey, useDirectorModel } from "./directorModel";

const DirectorModelPickerInternal: React.FC<{ readOnly?: boolean }> = ({
  readOnly = false
}) => {
  const { model, options, select, loading, error, noProvider } =
    useDirectorModel();

  // The footer has one line to spare, so a list that cannot be offered says
  // why in that line rather than in a banner.
  if (error) {
    return (
      <Caption color="error" role="alert">
        {`The model list could not be read: ${error}`}
      </Caption>
    );
  }
  if (noProvider) {
    return (
      <Caption color="warning" role="alert">
        No provider offers a language model. Add a key in Settings.
      </Caption>
    );
  }

  return (
    <SetupFooterField label="Model">
      <LanguageModelSelect
        value={model?.id ?? ""}
        provider={model?.provider}
        placeholder={loading ? "Reading providers…" : "Model for the beats"}
        onChange={(value) => select(directorModelKey(value))}
        disabled={readOnly || loading || options.length === 0}
      />
    </SetupFooterField>
  );
};

export const DirectorModelPicker = memo(DirectorModelPickerInternal);
DirectorModelPicker.displayName = "DirectorModelPicker";

export default DirectorModelPicker;
