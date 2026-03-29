import * as React from "react";

// Mock SVG React component
const SvgMock: React.FC<React.SVGProps<SVGSVGElement>> = (props) =>
  React.createElement("svg", props);

export default SvgMock;
