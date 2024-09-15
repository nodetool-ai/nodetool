import React, { useMemo } from "react";
import { Tensor } from "../../stores/ApiTypes";
import { Typography, Paper, Box } from "@mui/material";

interface TensorViewProps {
  tensor: Tensor;
}

const TensorView: React.FC<TensorViewProps> = ({ tensor }) => {
  const { value, dtype } = tensor;

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
        Tensor ({dtype})
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

export default React.memo(TensorView);
