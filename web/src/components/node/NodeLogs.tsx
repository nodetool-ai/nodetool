/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useRef, useEffect } from "react";
import { Typography } from "@mui/material";
import useLogsStore, { hashKey } from "../../stores/LogStore";

type NodeLogsProps = {
  id: string;
  workflowId: string;
};

const styles = (theme: any) =>
  css({
    padding: "0 1em",
    margin: 0,
    h6: {
      margin: 0,
      padding: 0
    },
    ".logs": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      width: "100%",
      maxWidth: "100px",
      height: "80px",
      padding: "0.5em",
      overflow: "auto",
      userSelect: "text",
      backgroundColor: theme.palette.c_black
    }
  });

export const NodeLogs = memo(function NodeLogs({
  id,
  workflowId
}: NodeLogsProps) {
  const logsRef = useRef<HTMLDivElement>(null);
  const key = hashKey(workflowId, id);
  const logs = useLogsStore((state) => state.logs[key]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <>
      {logs?.length > 0 && (
        <div className="node-logs" css={styles}>
          <Typography variant="h6" component="h6">
            Logs
          </Typography>
          <div className="logs" ref={logsRef}>
            <pre>{logs}</pre>
          </div>
        </div>
      )}
    </>
  );
});
