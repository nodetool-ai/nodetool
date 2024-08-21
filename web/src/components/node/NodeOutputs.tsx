/** @jsxImportSource @emotion/react */
import { memo } from "react";
import NodeOutput from "./NodeOutput";
import { Property } from "../../stores/ApiTypes";
import { Typography } from "@mui/material";

export const NodeOutputs = memo(
  function NodeOutputs({ id, outputs }: { id: string; outputs: Property[]; }) {
    return (
      <>
        {outputs.length > 1 ? (
          <ul className="multi-outputs">
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
  }
);
