import React from "react";

const EdgeGradientDefinitions: React.FC = () => {
  return (
    <svg style={{ height: 0, width: 0, position: "absolute" }}>
      <defs>
        <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop
            offset="0%"
            style={{ stopColor: "rgb(128,0,128)", stopOpacity: 1 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: "rgb(255,192,203)", stopOpacity: 1 }}
          />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default EdgeGradientDefinitions;
