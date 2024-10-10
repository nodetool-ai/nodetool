/** @jsxImportSource @emotion/react */
import { memo } from "react";
import NodeOutput from "./NodeOutput";
import { Property } from "../../stores/ApiTypes";
import { Typography } from "@mui/material";
import ThemeNodes from "../themes/ThemeNodes";
import { isEqual } from "lodash";

export interface NodeOutputsProps {
  id: string;
  outputs: Property[];
}

export const NodeOutputs: React.FC<NodeOutputsProps> = ({ id, outputs }) => {
  return (
    <>
      {outputs.length > 1 ? (
        <ul className="multi-outputs">
          <Typography
            style={{
              fontSize: ThemeNodes.fontSizeTinyer,
              position: "absolute",
              top: ".5em",
              right: "1.4em",
              color: ThemeNodes.palette.c_gray3,
              textTransform: "uppercase",
              margin: 0,
              padding: 0
            }}
            variant="h6"
          >
            Outputs
          </Typography>
          {outputs.map((output) => (
            <li key={output.name}>
              <Typography>{output.name}</Typography>
              <NodeOutput id={id} output={output} />
            </li>
          ))}
        </ul>
      ) : (
        outputs.map((output) => (
          <NodeOutput id={id} key={output.name} output={output} />
        ))
      )}
    </>
  );
};

export default memo(NodeOutputs, isEqual);
