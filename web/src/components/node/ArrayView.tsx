import React, { memo, useMemo } from "react";
import { NPArray } from "../../stores/ApiTypes";
import { Paper, Box } from "@mui/material";
import { Text, FlexColumn } from "../ui_primitives";
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
    <Paper elevation={2} sx={{ p: 2, my: 1, fontFamily: "monospace" }}>
      <Text size="normal" weight={600} gutterBottom>
        Array ({dtype})
      </Text>
      <Text gutterBottom>
        Shape: {shape.join(", ")}
      </Text>
      <FlexColumn gap={1}>
        <Box
          component="pre"
          sx={{
            p: 1,
            borderRadius: 1,
            overflow: "auto",
            maxHeight: "200px"
          }}
        >
          {formattedValue}
        </Box>
      </FlexColumn>
    </Paper>
  );
};

export default memo(ArrayView, isEqual);
