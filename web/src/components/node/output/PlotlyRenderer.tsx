/** @jsxImportSource @emotion/react */
import React, { Suspense, lazy, memo } from "react";
import { Box, CircularProgress } from "@mui/material";
import type { PlotlyConfig } from "../../../stores/ApiTypes";
import type { Data, Layout, Config, Frame } from "plotly.js";

const PlotlyPlot = lazy(() => 
  import("react-plotly.js").then(module => ({ default: module.default }))
);

interface PlotlyRendererProps {
  config: PlotlyConfig;
}

const PlotlyRenderer: React.FC<PlotlyRendererProps> = ({ config }) => {
  return (
    <div className="render-content" style={{ width: "100%", height: "100%" }}>
      <Suspense fallback={
        <Box sx={{ 
          width: "100%", 
          height: "100%", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center",
          bgcolor: "action.hover",
          borderRadius: 1
        }}>
          <CircularProgress size={24} />
        </Box>
      }>
        <PlotlyPlot
          data={config.config.data as Data[]}
          layout={config.config.layout as Partial<Layout>}
          config={config.config.config as Partial<Config>}
          frames={config.config.frames as Frame[]}
          style={{ width: "100%", height: "100%" }}
        />
      </Suspense>
    </div>
  );
};

export default memo(PlotlyRenderer);
