import React, { useCallback } from "react";
import { Chip, FlexRow, Text } from "../../ui_primitives";
import { useModelManagerStore } from "../../../stores/ModelManagerStore";
import { MODEL_FORMATS } from "./modelFormat";

/**
 * Weight-format filter row: one chip per format, narrowing the model list to
 * models that carry it. Clicking the active chip clears the filter.
 */
const FormatFilterChips: React.FC = () => {
  const selectedFormat = useModelManagerStore((state) => state.selectedFormat);
  const setSelectedFormat = useModelManagerStore(
    (state) => state.setSelectedFormat
  );

  const handleToggle = useCallback(
    (formatId: string) => {
      setSelectedFormat(selectedFormat === formatId ? null : formatId);
    },
    [selectedFormat, setSelectedFormat]
  );

  return (
    <FlexRow gap={1} align="center" sx={{ flexWrap: "wrap", mb: 2 }}>
      <Text size="small" color="secondary" sx={{ whiteSpace: "nowrap" }}>
        Format
      </Text>
      {MODEL_FORMATS.map((format) => (
        <Chip
          key={format.id}
          label={format.label}
          size="small"
          active={selectedFormat === format.id}
          color={selectedFormat === format.id ? "primary" : "default"}
          variant={selectedFormat === format.id ? "filled" : "outlined"}
          onClick={() => handleToggle(format.id)}
        />
      ))}
    </FlexRow>
  );
};

export default React.memo(FormatFilterChips);
