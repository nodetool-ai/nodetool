/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useRef, useEffect } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Typography
} from "@mui/material";
import useLogsStore from "../../stores/LogStore";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { isEqual } from "lodash";

type NodeLogsProps = {
  id: string;
  workflowId: string;
};

const styles = (theme: Theme) =>
  css({
    padding: "0",
    borderRadius: 0,
    margin: 0,
    boxShadow: "none",
    position: "absolute",
    width: "100%",
    top: "calc(100% - 3em)",
    zIndex: 100,
    h6: {
      margin: 0,
      padding: ".2em .4em",
      color: theme.vars.palette.grey[100]
    },
    "MuiPaper-root": {
      boxShadow: "none",
      borderRadius: 0
    },
    ".Mui-expanded": {
      minHeight: "unset"
    },
    ".MuiButtonBase-root": {
      backgroundColor: theme.vars.palette.grey[600],
      height: "1.5em",
      minHeight: "unset",
      border: 0,
      margin: 0,
      padding: ".5em 0 .25em .5em"
    },
    ".MuiButtonBase-root svg": {
      fontSize: "1.5em"
    },
    ".MuiAccordionSummary-content": {
      padding: 0,
      margin: 0
    },
    ".css-7od18z-MuiButtonBase-root-MuiAccordionSummary-root.Mui-expanded": {
      minHeight: "unset"
    },
    ".logs": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      width: "100%",
      height: "80px",
      padding: "0.5em",
      overflow: "auto",
      userSelect: "text",
      backgroundColor: theme.vars.palette.grey[1000]
    }
  });

export const NodeLogs: React.FC<NodeLogsProps> = ({ id, workflowId }) => {
  const theme = useTheme();
  const logsRef = useRef<HTMLDivElement>(null);
  const logs = useLogsStore((state) => state.getLogs(workflowId, id));

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <>
      {logs?.length > 0 && (
        <div className="node-logs" css={styles(theme)}>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6" component="h6">
                Logs
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <div className="logs" ref={logsRef}>
                <pre>{logs}</pre>
              </div>
            </AccordionDetails>
          </Accordion>
        </div>
      )}
    </>
  );
};

export default memo(NodeLogs, isEqual);
