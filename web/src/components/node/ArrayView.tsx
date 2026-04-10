import React, { memo, useMemo } from "react";
import { NPArray } from "../../stores/ApiTypes";
import { Text, FlexColumn, Surface } from "../ui_primitives";
import isEqual from "lodash/isEqual";

interface ArrayViewProps {
  array: NPArray;
}

const ArrayView: React.FC<ArrayViewProps> = ({ array }) => {
  const { value, dtype, shape } = array;

  const formattedValue = useMemo(() => {
    if (!value) {return "No data";}
    if (value.length > 100) {
      return JSON.stringify(value.slice(0, 100)) + "...";
    }
    return JSON.stringify(value, null, 2);
  }, [value]);

  return (
    <Surface sx={{ p: 2, my: 1, fontFamily: "monospace" }}>
      <Text size="normal" weight={600} gutterBottom>
        Array ({dtype})
      </Text>
      <Text gutterBottom>
        Shape: {shape.join(", ")}
      </Text>
      <FlexColumn gap={1}>
        <pre
          style={{
            padding: 8,
            borderRadius: 4,
            overflow: "auto",
            maxHeight: "200px"
          }}
        >
          {formattedValue}
        </pre>
      </FlexColumn>
    </Surface>
  );
};

export default memo(ArrayView, isEqual);
