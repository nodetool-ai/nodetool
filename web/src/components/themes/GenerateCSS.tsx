import { DATA_TYPES } from "../../config/data_types";
import { SerializedStyles, css } from "@emotion/react";
import { darkenHexColor } from "../../utils/ColorUtils";

export const generateCSS = (() => {
  let result: SerializedStyles | null = null;

  return (_theme: any) => {
    if (result) {
      return result;
    }

    let s =
      ".react-flow__edge.selected .react-flow__edge-path, .react-flow__edge:focus .react-flow__edge-path, .react-flow__edge:focus-visible .react-flow__edge-path { stroke: #fff; }";

    for (const key in DATA_TYPES) {
      const dataType = DATA_TYPES[key];
      const { color, textColor, slug } = dataType;
      const borderColor = darkenHexColor(color, 70);
      s += `
        .node-menu ul li.${slug} {border-left: 4px solid  ${color};}
        .react-flow g.custom-connection-line path.${slug} {
          stroke-width: 2;
          stroke: ${color};
        }
          stroke: ${color};
        .react-flow g.custom-connection-line rect.${slug} {
          stroke-width: 2;
          fill: ${color};
        }
        .react-flow .react-flow__edge.${slug} .react-flow__edge-path {
          stroke-width: 2; 
        }
        .react-flow .react-flow__edge.${slug} .react-flow__edge-textwrapper .react-flow__edge-textbg {
          fill: ${color}; 
        }
        .react-flow__edge.${slug} .react-flow__edge-textwrapper .react-flow__edge-text {
          stroke-width: 2;
          fill: ${textColor};
        }
        .react-flow__handle-left.${slug},
        .react-flow__handle-right.${slug} {
          background-color: ${color};
          border-color: ${borderColor};
        }
      `;
    }

    result = css(s);
    return result;
  };
})();
