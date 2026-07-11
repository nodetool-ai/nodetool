import React, { useEffect, useRef } from "react";
import * as Plotly from "plotly.js";
import type { Data, Layout, Config, Frame } from "plotly.js";

interface PlotlyChartProps {
  data: Data[];
  layout?: Partial<Layout>;
  config?: Partial<Config>;
  frames?: Frame[];
  style?: React.CSSProperties;
}

/**
 * Thin effect wrapper around `Plotly.react` — replaces the unmaintained
 * `react-plotly.js` package. This module imports `plotly.js` statically and is
 * itself only ever loaded via `React.lazy` (see PlotlyRenderer), so Plotly
 * stays out of the main bundle (`vendor-plotly` chunk in vite.config.ts).
 */
const PlotlyChart: React.FC<PlotlyChartProps> = ({
  data,
  layout,
  config,
  frames,
  style
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Frames we registered on the last render. `Plotly.react` never clears
  // frames, so we drop these before adding the next set — otherwise every
  // update would append, and animations would replay stale keyframes.
  const registeredFrameCount = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    let cancelled = false;
    void Plotly.react(el, data, layout ?? {}, config).then(async () => {
      if (cancelled) {
        return;
      }
      if (registeredFrameCount.current > 0) {
        await Plotly.deleteFrames(
          el,
          Array.from(
            { length: registeredFrameCount.current },
            (_, index) => index
          )
        );
        registeredFrameCount.current = 0;
        if (cancelled) {
          return;
        }
      }
      if (frames && frames.length > 0) {
        await Plotly.addFrames(el, frames);
        registeredFrameCount.current = frames.length;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [data, layout, config, frames]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(() => {
      void Plotly.Plots.resize(el);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      Plotly.purge(el);
    };
  }, []);

  return <div ref={containerRef} style={style} />;
};

export default PlotlyChart;
