import * as React from "react";
import { Box, Text } from "nodetool";

export const Surface = () => (
  <Box
    sx={{
      p: 2,
      borderRadius: 1,
      bgcolor: "background.paper",
      border: "1px solid",
      borderColor: "divider"
    }}
  >
    <Text size="small">A padded surface built with the Box layout primitive.</Text>
  </Box>
);

export const FlexLayout = () => (
  <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
    <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: "success.main" }} />
    <Text size="small">Worker connected</Text>
  </Box>
);

export const Grid = () => (
  <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1 }}>
    {["Inputs", "Models", "Outputs", "Assets", "Logs", "Jobs"].map((label) => (
      <Box
        key={label}
        sx={{
          p: 1.5,
          textAlign: "center",
          borderRadius: 1,
          bgcolor: "action.hover"
        }}
      >
        <Text size="smaller">{label}</Text>
      </Box>
    ))}
  </Box>
);
