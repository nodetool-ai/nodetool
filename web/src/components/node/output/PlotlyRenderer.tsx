/** @jsxImportSource @emotion/react */
import React, { Suspense, lazy, memo } from "react";
import { LoadingSpinner, FlexRow, BORDER_RADIUS } from "../../ui_primitives";
import type { PlotlyConfig } from "../../../stores/ApiTypes";
import type { Data, Layout, Config, Frame } from "plotly.js";

const PlotlyPlot = lazy(() => 
  import("react-plotly.js").then(module => ({ default: module.default }))
);

const FULL_SIZE_STYLE: React.CSSProperties = { width: "100%", height: "100%" };

interface PlotlyRendererProps {
  config: PlotlyConfig;
}

const PlotlyRenderer: React.FC<PlotlyRendererProps> = ({ config }) => {
  if (!config.config) {
    return <div>Invalid Plotly config</div>;
  }
  return (
    <div className="render-content" style={FULL_SIZE_STYLE}>
      <Suspense fallback={
        <FlexRow
          fullWidth
          fullHeight
          align="center"
          justify="center"
          sx={{
            bgcolor: "action.hover",
            borderRadius: BORDER_RADIUS.xs
          }}
        >
          <LoadingSpinner size="small" />
        </FlexRow>
      }>
        <PlotlyPlot
          data={config.config.data as Data[]}
          layout={config.config.layout as Partial<Layout>}
          config={config.config.config as Partial<Config>}
          frames={config.config.frames as Frame[]}
          style={FULL_SIZE_STYLE}
        />
      </Suspense>
    </div>
  );
};

export default memo(PlotlyRenderer);
