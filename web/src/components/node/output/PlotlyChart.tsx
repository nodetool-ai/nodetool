/** @jsxImportSource @emotion/react */
import React, { memo, Suspense } from "react";
import { PlotlyConfig } from "../../../stores/ApiTypes";

const Plot = React.lazy(() =>
  import("react-plotly.js").then((module) => ({
    default: module.default
  }))
);

interface PlotlyChartProps {
  config: PlotlyConfig;
}

const PlotlyChart: React.FC<PlotlyChartProps> = memo(({ config }) => {
  return (
    <div
      className="render-content"
      style={{ width: "100%", height: "100%" }}
    >
      <Suspense fallback={<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading chart...</div>}>
        <Plot
          data={config.config.data as any}
          layout={config.config.layout as any}
          config={config.config.config as any}
          frames={config.config.frames as any}
          style={{ width: "100%", height: "100%" }}
        />
      </Suspense>
    </div>
  );
});

PlotlyChart.displayName = "PlotlyChart";

export default PlotlyChart;
