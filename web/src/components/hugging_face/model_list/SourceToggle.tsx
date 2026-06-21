import React, { useCallback } from "react";
import { ToggleGroup, ToggleOption } from "../../ui_primitives";
import type { ModelSource } from "../../../stores/ModelManagerStore";

interface SourceToggleProps {
  source: ModelSource;
  onChange: (source: ModelSource) => void;
}

/**
 * Catalog source toggle for the ModelManager. "Installed" lists models on disk
 * (or the attached worker); "Recommended" lists the curated catalog aggregated
 * from installed nodes; "Hub" searches the live HuggingFace Hub. The latter two
 * are browsable for download.
 */
const SourceToggleInternal: React.FC<SourceToggleProps> = ({
  source,
  onChange
}) => {
  const handleChange = useCallback(
    (_e: React.MouseEvent<HTMLElement>, value: ModelSource | null) => {
      if (value) {
        onChange(value);
      }
    },
    [onChange]
  );

  return (
    <ToggleGroup
      value={source}
      exclusive
      segmented
      onChange={handleChange}
      aria-label="model source"
    >
      <ToggleOption value="installed" aria-label="installed models">
        Installed
      </ToggleOption>
      <ToggleOption value="recommended" aria-label="recommended models">
        Recommended
      </ToggleOption>
      <ToggleOption value="hub" aria-label="search hugging face hub">
        Hub
      </ToggleOption>
    </ToggleGroup>
  );
};

export const SourceToggle = React.memo(SourceToggleInternal);
SourceToggle.displayName = "SourceToggle";
