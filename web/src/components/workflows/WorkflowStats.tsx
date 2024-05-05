/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import useWorkflowRunner from "../../stores/WorkflowRunner";
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

const statStyles = (theme: any) =>
  css({
    "&": {
      backgroundColor: "#222",
      padding: "2em",
      borderRadius: "1em",
      position: "fixed",
      width: "50vw",
      minWidth: "600px",
      maxWidth: "800px",
      height: "85vh",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      overflowY: "auto",
      border: `2px solid ${theme.palette.c_gray3}`
    }
  });

const WorkflowStats: React.FC = () => {
  const { logs, status, progress, state } = useWorkflowRunner();

  return (
    <div css={statStyles}>
      <Typography variant="h6">Workflow Stats</Typography>

      {Object.keys(status).map((nodeId) => (
        <Accordion key={nodeId}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>{`Node ${nodeId}: ${status[nodeId]}`}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography>{`State: ${state}`}</Typography>
            <Typography>{`Progress: ${
              progress[nodeId]?.progress || 0
            }%`}</Typography>
            {logs[nodeId] && <Typography>{`Logs: ${logs[nodeId]}`}</Typography>}
          </AccordionDetails>
        </Accordion>
      ))}
    </div>
  );
};

export default WorkflowStats;
