import React from "react";
import { Box } from "@mui/material";

interface MiniAppBackgroundProps {
  children: React.ReactNode;
}

const MiniAppBackground: React.FC<MiniAppBackgroundProps> = ({ children }) => {
  return (
    <Box
      sx={{
        position: "relative",
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 20% 20%, rgba(74,118,255,0.08), transparent 30%), radial-gradient(circle at 80% 0%, rgba(255,158,64,0.08), transparent 25%), linear-gradient(180deg, #0d1117 0%, #0b0d11 100%)",
        color: "var(--palette-grey-0)"
      }}
    >
      {children}
    </Box>
  );
};

export default MiniAppBackground;
