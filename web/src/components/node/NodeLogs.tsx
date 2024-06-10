/** @jsxImportSource @emotion/react */
import { memo, useRef, useEffect } from "react";
import { Typography } from "@mui/material";
import useLogsStore, { hashKey } from "../../stores/LogStore";

type NodeLogsProps = {
  id: string;
  workflowId: string;
};

export const NodeLogs = memo(function NodeLogs({ id, workflowId }: NodeLogsProps) {
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
        <div className="node-logs" style={{ margin: "10px" }}>
          <Typography variant="h6" component="h6">
            Logs
          </Typography>
          <div
            ref={logsRef}
            style={{
              fontFamily: "monospaced",
              fontSize: "8px",
              width: "120px",
              height: "80px",
              overflow: "auto",
              backgroundColor: "#000"
            }}
          >
            <pre>{logs}</pre>
          </div>
        </div>
      )}
    </>
  );
});
