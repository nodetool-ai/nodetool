/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import Plot from "react-plotly.js";
import type { PlotlyConfig } from "../../../stores/ApiTypes";

interface PlotlyRendererProps {
  config: PlotlyConfig;
}

const PlotlyRenderer: React.FC<PlotlyRendererProps> = ({ config }) => {
  return (
    <div
      className="render-content"
      style={{ width: "100%", height: "100%" }}
    >
      <Plot
        data={config.config.data as Plotly.Data[]}
        layout={config.config.layout as Partial<Plotly.Layout>}
        config={config.config.config as Partial<Plotly.Config>}
        frames={config.config.frames as Plotly.Frame[] | undefined}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
};

export default memo(PlotlyRenderer);
