import React, { memo, useMemo } from "react";
import { NPArray } from "../../stores/ApiTypes";
import { Typography, Paper, Box } from "@mui/material";
import { isEqual } from "lodash";

interface ArrayViewProps {
  array: NPArray;
}

const ArrayView: React.FC<ArrayViewProps> = ({ array }) => {
  const { value, dtype, shape } = array;

  const formattedValue = useMemo(() => {
    if (!value) return "No data";
    if (value.length > 100) {
      return JSON.stringify(value.slice(0, 100)) + "...";
    }
    return JSON.stringify(value, null, 2);
  }, [value]);

  return (
    <Paper elevation={2} sx={{ p: 2, my: 1, fontFamily: "monospace" }}>
      <Typography variant="h6" gutterBottom>
        Array ({dtype})
      </Typography>
      <Typography variant="body1" gutterBottom>
        Shape: {shape.join(", ")}
      </Typography>
      <Box display="flex" flexDirection="column" gap={1}>
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
      </Box>
    </Paper>
  );
};

export default memo(ArrayView, isEqual);
