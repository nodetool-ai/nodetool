/**
 * The model that drafts the beats, on the format step.
 *
 * One dropdown over the language models a configured provider reports. It
 * shows the curated NodeTool director when this server can serve it and every
 * other configured model beside it, so an install without the platform key
 * behind the director has somewhere to go instead of a dead plan button.
 */

import React, { memo } from "react";

import {
  AlertBanner,
  FlexColumn,
  GAP,
  Text
} from "../../ui_primitives";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import { directorModelKey, useDirectorModel } from "./directorModel";

const DirectorModelPickerInternal: React.FC = () => {
  const { model, options, select, loading, error, noProvider } =
    useDirectorModel();

  if (error) {
    return (
      <AlertBanner severity="error">
        {`The model list could not be read: ${error}`}
      </AlertBanner>
    );
  }
  if (noProvider) {
    return (
      <AlertBanner severity="warning">
        No configured provider offers a language model, so the beats cannot be
        drafted. Add a provider key in Settings, then come back to this step.
      </AlertBanner>
    );
  }

  return (
    <FlexColumn gap={GAP.tight}>
      <LanguageModelSelect
        value={model?.id ?? ""}
        provider={model?.provider}
        placeholder="Model for the beats"
        onChange={(value) => select(directorModelKey(value))}
        disabled={loading || options.length === 0}
      />
      {loading ? (
        <Text size="small" color="secondary">
          Reading the configured providers…
        </Text>
      ) : null}
    </FlexColumn>
  );
};

export const DirectorModelPicker = memo(DirectorModelPickerInternal);
DirectorModelPicker.displayName = "DirectorModelPicker";

export default DirectorModelPicker;
