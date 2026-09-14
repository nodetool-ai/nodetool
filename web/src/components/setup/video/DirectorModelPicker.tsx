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
  SelectField,
  Text
} from "../../ui_primitives";
import type { SelectOption } from "../../ui_primitives";
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

  const items: SelectOption[] = options.map((option) => ({
    value: directorModelKey(option),
    label: option.name
      ? `${option.name} (${option.provider})`
      : `${option.id} (${option.provider})`
  }));

  return (
    <FlexColumn gap={GAP.tight}>
      <SelectField
        label="Model for the beats"
        value={model ? directorModelKey(model) : ""}
        onChange={select}
        options={items}
        disabled={loading || items.length === 0}
        description="Writes the beat outline as text. You can change it before every plan."
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
