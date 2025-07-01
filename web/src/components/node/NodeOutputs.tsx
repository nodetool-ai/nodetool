/** @jsxImportSource @emotion/react */
import { memo } from "react";
import NodeOutput from "./NodeOutput";
import { Property } from "../../stores/ApiTypes";
import { Typography } from "@mui/material";

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
          {outputs.map((output) => (
            <li key={output.name}>
              <Typography>{output.name}</Typography>
              <NodeOutput
                id={id}
                output={{
                  type: output.type,
                  name: output.name,
                  stream: false
                }}
              />
            </li>
          ))}
        </ul>
      ) : (
        outputs.map((output) => (
          <NodeOutput
            id={id}
            key={output.name}
            output={{
              type: output.type,
              name: output.name,
              stream: false
            }}
          />
        ))
      )}
    </>
  );
};

export default memo(NodeOutputs, isEqual);
